# Suburi Pocket Practice

Static, dependency-free phone app at `/suburi/`. Serve the repository root over HTTPS; use `python3 -m http.server 8000` for localhost development. Changes in this repository go directly to `main`.

## Use

Choose Stationary or Jumping, tap Start, allow motion access on iOS if requested, and put the phone in the same pocket and orientation as calibration. Keep the page visible and screen unlocked. The count and cadence chart update about every 1.2 seconds. Finish for the statistical report, then optionally supply the actual activity and count under Teach the counter. Each practice can serve as calibration data.

Forward-moving swings and Walking / other are recording categories. They do not yet have automatic counters. Walking / other labels must specify zero swings and provide negative examples for future stationary/jumping calibration. The forward category collects data for a future detector; its examples are not silently trained as jumping or stationary motion.

The live plot shows **cadence in swings/minute**, not shinai velocity in m/s. A pocket phone measures body motion, not sword movement. It cannot confirm whether the user is holding a sword or assess technique. An interval contributes to the curve only when it is positive and at most four seconds; longer pauses break the curve. The current cadence is the average of the latest three valid intervals and becomes unavailable after four seconds without a detected event.

Reports contain estimated count, full session duration, mean/median/peak interval cadence, whole-session count per minute, inter-repetition interval coefficient of variation, and sensor sample rate. Lower interval variation means more even timing, not better technique. Actual count, estimate and count error are shown for the labeled range when one exists. Reports keep the original model and original detections; calibration does not rewrite old results.

## Detector

The original detector uses browser `event.acceleration` (linear acceleration, gravity already removed). It does not silently substitute accelerationIncludingGravity. Samples use monotonic browser receipt time. The raw inclusive-gravity and rotationRate fields are also retained when available, but are not used for detection in version 1.0.0. Missing optional fields export as null.

- Interpolate to 60 Hz within continuous segments. Invalid/non-increasing samples or gaps over 100 ms reset the filter and detection chains. Apply a causal second-order Butterworth low-pass at 8 Hz.
- Stationary: normalize 61-sample three-axis windows and correlate with two alternating templates. These came from six visually selected presumed repetitions in the owner's initial stationary recording. Default correlations are 0.75 (strong) / 0.55 (weak); require alternating chains of at least four matches with 0.95–1.9 seconds between them. The templates describe observed body-motion shapes, not verified anatomical phases.
- Jumping: detect peaks of negative filtered device Y with height 6 m/s², prominence 2 and minimum spacing 0.6 s. Accept chains of at least five candidates spaced 0.65–1.0 s, at least 70% of which reach 14 m/s². Device Y is not guaranteed to be world vertical. These defaults assume the owner's original pocket orientation.
- Both detectors run in a Web Worker. They replay the current recording, including future-dependent peak selection and chain confirmation. Live estimates are provisional and may revise. Centered templates require 0.5 s of lookahead; initial confirmation takes several repetitions. Short sets below four/five candidates are deliberately rejected. Finish runs a final full replay.

Replayed against the three original 60 Hz recordings: walking 0; stationary 20; jumping 20, leaving the two later forward-moving swings unclassified. This is calibration-set agreement, not independent event-level accuracy. Raising the jump height from 6 to 7 misses the first weak repetition. More sessions, speeds, orientations and negative activities must be tested. Raw source recordings are not included in the public repository. Only normalized templates are shipped.

## How calibration changes the algorithm

Finish a recording, enter actual activity and count, and optionally trim the time range to exclude handling. A label is saved before parameter fitting. For supported types, the worker searches a bounded parameter grid and replays all saved labeled sessions of that type plus walking/other and the opposite supported type as negatives. The objective is total absolute count error; ties keep existing parameters. It changes settings only when this aggregate error decreases. It never inserts events just to match the supplied count.

Stationary calibration tunes both similarity thresholds and allowed repetition spacing. Jumping calibration tunes pulse height, strong-anchor height, and spacing. This version does not retrain a neural network, infer true event timestamps from total counts, or learn arbitrary new waveform templates. A different phone orientation or swing style may require further algorithm work; keep the data and export it. There is no claim that fitting saved sessions improves unseen data. Validate new settings with a fresh session.

