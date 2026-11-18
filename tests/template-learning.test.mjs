import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {learnTemplates} from '../suburi/template-learning.mjs';
import {DEFAULTS,VERSION,detect,migrateModel} from '../suburi/detector.mjs';
import {templateTrial} from '../suburi/hayasuburi-trial.mjs';
import {validModelTemplates} from '../suburi/template-validation.mjs';
const templates=JSON.parse(fs.readFileSync(new URL('../suburi/templates.json',import.meta.url)));
test('learns a changed forward/backward shape, preserves source and rejects drift on a tie',()=>{
 const samples=Array.from({length:1500},(_,i)=>[i/60,0,0,0]),angle=1.3;
 for(let n=0;n<16;n++){const center=90+n*78;templates[n%2].forEach(([x,y,z],i)=>{samples[center+i-30]=[(center+i-30)/60,20*(x*Math.cos(angle)-z*Math.sin(angle)),20*y,20*(x*Math.sin(angle)+z*Math.cos(angle))];});}
 const sessions=[{id:'rotated',samples,labels:[{type:'stationary',count:16,range:[0,25]}]},{id:'rest',samples:samples.map(r=>[r[0],0,0,0]),labels:[{type:'other',count:0,range:[0,25]}]}];
 const original=JSON.stringify(templates),model={settings:DEFAULTS};const learned=learnTemplates(sessions,templates,model,'stationary');
 assert.equal(learned.changed,true);assert.equal(learned.report.before,16);assert.equal(learned.report.after,0);assert.equal(learned.report.ranges,2);assert.ok(validModelTemplates(learned.templates));assert.equal(JSON.stringify(templates),original);
 assert.equal(detect(samples,learned.templates.stationaryTemplates).stationary.length,16);
 const next=learnTemplates(sessions,templates,{...model,...learned.templates},'stationary');assert.equal(next.changed,false);
});
test('learns hayasuburi trial shape from peak-aligned examples and stores a valid reusable template',()=>{
 const samples=Array.from({length:492},(_,i)=>[i/60,0,24*Math.sin(2*Math.PI*i/60/.82),0]);
 const sessions=[{id:'jump',samples,labels:[{type:'jumping',count:10,range:[0,8.2]}]}];
 const learned=learnTemplates(sessions,templates,{settings:DEFAULTS},'jumping');assert.equal(learned.changed,true);assert.ok(learned.report.after<learned.report.before);assert.ok(validModelTemplates(learned.templates));
 assert.equal(templateTrial(samples,learned.templates.hayasuburiTemplate).events.length,9);
 const model={version:VERSION,revision:1,settings:DEFAULTS,...learned.templates};assert.deepEqual(migrateModel(JSON.parse(JSON.stringify(model))),model);
 assert.throws(()=>migrateModel({...model,hayasuburiTemplate:[[NaN,0,0]]}));
 assert.equal(learnTemplates([{...sessions[0],labels:[{type:'jumping',count:100,range:[0,8.2]}]}],templates,{settings:DEFAULTS},'jumping').changed,false);
});
