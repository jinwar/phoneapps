import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULTS,detect,calibrate,preprocess,normalizeWindow,validSettings} from '../suburi/detector.mjs';
import {cadence,statistics} from '../suburi/stats.mjs';
const templates=JSON.parse(fs.readFileSync(new URL('../suburi/templates.json',import.meta.url)));
const wave=(amplitude=24,n=10)=>Array.from({length:Math.round(n*.82*60)},(_,i)=>[i/60,0,amplitude*Math.sin(2*Math.PI*i/60/.82),0]);
test('continuous samples are resampled; invalid data and sensor gaps split segments',()=>{
 const s=preprocess([[0,1,2,3],[.02,1,2,3],[.04,1,2,3],[.6,1,2,3],[.62,1,2,3],[.63,NaN,1,2],[.7,1,2,3],[.72,1,2,3]]);
 assert.equal(s.length,3);assert.ok(s.every(segment=>segment.every(r=>r.every(Number.isFinite))));
 assert.equal(preprocess([[0,1,2,3],[.01,1,2,3],[.005,1,2,3]]).length,2);
});
test('normalized multi-axis windows ignore constant offsets and common scale',()=>{
 const a=[[1,2,4],[3,4,2],[0,8,1]],b=a.map(r=>r.map((v,j)=>v*3+j+9));
 normalizeWindow(a).forEach((v,i)=>assert.ok(Math.abs(v-normalizeWindow(b)[i])<1e-12));
});
test('jump chains count repetitive motion and reject short sequences, rest and invalid samples',()=>{
 assert.equal(detect(wave(),templates).jumping.length,10);
 assert.equal(detect(wave(24,3),templates).jumping.length,0);
 assert.equal(detect(wave(1),templates).jumping.length,0);
 assert.equal(detect([[0,NaN,1,2]],templates).jumping.length,0);
 const separated=[...wave(24,3),...wave(24,3).map(r=>[r[0]+10,...r.slice(1)])];
 assert.equal(detect(separated,templates).jumping.length,0);
});
test('calibration improves error on positive examples without inventing events; negatives stay zero',()=>{
 const samples=wave(12),sessions=[{samples,label:{type:'jumping',count:10,range:[0,9]}},{samples:wave(1),label:{type:'other',count:0,range:[0,9]}}];
 const fit=calibrate(sessions,templates,DEFAULTS,'jumping');
 assert.equal(fit.changed,true);assert.ok(fit.after<fit.before);assert.equal(fit.after,0);
 assert.equal(detect(samples,templates,fit.settings).jumping.length,10);
 assert.equal(detect(wave(1),templates,fit.settings).jumping.length,0);assert.ok(validSettings(fit.settings));
 const unchanged=calibrate(sessions,templates,fit.settings,'jumping');assert.equal(unchanged.changed,false);assert.deepEqual(unchanged.settings,fit.settings);
 assert.equal(calibrate(sessions,templates,DEFAULTS,'forward').changed,false);
});
test('cadence excludes long rests; report does not confuse session rate with interval cadence',()=>{
 const events=[0,1,2,8,10].map(time=>({time}));const points=cadence(events);
 assert.deepEqual(points.map(p=>p.rate),[60,60,30]);
 const st=statistics({type:'stationary',duration:12,samples:[[0,0,0,0],[.02,0,0,0]],detections:{stationary:events}});
 assert.equal(st.count,5);assert.equal(st.averageRate,50);assert.equal(st.medianRate,60);assert.equal(st.peakRate,60);assert.equal(st.sessionRate,25);assert.ok(st.intervalVariation>0);
 assert.equal(statistics({type:'jumping',duration:0,samples:[]}).peakRate,null);
});

