const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {documentFromXML,xml}=require('./score.test.cjs');
function setup(){
 const elements={},scheduled=[];
 function el(){return {value:'',children:[],dataset:{},attrs:{},listeners:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(n,f){this.listeners[n]=f;},scrollIntoView(){},click(){this.clicked=true;this.listeners.click?.();}};}
 const document={hidden:false,listeners:{},getElementById(id){return elements[id] ||= el();},createElement:el,createElementNS:el,addEventListener(n,f){this.listeners[n]=f;}};
 let audio;
 class AudioContext{constructor(){audio=this;this.currentTime=0;}async resume(){}createOscillator(){const o={frequency:{},connect(dest){return dest;},start(time){scheduled.push({frequency:this.frequency.value,time,osc:this});},stop(){this.stopped=true;},disconnect(){}};return o;}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
 const window={AudioContext,addEventListener(){}};
 const intervals=new Map();let serial=0;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../piano/practice.js'),'utf8'),{window,document,PianoMidi:require('../piano/midi.js'),PianoScore:require('../piano/score.js'),DOMParser:class {parseFromString(){return documentFromXML();}},setInterval(fn){intervals.set(++serial,fn);return serial;},clearInterval(id){intervals.delete(id);}});
 return {window,elements,document,scheduled,intervals,get audio(){return audio;},click(id){return elements[id].listeners.click();},async load(){await elements['score-file'].listeners.change({target:{files:[{name:'test.musicxml',size:xml.length,async text(){return xml;}}]}});await new Promise(setImmediate);}};
}
test('load creates tappable score, gates practice on connection, and Drive opens the document picker',async()=>{
 const a=setup();await a.load();assert.equal(a.elements['score-title'].textContent,'Practice test');assert.equal(a.elements['score-notes'].children.length,4);assert.equal(a.elements.practice.disabled,true);
 a.click('open-drive');assert.equal(a.elements['score-file'].clicked,true);assert.match(a.elements['practice-message'].textContent,/Google Drive/);
 a.window.PianoPractice.setConnected(true);assert.equal(a.elements.practice.disabled,false);
 a.click('practice');a.window.PianoPractice.receive([144,61,100]);assert.match(a.elements['practice-message'].textContent,/Wrong key/);assert.equal(a.elements.progress.textContent,'1 / 4');
 a.elements['score-notes'].children[2].listeners.click();assert.match(a.elements.target.textContent,/D4/);
 a.window.PianoPractice.receive([144,62,100]);assert.match(a.elements.progress.textContent,/Complete/);
});
test('demo schedules pitch and durations, advances highlight and stops all sound',async()=>{
 const a=setup();await a.load();await a.click('demo');assert.equal(a.elements.demo.textContent,'■ Stop demonstration');assert.equal(a.scheduled.length,4);
 assert.ok(a.scheduled.some(n=>Math.abs(n.frequency-261.625565)<.001));
 a.audio.currentTime=1;for(const f of a.intervals.values())f();assert.equal(a.elements.progress.textContent,'2 / 4');
 await a.click('demo');assert.equal(a.intervals.size,0);assert.ok(a.scheduled.every(n=>n.osc.stopped));
});
test('disconnect pauses practice; hiding page stops demo',async()=>{
 const a=setup();await a.load();a.window.PianoPractice.setConnected(true);a.click('practice');a.window.PianoPractice.setConnected(false);assert.equal(a.elements.practice.textContent,'Practice with keyboard');
 await a.click('demo');a.document.hidden=true;a.document.listeners.visibilitychange();assert.equal(a.intervals.size,0);assert.equal(a.elements.demo.textContent,'▶ Demonstrate');
});
