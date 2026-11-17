// Original pocket-motion detector. Templates calibrated from six user-labeled
// stationary candidates; exact event timing has not been independently verified.
export const VERSION = 'suburi-1.0.0';
export const DEFAULTS = Object.freeze({ strong: .75, weak: .55, stationaryScale: 1, jumpHeight: 6, jumpAnchor: 14, jumpScale: 1 });
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
    events.sort((a,b)=>a.time-b.time);let chains=[];
    for(const e of events){const last=chains.at(-1)?.at(-1);const dt=last?e.time-last.time:0;
      if(last&&last.kind!==e.kind&&dt>=.95*settings.stationaryScale&&dt<=1.9*settings.stationaryScale)chains.at(-1).push(e);else chains.push([e]);}
    for(const chain of chains)if(chain.length>=4)stationary.push(...chain);
    chains=[];
    for(const p of peaks(negativeY,settings.jumpHeight,Math.round(36*settings.jumpScale),2)){
      const last=chains.at(-1)?.at(-1);const dt=last===undefined?0:rows[p][0]-rows[last][0];
      if(last!==undefined&&dt>=.65*settings.jumpScale&&dt<=settings.jumpScale)chains.at(-1).push(p);else chains.push([p]);
    }
    for(const chain of chains)if(chain.length>=5&&chain.filter(p=>negativeY[p]>=settings.jumpAnchor).length/chain.length>=.7)jumping.push(...chain.map(p=>({time:rows[p][0],strength:negativeY[p]})));
  }
  return { stationary, jumping };
}
export const detect=(samples,templates,settings=DEFAULTS,range=null)=>detectPrepared(prepare(samples,templates,range),settings);

// Count supervision selects bounded parameters; never creates synthetic events.
// Replays all labeled sessions of the target type plus negative examples.
export function calibrate(sessions,templates,current,type) {
  if(!['stationary','jumping'].includes(type))return {settings:current,changed:false,message:'Label saved for analysis. This type does not yet have an automatic detector.'};
  const usable=sessions.filter(s=>s.label && (s.label.type===type||s.label.type==='other'||(s.label.type!==type&&['stationary','jumping'].includes(s.label.type))));
  const positive=usable.filter(s=>s.label.type===type);
  if(!positive.length)return {settings:current,changed:false,message:'No labeled sessions for this type.'};
  const prepared=usable.map(s=>({data:prepare(s.samples,templates,s.label.range),expected:s.label.type===type?s.label.count:0}));
  const loss=settings=>prepared.reduce((sum,p)=>sum+Math.abs(detectPrepared(p.data,settings)[type].length-p.expected),0);
  const before=loss(current);let best={...current},bestLoss=before;
  const candidates=[];
  if(type==='stationary')for(const strong of [.65,.7,.75,.8,.85])for(const weak of [.45,.5,.55,.6,.65])for(const scale of [.8,1,1.2,1.4])candidates.push({...current,strong,weak,stationaryScale:scale});
  else for(const height of [3,4,5,6,7,8,10,12])for(const anchor of [10,14,18])for(const scale of [.8,1,1.2,1.4])candidates.push({...current,jumpHeight:height,jumpAnchor:anchor,jumpScale:scale});
  // Prefer the existing parameters on ties; do not repeatedly drift to extremes.
  for(const settings of candidates){const error=loss(settings);if(error<bestLoss){best=settings;bestLoss=error;}}
  return {settings:best,changed:bestLoss<before,before,after:bestLoss,sessions:usable.length,
    message:bestLoss<before?`Settings updated: total count error on ${usable.length} saved labeled sessions fell from ${before} to ${bestLoss}. This is calibration, not an independent accuracy test.`:
    `Label saved. Current settings retained (total count error ${before} across ${usable.length} labeled sessions). More recordings may help; counts are never forced to match labels.`};
}
