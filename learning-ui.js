// FLO Academy release 1.0066
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0066';
  window.FLO_LEARNING_UI_VERSION=VERSION;

  const $=id=>document.getElementById(id);

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
      #floLearningHub .floLearningCard b{
        font-size:21px;
      }
      #floLearningHub .floLearningCard span{
        color:var(--staff-muted,#65746e);
        font-size:14px;
      }
      #staffFastHome{
        position:relative;
      }
      #staffFastHome .staffHero{
        margin-top:0;
      }
      @media(max-width:700px){
        #floLearningHub .floLearningGrid{grid-template-columns:1fr}
        #floLearningHub .floLearningCard{min-height:120px}
      }
    `;
    document.head.appendChild(style);
  }

  function closeHub(){
    const d=$('floLearningHub');
    if(d?.open)d.close();
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

    d.querySelector('[data-hub-close]').onclick=closeHub;
    d.querySelectorAll('[data-hub-action]').forEach(b=>{
      b.onclick=()=>{
        const action=b.dataset.hubAction;
        closeHub();
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

  function renameLearningTile(){
    const tile=$('employeeTestsTile');
    if(!tile)return;

    const eyebrow=tile.querySelector('.tileEyebrow');
    const title=tile.querySelector('b');
    const tail=tile.querySelector('span:last-child');

    if(eyebrow && eyebrow.textContent!=='Обучение')eyebrow.textContent='Обучение';
    if(title && title.textContent!=='Обучение')title.textContent='Обучение';

    if(tail){
      const wanted='Маршруты, тесты и ознакомления ↗';
      if(tail.textContent.trim()!==wanted){
        tail.innerHTML='Маршруты, тесты и ознакомления <span aria-hidden="true">↗</span>';
      }
    }
  }

  function cleanHome(){
    const home=$('staffHome');

    if(home){
      $('staffFastHome')?.remove();

      const shelf=home.querySelector('.staffShelf');
      if(shelf){
        shelf.querySelectorAll('button').forEach(b=>{
          if(b.dataset.act==='learning' || b.dataset.act==='events')b.remove();
        });
      }
    }else{
      ensureFastHome();
    }

    const manage=$('staffManage');
    if(manage && manage.textContent!=='Управление обучением'){
      manage.textContent='Управление обучением';
    }
  }

  function ensureFastHome(){
    if($('staffHome') || $('staffFastHome'))return;

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

  document.addEventListener('click',e=>{
    const tile=e.target.closest('#employeeTestsTile');
    if(tile){
      e.preventDefault();
      e.stopImmediatePropagation();
      openHub();
      return;
    }

    const learning=e.target.closest('[data-act="learning"]');
    if(learning && learning.dataset.learningDirect!=='1'){
      e.preventDefault();
      e.stopImmediatePropagation();
      openHub();
      return;
    }

    const back=e.target.closest('[data-act="panelBack"]');
    if(back){
      const title=$('staffTitle')?.textContent?.trim();
      if(title==='Моё обучение' || title==='История ознакомлений'){
        e.preventDefault();
        e.stopImmediatePropagation();
        $('staffDialog')?.close();
        openHub();
      }
    }
  },true);

  let scheduled=false;
  function normalize(){
    scheduled=false;
    ensureStyles();
    renameLearningTile();
    cleanHome();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(normalize);
  }

  normalize();
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});
})();
