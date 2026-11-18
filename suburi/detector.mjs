import {validModelTemplates} from './template-validation.mjs?v=1.5.0';
import {labelsFor} from './labels.mjs?v=1.3.0';
// Original pocket-motion detector. Templates calibrated from six user-labeled
// stationary candidates; exact event timing has not been independently verified.
export const VERSION = 'suburi-1.4.0';
export const DEFAULTS = Object.freeze({ strong: .65, weak: .45, stationaryScale: 1.2, jumpHeight: 6, jumpAnchor: 14, jumpScale: 1 });
const norm = a => Math.sqrt(a.reduce((s,v)=>s+v*v,0));
export function validSettings(s) {
  return s && ['strong','weak'].every(k=>Number.isFinite(s[k])&&s[k]>=.3&&s[k]<=1) &&
    ['stationaryScale','jumpScale'].every(k=>Number.isFinite(s[k])&&s[k]>=.5&&s[k]<=2) &&
    Number.isFinite(s.jumpHeight)&&s.jumpHeight>=2&&s.jumpHeight<=20 && Number.isFinite(s.jumpAnchor)&&s.jumpAnchor>=8&&s.jumpAnchor<=30;
}
export function normalizeWindow(rows) {
  const means=[0,1,2].map(j=>rows.reduce((s,r)=>s+r[j],0)/rows.length);
  const flat=rows.flatMap(r=>r.map((v,j)=>v-means[j])); const n=norm(flat);
  return n>1e-8 ? flat.map(v=>v/n) : flat.map(()=>0);
}
// Interpolate only within continuous segments. Second-order causal Butterworth,
// 8 Hz at 60 Hz, bilinear transform. Reset on invalid input or gaps >100 ms.
export function preprocess(samples, range=null) {
  const segments=[]; let current=[],previous=null,next=0;
  const k=Math.tan(Math.PI*8/60), q=1/(1+Math.SQRT2*k+k*k);
  const b=[k*k*q,2*k*k*q,k*k*q], a=[2*(k*k-1)*q,(1-Math.SQRT2*k+k*k)*q];
  let z1=[0,0,0],z2=[0,0,0];
  const flush=()=>{ if(current.length)segments.push(current);current=[];previous=null;z1=[0,0,0];z2=[0,0,0]; };
  for(const row of samples) {
    if(!Array.isArray(row)||!row.slice(0,4).every(Number.isFinite)||row.length<4){flush();continue;}
    if(range&&(row[0]<range[0]||row[0]>range[1]))continue;
    if(previous&&(row[0]<=previous[0]||row[0]-previous[0]>.1))flush();
    if(!previous){previous=row;next=row[0];}
    while(next<=row[0]+1e-9){
      const f=row[0]===previous[0]?0:(next-previous[0])/(row[0]-previous[0]);
      const filtered=[0,1,2].map(j=>{const x=previous[j+1]+f*(row[j+1]-previous[j+1]);const y=b[0]*x+z1[j];z1[j]=b[1]*x-a[0]*y+z2[j];z2[j]=b[2]*x-a[1]*y;return y;});
      current.push([next,...filtered]);next+=1/60;
    }
    previous=row;
  }
  flush();return segments;
}
// Offline peak selection; estimates may revise until a session is stopped.
function peaks(values,height,distance,prominence=0) {
  const possible=[];
  for(let i=1;i<values.length-1;i++){
    if(values[i]<height||values[i]<=values[i-1]||values[i]<values[i+1])continue;
    let l=values[i],r=values[i];
    for(let j=i-1;j>=0;j--){if(values[j]>values[i])break;l=Math.min(l,values[j]);}
    for(let j=i+1;j<values.length;j++){if(values[j]>values[i])break;r=Math.min(r,values[j]);}
    if(values[i]-Math.max(l,r)>=prominence)possible.push(i);
  }
  const kept=[];
  for(const i of possible.sort((a,b)=>values[b]-values[a]))if(kept.every(j=>Math.abs(i-j)>=distance))kept.push(i);
  return kept.sort((a,b)=>a-b);
}
export function prepare(samples,templates,range=null) {
  const flat=templates.map(t=>t.flat());
  return preprocess(samples,range).map(rows=>{
    const scores=[[],[]];
    for(let i=30;i<rows.length-30;i++){
      const v=normalizeWindow(rows.slice(i-30,i+31).map(r=>r.slice(1)));
      for(let j=0;j<2;j++)scores[j].push(v.reduce((s,x,k)=>s+x*flat[j][k],0));
    }
    return { rows,scores,negativeY:rows.map(r=>-r[2]) };
  });
}
export function detectPrepared(segments,settings=DEFAULTS) {
  const stationary=[],jumping=[];
  for(const {rows,scores,negativeY} of segments){
    const events=[];
    for(let kind=0;kind<2;kind++)for(const p of peaks(scores[kind],kind?settings.weak:settings.strong,Math.round(60*settings.stationaryScale),.1))events.push({time:rows[p+30][0],kind,score:scores[kind][p]});
    events.sort((a,b)=>a.time-b.time);
    // Link compatible matches through distractors rather than resetting a whole
    // sequence whenever a weak, unrelated local maximum intervenes.
    const paths=[];
    for(let i=0;i<events.length;i++){const e=events[i];
      let best=[i];
      for(let j=0;j<i;j++){
        const dt=e.time-events[j].time;
        if(e.kind!==events[j].kind&&dt>=.8*settings.stationaryScale&&dt<=1.9*settings.stationaryScale){
          const candidate=[...paths[j],i];
          const score=p=>p.reduce((sum,k)=>sum+events[k].score,0);
          if(candidate.length>best.length||(candidate.length===best.length&&score(candidate)>score(best)))best=candidate;
        }
      }
      paths.push(best);
    }
    const accepted=[];
    for(const path of paths.filter(p=>p.length>=4).sort((a,b)=>b.length-a.length)){
      const start=events[path[0]].time,end=events[path.at(-1)].time;
      if(accepted.every(p=>end<events[p[0]].time-.8*settings.stationaryScale||start>events[p.at(-1)].time+.8*settings.stationaryScale))accepted.push(path);
    }
    for(const path of accepted)stationary.push(...path.map(i=>events[i]));
    // Repeated directions need denser candidates and a consistent cadence,
    // rather than the alternating-template rule used by the legacy path.
    const repeated=[];
    for(let kind=0;kind<2;kind++)for(const p of peaks(scores[kind],Math.max(.55,kind?settings.weak:settings.strong),Math.round(30*settings.stationaryScale),.1))repeated.push({time:rows[p+30][0],kind,score:scores[kind][p]});
    repeated.sort((a,b)=>a.time-b.time);
    const runs=[];
    for(let i=0;i<repeated.length;i++)for(let j=i+1;j<repeated.length;j++){
      const period=repeated[j].time-repeated[i].time;if(period>2.2)break;if(period<.8)continue;
      const run=[repeated[i],repeated[j]];let last=j;
      while(true){let best=-1,bestQuality=-Infinity;
        for(let k=last+1;k<repeated.length;k++){const gap=repeated[k].time-repeated[last].time;if(gap>period*1.2)break;if(gap<period*.8)continue;
          const quality=repeated[k].score-Math.abs(gap-period)/period;if(quality>bestQuality){best=k;bestQuality=quality;}}
        if(best<0)break;run.push(repeated[best]);last=best;
      }
      if(run.length>=5&&run.filter(e=>e.score>=.65).length/run.length>=.7&&run.slice(1).filter((e,k)=>e.kind===run[k].kind).length>=2)runs.push(run);
    }
    const chosen=[];
    for(const run of runs.sort((a,b)=>b.length-a.length||b.reduce((s,e)=>s+e.score,0)-a.reduce((s,e)=>s+e.score,0))){if(chosen.every(r=>run.at(-1).time<r[0].time-.6||run[0].time>r.at(-1).time+.6))chosen.push(run);}
    for(const run of chosen){
      const start=run[0].time-.6,end=run.at(-1).time+.6;
      if(run.length<stationary.filter(e=>e.time>=start&&e.time<=end).length)continue;
      for(let i=stationary.length-1;i>=0;i--)if(stationary[i].time>=start&&stationary[i].time<=end)stationary.splice(i,1);
      stationary.push(...run);
    }

    // Preserve competing local peaks until cadence can disambiguate them.
    // Greedy amplitude pruning at 0.6 s can erase a real repetition when a
    // neighboring pulse shifts slightly after resampling.
    const candidates=peaks(negativeY,settings.jumpHeight,Math.round(18*settings.jumpScale),2);
    const jumpPaths=[];
    for(let i=0;i<candidates.length;i++){
      let best=[i];
      for(let j=0;j<i;j++){
        const dt=rows[candidates[i]][0]-rows[candidates[j]][0];
        if(dt>=.65*settings.jumpScale&&dt<=settings.jumpScale){
          const path=[...jumpPaths[j],i];
          const strength=p=>p.reduce((sum,k)=>sum+Math.min(negativeY[candidates[k]],settings.jumpAnchor*2),0);
          if(path.length>best.length||(path.length===best.length&&strength(path)>strength(best)))best=path;
        }
      }
      jumpPaths.push(best);
    }
    const jumpAccepted=[];
    for(const path of jumpPaths.filter(p=>p.length>=5&&p.filter(k=>negativeY[candidates[k]]>=settings.jumpAnchor).length/p.length>=.7).sort((a,b)=>b.length-a.length)){
      const start=rows[candidates[path[0]]][0],end=rows[candidates[path.at(-1)]][0];
      if(jumpAccepted.every(p=>end<rows[candidates[p[0]]][0]-.65*settings.jumpScale||start>rows[candidates[p.at(-1)]][0]+.65*settings.jumpScale))jumpAccepted.push(path);
    }
    for(const path of jumpAccepted)jumping.push(...path.map(k=>({time:rows[candidates[k]][0],strength:negativeY[candidates[k]]})));

  }
  // Jump sequences take precedence in their own time region. Never count the
  // same motion twice or draw a stationary trace through a jumping block.
  const filtered=stationary.filter(e=>!jumping.some(j=>Math.abs(j.time-e.time)<.6));
  filtered.sort((a,b)=>a.time-b.time);jumping.sort((a,b)=>a.time-b.time);
  const events=[...filtered.map(e=>({...e,type:'stationary'})),...jumping.map(e=>({...e,type:'jumping'}))].sort((a,b)=>a.time-b.time);
  return { stationary:filtered, jumping, events };

}
export const detect=(samples,templates,settings=DEFAULTS,range=null)=>detectPrepared(prepare(samples,templates,range),settings);

