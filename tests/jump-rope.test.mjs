import test from 'node:test';
import assert from 'node:assert/strict';
import {JumpDetector} from '../jump-rope/detector.mjs';
function signal({hz=2,axis=2,amplitude=6,noise=0}={}) {
 const d = new JumpDetector(); let count=0;
 for(let t=0;t<12000;t+=20) {
  const a=[0,0,0]; a[axis]=9.81+(t>=2000?amplitude*Math.sin(2*Math.PI*hz*(t-2000)/1000):0)+noise*Math.sin(t*7);
  if(d.sample(...a,t)) count++;
 }
 return count;
}
test('counts repeated bounce cycles across device orientations and cadences',()=> {
 for(const axis of [0,1,2]) for(const hz of [1,2,3]) assert.ok(Math.abs(signal({axis,hz})-hz*10)<=1);
});
test('stationary sensor noise and gentle motion do not count',()=> {
 assert.equal(signal({amplitude:0,noise:.2}),0); assert.equal(signal({amplitude:.5}),0);
});
test('invalid samples and discontinuities do not complete a stale jump',()=> {
 const d=new JumpDetector(); for(let t=0;t<2000;t+=20)d.sample(0,0,9.81,t);
 assert.equal(d.sample(null,0,9.81,2000),false);
 d.sample(0,0,20,2020);
 assert.equal(d.sample(0,0,0,5000),false);
 assert.equal(d.sample(0,0,20,4990),false);
});
