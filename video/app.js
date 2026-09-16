(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fileInput = $('file');
  const picker = $('picker');
  const workspace = $('workspace');
  const video = $('video');
  const shell = document.querySelector('.video-shell');
  const timeline = $('timeline');
  const fpsInput = $('fps');
  let objectUrl = null;
  let frameCallback = null;

  const fps = () => Math.min(240, Math.max(1, Number(fpsInput.value) || 30));
  const frameDuration = () => 1 / fps();
  const clampTime = (time) => Math.min(Number.isFinite(video.duration) ? video.duration : 0, Math.max(0, time));
  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return '00:00.000';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  function updateReadout(mediaTime = video.currentTime) {
    $('frameNumber').textContent = Math.max(0, Math.round(mediaTime * fps()));
    $('timeReadout').textContent = formatTime(mediaTime);
    $('durationReadout').textContent = formatTime(video.duration);
    if (Number.isFinite(video.duration) && video.duration > 0) timeline.value = Math.round(mediaTime / video.duration * 1000);
  }

  function watchFrames() {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;
    frameCallback = video.requestVideoFrameCallback((_, metadata) => {
      updateReadout(metadata.mediaTime);
      if (!video.paused) watchFrames();
    });
  }

  function pause() { video.pause(); }
  function step(frames) {
    pause();
    video.currentTime = clampTime(video.currentTime + frames * frameDuration());
    updateReadout(video.currentTime);
  }

  async function togglePlay() {
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      try { await video.play(); } catch (_) { $('status').textContent = 'Playback could not start. Tap play again.'; }
    } else pause();
  }

  function updatePlayState() {
    const playing = !video.paused && !video.ended;
    shell.classList.toggle('playing', playing);
    $('play').textContent = playing ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    $('centerPlay').setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    if (playing) watchFrames();
  }

  function loadFile(file) {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    $('fileName').textContent = file.name;
    $('videoDetails').textContent = `${(file.size / 1048576).toFixed(1)} MB`;
    picker.hidden = true;
    workspace.hidden = false;
    video.load();
  }

  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  video.addEventListener('loadedmetadata', () => {
    $('videoDetails').textContent += ` · ${video.videoWidth}×${video.videoHeight}`;
    updateReadout();
    $('status').textContent = 'Ready. Set the frame rate to match your video, then use the frame buttons or arrow keys.';
  });
  video.addEventListener('timeupdate', () => updateReadout());
  video.addEventListener('seeked', () => updateReadout());
  video.addEventListener('play', updatePlayState);
  video.addEventListener('pause', updatePlayState);
  video.addEventListener('ended', updatePlayState);
  video.addEventListener('error', () => { $('status').textContent = 'This video could not be opened. Try an MP4 encoded with H.264 video and AAC audio.'; });
  $('centerPlay').addEventListener('click', togglePlay);
  $('play').addEventListener('click', togglePlay);
  $('previous').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('backTen').addEventListener('click', () => step(-10));
  $('forwardTen').addEventListener('click', () => step(10));
  timeline.addEventListener('input', () => { pause(); video.currentTime = clampTime(Number(timeline.value) / 1000 * video.duration); });
  fpsInput.addEventListener('change', () => { fpsInput.value = fps(); updateReadout(); });
  $('speed').addEventListener('change', (event) => { video.playbackRate = Number(event.target.value); });
  $('mute').addEventListener('click', () => {
    video.muted = !video.muted;
    $('mute').textContent = video.muted ? 'Sound off' : 'Sound on';
    $('mute').setAttribute('aria-pressed', String(video.muted));
  });
  $('fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (shell.requestFullscreen) shell.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  });
  document.addEventListener('keydown', (event) => {
    if (workspace.hidden || /INPUT|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(event.shiftKey ? -10 : -1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(event.shiftKey ? 10 : 1); }
    else if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    else if (event.key.toLowerCase() === 'm') $('mute').click();
    else if (event.key.toLowerCase() === 'f') $('fullscreen').click();
  });
  window.addEventListener('beforeunload', () => {
    if (frameCallback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameCallback);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
})();
