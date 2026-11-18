import {labelsFor} from './labels.mjs?v=1.3.0';
// Legacy sessions retain their original chosen-type report; new sessions use both.
export function sessionEvents(session){
 if(session.type!=='auto')return (session.detections?.[session.type]||[]).map(e=>({...e,type:session.type}));
 return [...(session.detections?.stationary||[]).map(e=>({...e,type:'stationary'})),...(session.detections?.jumping||[]).map(e=>({...e,type:'jumping'}))].sort((a,b)=>a.time-b.time);
}
// User labels replace detector counts only inside their covered time ranges.
// Detection timestamps remain untouched: a total count cannot supply cadence.
export function practiceCounts(session){
 const events=sessionEvents(session),labels=labelsFor(session);
 const outside=events.filter(e=>!labels.some(l=>e.time>=l.range[0]&&e.time<=l.range[1]));
 let stationaryCount=outside.filter(e=>e.type==='stationary').length,jumpingCount=outside.filter(e=>e.type==='jumping').length,forwardCount=0;
 for(const l of labels){if(l.type==='stationary')stationaryCount+=l.count;else if(l.type==='jumping')jumpingCount+=l.count;else if(l.type==='forward')forwardCount+=l.count;}
 return {count:stationaryCount+jumpingCount+forwardCount,stationaryCount,jumpingCount,forwardCount,detectedCount:events.length,countSource:labels.length?'user-labels-plus-unlabeled-detections':'detector'};
}
export function cadence(events){return events.slice(1).flatMap((e,i)=>{const gap=e.time-events[i].time;return gap>0&&gap<=4&&e.type===events[i].type?[{time:e.time,rate:60/gap,gap,type:e.type}]:[];});}
export function statistics(session){
 const events=sessionEvents(session),points=cadence(events),rates=points.map(p=>p.rate).sort((a,b)=>a-b);
 const average=rates.length?rates.reduce((s,x)=>s+x,0)/rates.length:null;
 const median=rates.length?(rates[Math.floor((rates.length-1)/2)]+rates[Math.floor(rates.length/2)])/2:null;
 const gaps=points.map(p=>p.gap),meanGap=gaps.length?gaps.reduce((s,x)=>s+x,0)/gaps.length:0;
 const cv=gaps.length>1?100*Math.sqrt(gaps.reduce((s,x)=>s+(x-meanGap)**2,0)/gaps.length)/meanGap:null;
 const elapsed=session.duration||0,counts=practiceCounts(session);
 return {...counts,duration:elapsed,averageRate:average,medianRate:median,peakRate:rates.length?rates.at(-1):null,
 sessionRate:elapsed>0?counts.count*60/elapsed:null,intervalVariation:cv,
 first:events[0]?.time??null,last:events.at(-1)?.time??null,sampleRate:session.samples.length>1?(session.samples.length-1)/(session.samples.at(-1)[0]-session.samples[0][0]):null};
}
