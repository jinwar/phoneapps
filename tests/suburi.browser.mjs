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
  await page.selectOption('#type','jumping');await page.click('#start');await samples(page,12);
  await page.waitForTimeout(1400);await finish(page);
  assert.equal(await page.textContent('#count'),'0');
  await page.fill('#actual','10');await page.fill('#notes','right pocket, screen inward');await page.click('#calibrate');
  await page.waitForFunction(()=>!document.getElementById('calibrate').disabled);
  assert.match(await page.textContent('#calibration-status'),/Settings updated/);
  assert.match(await page.textContent('#model-info'),/Model 1/);
  assert.match(await page.textContent('#report'),/Actual count/);
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
  assert.equal(payload.sessions[0].label.count,10);assert.equal(payload.sessions[0].model.revision,0);assert.equal(payload.sessions[1].model.revision,1);
  assert.equal(payload.sessions[0].samples.length,492);assert.equal(payload.sessions[0].samples[0].length,10);
  assert.equal(payload.sessions[0].samples[0][4],null);assert.equal(payload.sessions[1].statistics.count,10);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.match(await page.textContent('#model-info'),/Model 1/);assert.equal(await page.locator('#history option').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/suburi-report.png',fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 });
 await test('permission denial and sensor timeout preserve usable controls',async()=>{
  const {context,page}=await setup('denied');await page.click('#start');assert.match(await page.textContent('#status'),/permission denied/i);assert.equal(await page.locator('#stop').isDisabled(),true);await context.close();
  const next=await setup();await next.page.click('#start');await next.page.evaluate(()=>{window.motionTime+=6000;});
  await next.page.waitForFunction(()=>document.getElementById('status').textContent.includes('No valid linear'));
  assert.equal(await next.page.locator('#download').isEnabled(),true);await next.context.close();
 });
 await test('hidden page stops, forward labels do not pretend to train a detector, Drive uploads correct JSON',async()=>{
  const {context,page}=await setup();await page.selectOption('#type','forward');await page.click('#start');await samples(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.match(await page.textContent('#status'),/page was hidden/);assert.equal(await page.textContent('#count'),'—');
  await page.fill('#actual','10');await page.click('#calibrate');await page.waitForFunction(()=>!document.getElementById('calibrate').disabled);
  assert.match(await page.textContent('#calibration-status'),/does not yet have/);assert.match(await page.textContent('#model-info'),/Model 0/);
  await page.evaluate(()=>{window.google={accounts:{oauth2:{initTokenClient(opts){window.scope=opts.scope;return {requestAccessToken(){opts.callback({access_token:'test'});}};}}}};});
  await page.click('summary');await page.fill('#client-id','test.apps.googleusercontent.com');let calls=0;
  await page.route('https://www.googleapis.com/upload/**',async route=>{calls++;assert.equal(route.request().headers().authorization,'Bearer test');assert.match(route.request().postData(),/phoneapps.suburi.dataset/);assert.match(route.request().postData(),/linear_x/);await route.fulfill({status:calls===1?200:403,contentType:'application/json',body:calls===1?'\{"id":"test-suburi"\}':'{}'});});
  await page.click('#drive');await page.locator('#drive-link').waitFor({state:'visible'});assert.equal(await page.locator('#drive-link').getAttribute('href'),'https://drive.google.com/file/d/test-suburi/view');
  assert.equal(await page.evaluate(()=>window.scope),'https://www.googleapis.com/auth/drive.file');
  await page.click('#drive');await page.waitForFunction(()=>document.getElementById('export-status').textContent.includes('403'));assert.equal(await page.locator('#download').isEnabled(),true);await context.close();
 });
 await test('bad time range is rejected and storage failures keep export available',async()=>{
  const {context,page}=await setup();await page.selectOption('#type','jumping');await page.click('#start');await samples(page);await finish(page);
  await page.fill('#actual','10');await page.fill('#range-end','999');await page.click('#calibrate');assert.match(await page.textContent('#calibration-status'),/valid time range/);
  await page.fill('#range-end','8');
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=()=>{throw Error('Quota exhausted');};});
  await page.click('#calibrate');await page.waitForFunction(()=>!document.getElementById('calibrate').disabled);assert.match(await page.textContent('#storage-status'),/Could not save/);assert.equal(await page.locator('#download').isEnabled(),true);await context.close();
 });
}finally{await browser.close();}
