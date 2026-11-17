# 3C Accelerometer

A standalone mobile web app for recording three-component (X/Y/Z) acceleration, with live traces, CSV download, native file sharing, and optional direct Google Drive upload. No build step or backend. Serve this directory over HTTPS, for example with GitHub Pages at `/phoneapps/accelerometer/`. For desktop development, run `python3 -m http.server 8000` in the repo and visit `http://localhost:8000/accelerometer/`.

## Recording

1. Open on a phone in Safari or Chrome. Choose acceleration including gravity (default), or linear acceleration with gravity removed if supported by the device/browser.
2. Tap **Start recording** and allow motion access if prompted (required by iOS). Tap **Stop** to finish.
3. Choose **Save CSV**, **Share / Drive**, or **Upload to Google Drive**.

CSV columns: `timestamp_utc,elapsed_s,x_m_s2,y_m_s2,z_m_s2,includes_gravity`. UTC timestamps derive from the start wall-clock time plus monotonic elapsed time at event receipt. Elapsed seconds are relative to Start; timestamps are browser receipt times, not hardware acquisition timestamps. Axes are device-relative: X right, Y toward the top, Z out of the screen. Units are m/s². Gravity mode is explicit and never silently changed. Missing/null axes are rejected; zero is valid.

The actual sampling rate is controlled by the browser/device; the app records every valid motion event and displays the measured mean rate. Keep the page visible. A screen wake lock is requested where supported, but background/locked-screen recording is not supported. Hiding the page stops recording; no-data or stalled sensors stop after five seconds. Recording is capped at 300,000 samples (about 83 minutes at 60 Hz) to bound memory use.

Data stays in page memory until downloaded, shared or uploaded. It does **not** survive closing, reloading, or browser eviction. Save each session before leaving. A warning is requested for unsaved recordings, but mobile browsers may omit it. Starting another session asks before replacing existing data.

## Google Drive export

### Phone share sheet (no OAuth setup)

Install Google Drive and use **Share / Drive**, selecting Drive as the target if the operating system exposes it. Availability varies by browser and OS; if Drive is missing, download the CSV and upload it with Drive. A successful share only confirms handoff to the chosen app.

### Direct upload

1. In Google Cloud Console, create/select a project and enable **Google Drive API**.
2. Configure Google Auth Platform branding, audience (add test users while in testing), and the `https://www.googleapis.com/auth/drive.file` scope.
3. Create an OAuth client of type **Web application**. Add the exact hosting origin to **Authorized JavaScript origins**, e.g. `https://jinwar.github.io` and optionally `http://localhost:8000`. Origins do not include `/phoneapps/accelerometer/` or other paths. No client secret belongs in this app.
4. Set the public client ID in `config.js`, or enter it in the app's Direct Google Drive setup field. The entered ID lasts for this page session.
5. Tap **Upload to Google Drive**, choose an account and grant permission. The CSV is created in My Drive and a link appears. Each upload creates a new file.

Google Identity Services is loaded from Google only when a client ID is supplied. OAuth tokens stay in memory, are not logged or persisted, and the limited `drive.file` scope permits access to files created/opened by this app. The app does not list or read unrelated Drive files. Direct upload requires internet access, Google project configuration, and popup permission. If loading sign-in on demand, a second tap is requested to preserve popup user activation. Download remains available after failed or cancelled upload; after an ambiguous network failure, check Drive before retrying to avoid duplicates.

## Verification

Run `node --test accelerometer/recording.test.mjs`. Browser integration tests are in `accelerometer/browser.test.mjs`; install Playwright outside the repo and set `PLAYWRIGHT_MODULE` to its entry point, then run `node --test accelerometer/browser.test.mjs` with a local server on port 8000. These use synthetic motion events and mocked Google authorization/upload. Real iOS/Android sensor permissions and a configured Google account must also be checked on hardware.
