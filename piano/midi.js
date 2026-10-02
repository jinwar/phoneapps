(function (root) {
  'use strict';
  // Decode the MIDI byte stream after removing BLE transport timestamps.
  class MidiDecoder {
    constructor(emit) { this.emit = emit; this.reset(); }
    reset() { this.status = 0; this.data = []; this.sysex = false; }
    push(bytes) {
      for (const byte of bytes) {
        if (byte >= 0xf8) { if (byte === 0xff) { this.reset(); this.emit([byte]); } continue; }
        if (byte & 0x80) {
          this.data = [];
          if (byte === 0xf0) { this.sysex = true; this.status = 0; continue; }
          this.sysex = false;
          this.status = byte < 0xf0 || [0xf1, 0xf2, 0xf3].includes(byte) ? byte : 0;
          continue;
        }
        if (this.sysex || !this.status) continue;
        this.data.push(byte);
        const length = (this.status < 0xf0 ? [0xc0, 0xd0].includes(this.status & 0xf0) : this.status !== 0xf2) ? 1 : 2;
        if (this.data.length === length) {
          this.emit([this.status, ...this.data]); this.data = [];
          if (this.status >= 0xf0) this.status = 0;
        }
      }
    }
    ble(value) {
      const bytes = value instanceof DataView ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : value;
      if (!bytes.length || !(bytes[0] & 0x80)) return;
      let timestamp = false;
      const midi = [];
      for (let i = 1; i < bytes.length; i++) {
        if ((bytes[i] & 0x80) && !timestamp) timestamp = true;
        else { midi.push(bytes[i]); timestamp = false; }
      }
      this.push(midi);
    }
  }
  class NoteState {
    constructor() { this.clear(); }
    clear() { this.held = new Map(); this.sustained = new Map(); this.pedals = new Set(); }
    accept([status, note, velocity]) {
      if (status === 0xff) { this.clear(); return; }
      const type = status & 0xf0, channel = status & 15, key = `${channel}:${note}`;
      if (type === 0x90 && velocity > 0) { this.held.set(key, {note, velocity, channel}); this.sustained.delete(key); }
      if (type === 0x80 || (type === 0x90 && velocity === 0)) {
        const old = this.held.get(key); this.held.delete(key);
        if (old && this.pedals.has(channel)) this.sustained.set(key, old);
        else this.sustained.delete(key);
      }
      if (type === 0xb0) {
        if (note === 64) {
          if (velocity >= 64) this.pedals.add(channel);
          else { this.pedals.delete(channel); this.clearChannel(this.sustained, channel); }
        }
        if (note === 120) { this.clearChannel(this.held, channel); this.clearChannel(this.sustained, channel); }
        if (note === 123) {
          if (this.pedals.has(channel)) for (const [k,v] of this.held) if (v.channel === channel) this.sustained.set(k,v);
          this.clearChannel(this.held, channel);
        }
        if (note === 121) { this.pedals.delete(channel); this.clearChannel(this.sustained, channel); }
      }
    }
    clearChannel(map, channel) { for (const [k, v] of map) if (v.channel === channel) map.delete(k); }
    notes() { return [...new Set([...this.held.values(), ...this.sustained.values()].map(v => v.note))].sort((a,b) => a-b); }
  }
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const noteName = n => `${names[n % 12]}${Math.floor(n / 12) - 1}`;
  const api = {MidiDecoder, NoteState, noteName};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PianoMidi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
