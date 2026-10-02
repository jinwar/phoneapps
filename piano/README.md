# MIDI Piano

Open `piano/` over HTTPS in Chrome on Android. No build step, microphone access, or application server is needed. Sheet engraving loads a pinned browser library from jsDelivr.

- **Connect Bluetooth** uses Web Bluetooth to subscribe to standard BLE-MIDI notifications. The picker filters strictly by the standard BLE-MIDI service; unsupported devices are not listed. Keyboards that do not advertise this service must enable Bluetooth MIDI mode or use USB. The user must choose the device and grant access.
- **Connect USB-C / MIDI** uses Web MIDI with `sysex: false`. It lists Android-exposed MIDI inputs, automatically selects a sole input, and updates the list when devices are connected or removed. It does not use WebUSB or assume that every exposed MIDI input is USB.
- Note-on/off, velocity-zero note-off, per-channel sustain, reset controllers, all-sound-off, all-notes-off, and MIDI reset update the display. An 88-key strip displays A0–C8; the note readout supports the complete MIDI range.
- Only one transport is active at a time. Disconnecting or switching transport clears notes and listeners. Notes are also cleared when the page is hidden. Hardware can stop delivering MIDI while Android suspends the browser; reconnect if needed.
- Live input displays incoming MIDI and uses the instrument's own sound. Score demonstrations synthesize audio through the phone; MIDI and audio are not recorded.

## Compatibility

Requires a standard BLE-MIDI keyboard or a class-compliant USB MIDI keyboard, a data-capable cable/OTG adapter for USB, and sufficient keyboard power. Bluetooth audio is not MIDI. Availability is detected at runtime; unsupported connection buttons are disabled. Some devices may need their Bluetooth MIDI mode enabled or other music apps disconnected first. Device compatibility must be checked on actual hardware.

## Validation

`node --test tests/piano.test.cjs tests/piano-connection.test.cjs` from the repository root tests MIDI parsing, BLE packet framing, sustain/channel state, USB hotplug, BLE notifications, cancellation, disconnection, and denied permissions with simulated devices. These tests do not establish physical keyboard compatibility.

## References

- Web MIDI specification: https://www.w3.org/TR/webmidi/
- Web Bluetooth: https://developer.chrome.com/docs/capabilities/bluetooth
- BLE-MIDI service: `03b80e5a-ede8-4b33-a751-6ce34ec4c700`
- BLE-MIDI characteristic: `7772e5db-3868-4112-a1a9-f2669d106bf3`

## MusicXML practice

Load a partwise `.mxl`, `.musicxml`, or `.xml` file (up to 20 MB, with a 20 MB expanded score limit). Compressed MXL files are unpacked locally, following `META-INF/container.xml`; stored and DEFLATE ZIP entries are supported. This works for local files and Google Drive selections. Select a part if the file contains multiple instruments. Notes from both piano staves/voices are grouped by onset; ties are combined and accidentals/transposition are converted to sounding MIDI pitches.

- **Demonstrate** plays synthesized notes at the selected tempo and highlights the current position. Stop, changing part, jumping to a note, or hiding the app stops playback.
- **Practice with keyboard** waits for correct note-on events. Chords require their pitches together; wrong keys block progress until released. Rests are skipped, and timing is not graded.
- Tap the score to jump. In Practice, the new position stays active; during demonstration, tapping stops audio and selects a new starting point.
- **Open from Google Drive** invokes Android's system document picker. Select Google Drive in its navigation menu; install/sign in to the Drive app if the provider is unavailable. This is per-file access through Android, not a browser OAuth connection or account-wide Drive access. No Google API key/client ID or backend is required. Local and Drive selections use the same private file-loading path.

The score is engraved from the original MusicXML using OpenSheetMusicDisplay 1.9.2 (BSD-3-Clause), loaded from jsDelivr. Scores are processed locally and are never sent to the CDN. An internet connection is needed to load the renderer. Standard notation preserves clefs, key/time signatures, beams, ties, and other supported MusicXML markings. The selected instrument is shown with all its staves, wrapping into systems in a scrollable sheet. On narrow phones, swipe horizontally or rotate to landscape.

A blue vertical line moves continuously with demonstration, including tied notes, and follows correct keyboard input during practice. Wrong keys leave the line in place. Tap the sheet to jump to the nearest note column; left/right arrows, Home, and End also navigate when the sheet has keyboard focus. Layout is recalculated on resize.

Playback/practice still uses the selected tempo, skips grace/cue and unpitched notes, and plays repeats once in written order. Grace/cue notes and repeat symbols remain visible in the score. Written pitches are shown; MIDI matching uses sounding pitches for transposing instruments. `score-timewise` should be exported as partwise MusicXML first.

## Saved scores and full-screen view

Successfully loaded scores are automatically stored in IndexedDB on this browser/device, including scores imported as MXL or from Drive. The Scores panel lists saved titles and filenames, with Open and Remove buttons. A SHA-256 content ID prevents duplicate copies of the same XML. XML data and title metadata are saved together in one transaction; quota/permission failures leave the current score usable and display an error. Saved scores do not sync between devices, and clearing site data (or private browsing cleanup/browser eviction) can remove them. Keep originals. The engraving library still needs to load from the network or browser cache.

Loading a score opens a viewport-filling sheet view with compact controls on top. The fullscreen icon requests native browser fullscreen from a user tap, with the same viewport layout as a fallback. Close or Escape returns to the page; Keyboard returns to connection settings. Scores opens the saved list without leaving the sheet. Settings contains part and tempo controls. The paper scrolls independently below the controls and reflows on viewport changes.
