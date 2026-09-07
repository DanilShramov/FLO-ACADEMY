// FLO Academy release 1.0062
(()=>{
  const RELEASE_VERSION='1.0062';
  window.FLO_RESULTS_FILTER_VERSION=RELEASE_VERSION;

  const previousFetch=window.fetch.bind(window);

  function isManagerResultsHistory(url){
    try{
      const u=new URL(typeof url==='string'?url:url?.url||'', window.location.href);
      return u.pathname.endsWith('/api/tests')
        && u.searchParams.get('action')==='history'
        && u.searchParams.get('all')==='1';
    }catch{
      return false;
    }
  }

  function isAttestation(item){
    return item?.mode==='attestation'
      || String(item?.testTitle||'').trim().toLowerCase()==='аттестация';
  }

  function buildInput(originalInput, url){
    if(typeof originalInput==='string')return url.pathname+url.search;
    try{return new Request(url.toString(), originalInput)}catch{return url.pathname+url.search}
  }

  window.fetch=async function(input,init={}){
    if(!isManagerResultsHistory(input)){
      return previousFetch(input,init);
    }

    const base=new URL(typeof input==='string'?input:input.url, window.location.href);
    let cursor=base.searchParams.get('cursor')||'';
    let collected=[];
    let finalCursor=null;
    let serverNow=Date.now();
    let loops=0;

    while(loops<40){
      loops++;
      const u=new URL(base.toString());
      if(cursor)u.searchParams.set('cursor',cursor);
      else u.searchParams.delete('cursor');

      const response=await previousFetch(buildInput(input,u),init);
      if(!response.ok)return response;

      let data;
      try{data=await response.json()}catch{return response}

      serverNow=data.serverNow||serverNow;
      collected.push(...(Array.isArray(data.items)?data.items.filter(isAttestation):[]));
      finalCursor=data.nextCursor||null;

      if(!finalCursor || collected.length>=25)break;
      cursor=finalCursor;
    }

    return new Response(JSON.stringify({
      items: collected,
      nextCursor: finalCursor,
      serverNow
    }),{
      status:200,
      headers:{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'X-FLO-Version':RELEASE_VERSION
      }
    });
  };

  function updateResultsView(){
    const tab=document.querySelector('[data-test-page="results"]');
    if(!tab?.classList.contains('isSelected'))return;

    const content=document.getElementById('testsContent');
    if(!content)return;

    const sub=content.querySelector('.sub');
    if(sub && sub.textContent!=='Только результаты аттестации · сначала новые'){
      sub.textContent='Только результаты аттестации · сначала новые';
    }

    // Дополнительная защита на уровне интерфейса:
    // если в DOM каким-то образом попал обычный тест, он не отображается.
    content.querySelectorAll('.historyRow').forEach(row=>{
      const title=row.querySelector('b')?.textContent?.trim().toLowerCase()||'';
      if(title && title!=='аттестация')row.remove();
    });
  }

  let scheduled=false;
  const scheduleUpdate=()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      updateResultsView();
    });
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      updateResultsView();
      new MutationObserver(scheduleUpdate).observe(document.body,{subtree:true,childList:true});
    },{once:true});
  }else{
    updateResultsView();
    new MutationObserver(scheduleUpdate).observe(document.body,{subtree:true,childList:true});
  }
})();
