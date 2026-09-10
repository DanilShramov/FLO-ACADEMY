// FLO Academy release 1.0072
(()=>{
  const VERSION=window.__FLO_RELEASE_VERSION__||'1.0072';
  window.FLO_EMPLOYEE_TEAM_VERSION=VERSION;

  const $=id=>document.getElementById(id);
  let pending=null;
  let syncing=false;

  function ensureFields(){
    const form=$('employeeForm');
    const email=$('empEmail');
    if(!form||!email)return;

    if(!$('empPhone')){
      const phone=document.createElement('input');
      phone.id='empPhone';
      phone.type='tel';
      phone.autocomplete='tel';
      phone.placeholder='Номер телефона';
      phone.setAttribute('aria-label','Номер телефона');
      email.before(phone);
    }

    if(!$('empBirthday')){
      const birthday=document.createElement('input');
      birthday.id='empBirthday';
      birthday.type='date';
      birthday.autocomplete='bday';
      birthday.setAttribute('aria-label','Дата рождения');
      $('empEmail').before(birthday);
    }
  }

  async function token(){
    const {getAuth}=await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js');
    const user=getAuth().currentUser;
    if(!user)throw Error('Сессия администратора завершена.');
    return user.getIdToken();
  }

  async function api(action,body=null){
    const t=await token();
    const response=await fetch('/api/team-sync?'+new URLSearchParams({action}),{
      method:body?'POST':'GET',
      headers:{
        Authorization:'Bearer '+t,
        ...(body?{'Content-Type':'application/json'}:{})
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });

    let data={};
    try{data=await response.json()}catch{}
    if(!response.ok)throw Error(data.error||'Не удалось обновить команду.');
    return data;
  }

  function birthdayRu(value){
    if(!value)return '';
    const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?`${m[3]}.${m[2]}.${m[1]}`:String(value);
  }

  function showDirectory(directory){
    const list=$('employeeList');
    if(!list||!Array.isArray(directory))return;

    const byName=new Map(
      directory.map(x=>[String(x.name||'').trim().toLocaleLowerCase('ru'),x])
    );

    list.querySelectorAll('.row').forEach(row=>{
      const name=row.querySelector('.name')?.textContent?.trim().toLocaleLowerCase('ru');
      const person=byName.get(name||'');
      if(!person)return;

      let extra=row.querySelector('.employeeProfileExtra');
      if(!extra){
        extra=document.createElement('div');
        extra.className='meta employeeProfileExtra';
        row.querySelector('.name')?.parentElement?.appendChild(extra);
      }

      const parts=[];
      if(person.phone)parts.push('Тел.: '+person.phone);
      if(person.birthday)parts.push('Дата рождения: '+birthdayRu(person.birthday));
      extra.textContent=parts.join(' · ');
      extra.classList.toggle('hidden',!parts.length);
    });
  }

  async function syncAll(silent=true){
    if(syncing)return;
    syncing=true;
    try{
      const data=await api('sync-all',{});
      showDirectory(data.directory||[]);
    }catch(e){
      if(!silent){
        const msg=$('employeeMsg')||$('formMsg');
        if(msg)msg.textContent=String(e.message||e);
      }
    }finally{
      syncing=false;
    }
  }

  async function syncCreated(){
    if(!pending)return;
    const payload=pending;
    pending=null;

    try{
      const data=await api('sync-created',payload);
      showDirectory(data.directory||[]);

      const msg=$('formMsg');
      if(msg){
        msg.innerHTML='<div class="notice ok">Сотрудник создан и сразу добавлен в команду.</div>';
      }

      window.dispatchEvent(new CustomEvent('flo-team-updated'));
    }catch(e){
      const msg=$('formMsg');
      if(msg){
        msg.textContent='Сотрудник создан, но команду не удалось обновить: '+String(e.message||e);
      }
    }
  }

  function captureNewEmployee(){
    ensureFields();
    const form=$('employeeForm');
    if(!form||form.dataset.floTeamCapture==='1')return;

    form.dataset.floTeamCapture='1';
    form.addEventListener('submit',()=>{
      pending={
        name:$('empName')?.value.trim()||'',
        email:$('empEmail')?.value.trim()||'',
        position:$('empPosition')?.value||'',
        phone:$('empPhone')?.value.trim()||'',
        birthday:$('empBirthday')?.value||''
      };
    },true);
  }

  function watchSuccess(){
    const msg=$('formMsg');
    if(!msg||msg.dataset.floTeamWatch==='1')return;
    msg.dataset.floTeamWatch='1';

    new MutationObserver(()=>{
      const text=msg.textContent||'';
      if(text.includes('Сотрудник создан и сохранён')){
        void syncCreated();
      }
    }).observe(msg,{subtree:true,childList:true,characterData:true});
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#addBtn,#addEmployeeFromListBtn')){
      setTimeout(()=>{
        ensureFields();
        captureNewEmployee();
        watchSuccess();
      },0);
    }

    if(e.target.closest('#openEmployeesBtn')){
      setTimeout(()=>void syncAll(true),150);
    }


  },true);

  window.addEventListener("flo-employees-changed",()=>void syncAll(false));
  function boot(){
    ensureFields();
    captureNewEmployee();
    watchSuccess();


  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
