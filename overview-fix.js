// FLO Academy release 1.0063
(()=>{
  const VERSION='1.0063';
  window.FLO_OVERVIEW_FIX_VERSION=VERSION;

  let questionCount=0;
  const previousFetch=window.fetch.bind(window);

  function isCatalogRequest(input){
    try{
      const url=new URL(typeof input==='string'?input:(input?.url||''),window.location.href);
      return url.pathname.endsWith('/api/tests') && url.searchParams.get('action')==='catalog';
    }catch{
      return false;
    }
  }

  window.fetch=async function(input,init={}){
    const response=await previousFetch(input,init);

    if(isCatalogRequest(input)){
      try{
        const data=await response.clone().json();
        questionCount=Number(data.questionCount)||questionCount;
        scheduleEnforce();
      }catch{}
    }

    return response;
  };

  function currentDisplayedCount(content){
    const values=[...content.querySelectorAll('.testStats b')]
      .map(el=>Number(String(el.textContent||'').replace(/\D/g,'')))
      .filter(Number.isFinite)
      .filter(n=>n>0);
    return values[0]||0;
  }

  function enforceOverview(){
    const overviewTab=document.querySelector('[data-test-page="overview"]');
    if(!overviewTab?.classList.contains('isSelected'))return;

    const content=document.getElementById('testsContent');
    if(!content)return;

    const existing=content.querySelector('#floStableOverview');
    const count=questionCount||currentDisplayedCount(content)||'—';

    if(existing){
      const value=existing.querySelector('b');
      if(value && value.textContent!==String(count))value.textContent=String(count);
      return;
    }

    content.innerHTML=
      `<div id="floStableOverview" class="testStats" style="grid-template-columns:1fr">`+
        `<div><b>${count}</b><span>вопросов в банке</span></div>`+
      `</div>`;
  }

  let scheduled=false;
  function scheduleEnforce(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      enforceOverview();
    });
  }

  function hookOverviewTab(){
    const tab=document.querySelector('[data-test-page="overview"]');
    if(!tab || tab.dataset.floStableOverviewHook==='1')return;
    tab.dataset.floStableOverviewHook='1';
    tab.addEventListener('click',()=>{
      setTimeout(enforceOverview,0);
      setTimeout(enforceOverview,60);
      setTimeout(enforceOverview,180);
    },true);
  }

  function boot(){
    hookOverviewTab();
    enforceOverview();

    const observer=new MutationObserver(()=>{
      hookOverviewTab();
      scheduleEnforce();
    });

    observer.observe(document.body,{subtree:true,childList:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
