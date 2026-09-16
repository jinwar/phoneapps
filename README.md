# Phone Apps

Small phone-friendly web apps built with plain HTML, CSS, and JavaScript. No build step or dependencies.

- `/`: home page with an icon and link for every app.
- `/flashlight/`: screen flashlight with color and brightness controls.
- `/tone/`: single sine-wave tone generator with a logarithmic 1–30,000 Hz frequency slider, exact integer Hz entry, and a 0–100% volume slider.
- `/video/`: private, local MP4 viewer with frame stepping, timeline scrubbing, playback speed, and keyboard shortcuts.

## Run locally

From the repository root, run `python3 -m http.server 8000`, then open `http://localhost:8000`. Any static host (including GitHub Pages) can serve the repository root. Links are relative so deployment under a project subdirectory works.

## Tone generator behavior

Audio starts only after tapping **Play tone**, defaults to 440 Hz and 10% volume, and stops when the page is hidden or navigated away from. Frequency, volume, and start/stop transitions use short ramps to reduce clicks. No microphone permission is needed.

The app requests a 96 kHz Web Audio context to represent the complete frequency range. If unsupported, it falls back to the browser's default sample rate and refuses frequencies at or above half that rate, with a visible explanation. The full selection range remains available. The operating system and physical audio output may resample or filter the signal; selecting 30 kHz does not guarantee ultrasonic speaker output. Phone speakers cannot reproduce the entire 1 Hz–30 kHz range.

Web Audio reference: [AudioContext constructor and sample-rate support](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext).

## Frame viewer behavior

The frame viewer opens a video directly from the device using a temporary local object URL; it never uploads the file. It starts with a 30 fps stepping interval, which can be changed to match the source video. Previous/next controls move by one frame interval, while the live readout uses the browser's decoded-frame callback when available. Variable-frame-rate videos do not have a single fixed frame interval, so the displayed frame number is an estimate based on the selected rate.

## Tests

Run `node --test tests/tone.test.cjs` with Node.js 18 or later. These dependency-free tests use a simulated DOM and Web Audio context to check control behavior, gain ramps, cancellation, hidden-page stopping, and sample-rate fallback. They do not verify physical speaker output or replace on-device browser testing.
