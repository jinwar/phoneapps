const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:344,height:780},hasTouch:true,isMobile:true});
 await context.addInitScript(() => { window.DeviceMotionEvent = class extends Event {}; });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8000/jump-rope/');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/jump-rope.png',fullPage:true});
 await page.click('#start');
 await page.evaluate(()=>{
  const start=performance.now(); let time=start;
  Object.defineProperty(performance,'now',{value:()=>time,configurable:true});
  for(let t=0;t<12000;t+=20){time=start+t;const e=new Event('devicemotion');e.accelerationIncludingGravity={x:0,y:0,z:9.81+(t>=2000?6*Math.sin(2*Math.PI*2*(t-2000)/1000):0)};window.dispatchEvent(e);}
 });
 assert.equal(await page.locator('#count').textContent(),'20');
 await page.click('#start');
 assert.match(await page.locator('#status').textContent(),/Paused/);
 await page.click('#finish');
 assert.match(await page.locator('#status').textContent(),/saved/);
 await page.reload();
 assert.match(await page.locator('#history').textContent(),/20 jumps/);
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('jump-rope-workouts-v1')));
 assert.equal(data.length,1);assert.ok(data[0].durationMs>=11900);assert.ok(data[0].endedAt);
 const downloadPromise=page.waitForEvent('download');await page.click('#export'); const download=await downloadPromise;assert.match(download.suggestedFilename(),/^jump-rope-.*json$/);
 await context.setOffline(true);await page.reload();assert.equal(await page.title(),'Jump Rope');assert.match(await page.locator('#history').textContent(),/20 jumps/);
 await context.setOffline(false);
 await page.evaluate(()=>localStorage.setItem('jump-rope-workouts-v1','bad data'));await page.reload();assert.match(await page.locator('#storageError').textContent(),/could not be read/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('jump-rope-workouts-v1')),'bad data');
 assert.deepEqual(errors,[]);
 console.log('PASS: narrow Fold layout, 20 simulated jumps, pause/save/reload, export, offline reload, corrupt history preservation, no browser exceptions');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
