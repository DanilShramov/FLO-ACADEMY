
(()=>{
  let mode='practice', reviewer=false, questionCount=0, attestationLaunching=false;
  const originalFetch=window.fetch.bind(window), originalConfirm=window.confirm.bind(window);
  const setMode=m=>{mode=m==='attestation'?'attestation':'practice';window.__floTestMode=mode};
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/api/tests')&&url.includes('action=start')&&init.body){
      try{const body=JSON.parse(init.body);body.mode=mode;init={...init,body:JSON.stringify(body)}}catch{}
    }
    const response=await originalFetch(input,init);
    if(url.includes('/api/tests')&&url.includes('action=catalog')){
      try{const data=await response.clone().json();reviewer=!!data.reviewer;questionCount=Number(data.questionCount)||0;setTimeout(enhance,0)}catch{}
    }
    return response;
  };
  window.confirm=function(message){
    const s=String(message||'');
    if(s.includes('10 минут на 10 вопросов')){
      return mode==='attestation'?originalConfirm('Начать аттестацию? 20 вопросов, 20 минут. Проходной результат — 85%.'):true;
    }
    if(s.includes('Ответы выбраны на')&&s.includes('из 10 вопросов'))return originalConfirm(s.replace('из 10 вопросов','из 20 вопросов'));
    return originalConfirm(message);
  };
  async function token(){const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js');return getAuth().currentUser?.getIdToken()}
  async function post(action,body){const t=await token();const r=await originalFetch('/api/tests?'+new URLSearchParams({action}),{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка');return d}
  function addAttestation(){
    const home=document.getElementById('employeeHomePanel'),tests=document.getElementById('employeeTestsTile'),hello=document.getElementById('employeeHello');
    if(!home||!tests||document.getElementById('employeeAttestationTile'))return;
    const btn=document.createElement('button');btn.id='employeeAttestationTile';btn.className='homeTile';btn.innerHTML='<span class="tileEyebrow">Контроль знаний</span><b>Аттестация</b><span>20 вопросов · 20 минут · 85% <span aria-hidden="true">↗</span></span>';
    btn.onclick=()=>{setMode('attestation');attestationLaunching=true;tests.click();setTimeout(()=>attestationLaunching=false,500)};
    home.appendChild(btn);
    tests.addEventListener('click',()=>{if(!attestationLaunching)setMode('practice')},true);
    if((hello?.textContent||'').includes('Управляющий'))btn.classList.add('hidden');
  }
  function roleTabs(){
    const overview=document.querySelector('[data-test-page="overview"]');if(overview)overview.classList.toggle('hidden',!reviewer);
    if(!reviewer){
      const view=document.getElementById('testsView');const active=overview?.classList.contains('isSelected');
      if(view&&!view.classList.contains('hidden')&&active){document.querySelector('[data-test-page="catalog"]')?.click()}
    }
  }
  function overview(){
    const b=document.querySelector('[data-test-page="overview"]');if(!reviewer||!b?.classList.contains('isSelected'))return;
    const c=document.getElementById('testsContent');if(!c||c.dataset.proOverview==='1')return;c.dataset.proOverview='1';
    c.innerHTML=`<div class="testStats" style="grid-template-columns:1fr"><div><b>${questionCount||'—'}</b><span>вопросов в банке</span></div></div>`;
  }
  function catalog(){
    const b=document.querySelector('[data-test-page="catalog"]');if(!b?.classList.contains('isSelected'))return;
    const c=document.getElementById('testsContent'),cards=c?.querySelector('.testCatalog');if(!c||!cards||c.querySelector('#randomTestStart'))return;
    cards.style.display='none';
    const h=c.querySelector('h2');if(h)h.textContent=mode==='attestation'?'Аттестация':'Случайный тест';
    [...c.querySelectorAll('p.sub,p.meta')].forEach(p=>p.style.display='none');
    const box=document.createElement('div');box.className='notice';box.innerHTML=mode==='attestation'?'<b>20 вопросов · 20 минут · проходной балл 85%</b><br>Вариант формируется случайно.':'<b>20 вопросов · без ограничения времени</b><br>Вариант формируется случайно; выбрать конкретный вариант нельзя.';
    const start=document.createElement('button');start.id='randomTestStart';start.className='primary';start.textContent=mode==='attestation'?'Начать аттестацию':'Начать случайный тест';
    start.onclick=()=>{const buttons=[...cards.querySelectorAll('.startTest:not(:disabled)')];if(!buttons.length){document.getElementById('catalogResume')?.click();return}buttons[Math.floor(Math.random()*buttons.length)].click()};
    cards.before(box,start);
  }
  function runner(){
    const overlay=document.getElementById('testRunner');if(!overlay||overlay.classList.contains('hidden'))return;
    const title=document.getElementById('runnerTitle')?.textContent||'',att=title.includes('Аттестация');
    const clock=overlay.querySelector('.runnerClock');if(clock)clock.style.display=att?'flex':'none';
    const label=document.getElementById('runnerLabel');if(label&&!label.textContent.includes('ЧЕРНОВИКА'))label.textContent=att?'АТТЕСТАЦИЯ':'ПРОХОЖДЕНИЕ';
    const state=document.getElementById('runnerSaveState');if(state&&!att&&state.textContent.includes('Таймер'))state.textContent='Ответы сохраняются после выбора.';
    const walker=document.createTreeWalker(overlay,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(n.nodeValue.includes('ИЗ 10'))n.nodeValue=n.nodeValue.replaceAll('ИЗ 10','ИЗ 20');if(n.nodeValue.includes(' / 10'))n.nodeValue=n.nodeValue.replaceAll(' / 10',' / 20')}
    const hero=overlay.querySelector('.resultHero');if(att&&hero&&!hero.querySelector('.attestationStatus')){const m=(hero.textContent||'').match(/(\d+)%/);if(m){const passed=Number(m[1])>=85,p=document.createElement('p');p.className='attestationStatus';p.innerHTML='<b>'+(passed?'СДАНО':'НЕ СДАНО')+'</b>';hero.appendChild(p)}}
  }
  function history(){
    document.querySelectorAll('.historyRow').forEach(row=>{
      const t=row.querySelector('.resultPill');if(!t)return;t.childNodes.forEach(n=>{if(n.nodeType===3)n.nodeValue=n.nodeValue.replace(' / 10',' / 20')});
      const title=row.querySelector('b')?.textContent||'';if(title.includes('Аттестация')&&!t.querySelector('.attStatus')){const m=(t.textContent||'').match(/(\d+)%/);if(m){const s=document.createElement('small');s.className='attStatus';s.textContent=Number(m[1])>=85?'Сдано':'Не сдано';t.appendChild(s)}}
    })
  }
  function review(){
    const tab=document.querySelector('[data-test-page="review"]');if(!reviewer||!tab?.classList.contains('isSelected'))return;
    const c=document.getElementById('testsContent'),bank=c?.querySelector('.reviewBank');if(!c||!bank||document.getElementById('customQuestionForm'))return;
    c.querySelectorAll('.notice').forEach(n=>{if(n.textContent.includes('Банк:'))n.textContent=`Банк: ${questionCount} вопросов. Проверьте формулировки и ключи.`});
    const form=document.createElement('form');form.id='customQuestionForm';form.innerHTML=`<div class="rule"></div><h2>Добавить свой вопрос</h2><select name="type"><option value="single">Один правильный ответ</option><option value="multi">Несколько правильных ответов</option></select><input name="topic" placeholder="Тема" value="Сервис"><textarea name="prompt" placeholder="Вопрос" required style="width:100%;min-height:90px;padding:14px;border:1px solid var(--line);border-radius:13px"></textarea><div id="customOptions"></div><textarea name="explanation" placeholder="Пояснение к правильному ответу" style="width:100%;min-height:70px;padding:14px;border:1px solid var(--line);border-radius:13px"></textarea><button class="primary" type="submit">Добавить вопрос</button><div id="customQuestionMsg"></div>`;
    const opts=form.querySelector('#customOptions');for(let i=0;i<4;i++){const l=document.createElement('label');l.className='checkItem';l.innerHTML=`<input type="checkbox" name="correct" value="${i}"><input name="option${i}" placeholder="Вариант ${i+1}" required style="margin:0">`;opts.appendChild(l)}
    form.onsubmit=async e=>{e.preventDefault();const msg=form.querySelector('#customQuestionMsg');msg.textContent='Сохраняем…';try{const data=new FormData(form),type=data.get('type'),correct=data.getAll('correct').map(Number),options=[0,1,2,3].map(i=>data.get('option'+i));if(type==='single'&&correct.length!==1)throw new Error('Для одиночного вопроса отметьте ровно один правильный вариант.');if(type==='multi'&&correct.length<2)throw new Error('Для вопроса с несколькими ответами отметьте минимум два правильных варианта.');await post('custom-add',{type,topic:data.get('topic'),prompt:data.get('prompt'),options,correct,explanation:data.get('explanation')});msg.textContent='Вопрос добавлен.';questionCount++;setTimeout(()=>tab.click(),350)}catch(err){msg.textContent=err.message}};
    bank.before(form);
  }
  function enhance(){addAttestation();roleTabs();overview();catalog();runner();history();review()}
  const observer=new MutationObserver(()=>enhance());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{addAttestation();observer.observe(document.body,{subtree:true,childList:true,characterData:true});enhance()});else{addAttestation();observer.observe(document.body,{subtree:true,childList:true,characterData:true});enhance()}
})();
