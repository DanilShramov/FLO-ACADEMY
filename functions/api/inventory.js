// FLO Academy release 1.0075
const PROJECT_DEFAULT='flo-academy';
const KEY_DEFAULT='AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A';
const BREAKAGE='academyInventoryBreakage';
const COUNTS='academyInventoryCounts';

const encoder=new TextEncoder();
let oauthCache=null;
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new HttpError(status,message)};
function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function b64text(v){return b64url(encoder.encode(JSON.stringify(v)))}
function credentials(env){
  let data={};try{if(env.FIREBASE_SERVICE_ACCOUNT)data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)}catch{}
  const project=env.FIREBASE_PROJECT_ID||data.project_id||PROJECT_DEFAULT,email=env.FIREBASE_CLIENT_EMAIL||data.client_email;
  const key=(env.FIREBASE_PRIVATE_KEY||data.private_key||'').replace(/\\n/g,'\n');
  if(!email||!key)fail(503,'Сервер инвентаризации ещё не настроен.');
  return {project,email,key};
}
async function accessToken(c){
  const now=Math.floor(Date.now()/1000),cacheKey=c.project+':'+c.email;
  if(oauthCache?.key===cacheKey&&oauthCache.exp>now+90)return oauthCache.token;
  const pem=c.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const privateKey=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
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
  if(!response.ok||!data.access_token)fail(503,'Сервер инвентаризации не получил доступ к хранилищу.');
  oauthCache={key:cacheKey,token:data.access_token,exp:now+Number(data.expires_in||3600)};
  return data.access_token;
}
function enc(v){
  if(v===null)return {nullValue:null};if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='string')return {stringValue:v};if(Array.isArray(v))return {arrayValue:{values:v.map(enc)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,enc(x)]))}};
}
function dec(v){
  if(!v)return null;if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;
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
    if(!response.ok)fail(503,'Не удалось прочитать или сохранить данные инвентаризации.');
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
    uid:auth.localId,name:profile.data.name||auth.email||'Сотрудник',position,
    allowed:management(position,profile.data.role)
  };
}
function requestId(v){if(typeof v!=='string'||! /^[a-f0-9-]{36}$/.test(v))fail(400,'Обновите страницу перед сохранением.');return v}
function safeDate(value){
  const v=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(400,'Укажите дату.');if(!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)fail(400,'Проверьте дату.');return v;
}
function safeCategory(value){
  const v=String(value||'');if(!['Посуда','Бокалы','Стекло'].includes(v))fail(400,'Выберите категорию.');return v;
}
function safeText(value,max=300){
  return String(value||'').trim().slice(0,max);
}
function safeQty(value,allowZero=false){
  const n=Number(value);
  if(!Number.isInteger(n)||(allowZero?n<0:n<1)||n>100000)fail(400,'Проверьте количество.');
  return n;
}
function addDays(dateText,days){
  const d=new Date(dateText+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
async function lists(store){
  const [breakageRows,countRows]=await Promise.all([store.list(BREAKAGE),store.list(COUNTS)]);
  const breakage=breakageRows.map(x=>({id:x.id,...x.data})).sort((a,b)=>(b.eventDate||'').localeCompare(a.eventDate||'')||(b.createdAt||0)-(a.createdAt||0)).slice(0,300);
  const counts=countRows.map(x=>({id:x.id,...x.data})).sort((a,b)=>(b.inventoryDate||'').localeCompare(a.inventoryDate||'')||(b.createdAt||0)-(a.createdAt||0)).slice(0,100);
  const last=counts[0];
  return {
    breakage,counts,
    cycle:{
      weeks:6,
      lastInventoryDate:last?.inventoryDate||null,
      nextDueDate:last?.inventoryDate?addDays(last.inventoryDate,42):null
    }
  };
}
export async function onRequest({request,env}){
  try{
    if(!['GET','POST'].includes(request.method))fail(405,'Метод не поддерживается.');
    const cfg=credentials(env),store=new Store(cfg.project,await accessToken(cfg)),user=await identity(request,env,store);
    const url=new URL(request.url),action=url.searchParams.get('action')||'bootstrap';

    if(action==='permission')return json({allowed:user.allowed,serverNow:Date.now()});
    if(!user.allowed)fail(403,'Инвентаризация доступна только менеджерам и выше.');

    let body={};
    if(request.method==='POST'){
      const text=await request.text();if(text.length>120000)fail(413,'Слишком большой запрос.');
      try{body=JSON.parse(text||'{}')}catch{fail(400,'Не удалось прочитать запрос.')}
    }

    if(action==='bootstrap'){
      return json({allowed:true,user:{name:user.name,position:user.position},...(await lists(store)),serverNow:Date.now()});
    }

    if(action==='breakage-save'){
      if(request.method!=='POST')fail(405,'Нужно сохранить данные.');
      const item=safeText(body.item,120);
      if(!item)fail(400,'Укажите наименование.');
      const id='br_'+user.uid+'_'+requestId(body.requestId),now=Date.now();const prior=await store.get(BREAKAGE+'/'+id);if(prior)return json({ok:true,id,...prior.data});
      const record={
        eventDate:safeDate(body.eventDate),category:safeCategory(body.category),
        item,quantity:safeQty(body.quantity),note:safeText(body.note,300),
        createdAt:now,createdByUid:user.uid,createdByName:user.name,createdByPosition:user.position
      };
      await store.commit([store.write(BREAKAGE+'/'+id,record,null)]);
      return json({ok:true,id,...record});
    }

    if(action==='count-save'){
      if(request.method!=='POST')fail(405,'Нужно сохранить данные.');
      if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>300)fail(400,'Добавьте позиции инвентаризации.');
      const seen=new Set();
      const lines=body.lines.map(raw=>{
        const category=safeCategory(raw.category),item=safeText(raw.item,120);
        if(!item)fail(400,'Укажите наименование каждой позиции.');
        const key=(category+'|'+item).toLocaleLowerCase('ru');
        if(seen.has(key))fail(400,'Одна позиция указана дважды.');
        seen.add(key);
        return {category,item,quantity:safeQty(raw.quantity,true)};
      });
      const id='inv_'+user.uid+'_'+requestId(body.requestId),now=Date.now();const prior=await store.get(COUNTS+'/'+id);if(prior)return json({ok:true,id,...prior.data});
      const record={
        inventoryDate:safeDate(body.inventoryDate),lines,note:safeText(body.note,500),
        cycleWeeks:6,createdAt:now,createdByUid:user.uid,createdByName:user.name,createdByPosition:user.position
      };
      await store.commit([store.write(COUNTS+'/'+id,record,null)]);
      return json({ok:true,id,...record});
    }

    fail(404,'Действие не найдено.');
  }catch(e){
    if(!(e instanceof HttpError))console.error('Inventory API failed',e);
    return json({error:e instanceof HttpError?e.message:'Не удалось выполнить действие.'},e.status||500);
  }
}
