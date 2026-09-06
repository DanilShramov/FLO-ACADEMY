const PROJECT_DEFAULT='flo-academy';
const KEY_DEFAULT='AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A';
const COLLECTION='academyTestAttempts';
const encoder=new TextEncoder();
let oauthCache=null;

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
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64text(value){ return b64url(encoder.encode(JSON.stringify(value))); }
function unb64text(value){
  const s=value.replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0))));
}

function credentials(env){
  let data={};
  try{ if(env.FIREBASE_SERVICE_ACCOUNT) data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); }catch{}
  const project=env.FIREBASE_PROJECT_ID||data.project_id||PROJECT_DEFAULT;
  const email=env.FIREBASE_CLIENT_EMAIL||data.client_email;
  const key=(env.FIREBASE_PRIVATE_KEY||data.private_key||'').replace(/\\n/g,'\n');
  if(!email||!key) throw new Error('Firebase server credentials missing');
  return {project,email,key};
}

async function accessToken(config){
  const now=Math.floor(Date.now()/1000);
  const cacheKey=config.project+':'+config.email;
  if(oauthCache?.key===cacheKey&&oauthCache.exp>now+90) return oauthCache.token;

  const pem=config.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const privateKey=await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},
    false,
    ['sign']
  );

  const unsigned=b64text({alg:'RS256',typ:'JWT'})+'.'+b64text({
    iss:config.email,
    scope:'https://www.googleapis.com/auth/datastore',
    aud:'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now+3600
  });

  const signature=new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,encoder.encode(unsigned))
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
  if(!response.ok||!data.access_token) throw new Error('OAuth failed');

  oauthCache={key:cacheKey,token:data.access_token,exp:now+Number(data.expires_in||3600)};
  return data.access_token;
}

function decodeValue(value){
  if(!value) return null;
  if('nullValue' in value) return null;
  if('stringValue' in value) return value.stringValue;
  if('integerValue' in value) return Number(value.integerValue);
  if('doubleValue' in value) return value.doubleValue;
  if('booleanValue' in value) return value.booleanValue;
  if('timestampValue' in value) return value.timestampValue;
  if('arrayValue' in value) return (value.arrayValue.values||[]).map(decodeValue);
  if('mapValue' in value){
    return Object.fromEntries(
      Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decodeValue(v)])
    );
  }
  return null;
}

function decodeDocument(doc){
  const id=doc.name.split('/').pop();
  const data=Object.fromEntries(
    Object.entries(doc.fields||{}).map(([k,v])=>[k,decodeValue(v)])
  );
  return {id,...data};
}

async function getProfile(config,token,uid){
  const r=await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.project)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    {headers:{Authorization:'Bearer '+token}}
  );
  if(!r.ok) return null;
  const doc=await r.json();
  return Object.fromEntries(
    Object.entries(doc.fields||{}).map(([k,v])=>[k,decodeValue(v)])
  );
}

async function identity(request,env,config,googleToken){
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer ')) return null;
  const idToken=authorization.slice(7);

  const response=await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+
      encodeURIComponent(env.FIREBASE_WEB_API_KEY||KEY_DEFAULT),
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idToken})
    }
  );
  const payload=await response.json();
  const account=payload.users?.[0];
  if(!response.ok||!account?.localId||account.disabled) return null;

  const profile=await getProfile(config,googleToken,account.localId);
  if(!profile||profile.active===false) return null;

  return {
    uid:account.localId,
    reviewer:profile.role==='admin'||profile.position==='Управляющий'
  };
}

async function listAllAttempts(config,token){
  const docs=[];
  let pageToken='';
  do{
    const url=new URL(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.project)}/databases/(default)/documents/${COLLECTION}`
    );
    url.searchParams.set('pageSize','300');
    if(pageToken) url.searchParams.set('pageToken',pageToken);

    const r=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token}});
    if(r.status===404) return [];
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||'Firestore list failed');

    for(const d of data.documents||[]) docs.push(decodeDocument(d));
    pageToken=data.nextPageToken||'';
  }while(pageToken);

  return docs;
}

function summarize(a){
  return {
    id:a.id,
    uid:a.uid,
    employeeName:a.employeeName,
    position:a.position,
    testTitle:a.testTitle,
    createdAt:a.createdAt,
    deadline:a.deadline,
    finishedAt:a.finishedAt||null,
    status:a.status,
    score:a.result?.score??null,
    total:10,
    percent:a.result?.percent??null,
    preview:!!a.preview
  };
}

function parseCursor(cursor){
  if(!cursor) return 0;
  try{
    const c=unb64text(cursor);
    return Number.isInteger(c.offset)&&c.offset>=0?c.offset:0;
  }catch{
    return 0;
  }
}

export async function onRequest(context){
  const {request,env}=context;
  const url=new URL(request.url);

  if(url.pathname!=='/api/tests'||url.searchParams.get('action')!=='history'){
    return context.next();
  }

  try{
    const config=credentials(env);
    const googleToken=await accessToken(config);
    const user=await identity(request,env,config,googleToken);
    if(!user) return json({error:'Войдите в аккаунт.'},401);

    const all=url.searchParams.get('all')==='1';
    if(all&&!user.reviewer){
      return json({error:'Доступна только ваша история прохождений.'},403);
    }

    let attempts=await listAllAttempts(config,googleToken);
    if(!all) attempts=attempts.filter(a=>a.uid===user.uid);

    attempts.sort((a,b)=>{
      const ta=Number(a.createdAt)||0;
      const tb=Number(b.createdAt)||0;
      if(tb!==ta) return tb-ta;
      return String(b.id||'').localeCompare(String(a.id||''));
    });

    const offset=parseCursor(url.searchParams.get('cursor'));
    const page=attempts.slice(offset,offset+25);
    const nextOffset=offset+page.length;
    const nextCursor=nextOffset<attempts.length?b64text({offset:nextOffset}):null;

    return json({
      items:page.map(summarize),
      nextCursor,
      serverNow:Date.now()
    });
  }catch(e){
    console.error('Test history middleware failed:',e?.message||e);
    return json({
      error:'Не удалось прочитать историю тестов. Проверьте серверные настройки.'
    },503);
  }
}
