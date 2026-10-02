# MIDI Piano

Open `piano/` over HTTPS in Chrome on Android. No build step, external packages, microphone access, or server is needed.

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
- Tap any note tile to jump. In Practice, the new position stays active; during demonstration, tapping stops audio and selects a new starting point.
- **Open from Google Drive** invokes Android's system document picker. Select Google Drive in its navigation menu; install/sign in to the Drive app if the provider is unavailable. This is per-file access through Android, not a browser OAuth connection or account-wide Drive access. No Google API key/client ID or backend is required. Local and Drive selections use the same private file-loading path.

The display is simplified concert-pitch practice notation, not full MusicXML engraving. Original key signatures, beams, lyrics, ornaments and layout are not reproduced. Grace/cue and unpitched notes are omitted with a message; repeat navigation is not expanded. `score-timewise` should be exported as partwise MusicXML first. Tempo changes are replaced by the selected tempo.

Additional tests: `node tests/practice-ui.test.cjs` (includes parser/follower fixtures) and `node tests/piano-connection.test.cjs`. XML DOM fixtures are generated from `tests/fixtures/practice.musicxml`; UI/audio/device tests use mocks and do not replace on-phone verification.
