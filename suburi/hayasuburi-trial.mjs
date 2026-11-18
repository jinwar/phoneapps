import {preprocess,normalizeWindow} from './detector.mjs?v=1.7.0';
import template from './hayasuburi-template.mjs?v=1.4.0';
export const TRIAL_VERSION='hayasuburi-template-0.1';
export const TRIAL_THRESHOLD=.5;
// Independent template-only trial. No current detector events are used to count.
export function templateTrial(samples,personalized=template){
 const flat=personalized.flat(),events=[],segments=[];
 for(const rows of preprocess(samples)){
  const scores=[],times=[],energy=[];
  for(let i=24;i<rows.length-24;i++){
   const window=rows.slice(i-24,i+25).map(r=>r.slice(1)),v=normalizeWindow(window);
   const means=[0,1,2].map(j=>window.reduce((s,r)=>s+r[j],0)/49);
   energy.push(Math.sqrt(window.reduce((s,r)=>s+r.reduce((n,x,j)=>n+(x-means[j])**2,0),0)/49));
   scores.push(v.reduce((sum,x,k)=>sum+x*flat[k],0));times.push(rows[i][0]);
  }
  const candidates=[];
  for(let i=1;i<scores.length-1;i++){
   if(scores[i]<TRIAL_THRESHOLD||energy[i]<2||scores[i]<=scores[i-1]||scores[i]<scores[i+1])continue;
   let left=scores[i],right=scores[i];
   for(let j=i-1;j>=0&&scores[j]<=scores[i];j--)left=Math.min(left,scores[j]);
   for(let j=i+1;j<scores.length&&scores[j]<=scores[i];j++)right=Math.min(right,scores[j]);
   if(scores[i]-Math.max(left,right)>=.1)candidates.push(i);
  }
  const peaks=[];
  for(const i of candidates.sort((a,b)=>scores[b]-scores[a]))if(peaks.every(j=>Math.abs(i-j)>=36))peaks.push(i);
  peaks.sort((a,b)=>a-b);let chain=[];
  const flush=()=>{if(chain.length>=5)events.push(...chain.map(i=>({time:times[i],score:scores[i]})));chain=[];};
  for(const i of peaks){if(chain.length){const dt=times[i]-times[chain.at(-1)];if(dt<.65-1e-8||dt>1+1e-8)flush();}chain.push(i);}flush();
  segments.push({times,scores});
 }
 return {version:TRIAL_VERSION,threshold:TRIAL_THRESHOLD,events,segments};
}