The time-range label and actual count must describe the same part of the recording. Only one activity per calibration recording is supported. Count zero is valid for supported types if testing false positives. Forward labels are preserved for analysis but do not adjust unsupported detectors. Walking labels are used when a stationary or jumping calibration is subsequently run.

## Storage and export

IndexedDB stores up to 30 practices with complete raw samples, original model snapshots, original event detections, user labels, and calibration summaries. Sessions checkpoint approximately every five seconds while running and again at Finish. An interrupted session can be reviewed/exported; up to the last checkpoint interval may be lost on abrupt termination, and its provisional detections may lag. Each session is capped at 36,000 samples (about ten minutes at 60 Hz). There is no automatic deletion. At the 30-session limit, export a backup before clearing site data to start a new collection.

Exports use JSON schema `phoneapps.suburi.dataset`, version 1:

- `algorithmVersion`, `exportedAt`, units and explicit `sampleColumns`;
- current model/settings/revision and normalized stationary templates;
- each session's UUID, UTC start/end, type, duration, stop reason and original model;
- `samples`: elapsed seconds, linear X/Y/Z in m/s², inclusive-gravity X/Y/Z in m/s², rotation alpha/beta/gamma in degrees/second;
- original stationary/jumping detection timestamps and derived statistics;
- optional label: actual type/count, time range, pocket notes, label time, predicted count before fitting;
- optional calibration summary: settings selected, fit errors, whether changed and new model revision.

Choose all saved sessions or just the selected session. Save JSON locally, share the file to the Google Drive app where supported, or upload directly to My Drive. A successful native share only confirms handoff. Exports do not automatically upload or update the app. Files can be supplied for future analysis and a reviewed algorithm update. No import interface is included in v1; keep exported data for analysis/backups.

A storage error is shown explicitly; recordings remain exportable in memory. Corrupt/incompatible saved history is not overwritten. Data does not sync across browsers/devices, and clearing site data removes local history and calibration. Keep backups. No server receives sensor data except when the user explicitly exports to a chosen app/Drive account.

## Direct Google Drive setup

1. Enable Google Drive API in a Google Cloud project.
2. Configure consent / test users and the `https://www.googleapis.com/auth/drive.file` scope.
3. Create a **Web application** OAuth client, authorizing the exact hosting origin (for example `https://jinwar.github.io`, not a path; optionally `http://localhost:8000`).
4. Put the public client ID in `suburi/config.js`, or enter it under Direct Drive setup. No client secret belongs in browser code. The entered ID is not persisted.
5. Tap Upload to Google Drive. If sign-in is still loading, a second tap preserves the browser's popup user gesture. Each upload creates a new JSON file in My Drive and returns a link. Access tokens stay in memory. Failed uploads leave local data untouched; check My Drive before retrying an interrupted request to avoid duplicates.

Native Share / Drive requires no OAuth setup. Direct upload needs internet and a configured client. The app currently requires the static files to load online; the manifest does not promise offline availability.

## Validation

`node --test tests/suburi.test.mjs` checks continuous-segment preprocessing, rejection of noise and invalid data, repetition chains, bounded calibration improvement and cadence/report calculations. Browser tests: install Playwright outside the repository, serve on port 8000, then run `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --test tests/suburi.browser.mjs`; `CHROMIUM_PATH` defaults to `/usr/bin/chromium`. Browser tests simulate motion and mock Drive; actual iOS/Android permission, pocket motion, native file sharing and live Google OAuth need on-device testing.

The implementation reuses workflow ideas from the repo's jump-rope app: foreground-only sensing, missing-sensor timeout, wake locks, checkpointing and duplicate suppression. Its gravity projection is not appropriate for these linear-acceleration recordings. External research references informing the analysis are [RecoFit](https://www.microsoft.com/en-us/research/publication/recofit-using-wearable-sensor-find-recognize-count-repetitive-exercises/) and [tslearn](https://github.com/tslearn-team/tslearn) for possible future DTW comparisons. No external application code was copied.
