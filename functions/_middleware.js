// FLO Academy 1.0076
export async function onRequest(context){
 const response=await context.next();const headers=new Headers(response.headers);
 headers.set('X-FLO-Version','1.0076');
 if((headers.get('content-type')||'').includes('text/html'))headers.set('Cache-Control','no-cache, max-age=0, must-revalidate');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
