import test from 'node:test';
import assert from 'node:assert/strict';
import template from '../suburi/hayasuburi-template.mjs';
import {templateTrial,TRIAL_THRESHOLD} from '../suburi/hayasuburi-trial.mjs';
function motion(count,gain=30){const rows=[];for(let i=0;i<120+count*50+120;i++){const j=i-120,r=j>=0&&j<count*50?template[j%50]||[0,0,0]:[0,0,0];rows.push([i/60,...r.map(v=>v*gain)]);}return rows;}
test('template matching counts repeating three-axis shapes, independently of existing peak events',()=>{
 const result=templateTrial(motion(8));assert.equal(result.events.length,8);assert.ok(result.events.every(e=>e.score>=TRIAL_THRESHOLD));
 assert.equal(templateTrial(motion(4)).events.length,0);
 assert.equal(templateTrial(motion(8,.1)).events.length,0);
});
test('template trial does not link matches across a sensor gap',()=>{
 const rows=motion(3),later=motion(3).map(r=>[r[0]+10,...r.slice(1)]);
 assert.equal(templateTrial([...rows,...later]).events.length,0);
 assert.equal(templateTrial([]).events.length,0);
});
