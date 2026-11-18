import defaultHayasuburiTemplate from './hayasuburi-template.mjs?v=1.4.0';
import {validModelTemplates} from './template-validation.mjs?v=1.5.0';
import {labelsFor,overlaps,validLabels} from './labels.mjs?v=1.3.0';
let editingLabel=-1;
import {createHistoryChart,mergeSummaries,validSummaries} from './history.mjs?v=1.3.0';
import {drawCalibration} from './calibration-chart.mjs?v=1.5.0';
import {VERSION,DEFAULTS,validSettings,migrateModel} from './detector.mjs?v=1.5.0';
import {openDatabase,readAll,save} from './storage.mjs?v=1.3.0';
import {cadence,statistics,sessionEvents} from './stats.mjs?v=1.1.1';
import {download,shareFile,shareFailure} from './export.mjs?v=1.1.6';
const $=id=>document.getElementById(id),TYPES={auto:'Automatic',stationary:'Forward/backward suburi',jumping:'Hayasuburi',forward:'Forward-moving',other:'Walking / other'};
const MAX_SAMPLES=36000;
const updateHistoryChart=createHistoryChart();
let summaries=[];
let plotData=null,plotSession=null,plotRequest=0;
let db,templates,model={version:VERSION,revision:0,settings:{...DEFAULTS}},sessions=[],selected=null,running=false,busy=false,ready=false;
let started=0,lastSample=0,worker,sequence=0,wakeLock=null,storageHealthy=true,unsaved=false,livePending=false,lastCheckpoint=0;
const pending=new Map();
function workerCall(action,args){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,...args});});}
function controls(){
 $('start').disabled=!ready||running||busy;$('stop').disabled=!running||busy;
 $('history').disabled=running||busy;
 $('calibrate').disabled=!selected||running||busy||!selected.samples.length;
 for(const id of ['label-type','actual','range-start','range-end','notes','add-label'])$(id).disabled=running||busy||!selected;
 for(const id of ['download','share'])$(id).disabled=running||busy||!sessions.length;
 document.querySelectorAll('#saved-labels button').forEach(b=>b.disabled=running||busy);
 $('badge').textContent=running?'Recording':busy?'Processing':'Ready';
 $('model-info').textContent=`Model ${model.revision} · ${VERSION}`;
}
function history(){
 $('history').replaceChildren();
 if(!sessions.length){const o=new Option('No saved practices','');$('history').append(o);}
 for(const s of [...sessions].sort((a,b)=>b.startedAt.localeCompare(a.startedAt))){const o=new Option(`${new Date(s.startedAt).toLocaleString()} · ${TYPES[s.type]}${labelsFor(s).length?' · labeled':''}${s.endedAt?'':' · interrupted'}`,s.id);$('history').append(o);}
 if(selected)$('history').value=selected.id;
 const list=$('practice-history');list.replaceChildren();
 const all=mergeSummaries(summaries,sessions).filter(s=>!(running&&s.id===selected?.id));
 updateHistoryChart(all);
 const past=all.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,10);
 if(!past.length){const empty=document.createElement('li');empty.className='hint';empty.textContent='Your completed practices will appear here.';list.append(empty);}
 for(const s of past){
   const row=document.createElement('li');row.className='practice-row';
   const when=document.createElement('time');when.dateTime=s.startedAt;
   const date=new Date(s.startedAt),day=document.createElement('strong'),clock=document.createElement('span');
   day.textContent=date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
   clock.textContent=date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});when.append(day,clock);
   const duration=document.createElement('div'),durationLabel=document.createElement('span'),durationValue=document.createElement('strong');
   durationLabel.textContent='Duration';durationValue.textContent=fmt(s.duration);duration.append(durationLabel,durationValue);
   const count=document.createElement('div'),countLabel=document.createElement('span'),countValue=document.createElement('strong');
   countLabel.textContent='Suburi';countValue.textContent=['auto','stationary','jumping'].includes(s.type)?(s.stationary+s.jumping).toLocaleString():'—';count.append(countLabel,countValue);
   row.append(when,duration,count);
   if(!s.endedAt){const note=document.createElement('small');note.textContent='Interrupted / recovered';row.append(note);}
   list.append(row);
 }
}
async function persist(session,updatedModel=null){
 unsaved=true;
 if(!storageHealthy||!db){$('storage-status').textContent='Local saving unavailable. Export data before closing this page.';return false;}
 try{const result=await save(db,session,updatedModel);sessions=result.sessions.map(s=>s.id===selected?.id?selected:s);summaries=result.summaries;unsaved=false;$('storage-status').textContent='Saved on this browser. Export a backup for safekeeping.';return true;}
 catch{$('storage-status').textContent='Could not save on this phone. Data remains in memory; export before closing.';return false;}
}
const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
function render(){
 const s=selected,events=s?sessionEvents(s):[],supported=s&&['auto','stationary','jumping'].includes(s.type);
 const duration=running?(performance.now()-started)/1000:(s?.duration||0);
 $('count').textContent=s&&!supported?'—':events.length;$('count-label').textContent=s&&!supported?'data collection only':'estimated swings';
 $('stationary-count').textContent=events.filter(e=>e.type==='stationary').length;$('jumping-count').textContent=events.filter(e=>e.type==='jumping').length;
 const last=events.at(-1);$('activity').textContent=running?(last&&duration-last.time<=4?`Detected: ${TYPES[last.type]}`:'Listening for a repeating swing pattern…'):'Forward/backward suburi and hayasuburi are detected automatically.';
 $('duration').textContent=fmt(duration);$('samples').textContent=(s?.samples.length||0).toLocaleString();
 const rates=cadence(events),recent=rates.slice(-3);const fresh=recent.length&&duration-recent.at(-1).time<=4;
 $('pace').textContent=fresh?`${Math.round(recent.reduce((x,p)=>x+p.rate,0)/recent.length)} / min`:'—';
 draw(rates,events,duration);
 $('report-panel').hidden=!s||running;
 if(s&&!running)report(s);
}
function draw(points,events,duration){
 const c=$('chart'),width=c.clientWidth,height=c.clientHeight,dpr=window.devicePixelRatio||1;c.width=width*dpr;c.height=height*dpr;
 const ctx=c.getContext('2d');ctx.scale(dpr,dpr);const left=40,right=12,top=20,bottom=32,w=width-left-right,h=height-top-bottom;
 const maxTime=Math.max(10,duration),maxRate=Math.max(100,Math.ceil(Math.max(0,...points.map(p=>p.rate))/20)*20);
 ctx.font='11px system-ui';ctx.lineWidth=1;ctx.strokeStyle='#2a3a4c';ctx.fillStyle='#9dafc2';
 for(let i=0;i<=4;i++){const y=top+h-h*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();ctx.fillText(String(Math.round(maxRate*i/4)),2,y+4);}
 for(let i=0;i<=4;i++)ctx.fillText(`${Math.round(maxTime*i/4)}s`,left+w*i/4-8,height-8);
 const colors={stationary:'#b5f5cc',jumping:'#8fc7ff'};
 for(const type of ['stationary','jumping']){
   ctx.strokeStyle=colors[type];ctx.lineWidth=2;ctx.beginPath();let previous=null;
   for(const p of points){
     if(p.type!==type){previous=null;continue;}
     const x=left+p.time/maxTime*w,y=top+h-p.rate/maxRate*h;
     if(!previous||p.time-previous.time>4)ctx.moveTo(x,y);else ctx.lineTo(x,y);previous=p;
   }ctx.stroke();ctx.fillStyle=colors[type];
   for(const p of points.filter(p=>p.type===type)){
     const x=left+p.time/maxTime*w,y=top+h-p.rate/maxRate*h;
     if(type==='jumping')ctx.fillRect(x-3,y-3,6,6);else{ctx.beginPath();ctx.arc(x,y,3,0,2*Math.PI);ctx.fill();}
   }
   for(const e of events.filter(e=>e.type===type))ctx.fillRect(left+e.time/maxTime*w,top+h-4,1.5,4);
 }
 $('chart-summary').textContent=points.length?`${events.length} detected swings. Latest confirmed interval: ${points.at(-1).gap.toFixed(2)} seconds (${points.at(-1).rate.toFixed(0)} swings/min). ${running?'Provisional live estimate.':''}`:'The curve appears after two confirmed swings. Short or unrecognized sequences may not be counted.';
}
function report(s){
 const st=statistics(s),supported=['auto','stationary','jumping'].includes(s.type);$('report-type').textContent=TYPES[s.type];$('report').replaceChildren();
 const rate=v=>v===null?'—':`${v.toFixed(1)} / min`;
 const fields=[['Estimated swings',supported?st.count:'Record only'],['Forward/backward suburi',st.stationaryCount],['Hayasuburi',st.jumpingCount],['Session duration',fmt(st.duration)],['Mean interval cadence',rate(st.averageRate)],['Peak interval cadence',rate(st.peakRate)],['Median cadence',rate(st.medianRate)],['Whole-session rate',supported?rate(st.sessionRate):'—'],['Interval variation',st.intervalVariation===null?'—':`${st.intervalVariation.toFixed(1)}%`],['Sensor sample rate',st.sampleRate===null?'—':`${st.sampleRate.toFixed(1)} Hz`]];
 for(const l of labelsFor(s)){fields.push([`${TYPES[l.type]} actual (${l.range[0]}–${l.range[1]} s)`,l.count]);if(l.predictedAfter!=null)fields.push(['Estimated after calibration in this range',l.predictedAfter]);}
 for(const [label,value]of fields){const box=document.createElement('div'),title=document.createElement('span'),strong=document.createElement('strong');title.textContent=label;strong.textContent=value;box.append(title,strong);$('report').append(box);}
 $('report-note').textContent=`${s.endedAt?'Completed':'Interrupted / recovered'} session · detector revision ${s.model.revision}. Cadence uses confirmed intervals up to 4 seconds; gaps and type transitions are excluded. Lower interval variation means more even timing, not better technique. Whole-session rate includes preparation and rests. ${s.recalculatedAt?'Report recalculated after calibration; original recording analysis is preserved in the export.':'Report uses the settings from recording.'}`;
}
async function refreshCalibration(s){
 const request=++plotRequest;plotData=null;plotSession=null;$('calibration-plots').hidden=true;
 const effect=s.calibration?.comparison;
 $('calibration-effect').textContent=effect?`Latest calibration — labeled ${effect.range[0]}–${effect.range[1]} s: ${effect.beforeRange??'—'} → ${effect.afterRange??'—'} ${TYPES[effect.type]} (actual ${effect.actual}).\nWhole practice: forward/backward ${effect.beforeStationary} → ${effect.afterStationary}; hayasuburi ${effect.beforeJumping} → ${effect.afterJumping}. Counts, report, history and cadence chart now use the recalculated results.`:'';
 try{const data=await workerCall('prepare',{samples:s.samples,templates,model:s.model});if(request!==plotRequest||selected!==s||running)return;plotData=data;plotSession=s;$('calibration-plots').hidden=false;drawCalibration(data.segments,s,data.trial);}
 catch(e){if(request===plotRequest)$('threshold-summary').textContent=`Plot unavailable: ${e.message}`;}
}
function labelForm(index=-1){
 editingLabel=index;const l=labelsFor(selected)[index];
 $('label-type').value=l?.type||'stationary';$('actual').value=l?.count??'';
 $('range-start').value=l?.range[0]??0;$('range-end').value=l?.range[1]??(selected.samples.at(-1)?.[0]||selected.duration).toFixed(2);$('notes').value=l?.notes||'';
 $('calibrate').textContent=l?'Update label & adjust detector':'Save label & adjust detector';
 $('label-editing').textContent=l?`Editing label ${index+1}`:'Adding a new labeled range';
}
function renderLabels(){
 const list=$('saved-labels');list.replaceChildren();
 labelsFor(selected).forEach((l,i)=>{const row=document.createElement('li'),text=document.createElement('span');text.textContent=`${l.range[0]}–${l.range[1]} s · ${TYPES[l.type]} · actual ${l.count}${l.predictedAfter!=null?` · estimated ${l.predictedAfter}`:''}`;
 const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=()=>labelForm(i);
 const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.onclick=async()=>{
 if(running||busy)return;busy=true;controls();const old=labelsFor(selected);(selected.labelHistory??=[]).push({action:'remove',label:structuredClone(old[i]),at:new Date().toISOString()});selected.labels=old.filter((_,j)=>j!==i);delete selected.label;
 if(selected.calibration?.comparison)delete selected.calibration.comparison;
 await persist(selected);if(!sessions.some(s=>s.id===selected.id))selected=sessions[0];
 busy=false;if(selected){choose(selected);$('calibration-status').textContent='Label removed from future calibration. Existing model settings and counts are unchanged until you save a label and recalibrate.';}controls();
 };
 row.append(text,edit,remove);list.append(row);});
}
$('add-label').onclick=()=>{if(selected&&!running&&!busy)labelForm();};
function choose(s){selected=s;labelForm(labelsFor(s).length?0:-1);renderLabels();refreshCalibration(s);history();controls();render();$('calibration-status').textContent=s.calibration?.message||'Add a type, count and time range, then save to calibrate.';}
async function acquireWake(){try{const lock=await navigator.wakeLock?.request('screen');if(running)wakeLock=lock;else await lock?.release();}catch{}}
function motion(event){
 if(!running)return;const a=event.acceleration;if(!a||![a.x,a.y,a.z].every(Number.isFinite))return;
 const now=performance.now(),t=(now-started)/1000;if(selected.samples.length&&t<=selected.samples.at(-1)[0])return;
 const optional=v=>v&&Number.isFinite(v)?v: v===0?0:null;
 const g=event.accelerationIncludingGravity,r=event.rotationRate;
 selected.samples.push([t,a.x,a.y,a.z,...[g?.x,g?.y,g?.z,r?.alpha,r?.beta,r?.gamma].map(optional)]);lastSample=now;unsaved=true;
 if(selected.samples.length>=MAX_SAMPLES)finish('Reached 36,000 samples (about 10 minutes). Start a new session after saving.');
}
async function updateDetection(s){const detections=await workerCall('detect',{samples:s.samples,templates,model:s.model,settings:s.model.settings});s.detections=detections;return detections;}
async function finish(message='Practice finished. Review your report or enter a calibration label.'){
 if(!running)return;running=false;busy=true;selected.duration=(performance.now()-started)/1000;selected.endedAt=new Date().toISOString();selected.stopReason=message;
 window.removeEventListener('devicemotion',motion);wakeLock?.release().catch(()=>{});wakeLock=null;controls();$('status').textContent='Finalizing practice…';
 try{await updateDetection(selected);await persist(selected);choose(selected);$('status').textContent=message;}
 catch(e){$('status').textContent=`Analysis failed: ${e.message}. Raw data can still be exported.`;await persist(selected);}
 finally{busy=false;controls();render();}
}
$('start').onclick=async()=>{
 if(running||busy||!ready)return;
 if(!window.isSecureContext||!window.DeviceMotionEvent){$('status').textContent='Motion recording needs HTTPS and a supported phone browser.';return;}
 busy=true;let recorded=false;controls();
 try{
 if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted')throw Error('Motion permission denied. Allow motion access in browser settings.');
 if(document.hidden)throw Error('Return to this page before starting.');
 selected={id:crypto.randomUUID(),startedAt:new Date().toISOString(),type:'auto',duration:0,samples:[],detections:{stationary:[],jumping:[]},model:structuredClone(model),labels:[]};sessions.push(selected);started=performance.now();lastSample=started;lastCheckpoint=started;running=true;recorded=true;plotRequest++;$('calibration-plots').hidden=true;$('calibration-effect').textContent='';
 window.addEventListener('devicemotion',motion);acquireWake();choose(selected);$('status').textContent='Recording. Put the phone in the calibrated pocket and find your rhythm.';$('calibration-status').textContent='Finish, then enter the actual count and type to calibrate.';await persist(selected);
 }catch(e){$('status').textContent=e.message;}finally{if(!recorded||running)busy=false;controls();}
};
$('stop').onclick=()=>finish();
$('history').onchange=()=>{const s=sessions.find(s=>s.id===$('history').value);if(s)choose(s);};
$('label-type').onchange=()=>{if($('label-type').value==='other')$('actual').value=0;};
$('label-form').onsubmit=async event=>{
 event.preventDefault();if(running||busy||!selected)return;
 const count=Number($('actual').value),from=Number($('range-start').value),to=Number($('range-end').value),type=$('label-type').value;
 if(!Number.isInteger(count)||count<0||count>2000||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>selected.duration+.05||(type==='other'&&count!==0)){ $('calibration-status').textContent='Enter a whole count (0–2000), valid time range inside this session, and zero swings for walking / other.';return;}
 if(overlaps(labelsFor(selected),[from,to],editingLabel)){$('calibration-status').textContent='This range overlaps another label. Use non-overlapping ranges; adjacent ranges may share an endpoint.';return;}
 const subset=selected.samples.filter(r=>r[0]>=from&&r[0]<=to);if(subset.length<120){$('calibration-status').textContent='Select at least two seconds of valid sensor data.';return;}
 busy=true;controls();$('calibration-status').textContent='Comparing settings against saved labeled sessions…';
 try{
 const rangeDetection=await workerCall('detect',{samples:subset,templates,model:selected.model,settings:selected.model.settings});
 const labels=labelsFor(selected).slice();if(editingLabel>=0)(selected.labelHistory??=[]).push(structuredClone(labels[editingLabel]));
 const active={type,count,range:[from,to],notes:$('notes').value.trim(),labeledAt:new Date().toISOString(),predictionAlgorithmVersion:VERSION,predictedBefore:rangeDetection[type]?.length??null};
 if(editingLabel<0){editingLabel=labels.length;labels.push(active);}else labels[editingLabel]=active;
 selected.labels=labels;delete selected.label;
 // Label is durable even if fitting later fails.
 await persist(selected);
 const fit=await workerCall('calibrate',{sessions,templates,model,settings:model.settings,type});
 if(fit.changed){model={...model,...fit.learnedTemplates,previousModel:model,version:VERSION,revision:model.revision+1,settings:fit.settings,updatedAt:new Date().toISOString(),calibrationSessionIds:sessions.filter(s=>labelsFor(s).length).map(s=>s.id)};}
 if(selected.calibration)(selected.calibrationHistory??=[]).push(structuredClone(selected.calibration));
 const beforeSettings=structuredClone(selected.model.settings),before=structuredClone(selected.detections);
 const after=await workerCall('detect',{samples:selected.samples,templates,model,settings:model.settings});
 const afterRange=await workerCall('detect',{samples:subset,templates,model,settings:model.settings});
 selected.originalAnalysis??={model:structuredClone(selected.model),detections:before,type:selected.type};
 selected.calibration={...fit,settings:structuredClone(fit.settings),modelRevision:model.revision,beforeSettings,
 comparison:{type,range:[from,to],actual:count,beforeRange:active.predictedBefore,afterRange:afterRange[type]?.length??null,beforeStationary:before.stationary.length,afterStationary:after.stationary.length,beforeJumping:before.jumping.length,afterJumping:after.jumping.length}};
 for(const label of selected.labels){const d=await workerCall('detect',{samples:selected.samples.filter(r=>r[0]>=label.range[0]&&r[0]<=label.range[1]),templates,model,settings:model.settings});label.predictedAfter=d[label.type]?.length??null;label.predictionAlgorithmVersion=VERSION;}
 selected.detections=after;selected.model=structuredClone(model);selected.recalculatedAt=new Date().toISOString();
 if(['stationary','jumping'].includes(selected.type))selected.type='auto';
 await persist(selected,model);$('calibration-status').textContent=fit.message;history();render();renderLabels();refreshCalibration(selected);
 }catch(e){$('calibration-status').textContent=`Could not adjust settings: ${e.message}. Export the labeled recording for analysis.`;}
 finally{busy=false;renderLabels();controls();}
};
function exportFile(){
 const list=$('export-scope').value==='selected'&&selected?[selected]:[...sessions].sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
 const payload={schema:'phoneapps.suburi.dataset',schemaVersion:2,algorithmVersion:VERSION,exportedAt:new Date().toISOString(),
 units:{time:'seconds since start, monotonic browser receipt time',acceleration:'m/s²',rotation:'degrees/second'},
 sampleColumns:['elapsed_s','linear_x','linear_y','linear_z','including_gravity_x','including_gravity_y','including_gravity_z','rotation_alpha','rotation_beta','rotation_gamma'],
 notes:'Null means unavailable. Actual labels apply only to each labels[].range. Estimates are body-motion candidates, not verified sword strikes. Model changes are fitted on saved calibration sessions.',
 practiceSummaries:mergeSummaries(summaries,sessions).filter(s=>$('export-scope').value!=='selected'||s.id===selected?.id),
 model:structuredClone(model),stationaryTemplates:model.stationaryTemplates||templates,baseStationaryTemplates:templates,baseHayasuburiTemplate:defaultHayasuburiTemplate,sessions:list.map(s=>{const {label,...record}=s;return {...record,labels:labelsFor(s),statistics:statistics(s)};})};
 return new File([JSON.stringify(payload)],`suburi-data-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,{type:'application/json'});
}
$('download').onclick=()=>{download(exportFile());$('export-status').textContent='Download requested. Check your downloads or save dialog.';};
$('share').onclick=async()=>{const file=shareFile(exportFile());if(!navigator.canShare?.({files:[file]})){$('export-status').textContent='File sharing is unavailable. Export data, then attach the saved file in your email or Drive app.';return;}busy=true;controls();try{await navigator.share({files:[file],title:file.name});$('export-status').textContent='File handed to the selected app. Complete sending or saving there.';}catch(e){$('export-status').textContent=shareFailure(e);}finally{busy=false;controls();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)finish('Stopped because the page was hidden. Your practice is preserved.');});
window.addEventListener('pagehide',()=>{if(running){selected.duration=(performance.now()-started)/1000;persist(selected);}});
window.addEventListener('beforeunload',e=>{if(running||unsaved){e.preventDefault();e.returnValue='';}});
window.addEventListener('resize',()=>{render();if(plotData&&plotSession&&!running)drawCalibration(plotData.segments,plotSession,plotData.trial);});
setInterval(()=>{if(running&&performance.now()-lastSample>5000)finish('No valid linear acceleration for five seconds. Check motion permission and device support.');render();},250);
setInterval(async()=>{
 if(!running||livePending)return;const s=selected;livePending=true;
 try{await updateDetection(s);if(running&&selected===s){s.duration=(performance.now()-started)/1000;if(performance.now()-lastCheckpoint>5000){lastCheckpoint=performance.now();await persist(s);}}}
 catch(e){$('status').textContent=`Live analysis unavailable: ${e.message}. Finish to save data.`;}
 finally{livePending=false;}
},1200);
function validSession(s){
 const events=d=>d&&['stationary','jumping'].every(k=>Array.isArray(d[k])&&d[k].every(e=>e&&Number.isFinite(e.time)&&e.time>=0));

 return s&&typeof s.id==='string'&&Number.isFinite(Date.parse(s.startedAt))&&s.type in TYPES&&Array.isArray(s.samples)&&s.samples.length<=MAX_SAMPLES&&s.samples.every(r=>Array.isArray(r)&&r.length>=4&&r.slice(0,4).every(Number.isFinite))&&s.model&&validSettings(s.model.settings)&&validModelTemplates(s.model)&&Number.isFinite(s.duration)&&s.duration>=0&&events(s.detections)&&validLabels(s);
}
async function init(){
 try{const response=await fetch('./templates.json');if(!response.ok)throw Error('Template file unavailable');templates=await response.json();if(templates.length!==2||!templates.every(t=>t.length===61&&t.every(r=>r.length===3&&r.every(Number.isFinite))))throw Error('Invalid templates');
 worker=new Worker(new URL('./worker.mjs?v=1.5.0',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const job=pending.get(data.id);if(job){pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);}};worker.onerror=()=>{for(const p of pending.values())p.reject(Error('Detector worker failed'));pending.clear();ready=false;controls();};
 try{db=await openDatabase();const data=await readAll(db);if(!data.sessions.every(validSession)||!validSummaries(data.summaries))throw Error('Saved data or model is incompatible');const nextModel=migrateModel(data.model);sessions=data.sessions;summaries=data.summaries;model=nextModel;const retained=await save(db,null,model);sessions=retained.sessions;summaries=retained.summaries;}
 catch(e){storageHealthy=false;$('storage-status').textContent=`Local history unavailable (${e.message}). Existing data will not be overwritten. Export new sessions before closing.`;}
 ready=true;if(sessions.length)choose([...sessions].sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]);else history();controls();render();$('status').textContent='Ready. Record a practice, then optionally add the actual count for calibration.';
 }catch(e){$('status').textContent=`Could not initialize: ${e.message}. Reload while online.`;}
}
init();
