# Phone Apps

Small phone-friendly web apps built with plain HTML, CSS, and JavaScript. No build step or dependencies.

- `/`: home page with an icon and link for every app.
- `/suburi/`: pocket-motion kendo counter with live cadence, practice reports, labeled calibration, and JSON / Google Drive export. See [setup and limitations](suburi/README.md).
- `/accelerometer/`: record three-axis acceleration with start/stop controls, timestamped CSV download, and Google Drive export. See [setup and usage](accelerometer/README.md).
- `/flashlight/`: screen flashlight with color and brightness controls.
- `/tone/`: single sine-wave tone generator with a logarithmic 1–30,000 Hz frequency slider, exact integer Hz entry, and a 0–100% volume slider.
- `/jump-rope/`: offline motion-based jump counter with local workout history and JSON export.
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

## Jump Rope

Open `/jump-rope/` on your Fold in Chrome over HTTPS, then use the browser menu to install/add to your home screen. Hold the folded phone securely with your hand near your waist. Tap **Start jumping**, hold still for about 1.5 seconds, then jump in place without a rope. Start with 20 manually counted jumps and adjust sensitivity if needed. Pausing/resuming or changing sensitivity restarts the brief sensor warm-up.

The original detector projects accelerometer measurements onto a low-pass gravity estimate, smooths the vertical signal, then counts a positive-to-negative threshold crossing with a 260 ms minimum interval and a 650 ms crossing timeout. It uses sensor timestamps from a monotonic browser clock and resets after gaps. It does not use Android's walking step counter. It cannot reliably distinguish intentional hand shaking from actual jumping; counts remain estimates until calibrated and tested on the user's device.

The screen wake lock is requested when available. Keep the app visible and the screen unlocked: browser background sensor delivery is unreliable, so hiding the app pauses the workout. Missing sensor samples pause it with an explanation. No sensor samples leave the phone. Counts, active duration, start/end dates, and workout IDs are saved to localStorage after each jump and periodically. Interrupted sessions appear as unfinished/recovered history. Browser data clearing or uninstall behavior may remove these records; JSON export provides a backup. A save failure is shown explicitly. Offline support becomes available after the first successful service worker installation.

### Research and Samsung Health

- [AirRopeJumping](https://github.com/LeeLeeYeah/AirRopeJumping) is a public Android/Apple Watch implementation specifically for virtual rope jumping. Its README describes acceleration/gravity-based upper/lower threshold counting. No declared repository license was found, so its code was not copied.
- [JumpsCounter](https://github.com/KraftUnderscore/JumpsCounter) is another public Android accelerometer jump counter with local Room storage. No declared repository license was found; its code was not copied either. Public source availability alone does not establish permission to reuse the code.
- [Samsung's Health Connect FAQ](https://developer.samsung.com/health/health-connect-faq.html) confirms exercise synchronization with Samsung Health when permissions are granted. A native Android integration could write an exercise session through Health Connect, using a [jump-rope exercise segment with repetitions](https://developer.android.com/reference/androidx/health/connect/client/records/ExerciseSegment). Whether Samsung Health displays those repetition details needs device testing; session synchronization does not guarantee every field appears in its UI.
- Browser PWAs cannot directly call the native Health Connect API. A native Android wrapper/module would be required. Samsung's alternative [Health Data SDK](https://developer.samsung.com/health/data/process.html) has partner approval requirements. Per the owner's preference, this version has no Health Connect integration and does not submit workouts externally.

Run `node --test tests/jump-rope.test.mjs` for synthetic cadence, orientation, noise, invalid-input, and sensor-gap tests. These do not establish real-world count accuracy. Browser verification also covers a narrow Fold-sized viewport, simulated motion, local persistence, export, corrupt-storage handling, and offline reload. Physical Fold sensor testing remains necessary.

For the optional browser smoke test, install Playwright in your development environment, serve the repository on port 8000, and run `node tests/jump-rope.browser.cjs`. Set `CHROMIUM_PATH` if using a system Chromium executable. The test supplies simulated motion events because desktop Chromium has no phone accelerometer.
