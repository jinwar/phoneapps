const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseDocument,eventsFor,Follower}=require('../piano/score.js');
// DOM fixture generated from practice.musicxml using Python ElementTree.
const hydrate=n=>({...n,getAttribute(k){return this.attrs[k]??null;},children:n.children.map(hydrate)});
function documentFromXML(){return {documentElement:hydrate(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/practice-dom.json'),'utf8'))),getElementsByTagName:()=>[]};}
const xml=fs.readFileSync(path.join(__dirname,'fixtures/practice.musicxml'),'utf8');
test('MusicXML pitch, chords, backup/forward, sustain ties, rests, parts, pickup and transposition',()=>{
 const score=parseDocument(documentFromXML(xml));assert.equal(score.title,'Practice test');assert.equal(score.parts.length,2);assert.equal(score.parts[0].tempo,90);
 const events=eventsFor(score.parts[0]);assert.deepEqual(events.map(e=>e.time),[0,1,2,6]);
 assert.deepEqual(events[0].expected,[60,48]);assert.deepEqual(events[1].expected,[63,67]);assert.deepEqual(events[2].expected,[62]);assert.equal(events[2].notes[0].duration,4);assert.deepEqual(events[3].expected,[]);
 assert.equal(events[3].end,8);assert.match(score.warnings.join(' '),/Repeat/);
 assert.deepEqual(score.parts[1].notes.map(n=>[n.time,n.midi]),[[0,62],[1,64]]);
});
test('invalid XML, unsupported root and unplayable score have actionable errors',()=>{
 assert.throws(()=>parseDocument({getElementsByTagName:()=>[{}]}),/valid XML/);
 assert.throws(()=>parseDocument({getElementsByTagName:()=>[],documentElement:{localName:'score-timewise'}}),/partwise/);
 assert.throws(()=>parseDocument({getElementsByTagName:()=>[],documentElement:{localName:'score-partwise',children:[]}}),/No pitched notes/);
});
test('wrong keys never advance; chords require all correct keys; release clears wrong attempts',()=>{
 const f=new Follower([{expected:[60]},{expected:[62,65]},{expected:[]},{expected:[67]}]);
 assert.equal(f.input([144,61,100]),'wrong');assert.equal(f.index,0);
 assert.equal(f.input([144,60,100]),'wrong');assert.equal(f.index,0);
 f.input([128,61,0]);f.input([128,60,0]);assert.equal(f.input([144,60,100]),'advance');
 assert.equal(f.input([144,62,100]),'partial');assert.equal(f.index,1);
 assert.equal(f.input([144,65,100]),'advance');assert.equal(f.index,3);
 assert.equal(f.input([144,67,100]),'complete');assert.equal(f.index,4);
});
test('jump resets partial chord; note-off and pedal cannot progress; repeated notes need another stroke',()=>{
 const f=new Follower([{expected:[60,64]},{expected:[62]},{expected:[62]}]);f.input([144,60,100]);f.jump(1);
 assert.equal(f.down.size,0);assert.equal(f.input([176,64,127]),'ignore');assert.equal(f.input([144,62,0]),'release');assert.equal(f.index,1);
 assert.equal(f.input([144,62,100]),'advance');assert.equal(f.index,2);assert.equal(f.input([128,62,0]),'release');assert.equal(f.index,2);assert.equal(f.input([144,62,100]),'complete');
});
module.exports={documentFromXML,xml};
