// FLO Academy release 1.0062
const RELEASE_VERSION='1.0062';

export async function onRequest(context){
  const response=await context.next();
  const headers=new Headers(response.headers);
  headers.set('X-FLO-Version', RELEASE_VERSION);

  const ct=response.headers.get('content-type')||'';
  if(!ct.includes('text/html')){
    return new Response(response.body,{
      status:response.status,
      statusText:response.statusText,
      headers
    });
  }

  let text=await response.text();
  text=text.replace(/const APP_VERSION="[^"]+";/, `const APP_VERSION="${RELEASE_VERSION}";`);

  const scripts=`<script src="/release-version.js?v=${RELEASE_VERSION}"></script>
<script src="/test-upgrade.js?v=${RELEASE_VERSION}"></script>
<script src="/results-filter.js?v=${RELEASE_VERSION}"></script>
<script type="module">`;

  const injected=text.replace('<script type="module">', scripts);
  headers.delete('content-length');

  return new Response(injected,{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}
