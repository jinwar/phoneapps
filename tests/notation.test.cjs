const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const el=()=>({style:{},children:[],listeners:{},attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(...v){this.children=v;},addEventListener(k,v){this.listeners[k]=v;},getBoundingClientRect(){return {left:0,top:0,right:620,bottom:300};},scrollIntoView(){this.scrolled=true;}});
 const host=el();host.parentElement=el();let display;const jumps=[];
 function measure(y,xs){const staff={PositionAndShape:{AbsolutePosition:{y}},StaffHeight:4,Measures:[]},system={StaffLines:[staff]};const m={isVisible:()=>true,ParentMusicSystem:system,ParentStaffLine:staff,PositionAndShape:{AbsolutePosition:{x:1},Size:{width:30}},staffEntries:xs.map(([beat,x])=>({relInMeasureTimestamp:{RealValue:beat/4},PositionAndShape:{AbsolutePosition:{x}}}))};staff.Measures=[m];return m;}
 class OSMD{constructor(){display=this;this.Sheet={Instruments:[{},{}]};this.Zoom=1;this.GraphicSheet={MeasureList:[[measure(5,[[0,5],[1,10],[2,20]])],[measure(25,[[0,4],[2,15]])]]};}async load(xml){this.xml=xml;}render(){this.rendered=true;}}
 const context={document:{createElement:el},opensheetmusicdisplay:{OpenSheetMusicDisplay:OSMD}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../piano/notation.js'),'utf8'),context);
 const notation=new context.PianoNotation(host,index=>jumps.push(index));
 const part={measures:[{start:0,end:4},{start:4,end:8}]},events=[{time:0},{time:1},{time:2},{time:6}];
 return {notation,host,part,events,jumps,get display(){return display;}};
}
test('full score rendering keeps original XML and shows selected instrument',async()=>{const a=setup();await a.notation.load('<score-partwise/>',1,a.part,a.events);assert.equal(a.display.xml,'<score-partwise/>');assert.equal(a.display.Sheet.Instruments[0].Visible,false);assert.equal(a.display.Sheet.Instruments[1].Visible,true);assert.equal(a.display.rendered,true);assert.equal(a.notation.points.length,7);});
test('cursor interpolates during playback, follows systems and remains on target in practice',async()=>{const a=setup();await a.notation.load('xml',0,a.part,a.events);a.notation.position(0,.5);assert.equal(a.notation.line.style.left,'75px');a.notation.position(0);assert.equal(a.notation.line.style.left,'50px');a.notation.position(2,4);assert.equal(a.notation.line.style.left,'40px');assert.equal(a.notation.line.style.top,'242px');a.notation.position(4);assert.equal(a.notation.line.style.left,'310px');});
test('tap and keyboard navigation jump to score events, including tied continuations',async()=>{const a=setup();await a.notation.load('xml',0,a.part,a.events);a.host.listeners.click({clientX:42,clientY:260});assert.equal(a.jumps.at(-1),2);a.host.listeners.click({clientX:151,clientY:260});assert.equal(a.jumps.at(-1),3);a.host.listeners.keydown({key:'End',preventDefault(){}});assert.equal(a.jumps.at(-1),3);});
