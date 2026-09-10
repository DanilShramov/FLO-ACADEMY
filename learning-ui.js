// FLO Academy release 1.0071
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0071';
  window.FLO_LEARNING_UI_VERSION=VERSION;

  const $=id=>document.getElementById(id);
  const featurePromises=new Map();
  let inventoryAllowed=false;
  let inventoryChecked=false;

  const featureInfo={
    tips:{global:'FLO_TIPS',src:`/tips.js?v=${encodeURIComponent(VERSION)}`},
    inventory:{global:'FLO_INVENTORY',src:`/inventory.js?v=${encodeURIComponent(VERSION)}`}
  };

  function loadFeature(name){
    const info=featureInfo[name];
    if(!info)return Promise.reject(new Error('Модуль не найден.'));
    if(window[info.global])return Promise.resolve(window[info.global]);
    if(featurePromises.has(name))return featurePromises.get(name);

    const promise=new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[data-flo-feature="${name}"]`);
      const script=existing||document.createElement('script');

      const done=()=>{
        const api=window[info.global];
        if(api)resolve(api);
        else reject(new Error('Модуль загрузился, но не запустился.'));
      };

      if(existing){
        if(window[info.global])resolve(window[info.global]);
        else{
          existing.addEventListener('load',done,{once:true});
          existing.addEventListener('error',()=>reject(new Error('Не удалось загрузить раздел.')),{once:true});
        }
        return;
      }

      script.src=info.src;
      script.async=true;
      script.dataset.floFeature=name;
      script.addEventListener('load',done,{once:true});
      script.addEventListener('error',()=>reject(new Error('Не удалось загрузить раздел.')),{once:true});
      document.head.appendChild(script);
    }).catch(err=>{
      featurePromises.delete(name);
      throw err;
    });

    featurePromises.set(name,promise);
    return promise;
  }

  async function openFeature(name){
    try{
      const api=await loadFeature(name);
      if(!api?.open)throw new Error('Раздел временно недоступен.');
      await api.open();
    }catch(err){
      alert((name==='tips'?'Чаевые':'Инвентаризация')+': '+(err?.message||'не удалось открыть раздел'));
    }
  }

  function runStaffAction(action,direct=false){
    const b=document.createElement('button');
    b.type='button';
    b.hidden=true;
    b.dataset.act=action;
    if(direct)b.dataset.learningDirect='1';
    document.body.appendChild(b);
    b.click();
    setTimeout(()=>b.remove(),0);
  }

  function tileMarkup(eyebrow,title,description){
    return `<span class="tileEyebrow">${eyebrow}</span><b>${title}</b><span>${description} <span aria-hidden="true">↗</span></span>`;
  }

  function setMarkup(el,signature,html){
    if(!el)return;
    if(el.dataset.floSignature===signature)return;
    el.dataset.floSignature=signature;
    el.innerHTML=html;
  }

  function ensureStyles(){
    if($('floLearningHubStyles'))return;
    const style=document.createElement('style');
    style.id='floLearningHubStyles';
    style.textContent=`
      #floLearningHub .floLearningGrid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
      #floLearningHub .floLearningCard{
        min-height:150px;
        border:1px solid var(--staff-line,#dce4de);
        border-radius:16px;
        background:#fff;
        color:var(--staff-ink,#233a35);
        padding:20px;
        text-align:left;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        gap:14px;
      }
      #floLearningHub .floLearningCard b{font-size:21px}
      #floLearningHub .floLearningCard span{color:var(--staff-muted,#65746e);font-size:14px}
      #staffFastHome{position:relative}
      #staffFastHome .staffHero{margin-top:0}
      #employeeChecksTile,#employeeTipsTile,#employeeManageLearningTile,#employeeInventoryTile,
      #adminChecksTile,#adminTipsTile,#adminInventoryTile,#staffManage{
        background:#e9eddf;
        border-color:#d5ddc9;
        color:#304534;
      }
      #employeeTipsTile,#adminTipsTile{
        background:#f0ece2;
        border-color:#e1d8c6;
        color:#544936;
      }
      #employeeInventoryTile,#adminInventoryTile{
        background:#e8eef1;
        border-color:#d3e0e4;
        color:#345566;
      }
      @media(max-width:700px){
        #floLearningHub .floLearningGrid{grid-template-columns:1fr}
        #floLearningHub .floLearningCard{min-height:120px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHub(){
    let d=$('floLearningHub');
    if(d)return d;

    d=document.createElement('dialog');
    d.id='floLearningHub';
    d.className='staffPanel';
    d.innerHTML=`
      <header>
        <h2>Обучение</h2>
        <div class="staffActions">
          <button type="button" class="secondary" data-hub-close>На главную</button>
        </div>
      </header>
      <main>
        <div class="floLearningGrid">
          <button type="button" class="floLearningCard" data-hub-action="learning">
            <b>Маршруты и задачи</b>
            <span>Назначенные материалы, прогресс и обязательные шаги →</span>
          </button>
          <button type="button" class="floLearningCard" data-hub-action="tests">
            <b>Тесты</b>
            <span>Тренировочные тесты и аттестация →</span>
          </button>
          <button type="button" class="floLearningCard" data-hub-action="events">
            <b>История ознакомлений</b>
            <span>Когда и с какими материалами вы ознакомились →</span>
          </button>
        </div>
      </main>
    `;

    d.querySelector('[data-hub-close]').onclick=()=>d.close();
    d.querySelectorAll('[data-hub-action]').forEach(b=>{
      b.onclick=()=>{
        const action=b.dataset.hubAction;
        d.close();
        if(action==='learning')runStaffAction('learning',true);
        else runStaffAction(action);
      };
    });

    document.body.appendChild(d);
    return d;
  }

  function openHub(){
    ensureStyles();
    const d=ensureHub();
    if(!d.open)d.showModal();
  }

  function renameLearningTiles(){
    const employee=$('employeeTestsTile');
    setMarkup(
      employee,
      'employee-learning',
      tileMarkup('Развитие','Обучение','Маршруты, тесты и ознакомления')
    );

    const admin=$('openTestsBtn');
    setMarkup(
      admin,
      'admin-learning',
      '<b>Обучение</b><span>Маршруты, тесты и ознакомления →</span>'
    );
  }

  function ensureEmployeeTile(id,eyebrow,title,description,action){
    const host=$('employeeHomePanel');
    if(!host)return null;

    let tile=$(id);
    if(!tile){
      tile=document.createElement('button');
      tile.id=id;
      tile.type='button';
      tile.className='homeTile';
      host.appendChild(tile);
    }

    setMarkup(tile,`${id}-${title}`,tileMarkup(eyebrow,title,description));
    tile.dataset.floAction=action;
    return tile;
  }

  function ensureAdminTile(id,title,description,action){
    const grid=$('adminView')?.querySelector('.grid');
    if(!grid)return null;

    let tile=$(id);
    if(!tile){
      tile=document.createElement('button');
      tile.id=id;
      tile.type='button';
      tile.className='tile tileButton';
      grid.appendChild(tile);
    }

    setMarkup(tile,`${id}-${title}`,`<b>${title}</b><span>${description} →</span>`);
    tile.dataset.floAction=action;
    return tile;
  }

  function manageTile(){
    const manage=$('staffManage');
    if(!manage)return;

    const adminVisible=$('adminView')&&!$('adminView').classList.contains('hidden');
    const employeeVisible=$('employeeView')&&!$('employeeView').classList.contains('hidden');

    if(adminVisible){
      const grid=$('adminView')?.querySelector('.grid');
      if(grid&&manage.parentElement!==grid)grid.appendChild(manage);
      if(manage.className!=='tile tileButton')manage.className='tile tileButton';
      setMarkup(
        manage,
        'admin-manage-learning',
        '<b>Управление обучением</b><span>Маршруты, ознакомления и настройки →</span>'
      );
      manage.style.margin='';
    }

    if(employeeVisible){
      const tile=ensureEmployeeTile(
        'employeeManageLearningTile',
        'Для управляющего',
        'Управление обучением',
        'Маршруты, ознакомления и настройки',
        'manage'
      );
      if(tile)tile.classList.remove('hidden');
    }
  }

  function cleanSmallHomeButtons(){
    const home=$('staffHome');
    if(!home)return;

    $('staffFastHome')?.remove();
    const shelf=home.querySelector('.staffShelf');
    if(!shelf)return;

    shelf.querySelectorAll('button').forEach(b=>{
      if(['learning','events','checks','manage'].includes(b.dataset.act))b.remove();
    });
  }

  function ensureFastHome(){
    if($('staffHome')||$('staffFastHome'))return;
    const host=$('employeeHomePanel');
    if(!host)return;

    const fast=document.createElement('div');
    fast.id='staffFastHome';
    fast.innerHTML=`
      <div class="staffHero">
        <span>ВАШЕ ОБУЧЕНИЕ</span>
        <h2>Обучение</h2>
        <p>Актуальный материал и ваш маршрут появятся здесь сразу после синхронизации.</p>
        <button type="button" class="secondary" data-fast-learning>Открыть обучение</button>
      </div>
    `;
    fast.querySelector('[data-fast-learning]').onclick=openHub;
    host.before(fast);
  }

  function buildMain(){
    ensureEmployeeTile(
      'employeeChecksTile','Рабочий день','Чек-листы',
      'Чек-листы смены и отметки выполнения','checks'
    );
    ensureEmployeeTile(
      'employeeTipsTile','Команда','Чаевые',
      'Расчёт и история распределений','tips'
    );

    const employeeInventory=ensureEmployeeTile(
      'employeeInventoryTile','Учёт','Инвентаризация',
      'Бой посуды и шестинедельная инвентаризация','inventory'
    );
    if(employeeInventory)employeeInventory.classList.toggle('hidden',!inventoryAllowed);

    ensureAdminTile(
      'adminChecksTile','Чек-листы',
      'Чек-листы смены и отметки выполнения','checks'
    );
    ensureAdminTile(
      'adminTipsTile','Чаевые',
      'Расчёт и история распределений','tips'
    );

    const adminInventory=ensureAdminTile(
      'adminInventoryTile','Инвентаризация',
      'Бой посуды и шестинедельная инвентаризация','inventory'
    );
    if(adminInventory)adminInventory.classList.toggle('hidden',!inventoryAllowed);

    manageTile();
  }

  async function checkInventoryPermission(){
    if(inventoryChecked)return inventoryAllowed;
    inventoryChecked=true;

    try{
      const api=await loadFeature('inventory');
      inventoryAllowed=!!(await api.canAccess?.());
    }catch{
      inventoryAllowed=false;
    }

    $('employeeInventoryTile')?.classList.toggle('hidden',!inventoryAllowed);
    $('adminInventoryTile')?.classList.toggle('hidden',!inventoryAllowed);
    return inventoryAllowed;
  }

  function normalize(){
    ensureStyles();
    renameLearningTiles();
    cleanSmallHomeButtons();
    if(!$('staffHome'))ensureFastHome();
    buildMain();
  }

  document.addEventListener('click',e=>{
    const learningTile=e.target.closest('#employeeTestsTile,#openTestsBtn');
    if(learningTile){
      e.preventDefault();
      e.stopImmediatePropagation();
      openHub();
      return;
    }

    const featureTile=e.target.closest('[data-flo-action]');
    if(featureTile){
      const action=featureTile.dataset.floAction;

      if(action==='tips'){
        e.preventDefault();
        e.stopImmediatePropagation();
        void openFeature('tips');
        return;
      }

      if(action==='inventory'){
        e.preventDefault();
        e.stopImmediatePropagation();
        void openFeature('inventory');
        return;
      }
    }

    const learning=e.target.closest('[data-act="learning"]');
    if(learning&&learning.dataset.learningDirect!=='1'){
      e.preventDefault();
      e.stopImmediatePropagation();
      openHub();
      return;
    }

    const back=e.target.closest('[data-act="panelBack"]');
    if(back){
      const title=$('staffTitle')?.textContent?.trim();
      if(title==='Моё обучение'||title==='История ознакомлений'){
        e.preventDefault();
        e.stopImmediatePropagation();
        $('staffDialog')?.close();
        openHub();
      }
    }
  },true);

  /*
    Главное изменение 1.0071:
    раньше MutationObserver запускал normalize() после каждого изменения DOM,
    а normalize() снова переписывал innerHTML плиток. Получался постоянный
    цикл перерисовки. Теперь стартовая отрисовка выполняется сразу, а
    дополнительные проверки ограничены несколькими моментами загрузки.
  */
  function boot(){
    normalize();

    [80,250,700,1500,3000,6000].forEach(ms=>{
      setTimeout(normalize,ms);
    });

    // Инвентаризация проверяет доступ отдельно и асинхронно, не тормозя остальные плитки.
    setTimeout(()=>void checkInventoryPermission(),350);

    window.addEventListener('pageshow',normalize);
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)normalize();
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
