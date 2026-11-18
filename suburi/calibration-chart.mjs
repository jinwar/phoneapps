import {labelsFor} from './labels.mjs?v=1.3.0';
// Similarity is dimensionless; keep it separate from acceleration thresholds.
export function drawCalibration(segments,session,trial){
 const settings=session.model.settings,previous=session.calibration?.beforeSettings;
 const ranges=labelsFor(session).map(l=>l.range);
 function plot(id,series,limits,thresholds,events=[]){
  const c=document.getElementById(id),w=c.clientWidth,h=220,dpr=devicePixelRatio||1;
  c.width=w*dpr;c.height=h*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);
  const l=42,r=w-12,t=12,b=h-30,end=Math.max(1,session.duration);
  const x=v=>l+v/end*(r-l),y=v=>b-(v-limits[0])/(limits[1]-limits[0])*(b-t);
  ctx.font='11px system-ui';ctx.fillStyle='#9dafc2';ctx.strokeStyle='#2a3a4c';
  for(let i=0;i<=4;i++){const v=limits[0]+i*(limits[1]-limits[0])/4;ctx.beginPath();ctx.moveTo(l,y(v));ctx.lineTo(r,y(v));ctx.stroke();ctx.fillText(v.toFixed(1),1,y(v)+4);ctx.fillText(`${Math.round(end*i/4)}s`,x(end*i/4)-8,h-8);}
  for(const range of ranges){ctx.fillStyle='#ffffff0c';ctx.fillRect(x(range[0]),t,x(range[1])-x(range[0]),b-t);}
  for(const {parts,color}of series){ctx.strokeStyle=color;ctx.lineWidth=1;for(const points of parts){ctx.beginPath();points.forEach(([time,value],i)=>{if(i)ctx.lineTo(x(time),y(value));else ctx.moveTo(x(time),y(value));});ctx.stroke();}}
  for(const {value,color,old}of thresholds){ctx.strokeStyle=color;ctx.lineWidth=old?1:2;ctx.setLineDash(old?[2,6]:[7,4]);ctx.beginPath();ctx.moveTo(l,y(value));ctx.lineTo(r,y(value));ctx.stroke();}ctx.setLineDash([]);
  ctx.fillStyle='#8fc7ff';for(const e of events)ctx.fillRect(x(e.time),b-5,2,5);
 }
 const thresholds=[{value:settings.jumpHeight,color:'#8fc7ff'},{value:settings.jumpAnchor,color:'#e7c878'}];
 if(previous)thresholds.push({value:previous.jumpHeight,color:'#8fc7ff',old:true},{value:previous.jumpAnchor,color:'#e7c878',old:true});
 let min=-1,max=Math.max(...thresholds.map(t=>t.value));for(const s of segments)for(const row of s.rows)for(const v of row.slice(1)){min=Math.min(min,v,-row[2]);max=Math.max(max,v,-row[2]);}
 plot('acceleration-chart',[...[1,2,3].map((axis,i)=>({color:['#e7a1ad','#a3b8c9','#bd9ae8'][i],parts:segments.map(s=>s.rows.map(r=>[r[0],r[axis]]))})),{color:'#8fc7ff',parts:segments.map(s=>s.rows.map(r=>[r[0],-r[2]]))}],[min-1,max+1],thresholds);
 const similarity=[{value:settings.strong,color:'#b5f5cc'},{value:settings.weak,color:'#f0c78c'}];
 if(previous)similarity.push({value:previous.strong,color:'#b5f5cc',old:true},{value:previous.weak,color:'#f0c78c',old:true});
 plot('similarity-chart',[0,1].map((kind)=>({color:kind?'#f0c78c':'#b5f5cc',parts:segments.map(s=>s.scores[kind].map((v,i)=>[s.rows[i+30][0],v]))})),[-1,1],similarity);
 if(trial){
  plot('hayasuburi-template-chart',[{color:'#8fc7ff',parts:trial.segments.map(s=>s.times.map((time,i)=>[time,s.scores[i]]))}],[-1,1],[{value:trial.threshold,color:'#8fc7ff'}],trial.events);
  const current=session.detections?.jumping||[];
  const comparisons=labelsFor(session).filter(l=>l.type==='jumping').map(l=>`${l.range[0]}–${l.range[1]} s: template ${trial.events.filter(e=>e.time>=l.range[0]&&e.time<=l.range[1]).length}, current ${current.filter(e=>e.time>=l.range[0]&&e.time<=l.range[1]).length}, actual ${l.count}.`);
  document.getElementById('hayasuburi-template-summary').textContent=`Whole practice: template ${trial.events.length} vs current ${current.length} hayasuburi. ${comparisons.join(' ')} Trial similarity threshold: ${trial.threshold}. Template: ${session.model.hayasuburiTemplate?'personalized':'original'}.`;
 }
 const change=(key)=>previous&&previous[key]!==settings[key]?`${previous[key]} → ${settings[key]}`:`${settings[key]}`;
 document.getElementById('threshold-summary').textContent=`Forward/backward template: ${session.model.stationaryTemplates?'personalized':'original'}. Similarity: strong ${change('strong')}, weak ${change('weak')}. Hayasuburi acceleration: peak ${change('jumpHeight')}, strong anchor ${change('jumpAnchor')} m/s². Timing scales: forward/backward ${change('stationaryScale')}, hayasuburi ${change('jumpScale')}. Threshold crossings also need a repeating sequence.`;
}
