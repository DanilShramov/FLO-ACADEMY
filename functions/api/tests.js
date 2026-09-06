import { BANK } from '../../lib/flo-tests-bank.mjs';

const PROJECT_DEFAULT='flo-academy';
const KEY_DEFAULT='AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A';
const COLLECTION='academyTestAttempts';
const encoder=new TextEncoder();
let oauthCache=null;
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new HttpError(status,message)};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function b64text(value){return b64url(encoder.encode(JSON.stringify(value)))}
function unb64text(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))}
function credentials(env){
 let data={};try{if(env.FIREBASE_SERVICE_ACCOUNT)data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)}catch{fail(503,'Не удалось прочитать настройки сервера тестов.')}
 const project=env.FIREBASE_PROJECT_ID||data.project_id||PROJECT_DEFAULT;
 const email=env.FIREBASE_CLIENT_EMAIL||data.client_email;
 const key=(env.FIREBASE_PRIVATE_KEY||data.private_key||'').replace(/\\n/g,'\n');
 if(!email||!key)fail(503,'Сервер тестов ещё не настроен. Обратитесь к администратору.');
 return {project,email,key};
}
async function accessToken(config){
 const cacheKey=config.project+':'+config.email,now=Math.floor(Date.now()/1000);
 if(oauthCache?.key===cacheKey&&oauthCache.exp>now+90)return oauthCache.token;
 const pem=config.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const privateKey=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const unsigned=b64text({alg:'RS256',typ:'JWT'})+'.'+b64text({iss:config.email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,encoder.encode(unsigned)));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(signature)})});
 const data=await response.json();if(!response.ok||!data.access_token)fail(503,'Сервер тестов не получил доступ к хранилищу.');
 oauthCache={key:cacheKey,token:data.access_token,exp:now+Number(data.expires_in||3600)};return data.access_token;
}
export function encodeValue(value){
 if(value===null)return {nullValue:null};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(typeof value==='string')return {stringValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encodeValue)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encodeValue(v)]))}};
}
export function decodeValue(value){
 if('nullValue'in value)return null;if('stringValue'in value)return value.stringValue;
 if('integerValue'in value)return Number(value.integerValue);if('doubleValue'in value)return value.doubleValue;
 if('booleanValue'in value)return value.booleanValue;if('timestampValue'in value)return value.timestampValue;
 if('arrayValue'in value)return (value.arrayValue.values||[]).map(decodeValue);
 if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decodeValue(v)]));
 return null;
}
class Store{
 constructor(project,token){this.base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents`;this.name=`projects/${project}/databases/(default)/documents`;this.token=token}
 async call(suffix,body,method){
  const r=await fetch(this.base+suffix,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===404)return null;const value=await r.json();
  if(!r.ok){if(r.status===409||value?.error?.status==='FAILED_PRECONDITION')fail(409,'Данные изменились в другой вкладке. Обновите попытку.');fail(503,'Не удалось прочитать или сохранить данные теста. Проверьте настройки сервера и индексы.');}
  return value;
 }
 async get(path){const result=await this.call('/'+path);return result?{path,data:decodeValue({mapValue:{fields:result.fields||{}}}),updateTime:result.updateTime}:null}
 write(path,data,previous){return {update:{name:this.name+'/'+path,fields:encodeValue(data).mapValue.fields},currentDocument:previous?{updateTime:previous.updateTime}:{exists:false}}}
 async commit(writes){return this.call(':commit',{writes})}
 async history(uid,cursor){
  const q={from:[{collectionId:COLLECTION}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'},{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:26};
  if(uid)q.where={fieldFilter:{field:{fieldPath:'uid'},op:'EQUAL',value:{stringValue:uid}}};
  if(cursor){let c;try{c=unb64text(cursor)}catch{fail(400,'Неверная страница истории.')}if(!Number.isFinite(c.time)||!/^a_[a-zA-Z0-9_-]+$/.test(c.id))fail(400,'Неверная страница истории.');q.startAt={before:false,values:[encodeValue(c.time),{referenceValue:this.name+'/'+COLLECTION+'/'+c.id}]};}
  const results=await this.call(':runQuery',{structuredQuery:q});
  const rows=(results||[]).filter(x=>x.document).map(x=>({path:COLLECTION+'/'+x.document.name.split('/').pop(),data:decodeValue({mapValue:{fields:x.document.fields}}),updateTime:x.document.updateTime}));
  return {rows:rows.slice(0,25),more:rows.length>25};
 }
}
async function identity(request,env,store,project){
 const authorization=request.headers.get('Authorization')||'';if(!authorization.startsWith('Bearer '))fail(401,'Войдите в аккаунт.');
 const token=authorization.slice(7);if(token.length>12000)fail(401,'Некорректная сессия.');
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY||KEY_DEFAULT),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 const payload=await response.json();const account=payload.users?.[0];if(!response.ok||!account?.localId||account.disabled)fail(401,'Сессия завершена. Войдите снова.');
 let claims;try{claims=unb64text(token.split('.')[1])}catch{fail(401,'Некорректная сессия.')}
 if(claims.aud!==project||claims.iss!=='https://securetoken.google.com/'+project||claims.sub!==account.localId||claims.exp<=Math.floor(Date.now()/1000)||Number(claims.auth_time)<Number(account.validSince||0))fail(401,'Сессия завершена. Войдите снова.');
 const profile=await store.get('users/'+encodeURIComponent(account.localId));if(!profile||profile.data.active===false)fail(403,'Доступ сотрудника отключён.');
 return {uid:account.localId,name:profile.data.name||account.email||'Сотрудник',position:profile.data.position||'',reviewer:profile.data.role==='admin'||profile.data.position==='Управляющий'};
}
function assertOwner(attempt,user){if(attempt.uid!==user.uid&&!user.reviewer)fail(403,'Доступна только ваша история прохождений.')}
function assertParticipant(attempt,user){if(attempt.uid!==user.uid)fail(403,'Нельзя отвечать за другого сотрудника.')}
function cleanId(id){if(typeof id!=='string'||!/^a_[a-zA-Z0-9_-]{1,100}$/.test(id))fail(400,'Некорректный номер попытки.');return id}
export function sanitizeAnswers(questions,answers){
 if(!answers||typeof answers!=='object'||Array.isArray(answers))fail(400,'Некорректные ответы.');
 const output={};if(Object.keys(answers).some(id=>!questions.some(q=>q.id===id)))fail(400,'В ответах указан неизвестный вопрос.');
 for(const q of questions){const ids=answers[q.id]||[];if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!q.options.some(o=>o.id===id))||new Set(ids).size!==ids.length||ids.length>q.options.length||(q.type!=='multi'&&ids.length>1))fail(400,'Проверьте выбранные ответы.');output[q.id]=ids.slice().sort()}
 return output;
}
export function grade(questions,answers){
 let score=0;const details=questions.map(q=>{const selected=answers[q.id]||[];const correct=selected.length===q.correct.length&&q.correct.every(id=>selected.includes(id));if(correct)score++;return {id:q.id,correct,selected,correctIds:q.correct,explanation:q.explanation}});
 return {score,total:questions.length,percent:Math.round(score/questions.length*100),details};
}
export function publicAttempt(attempt){
 const {privateQuestions,...rest}=attempt;
 return {...rest,questions:privateQuestions.map(({correct,explanation,...q})=>q)};
}
function summarize(a){return {id:a.id,uid:a.uid,employeeName:a.employeeName,position:a.position,testTitle:a.testTitle,createdAt:a.createdAt,deadline:a.deadline,finishedAt:a.finishedAt||null,status:a.status,score:a.result?.score??null,total:10,percent:a.result?.percent??null,preview:!!a.preview}}
async function persistAttempt(store,record,patch){
 const next={...record.data,...patch,revision:record.data.revision+1};await store.commit([store.write(record.path,next,record)]);return {path:record.path,data:next};
}
async function finalizeExpired(store,record,now){
 if(record.data.status!=='active'||now<record.data.deadline)return record;
 try{return await persistAttempt(store,record,{status:'timed_out',finishedAt:record.data.deadline,result:grade(record.data.privateQuestions,record.data.answers)})}catch(e){if(e.status!==409)throw e;return await store.get(record.path)}
}
async function readAttempt(store,id,user){const record=await store.get(COLLECTION+'/'+cleanId(id));if(!record)fail(404,'Попытка не найдена.');assertOwner(record.data,user);return record}
async function getActive(store,user){
 const state=await store.get('academyTestState/'+encodeURIComponent(user.uid));
 if(!state?.data.activeId)return null;const record=await store.get(COLLECTION+'/'+cleanId(state.data.activeId));
 if(!record)return null;assertParticipant(record.data,user);return record.data.status==='active'?record:null;
}
function shuffled(array){const result=structuredClone(array);for(let i=result.length-1;i>0;i--){const random=crypto.getRandomValues(new Uint32Array(1))[0];const j=random%(i+1);[result[i],result[j]]=[result[j],result[i]]}return result}
async function startAttempt(store,user,body,settings,now){
 const test=BANK.tests.find(t=>t.id===body.testId);if(!test)fail(400,'Тест не найден.');
 const published=settings?.data.published===true&&settings.data.bankVersion===BANK.version;
 if(!published&&!user.reviewer)fail(403,'Тесты ещё проверяет управляющий.');
 for(let retry=0;retry<3;retry++){
  const statePath='academyTestState/'+encodeURIComponent(user.uid),state=await store.get(statePath);
  if(state?.data.activeId){let active=await store.get(COLLECTION+'/'+cleanId(state.data.activeId));if(active){assertParticipant(active.data,user);active=await finalizeExpired(store,active,now);if(active.data.status==='active')return publicAttempt(active.data)}}
  const id='a_'+crypto.randomUUID().replace(/-/g,'');const privateQuestions=shuffled(test.questionIds.map(id=>BANK.questions.find(q=>q.id===id))).map(q=>({...q,options:shuffled(q.options)}));
  const attempt={id,uid:user.uid,employeeName:user.name,position:user.position,testId:test.id,testTitle:test.title,bankVersion:BANK.version,preview:!published,status:'active',createdAt:now,deadline:now+600000,answers:{},revision:0,privateQuestions};
  try{await store.commit([store.write(COLLECTION+'/'+id,attempt,null),store.write(statePath,{activeId:id},state)]);return publicAttempt(attempt)}catch(e){if(e.status!==409||retry===2)throw e;}
 }
}
async function bodyJson(request){if(Number(request.headers.get('Content-Length'))>20000)fail(413,'Слишком большой запрос.');const text=await request.text();if(text.length>20000)fail(413,'Слишком большой запрос.');try{return JSON.parse(text)}catch{fail(400,'Не удалось прочитать запрос.')}}
export async function handleAction({store,user,action,method,body={},params=new URLSearchParams(),now=Date.now()}){
 if(action==='catalog'&&method==='GET'){
  const [settings,active]=await Promise.all([store.get('academyTestSettings/catalog'),getActive(store,user)]);
  const published=settings?.data.published===true&&settings.data.bankVersion===BANK.version;
  return {reviewer:user.reviewer,published,bankVersion:BANK.version,notice:BANK.notice,activeAttemptId:active?.data.id||null,tests:BANK.tests.map(({questionIds,...t})=>({...t,count:questionIds.length}))};
 }
 if(action==='review'&&method==='GET'){if(!user.reviewer)fail(403,'Раздел доступен управляющему.');return BANK}
 if(action==='publish'&&method==='POST'){
  if(!user.reviewer)fail(403,'Только управляющий может утвердить тесты.');
  if(body.bankVersion!==BANK.version||typeof body.published!=='boolean')fail(400,'Обновите банк вопросов перед сохранением.');
  if(body.published&&body.confirmed!==true)fail(400,'Подтвердите проверку вопросов и ответов.');
  const path='academyTestSettings/catalog',previous=await store.get(path);await store.commit([store.write(path,{bankVersion:BANK.version,published:body.published,reviewedBy:user.uid,reviewedAt:now},previous)]);return {published:body.published};
 }
 if(action==='start'&&method==='POST')return startAttempt(store,user,body,await store.get('academyTestSettings/catalog'),now);
 if(action==='attempt'&&method==='GET')return publicAttempt((await finalizeExpired(store,await readAttempt(store,params.get('id'),user),now)).data);
 if((action==='save'||action==='submit')&&method==='POST'){
  let record=await readAttempt(store,body.id,user);assertParticipant(record.data,user);
  // Server deadline wins. Answers arriving after it cannot change the score.
  record=await finalizeExpired(store,record,now);
  if(record.data.status!=='active')return publicAttempt(record.data);
  if(body.revision!==record.data.revision)fail(409,'Ответы изменились в другой вкладке. Откройте попытку заново.');
  const answers=sanitizeAnswers(record.data.privateQuestions,body.answers);
  const patch={answers,lastSavedAt:now};
  if(action==='submit')Object.assign(patch,{status:'completed',finishedAt:now,result:grade(record.data.privateQuestions,answers)});
  return publicAttempt((await persistAttempt(store,record,patch)).data);
 }
 if(action==='history'&&method==='GET'){
  const all=params.get('all')==='1';if(all&&!user.reviewer)fail(403,'Доступна только ваша история прохождений.');
  const {rows,more}=await store.history(all?null:user.uid,params.get('cursor'));
  const normalized=[];for(const row of rows){assertOwner(row.data,user);normalized.push(await finalizeExpired(store,row,now))}
  const last=rows.at(-1)?.data;
  return {items:normalized.map(x=>summarize(x.data)),nextCursor:more?b64text({time:last.createdAt,id:last.id}):null};
 }
 fail(404,'Действие теста не найдено.');
}
export async function onRequest({request,env}){
 try{
  if(!['GET','POST'].includes(request.method))return json({error:'Метод не поддерживается.'},405);
  if(request.method==='POST'){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)fail(403,'Запрос с другого сайта запрещён.')}
  const config=credentials(env),store=new Store(config.project,await accessToken(config));
  const user=await identity(request,env,store,config.project),url=new URL(request.url);
  const body=request.method==='POST'?await bodyJson(request):{};
  const data=await handleAction({store,user,action:url.searchParams.get('action')||'catalog',method:request.method,params:url.searchParams,body});
  return json({...data,serverNow:Date.now()});
 }catch(e){if(!(e instanceof HttpError))console.error('Tests API failed:',e?.name);return json({error:e instanceof HttpError?e.message:'Не удалось выполнить действие. Попробуйте ещё раз.'},e.status||500)}
}
