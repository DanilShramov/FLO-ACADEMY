(()=>{
  let mode='practice', reviewer=false, questionCount=0;
  let allowCommittedChange=false;
  const confirmedQuestions=new Set();
  const originalFetch=window.fetch.bind(window), originalConfirm=window.confirm.bind(window);
  const setMode=m=>{mode=m==='attestation'?'attestation':'practice';window.__floTestMode=mode};

  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/api/tests')&&url.includes('action=start')&&init.body){
      try{const body=JSON.parse(init.body);body.mode=mode;init={...init,body:JSON.stringify(body)}}catch{}
    }
    const response=await originalFetch(input,init);
    if(url.includes('/api/tests')&&url.includes('action=catalog')){
      try{
        const data=await response.clone().json();
        reviewer=!!data.reviewer;
        questionCount=Number(data.questionCount)||0;
        setTimeout(enhance,0)
      }catch{}
    }
    return response;
  };

  window.confirm=function(message){
    const s=String(message||'');
    if(s.includes('10 минут на 10 вопросов')){
      return mode==='attestation'
        ? originalConfirm('Начать аттестацию? 20 вопросов, 20 минут. Проходной результат — 85%.')
        : true;
    }
    if(s.includes('Ответы выбраны на')&&s.includes('из 10 вопросов')){
      return originalConfirm(s.replace('из 10 вопросов','из 20 вопросов'));
    }
    return originalConfirm(message);
  };

  async function token(){
    const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js');
    return getAuth().currentUser?.getIdToken()
  }

  async function post(action,body){
    const t=await token();
    const r=await originalFetch('/api/tests?'+new URLSearchParams({action}),{
      method:'POST',
      headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Ошибка');
    return d
  }

  function injectProStyles(){
    if(document.getElementById('floTestProStyles'))return;
    const style=document.createElement('style');
    style.id='floTestProStyles';
    style.textContent=`
      .questionStep.answered{background:#ecece8!important;color:#44504b!important}
      #runnerConfirmAnswer{width:100%;flex-basis:100%;order:-1;margin:0 0 8px!important}
      .floTestChoiceGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
      @media(max-width:600px){.floTestChoiceGrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function removeOldAttestationTile(){
    document.getElementById('employeeAttestationTile')?.remove();
    const tests=document.getElementById('employeeTestsTile');
    if(tests&&!tests.dataset.modeHook){
      tests.dataset.modeHook='1';
      tests.addEventListener('click',()=>setMode('practice'),true);
    }
  }

  function roleTabs(){
    const overview=document.querySelector('[data-test-page="overview"]');
    const catalog=document.querySelector('[data-test-page="catalog"]');
    const history=document.querySelector('[data-test-page="history"]');
    const results=document.querySelector('[data-test-page="results"]');
    const review=document.querySelector('[data-test-page="review"]');

    if(overview)overview.classList.toggle('hidden',!reviewer);
    if(catalog)catalog.classList.toggle('hidden',reviewer);
    if(history)history.classList.toggle('hidden',reviewer);
    if(results)results.classList.toggle('hidden',!reviewer);
    if(review)review.classList.toggle('hidden',!reviewer);

    if(!reviewer){
      const view=document.getElementById('testsView');
      const active=overview?.classList.contains('isSelected');
      if(view&&!view.classList.contains('hidden')&&active)catalog?.click();
    }
  }

  function overview(){
    const b=document.querySelector('[data-test-page="overview"]');
    if(!reviewer||!b?.classList.contains('isSelected'))return;
    const c=document.getElementById('testsContent');
    if(!c||c.dataset.proOverview==='1')return;
    c.dataset.proOverview='1';
    c.innerHTML=`<div class="testStats" style="grid-template-columns:1fr"><div><b>${questionCount||'—'}</b><span>вопросов в банке</span></div></div>`;
  }

  function startRandom(cards,nextMode){
    setMode(nextMode);
    const buttons=[...cards.querySelectorAll('.startTest:not(:disabled)')];
    if(!buttons.length){
      document.getElementById('catalogResume')?.click();
      return
    }
    buttons[Math.floor(Math.random()*buttons.length)].click();
  }

  function catalog(){
    const b=document.querySelector('[data-test-page="catalog"]');
    if(reviewer||!b?.classList.contains('isSelected'))return;
    const c=document.getElementById('testsContent');
    const cards=c?.querySelector('.testCatalog');
    if(!c||!cards||c.querySelector('#practiceRandomStart'))return;

    cards.style.display='none';
    const h=c.querySelector('h2');
    if(h)h.textContent='Тестирование';
    [...c.querySelectorAll('p.sub,p.meta')].forEach(p=>p.style.display='none');

    const box=document.createElement('div');
    box.className='notice';
    box.innerHTML='<b>Случайный вариант · 20 вопросов</b><br>Выбрать конкретный вариант нельзя.';

    const actions=document.createElement('div');
    actions.className='floTestChoiceGrid';

    const practice=document.createElement('button');
    practice.id='practiceRandomStart';
    practice.className='primary';
    practice.textContent='Пройти тест';
    practice.style.margin='0';

    const att=document.createElement('button');
    att.id='attestationRandomStart';
    att.className='secondary';
    att.textContent='Аттестация';

    practice.onclick=()=>startRandom(cards,'practice');
    att.onclick=()=>{
      setMode('attestation');
      if(originalConfirm('Начать аттестацию? 20 вопросов, 20 минут. Проходной результат — 85%.')){
        startRandom(cards,'attestation')
      }
    };

    actions.append(practice,att);
    cards.before(box,actions);
  }

  function currentQuestionNumber(){
    const text=document.querySelector('#runnerQuestion .tileEyebrow')?.textContent||'';
    const m=text.match(/ВОПРОС\s+(\d+)/i);
    return m?Number(m[1]):null
  }

  function installAnswerConfirmation(){
    const overlay=document.getElementById('testRunner');
    if(!overlay||overlay.dataset.confirmInstalled)return;
    overlay.dataset.confirmInstalled='1';

    overlay.addEventListener('change',e=>{
      if(allowCommittedChange)return;
      const input=e.target;
      if(!(input instanceof HTMLInputElement)||!input.closest('#runnerQuestion'))return;

      e.stopImmediatePropagation();
      const q=currentQuestionNumber();
      if(q)confirmedQuestions.delete(q);
      setTimeout(ensureConfirmButton,0);
    },true);
  }

  function ensureConfirmButton(){
    const overlay=document.getElementById('testRunner');
    if(!overlay||overlay.classList.contains('hidden'))return;
    const question=document.getElementById('runnerQuestion');
    const bottom=overlay.querySelector('.runnerBottom');
    if(!question||!bottom||question.classList.contains('hidden'))return;

    let btn=document.getElementById('runnerConfirmAnswer');
    if(!btn){
      btn=document.createElement('button');
      btn.id='runnerConfirmAnswer';
      btn.className='primary';
      bottom.prepend(btn);

      btn.onclick=()=>{
        const inputs=[...question.querySelectorAll('input')];
        const checked=inputs.filter(x=>x.checked);
        if(!checked.length){
          alert('Сначала выберите ответ.');
          return
        }

        const q=currentQuestionNumber();
        allowCommittedChange=true;
        try{
          checked[0].dispatchEvent(new Event('change',{bubbles:true}))
        }finally{
          allowCommittedChange=false
        }

        if(q)confirmedQuestions.add(q);
        btn.disabled=true;
        btn.textContent='Ответ подтверждён';
      };
    }

    const q=currentQuestionNumber();
    const hasChoice=!!question.querySelector('input:checked');
    const confirmed=q&&confirmedQuestions.has(q);
    btn.disabled=!hasChoice||!!confirmed;
    btn.textContent=confirmed?'Ответ подтверждён':'Подтвердить ответ';
  }

  function normalizeSaveWarning(){
    const state=document.getElementById('runnerSaveState');
    const notice=document.getElementById('runnerNotice');
    if(!notice)return;

    if((state?.textContent||'').includes('Ответы сохранены')&&(notice.textContent||'').includes('Load failed')){
      notice.innerHTML='';
      return
    }

    const error=notice.querySelector('.notice.error');
    if(error&&(error.textContent||'').includes('Load failed')){
      error.classList.remove('error');
      error.style.background='#fff4d6';
      error.style.color='#6a5620';
      error.textContent='Ответ пока не сохранился. Не закрывайте страницу: при перезагрузке несохранённый ответ будет потерян.';
      const q=currentQuestionNumber();
      if(q)confirmedQuestions.delete(q);
      ensureConfirmButton();
    }
  }

  function runner(){
    const overlay=document.getElementById('testRunner');
    if(!overlay||overlay.classList.contains('hidden'))return;

    installAnswerConfirmation();

    const title=document.getElementById('runnerTitle')?.textContent||'';
    const att=title.includes('Аттестация');

    const clock=overlay.querySelector('.runnerClock');
    if(clock)clock.style.display=att?'flex':'none';

    const label=document.getElementById('runnerLabel');
    if(label&&!label.textContent.includes('ЧЕРНОВИКА')){
      label.textContent=att?'АТТЕСТАЦИЯ':'ПРОХОЖДЕНИЕ';
    }

    const state=document.getElementById('runnerSaveState');
    if(state&&!att&&state.textContent.includes('Таймер')){
      state.textContent='Ответ сохраняется после подтверждения.';
    }

    const walker=document.createTreeWalker(overlay,NodeFilter.SHOW_TEXT);
    let n;
    while(n=walker.nextNode()){
      if(n.nodeValue.includes('ИЗ 10'))n.nodeValue=n.nodeValue.replaceAll('ИЗ 10','ИЗ 20');
      if(n.nodeValue.includes(' / 10'))n.nodeValue=n.nodeValue.replaceAll(' / 10',' / 20');
    }

    const hero=overlay.querySelector('.resultHero');
    if(att&&hero&&!hero.querySelector('.attestationStatus')){
      const m=(hero.textContent||'').match(/(\d+)%/);
      if(m){
        const passed=Number(m[1])>=85;
        const p=document.createElement('p');
        p.className='attestationStatus';
        p.innerHTML='<b>'+(passed?'СДАНО':'НЕ СДАНО')+'</b>';
        hero.appendChild(p)
      }
    }

    ensureConfirmButton();
    normalizeSaveWarning();
  }

  function history(){
    document.querySelectorAll('.historyRow').forEach(row=>{
      const t=row.querySelector('.resultPill');
      if(!t)return;
      t.childNodes.forEach(n=>{
        if(n.nodeType===3)n.nodeValue=n.nodeValue.replace(' / 10',' / 20')
      });

      const title=row.querySelector('b')?.textContent||'';
      if(title.includes('Аттестация')&&!t.querySelector('.attStatus')){
        const m=(t.textContent||'').match(/(\d+)%/);
        if(m){
          const s=document.createElement('small');
          s.className='attStatus';
          s.textContent=Number(m[1])>=85?'Сдано':'Не сдано';
          t.appendChild(s)
        }
      }
    });
  }

  function review(){
    const tab=document.querySelector('[data-test-page="review"]');
    if(!reviewer||!tab?.classList.contains('isSelected'))return;
    const c=document.getElementById('testsContent');
    const bank=c?.querySelector('.reviewBank');
    if(!c||!bank||document.getElementById('customQuestionForm'))return;

    c.querySelectorAll('.notice').forEach(n=>{
      if(n.textContent.includes('Банк:')){
        n.textContent=`Банк: ${questionCount} вопросов. Проверьте формулировки и ключи.`
      }
    });

    const form=document.createElement('form');
    form.id='customQuestionForm';
    form.innerHTML=`<div class="rule"></div><h2>Добавить свой вопрос</h2><select name="type"><option value="single">Один правильный ответ</option><option value="multi">Несколько правильных ответов</option></select><input name="topic" placeholder="Тема" value="Сервис"><textarea name="prompt" placeholder="Вопрос" required style="width:100%;min-height:90px;padding:14px;border:1px solid var(--line);border-radius:13px"></textarea><div id="customOptions"></div><textarea name="explanation" placeholder="Пояснение к правильному ответу" style="width:100%;min-height:70px;padding:14px;border:1px solid var(--line);border-radius:13px"></textarea><button class="primary" type="submit">Добавить вопрос</button><div id="customQuestionMsg"></div>`;

    const opts=form.querySelector('#customOptions');
    for(let i=0;i<4;i++){
      const l=document.createElement('label');
      l.className='checkItem';
      l.innerHTML=`<input type="checkbox" name="correct" value="${i}"><input name="option${i}" placeholder="Вариант ${i+1}" required style="margin:0">`;
      opts.appendChild(l)
    }

    form.onsubmit=async e=>{
      e.preventDefault();
      const msg=form.querySelector('#customQuestionMsg');
      msg.textContent='Сохраняем…';
      try{
        const data=new FormData(form);
        const type=data.get('type');
        const correct=data.getAll('correct').map(Number);
        const options=[0,1,2,3].map(i=>data.get('option'+i));
        if(type==='single'&&correct.length!==1)throw new Error('Для одиночного вопроса отметьте ровно один правильный вариант.');
        if(type==='multi'&&correct.length<2)throw new Error('Для вопроса с несколькими ответами отметьте минимум два правильных варианта.');
        await post('custom-add',{
          type,
          topic:data.get('topic'),
          prompt:data.get('prompt'),
          options,
          correct,
          explanation:data.get('explanation')
        });
        msg.textContent='Вопрос добавлен.';
        questionCount++;
        setTimeout(()=>tab.click(),350)
      }catch(err){
        msg.textContent=err.message
      }
    };

    bank.before(form);
  }

  function enhance(){
    injectProStyles();
    removeOldAttestationTile();
    roleTabs();
    overview();
    catalog();
    runner();
    history();
    review();
  }

  const observer=new MutationObserver(()=>enhance());
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      enhance();
      observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    })
  }else{
    enhance();
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
  }
})();