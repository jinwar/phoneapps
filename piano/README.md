# MIDI Piano

Open `piano/` over HTTPS in Chrome on Android. No build step, external packages, microphone access, or server is needed.

- **Connect Bluetooth** uses Web Bluetooth to subscribe to standard BLE-MIDI notifications. A fallback checkbox lists all BLE devices for keyboards that do not advertise their MIDI service. The user must choose the device and grant access.
- **Connect USB-C / MIDI** uses Web MIDI with `sysex: false`. It lists Android-exposed MIDI inputs, automatically selects a sole input, and updates the list when devices are connected or removed. It does not use WebUSB or assume that every exposed MIDI input is USB.
- Note-on/off, velocity-zero note-off, per-channel sustain, reset controllers, all-sound-off, all-notes-off, and MIDI reset update the display. An 88-key strip displays A0–C8; the note readout supports the complete MIDI range.
- Only one transport is active at a time. Disconnecting or switching transport clears notes and listeners. Notes are also cleared when the page is hidden. Hardware can stop delivering MIDI while Android suspends the browser; reconnect if needed.
- This version displays incoming MIDI and uses the instrument's own sound. It neither synthesizes nor records audio or MIDI.

## Compatibility

Requires a standard BLE-MIDI keyboard or a class-compliant USB MIDI keyboard, a data-capable cable/OTG adapter for USB, and sufficient keyboard power. Bluetooth audio is not MIDI. Availability is detected at runtime; unsupported connection buttons are disabled. Some devices may need their Bluetooth MIDI mode enabled or other music apps disconnected first. Device compatibility must be checked on actual hardware.

## Validation

`node --test tests/piano.test.cjs tests/piano-connection.test.cjs` from the repository root tests MIDI parsing, BLE packet framing, sustain/channel state, USB hotplug, BLE notifications, cancellation, disconnection, and denied permissions with simulated devices. These tests do not establish physical keyboard compatibility.

## References

- Web MIDI specification: https://www.w3.org/TR/webmidi/
- Web Bluetooth: https://developer.chrome.com/docs/capabilities/bluetooth
- BLE-MIDI service: `03b80e5a-ede8-4b33-a751-6ce34ec4c700`
- BLE-MIDI characteristic: `7772e5db-3868-4112-a1a9-f2669d106bf3`
