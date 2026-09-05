
async function verifyFirebaseUser(request, env) {
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new Response(JSON.stringify({error:"Unauthorized"}), {status:401, headers:{"content-type":"application/json"}});
  const apiKey = "AIzaSyDm4TBEVuiv-d1y64WvimmVeWE9G-xb9-A";
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({idToken:token})
  });
  const j = await r.json();
  const u = j.users?.[0];
  if (!u) throw new Response(JSON.stringify({error:"Unauthorized"}), {status:401, headers:{"content-type":"application/json"}});
  return {uid:u.localId,email:u.email||""};
}
async function getGoogleToken(env){
  const now=Math.floor(Date.now()/1000);
  const header={alg:"RS256",typ:"JWT"};
  const payload={iss:env.FIREBASE_CLIENT_EMAIL,scope:"https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600};
  const enc=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const data=`${enc(header)}.${enc(payload)}`;
  const pem=env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const bin=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey("pkcs8",bin.buffer,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(data)));
  const jwt=`${data}.${btoa(String.fromCharCode(...sig)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}`;
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});
  const j=await r.json();
  if(!j.access_token) throw new Error("Google token error");
  return j.access_token;
}
async function firestoreGet(env,path){
  const token=await getGoogleToken(env);
  const r=await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`,{headers:{Authorization:`Bearer ${token}`}});
  if(r.status===404)return null;
  if(!r.ok)throw new Error("Firestore read failed");
  return r.json();
}
function fsString(v){return v?.stringValue??""}
function fsArrayStrings(v){return (v?.arrayValue?.values||[]).map(x=>x.stringValue||"")}
async function requireAdmin(user,env){
  const d=await firestoreGet(env,`users/${user.uid}`);
  if(!d || fsString(d.fields?.role)!=="admin") throw new Response(JSON.stringify({error:"Forbidden"}),{status:403,headers:{"content-type":"application/json"}});
}

export async function onRequestGet({request, env}) {
  try{
    const user=await verifyFirebaseUser(request,env);
    const u=new URL(request.url), id=u.searchParams.get("id");
    if(!id) return Response.json({error:"id required"},{status:400});
    const mat=await firestoreGet(env,`materialItems/${id}`);
    if(!mat) return Response.json({error:"Not found"},{status:404});
    const f=mat.fields||{};
    const folderId=fsString(f.folderId), storagePath=fsString(f.storagePath), fileName=fsString(f.fileName)||"material";
    if(!storagePath) return Response.json({error:"Missing storage path"},{status:404});
    const userDoc=await firestoreGet(env,`users/${user.uid}`);
    const role=fsString(userDoc?.fields?.role);
    let allowed=role==="admin";
    if(!allowed){
      const position=fsString(userDoc?.fields?.position);
      const folder=await firestoreGet(env,`materialSections/${folderId}`);
      if(!folder) return Response.json({error:"Folder not found"},{status:404});
      const access=fsArrayStrings(folder.fields?.allowedPositions);
      allowed=!access.length || access.includes(position);
    }
    if(!allowed) return Response.json({error:"Forbidden"},{status:403});
    const url=`${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
    const r=await fetch(url,{headers:{Authorization:`Bearer ${env.SUPABASE_SECRET_KEY}`,apikey:env.SUPABASE_SECRET_KEY}});
    if(!r.ok) return Response.json({error:"File fetch failed"},{status:r.status});
    const headers=new Headers(r.headers);
    const download=new URL(request.url).searchParams.get("download")==="1";
    headers.set("content-disposition",`${download?"attachment":"inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    headers.set("cache-control","private, max-age=60");
    return new Response(r.body,{status:200,headers});
  }catch(e){
    if(e instanceof Response)return e;
    return Response.json({error:e?.message||"Fetch failed"},{status:500});
  }
}
