// FLO Academy release 1.0075
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0075';
  window.FLO_INVENTORY_VERSION=VERSION;

  const state={allowed:null,loaded:false,loading:false,breakage:[],counts:[],cycle:null,user:null};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const date=v=>{
    if(!v)return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
  };

  async function token(){
    const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js');
    const user=getAuth().currentUser;
    if(!user)throw Error('Войдите в аккаунт.');
    return user.getIdToken();
  }

  async function api(action,body=null){
    if(body&&action.endsWith('-save')){const key=JSON.stringify(body);if(state.saveKey!==key){state.saveKey=key;state.requestId=crypto.randomUUID()}body={...body,requestId:state.requestId}}
    const generation=state.generation||0;const t=await token();
    const response=await fetch('/api/inventory?'+new URLSearchParams({action}),{
      method:body?'POST':'GET',
      headers:{Authorization:'Bearer '+t,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)
    });
    if(generation!==(state.generation||0))throw Error('Аккаунт изменился.');let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw Error(data.error||'Не удалось выполнить действие.');
    return data;
  }

  async function canAccess(){
    if(state.allowed!==null)return state.allowed;
    try{
      const data=await api('permission');
      state.allowed=!!data.allowed;
    }catch(e){state.allowed=null;throw e}
    return state.allowed;
  }

  function styles(){
    if($('floInventoryStyles'))return;
    const style=document.createElement('style');
    style.id='floInventoryStyles';
    style.textContent=`
      #floInventoryDialog{width:min(1040px,96vw);max-height:92dvh}
      #floInventoryDialog main{padding:22px 24px}
      .invTabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
      .invTabs .isSelected{background:#23483f;color:#fff}
      .invGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
      .invStat{background:#f4f6f2;border-radius:14px;padding:16px}
      .invStat strong{display:block;font-size:22px}
      .invCard{border:1px solid #dce4de;border-radius:16px;padding:18px;margin:12px 0;background:#fff}
      .invRow{display:grid;grid-template-columns:150px minmax(160px,1fr) 120px minmax(180px,1fr) auto;gap:8px;align-items:end;margin:8px 0}
      .invRow input,.invRow select{margin:0}
      .invLines{display:grid;gap:8px}
      .invLine{display:grid;grid-template-columns:150px minmax(180px,1fr) 120px auto;gap:8px;align-items:end}
      .invHistoryHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .invMuted{color:#65746e;font-size:13px}
      .invBadge{display:inline-block;padding:5px 9px;border-radius:99px;background:#e9efeb;color:#354f43;font-size:12px;font-weight:600}
      .invDanger{background:#fff0ed;color:#84392d}
      @media(max-width:760px){
        #floInventoryDialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0}
        .invGrid{grid-template-columns:1fr}
        .invRow,.invLine{grid-template-columns:1fr}
        .invHistoryHead{flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  function dialog(){
    let d=$('floInventoryDialog');
    if(d)return d;
    d=document.createElement('dialog');
    d.id='floInventoryDialog';
    d.className='staffPanel';
    d.innerHTML=`
      <header>
        <h2>Инвентаризация</h2>
        <div class="staffActions"><button type="button" class="secondary" id="invClose">На главную</button></div>
      </header>
      <main>
        <div class="invTabs">
          <button type="button" class="secondary isSelected" data-inv-tab="breakage">Бой</button>
          <button type="button" class="secondary" data-inv-tab="count">Инвентаризация</button>
          <button type="button" class="secondary" data-inv-tab="history">История</button>
        </div>
        <div id="invMessage"></div>
        <section id="invBreakage"></section>
        <section id="invCount" class="hidden"></section>
        <section id="invHistory" class="hidden"></section>
      </main>
    `;
    d.querySelector('#invClose').onclick=()=>d.close();
    d.querySelectorAll('[data-inv-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.invTab));
    document.body.appendChild(d);
    return d;
  }

  function message(text,type=''){
    const box=$('invMessage');if(!box)return;
    box.innerHTML=text?`<div class="notice ${type}">${esc(text)}</div>`:'';if(type==='error'){const b=document.createElement('button');b.className='secondary';b.textContent='Обновить данные';b.onclick=()=>load(true);box.append(b)}
  }

  function selectTab(tab){
    document.querySelectorAll('[data-inv-tab]').forEach(b=>b.classList.toggle('isSelected',b.dataset.invTab===tab));
    $('invBreakage').classList.toggle('hidden',tab!=='breakage');
    $('invCount').classList.toggle('hidden',tab!=='count');
    $('invHistory').classList.toggle('hidden',tab!=='history');
    message('');
  }

  function today(){
    const d=new Date();
    return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  }

  function renderBreakage(){
    const host=$('invBreakage');
    host.innerHTML=`
      <div class="invCard">
        <h3>Зафиксировать бой</h3>
        <div class="invRow">
          <label>Дата<input id="invBreakDate" type="date" value="${today()}"></label>
          <label>Категория
            <select id="invBreakCategory">
              <option>Посуда</option><option>Бокалы</option><option>Стекло</option>
            </select>
          </label>
          <label>Количество<input id="invBreakQty" type="number" min="1" step="1" value="1"></label>
          <label>Наименование<input id="invBreakItem" maxlength="120" placeholder="Например: бокал для вина"></label>
          <button type="button" class="primary" id="invBreakSave">Сохранить</button>
        </div>
        <label>Комментарий<input id="invBreakNote" maxlength="300" placeholder="Причина или примечание"></label>
      </div>
      <h3>Последние записи</h3>
      <div>${state.breakage.slice(0,30).map(x=>`
        <article class="invCard">
          <div class="invHistoryHead">
            <div><strong>${esc(x.item)}</strong><div class="invMuted">${esc(x.category)} · ${esc(x.eventDate)} · ${esc(x.createdByName)}</div></div>
            <span class="invBadge invDanger">− ${esc(x.quantity)} шт.</span>
          </div>
          ${x.note?`<p>${esc(x.note)}</p>`:''}
        </article>
      `).join('')||'<div class="invCard invMuted">Записей боя пока нет.</div>'}</div>
    `;
    $('invBreakSave').onclick=saveBreakage;
  }

  function lineTemplate(){
    return `
      <div class="invLine">
        <label>Категория
          <select data-count-category><option>Посуда</option><option>Бокалы</option><option>Стекло</option></select>
        </label>
        <label>Наименование<input data-count-item maxlength="120"></label>
        <label>Остаток, шт.<input data-count-qty type="number" min="0" step="1" value="0"></label>
        <button type="button" class="secondary" data-count-remove>Убрать</button>
      </div>
    `;
  }

  function renderCount(){
    const host=$('invCount');
    const due=state.cycle?.nextDueDate||null;
    host.innerHTML=`
      <div class="invGrid">
        <div class="invStat"><small>Последняя инвентаризация</small><strong>${esc(state.cycle?.lastInventoryDate||'Не проводилась')}</strong></div>
        <div class="invStat"><small>Следующая по циклу 6 недель</small><strong>${esc(due||'После первой инвентаризации')}</strong></div>
        <div class="invStat"><small>Цикл</small><strong>6 недель</strong></div>
      </div>
      <div class="invCard">
        <h3>Новая инвентаризация</h3>
        <label>Дата<input id="invCountDate" type="date" value="${today()}"></label>
        <div id="invCountLines" class="invLines">${lineTemplate()}</div>
        <div class="staffActions">
          <button type="button" class="secondary" id="invAddLine">Добавить позицию</button>
          <button type="button" class="primary" id="invCountSave">Сохранить инвентаризацию</button>
        </div>
        <label>Комментарий<input id="invCountNote" maxlength="500" placeholder="Примечание к инвентаризации"></label>
      </div>
    `;
    const bind=()=>{
      host.querySelectorAll('[data-count-remove]').forEach(b=>b.onclick=()=>b.closest('.invLine').remove());
    };
    bind();
    $('invAddLine').onclick=()=>{
      $('invCountLines').insertAdjacentHTML('beforeend',lineTemplate());
      bind();
    };
    $('invCountSave').onclick=saveCount;
  }

  function renderHistory(){
    const host=$('invHistory');
    host.innerHTML=`
      <h3>Инвентаризации</h3>
      ${state.counts.map(x=>`
        <article class="invCard">
          <div class="invHistoryHead">
            <div><strong>${esc(x.inventoryDate)}</strong><div class="invMuted">Провёл: ${esc(x.createdByName)} · ${date(x.createdAt)}</div></div>
            <span class="invBadge">${x.lines.length} позиций</span>
          </div>
          ${x.note?`<p>${esc(x.note)}</p>`:''}
          <details>
            <summary>Посмотреть остатки</summary>
            ${x.lines.map(l=>`<p>${esc(l.category)} · ${esc(l.item)} — <strong>${esc(l.quantity)} шт.</strong></p>`).join('')}
          </details>
        </article>
      `).join('')||'<div class="invCard invMuted">Инвентаризаций пока нет.</div>'}
      <h3>История боя</h3>
      ${state.breakage.map(x=>`
        <article class="invCard">
          <strong>${esc(x.item)}</strong>
          <div class="invMuted">${esc(x.eventDate)} · ${esc(x.category)} · ${esc(x.createdByName)}</div>
          <p>Количество: ${esc(x.quantity)} шт.${x.note?' · '+esc(x.note):''}</p>
        </article>
      `).join('')||'<div class="invCard invMuted">Записей боя пока нет.</div>'}
    `;
  }

  async function saveBreakage(){
    const item=$('invBreakItem').value.trim();
    const quantity=Number($('invBreakQty').value);
    if(!item){message('Укажите наименование.','error');return}
    if(!Number.isInteger(quantity)||quantity<1){message('Проверьте количество.','error');return}
    $('invBreakSave').disabled=true;
    try{
      await api('breakage-save',{
        eventDate:$('invBreakDate').value,category:$('invBreakCategory').value,
        item,quantity,note:$('invBreakNote').value.trim()
      });
      state.loaded=false;await load(true);if(state.loaded){state.saveKey=null;selectTab('history');message('Бой сохранён в истории.','ok')}
    }catch(e){message(e.message,'error')}
    finally{if($('invBreakSave'))$('invBreakSave').disabled=false}
  }

  async function saveCount(){
    const lines=[...document.querySelectorAll('#invCountLines .invLine')].map(row=>({
      category:row.querySelector('[data-count-category]').value,
      item:row.querySelector('[data-count-item]').value.trim(),
      quantity:Number(row.querySelector('[data-count-qty]').value)
    })).filter(x=>x.item);

    if(!lines.length){message('Добавьте хотя бы одну позицию.','error');return}
    $('invCountSave').disabled=true;
    try{
      await api('count-save',{
        inventoryDate:$('invCountDate').value,lines,note:$('invCountNote').value.trim()
      });
      state.loaded=false;await load(true);if(state.loaded){state.saveKey=null;selectTab('history');message('Инвентаризация сохранена в истории.','ok')}
    }catch(e){message(e.message,'error')}
    finally{if($('invCountSave'))$('invCountSave').disabled=false}
  }

  function apply(data){
    state.allowed=!!data.allowed;
    state.user=data.user||null;
    state.breakage=Array.isArray(data.breakage)?data.breakage:[];
    state.counts=Array.isArray(data.counts)?data.counts:[];
    state.cycle=data.cycle||null;
    renderBreakage();renderCount();renderHistory();
  }

  async function load(force=false){
    if(state.loading)return;
    if(state.loaded&&!force)return;
    state.loading=true;message('Загрузка…');
    try{
      const data=await api('bootstrap');
      state.loaded=true;apply(data);message('');
    }catch(e){message(e.message,'error')}
    finally{state.loading=false}
  }

  async function open(){
    if(!(await canAccess()))throw Error('Инвентаризация доступна менеджерам и выше.');
    styles();
    const d=dialog();
    if(!d.open)window.FLO_NAV?window.FLO_NAV.page(d):d.showModal();
    selectTab('breakage');
    await load(false);
  }

  window.FLO_INVENTORY={open,canAccess,reset(){state.generation=(state.generation||0)+1;Object.assign(state,{allowed:null,loaded:false,loading:false,user:null,breakage:[],counts:[],cycle:null});$('floInventoryDialog')?.remove()}};
})();
