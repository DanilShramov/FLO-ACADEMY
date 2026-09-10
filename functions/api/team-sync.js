// FLO Academy release 1.0075
const PROJECT_DEFAULT='flo-academy';
const KEY_DEFAULT='AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A';
const CONFIG='academyStaffConfig/main';

const encoder=new TextEncoder();
let oauthCache=null;

class HttpError extends Error{
  constructor(status,message){super(message);this.status=status}
}
const fail=(status,message)=>{throw new HttpError(status,message)};

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    }
  });
}

function b64url(bytes){
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g,'')
    .replace(/\+/g,'-')
    .replace(/\//g,'_');
}
function b64text(v){return b64url(encoder.encode(JSON.stringify(v)))}

function credentials(env){
  let data={};
  try{if(env.FIREBASE_SERVICE_ACCOUNT)data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)}catch{}
  const project=env.FIREBASE_PROJECT_ID||data.project_id||PROJECT_DEFAULT;
  const email=env.FIREBASE_CLIENT_EMAIL||data.client_email;
  const key=(env.FIREBASE_PRIVATE_KEY||data.private_key||'').replace(/\\n/g,'\n');
  if(!email||!key)fail(503,'Сервер команды ещё не настроен.');
  return {project,email,key};
}

async function accessToken(c){
  const now=Math.floor(Date.now()/1000),cacheKey=c.project+':'+c.email;
  if(oauthCache?.key===cacheKey&&oauthCache.exp>now+90)return oauthCache.token;

  const pem=c.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const privateKey=await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},
    false,
    ['sign']
  );

  const unsigned=
    b64text({alg:'RS256',typ:'JWT'})+'.'+
    b64text({
      iss:c.email,
      scope:'https://www.googleapis.com/auth/datastore',
      aud:'https://oauth2.googleapis.com/token',
      iat:now,
      exp:now+3600
    });

  const signature=new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(unsigned)
    )
  );

  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:unsigned+'.'+b64url(signature)
    })
  });

  const data=await response.json();
  if(!response.ok||!data.access_token)fail(503,'Сервер команды не получил доступ к хранилищу.');

  oauthCache={
    key:cacheKey,
    token:data.access_token,
    exp:now+Number(data.expires_in||3600)
  };
  return data.access_token;
}

function enc(v){
  if(v===null)return {nullValue:null};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='string')return {stringValue:v};
  if(Array.isArray(v))return {arrayValue:{values:v.map(enc)}};
  return {
    mapValue:{
      fields:Object.fromEntries(
        Object.entries(v)
          .filter(([,x])=>x!==undefined)
          .map(([k,x])=>[k,enc(x)])
      )
    }
  };
}

function dec(v){
  if(!v)return null;
  if('nullValue'in v)return null;
  if('stringValue'in v)return v.stringValue;
  if('integerValue'in v)return Number(v.integerValue);
  if('doubleValue'in v)return v.doubleValue;
  if('booleanValue'in v)return v.booleanValue;
  if('timestampValue'in v)return v.timestampValue;
  if('arrayValue'in v)return (v.arrayValue.values||[]).map(dec);
  if('mapValue'in v){
    return Object.fromEntries(
      Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,dec(x)])
    );
  }
  return null;
}

class Store{
  constructor(project,token){
    this.base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;
    this.name=`projects/${project}/databases/(default)/documents`;
    this.token=token;
  }

  async request(url,{method='GET',body=null}={}){
    const response=await fetch(url,{
      method,
      headers:{
        Authorization:'Bearer '+this.token,
        'Content-Type':'application/json'
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });

    if(response.status===404)return null;
    const data=await response.json();

    if(!response.ok){
      if(response.status===409||data?.error?.status==='FAILED_PRECONDITION'){
        fail(409,'Данные команды изменились. Повторите синхронизацию.');
      }
      fail(503,'Не удалось обновить команду.');
    }

    return data;
  }

  async get(path){
    const r=await this.request(this.base+'/'+path);
    return r?{
      path,
      data:dec({mapValue:{fields:r.fields||{}}}),
      updateTime:r.updateTime
    }:null;
  }

  async list(col){
    let out=[],page='';
    do{
      const url=new URL(this.base+'/'+col);
      url.searchParams.set('pageSize','300');
      if(page)url.searchParams.set('pageToken',page);

      const data=await this.request(url.toString());
      for(const d of data?.documents||[]){
        out.push({
          id:d.name.split('/').pop(),
          data:dec({mapValue:{fields:d.fields||{}}}),
          updateTime:d.updateTime
        });
      }
      page=data?.nextPageToken||'';
    }while(page);

    return out;
  }

  write(path,data,previous=null){
    return {
      update:{
        name:this.name+'/'+path,
        fields:enc(data).mapValue.fields
      },
      currentDocument:previous
        ?{updateTime:previous.updateTime}
        :{exists:false}
    };
  }

  async commit(writes){
    return this.request(this.base+':commit',{
      method:'POST',
      body:{writes}
    });
  }
}

async function identity(request,env,store){
  const header=request.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer '))fail(401,'Войдите в аккаунт.');

  const response=await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+
      encodeURIComponent(env.FIREBASE_WEB_API_KEY||KEY_DEFAULT),
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idToken:header.slice(7)})
    }
  );

  const payload=await response.json();
  const auth=payload.users?.[0];

  if(!response.ok||!auth?.localId||auth.disabled){
    fail(401,'Сессия завершена. Войдите снова.');
  }

  const profile=await store.get('users/'+encodeURIComponent(auth.localId));
  if(!profile||profile.data.active===false){
    fail(403,'Доступ отключён.');
  }

  if(profile.data.role!=='admin'){
    fail(403,'Синхронизация команды доступна администратору.');
  }

  return {
    uid:auth.localId,
    name:profile.data.name||auth.email||'Администратор'
  };
}

