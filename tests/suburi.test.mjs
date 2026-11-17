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
