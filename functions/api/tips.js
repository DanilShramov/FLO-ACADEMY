// FLO Academy release 1.0071
const PROJECT_DEFAULT='flo-academy';
const KEY_DEFAULT='AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A';
const CONFIG='academyStaffConfig/main';
const HISTORY='academyTipsHistory';
const CALCULATIONS='academyTipsCalculations';

const encoder=new TextEncoder();
let oauthCache=null;

class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new HttpError(status,message)};

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function b64text(v){return b64url(encoder.encode(JSON.stringify(v)))}

function credentials(env){
  let data={};try{if(env.FIREBASE_SERVICE_ACCOUNT)data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)}catch{}
  const project=env.FIREBASE_PROJECT_ID||data.project_id||PROJECT_DEFAULT;
  const email=env.FIREBASE_CLIENT_EMAIL||data.client_email;
  const key=(env.FIREBASE_PRIVATE_KEY||data.private_key||'').replace(/\\n/g,'\n');
  if(!email||!key)fail(503,'Сервер чаевых ещё не настроен.');
  return {project,email,key};
}
async function accessToken(c){
  const now=Math.floor(Date.now()/1000),cacheKey=c.project+':'+c.email;
  if(oauthCache?.key===cacheKey&&oauthCache.exp>now+90)return oauthCache.token;
  const pem=c.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const privateKey=await crypto.subtle.importKey(
    'pkcs8',Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']
  );
  const unsigned=b64text({alg:'RS256',typ:'JWT'})+'.'+b64text({
    iss:c.email,scope:'https://www.googleapis.com/auth/datastore',
    aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600
  });
  const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,encoder.encode(unsigned)));
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(signature)})
  });
  const data=await response.json();
  if(!response.ok||!data.access_token)fail(503,'Сервер чаевых не получил доступ к хранилищу.');
  oauthCache={key:cacheKey,token:data.access_token,exp:now+Number(data.expires_in||3600)};
  return data.access_token;
}

function enc(v){
  if(v===null)return {nullValue:null};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='string')return {stringValue:v};
  if(Array.isArray(v))return {arrayValue:{values:v.map(enc)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,enc(x)]))}};
}
function dec(v){
  if(!v)return null;
  if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;
  if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;
  if('booleanValue'in v)return v.booleanValue;if('timestampValue'in v)return v.timestampValue;
  if('arrayValue'in v)return (v.arrayValue.values||[]).map(dec);
  if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,dec(x)]));
  return null;
}
class Store{
  constructor(project,token){
    this.project=project;
    this.base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;
    this.name=`projects/${project}/databases/(default)/documents`;
    this.token=token;
  }
  async request(url,{method='GET',body=null}={}){
    const response=await fetch(url,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    if(response.status===404)return null;
    const data=await response.json();
    if(!response.ok){
      if(response.status===409||data?.error?.status==='FAILED_PRECONDITION')fail(409,'Данные изменились. Обновите страницу.');
      fail(503,'Не удалось прочитать или сохранить чаевые.');
    }
    return data;
  }
  async get(path){
    const r=await this.request(this.base+'/'+path);
    return r?{path,data:dec({mapValue:{fields:r.fields||{}}}),updateTime:r.updateTime}:null;
  }
  async list(col){
    let out=[],page='';
    do{
      const url=new URL(this.base+'/'+col);url.searchParams.set('pageSize','300');if(page)url.searchParams.set('pageToken',page);
      const data=await this.request(url.toString());
      for(const d of data?.documents||[])out.push({id:d.name.split('/').pop(),data:dec({mapValue:{fields:d.fields||{}}}),updateTime:d.updateTime});
      page=data?.nextPageToken||'';
    }while(page);
    return out;
  }
  write(path,data,previous=null){
    return {update:{name:this.name+'/'+path,fields:enc(data).mapValue.fields},currentDocument:previous?{updateTime:previous.updateTime}:{exists:false}};
  }
  async commit(writes){return this.request(this.base+':commit',{method:'POST',body:{writes}})}
}

function management(position,role){
  const p=String(position||'').trim().toLocaleLowerCase('ru');
  return role==='admin'||p==='управляющий'||p.includes('менеджер');
}

async function identity(request,env,store){
  const header=request.headers.get('Authorization')||'';
  if(!header.startsWith('Bearer '))fail(401,'Войдите в аккаунт.');
  const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY||KEY_DEFAULT),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:header.slice(7)})
  });
  const payload=await response.json(),auth=payload.users?.[0];
  if(!response.ok||!auth?.localId||auth.disabled)fail(401,'Сессия завершена. Войдите снова.');
  const profile=await store.get('users/'+encodeURIComponent(auth.localId));
  if(!profile||profile.data.active===false)fail(403,'Доступ сотрудника отключён.');
  const position=String(profile.data.position||'').trim();
  return {
    uid:auth.localId,
    name:profile.data.name||auth.email||'Сотрудник',
    position,
    canCalculate:management(position,profile.data.role)
  };
}

