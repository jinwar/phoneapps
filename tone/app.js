(() => {
  'use strict';
  const slider = document.getElementById('frequency');
  const exact = document.getElementById('exact-frequency');
  const display = document.getElementById('frequency-display');
  const volume = document.getElementById('volume');
  const volumeDisplay = document.getElementById('volume-display');
  const play = document.getElementById('play');
  const status = document.getElementById('status');
  const info = document.getElementById('audio-info');
  let frequency = 440;
  let context, oscillator, gain;
  let starting = false;
  let generation = 0;
  const format = value => value.toLocaleString('en-US');
  const supported = () => !context || frequency < context.sampleRate / 2;

  function ramp(param, value) {
    const now = context.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else {
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    }
    param.linearRampToValueAtTime(value, now + 0.025);
  }

  function setPlaying(active) {
    play.setAttribute('aria-pressed', String(active));
    play.textContent = active ? 'Stop tone' : 'Play tone';
    document.body.classList.toggle('playing', active);
  }

  function stop(message = 'Stopped') {
    generation++;
    starting = false;
    if (oscillator) {
      const oldOscillator = oscillator;
      const oldGain = gain;
      ramp(oldGain.gain, 0);
      oldOscillator.stop(context.currentTime + 0.03);
      oldOscillator.onended = () => { oldOscillator.disconnect(); oldGain.disconnect(); };
      oscillator = gain = null;
    }
    setPlaying(false);
    status.textContent = message;
  }

  function limitMessage() {
    return `This browser can generate frequencies below ${format(context.sampleRate / 2)} Hz. Choose a lower frequency.`;
  }

  function updateFrequency(value) {
    frequency = Math.max(1, Math.min(30000, Math.round(value)));
    exact.value = frequency;
    slider.value = Math.log(frequency) / Math.log(30000) * 10000;
    slider.setAttribute('aria-valuetext', `${format(frequency)} hertz`);
    display.textContent = format(frequency);
    if (!supported()) stop(limitMessage());
    else if (oscillator) ramp(oscillator.frequency, frequency);
    else if (!starting) status.textContent = 'Ready to play';
  }

  async function start() {
    if (!exact.reportValidity()) return;
    const attempt = ++generation;
    starting = true;
    play.textContent = 'Cancel';
    status.textContent = 'Starting audio…';
    try {
      if (!context || context.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Audio generation is not supported in this browser.');
        // Request headroom above the 60 kHz Nyquist minimum for a 30 kHz tone.
        try { context = new AudioContext({ sampleRate: 96000 }); }
        catch { context = new AudioContext(); }
        context.addEventListener('statechange', () => {
          if (context.state !== 'running' && oscillator) stop('Audio paused. Tap Play tone to resume.');
        });
        info.textContent = `Audio sample rate: ${format(context.sampleRate)} Hz. Playback stops when you leave this app or turn off the screen.`;
      }
      if (!supported()) { stop(limitMessage()); return; }
      await context.resume();
      if (attempt !== generation || document.hidden) return;
      if (context.state !== 'running') throw new Error('Audio could not start. Tap Play tone to try again.');
      // Recheck after resume: the controls may have changed while awaiting it.
      if (!supported()) { stop(limitMessage()); return; }
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      ramp(gain.gain, Number(volume.value) / 100);
      setPlaying(true);
      status.textContent = 'Playing · sine wave';
    } catch (error) {
      if (attempt === generation) stop(error.message || 'Unable to start audio. Try another browser.');
    } finally {
      if (attempt === generation) starting = false;
    }
  }

  slider.addEventListener('input', () => updateFrequency(30000 ** (Number(slider.value) / 10000)));
  exact.addEventListener('input', () => {
    if (exact.value !== '' && exact.validity.valid) updateFrequency(Number(exact.value));
  });
  exact.addEventListener('change', () => {
    if (!exact.validity.valid || exact.value === '') updateFrequency(frequency);
  });
  volume.addEventListener('input', () => {
    volumeDisplay.textContent = `${volume.value}%`;
    volume.setAttribute('aria-valuetext', `${volume.value} percent`);
    if (gain) ramp(gain.gain, Number(volume.value) / 100);
  });
  play.addEventListener('click', () => oscillator || starting ? stop() : start());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop('Paused while app is hidden'); });
  window.addEventListener('pagehide', () => stop());
  updateFrequency(frequency);
})();
