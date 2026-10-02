const {test} = require('node:test');
const assert = require('node:assert/strict');
const {MidiDecoder, NoteState, noteName} = require('../piano/midi.js');
test('BLE timestamps, packed notes, running status, velocity-zero release', () => {
 const output=[]; const parser=new MidiDecoder(m=>output.push(m));
 parser.ble([0x80,0x80,0x90,60,100,64,90,0x81,67,80,0x82,0x90,60,0]);
 assert.deepEqual(output,[[0x90,60,100],[0x90,64,90],[0x90,67,80],[0x90,60,0]]);
});
test('BLE timestamp bytes resembling status; DataView offset and split SysEx', () => {
 const output=[]; const parser=new MidiDecoder(m=>output.push(m));
 const packet=Uint8Array.from([0,0x80,0xf8,0x90,60,100,0]);
 parser.ble(new DataView(packet.buffer,1,5));
 parser.ble([0x80,0x80,0xf0,1,2]);parser.ble([0x80,3,4,0x81,0xf7,0x82,0x80,60,0]);
 assert.deepEqual(output,[[0x90,60,100],[0x80,60,0]]);
});
test('USB stream supports partial messages, real-time bytes and program changes', () => {
 const out=[];const parser=new MidiDecoder(m=>out.push(m));
 parser.push([0x90,60]);parser.push([0xf8,100,64,90,0xc0,10,11,0x80,60,0]);
 assert.deepEqual(out,[[0x90,60,100],[0x90,64,90],[0xc0,10],[0xc0,11],[0x80,60,0]]);
});
test('sustain, re-strike, channel separation and all-notes-off', () => {
 const s=new NoteState();s.accept([0x90,60,100]);s.accept([0x91,60,80]);s.accept([0xb0,64,127]);
 s.accept([0x90,60,0]);assert.deepEqual(s.notes(),[60]);assert.equal(s.sustained.size,1);
 s.accept([0x90,60,90]);assert.equal(s.sustained.size,0);
 s.accept([0xb0,123,0]);assert.equal(s.held.size,1);assert.equal(s.sustained.size,1);
 s.accept([0xb0,64,0]);assert.deepEqual(s.notes(),[60]);
 s.accept([0xb1,120,0]);assert.deepEqual(s.notes(),[]);
});
test('reset clears state and MIDI note labels include middle C', () => {
 const s=new NoteState();s.accept([0x90,60,100]);s.accept([0xff]);assert.deepEqual(s.notes(),[]);
 assert.equal(noteName(60),'C4');assert.equal(noteName(21),'A0');assert.equal(noteName(108),'C8');
});
