# Suburi Pocket Practice

Static, dependency-free phone app at `/suburi/`. Serve the repository root over HTTPS; use `python3 -m http.server 8000` for localhost development. Changes in this repository go directly to `main`.

## Use

Tap **Start recording**; no recording type is required. The algorithm identifies stationary and jumping swings automatically. Allow motion access on iOS if requested, then put the phone in the same pocket and orientation as calibration. Keep the page visible and screen unlocked. The count and cadence chart update about every 1.2 seconds. Finish for the statistical report, then optionally supply the actual activity and count under Teach the counter. Each practice can serve as calibration data. Type is requested only when you choose to label a finished practice; use a time range containing a single activity for calibration.

Forward-moving swings and Walking / other are post-recording calibration labels. They do not yet have automatic counters. Walking / other labels must specify zero swings and provide negative examples for future stationary/jumping calibration. The forward category collects data for a future detector; its examples are not silently trained as jumping or stationary motion.

The live plot shows **cadence in swings/minute**, not shinai velocity in m/s. A pocket phone measures body motion, not sword movement. It cannot confirm whether the user is holding a sword or assess technique. An interval contributes to the curve only when it is positive and at most four seconds; longer pauses break the curve. Green circles show stationary swings and blue squares show jumping swings. Lines and cadence intervals do not cross type changes. The report includes total, stationary and jumping counts. The current cadence is the average of the latest three valid intervals and becomes unavailable after four seconds without a detected event.

The Practice history list above Saved practices shows each past session’s local date/time, duration, and estimated suburi count, newest first. Interrupted sessions are marked; the active recording appears after it ends.

Reports contain estimated count, full session duration, mean/median/peak interval cadence, whole-session count per minute, inter-repetition interval coefficient of variation, and sensor sample rate. Lower interval variation means more even timing, not better technique. Actual count, estimate and count error are shown for the labeled range when one exists. Reports keep the original model and original detections; calibration does not rewrite old results.

## Detector

The original detector uses browser `event.acceleration` (linear acceleration, gravity already removed). It does not silently substitute accelerationIncludingGravity. Samples use monotonic browser receipt time. The raw inclusive-gravity and rotationRate fields are also retained when available, but are not used for detection in version 1.1.0. Missing optional fields export as null.

- Interpolate to 60 Hz within continuous segments. Invalid/non-increasing samples or gaps over 100 ms reset the filter and detection chains. Apply a causal second-order Butterworth low-pass at 8 Hz.
- Stationary: normalize 61-sample three-axis windows and correlate with two alternating templates. These came from six visually selected presumed repetitions in the owner's initial stationary recording. Default correlations are 0.65 (strong) / 0.45 (weak). A dynamic-programming sequence search links alternating matches with 0.96–2.28 seconds between them, tolerating distracting peaks instead of resetting the whole chain. Keep non-overlapping chains of at least four matches. Timing limits scale with calibration. Templates describe observed body-motion shapes, not verified anatomical phases.
- Jumping: generate local negative filtered device-Y peaks with height 6 m/s², prominence 2, and minimum candidate spacing 0.3 s. Choose compatible sequences spaced 0.65–1.0 s apart rather than greedily deleting neighboring peaks by amplitude. Keep non-overlapping chains of at least five candidates, with at least 70% reaching 14 m/s². Timing limits scale with calibration. Device Y is not guaranteed to be world vertical.
- Automatic classification: run both pattern detectors on each segment, merge timestamped events with their detected type, and give confirmed jumping events precedence over stationary matches within 0.6 seconds to prevent duplicate classification. Unmatched movement remains uncounted. This is a pattern-based classifier, not a general recognition model.
- Both detectors run in a Web Worker. They replay the current recording, including future-dependent peak selection and chain confirmation. Live estimates are provisional and may revise. Centered templates require 0.5 s of lookahead; initial confirmation takes several repetitions. Short sets below four/five candidates are deliberately rejected. Finish runs a final full replay.

Replayed against the three original 60 Hz recordings: walking 0; stationary 20; jumping 20, leaving the two later forward-moving swings unclassified. This is calibration-set agreement, not independent event-level accuracy. Raising the jump height from 6 to 7 misses the first weak repetition. More sessions, speeds, orientations and negative activities must be tested. Raw source recordings are not included in the public repository. Only normalized templates are shipped.

## How calibration changes the algorithm

Finish a recording, enter actual activity and count, and optionally trim the time range to exclude handling. A label is saved before parameter fitting. For supported types, the worker searches a bounded parameter grid and replays all saved labeled sessions of that type plus walking/other and the opposite supported type as negatives. The objective is total absolute count error across both detected types, including cross-type false positives; ties keep existing parameters. It changes settings only when this aggregate error decreases. It never inserts events just to match the supplied count.

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

Choose all saved sessions or just the selected session. **Share** opens the native share sheet with the complete JSON data attached as a `text/plain` file named `*.json.txt` for phone compatibility. Choose your email app, Drive, or another destination and complete sending or saving there. The app confirms handoff, not delivery. If sharing is denied or unavailable, Export data still downloads the JSON for manual attachment. Direct Drive upload remains available. Exports do not automatically update the app. No import interface is included; keep exports for analysis/backups.

A storage error is shown explicitly; recordings remain exportable in memory. Corrupt/incompatible saved history is not overwritten. Data does not sync across browsers/devices, and clearing site data removes local history and calibration. Keep backups. No server receives sensor data except when the user explicitly exports to a chosen app/Drive account.

## Direct Google Drive setup

