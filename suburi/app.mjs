import {VERSION,DEFAULTS,validSettings,migrateModel} from './detector.mjs?v=1.1.1';
import {openDatabase,readAll,save} from './storage.mjs';
import {cadence,statistics,sessionEvents} from './stats.mjs?v=1.1.1';
import {loadGoogle,download,upload,shareFile,shareFailure} from './export.mjs?v=1.1.2';
const $=id=>document.getElementById(id),TYPES={auto:'Automatic',stationary:'Forward/backward suburi',jumping:'Hayasuburi',forward:'Forward-moving',other:'Walking / other'};
const MAX_SAMPLES=36000,MAX_SESSIONS=30;
let db,templates,model={version:VERSION,revision:0,settings:{...DEFAULTS}},sessions=[],selected=null,running=false,busy=false,ready=false;
let started=0,lastSample=0,worker,sequence=0,wakeLock=null,storageHealthy=true,unsaved=false,livePending=false,lastCheckpoint=0;
const pending=new Map();
function workerCall(action,args){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,...args});});}
function controls(){
 $('start').disabled=!ready||running||busy;$('stop').disabled=!running||busy;
 $('history').disabled=running||busy;
 $('calibrate').disabled=!selected||running||busy||!selected.samples.length;
 for(const id of ['label-type','actual','range-start','range-end','notes'])$(id).disabled=running||busy||!selected;
 for(const id of ['download','share','drive'])$(id).disabled=running||busy||!sessions.length;
 $('badge').textContent=running?'Recording':busy?'Processing':'Ready';
 $('model-info').textContent=`Model ${model.revision} · ${VERSION}`;
}
function history(){
 $('history').replaceChildren();
 if(!sessions.length){const o=new Option('No saved practices','');$('history').append(o);}
 for(const s of [...sessions].sort((a,b)=>b.startedAt.localeCompare(a.startedAt))){const o=new Option(`${new Date(s.startedAt).toLocaleString()} · ${TYPES[s.type]}${s.label?' · labeled':''}${s.endedAt?'':' · interrupted'}`,s.id);$('history').append(o);}
 if(selected)$('history').value=selected.id;
 const list=$('practice-history');list.replaceChildren();
 const past=sessions.filter(s=>!(running&&s.id===selected?.id)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
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
   countLabel.textContent='Suburi';countValue.textContent=['auto','stationary','jumping'].includes(s.type)?sessionEvents(s).length.toLocaleString():'—';count.append(countLabel,countValue);
   row.append(when,duration,count);
   if(!s.endedAt){const note=document.createElement('small');note.textContent='Interrupted / recovered';row.append(note);}
   list.append(row);
 }
}
async function persist(session,updatedModel=null){
 unsaved=true;
 if(!storageHealthy||!db){$('storage-status').textContent='Local saving unavailable. Export data before closing this page.';return false;}
 try{await save(db,session,updatedModel);unsaved=false;$('storage-status').textContent='Saved on this browser. Export a backup for safekeeping.';return true;}
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
 if(s.label){fields.push(['Actual count (labeled range)',s.label.count],['Estimated in labeled range',s.label.predictedBefore??'No detector']);if(s.label.predictedBefore!==null)fields.push(['Count error before calibration',`${s.label.predictedBefore-s.label.count>=0?'+':''}${s.label.predictedBefore-s.label.count}`]);}
 for(const [label,value]of fields){const box=document.createElement('div'),title=document.createElement('span'),strong=document.createElement('strong');title.textContent=label;strong.textContent=value;box.append(title,strong);$('report').append(box);}
 $('report-note').textContent=`${s.endedAt?'Completed':'Interrupted / recovered'} session · detector revision ${s.model.revision}. Cadence uses confirmed intervals up to 4 seconds; gaps and type transitions are excluded. Lower interval variation means more even timing, not better technique. Whole-session rate includes preparation and rests. Reports retain the settings used during recording.`;
}
function choose(s){selected=s;$('label-type').value=s.label?.type||(s.type==='auto'?((s.detections?.jumping?.length||0)>(s.detections?.stationary?.length||0)?'jumping':'stationary'):s.type);$('actual').value=s.label?.count??'';$('range-start').value=s.label?.range[0]??0;$('range-end').value=s.label?.range[1]??(s.samples.at(-1)?.[0]||s.duration).toFixed(2);$('notes').value=s.label?.notes||'';history();controls();render();$('calibration-status').textContent=s.calibration?.message||(s.label?'Label saved. You can correct it and recalibrate.':'Enter the actual count and type for this practice to calibrate.');}
async function acquireWake(){try{const lock=await navigator.wakeLock?.request('screen');if(running)wakeLock=lock;else await lock?.release();}catch{}}
function motion(event){
 if(!running)return;const a=event.acceleration;if(!a||![a.x,a.y,a.z].every(Number.isFinite))return;
 const now=performance.now(),t=(now-started)/1000;if(selected.samples.length&&t<=selected.samples.at(-1)[0])return;
 const optional=v=>v&&Number.isFinite(v)?v: v===0?0:null;
 const g=event.accelerationIncludingGravity,r=event.rotationRate;
 selected.samples.push([t,a.x,a.y,a.z,...[g?.x,g?.y,g?.z,r?.alpha,r?.beta,r?.gamma].map(optional)]);lastSample=now;unsaved=true;
 if(selected.samples.length>=MAX_SAMPLES)finish('Reached 36,000 samples (about 10 minutes). Start a new session after saving.');
}
async function updateDetection(s){const detections=await workerCall('detect',{samples:s.samples,templates,settings:s.model.settings});s.detections=detections;return detections;}
async function finish(message='Practice finished. Review your report or enter a calibration label.'){
 if(!running)return;running=false;busy=true;selected.duration=(performance.now()-started)/1000;selected.endedAt=new Date().toISOString();selected.stopReason=message;
 window.removeEventListener('devicemotion',motion);wakeLock?.release().catch(()=>{});wakeLock=null;controls();$('status').textContent='Finalizing practice…';
 try{await updateDetection(selected);await persist(selected);choose(selected);$('status').textContent=message;}
 catch(e){$('status').textContent=`Analysis failed: ${e.message}. Raw data can still be exported.`;await persist(selected);}
 finally{busy=false;controls();render();}
}
$('start').onclick=async()=>{
 if(running||busy||!ready)return;
 if(sessions.length>=MAX_SESSIONS){$('status').textContent='This browser has 30 saved practices. Export your data, then clear this site’s storage to begin a new collection.';return;}
 if(!window.isSecureContext||!window.DeviceMotionEvent){$('status').textContent='Motion recording needs HTTPS and a supported phone browser.';return;}
 busy=true;let recorded=false;controls();
 try{
 if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted')throw Error('Motion permission denied. Allow motion access in browser settings.');
 if(document.hidden)throw Error('Return to this page before starting.');
 selected={id:crypto.randomUUID(),startedAt:new Date().toISOString(),type:'auto',duration:0,samples:[],detections:{stationary:[],jumping:[]},model:structuredClone(model),label:null};sessions.push(selected);started=performance.now();lastSample=started;lastCheckpoint=started;running=true;recorded=true;
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
 const subset=selected.samples.filter(r=>r[0]>=from&&r[0]<=to);if(subset.length<120){$('calibration-status').textContent='Select at least two seconds of valid sensor data.';return;}
 busy=true;controls();$('calibration-status').textContent='Comparing settings against saved labeled sessions…';
 try{
 const rangeDetection=await workerCall('detect',{samples:subset,templates,settings:selected.model.settings});
 if(selected.label)(selected.labelHistory??=[]).push(structuredClone(selected.label));
 selected.label={type,count,range:[from,to],notes:$('notes').value.trim(),labeledAt:new Date().toISOString(),predictionAlgorithmVersion:VERSION,predictedBefore:rangeDetection[type]?.length??null};
 // Label is durable even if fitting later fails.
 await persist(selected);
 const fit=await workerCall('calibrate',{sessions,templates,settings:model.settings,type});
 if(fit.changed){model={previousModel:model,version:VERSION,revision:model.revision+1,settings:fit.settings,updatedAt:new Date().toISOString(),calibrationSessionIds:sessions.filter(s=>s.label).map(s=>s.id)};}
 if(selected.calibration)(selected.calibrationHistory??=[]).push(structuredClone(selected.calibration));
 selected.calibration={...fit,settings:structuredClone(fit.settings),modelRevision:model.revision};
 await persist(selected,model);$('calibration-status').textContent=fit.message;history();render();
 }catch(e){$('calibration-status').textContent=`Could not adjust settings: ${e.message}. Export the labeled recording for analysis.`;}
 finally{busy=false;controls();}
};
function exportFile(){
 const list=$('export-scope').value==='selected'&&selected?[selected]:sessions;
 const payload={schema:'phoneapps.suburi.dataset',schemaVersion:1,algorithmVersion:VERSION,exportedAt:new Date().toISOString(),
 units:{time:'seconds since start, monotonic browser receipt time',acceleration:'m/s²',rotation:'degrees/second'},
 sampleColumns:['elapsed_s','linear_x','linear_y','linear_z','including_gravity_x','including_gravity_y','including_gravity_z','rotation_alpha','rotation_beta','rotation_gamma'],
 notes:'Null means unavailable. Actual labels apply only to label.range. Estimates are body-motion candidates, not verified sword strikes. Model changes are fitted on saved calibration sessions.',
 model:structuredClone(model),stationaryTemplates:templates,sessions:list.map(s=>({...s,statistics:statistics(s)}))};
 return new File([JSON.stringify(payload)],`suburi-data-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,{type:'application/json'});
}
$('download').onclick=()=>{download(exportFile());$('export-status').textContent='Download requested. Check your downloads or save dialog.';};
$('share').onclick=async()=>{const file=shareFile(exportFile());if(!navigator.canShare?.({files:[file]})){$('export-status').textContent='File sharing is unavailable. Export data, then attach the saved file in your email or Drive app.';return;}busy=true;controls();try{await navigator.share({files:[file],title:file.name});$('export-status').textContent='File handed to the selected app. Complete sending or saving there.';}catch(e){$('export-status').textContent=shareFailure(e);}finally{busy=false;controls();}};
$('client-id').value=window.SUBURI_CONFIG?.googleClientId||'';
const prepareGoogle=()=>{if($('client-id').value.trim())loadGoogle().catch(()=>{});};$('client-id').onchange=prepareGoogle;prepareGoogle();
$('drive').onclick=async()=>{
 const client=$('client-id').value.trim();if(!client.endsWith('.apps.googleusercontent.com')){document.querySelector('details').open=true;$('client-id').focus();$('export-status').textContent='Enter a Google OAuth web client ID, or export the file and upload it in Drive.';return;}
 busy=true;controls();$('drive-link').hidden=true;
 try{if(!window.google?.accounts?.oauth2){$('export-status').textContent='Loading Google sign-in…';await loadGoogle();$('export-status').textContent='Sign-in is ready. Tap Upload to Google Drive again.';return;}
 $('export-status').textContent='Sign in to upload the export to My Drive…';const url=await upload(exportFile(),client);$('drive-link').href=url;$('drive-link').hidden=false;$('export-status').textContent='Data uploaded to My Drive.';
 }catch(e){$('export-status').textContent=`${e.message} Data remains available. If the connection was interrupted, check My Drive before retrying.`;}finally{busy=false;controls();}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)finish('Stopped because the page was hidden. Your practice is preserved.');});
window.addEventListener('pagehide',()=>{if(running){selected.duration=(performance.now()-started)/1000;persist(selected);}});
window.addEventListener('beforeunload',e=>{if(running||unsaved){e.preventDefault();e.returnValue='';}});
window.addEventListener('resize',render);
setInterval(()=>{if(running&&performance.now()-lastSample>5000)finish('No valid linear acceleration for five seconds. Check motion permission and device support.');render();},250);
setInterval(async()=>{
 if(!running||livePending)return;const s=selected;livePending=true;
 try{await updateDetection(s);if(running&&selected===s){s.duration=(performance.now()-started)/1000;if(performance.now()-lastCheckpoint>5000){lastCheckpoint=performance.now();await persist(s);}}}
 catch(e){$('status').textContent=`Live analysis unavailable: ${e.message}. Finish to save data.`;}
 finally{livePending=false;}
},1200);
function validSession(s){
 const events=d=>d&&['stationary','jumping'].every(k=>Array.isArray(d[k])&&d[k].every(e=>e&&Number.isFinite(e.time)&&e.time>=0));
 const label=l=>!l||(l.type in TYPES&&Number.isInteger(l.count)&&l.count>=0&&Array.isArray(l.range)&&l.range.length===2&&l.range.every(Number.isFinite)&&l.range[0]>=0&&l.range[1]>l.range[0]);
 return s&&typeof s.id==='string'&&Number.isFinite(Date.parse(s.startedAt))&&s.type in TYPES&&Array.isArray(s.samples)&&s.samples.length<=MAX_SAMPLES&&s.samples.every(r=>Array.isArray(r)&&r.length>=4&&r.slice(0,4).every(Number.isFinite))&&s.model&&validSettings(s.model.settings)&&Number.isFinite(s.duration)&&s.duration>=0&&events(s.detections)&&label(s.label);
}
async function init(){
 try{const response=await fetch('./templates.json');if(!response.ok)throw Error('Template file unavailable');templates=await response.json();if(templates.length!==2||!templates.every(t=>t.length===61&&t.every(r=>r.length===3&&r.every(Number.isFinite))))throw Error('Invalid templates');
 worker=new Worker(new URL('./worker.mjs?v=1.1.1',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const job=pending.get(data.id);if(job){pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);}};worker.onerror=()=>{for(const p of pending.values())p.reject(Error('Detector worker failed'));pending.clear();ready=false;controls();};
 try{db=await openDatabase();const data=await readAll(db);if(!data.sessions.every(validSession)||data.sessions.length>MAX_SESSIONS)throw Error('Saved data or model is incompatible');const nextModel=migrateModel(data.model);sessions=data.sessions;model=nextModel;if(data.model&&data.model.version!==VERSION){await save(db,null,model);$('storage-status').textContent='Detector updated. Your saved practices, labels and previous settings are preserved.';}}
 catch(e){storageHealthy=false;$('storage-status').textContent=`Local history unavailable (${e.message}). Existing data will not be overwritten. Export new sessions before closing.`;}
 ready=true;if(sessions.length)choose([...sessions].sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0]);else history();controls();render();$('status').textContent='Ready. Record a practice, then optionally add the actual count for calibration.';
 }catch(e){$('status').textContent=`Could not initialize: ${e.message}. Reload while online.`;}
}
init();
