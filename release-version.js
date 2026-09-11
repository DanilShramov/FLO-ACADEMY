// FLO Academy release 1.0077
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0077';
  window.FLO_ACADEMY_VERSION=VERSION;
  window.FLO_TESTS_VERSION=VERSION;
  window.FLO_RESULTS_FILTER_VERSION=VERSION;
  window.FLO_LEARNING_UI_VERSION=VERSION;
  window.FLO_TIPS_VERSION=VERSION;
  window.FLO_INVENTORY_VERSION=VERSION;
  window.FLO_EMPLOYEE_TEAM_VERSION=VERSION;

  let scheduled=false;
  const apply=()=>{
    scheduled=false;
    const value='Версия '+VERSION;
    document.querySelectorAll('[data-app-version]').forEach(el=>{if(el.textContent!==value)el.textContent=value});
    window.FLO_ACADEMY_VERSION=VERSION;
    window.FLO_TESTS_VERSION=VERSION;
    window.FLO_RESULTS_FILTER_VERSION=VERSION;
    window.FLO_LEARNING_UI_VERSION=VERSION;
    window.FLO_TIPS_VERSION=VERSION;
    window.FLO_INVENTORY_VERSION=VERSION;
  window.FLO_EMPLOYEE_TEAM_VERSION=VERSION;
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();

  window.addEventListener('load',apply,{once:true});
  window.addEventListener('pageshow',apply);

})();
