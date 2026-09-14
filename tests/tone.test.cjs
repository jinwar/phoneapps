// Run with: node --test tests/tone.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../tone/app.js'), 'utf8');
function setup({fallback=false, unsupported=false, pending=false}={}) {
  const elements = {};
  for (const id of ['frequency','exact-frequency','frequency-display','volume','volume-display','play','status','audio-info']) {
    elements[id]={value:id==='volume'?'10':'440',validity:{valid:true},attrs:{},listeners:{},textContent:'',
      setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},reportValidity(){return true;}};
  }
  const contexts=[];
  const param=()=>({value:0,events:[],cancelAndHoldAtTime(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v,t){this.value=v;this.events.push([v,t]);}});
  class AudioContext {
    constructor(options){if(fallback&&options)throw new Error('Unsupported sample rate');this.sampleRate=options?.sampleRate||48000;this.state='running';this.currentTime=1;this.oscillators=[];contexts.push(this);}
    addEventListener(){}
    resume(){return pending?new Promise(resolve=>this.finishResume=resolve):Promise.resolve();}
    createOscillator(){const o={frequency:param(),connect(g){return g;},start(){this.started=true;},stop(t){this.stopped=t;},disconnect(){}};this.oscillators.push(o);return o;}
    createGain(){return this.gain={gain:param(),connect(){},disconnect(){}};}
  }
  const document={hidden:false,listeners:{},getElementById:id=>elements[id],body:{classList:{toggle(){}}},addEventListener(k,fn){this.listeners[k]=fn;}};
  const window={AudioContext:unsupported?undefined:AudioContext,addEventListener(){}};
  vm.runInNewContext(source,{document,window});
  return {elements,contexts,document,click:()=>elements.play.listeners.click(),input(id,value){elements[id].value=String(value);elements[id].listeners.input();}};
}
test('no autoplay; sine, full range, live volume and start/stop ramps',async()=>{
 const app=setup();assert.equal(app.contexts.length,0);await app.click();
 const ctx=app.contexts[0],osc=ctx.oscillators[0];
 assert.equal(ctx.sampleRate,96000);assert.equal(osc.type,'sine');assert.equal(osc.frequency.value,440);assert.equal(ctx.gain.gain.value,.1);
 app.input('frequency',0);assert.equal(osc.frequency.value,1);
 app.input('frequency',10000);assert.equal(osc.frequency.value,30000);
 app.input('exact-frequency',1000);assert.equal(osc.frequency.value,1000);
 app.input('volume',0);assert.equal(ctx.gain.gain.value,0);
 app.input('volume',100);assert.equal(ctx.gain.gain.value,1);
 await app.click();assert.equal(ctx.gain.gain.value,0);assert.ok(osc.stopped>ctx.currentTime);
 await app.click();assert.equal(ctx.oscillators.length,2);
 app.document.hidden=true;app.document.listeners.visibilitychange();assert.equal(app.elements.play.attrs['aria-pressed'],'false');assert.ok(ctx.oscillators[1].stopped);
});
test('fallback rejects Nyquist and higher instead of clamping to an incorrect tone',async()=>{
 const app=setup({fallback:true});app.input('exact-frequency',30000);await app.click();
 assert.equal(app.contexts[0].oscillators.length,0);assert.match(app.elements.status.textContent,/24,000/);
 app.input('exact-frequency',440);await app.click();assert.equal(app.elements.play.attrs['aria-pressed'],'true');
 app.input('exact-frequency',24000);assert.equal(app.elements.play.attrs['aria-pressed'],'false');
});
test('pending start can be cancelled; hiding never starts delayed audio',async()=>{
 for(const hidden of [false,true]){
  const app=setup({pending:true});const start=app.click();
  if(hidden){app.document.hidden=true;app.document.listeners.visibilitychange();}else await app.click();
  app.contexts[0].finishResume();await start;assert.equal(app.contexts[0].oscillators.length,0);assert.equal(app.elements.play.attrs['aria-pressed'],'false');
 }
});
test('unsupported audio gives an actionable error',async()=>{
 const app=setup({unsupported:true});await app.click();assert.match(app.elements.status.textContent,/not supported/);assert.equal(app.elements.play.textContent,'Play tone');
});
