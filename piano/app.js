(() => {
  'use strict';
  const {MidiDecoder, NoteState, noteName} = PianoMidi;
  const $ = id => document.getElementById(id);
  const SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
  const CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';
  const state = new NoteState();
  let device, characteristic, access, input, pendingPort, mode = '', generation = 0, busy = false;
  const keys = new Map();
  let whites = 0;
  for (let note = 21; note <= 108; note++) {
    const black = [1,3,6,8,10].includes(note % 12);
    const key = document.createElement('div');
    key.className = `key ${black ? 'black' : 'white'}`;
    key.style.left = `${black ? whites * 32 - 10 : whites++ * 32}px`;
    if (note % 12 === 0) { const label = document.createElement('span'); label.textContent = noteName(note); key.append(label); }
    $('keyboard').append(key); keys.set(note, key);
  }
  document.querySelector('.keyboard-window').scrollLeft = 23 * 32 - 60;
  function render() {
    const held = new Set([...state.held.values()].map(v => v.note));
    const sustained = new Set([...state.sustained.values()].map(v => v.note));
    for (const [n, key] of keys) { key.classList.toggle('held', held.has(n)); key.classList.toggle('sustained', sustained.has(n)); }
    $('notes').textContent = state.notes().map(noteName).join(' · ') || '—';
    $('count').textContent = `${held.size} ${held.size === 1 ? 'note' : 'notes'} held`;
    $('pedal').textContent = state.pedals.size ? 'Sustain on' : 'Sustain off';
  }
  function receive(message) {
    state.accept(message);
    if ((message[0] & 0xf0) === 0x90 && message[2] > 0) {
      $('details').textContent = `Last note: ${noteName(message[1])} · MIDI ${message[1]} · Velocity ${message[2]} / 127 · Channel ${(message[0] & 15) + 1}`;
    }
    render();
    window.PianoPractice?.receive(message);
  }
  const decoder = new MidiDecoder(receive);
  function clear() { window.PianoPractice?.clear(); state.clear(); decoder.reset(); render(); $('details').textContent = 'Play a note on your connected keyboard.'; }
  function buttons() {
    $('bluetooth').disabled = busy || !navigator.bluetooth || !window.isSecureContext;
    $('usb').disabled = busy || !navigator.requestMIDIAccess || !window.isSecureContext;
    $('disconnect').disabled = !busy && !mode;
  }
  function message(text) { $('message').textContent = text; }
  function disconnect(text = 'Disconnected') {
    window.PianoPractice?.setConnected(false);
    generation++; busy = false; mode = '';
    pendingPort = null;
    if (input) { input.onmidimessage = null; input.close().catch(() => {}); input = null; }
    if (access) access.onstatechange = null;
    if (characteristic) { characteristic.removeEventListener('characteristicvaluechanged', bluetoothData); characteristic = null; }
    if (device) { device.removeEventListener('gattserverdisconnected', bluetoothLost); if (device.gatt.connected) device.gatt.disconnect(); device = null; }
    $('usb-picker').hidden = true; $('connection').textContent = 'No keyboard connected';
    clear(); buttons(); message(text);
  }
  function bluetoothData(event) { if (mode === 'bluetooth') decoder.ble(event.target.value); }
  function bluetoothLost() { disconnect('Bluetooth connection lost. Tap Connect Bluetooth to reconnect.'); }
  function errorText(error, transport) {
    if (error.name === 'NotFoundError') return transport === 'Bluetooth' ? 'No MIDI keyboard selected or MIDI service unavailable. Enable Bluetooth MIDI on the keyboard. Only devices advertising the MIDI service are listed.' : 'No MIDI input found.';
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return `${transport} access was denied. Allow device access in Chrome’s site settings, then try again.`;
    return `${transport} connection failed: ${error.message || 'Try reconnecting the keyboard.'}`;
  }
  $('bluetooth').addEventListener('click', async () => {
    disconnect(); mode = 'bluetooth'; busy = true; const attempt = generation; buttons();
    message('Choose your Bluetooth MIDI keyboard in the device picker…');
    let selected;
    try {
      // requestDevice must run directly from this button's user gesture.
      selected = await navigator.bluetooth.requestDevice({filters: [{services: [SERVICE]}]});
      if (attempt !== generation) return;
      device = selected; device.addEventListener('gattserverdisconnected', bluetoothLost);
      message('Connecting to the keyboard…');
      const server = await device.gatt.connect();
      if (attempt !== generation) { selected.gatt.disconnect(); return; }
      const service = await server.getPrimaryService(SERVICE);
      const channel = await service.getCharacteristic(CHARACTERISTIC);
      if (attempt !== generation) return;
      characteristic = channel; channel.addEventListener('characteristicvaluechanged', bluetoothData);
      await channel.startNotifications();
      if (attempt !== generation) return;
      $('connection').textContent = `Bluetooth · ${device.name || 'MIDI keyboard'}`;
      window.PianoPractice?.setConnected(true);
      message('Connected. Play your keyboard to see notes here.');
    } catch (error) {
      if (attempt === generation) disconnect(errorText(error, 'Bluetooth'));
    } finally { if (attempt === generation) { busy = false; buttons(); } }
  });
  function refreshInputs() {
    const selected = input?.id || '';
    $('inputs').replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a keyboard'; $('inputs').append(placeholder);
    const ports = [...access.inputs.values()].filter(p => p.state === 'connected');
    for (const port of ports) {
      const option = document.createElement('option'); option.value = port.id; option.textContent = port.name || port.manufacturer || 'MIDI input'; $('inputs').append(option);
    }
    $('inputs').value = ports.some(p => p.id === selected) ? selected : '';
    if (!ports.length) message('No MIDI inputs found. Check the USB data cable, keyboard power, and USB-to-host port. Newly plugged-in devices will appear here.');
    return ports;
  }
  async function selectInput(id) {
    window.PianoPractice?.setConnected(false);
    const attempt = ++generation;
    if (input) { input.onmidimessage = null; input.close().catch(() => {}); input = null; }
    clear(); $('connection').textContent = 'No keyboard selected';
    const port = access.inputs.get(id);
    pendingPort = null;
    if (!port || port.state !== 'connected') return;
    pendingPort = port;
    try {
      await port.open();
      if (attempt !== generation || mode !== 'usb') { if (input !== port) port.close().catch(() => {}); return; }
      input = port; input.onmidimessage = e => { if (input === port) decoder.push(e.data); };
      $('inputs').value = port.id;
      $('connection').textContent = `MIDI · ${port.name || 'Keyboard'}`;
      window.PianoPractice?.setConnected(true);
      message('Connected. Play your keyboard to see notes here.');
    } catch (error) { if (attempt === generation) message(errorText(error, 'USB / MIDI')); }
    finally { if (attempt === generation) pendingPort = null; }
  }
  $('usb').addEventListener('click', async () => {
    disconnect(); mode = 'usb'; busy = true; const attempt = generation; buttons();
    message('Allow MIDI access when Chrome asks…');
    try {
      const result = await navigator.requestMIDIAccess({sysex: false});
      if (attempt !== generation) return;
      access = result; $('usb-picker').hidden = false;
      access.onstatechange = event => {
        if (mode !== 'usb') return;
        if (input && event.port.id === input.id && event.port.type === 'input' && event.port.state === 'disconnected') {
          window.PianoPractice?.setConnected(false);
          generation++; input.onmidimessage = null; input = null; clear(); $('connection').textContent = 'Keyboard unplugged';
          message('Keyboard disconnected. Reconnect it to continue.');
        }
        const ports = refreshInputs();
        if (!input && !pendingPort && ports.length === 1 && event.port.type === 'input' && event.port.state === 'connected') selectInput(ports[0].id);
      };
      const ports = refreshInputs();
      busy = false; buttons();
      if (ports.length === 1) await selectInput(ports[0].id);
      else if (ports.length > 1) message('Select the keyboard you want to use.');
    } catch (error) { if (attempt === generation) disconnect(errorText(error, 'USB / MIDI')); }
    finally { if (attempt === generation) { busy = false; buttons(); } }
  });
  $('inputs').addEventListener('change', () => selectInput($('inputs').value));
  $('disconnect').addEventListener('click', () => disconnect());
  $('clear').addEventListener('click', clear);
  window.addEventListener('pagehide', () => disconnect());
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  $('compatibility').textContent = !window.isSecureContext ? 'Open this app over HTTPS to connect devices.' :
    `Bluetooth ${navigator.bluetooth ? 'available' : 'unavailable in this browser'} · USB MIDI ${navigator.requestMIDIAccess ? 'available' : 'unavailable in this browser'}.`;
  buttons();
})();
