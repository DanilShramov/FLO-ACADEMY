import {versionOf,accessible,assigned,localDay} from '../../lib/staff-domain.mjs';
const PROJECT_DEFAULT='flo-academy';
const KEY_DEFAULT='AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A';
const ATTEMPTS='academyTestAttempts',STATE='academyTestState',SETTINGS='academyTestSettings/catalog',CUSTOM='academyCustomQuestions';
const encoder=new TextEncoder();let oauthCache=null;
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new HttpError(status,message)};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function b64text(v){return b64url(encoder.encode(JSON.stringify(v)))}
function unb64text(v){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))}
function credentials(env){let data={};try{if(env.FIREBASE_SERVICE_ACCOUNT)data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)}catch{}const project=env.FIREBASE_PROJECT_ID||data.project_id||PROJECT_DEFAULT,email=env.FIREBASE_CLIENT_EMAIL||data.client_email,key=(env.FIREBASE_PRIVATE_KEY||data.private_key||'').replace(/\\n/g,'\n');if(!email||!key)fail(503,'Сервер тестов ещё не настроен.');return {project,email,key}}
async function accessToken(c){const now=Math.floor(Date.now()/1000),ck=c.project+':'+c.email;if(oauthCache?.key===ck&&oauthCache.exp>now+90)return oauthCache.token;const pem=c.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,''),pk=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);const u=b64text({alg:'RS256',typ:'JWT'})+'.'+b64text({iss:c.email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}),sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pk,encoder.encode(u))),r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:u+'.'+b64url(sig)})}),d=await r.json();if(!r.ok||!d.access_token)fail(503,'Сервер тестов не получил доступ к хранилищу.');oauthCache={key:ck,token:d.access_token,exp:now+Number(d.expires_in||3600)};return d.access_token}
function enc(v){if(v===null)return {nullValue:null};if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(typeof v==='string')return {stringValue:v};if(Array.isArray(v))return {arrayValue:{values:v.map(enc)}};return {mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,enc(x)]))}}}
function dec(v){if(!v)return null;if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('timestampValue'in v)return v.timestampValue;if('arrayValue'in v)return (v.arrayValue.values||[]).map(dec);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,dec(x)]));return null}
class Store{constructor(project,token){this.project=project;this.base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;this.name=`projects/${project}/databases/(default)/documents`;this.token=token}async call(suffix,body,method){const r=await fetch(this.base+suffix,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(r.status===404)return null;const v=await r.json();if(!r.ok){if(r.status===409||v?.error?.status==='FAILED_PRECONDITION')fail(409,'Данные изменились в другой вкладке. Обновите попытку.');fail(503,'Не удалось прочитать или сохранить данные теста.');}return v}async get(path){const r=await this.call('/'+path);return r?{path,data:dec({mapValue:{fields:r.fields||{}}}),updateTime:r.updateTime}:null}write(path,data,previous){return {update:{name:this.name+'/'+path,fields:enc(data).mapValue.fields},currentDocument:previous?{updateTime:previous.updateTime}:{exists:false}}}async commit(writes){return this.call(':commit',{writes})}async list(col){let out=[],page='';do{const u=new URL(this.base+'/'+col);u.searchParams.set('pageSize','300');if(page)u.searchParams.set('pageToken',page);const r=await fetch(u,{headers:{Authorization:'Bearer '+this.token}});if(r.status===404)return [];const d=await r.json();if(!r.ok)fail(503,'Не удалось прочитать данные тестов.');for(const x of d.documents||[])out.push({path:col+'/'+x.name.split('/').pop(),data:dec({mapValue:{fields:x.fields||{}}}),updateTime:x.updateTime});page=d.nextPageToken||''}while(page);return out}}
async function identity(request,env,store,project){const h=request.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))fail(401,'Войдите в аккаунт.');const token=h.slice(7),r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY||KEY_DEFAULT),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})}),p=await r.json(),a=p.users?.[0];if(!r.ok||!a?.localId||a.disabled)fail(401,'Сессия завершена. Войдите снова.');const profile=await store.get('users/'+encodeURIComponent(a.localId));if(!profile||profile.data.active===false)fail(403,'Доступ сотрудника отключён.');return {uid:a.localId,name:profile.data.name||a.email||'Сотрудник',position:profile.data.position||'',reviewer:profile.data.role==='admin'||profile.data.position==='Управляющий'}}