function clean(value,max=200){
  return String(value||'').trim().slice(0,max);
}

function validBirthday(value){
  const v=clean(value,10);
  if(!v)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(400,'Проверьте дату рождения.');
  const d=new Date(v+'T12:00:00Z');
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v)fail(400,'Проверьте дату рождения.');
  return v;
}

function norm(value){
  return clean(value).toLocaleLowerCase('ru').replace(/\s+/g,' ');
}

function employeeRow(record){
  const d=record.data||{};
  return {
    uid:record.id,
    name:clean(d.name),
    email:clean(d.email),
    position:clean(d.position),
    phone:clean(d.phone,80),
    birthday:clean(d.birthday,10),
    active:d.active!==false
  };
}

function directory(rows){
  return rows
    .filter(x=>x.active&&x.name)
    .map(x=>({
      uid:x.uid,
      name:x.name,
      position:x.position,
      phone:x.phone,
      birthday:x.birthday
    }))
    .sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}

async function patchCreated(store,body){
  const email=clean(body.email).toLocaleLowerCase();
  if(!email)return;

  const employees=(await store.list('employees')).map(employeeRow);
  const employee=employees.find(x=>x.email.toLocaleLowerCase()===email);

  if(!employee)fail(409,'Профиль сотрудника ещё не появился. Откройте список сотрудников ещё раз.');

  const employeeRec=await store.get('employees/'+employee.uid);
  const userRec=await store.get('users/'+employee.uid);
  if(!employeeRec||!userRec)fail(409,'Профиль сотрудника ещё сохраняется.');

  const phone=clean(body.phone,80);
  const birthday=validBirthday(body.birthday);

  const employeeData={
    ...employeeRec.data,
    name:clean(body.name)||employeeRec.data.name||'',
    email:clean(body.email)||employeeRec.data.email||'',
    position:clean(body.position)||employeeRec.data.position||'',
    phone,
    birthday,
    active:true
  };

  const userData={
    ...userRec.data,
    name:employeeData.name,
    email:employeeData.email,
    position:employeeData.position,
    phone,
    birthday,
    active:true
  };

  await store.commit([
    store.write('employees/'+employee.uid,employeeData,employeeRec),
    store.write('users/'+employee.uid,userData,userRec)
  ]);
}

function mergeTeam(existing,employees){
  const active=employees.filter(x=>x.active&&x.name);
  const activeUids=new Set(active.map(x=>x.uid));
  const team=Array.isArray(existing)?existing.map(x=>({...x})):[];
  const used=new Set();

  for(const employee of active){
    let index=team.findIndex((x,i)=>
      !used.has(i)&&(
        x.uid===employee.uid||
        clean(x.email).toLocaleLowerCase()===employee.email.toLocaleLowerCase()&&employee.email||
        norm(x.name)===norm(employee.name)
      )
    );

    const current=index>=0?team[index]:null;
    const entry={
      ...(current||{}),
      id:current?.id||('employee_'+employee.uid),
      uid:employee.uid,
      employeeManaged:true,
      name:employee.name,
      role:employee.position,
      email:employee.email,
      phone:employee.phone,
      birthday:employee.birthday,
      contact:employee.phone||current?.contact||'',
      zone:current?.zone||'',
      active:true
    };

    if(index>=0){
      team[index]=entry;
      used.add(index);
    }else{
      team.push(entry);
      used.add(team.length-1);
    }
  }

  return team.filter(x=>{
    if(x.employeeManaged===true&&x.uid&&!activeUids.has(x.uid))return false;
    return x.active!==false;
  });
}

async function syncConfig(store){
  for(let attempt=0;attempt<2;attempt++){
    const [configRec,employeeRecords]=await Promise.all([
      store.get(CONFIG),
      store.list('employees')
    ]);

    const employees=employeeRecords.map(employeeRow);
    const previous=configRec?.data||{};
    const next={
      ...previous,
      team:mergeTeam(previous.team,employees),
      updatedAt:Date.now()
    };

    try{
      await store.commit([store.write(CONFIG,next,configRec)]);
      return directory(employees);
    }catch(e){
      if(!(e instanceof HttpError)||e.status!==409||attempt===1)throw e;
    }
  }
}

export async function onRequest({request,env}){
  try{
    if(!['GET','POST'].includes(request.method)){
      fail(405,'Метод не поддерживается.');
    }

    const cfg=credentials(env);
    const store=new Store(cfg.project,await accessToken(cfg));
    await identity(request,env,store);

    const url=new URL(request.url);
    const action=url.searchParams.get('action')||'sync-all';

    let body={};
    if(request.method==='POST'){
      const text=await request.text();
      if(text.length>20000)fail(413,'Слишком большой запрос.');
      try{body=JSON.parse(text||'{}')}
      catch{fail(400,'Не удалось прочитать данные сотрудника.')}
    }

    if(action==='sync-created'){
      await patchCreated(store,body);
      const list=await syncConfig(store);
      return json({ok:true,directory:list,serverNow:Date.now()});
    }

    if(action==='sync-all'){
      const list=await syncConfig(store);
      return json({ok:true,directory:list,serverNow:Date.now()});
    }

    if(action==='directory'){
      const list=(await store.list('employees')).map(employeeRow);
      return json({directory:directory(list),serverNow:Date.now()});
    }

    fail(404,'Действие не найдено.');
  }catch(e){
    if(!(e instanceof HttpError))console.error('Team sync failed',e);
    return json(
      {error:e instanceof HttpError?e.message:'Не удалось обновить команду.'},
      e.status||500
    );
  }
}
