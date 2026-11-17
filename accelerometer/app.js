import { MAX_SAMPLES, readAxes, csvBlob, csvName } from './recording.js';
const $ = id => document.getElementById(id);
let samples = [], recording = false, starting = false, exporting = false;
let startTime = 0, startMono = 0, duration = 0, mode = 'gravity', timer, sensorTimer, wakeLock;
let saved = true, googleReady;
$('client-id').value = window.ACCELEROMETER_CONFIG?.googleClientId || '';
function controls() {
  $('start').disabled = recording || starting || exporting;
  $('stop').disabled = !recording;
  $('mode').disabled = recording || starting;
  for (const id of ['download', 'share', 'drive']) $(id).disabled = !samples.length || recording || starting || exporting;
  $('badge').textContent = recording ? 'Recording' : samples.length ? 'Captured' : 'Ready';
}
function render() {
  const ms = recording ? performance.now() - startMono : duration;
  $('elapsed').textContent = `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms / 1000 % 60).toFixed(1).padStart(4, '0')}`;
  $('count').textContent = samples.length.toLocaleString();
  const span = samples.length > 1 ? samples.at(-1)[0] - samples[0][0] : 0;
  $('rate').textContent = span > 0 ? `${((samples.length - 1) * 1000 / span).toFixed(1)} Hz` : '— Hz';
  const last = samples.at(-1);
  ['x', 'y', 'z'].forEach((id, i) => { $(id).textContent = last ? last[i + 1].toFixed(3) : '—'; });
  const canvas = $('plot'), width = canvas.clientWidth, height = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const recent = samples.slice(-240);
  const scale = Math.max(12, ...recent.flatMap(row => row.slice(1).map(Math.abs))) * 1.15;
  ctx.strokeStyle = '#243648'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, height * i / 4); ctx.lineTo(width, height * i / 4); ctx.stroke(); }
  ctx.fillStyle = '#9dafc2'; ctx.font = '10px system-ui'; ctx.fillText(`±${scale.toFixed(1)} m/s²`, 8, 15);
  ['#b5f5cc', '#8fc7ff', '#ffc08b'].forEach((color, axis) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.beginPath();
    recent.forEach((row, i) => {
      const x = i / 239 * width, y = height / 2 - row[axis + 1] / scale * height / 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }); ctx.stroke();
  });
}
function onMotion(event) {
  if (!recording) return;
  const axes = readAxes(event, mode);
  if (!axes) return;
  samples.push([performance.now() - startMono, ...axes]);
  clearTimeout(sensorTimer);
  sensorTimer = setTimeout(() => stop('Sensor data stopped arriving. Recording preserved; try starting again.'), 5000);
  if (samples.length === 1) $('status').textContent = 'Recording all three axes. Tap Stop when finished.';
  if (samples.length >= MAX_SAMPLES) stop('Reached 300,000 samples. Save this recording before starting another.');
}
async function start() {
  if (recording || starting || exporting) return;
  if (samples.length && !confirm('Start a new recording? The current recording will be replaced. Save it first if needed.')) return;
  if (!window.isSecureContext) { $('status').textContent = 'Motion sensors require HTTPS (or localhost for development).'; return; }
  if (!window.DeviceMotionEvent) { $('status').textContent = 'Motion sensors are unavailable in this browser. Open this app on a phone with Safari or Chrome.'; return; }
  starting = true; controls();
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission denied. Allow Motion & Orientation access in your browser settings and try again.');
    }
    if (document.hidden) throw new Error('Return to this page before starting a recording.');
    samples = []; duration = 0; mode = $('mode').value;
    startTime = Date.now(); startMono = performance.now(); recording = true; saved = false;
    $('filename').value = `accelerometer-${new Date(startTime).toISOString().replace(/[:.]/g, '-')}.csv`;
    $('status').textContent = 'Waiting for three-axis sensor data…';
    $('export-status').textContent = ''; $('drive-link').hidden = true;
    window.addEventListener('devicemotion', onMotion);
    sensorTimer = setTimeout(() => stop('No valid three-axis data received. Check motion permission, use a supported phone, or try including gravity.'), 5000);
    timer = setInterval(render, 100);
    render();
    if (navigator.wakeLock) {
      navigator.wakeLock.request('screen').then(lock => {
        if (recording) wakeLock = lock; else lock.release().catch(() => {});
      }).catch(() => {});
    }
  } catch (error) { $('status').textContent = error.message || 'Could not access motion sensors.'; }
  finally { starting = false; controls(); }
}
function stop(message = 'Recording stopped. Save your CSV or export it to Drive.') {
  if (!recording) return;
  duration = performance.now() - startMono; recording = false;
  window.removeEventListener('devicemotion', onMotion); clearInterval(timer); clearTimeout(sensorTimer);
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  $('status').textContent = message; controls(); render();
}
function file() { return new File([csvBlob(samples, startTime, mode)], csvName($('filename').value), { type: 'text/csv' }); }
$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => stop());
$('download').addEventListener('click', () => {
  const output = file(), url = URL.createObjectURL(output), link = document.createElement('a');
  link.href = url; link.download = output.name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); saved = true;
  $('export-status').textContent = 'CSV download requested. Check your browser’s downloads or save dialog.';
});
$('share').addEventListener('click', async () => {
  const output = file();
  if (!navigator.canShare?.({ files: [output] })) {
    $('export-status').textContent = 'File sharing is unavailable here. Choose Save CSV, then upload the file using the Google Drive app or website.'; return;
  }
  exporting = true; controls();
  try { await navigator.share({ files: [output], title: '3C accelerometer recording' }); saved = true; $('export-status').textContent = 'File handed to the selected app. Check that app to confirm it was saved.'; }
  catch (error) { $('export-status').textContent = error.name === 'AbortError' ? 'Sharing cancelled. Your recording is still available.' : 'Could not share this file. Try Save CSV instead.'; }
  finally { exporting = false; controls(); }
});
function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleReady) return googleReady;
  googleReady = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    const timeout = setTimeout(() => fail(), 15000);
    function fail() { clearTimeout(timeout); script.remove(); googleReady = null; reject(new Error('Could not load Google sign-in. Check your connection and retry.')); }
    script.onload = () => { clearTimeout(timeout); if (window.google?.accounts?.oauth2) resolve(); else fail(); };
    script.onerror = fail; document.head.append(script);
  });
  return googleReady;
}
// Preload only when a client ID is configured so the sign-in popup can open directly on a tap.
function prepareGoogle() { if ($('client-id').value.trim()) loadGoogle().catch(() => {}); }
prepareGoogle(); $('client-id').addEventListener('change', prepareGoogle);
$('drive').addEventListener('click', async () => {
  const clientId = $('client-id').value.trim();
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    $('export-status').textContent = 'Set a Google OAuth client ID below for direct upload, or use Share / Drive.';
    document.querySelector('details').open = true; $('client-id').focus(); return;
  }
  if (!window.google?.accounts?.oauth2) {
    $('export-status').textContent = 'Loading Google sign-in…'; exporting = true; controls();
    try { await loadGoogle(); $('export-status').textContent = 'Google sign-in is ready. Tap Upload to Google Drive again.'; }
    catch (error) { $('export-status').textContent = error.message; }
    finally { exporting = false; controls(); } return;
  }
  exporting = true; controls(); $('drive-link').hidden = true;
  $('export-status').textContent = 'Sign in to Google to upload this CSV…';
  try {
    const token = await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file',
        callback: result => result.error || !result.access_token ? reject(new Error('Google authorization was not completed. Your recording is still available.')) : resolve(result.access_token),
        error_callback: () => reject(new Error('Google sign-in was closed or blocked. Allow popups and try again.')) });
      client.requestAccessToken({ prompt: 'select_account' });
    });
    $('export-status').textContent = 'Uploading CSV to My Drive…';
    const output = file(), body = new FormData();
    body.append('metadata', new Blob([JSON.stringify({ name: output.name, mimeType: 'text/csv' })], { type: 'application/json' }));
    body.append('file', output);
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}). Check Drive API setup and account access, then retry.`);
    const result = await response.json();
    if (!result.id) throw new Error('Drive did not return a file ID. Check My Drive before retrying.');
    saved = true; $('export-status').textContent = 'CSV uploaded to My Drive.';
    $('drive-link').href = `https://drive.google.com/file/d/${encodeURIComponent(result.id)}/view`; $('drive-link').hidden = false;
  } catch (error) { $('export-status').textContent = `${error.message} Your CSV remains available to download. If the connection was interrupted, check My Drive before retrying.`; }
  finally { exporting = false; controls(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop('Recording stopped because this page was hidden. Your samples are ready to export.'); });
window.addEventListener('pagehide', () => stop());
window.addEventListener('beforeunload', event => { if (recording || (samples.length && !saved)) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize', render);
controls(); render();
