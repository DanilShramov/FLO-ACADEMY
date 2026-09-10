export function versionOf(material,meta={}) {
  const v=material.updatedAt;
  const raw=v||material.createdAt;
  const stamp=raw?.toMillis?raw.toMillis():raw?.seconds?raw.seconds*1000:typeof raw==='string'?Date.parse(raw):raw;
  return String(Number.isFinite(stamp)?stamp:material.storagePath||material.id)+'@'+(meta.revision||1);
}
export function accessible(material,sections,position){
  if(material.archived)return false;
  let id=material.folderId;const seen=new Set();
  while(id){
    if(seen.has(id))return false;seen.add(id);
    const folder=sections.find(s=>s.id===id);
    if(!folder||folder.archived||folder.isArchive)return false;
    if(folder.allowedPositions?.length&&!folder.allowedPositions.includes(position))return false;
    id=folder.parentId;
  }
  return true;
}
export function assigned(item,position){return item.active!==false&&(!item.positions?.length||item.positions.includes(position))}
export function acknowledged(material,meta,progress){return progress?.ackVersion===versionOf(material,meta)}
export function routeState(route,materials,metadata,progress,test){
  const required=route.materialIds||[];
  const done=required.filter(id=>{const m=materials.find(x=>x.id===id);return m&&acknowledged(m,metadata[id],progress[id])}).length;
  const testDone=!route.testRequired||!!(test?.passed&&test.finishedAt>=(route.assignedAt||0));
  const total=required.length+(route.testRequired?1:0);
  const completed=done+(route.testRequired&&testDone?1:0);
  return {done:completed,total,complete:total>0&&completed===total,percent:total?Math.round(completed/total*100):0};
}
export function localDay(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(now)}
export function testStatus(a){
 if(a.status==='active')return 'Не завершён';
 if(a.mode==='attestation')return a.passed===true||a.result?.passed===true?'Пройден':'Не пройден';
 return 'Практика завершена';
}
