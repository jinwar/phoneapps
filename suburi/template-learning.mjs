import {detect,preprocess,normalizeWindow} from './detector.mjs?v=1.7.0';
import {validTemplate} from './template-validation.mjs?v=1.5.0';
import {labelsFor} from './labels.mjs?v=1.3.0';
import {templateTrial} from './hayasuburi-trial.mjs?v=1.7.0';
import defaultHaya from './hayasuburi-template.mjs?v=1.4.0';
const rowsOf=flat=>Array.from({length:flat.length/3},(_,i)=>flat.slice(i*3,i*3+3));
function mean(windows){return rowsOf(normalizeWindow(rowsOf(windows[0].map((_,i)=>windows.reduce((s,w)=>s+w[i],0)/windows.length))));}
function blend(old,learned,weight){return rowsOf(normalizeWindow(old.map((r,i)=>r.map((x,j)=>x*(1-weight)+learned[i][j]*weight))));}
export function learnTemplates(sessions,defaults,model,type){
 const name=type==='stationary'?'Forward/backward':'Hayasuburi trial';
 const unchanged=message=>({changed:false,templates:{},report:{type,message},message});
 if(!['stationary','jumping'].includes(type))return unchanged('This activity does not train a motion template.');
 const stationary=model.stationaryTemplates||defaults,haya=model.hayasuburiTemplate||defaultHaya;
 const ranges=sessions.flatMap(s=>labelsFor(s).filter(l=>['stationary','jumping','other'].includes(l.type)).map(label=>({sessionId:s.id,label,samples:s.samples.filter(r=>r[0]>=label.range[0]&&r[0]<=label.range[1])})));
 const pools=type==='stationary'?[[],[]]:[[]],sources=[];
 for(const r of ranges.filter(r=>r.label.type===type&&r.label.count>0)){
  const settings=type==='stationary'?{...model.settings,strong:Math.min(.5,model.settings.strong),weak:Math.min(.35,model.settings.weak)}:model.settings;
  const events=detect(r.samples,stationary,settings)[type];
  // Labels supervise counts, not timestamps. Do not invent repetitions when
  // bootstrap candidates disagree strongly with the stated count.
  if(events.length<8||Math.abs(events.length-r.label.count)>Math.max(2,r.label.count*.2))continue;
  const segments=preprocess(r.samples),half=type==='stationary'?30:24,local=pools.map(()=>[]);
  for(const e of events){const rows=segments.find(rows=>e.time>=rows[0][0]&&e.time<=rows.at(-1)[0]);if(!rows)continue;const i=Math.round((e.time-rows[0][0])*60);if(i<half||i+half>=rows.length)continue;
   local[type==='stationary'?e.kind:0].push(normalizeWindow(rows.slice(i-half,i+half+1).map(r=>r.slice(1))));}
  // Equal per-range cap prevents one long practice dominating the template.
  for(let k=0;k<pools.length;k++)for(let n=0;n<Math.min(12,local[k].length);n++)pools[k].push(local[k][Math.floor(n*local[k].length/Math.min(12,local[k].length))]);
  sources.push({sessionId:r.sessionId,range:r.label.range,count:r.label.count});
 }
 if(pools.some(p=>p.length<(type==='stationary'?4:8)))return unchanged(`${name} template retained: not enough reliable full-window examples (need at least 8 repetitions).`);
 const learned=pools.map(mean),old=type==='stationary'?stationary:[haya];
 const errors=templates=>ranges.map(r=>{const expected=r.label.count;if(type==='stationary'){const d=detect(r.samples,templates,model.settings);return Math.abs(d.stationary.length-(r.label.type==='stationary'?expected:0))+Math.abs(d.jumping.length-(r.label.type==='jumping'?expected:0));}return Math.abs(templateTrial(r.samples,templates[0]).events.length-(r.label.type==='jumping'?expected:0));});
 const baseline=errors(old),before=baseline.reduce((a,b)=>a+b,0);let after=before,best=null,weight=null;
 for(const w of [.25,.5,.75,1]){const candidate=old.map((t,i)=>blend(t,learned[i],w));if(!candidate.every(t=>validTemplate(t,type==='stationary'?61:49)))continue;const loss=errors(candidate),total=loss.reduce((a,b)=>a+b,0);if(total<after&&loss.every((v,i)=>v<=baseline[i])){best=candidate;after=total;weight=w;}}
 const changed=best!==null,message=changed?`${name} template updated: count error across ${ranges.length} labeled ranges fell from ${before} to ${after}, with no range worsening. This measures fit to saved data, not accuracy on new practices.`:`${name} template retained: learned shapes did not improve count error (${before}) without worsening a labeled range.`;
 return {changed,templates:changed?(type==='stationary'?{stationaryTemplates:best}:{hayasuburiTemplate:best[0]}):{},message,report:{type,changed,before,after,ranges:ranges.length,examples:pools.map(p=>p.length),sources,blendWeight:weight,method:'normalized-window-mean-v1',message}};
}