test('automatic report keeps separate counts and does not compute cadence across type changes',()=>{
 const st=statistics({type:'auto',duration:10,samples:[],detections:{stationary:[{time:1},{time:2}],jumping:[{time:2.1},{time:3.1}]}});
 assert.equal(st.count,4);assert.equal(st.stationaryCount,2);assert.equal(st.jumpingCount,2);assert.equal(st.peakRate,60);
});
test('model upgrade preserves earlier calibration metadata and rejects unknown versions',async()=>{
 const {migrateModel,VERSION}=await import('../suburi/detector.mjs');
 const old={version:'suburi-1.0.0',revision:1,settings:{...DEFAULTS,weak:.55},calibrationSessionIds:['example']};
 const updated=migrateModel(old);assert.equal(updated.version,VERSION);assert.equal(updated.revision,2);assert.deepEqual(updated.previousModel,old);assert.equal(updated.settings.weak,.45);
 assert.equal(migrateModel(updated),updated);assert.throws(()=>migrateModel({...old,version:'unknown'}));
});
test('native share uses byte-identical JSON inside a shareable text attachment',async()=>{
 const {shareFile,shareFailure}=await import('../suburi/export.mjs');
 const source=new File(['{"schema":"phoneapps.suburi.dataset","sessions":[]}'],'data.json',{type:'application/json'});
 const text=shareFile(source);assert.equal(text.name,'data.json.txt');assert.equal(text.type,'text/plain');assert.equal(await text.text(),await source.text());
 assert.match(shareFailure({name:'NotAllowedError',message:'Permission denied'}),/Export data/);
 assert.match(shareFailure({name:'AbortError',message:'Cancelled'}),/cancelled/);
});

test('calibration update preserves existing v1.1 settings',async()=>{
 const {migrateModel,VERSION}=await import('../suburi/detector.mjs');
 const old={version:'suburi-1.1.0',revision:2,settings:{...DEFAULTS,strong:.7}};
 const next=migrateModel(old);assert.equal(next.version,VERSION);assert.deepEqual(next.settings,old.settings);assert.deepEqual(next.previousModel,old);
});

test('stationary path skips an intervening distractor instead of losing the repetition sequence',async()=>{
 const {detectPrepared}=await import('../suburi/detector.mjs');
 const rows=Array.from({length:660},(_,i)=>[i/60,0,0,0]),scores=[Array(600).fill(0),Array(600).fill(0)];
 for(const [time,kind]of [[2,0],[3.3,1],[4.6,0],[5.9,1],[7.2,0],[8.5,1]])scores[kind][Math.round(time*60)-30]=.9;
 scores[0][Math.round(5.95*60)-30]=.66;
 const result=detectPrepared([{rows,scores,negativeY:rows.map(()=>0)}]);
 assert.equal(result.stationary.length,6);assert.equal(result.events.length,6);assert.ok(result.events.every(e=>e.type==='stationary'));
});

test('jump path retains real rhythmic peaks around a stronger off-cadence distractor',async()=>{
 const {detectPrepared}=await import('../suburi/detector.mjs');
 const rows=Array.from({length:780},(_,i)=>[i/60,0,0,0]),negativeY=rows.map(()=>0),scores=[Array(720).fill(0),Array(720).fill(0)];
 for(let i=0;i<10;i++)negativeY[Math.round((2+i*.8)*60)]=24;
 negativeY[Math.round(3.2*60)]=40;
 const result=detectPrepared([{rows,scores,negativeY}]);assert.equal(result.jumping.length,10);assert.equal(result.stationary.length,0);assert.ok(!result.jumping.some(e=>Math.abs(e.time-3.2)<.01));
});

test('multiple labels train like independent ranges and legacy labels are read only once',async()=>{
 const {labelsFor,overlaps,validLabels}=await import('../suburi/labels.mjs');
 const a={type:'stationary',count:0,range:[0,4]},b={type:'jumping',count:0,range:[4,8]};
 assert.equal(labelsFor({label:a}).length,1);assert.equal(labelsFor({labels:[a,b],label:a}).length,2);
 assert.equal(overlaps([a,b],[3,5]),true);assert.equal(overlaps([a],[4,8]),false);
 assert.equal(validLabels({duration:8,labels:[a,b]}),true);assert.equal(validLabels({duration:8,labels:[a,{...b,range:[3,8]}]}),false);
 const samples=Array.from({length:481},(_,i)=>[i/60,0,0,0]);
 const multi=calibrate([{id:'mixed',samples,labels:[a,b]}],templates,DEFAULTS,'stationary');
 const split=calibrate([{samples,label:a},{samples,label:b}],templates,DEFAULTS,'stationary');
 assert.equal(multi.ranges,2);assert.equal(multi.sessions,1);assert.equal(multi.before,split.before);assert.deepEqual(multi.settings,split.settings);
 const {retainPractices}=await import('../suburi/history.mjs');
 const records=Array.from({length:8},(_,i)=>({id:String(i),startedAt:new Date(2026,0,i+1).toISOString(),labels:i===0?[a,b]:[]}));
 assert.equal(retainPractices(records).length,6);assert.ok(retainPractices(records).some(s=>s.id==='0'));
});
