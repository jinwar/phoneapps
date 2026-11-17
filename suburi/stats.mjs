export function cadence(events){return events.slice(1).flatMap((e,i)=>{const gap=e.time-events[i].time;return gap>0&&gap<=4?[{time:e.time,rate:60/gap,gap}]:[];});}
export function statistics(session){
 const events=session.detections?.[session.type]||[],points=cadence(events),rates=points.map(p=>p.rate).sort((a,b)=>a-b);
 const average=rates.length?rates.reduce((s,x)=>s+x,0)/rates.length:null;
 const median=rates.length?(rates[Math.floor((rates.length-1)/2)]+rates[Math.floor(rates.length/2)])/2:null;
 const gaps=points.map(p=>p.gap),meanGap=gaps.length?gaps.reduce((s,x)=>s+x,0)/gaps.length:0;
 const cv=gaps.length>1?100*Math.sqrt(gaps.reduce((s,x)=>s+(x-meanGap)**2,0)/gaps.length)/meanGap:null;
 const elapsed=session.duration||0;
 return {count:events.length,duration:elapsed,averageRate:average,medianRate:median,peakRate:rates.length?rates.at(-1):null,
 sessionRate:elapsed>0?events.length*60/elapsed:null,intervalVariation:cv,
 first:events[0]?.time??null,last:events.at(-1)?.time??null,sampleRate:session.samples.length>1?(session.samples.length-1)/(session.samples.at(-1)[0]-session.samples[0][0]):null};
}
