(function(root) {
'use strict';
const children=(node,name)=>Array.from(node.children || []).filter(n=>n.localName===name);
const one=(node,name)=>children(node,name)[0];
const text=(node,name,fallback='')=>one(node,name)?.textContent?.trim() || fallback;
const num=(node,name,fallback=0)=>Number(text(node,name,String(fallback)));
function parseDocument(doc) {
 if (doc.getElementsByTagName('parsererror').length) throw Error('This file is not valid XML.');
 const root=doc.documentElement;
 if(root.localName!=='score-partwise') throw Error('Please export as partwise MusicXML (.mxl, .musicxml, or .xml).');
 const list=one(root,'part-list');
 const names=new Map(children(list || {},'score-part').map(p=>[p.getAttribute('id'),text(p,'part-name','Part')]));
 let count=0;
 const warnings=new Set();
 const parts=children(root,'part').map((part,partIndex)=>{
  let divisions=1, beats=4, transpose=0, base=0, tempo=100;
  const notes=[], rests=[], ties=new Map(), measureTimes=[];
  const measures=children(part,'measure');
  measures.forEach((measure,mi)=>{
   let position=0,lastStart=0,max=0;
   for(const item of Array.from(measure.children)) {
    const tag=item.localName;
    if(tag==='attributes') {
     divisions=num(item,'divisions',divisions);
     if(!(divisions>0)) throw Error('MusicXML divisions must be positive.');
     const time=one(item,'time');
     if(time){const b=text(time,'beats','4').split('+').reduce((sum,v)=>sum+Number(v),0);beats=b*4/num(time,'beat-type',4);}
     const tr=one(item,'transpose');if(tr)transpose=num(tr,'chromatic')+12*num(tr,'octave-change');
    }
    if(tag==='direction') {
     const sound=one(item,'sound');
     const t=Number(sound?.getAttribute('tempo'));
     if(t>0){if(base===0 && position===0)tempo=t;else warnings.add('Tempo changes are replaced by the selected practice tempo.');}
    }
    if(tag==='barline' && one(item,'repeat')) warnings.add('Repeat signs are not repeated automatically; tap a note to return.');
    if(tag==='backup' || tag==='forward') {position+=(tag==='backup'?-1:1)*num(item,'duration')/divisions;position=Math.max(0,position);max=Math.max(max,position);}
    if(tag!=='note')continue;
    if(one(item,'grace') || one(item,'cue')){warnings.add('Grace and cue notes are displayed but skipped during practice and demonstration.');continue;}
    const duration=num(item,'duration')/divisions;
    if(!Number.isFinite(duration)||duration<=0)throw Error('A note has an invalid or missing duration.');
    const start=one(item,'chord')?lastStart:position;
    if(!one(item,'chord')){lastStart=start;position+=duration;}
    max=Math.max(max,start+duration);
    const pitch=one(item,'pitch');
    const staff=num(item,'staff',1);
    const record={time:base+start,duration,measure:measure.getAttribute('number') || String(mi+1),measureIndex:mi,staff};
    if(one(item,'rest')){rests.push(record);continue;}
    if(!pitch){warnings.add('Unpitched percussion notes are omitted.');continue;}
    const step=text(pitch,'step');const octave=num(pitch,'octave',NaN), alter=num(pitch,'alter');
    const pc={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step];
    const midi=(octave+1)*12+pc+alter+transpose;
    if(!Number.isInteger(midi)||midi<0||midi>127)throw Error('This score contains pitches outside standard MIDI notes (0–127), or microtones.');
    const key=`${text(item,'voice','1')}:${staff}:${midi}`;
    const types=children(item,'tie').map(n=>n.getAttribute('type'));
    const previous=ties.get(key);
    if(types.includes('stop') && previous && Math.abs(previous.time+previous.duration-record.time)<.00001) {
     previous.duration+=duration;
     if(!types.includes('start'))ties.delete(key);
    } else {
     const n={...record,midi};notes.push(n);
     if(types.includes('start'))ties.set(key,n);else ties.delete(key);
    }
    if(++count>20000)throw Error('This score is too large. Please export a shorter section (under 20,000 notes).');
   }
   const start=base;
   base+=Math.max(max,measure.getAttribute('implicit')==='yes'?0:beats);
   measureTimes.push({start,end:base});
  });
  return {name:names.get(part.getAttribute('id')) || `Part ${partIndex+1}`,notes,rests,measures:measureTimes,end:base,tempo};
 });
 if(!parts.some(p=>p.notes.length))throw Error('No pitched notes were found in this score.');
 return {title:text(one(root,'work') || {},'work-title',text(root,'movement-title','Untitled score')),parts,warnings:[...warnings]};
}
function eventsFor(part) {
 const groups=new Map();
 const get=n=>{const key=Math.round(n.time*100000);if(!groups.has(key))groups.set(key,{time:n.time,measure:n.measure,measureIndex:n.measureIndex,notes:[]});return groups.get(key);};
 for(const n of part.notes)get(n).notes.push(n);
 // Show true silent gaps, not voice rests underneath another sounding voice.
 for(const r of part.rests)if(!part.notes.some(n=>n.time<=r.time+.00001 && n.time+n.duration>r.time+.00001))get(r);
 const events=[...groups.values()].sort((a,b)=>a.time-b.time);
 events.forEach((e,i)=>{e.end=events[i+1]?.time ?? part.end;e.expected=[...new Set(e.notes.map(n=>n.midi))];});
 return events;
}
class Follower {
 constructor(events){this.events=events;this.index=0;this.down=new Map();this.skipRests();}
 skipRests(){while(this.index<this.events.length&&!this.events[this.index].expected.length)this.index++;}
 jump(index){this.index=Math.max(0,Math.min(this.events.length,index));this.down.clear();}
 input([status,note,velocity]){
  const type=status&240,key=`${status&15}:${note}`;
  if(type===128||(type===144&&velocity===0)){this.down.delete(key);return 'release';}
  if(type!==144||!velocity)return 'ignore';
  if(this.down.has(key))return 'held';
  this.down.set(key,note);this.skipRests();
  const e=this.events[this.index];if(!e)return 'complete';
  const expected=e.expected, played=new Set(this.down.values());
  if(!expected.includes(note)||[...played].some(n=>!expected.includes(n)))return 'wrong';
  if(expected.every(n=>played.has(n))){this.index++;this.down.clear();this.skipRests();return this.index===this.events.length?'complete':'advance';}
  return 'partial';
 }
}
const api={parseDocument,eventsFor,Follower};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PianoScore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
