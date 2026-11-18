import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
async function setup(permission='granted'){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.addInitScript(permission=>{window.DeviceMotionEvent.requestPermission=async()=>permission;window.motionTime=10000;performance.now=()=>window.motionTime;},permission);
 await page.goto('http://localhost:8000/suburi/');await page.waitForFunction(()=>!document.getElementById('start').disabled);return {context,page};
}
async function samples(page,amplitude=24){
 await page.evaluate(amplitude=>{const base=window.motionTime;for(let i=0;i<492;i++){
 window.motionTime=base+i/60*1000;
 const e=new Event('devicemotion');Object.defineProperty(e,'acceleration',{value:{x:0,y:amplitude*Math.sin(2*Math.PI*i/60/.82),z:0}});window.dispatchEvent(e);
 }},amplitude);
}
async function finish(page){await page.click('#stop');await page.waitForFunction(()=>!document.getElementById('start').disabled);}
try{
 await test('live cadence, final report, count-supervised calibration, durable history and complete export',async()=>{
  const {context,page}=await setup(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.click('#start');await samples(page,12);
  await page.waitForTimeout(1400);await finish(page);
  assert.equal(await page.textContent('#count'),'0');
  await page.selectOption('#label-type','jumping');await page.fill('#actual','10');await page.fill('#notes','right pocket, screen inward');await page.click('#calibrate');
  await page.waitForFunction(()=>!document.getElementById('calibrate').disabled);
  assert.match(await page.textContent('#calibration-status'),/Settings updated/);
  assert.match(await page.textContent('#model-info'),/Model 1/);
  assert.match(await page.textContent('#report'),/Actual count/);
  assert.equal(await page.textContent('#count'),'10');
  assert.match(await page.textContent('#calibration-effect'),/0 → 10/);
  assert.match(await page.textContent('#practice-history'),/10/);
  await page.waitForFunction(()=>!document.getElementById('calibration-plots').hidden);
  assert.match(await page.textContent('#threshold-summary'),/14 → 10/);
  assert.equal(await page.evaluate(()=>document.getElementById('practice-history-title').compareDocumentPosition(document.getElementById('calibration-panel')) & Node.DOCUMENT_POSITION_FOLLOWING),4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/suburi-calibration.png',fullPage:true});
  await page.click('#start');await samples(page,12);
  await page.waitForFunction(()=>document.getElementById('count').textContent==='10');
  assert.match(await page.textContent('#chart-summary'),/10 detected swings/);
  assert.equal(await page.locator('#report-panel').isVisible(),false);
  await page.screenshot({path:'/tmp/suburi-live.png',fullPage:true});
  await finish(page);assert.equal(await page.locator('#report-panel').isVisible(),true);
  assert.match(await page.textContent('#report'),/Peak interval cadence/);
  const event=page.waitForEvent('download');await page.click('#download');const file=await event;
  const payload=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(payload.schema,'phoneapps.suburi.dataset');assert.equal(payload.sessions.length,2);
  assert.equal(payload.sessions[0].label.count,10);assert.equal(payload.sessions[0].model.revision,1);assert.equal(payload.sessions[0].originalAnalysis.model.revision,0);assert.equal(payload.sessions[1].model.revision,1);
  assert.equal(payload.sessions[0].statistics.count,10);assert.equal(payload.sessions[0].originalAnalysis.detections.jumping.length,0);assert.equal(payload.sessions[0].calibration.comparison.afterRange,10);assert.equal(payload.sessions[0].samples.length,492);assert.equal(payload.sessions[0].samples[0].length,10);
  assert.equal(payload.sessions[0].samples[0][4],null);assert.equal(payload.sessions[1].statistics.count,10);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.match(await page.textContent('#model-info'),/Model 1/);assert.equal(await page.locator('#history option').count(),2);
  await page.selectOption('#history',payload.sessions[0].id);await page.waitForFunction(()=>!document.getElementById('calibration-plots').hidden);assert.equal(await page.textContent('#count'),'10');assert.match(await page.textContent('#calibration-effect'),/0 → 10/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/suburi-report.png',fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 });
 await test('history retains lifetime counts, ten rows and calibrated recordings plus five recent raw practices',async()=>{
  const {context,page}=await setup();
  await page.evaluate(async()=>{
   const {DEFAULTS,VERSION}=await import('/suburi/detector.mjs');
   const db=await new Promise(r=>{const q=indexedDB.open('suburi-practice-v1',1);q.onsuccess=()=>r(q.result);});
   const tx=db.transaction(['sessions'],'readwrite');
   for(let i=0;i<12;i++){const date=new Date();date.setDate(date.getDate()-11+i);date.setHours(12,0,0,0);tx.objectStore('sessions').put({id:`seed-${i}`,startedAt:date.toISOString(),endedAt:date.toISOString(),type:'auto',duration:10,samples:[[0,0,0,0],[10,0,0,0]],model:{version:VERSION,revision:0,settings:{...DEFAULTS}},detections:{stationary:Array.from({length:i+1},(_,time)=>({time})),jumping:[{time:1},{time:2}]},label:i<2?{type:'stationary',count:i+1,range:[0,10]}:null});}
   await new Promise(r=>tx.oncomplete=r);db.close();
  });
  await page.reload();await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.equal(await page.locator('#practice-history .practice-row').count(),10);
  assert.equal(await page.locator('#history option').count(),7);
  assert.equal(await page.textContent('#lifetime-stationary'),'78');assert.equal(await page.textContent('#lifetime-jumping'),'24');
  assert.match(await page.textContent('#history-range'),/7 days/);
  assert.match(await page.textContent('#history-chart-summary'),/63 forward\/backward suburi and 14 hayasuburi/);
  await page.click('#history-zoom-out');assert.match(await page.textContent('#history-range'),/14 days/);
  await page.click('#history-prev');assert.match(await page.textContent('#history-chart-summary'),/Shown: 0/);
  await page.click('#history-all');assert.match(await page.textContent('#history-chart-summary'),/78 forward\/backward suburi and 24 hayasuburi/);
  await page.click('#history-week');assert.match(await page.textContent('#history-range'),/7 days/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('[aria-labelledby="practice-history-title"]').screenshot({path:'/tmp/suburi-history-retention.png'});
  const download=page.waitForEvent('download');await page.click('#download');const file=await download;const data=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(data.practiceSummaries.length,12);assert.equal(data.sessions.length,7);
  assert.deepEqual(data.sessions.filter(s=>s.label).map(s=>s.id).sort(),['seed-0','seed-1']);
  assert.deepEqual(data.sessions.filter(s=>!s.label).map(s=>Number(s.id.slice(5))).sort((a,b)=>a-b),[7,8,9,10,11]);
  // Updating an existing summary replaces its count instead of adding it twice.
  await page.evaluate(async()=>{const {openDatabase,readAll,save}=await import('/suburi/storage.mjs?v=1.2.0');const db=await openDatabase();const data=await readAll(db);const s=data.sessions.find(s=>s.id==='seed-0');s.detections.stationary.push({time:3});await save(db,s,null);db.close();});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('start').disabled);assert.equal(await page.textContent('#lifetime-stationary'),'79');assert.equal(await page.locator('#history option').count(),7);
  await context.close();
 });
 await test('failed retention transaction keeps original raw recordings and summaries',async()=>{
  const {context,page}=await setup();
  const result=await page.evaluate(async()=>{
   const {openDatabase,readAll,save}=await import('/suburi/storage.mjs?v=1.2.0');const db=await openDatabase();
   const tx=db.transaction('sessions','readwrite');for(let i=0;i<7;i++)tx.objectStore('sessions').put({id:`abort-${i}`,startedAt:new Date(2026,0,i+1).toISOString(),duration:10,type:'auto',detections:{stationary:[{time:1}],jumping:[]}});
   await new Promise(r=>tx.oncomplete=r);
   const original=IDBObjectStore.prototype.delete;let rejected=false;
   // Abort once so the handler can finish without issuing requests after abort.
   IDBObjectStore.prototype.delete=function(key){IDBObjectStore.prototype.delete=original;const request=original.call(this,key);request.onsuccess=()=>this.transaction.abort();return request;};
   try{await save(db,null,null);}catch{rejected=true;}finally{IDBObjectStore.prototype.delete=original;}
   const data=await readAll(db);db.close();return {rejected,count:data.sessions.length,summaries:data.summaries.length};
  });
  assert.deepEqual(result,{rejected:true,count:7,summaries:0});await context.close();
 });
 await test('permission denial and sensor timeout preserve usable controls',async()=>{
  const {context,page}=await setup('denied');await page.click('#start');assert.match(await page.textContent('#status'),/permission denied/i);assert.equal(await page.locator('#stop').isDisabled(),true);await context.close();
  const next=await setup();await next.page.click('#start');await next.page.evaluate(()=>{window.motionTime+=6000;});
  await next.page.waitForFunction(()=>document.getElementById('status').textContent.includes('No valid linear'));
  assert.equal(await next.page.locator('#download').isEnabled(),true);await next.context.close();
 });
 await test('hidden page stops and unsupported labels preserve export without direct Drive controls',async()=>{
  const {context,page}=await setup();await page.click('#start');await samples(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.match(await page.textContent('#status'),/page was hidden/);assert.equal(await page.locator('#type').count(),0);
  await page.selectOption('#label-type','forward');
  await page.fill('#actual','10');await page.click('#calibrate');await page.waitForFunction(()=>!document.getElementById('calibrate').disabled);
  assert.match(await page.textContent('#calibration-status'),/does not yet have/);assert.match(await page.textContent('#model-info'),/Model 0/);
  assert.equal(await page.locator('#drive,#drive-link,#client-id,script[src="config.js"]').count(),0);
  assert.equal(await page.locator('#download').isEnabled(),true);assert.equal(await page.locator('#share').isEnabled(),true);await context.close();
 });
 await test('bad time range is rejected and storage failures keep export available',async()=>{
  const {context,page}=await setup();await page.click('#start');await samples(page);await finish(page);
  await page.selectOption('#label-type','jumping');await page.fill('#actual','10');await page.fill('#range-end','999');await page.click('#calibrate');assert.match(await page.textContent('#calibration-status'),/valid time range/);
  await page.fill('#range-end','8');
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=()=>{throw Error('Quota exhausted');};});
  await page.click('#calibrate');await page.waitForFunction(()=>!document.getElementById('calibrate').disabled);assert.match(await page.textContent('#storage-status'),/Could not save/);assert.equal(await page.locator('#download').isEnabled(),true);await context.close();
 });
 await test('text sharing avoids JSON-only attachments; permission denial leaves download usable',async()=>{
  const {context,page}=await setup();await page.click('#start');await samples(page);await finish(page);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{value:({files})=>files[0].type==='text/plain',configurable:true});
    Object.defineProperty(navigator,'share',{value:async({files})=>{window.shared={name:files[0].name,type:files[0].type,data:JSON.parse(await files[0].text())};},configurable:true});
  });
  await page.click('#share');await page.waitForFunction(()=>window.shared);
  const shared=await page.evaluate(()=>window.shared);assert.match(shared.name,/\.json\.txt$/);assert.equal(shared.data.schema,'phoneapps.suburi.dataset');assert.equal(shared.data.sessions[0].type,'auto');
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{value:async()=>{throw new DOMException('Permission denied','NotAllowedError');},configurable:true});});
  await page.click('#share');await page.waitForFunction(()=>document.getElementById('export-status').textContent.includes('denied file sharing'));
  assert.equal(await page.locator('#download').isEnabled(),true);await context.close();
 });
 await test('v1 upgrade preserves old practices and labels while new practices are automatic',async()=>{
  const {context,page}=await setup();await page.click('#start');await samples(page);await finish(page);
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('suburi-practice-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
    const tx=db.transaction(['sessions','settings'],'readwrite');
    const store=tx.objectStore('sessions'),req=store.getAll();
    req.onsuccess=()=>{const s=req.result[0];s.type='jumping';s.model.version='suburi-1.0.0';s.model.revision=3;s.label={type:'jumping',count:10,range:[0,8],predictedBefore:10};store.put(s);tx.objectStore('settings').put(s.model,'model');};
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  });
  await page.reload();await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.equal(await page.locator('#history option').count(),1);assert.match(await page.textContent('#model-info'),/Model 4/);assert.equal(await page.inputValue('#actual'),'10');
  assert.match(await page.textContent('#report-note'),/revision 3/);assert.equal(await page.locator('#type').count(),0);
  const event=page.waitForEvent('download');await page.click('#download');const file=await event;const data=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(data.model.previousModel.version,'suburi-1.0.0');assert.equal(data.sessions[0].label.count,10);
  await context.close();
 });

}finally{await browser.close();}