function safeId(value){
  const v=String(value||'');if(!v||v.length>200||v.includes('/'))fail(400,'Некорректный идентификатор.');return v;
}
function safeMoney(value){
  const n=Number(value);if(!Number.isFinite(n)||n<0||n>100000000)fail(400,'Проверьте сумму чаевых.');return Math.round(n*100);
}
function rubles(cents){return Math.round(cents)/100}
function safeDate(value){
  const v=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(400,'Укажите дату смены.');return v;
}
function isWaiter(position){return String(position||'').toLocaleLowerCase('ru').includes('официант')}
function norm(v){return String(v||'').trim().toLocaleLowerCase('ru').replace(/\s+/g,' ')}

function activeTeam(config,employees){
  const accounts=employees
    .filter(x=>x.data?.active!==false&&x.data?.name)
    .map(x=>({id:x.id,uid:x.id,name:String(x.data.name).trim(),position:String(x.data.position||'').trim(),active:true}));

  const byName=new Map(accounts.map(x=>[norm(x.name),x]));

  const configured=(config?.team||[])
    .filter(x=>x&&x.active!==false&&x.name)
    .map(x=>{
      const match=byName.get(norm(x.name));
      return {
        id:String(x.id||match?.id||''),
        uid:match?.uid||null,
        name:String(x.name).trim(),
        position:String(x.role||match?.position||'').trim(),
        active:true
      };
    })
    .filter(x=>x.id);

  const source=configured.length?configured:accounts;
  const seen=new Set();
  return source.filter(x=>{
    const key=norm(x.name)+'|'+norm(x.position);
    if(seen.has(key))return false;
    seen.add(key);return true;
  }).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}

function allocateInteger(total,rows){
  if(!Number.isInteger(total)||total<0)fail(500,'Ошибка расчёта суммы.');
  const clean=rows.map((row,index)=>({...row,index,weight:Number(row.weight)}));
  const sum=clean.reduce((s,x)=>s+x.weight,0);
  if(!(sum>0))fail(400,'Сумма коэффициентов должна быть больше нуля.');
  const calculated=clean.map(row=>{
    const exact=total*row.weight/sum,floor=Math.floor(exact);
    return {...row,cents:floor,remainder:exact-floor};
  });
  let left=total-calculated.reduce((s,x)=>s+x.cents,0);
  calculated.slice().sort((a,b)=>b.remainder-a.remainder||a.index-b.index).forEach(row=>{
    if(left<=0)return;
    calculated[row.index].cents++;left--;
  });
  return calculated;
}

const RULES={
  version:'FLO-TIPS-2026-09',
  attestationPeriodWeeks:6,
  maxWaiterCoefficient:3.5,
  departmentPercent:{kitchen:10,manager:10,hostess:5,bar:5,sommelier:5,dishwashing:5,waiters:60}
};

function departmentPools(totalCents){
  const weights=[
    {key:'kitchen',weight:10},{key:'manager',weight:10},{key:'hostess',weight:5},
    {key:'bar',weight:5},{key:'sommelier',weight:5},{key:'dishwashing',weight:5},{key:'waiters',weight:60}
  ];
  const rows=allocateInteger(totalCents,weights);
  return Object.fromEntries(rows.map(x=>[x.key,rubles(x.cents)]));
}

