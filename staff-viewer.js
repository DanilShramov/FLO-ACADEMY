export async function open({tab,material,metadata,uid,token,version,onOpen,onAck,onText,onClose,isAcknowledged}){
 const d=tab.document;let disposed=false,pdf=null,observer=null;const tasks=new Set();
 const name=material.name||material.fileName||'Материал';
 d.title=name;d.head.innerHTML='<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#18221e;color:#fff;font:16px/1.5 system-ui}header{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px;background:#f6f7f3;color:#213d31}header strong{flex:1;min-width:140px}button{min-height:44px;border:1px solid #b5c8bc;border-radius:9px;padding:8px 14px;background:#fff;color:#213d31;cursor:pointer;font:inherit}button:focus-visible{outline:3px solid #498d6e}button:disabled{opacity:.6}main{padding:12px;max-width:1100px;margin:auto}.page{position:relative;background:#e0e6df;margin:0 auto 16px;max-width:100%;color:#345;display:grid;place-items:center;overflow:hidden}.page canvas{max-width:100%;height:auto;display:block}.page span{position:absolute;top:8px;left:12px}img{display:block;max-width:100%;margin:auto}#status{padding:12px}#ack{background:#245640;color:#fff}small{display:block}#ackNote{padding:10px 18px;background:#263d32;font-size:13px}</style>';
 d.body.innerHTML='<header><button id="back">Назад</button><strong id="name"></strong><span id="pageLabel"></span><button id="ack" disabled>Ознакомлен с материалом</button></header><div id="ackNote">Подтверждение сохраняет дату и версию материала. Оно не заменяет проверку знаний.</div><div id="status" role="status">Загрузка…</div><main id="pages"></main>';
 d.getElementById('name').textContent=name;
 d.getElementById('back').onclick=()=>{tab.close();onClose()};
 const ack=d.getElementById('ack'),status=d.getElementById('status');
 ack.onclick=async()=>{ack.disabled=true;try{await onAck();ack.textContent='Ознакомление подтверждено ✓';status.textContent='Подтверждение сохранено.'}catch(e){status.textContent=e.message;ack.disabled=false}};
 const controller=new AbortController();const cleanup=()=>{disposed=true;controller.abort();observer?.disconnect();for(const t of tasks)t.cancel();pdf?.destroy();};tab.addEventListener('pagehide',cleanup,{once:true});
 const timer=setTimeout(()=>controller.abort(),30000);
 let blob;try{const response=await fetch('/api/material-file?id='+encodeURIComponent(material.id),{headers:{Authorization:'Bearer '+await token()},signal:controller.signal});if(!response.ok){let error;try{error=await response.json()}catch{}throw Error(error?.error||'Не удалось загрузить материал.')}blob=await response.blob()}finally{clearTimeout(timer)}
 if(disposed)return;
 const markOpened=async()=>{await onOpen();ack.disabled=isAcknowledged;ack.textContent=isAcknowledged?'Ознакомление подтверждено ✓':'Ознакомлен с материалом';status.textContent=''};
 if(blob.type.startsWith('image/')){
 const url=URL.createObjectURL(blob),img=d.createElement('img');img.alt=name;img.draggable=false;img.src=url;d.getElementById('pages').append(img);await img.decode();URL.revokeObjectURL(url);await markOpened();return;
 }
 if(!blob.type.includes('pdf'))throw Error('Этот формат пока не поддерживает просмотр внутри сайта. Попросите управляющего загрузить PDF.');
 await new Promise((resolve,reject)=>{const script=d.createElement('script');script.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Не удалось загрузить просмотрщик. Проверьте соединение.'));d.head.append(script)});
 tab.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
 pdf=await tab.pdfjsLib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
 const first=await pdf.getPage(1),vp=first.getViewport({scale:1}),width=Math.min(tab.innerWidth-24,1100),height=width*vp.height/vp.width;
 const key='flo.pdf.'+uid+'.'+material.id+'.'+version;let saved=1;try{saved=Number(tab.localStorage.getItem(key))||1}catch{}
 saved=Math.max(1,Math.min(pdf.numPages,saved));
 const slots=[],pending=new Set(),rendered=new Set();let working=false,current=saved;
 for(let n=1;n<=pdf.numPages;n++){const slot=d.createElement('section');slot.className='page';slot.dataset.page=n;slot.style.width=width+'px';slot.style.height=height+'px';slot.innerHTML='<span>Страница '+n+'</span>';d.getElementById('pages').append(slot);slots.push(slot)}
 async function render(n){
 const slot=slots[n-1];if(disposed||rendered.has(n))return;
 const page=await pdf.getPage(n),base=page.getViewport({scale:1}),scale=width/base.width*Math.min(tab.devicePixelRatio||1,1.5),viewport=page.getViewport({scale});
 const canvas=d.createElement('canvas');canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);canvas.style.width=width+'px';slot.style.height=width*base.height/base.width+'px';
 const task=page.render({canvasContext:canvas.getContext('2d'),viewport});tasks.add(task);try{await task.promise}finally{tasks.delete(task)}
 if(disposed)return;slot.replaceChildren(canvas);rendered.add(n);
 }
 async function drain(){if(working)return;working=true;try{while(pending.size&&!disposed){const n=[...pending].sort((a,b)=>Math.abs(a-current)-Math.abs(b-current))[0];pending.delete(n);await render(n)}}catch(e){if(!disposed){status.textContent='Ошибка страницы. Нажмите «Повторить страницу».';const retry=d.createElement('button');retry.textContent='Повторить страницу';retry.onclick=()=>{pending.add(current);status.textContent='';drain()};status.append(retry)}}finally{working=false}}
 observer=new tab.IntersectionObserver(entries=>{for(const entry of entries){const n=Number(entry.target.dataset.page);if(entry.isIntersecting){pending.add(n)}else if(Math.abs(n-current)>3&&rendered.has(n)){entry.target.innerHTML='<span>Страница '+n+'</span>';rendered.delete(n)}}drain()},{rootMargin:'500px 0px'});
 slots.forEach(s=>observer.observe(s));
 await render(saved);await markOpened();slots[saved-1].scrollIntoView();tab.scrollBy(0,-100);
 let scrollTimer;tab.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(disposed)return;let best=Infinity;for(let i=0;i<slots.length;i++){const distance=Math.abs(slots[i].getBoundingClientRect().top-100);if(distance<best){best=distance;current=i+1}}d.getElementById('pageLabel').textContent=current+' / '+pdf.numPages;try{tab.localStorage.setItem(key,String(current))}catch{}},120)});
 d.getElementById('pageLabel').textContent=saved+' / '+pdf.numPages;
 // Search extraction is offered as a draft to the manager; it is not auto-published.
 if(onText){let text='';for(let n=1;n<=pdf.numPages&&!disposed&&text.length<100000;n++){const p=await pdf.getPage(n);const content=await p.getTextContent();text+=content.items.map(i=>i.str||'').join(' ')+'\n';await new Promise(r=>setTimeout(r,0))}if(!disposed&&text.trim())onText(text.slice(0,100000))}
}

