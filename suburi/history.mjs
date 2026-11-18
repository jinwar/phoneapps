import {labelsFor} from './labels.mjs?v=1.3.0';
import {sessionEvents} from './stats.mjs?v=1.1.0';
export function summarize(s){const events=sessionEvents(s);return {id:s.id,startedAt:s.startedAt,endedAt:s.endedAt||null,duration:s.duration,type:s.type,stationary:events.filter(e=>e.type==='stationary').length,jumping:events.filter(e=>e.type==='jumping').length};}
export function retainPractices(sessions){const recent=new Set(sessions.filter(s=>!labelsFor(s).length).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.id.localeCompare(a.id)).slice(0,5).map(s=>s.id));return sessions.filter(s=>labelsFor(s).length||recent.has(s.id));}
export function mergeSummaries(summaries,sessions){const byId=new Map(summaries.map(s=>[s.id,s]));for(const s of sessions)byId.set(s.id,summarize(s));return [...byId.values()];}
export const validSummaries=items=>Array.isArray(items)&&items.every(s=>s&&typeof s.id==='string'&&Number.isFinite(Date.parse(s.startedAt))&&Number.isFinite(s.duration)&&s.duration>=0&&['stationary','jumping'].every(k=>Number.isInteger(s[k])&&s[k]>=0));
// Calendar days, using local dates but UTC arithmetic so DST does not skip days.
export function dayNumber(time){const d=new Date(time);return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;}
export function dailyCounts(summaries){const days=new Map();for(const s of summaries){const day=dayNumber(s.startedAt),v=days.get(day)||{stationary:0,jumping:0};v.stationary+=s.stationary;v.jumping+=s.jumping;days.set(day,v);}return days;}
export function createHistoryChart(){
 const $=id=>document.getElementById(id);let items=[],span=7,end=dayNumber(Date.now());
 const label=day=>new Date(day*86400000).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 function draw(){
  const days=dailyCounts(items),start=end-span+1,c=$('history-chart'),w=c.clientWidth,h=240,dpr=devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);
  const left=40,right=w-12,top=15,bottom=h-42,width=(right-left)/span;let max=1,stationary=0,jumping=0;
  for(const [day,v]of days)if(day>=start&&day<=end){max=Math.max(max,v.stationary+v.jumping);stationary+=v.stationary;jumping+=v.jumping;}
  ctx.font='10px system-ui';ctx.fillStyle='#9dafc2';ctx.strokeStyle='#2a3a4c';
  for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText(String(Math.round(max*i/4)),1,y+3);}
  for(const [day,v]of days){if(day<start||day>end)continue;const x=left+(day-start)*width+width*.12,a=v.stationary/max*(bottom-top),b=v.jumping/max*(bottom-top);ctx.fillStyle='#b5f5cc';ctx.fillRect(x,bottom-a,width*.76,a);ctx.fillStyle='#8fc7ff';ctx.fillRect(x,bottom-a-b,width*.76,b);}
  ctx.fillStyle='#9dafc2';ctx.textAlign='left';ctx.fillText(label(start),left,h-12);ctx.textAlign='right';ctx.fillText(label(end),right,h-12);
  $('history-range').textContent=`${label(start)} – ${label(end)} · ${span} days`;
  $('history-chart-summary').textContent=`Shown: ${stationary.toLocaleString()} forward/backward suburi and ${jumping.toLocaleString()} hayasuburi. Dates without practice count as zero.`;
  $('history-zoom-in').disabled=span<=1;$('history-next').disabled=end>=dayNumber(Date.now());
 }
 $('history-zoom-in').onclick=()=>{span=Math.max(1,Math.floor(span/2));draw();};
 $('history-zoom-out').onclick=()=>{span=Math.min(36525,span*2);draw();};
 $('history-prev').onclick=()=>{end-=span;draw();};$('history-next').onclick=()=>{end=Math.min(dayNumber(Date.now()),end+span);draw();};
 $('history-week').onclick=()=>{end=dayNumber(Date.now());span=7;draw();};
 $('history-all').onclick=()=>{end=Math.max(dayNumber(Date.now()),...items.map(s=>dayNumber(s.startedAt)));const first=Math.min(end,...items.map(s=>dayNumber(s.startedAt)));span=Math.max(7,end-first+1);draw();};
 window.addEventListener('resize',draw);
 return data=>{items=data;const total=items.reduce((v,s)=>({stationary:v.stationary+s.stationary,jumping:v.jumping+s.jumping}),{stationary:0,jumping:0});$('lifetime-stationary').textContent=total.stationary.toLocaleString();$('lifetime-jumping').textContent=total.jumping.toLocaleString();draw();};
}