function participantInput(raw,team){
  const id=safeId(raw?.id),person=team.find(x=>x.id===id);
  if(!person||!isWaiter(person.position))fail(400,'Выберите официантов из вкладки «Команда».');
  const base=Number(raw.baseCoefficient);
  if(![1,2,3].includes(base))fail(400,'Основной коэффициент должен быть 1,0, 2,0 или 3,0.');
  const english=raw.english===true,wine=raw.wine===true;
  if(base!==3&&(english||wine))fail(400,'Дополнительные +0,25 применяются только при основном коэффициенте 3,0.');
  const shift=raw.shift==='half'?'half':'full',shiftMultiplier=shift==='half'?0.5:1;
  const attestationCoefficient=base+(base===3&&english?0.25:0)+(base===3&&wine?0.25:0);
  if(attestationCoefficient>3.5)fail(400,'Коэффициент не может быть выше 3,5.');
  const effectiveCoefficient=attestationCoefficient*shiftMultiplier;
  return {
    id,uid:person.uid||null,name:person.name,position:person.position||'Официант',
    baseCoefficient:base,english,wine,attestationCoefficient,shift,shiftMultiplier,
    effectiveCoefficient,weightUnits:Math.round(effectiveCoefficient*8)
  };
}
function uniqueParticipants(raw,team){
  if(!Array.isArray(raw)||!raw.length)fail(400,'Выберите хотя бы одного официанта смены.');
  if(raw.length>30)fail(400,'Слишком много участников расчёта.');
  const seen=new Set();
  return raw.map(x=>{
    const p=participantInput(x,team);
    if(seen.has(p.id))fail(400,'Один официант выбран несколько раз.');
    seen.add(p.id);return p;
  });
}

async function allHistory(store){
  const rows=await store.list(HISTORY);
  return rows.map(x=>({id:x.id,...x.data})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,100);
}
function ownHistory(rows,user){
  const userName=norm(user.name);
  return rows.flatMap(row=>{
    const own=(row.distribution||[]).find(p=>p.uid===user.uid)||(
      row.distribution||[]
    ).find(p=>norm(p.name)===userName);
    if(!own)return [];
    return [{
      id:row.id,workDate:row.workDate,createdAt:row.createdAt,savedAt:row.savedAt,
      rulesVersion:row.rulesVersion,
      own:{
        total:own.total,attestationCoefficient:own.attestationCoefficient,
        shiftMultiplier:own.shiftMultiplier,effectiveCoefficient:own.effectiveCoefficient
      }
    }];
  });
}

async function calculate(store,user,body,team){
  if(!user.canCalculate)fail(403,'Калькулятор доступен менеджеру и выше.');
  const workDate=safeDate(body.workDate),cashCents=safeMoney(body.cashTotal),cashlessCents=safeMoney(body.cashlessTotal);
  const totalCents=cashCents+cashlessCents;
  if(totalCents<=0)fail(400,'Общий котёл должен быть больше нуля.');
  const participants=uniqueParticipants(body.participants,team),pools=departmentPools(totalCents);
  const waiterPoolCents=Math.round(Number(pools.waiters)*100);
  const weighted=allocateInteger(waiterPoolCents,participants.map(p=>({key:p.id,weight:p.weightUnits})));
  const centsById=Object.fromEntries(weighted.map(x=>[x.key,x.cents]));
  const distribution=participants.map(p=>({
    id:p.id,uid:p.uid,name:p.name,position:p.position,baseCoefficient:p.baseCoefficient,
    english:p.english,wine:p.wine,attestationCoefficient:p.attestationCoefficient,shift:p.shift,
    shiftMultiplier:p.shiftMultiplier,effectiveCoefficient:p.effectiveCoefficient,total:rubles(centsById[p.id])
  }));
  const coefficientDay=participants.reduce((sum,p)=>sum+p.effectiveCoefficient,0);
  const unitValue=coefficientDay>0?rubles(Math.round(waiterPoolCents/coefficientDay)):0;
  const calculationId='tipcalc_'+crypto.randomUUID().replace(/-/g,''),now=Date.now();
  const record={
    calculationId,status:'calculated',rulesVersion:RULES.version,createdAt:now,expiresAt:now+24*60*60*1000,
    createdByUid:user.uid,createdByName:user.name,createdByPosition:user.position,workDate,
    cashTotal:rubles(cashCents),cashlessTotal:rubles(cashlessCents),total:rubles(totalCents),
    departmentPools:pools,coefficientDay,unitValue,distribution
  };
  await store.commit([store.write(CALCULATIONS+'/'+calculationId,record,null)]);
  return record;
}

