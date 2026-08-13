# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

`phoneapps` is a collection of small, installable single-page web apps (PWAs) meant to be used on a phone. Each app lives in its own top-level directory and is fully self-contained — there is no shared build system, package manager, or dependency graph between apps.

Currently there is one app:

- `flashlight/` — turns the phone screen into a colored flashlight (full-screen colored `<div>` with adjustable brightness and color).

## Architecture pattern (applies to every app in this repo)

Each app directory follows the same minimal structure:

- `index.html` — the entire app: markup, `<style>`, and `<script>` inline in one file. No external JS/CSS files, no bundler, no framework, no build step. Vanilla JS wrapped in a single IIFE.
- `manifest.json` — Web App Manifest so the page can be "Added to Home Screen" as a standalone PWA (`display: "standalone"`, icons, theme color, etc.).
- `icons/` — the manifest's icon set, including an `icon.svg` source and rasterized PNGs at the sizes the manifest references (32, 180, 192, 512, and a 512 maskable variant).

When adding a new app, replicate this same three-piece structure (single-file `index.html`, `manifest.json`, `icons/`) rather than introducing a build tool or splitting JS/CSS into separate files — that consistency is the point of the repo.

Within an app's `index.html`, conventions worth preserving (see `flashlight/index.html` for the reference implementation):

- State that should survive a reload is persisted to `localStorage` behind a single JSON blob per app (e.g. `flashlight-settings`), read/written through small `loadSaved()`/`save()` helpers, with `try/catch` around storage access since it can be blocked or corrupt.
- Screen Wake Lock (`navigator.wakeLock`) is requested on load and re-requested on `visibilitychange` so the screen doesn't sleep while the app is in active use; failures are swallowed since the API isn't universally supported.
- Fullscreen is requested lazily on first user tap (`requestFullscreen()` inside a click handler), not on load, since browsers require a user gesture.
- UI controls (e.g. the bottom panel in `flashlight`) auto-hide after a few seconds of inactivity and can be reopened via a small floating button, so the primary visual (the light) stays unobstructed.

## Development workflow

There is no build, lint, or test tooling in this repo (no `package.json`, no CI config). Development is just editing the static files directly:

- **Run/preview an app**: open `flashlight/index.html` directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`) from inside the app folder and visit it — some PWA features (wake lock, fullscreen, manifest install) behave more accurately over `http://localhost` or `https://` than via `file://`.
- **Verify changes**: since there are no automated tests, manually exercise the app in a browser (ideally a mobile viewport / real device) after any change — check that state persists across reloads, the wake lock keeps the screen on, and the manifest/icons still resolve correctly if touched.
