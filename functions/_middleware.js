// FLO Academy release 1.0069
const RELEASE_VERSION='1.0069';

export async function onRequest(context){
  const response=await context.next();
  const headers=new Headers(response.headers);
  headers.set('X-FLO-Version',RELEASE_VERSION);

  const ct=response.headers.get('content-type')||'';
  if(!ct.includes('text/html')){
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }

  let text=await response.text();

  text=text.replace(
    /<script>\s*window\.__FLO_RELEASE_VERSION__\s*=\s*["'][^"']+["'];?\s*<\/script>\s*/g,''
  );
  text=text.replace(
    /<script\s+src=["']\/(?:test-upgrade|results-filter|release-version|learning-ui|tips|inventory)\.js\?v=[^"']+["']><\/script>\s*/g,''
  );
  text=text.replace(
    /const\s+APP_VERSION\s*=\s*["'][^"']+["']\s*;/,
    `const APP_VERSION="${RELEASE_VERSION}";`
  );
  text=text.replace(/(staff-learning\.css\?v=)[^"'&<>\s]+/g,`$1${RELEASE_VERSION}`);
  text=text.replace(/(staff-learning\.js\?v=)[^"'&<>\s]+/g,`$1${RELEASE_VERSION}`);

  if(!text.includes('window.__floStaffStartPromise=staff.start()')){
    text=text.replace(
      'show("employeeView");showEmployeePage("home");',
      'show("employeeView");showEmployeePage("home");window.__floStaffStartPromise=staff.start();'
    );
    text=text.replace(
      'await staff.start();staffReady=true;',
      'await (window.__floStaffStartPromise||staff.start());window.__floStaffStartPromise=null;staffReady=true;'
    );
  }

  text=text.replace(
    'const library=await getEmployeeLibrary(true);\n      await loadEmployeeSections();\n      await loadEmployeeMaterialsUpdatedAt(library.items);',
    'const library=await getEmployeeLibrary(true);\n      await Promise.all([loadEmployeeSections(),loadEmployeeMaterialsUpdatedAt(library.items)]);'
  );

  const scripts=`<script>window.__FLO_RELEASE_VERSION__="${RELEASE_VERSION}";</script>
<script src="/test-upgrade.js?v=${RELEASE_VERSION}"></script>
<script src="/results-filter.js?v=${RELEASE_VERSION}"></script>
<script src="/release-version.js?v=${RELEASE_VERSION}"></script>
<script src="/tips.js?v=${RELEASE_VERSION}"></script>
<script src="/inventory.js?v=${RELEASE_VERSION}"></script>
<script src="/learning-ui.js?v=${RELEASE_VERSION}"></script>
<script type="module">`;

  const injected=text.replace('<script type="module">',scripts);
  headers.delete('content-length');
  headers.set('Cache-Control','no-store, max-age=0');

  return new Response(injected,{status:response.status,statusText:response.statusText,headers});
}
