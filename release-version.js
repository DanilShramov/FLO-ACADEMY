// FLO Academy release 1.0066
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0066';

  window.FLO_ACADEMY_VERSION=VERSION;
  window.FLO_TESTS_VERSION=VERSION;
  window.FLO_RESULTS_FILTER_VERSION=VERSION;
  window.FLO_LEARNING_UI_VERSION=VERSION;

  let scheduled=false;

  const apply=()=>{
    scheduled=false;
    const value='Версия '+VERSION;

    document.querySelectorAll('[data-app-version]').forEach(el=>{
      if(el.textContent!==value)el.textContent=value;
    });

    window.FLO_ACADEMY_VERSION=VERSION;
    window.FLO_TESTS_VERSION=VERSION;
    window.FLO_RESULTS_FILTER_VERSION=VERSION;
    window.FLO_LEARNING_UI_VERSION=VERSION;
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