const CONFIG='academyStaffConfig/main',ROOT='academyStaffUsers';
const emptyConfig=()=>({materials:{},routes:[],checklists:[],team:[]});
const ownPath=(uid,suffix)=>ROOT+'/'+encodeURIComponent(uid)+'/'+suffix;
function short(v,max=200){return String(v||'').trim().slice(0,max)}
function safeId(v){if(typeof v!=='string'||!v||v.length>200||v.includes('/'))fail(400,'Неверный идентификатор.');return v}
function reviewer(user){if(!user.reviewer)fail(403,'Раздел доступен управляющему.')}
async function queryRows(store,col,{where=[],size=30,cursor=null}={}){
 const q={from:[{collectionId:col}],orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:size+1};
 if(where.length)q.where=where.length===1?where[0]:{compositeFilter:{op:'AND',filters:where}};
 if(cursor)q.startAt={before:false,values:[{referenceValue:store.name+'/'+col+'/'+safeId(cursor)}]};
 const raw=await store.call(':runQuery',{structuredQuery:q});
 const rows=(raw||[]).filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),...dec({mapValue:{fields:x.document.fields||{}}})}));
 return {items:rows.slice(0,size),cursor:rows.length>size?rows[size-1].id:null};
}
const equal=(field,value)=>({fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:enc(value)}});
async function attemptsPage(store,uid,cursor=null){
 const q={from:[{collectionId:'academyTestAttempts'}],where:equal('uid',uid),orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'},{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:26};
 if(cursor){let c;try{c=unb64text(cursor)}catch{fail(400,'Неверная страница.')}if(!Number.isFinite(c.time))fail(400,'Неверная страница.');q.startAt={before:false,values:[enc(c.time),{referenceValue:store.name+'/academyTestAttempts/'+safeId(c.id)}]}}
 const raw=await store.call(':runQuery',{structuredQuery:q}),rows=(raw||[]).filter(x=>x.document).map(x=>({...dec({mapValue:{fields:x.document.fields||{}}}),id:x.document.name.split('/').pop()}));
 const items=rows.slice(0,25).map(a=>({id:a.id,uid:a.uid,employeeName:a.employeeName,position:a.position,testTitle:a.testTitle,createdAt:a.createdAt,finishedAt:a.finishedAt,status:a.status,mode:a.mode,preview:!!a.preview,percent:a.result?.percent??null,score:a.result?.score??null,total:a.result?.total??a.privateQuestions?.length,passed:a.result?.passed??null}));
 return {items,cursor:rows.length>25?b64text({time:rows[24].createdAt,id:rows[24].id}):null};
}
async function subPage(store,uid,sub,cursor=null){
 const q={from:[{collectionId:sub}],orderBy:[{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:26};
 if(cursor)q.startAt={before:false,values:[{referenceValue:store.name+'/'+ownPath(uid,sub)+'/'+safeId(cursor)}]};
 const raw=await store.call('/'+ROOT+'/'+encodeURIComponent(uid)+':runQuery',{structuredQuery:q});
 const rows=(raw||[]).filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),...dec({mapValue:{fields:x.document.fields||{}}})}));
 return {items:rows.slice(0,25),cursor:rows.length>25?rows[24].id:null};
}
async function config(store){const rec=await store.get(CONFIG);return {data:{...emptyConfig(),...rec?.data},revision:rec?.updateTime||null,rec}}
async function library(store){const [sections,items]=await Promise.all([store.list('materialSections'),store.list('materialItems')]);return {sections:sections.map(r=>({...r.data,id:r.path.split('/').pop()})),items:items.map(r=>({...r.data,id:r.path.split('/').pop()}))}}
async function userProgress(store,uid){const rows=await store.list(ownPath(uid,'progress'));return Object.fromEntries(rows.map(r=>[r.data.materialId,r.data]))}
function checkConfig(c){
 if(!c||typeof c!=='object'||!Array.isArray(c.routes)||!Array.isArray(c.checklists)||!Array.isArray(c.team)||!c.materials)fail(400,'Проверьте настройки обучения.');
 if(c.routes.length>100||c.checklists.length>100||c.team.length>300||Object.keys(c.materials).length>3000)fail(400,'Слишком много записей.');
 for(const group of [c.routes,c.checklists,c.team]){const ids=new Set();for(const x of group){safeId(x.id);if(ids.has(x.id))fail(400,'Повторяется идентификатор.');ids.add(x.id)}}
 for(const r of c.routes){if(!short(r.name)||!Array.isArray(r.materialIds)||r.materialIds.length>100||!Array.isArray(r.positions)||!r.materialIds.length&&!r.testRequired)fail(400,'В маршруте нужно название и хотя бы один материал или тест.');r.materialIds.forEach(safeId);if(new Set(r.materialIds).size!==r.materialIds.length)fail(400,'Материалы маршрута повторяются.')}
 for(const ckl of c.checklists){if(!short(ckl.name)||!Array.isArray(ckl.items)||!ckl.items.length||ckl.items.length>60||ckl.items.some(x=>typeof x!=='string'||!x.trim())||!Array.isArray(ckl.positions))fail(400,'Заполните название, должности и пункты чек-листа.')}
 for(const t of c.team)if(!short(t.name)||!short(t.role))fail(400,'Укажите имя и роль участника команды.');
 for(const [id,m] of Object.entries(c.materials)){safeId(id);if(!Number.isInteger(m.revision)||m.revision<1||m.revision>100000||!Array.isArray(m.tags)||m.tags.length>30||!Number.isFinite(m.minutes)||m.minutes<0||m.minutes>1000)fail(400,'Проверьте свойства материала.')}
}
export async function onRequest({request,env}){
 try{
 if(!['GET','POST'].includes(request.method))fail(405,'Метод не поддерживается.');
 const cfg=credentials(env),store=new Store(cfg.project,await accessToken(cfg)),user=await identity(request,env,store,cfg.project),u=new URL(request.url),action=u.searchParams.get('action')||'bootstrap';
 let body={};if(request.method==='POST'){const text=await request.text();if(text.length>350000)fail(413,'Слишком большой запрос.');try{body=JSON.parse(text)}catch{fail(400,'Не удалось прочитать запрос.')}}
 if(['config-save','progress','check','feedback-save'].includes(action)&&request.method!=='POST')fail(405,'Нужно сохранить данные.');
 if(action==='bootstrap'){
   const [conf,progress,checks,feedback]=await Promise.all([config(store),userProgress(store,user.uid),store.list(ownPath(user.uid,'checks')),store.list(ownPath(user.uid,'feedback'))]);
   return json({user,config:conf.data,configRevision:conf.revision,progress,checks:checks.map(x=>x.data),feedback:feedback.map(x=>x.data),serverNow:Date.now()});
 }
 if(action==='config-save'){
   reviewer(user);checkConfig(body.config);const prev=await config(store);
   if((body.revision||null)!==prev.revision)fail(409,'Другой управляющий изменил настройки. Обновите страницу.');
   const next={materials:body.config.materials,routes:body.config.routes,checklists:body.config.checklists,team:body.config.team,updatedAt:Date.now()};
   // Any edit to a standard creates a new acknowledgement revision.
   for(const [id,m] of Object.entries(next.materials)){const old=prev.data.materials[id];const a={...m},b={...old};delete a.revision;delete b.revision;m.revision=old?(JSON.stringify(a)===JSON.stringify(b)?old.revision:old.revision+1):1}
   const now=Date.now();for(const route of next.routes){const old=prev.data.routes.find(r=>r.id===route.id);route.assignedAt=old?.assignedAt||now}
   await store.commit([store.write(CONFIG,next,prev.rec)]);const saved=await config(store);return json({config:saved.data,configRevision:saved.revision});
 }
 if(action==='progress'){
   const id=safeId(body.materialId),conf=await config(store),lib=await library(store),m=lib.items.find(x=>x.id===id);
   if(!m||!user.reviewer&&!accessible(m,lib.sections,user.position))fail(403,'Материал недоступен.');
   const meta=conf.data.materials[id]||{},version=versionOf(m,meta),path=ownPath(user.uid,'progress/'+id),prev=await store.get(path),now=Date.now();
   const next={...prev?.data,materialId:id,materialName:m.name||m.fileName||id,updatedAt:now};
   if(body.kind==='open'){next.openVersion=version;next.openedAt=now}
   else if(body.kind==='ack'){
     if(body.version!==version)fail(409,'Материал обновился. Откройте его снова перед подтверждением.');
     if(prev?.data.openVersion!==version)fail(400,'Сначала откройте текущую версию материала.');
     if(prev?.data.ackVersion===version)return json(prev.data);
     next.ackVersion=version;next.ackAt=now;
   }else if(body.kind==='bookmark'){next.favorite=body.favorite===true;next.later=body.later===true}
   else fail(400,'Неизвестное действие.');
   const writes=[store.write(path,next,prev)];
   if(body.kind==='ack')writes.push(store.write(ownPath(user.uid,'events/'+String(now)+'_'+crypto.randomUUID()),{uid:user.uid,name:user.name,position:user.position,materialId:id,materialName:next.materialName,version,ackAt:now},null));
   await store.commit(writes);return json(next);
 }
 if(action==='check'){
   const conf=await config(store),c=conf.data.checklists.find(x=>x.id===body.id);
   if(!c||!assigned(c,user.position))fail(403,'Чек-лист недоступен.');
   if(!Array.isArray(body.done)||body.done.length!==c.items.length||body.done.some(x=>typeof x!=='boolean'))fail(400,'Проверьте пункты чек-листа.');
   const day=localDay(),path=ownPath(user.uid,'checks/'+day+'_'+safeId(c.id)),prev=await store.get(path),data={id:c.id,day,done:body.done,items:c.items,name:c.name,updatedAt:Date.now()};
   await store.commit([store.write(path,data,prev)]);return json(data);
 }
 if(action==='report'){
   reviewer(user);const page=await queryRows(store,'users',{size:10,cursor:u.searchParams.get('cursor')});
   const rows=await Promise.all(page.items.filter(x=>x.active!==false).map(async p=>{
     const [progress,tests]=await Promise.all([userProgress(store,p.id),attemptsPage(store,p.id).catch(()=>({items:[],unavailable:true}))]);
     return {uid:p.id,name:p.name||p.email||p.id,position:p.position||'',progress,tests};
   }));
   return json({items:rows,cursor:page.cursor});
 }
 if(action==='attempts'){
   const uid=u.searchParams.get('uid')||user.uid;if(uid!==user.uid)reviewer(user);
   return json(await attemptsPage(store,safeId(uid),u.searchParams.get('cursor')));
 }
 if(action==='events'){
   const uid=u.searchParams.get('uid')||user.uid;if(uid!==user.uid)reviewer(user);
   return json(await subPage(store,safeId(uid),'events',u.searchParams.get('cursor')));
 }
 if(action==='feedback-save'){
   reviewer(user);const uid=safeId(body.uid),attemptId=safeId(body.attemptId),attempt=await store.get('academyTestAttempts/'+attemptId);
   if(!attempt||attempt.data.uid!==uid)fail(404,'Попытка сотрудника не найдена.');
   if(attempt.data.status==='active')fail(400,'Дождитесь завершения теста.');
   const path=ownPath(uid,'feedback/'+attemptId),prev=await store.get(path),data={attemptId,comment:short(body.comment,2000),repeat:body.repeat===true,dueDate:short(body.dueDate,10),createdAt:Date.now(),managerName:user.name,mode:attempt.data.mode||'practice'};
   await store.commit([store.write(path,data,prev)]);return json(data);
 }
 fail(404,'Действие не найдено.');
 }catch(e){return json({error:e instanceof HttpError?e.message:'Не удалось выполнить запрос. Попробуйте ещё раз.'},e instanceof HttpError?e.status:500)}
}
