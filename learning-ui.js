// FLO Academy 1.0072: explicit navigation, no DOM polling.
(()=>{
 const $=id=>document.getElementById(id),pending=new Map();
 let profile=null,routed=false;
 const version=window.__FLO_RELEASE_VERSION__||'1.0072';
 const names={team:'Команда',materials:'Материалы',learning:'Обучение',checks:'Чек-листы',tips:'Чаевые',inventory:'Инвентаризация',manage:'Управление обучением'};
 const specs=[['team','Люди FLO','Наши люди и общая работа'],['materials','База знаний','Обучение и стандарты'],['learning','Развитие','Маршруты, тесты и ознакомления'],['checks','Рабочий день','Чек-листы смены и история'],['tips','Команда','Расчёт и история распределений'],['inventory','Учёт','Бой посуды и инвентаризация'],['manage','Для управляющего','Маршруты, ознакомления и результаты']];
 function feature(name){
  const key=name==='tips'?'FLO_TIPS':'FLO_INVENTORY';
  if(window[key])return Promise.resolve(window[key]);
  if(pending.has(name))return pending.get(name);
  const p=new Promise((resolve,reject)=>{
   const s=document.createElement('script');let timer;
   const fail=()=>{clearTimeout(timer);s.remove();reject(Error('Не удалось загрузить раздел. Проверьте сеть и повторите.'))};
   s.src='/'+name+'.js?v='+version;s.async=true;s.onerror=fail;
   s.onload=()=>{clearTimeout(timer);window[key]?resolve(window[key]):fail()};
   timer=setTimeout(fail,20000);document.head.append(s);
  }).catch(e=>{pending.delete(name);throw e});pending.set(name,p);return p;
 }
 function closePages(){document.querySelectorAll('dialog.staffPanel[open]').forEach(d=>d.close())}
 function home(){closePages();history.replaceState(null,'',location.pathname);window.FLO_APP?.home()}
 function page(d){
  document.querySelectorAll('dialog.staffPanel[open]').forEach(x=>{if(x!==d)x.close()});
  d.classList.add('floFullPage');
  if(!d.open)d.showModal();
  if(!d.dataset.floNav){
   d.dataset.floNav='1';d.addEventListener('cancel',e=>{e.preventDefault();home()});
   const nav=d.querySelector('header .staffActions');
   if(nav&&!nav.querySelector('[data-act]')){
    nav.innerHTML='<button class="secondary" data-flo-back>Назад</button><button class="secondary" data-flo-home>На главную</button><button class="secondary" data-flo-logout>Выйти</button>';
    nav.querySelector('[data-flo-back]').onclick=home;nav.querySelector('[data-flo-home]').onclick=home;nav.querySelector('[data-flo-logout]').onclick=()=>window.FLO_APP.logout();
   }
  }
 }
 function hub(){
  let d=$('floLearningHub');if(!d){d=document.createElement('dialog');d.id='floLearningHub';d.className='staffPanel';d.innerHTML='<header><h2>Обучение</h2><div class="staffActions"></div></header><main><div class="homeGrid"><button class="homeTile" data-learning="learning"><span class="tileEyebrow">Ваш путь</span><b>Маршруты</b><span>Материалы и задачи обучения ↗</span></button><button class="homeTile materialsTile" data-learning="tests"><span class="tileEyebrow">Проверка знаний</span><b>Тесты</b><span>Тренировка, аттестация и моя история ↗</span></button><button class="homeTile" data-learning="events"><span class="tileEyebrow">История</span><b>Ознакомления</b><span>Подтверждённые стандарты ↗</span></button></div></main>';document.body.append(d);d.querySelectorAll('[data-learning]').forEach(b=>b.onclick=()=>{d.close();b.dataset.learning==='tests'?window.FLO_APP.tests():window.FLO_APP.staff(b.dataset.learning)})}page(d);
 }
 async function open(name){
  try{
   if(name==='learning'){hub();return}
   if(['tips','inventory'].includes(name)){await (await feature(name)).open();return}
   if(['checks','manage'].includes(name)){await window.FLO_APP.staff(name);return}
   if(name==='team')window.FLO_APP.team();
   if(name==='materials')window.FLO_APP.materials();
  }catch(e){alert(e.message)}
 }
 function render(){
  if(!profile)return;
  const manager=profile.admin||/менеджер/i.test(profile.position||'')||profile.position==='Управляющий';
  const reviewer=profile.admin||profile.position==='Управляющий';
  for(const host of [$('employeeHomePanel'),$('floAdminHome')]){
   if(!host)continue;
   host.innerHTML=specs.filter(([id])=>id!=='inventory'||manager).filter(([id])=>id!=='manage'||reviewer).map(([id,eyebrow,desc])=>'<a class="homeTile '+(id==='materials'?'materialsTile':'')+'" href="#flo='+id+'" target="_blank" rel="noopener"><span class="tileEyebrow">'+eyebrow+'</span><b>'+names[id]+'</b><span>'+desc+' <span aria-hidden="true">↗</span></span></a>').join('');
  }
  $('staffManage')?.classList.add('hidden');
  $('staffHome')?.querySelectorAll('.staffShelf [data-act]').forEach(b=>{if(b.dataset.act!=='saved')b.classList.add('hidden')});
  if(!routed){routed=true;const route=location.hash.match(/^#flo=(\w+)$/)?.[1];if(route&&names[route]&&(route!=='inventory'||manager)&&(route!=='manage'||reviewer))void open(route)}
 }
 window.FLO_NAV={page,home,open,reset(){profile=null;routed=false;closePages();window.FLO_TIPS?.reset();window.FLO_INVENTORY?.reset()},ready(p){profile=p;render()}};
 window.addEventListener('flo-staff-ready',render);
 window.addEventListener('hashchange',()=>{const route=location.hash.match(/^#flo=(\w+)$/)?.[1];if(profile&&names[route])void open(route)});
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act="learning"],[data-act="close"]');
  if(!b)return;e.preventDefault();e.stopImmediatePropagation();b.dataset.act==='close'?home():hub();
 },true);
})();