1. Enable Google Drive API in a Google Cloud project.
2. Configure consent / test users and the `https://www.googleapis.com/auth/drive.file` scope.
3. Create a **Web application** OAuth client, authorizing the exact hosting origin (for example `https://jinwar.github.io`, not a path; optionally `http://localhost:8000`).
4. Put the public client ID in `suburi/config.js`, or enter it under Direct Drive setup. No client secret belongs in browser code. The entered ID is not persisted.
5. Tap Upload to Google Drive. If sign-in is still loading, a second tap preserves the browser's popup user gesture. Each upload creates a new JSON file in My Drive and returns a link. Access tokens stay in memory. Failed uploads leave local data untouched; check My Drive before retrying an interrupted request to avoid duplicates.

Native sharing requires no OAuth setup. Direct upload needs internet and a configured client. The app currently requires the static files to load online; the manifest does not promise offline availability.

## Validation

`node --test tests/suburi.test.mjs` checks continuous-segment preprocessing, rejection of noise and invalid data, repetition chains, bounded calibration improvement and cadence/report calculations. Browser tests: install Playwright outside the repository, serve on port 8000, then run `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --test tests/suburi.browser.mjs`; `CHROMIUM_PATH` defaults to `/usr/bin/chromium`. Browser tests simulate motion and mock Drive; actual iOS/Android permission, pocket motion, native file sharing and live Google OAuth need on-device testing.

The implementation reuses workflow ideas from the repo's jump-rope app: foreground-only sensing, missing-sensor timeout, wake locks, checkpointing and duplicate suppression. Its gravity projection is not appropriate for these linear-acceleration recordings. External research references informing the analysis are [RecoFit](https://www.microsoft.com/en-us/research/publication/recofit-using-wearable-sensor-find-recognize-count-repetitive-exercises/) and [tslearn](https://github.com/tslearn-team/tslearn) for possible future DTW comparisons. No external application code was copied.

## Version 1.1.0 calibration analysis (17 November 2026)

Two uploaded exports contained two unique sessions; the later export repeated the first session. Session UUIDs were used to avoid treating that duplicate as independent evidence. The new stationary session is labeled 30 swings (58.0 seconds, 3,475 samples), and the jumping session 40 (43.5 seconds, 2,602 samples). Both have approximately 60 Hz linear acceleration with no gap over 35 ms.

The original default detector counted 18 stationary swings; the on-phone calibrated v1.0 settings counted 29. The recording changes from roughly 1.3-second repetitions to roughly 2.1 seconds, and has a weak first repetition. More tolerant sequence linking and candidate thresholds recover 30 without fabricating events. Jumping remains 40. Old recordings still produce walking 0, stationary 20, jumping 20; the two forward-moving swings remain outside these detected sequences.

A synthetic concatenation of the two new sessions with a two-second rest initially exposed resampling-phase sensitivity in greedy jumping-peak pruning (38 instead of 40). Sequence selection recovers 30 stationary and 40 jumping in this combined replay. This is not a newly recorded mixed-activity validation session. All five recordings informed development; agreement with their total labels does not establish independent event accuracy or generalization.

Saved v1.0 histories and labels survive the upgrade. New sessions use revised v1.1 defaults; the previous calibrated model is archived inside the new model and original session snapshots/reports stay unchanged. Unsupported future model versions fail safely without overwriting storage. Cache-versioned app and worker imports load the revised detector.

The native share change addresses a plausible JSON attachment restriction behind the reported “permission denied” error. The exact phone/browser cause is not established. Automated tests cover text attachment contents, mocked permission denial, download availability, and unchanged direct Drive JSON upload. Actual phone sharing still needs confirmation.

## Activity terminology

The app calls forward/backward practice **Forward/backward suburi** (zenshin-kōtai suburi) and repeated fast hopping practice **Hayasuburi**. Earlier UI versions called these Stationary and Jumping. Saved records, calibration labels, detector settings, and exports retain the internal keys `stationary` and `jumping` for compatibility; the algorithm is unchanged. Historical analysis above uses those original names.

## Version 1.1.1 calibration analysis (18 November 2026)

The latest export contains a 189.7-second session with 11,356 samples. Its first 0–90 seconds are labeled 40 forward/backward swings. Version 1.1.0 counts zero in that range and 100 hayasuburi later in the full recording. Most repeating strong-template similarities in the labeled interval are around 0.48–0.64, below the default 0.65 threshold. Too few alternating matches survive to form a four-event chain. This is template mismatch, not missing sensor data. The cause of the changed waveform (such as pocket orientation or technique) cannot be established from counts alone.

Previously calibration searched strong thresholds only from 0.65 upward, so it could not remedy this failure. Version 1.1.1 expands strong thresholds to 0.50 and weak thresholds to 0.35. Defaults and existing personalized settings are preserved. Open the saved practice and save its 40-count, 0–90-second label again to apply the expanded search. Original reports remain unchanged; new recordings use the calibrated settings.

Replaying the three labeled sessions selects strong 0.50, weak 0.45 and timing scale 1.2: 43 candidates for the new 40 label, 30/30 for the prior forward/backward recording, and 40/40 for the prior hayasuburi recording. Total absolute count error falls from 40 to 3. Replaying the original walking and two swing recordings retains 0, 20 and 20 respectively. The other unlabeled session remains 20 forward/backward plus 11 hayasuburi; its true counts are unknown. This is calibration-set agreement, not independent accuracy. No events are invented to force a count of 40. Additional event-timed examples are needed to distinguish extra detections from missed repetitions.

The email-draft experiment was reverted at the owner's request. The button is now **Share**, restoring native file sharing with a `.json.txt` attachment. Automated tests verify attachment contents and the permission-denied fallback. Actual sending or saving is completed in the chosen app.
