// FLO Academy release 1.0069
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0069';
  window.FLO_TIPS_VERSION=VERSION;

  const state={loaded:false,loading:false,user:null,team:[],rules:null,history:[],scope:'own'};
  const $=id=>document.getElementById(id);

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const money=v=>new Intl.NumberFormat('ru-RU',{
    minimumFractionDigits:0,maximumFractionDigits:2
  }).format(Number(v||0))+' ₽';

  const num=v=>Number(v||0).toLocaleString('ru-RU',{
    minimumFractionDigits:0,maximumFractionDigits:3
  });

  const date=v=>{
    if(!v)return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
    });
  };

  async function token(){
    const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js');
    const user=getAuth().currentUser;
    if(!user)throw Error('Войдите в аккаунт.');
    return user.getIdToken();
  }

  async function api(action,body=null){
    const t=await token();
    const response=await fetch('/api/tips?'+new URLSearchParams({action}),{
      method:body?'POST':'GET',
      headers:{Authorization:'Bearer '+t,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    let data={};
    try{data=await response.json()}catch{}
    if(!response.ok)throw Error(data.error||'Не удалось выполнить действие.');
    return data;
  }

  function styles(){
    if($('floTipsStyles'))return;
    const style=document.createElement('style');
    style.id='floTipsStyles';
    style.textContent=`
      #floTipsDialog{width:min(1040px,96vw);max-height:92dvh}
      #floTipsDialog main{padding:22px 24px}
      .tipsTabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
      .tipsTabs .isSelected{background:#23483f;color:#fff}
      .tipsTotals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}
      .tipsTotals>div{background:#f4f6f2;border-radius:14px;padding:16px}
      .tipsTotals strong{display:block;font-size:25px}
      .tipsHistoryCard{border:1px solid #dce4de;border-radius:16px;padding:18px;margin:12px 0;background:#fff}
      .tipsHistoryHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
      .tipsHistoryHead h3{margin:0}
      .tipsHistoryMeta{color:#65746e;font-size:13px}
      .tipsDepartmentGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}
      .tipsDepartment{background:#f7f8f5;border-radius:12px;padding:12px}
      .tipsDepartment small{display:block;color:#65746e}
      .tipsPeople{display:grid;gap:7px;margin-top:12px}
      .tipsPerson{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;border-top:1px solid #edf0ec;padding-top:9px}
      .tipsPersonMeta{color:#65746e;font-size:12px}
      .tipsCalcGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .tipsWaiters{display:grid;gap:10px;margin:14px 0}
      .tipsWaiter{border:1px solid #dce4de;border-radius:14px;padding:14px;display:grid;grid-template-columns:minmax(180px,1.4fr) 1fr 1fr;gap:10px;align-items:end}
      .tipsWaiterHead{display:flex;align-items:flex-start;gap:9px}
      .tipsWaiterHead input{width:auto;margin:2px 0}
      .tipsExtras{display:flex;flex-wrap:wrap;gap:8px}
      .tipsExtras label{display:flex!important;align-items:center;gap:6px;margin:0!important}
      .tipsExtras input{width:auto!important;margin:0!important}
      .tipsResult{background:#f4f6f2;border-radius:16px;padding:18px;margin:16px 0}
      .tipsEmpty{padding:28px;border:1px dashed #b9c6bd;border-radius:16px;color:#65746e;text-align:center}
      .tipsRule{font-size:13px;color:#65746e;margin:8px 0 16px}
      @media(max-width:760px){
        #floTipsDialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0}
        .tipsTotals,.tipsCalcGrid,.tipsDepartmentGrid{grid-template-columns:1fr 1fr}
        .tipsWaiter{grid-template-columns:1fr}
        .tipsHistoryHead{flex-direction:column}
      }
      @media(max-width:500px){.tipsTotals,.tipsDepartmentGrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function dialog(){
    let d=$('floTipsDialog');
    if(d)return d;
    d=document.createElement('dialog');
    d.id='floTipsDialog';
    d.className='staffPanel';
    d.innerHTML=`
      <header>
        <h2>Чаевые</h2>
        <div class="staffActions"><button type="button" class="secondary" id="tipsClose">На главную</button></div>
      </header>
      <main>
        <div class="tipsTabs">
          <button type="button" class="secondary isSelected" data-tips-tab="history">История</button>
          <button type="button" class="secondary hidden" data-tips-tab="calculator">Калькулятор чаевых</button>
        </div>
        <div id="tipsMessage" aria-live="polite"></div>
        <section id="tipsHistory"></section>
        <section id="tipsCalculator" class="hidden"></section>
      </main>
    `;
    $('tipsClose').onclick=()=>d.close();
    d.querySelectorAll('[data-tips-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tipsTab));
    document.body.appendChild(d);
    return d;
  }

  function message(text,type=''){
    const box=$('tipsMessage');
    if(!box)return;
    box.innerHTML=text?`<div class="notice ${type}">${esc(text)}</div>`:'';
  }

  function selectTab(tab){
    document.querySelectorAll('[data-tips-tab]').forEach(b=>b.classList.toggle('isSelected',b.dataset.tipsTab===tab));
    $('tipsHistory')?.classList.toggle('hidden',tab!=='history');
    $('tipsCalculator')?.classList.toggle('hidden',tab!=='calculator');
    message('');
  }

  function departmentGrid(pools){
    if(!pools)return '';
    const rows=[
      ['Кухня',pools.kitchen],['Менеджер',pools.manager],['Хостес',pools.hostess],
      ['Бар',pools.bar],['Сомелье',pools.sommelier],['Мойка',pools.dishwashing],['Официанты',pools.waiters]
    ];
    return `<div class="tipsDepartmentGrid">${rows.map(([name,value])=>`
      <div class="tipsDepartment"><small>${name}</small><strong>${money(value)}</strong></div>
    `).join('')}</div>`;
  }

  function ownHistoryCard(row){
    const p=row.own||{};
    return `
      <article class="tipsHistoryCard">
        <div class="tipsHistoryHead">
          <div>
            <h3>${esc(row.workDate||'Смена')}</h3>
            <div class="tipsHistoryMeta">${esc(date(row.createdAt))}</div>
          </div>
          <strong>${money(p.total)}</strong>
        </div>
        <div class="tipsHistoryMeta">
          Коэффициент ${num(p.attestationCoefficient)} ·
          ${p.shiftMultiplier===0.5?'половина смены':'полная смена'} ·
          эффективный коэффициент ${num(p.effectiveCoefficient)}
        </div>
      </article>
    `;
  }

  function managerHistoryCard(row){
    const people=Array.isArray(row.distribution)?row.distribution:[];
    return `
      <article class="tipsHistoryCard">
        <div class="tipsHistoryHead">
          <div>
            <h3>${esc(row.workDate||'Распределение чаевых')}</h3>
            <div class="tipsHistoryMeta">Сохранил: ${esc(row.createdByName||'Менеджер')} · ${esc(date(row.createdAt))}</div>
          </div>
          <strong>${money(row.total)}</strong>
        </div>
        <div class="tipsTotals">
          <div><small>Наличные</small><strong>${money(row.cashTotal)}</strong></div>
          <div><small>Безналичные</small><strong>${money(row.cashlessTotal)}</strong></div>
          <div><small>Общий котёл</small><strong>${money(row.total)}</strong></div>
        </div>
        ${departmentGrid(row.departmentPools)}
        <div class="tipsHistoryMeta">
          Коэффициент дня: ${num(row.coefficientDay)} · стоимость 1 единицы: ${money(row.unitValue)} · регламент: ${esc(row.rulesVersion||'—')}
        </div>
        <div class="tipsPeople">
          ${people.map(p=>`
            <div class="tipsPerson">
              <span>
                <strong>${esc(p.name)}</strong>
                <div class="tipsPersonMeta">
                  ${esc(p.position||'Официант')} · коэффициент ${num(p.attestationCoefficient)} ·
                  ${p.shiftMultiplier===0.5?'половина смены':'полная смена'} · эффективный ${num(p.effectiveCoefficient)}
                </div>
              </span>
              <strong>${money(p.total)}</strong>
            </div>
          `).join('')}
        </div>
      </article>
    `;
  }

  function renderHistory(){
    const host=$('tipsHistory');
    if(!host)return;
    if(!state.history.length){
      host.innerHTML=`<div class="tipsEmpty">${state.scope==='all'
        ?'Сохранённых распределений пока нет.'
        :'У вас пока нет сохранённых получений чаевых.'}</div>`;
      return;
    }
    host.innerHTML=state.history.map(state.scope==='all'?managerHistoryCard:ownHistoryCard).join('');
  }

  function waiterRow(person){
    return `
      <article class="tipsWaiter" data-waiter="${esc(person.id)}">
        <div>
          <div class="tipsWaiterHead">
            <input type="checkbox" data-tip-person="${esc(person.id)}">
            <div><strong>${esc(person.name)}</strong><div class="tipsPersonMeta">${esc(person.position||'Официант')}</div></div>
          </div>
          <div class="tipsExtras" style="margin-top:10px">
            <label><input type="checkbox" data-tip-english disabled>Английский +0,25</label>
            <label><input type="checkbox" data-tip-wine disabled>Винная карта +0,25</label>
          </div>
        </div>
        <label>Основной коэффициент
          <select data-tip-base>
            <option value="1">1,0 · Кухня</option>
            <option value="2">2,0 · Бар</option>
            <option value="3">3,0 · Сервис</option>
          </select>
        </label>
        <label>Продолжительность
          <select data-tip-shift>
            <option value="full">Полная смена · ×1,0</option>
            <option value="half">Половина смены · ×0,5</option>
          </select>
        </label>
      </article>
    `;
  }

  function renderCalculator(){
    const host=$('tipsCalculator');
    if(!host)return;
    const waiters=state.team.filter(x=>x.active!==false&&String(x.position||'').toLocaleLowerCase('ru').includes('официант'));
    host.innerHTML=`
      <h3>Калькулятор чаевых</h3>
      <p class="tipsRule">Общий котёл: кухня 10% · менеджер 10% · хостес 5% · бар 5% · сомелье 5% · мойка 5% · официанты 60%.</p>
      <div class="tipsCalcGrid">
        <label>Дата смены<input id="tipsWorkDate" type="date"></label>
        <label>Наличные<input id="tipsCash" type="number" min="0" step="0.01" inputmode="decimal" value="0"></label>
        <label>Безналичные<input id="tipsCashless" type="number" min="0" step="0.01" inputmode="decimal" value="0"></label>
        <label>Общий котёл<input id="tipsGrandTotal" type="text" value="0 ₽" readonly></label>
      </div>
      <h3>Официанты смены</h3>
      <div class="tipsWaiters">${waiters.length?waiters.map(waiterRow).join(''):'<div class="tipsEmpty">В команде не найдено официантов.</div>'}</div>
      <div class="tipsResult" id="tipsCalcResult">Введите суммы, выберите официантов и нажмите «Рассчитать».</div>
      <div class="staffActions">
        <button type="button" class="primary" id="tipsCalculate" ${waiters.length?'':'disabled'}>Рассчитать</button>
        <button type="button" class="secondary" id="tipsSave" disabled>Сохранить результат</button>
      </div>
    `;

    const today=new Date();
    $('tipsWorkDate').value=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);

    const updateTotal=()=>{
      const cash=Math.max(0,Number($('tipsCash').value)||0);
      const cashless=Math.max(0,Number($('tipsCashless').value)||0);
      $('tipsGrandTotal').value=money(cash+cashless);
      $('tipsSave').disabled=true;
    };
    $('tipsCash').oninput=updateTotal;
    $('tipsCashless').oninput=updateTotal;

    host.querySelectorAll('[data-waiter]').forEach(row=>{
      const base=row.querySelector('[data-tip-base]');
      const english=row.querySelector('[data-tip-english]');
      const wine=row.querySelector('[data-tip-wine]');
      const sync=()=>{
        const enabled=Number(base.value)===3;
        english.disabled=!enabled; wine.disabled=!enabled;
        if(!enabled){english.checked=false;wine.checked=false}
        $('tipsSave').disabled=true;
      };
      base.onchange=sync;
      row.querySelector('[data-tip-shift]').onchange=()=>{$('tipsSave').disabled=true};
      row.querySelector('[data-tip-person]').onchange=()=>{$('tipsSave').disabled=true};
      english.onchange=()=>{$('tipsSave').disabled=true};
      wine.onchange=()=>{$('tipsSave').disabled=true};
      sync();
    });
    $('tipsCalculate').onclick=calculate;
  }

  function collectParticipants(){
    return [...document.querySelectorAll('#tipsCalculator [data-waiter]')]
      .filter(row=>row.querySelector('[data-tip-person]')?.checked)
      .map(row=>({
        id:row.dataset.waiter,
        baseCoefficient:Number(row.querySelector('[data-tip-base]').value),
        english:row.querySelector('[data-tip-english]').checked,
        wine:row.querySelector('[data-tip-wine]').checked,
        shift:row.querySelector('[data-tip-shift]').value
      }));
  }

  function renderCalculation(result){
    return `
      <h4>Разделение общего котла</h4>
      ${departmentGrid(result.departmentPools)}
      <h4>Официанты · 60%</h4>
      <div class="tipsPeople">${result.distribution.map(p=>`
        <div class="tipsPerson">
          <span><strong>${esc(p.name)}</strong>
            <div class="tipsPersonMeta">коэффициент ${num(p.attestationCoefficient)} · ${p.shiftMultiplier===0.5?'половина смены':'полная смена'} · эффективный ${num(p.effectiveCoefficient)}</div>
          </span>
          <strong>${money(p.total)}</strong>
        </div>`).join('')}
      </div>
      <p class="tipsHistoryMeta">Коэффициент дня: ${num(result.coefficientDay)} · стоимость 1 единицы: ${money(result.unitValue)}.</p>
    `;
  }

  async function calculate(){
    const participants=collectParticipants();
    const cash=Math.max(0,Number($('tipsCash').value)||0);
    const cashless=Math.max(0,Number($('tipsCashless').value)||0);
    if(cash+cashless<=0){message('Введите сумму наличных и/или безналичных чаевых.','error');return}
    if(!participants.length){message('Выберите хотя бы одного официанта смены.','error');return}
    $('tipsCalculate').disabled=true; message('Считаем…');
    try{
      const result=await api('calculate',{
        workDate:$('tipsWorkDate').value,cashTotal:cash,cashlessTotal:cashless,participants
      });
      $('tipsCalcResult').innerHTML=renderCalculation(result);
      $('tipsSave').disabled=false;
      $('tipsSave').onclick=()=>saveResult(result.calculationId);
      message('');
    }catch(e){message(e.message,'error')}
    finally{$('tipsCalculate').disabled=false}
  }

  async function saveResult(calculationId){
    const button=$('tipsSave');
    if(button)button.disabled=true;
    try{
      message('Сохраняем…');
      await api('save',{calculationId});
      apply(await api('bootstrap'));
      selectTab('history');
      message('Результат сохранён.','ok');
    }catch(e){
      if(button)button.disabled=false;
      message(e.message,'error');
    }
  }

  function apply(data){
    state.loaded=true;
    state.user=data.user||null;
    state.team=Array.isArray(data.team)?data.team:[];
    state.rules=data.rules||null;
    state.history=Array.isArray(data.history)?data.history:[];
    state.scope=data.historyScope||'own';

    const calcTab=document.querySelector('[data-tips-tab="calculator"]');
    calcTab?.classList.toggle('hidden',!state.user?.canCalculate);

    renderHistory();
    renderCalculator();
  }

  async function load(force=false){
    if(state.loading)return;
    if(state.loaded&&!force)return;
    state.loading=true; message('Загрузка…');
    try{apply(await api('bootstrap'));message('')}
    catch(e){message(e.message,'error')}
    finally{state.loading=false}
  }

  async function open(){
    styles();
    const d=dialog();
    if(!d.open)d.showModal();
    selectTab('history');
    await load(true);
  }

  window.FLO_TIPS={open,refresh:()=>load(true)};
})();
