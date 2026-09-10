// FLO Academy release 1.0063
(()=>{
  const VERSION='1.0063';

  window.FLO_ACADEMY_VERSION=VERSION;
  window.FLO_TESTS_VERSION=VERSION;
  window.FLO_RESULTS_FILTER_VERSION=VERSION;

  const apply=()=>{
    document.querySelectorAll('[data-app-version]').forEach(el=>{
      el.textContent='Версия '+VERSION;
    });
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',apply,{once:true});
  }else{
    apply();
  }

  window.addEventListener('load',apply,{once:true});
  setTimeout(apply,0);
})();
