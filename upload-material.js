
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

export async function onRequestPost({request, env}) {
  try{
    const user=await verifyFirebaseUser(request,env);
    await requireAdmin(user,env);
    const form=await request.formData();
    const file=form.get("file");
    const folderId=String(form.get("folderId")||"");
    if(!file || typeof file==="string") return Response.json({error:"File required"},{status:400});
    if(!folderId) return Response.json({error:"folderId required"},{status:400});
    if(file.size>50*1024*1024) return Response.json({error:"File too large"},{status:400});
    const id=crypto.randomUUID();
    const safeName=file.name.replace(/[^\p{L}\p{N}._ -]+/gu,"_");
    const storagePath=`${folderId}/${id}-${safeName}`;
    const url=`${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
    const r=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${env.SUPABASE_SECRET_KEY}`,apikey:env.SUPABASE_SECRET_KEY,"content-type":file.type||"application/octet-stream","x-upsert":"false"},body:await file.arrayBuffer()});
    if(!r.ok) return Response.json({error:`Storage upload failed: ${await r.text()}`},{status:502});
    return Response.json({ok:true,id,fileName:file.name,storagePath,contentType:file.type||"",size:file.size});
  }catch(e){
    if(e instanceof Response)return e;
    return Response.json({error:e?.message||"Upload failed"},{status:500});
  }
}