async function saveCalculation(store,user,body){
  if(!user.canCalculate)fail(403,'Сохранять распределение может менеджер и выше.');
  const id=safeId(body.calculationId),rec=await store.get(CALCULATIONS+'/'+id);
  if(!rec)fail(404,'Расчёт не найден. Выполните его заново.');
  if(rec.data.createdByUid!==user.uid)fail(403,'Можно сохранить только собственный расчёт.');
  if(rec.data.expiresAt<Date.now())fail(409,'Расчёт устарел. Выполните его заново.');
  if(rec.data.status==='saved'){
    const existing=await store.get(HISTORY+'/'+id);return existing?.data||rec.data;
  }
  const now=Date.now(),history={...rec.data,status:'saved',savedAt:now},updated={...rec.data,status:'saved',savedAt:now};
  await store.commit([store.write(HISTORY+'/'+id,history,null),store.write(CALCULATIONS+'/'+id,updated,rec)]);
  return history;
}

export async function onRequest({request,env}){
  try{
    if(!['GET','POST'].includes(request.method))fail(405,'Метод не поддерживается.');

    const cfg=credentials(env);
    const store=new Store(cfg.project,await accessToken(cfg));
    const user=await identity(request,env,store);

    const url=new URL(request.url);
    const action=url.searchParams.get('action')||'bootstrap';

    let body={};
    if(request.method==='POST'){
      const text=await request.text();
      if(text.length>100000)fail(413,'Слишком большой запрос.');
      try{body=JSON.parse(text||'{}')}
      catch{fail(400,'Не удалось прочитать запрос.')}
    }

    if(action==='bootstrap'){
      const historyPromise=allHistory(store);

      if(!user.canCalculate){
        const history=await historyPromise;
        return json({
          user:{name:user.name,position:user.position,canCalculate:false},
          team:[],
          rules:RULES,
          history:ownHistory(history,user),
          historyScope:'own',
          serverNow:Date.now()
        });
      }

      const [history,configRecord,employeeRecords]=await Promise.all([
        historyPromise,
        store.get(CONFIG),
        store.list('employees')
      ]);

      const team=activeTeam(configRecord?.data||{},employeeRecords);

      return json({
        user:{name:user.name,position:user.position,canCalculate:true},
        team,
        rules:RULES,
        history,
        historyScope:'all',
        serverNow:Date.now()
      });
    }

    if(action==='history'){
      const history=await allHistory(store);
      return json({
        history:user.canCalculate?history:ownHistory(history,user),
        historyScope:user.canCalculate?'all':'own',
        serverNow:Date.now()
      });
    }

    if(action==='calculate'){
      if(request.method!=='POST')fail(405,'Нужно отправить данные расчёта.');
      if(!user.canCalculate)fail(403,'Калькулятор доступен менеджеру и выше.');

      const [configRecord,employeeRecords]=await Promise.all([
        store.get(CONFIG),
        store.list('employees')
      ]);

      const team=activeTeam(configRecord?.data||{},employeeRecords);
      return json(await calculate(store,user,body,team));
    }

    if(action==='save'){
      if(request.method!=='POST')fail(405,'Нужно отправить результат.');
      return json(await saveCalculation(store,user,body));
    }

    fail(404,'Действие не найдено.');
  }catch(e){
    if(!(e instanceof HttpError))console.error('Tips API failed',e);
    return json(
      {error:e instanceof HttpError?e.message:'Не удалось выполнить действие.'},
      e.status||500
    );
  }
}
