// FLO Academy release 1.0062
(()=>{
  const VERSION='1.0062';
  window.FLO_ACADEMY_VERSION=VERSION;

  const apply=()=>{
    document.querySelectorAll('[data-app-version]').forEach(el=>{
      el.textContent='Версия '+VERSION;
    });
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  }else{
    apply();
  }

  window.addEventListener('load', apply, {once:true});
  setTimeout(apply, 0);
})();
