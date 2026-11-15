import { JumpDetector } from './detector.mjs';
const $ = id => document.getElementById(id);
const key = 'jump-rope-workouts-v1';
const detector = new JumpDetector();
let workouts = [], workout = null, running = false, busy = false, activeSince = 0, elapsed = 0, wakeLock = null, lastSample = 0, received = false;
let storageHealthy = true;
try {
  workouts = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(workouts) || !workouts.every(w => w && typeof w.id === 'string' && Number.isFinite(w.count) && w.count >= 0 && Number.isFinite(w.durationMs) && w.durationMs >= 0 && Number.isFinite(Date.parse(w.startedAt)))) throw Error();
} catch { storageHealthy = false; workouts = []; $('storageError').textContent = 'Saved history could not be read. Existing storage will not be overwritten. Export this session before closing.'; }
const formatTime = ms => `${Math.floor(ms/60000).toString().padStart(2,'0')}:${Math.floor(ms/1000%60).toString().padStart(2,'0')}`;
const activeMs = () => elapsed + (running ? performance.now()-activeSince : 0);
function persist() {
  if (!storageHealthy) return false;
  try { localStorage.setItem(key,JSON.stringify(workouts)); $('storageError').textContent = ''; return true; }
  catch { $('storageError').textContent = 'Could not save on this phone. Export a backup before closing.'; return false; }
}
function checkpoint() {
  if (!workout) return;
  workout.durationMs = Math.round(activeMs());
  workout.updatedAt = new Date().toISOString();
  persist();
}
function renderHistory() {
  $('history').replaceChildren();
  if (!workouts.length) { $('history').textContent = 'Your first workout starts here.'; return; }
  for (const w of [...workouts].reverse()) {
    const row = document.createElement('div'); row.className = 'workout';
    const left = document.createElement('div'); const count = document.createElement('strong'); count.textContent = `${w.count} jumps`;
    const meta = document.createElement('small'); meta.textContent = `${formatTime(w.durationMs)} · ${w.endedAt ? 'Completed' : 'Unfinished / recovered'}`;
    left.append(count,meta); const date = document.createElement('time'); date.dateTime = w.startedAt; date.textContent = new Date(w.startedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    row.append(left,date); $('history').append(row);
  }
}
async function releaseWake() { const lock = wakeLock; wakeLock = null; if (lock) await lock.release().catch(()=>{}); }
async function acquireWake() {
  try { const lock = await navigator.wakeLock?.request('screen'); if (!running) await lock?.release(); else wakeLock = lock; } catch { /* Counting works while screen stays on. */ }
}
function pause(message = 'Paused — resume when ready') {
  if (!running) return;
  elapsed = activeMs(); running = false; window.removeEventListener('devicemotion',onMotion); detector.reset();
  checkpoint(); releaseWake(); $('start').textContent = 'Resume'; $('status').textContent = message; renderHistory();
}
function onMotion(event) {
  if (!running) return;
  const a = event.accelerationIncludingGravity;
  if (!a || ![a.x,a.y,a.z].every(v => typeof v === 'number' && Number.isFinite(v))) return;
  const now = performance.now(); lastSample = now; received = true;
  if (detector.sample(a.x,a.y,a.z,now)) { workout.count++; $('count').textContent = workout.count; checkpoint(); }
  $('status').textContent = now < detector.warmUntil ? 'Hold still briefly…' : 'Find your rhythm';
}
$('start').onclick = async () => {
  if (busy) return;
  if (running) { pause(); return; }
  if (!window.isSecureContext || !window.DeviceMotionEvent) { $('message').textContent = 'Motion sensors need HTTPS and a supported phone browser. Open this app in Chrome on your Fold.'; return; }
  busy = true; $('start').disabled = true;
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') throw Error('Motion permission was denied. Allow motion access in browser settings and try again.');
    if (document.hidden) return;
    if (!workout) { workout = {id:crypto.randomUUID(), startedAt:new Date().toISOString(),count:0,durationMs:0}; workouts.push(workout); elapsed = 0; $('count').textContent = '0'; persist(); }
    detector.reset(); received = false; activeSince = performance.now(); lastSample = activeSince; running = true;
    window.addEventListener('devicemotion',onMotion); acquireWake();
    $('start').textContent = 'Pause'; $('finish').disabled = false; $('status').textContent = 'Hold still briefly…';
    $('message').textContent = 'Keep your hand near your waist. Keep the app visible and screen unlocked.';
  } catch (error) { $('message').textContent = error.message; }
  finally { busy = false; $('start').disabled = false; }
};
$('finish').onclick = () => {
  if (!workout) return;
  pause(); workout.endedAt = new Date().toISOString(); const saved = persist(); workout = null;
  $('status').textContent = saved ? 'Workout saved on this phone' : 'Workout kept in memory — export now';
  $('start').textContent = 'Start jumping'; $('finish').disabled = true; renderHistory();
};
$('sensitivity').oninput = () => { const level = Number($('sensitivity').value); detector.threshold = [4.5,3.5,2.5,1.8,1.2][level-1]; detector.reset(); $('sensitivityValue').textContent = ['Lowest','Low','Balanced','High','Highest'][level-1]; };
$('export').onclick = () => {
  checkpoint(); const blob = new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),workouts},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `jump-rope-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener('visibilitychange',()=> { if (document.hidden) pause('Paused while app is hidden'); });
window.addEventListener('pagehide',()=>pause());
setInterval(()=> {
  const ms = activeMs(); $('duration').textContent = formatTime(ms);
  $('pace').textContent = workout && ms >= 1000 ? Math.round(workout.count*60000/ms) : '—';
  if (running && performance.now()-lastSample > 3000) { pause('Motion sensor unavailable'); $('message').textContent = received ? 'Motion updates stopped. Resume with the app visible.' : 'No motion data received. Allow motion sensors in your browser’s site settings, then resume.'; }
},250);
setInterval(()=> { if (running) checkpoint(); },2000);
renderHistory();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