// Count supervision selects bounded parameters; never creates synthetic events.
// Replays all labeled sessions of the target type plus negative examples.
export function calibrate(sessions,templates,current,type) {
  if(!['stationary','jumping'].includes(type))return {settings:current,changed:false,message:'Label saved for analysis. This type does not yet have an automatic detector.'};
  const usable=sessions.flatMap(s=>labelsFor(s).filter(l=>['stationary','jumping','other'].includes(l.type)).map(label=>({...s,label})));
  const positive=usable.filter(s=>s.label.type===type);
  if(!positive.length)return {settings:current,changed:false,message:'No labeled sessions for this type.'};
  const prepared=usable.map(s=>({data:prepare(s.samples,templates,s.label.range),expected:{stationary:s.label.type==='stationary'?s.label.count:0,jumping:s.label.type==='jumping'?s.label.count:0}}));
  const loss=settings=>prepared.reduce((sum,p)=>{const detected=detectPrepared(p.data,settings);return sum+Math.abs(detected.stationary.length-p.expected.stationary)+Math.abs(detected.jumping.length-p.expected.jumping);},0);
  const before=loss(current);let best={...current},bestLoss=before;
  const candidates=[];
  if(type==='stationary')for(const strong of [.5,.55,.6,.65,.7,.75,.8,.85])for(const weak of [.35,.4,.45,.5,.55,.6,.65])for(const scale of [.8,1,1.2,1.4])candidates.push({...current,strong,weak,stationaryScale:scale});
  else for(const height of [3,4,5,6,7,8,10,12])for(const anchor of [10,14,18])for(const scale of [.8,1,1.2,1.4])candidates.push({...current,jumpHeight:height,jumpAnchor:anchor,jumpScale:scale});
  // Prefer the existing parameters on ties; do not repeatedly drift to extremes.
  for(const settings of candidates){const error=loss(settings);if(error<bestLoss){best=settings;bestLoss=error;}}
  return {settings:best,changed:bestLoss<before,before,after:bestLoss,sessions:new Set(usable.map(s=>s.id||s)).size,ranges:usable.length,
    message:bestLoss<before?`Settings updated: total count error on ${usable.length} saved labeled ranges fell from ${before} to ${bestLoss}. This is calibration, not an independent accuracy test.`:
    `Label saved. Current settings retained (total count error ${before} across ${usable.length} labeled ranges). More recordings may help; counts are never forced to match labels.`};
}

export function migrateModel(saved){
 if(!saved)return {version:VERSION,revision:0,settings:{...DEFAULTS}};
 if(!validModelTemplates(saved)||!validSettings(saved.settings)||!Number.isInteger(saved.revision)||saved.revision<0)throw Error('Saved model is invalid');
 if(saved.version===VERSION)return saved;
 if(['suburi-1.1.0','suburi-1.1.1','suburi-1.2.0','suburi-1.3.0'].includes(saved.version))return {...saved,version:VERSION,revision:saved.revision+1,previousModel:saved,updatedAt:new Date().toISOString(),migration:'Repeated-direction sequences supported. Existing settings and templates preserved; save a label to reanalyze a practice.'};
 if(saved.version!=='suburi-1.0.0')throw Error('Saved model version is not supported');
 return {version:VERSION,revision:saved.revision+1,settings:{...DEFAULTS},updatedAt:new Date().toISOString(),
   previousModel:saved,migration:'Updated stationary sequence detector and automatic type recognition. Previous model and original session reports preserved.'};
}
