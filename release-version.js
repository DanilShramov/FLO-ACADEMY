// FLO Academy release 1.0064
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0064';

  window.FLO_ACADEMY_VERSION=VERSION;
  window.FLO_TESTS_VERSION=VERSION;
  window.FLO_RESULTS_FILTER_VERSION=VERSION;

  let scheduled=false;

  const apply=()=>{
    scheduled=false;

    document.querySelectorAll('[data-app-version]').forEach(el=>{
      const value='Версия '+VERSION;
      if(el.textContent!==value)el.textContent=value;
    });

    // Синхронизируем все JS-модули с одной версией сборки.
    window.FLO_ACADEMY_VERSION=VERSION;
    window.FLO_TESTS_VERSION=VERSION;
    window.FLO_RESULTS_FILTER_VERSION=VERSION;
  };

  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',apply,{once:true});
  }else{
    apply();
  }

  window.addEventListener('load',apply,{once:true});
  document.addEventListener('click',()=>setTimeout(apply,0),true);

  const observer=new MutationObserver(schedule);
  const startObserver=()=>{
    if(document.body)observer.observe(document.body,{subtree:true,childList:true});
  };

  if(document.body)startObserver();
  else document.addEventListener('DOMContentLoaded',startObserver,{once:true});
})();
