const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const PianoMidi=require('../piano/midi.js');
function setup() {
 const elements={};
 function el(){return {value:'',textContent:'',style:{},classList:{toggle(){}},listeners:{},children:[],addEventListener(n,f){this.listeners[n]=f;},append(v){this.children.push(v);},replaceChildren(){this.children=[];}};}
 const document={hidden:false,getElementById(id){return elements[id] ||= el();},createElement:el,querySelector(){return el();},addEventListener(){}};
 let requests=0;
 const access={inputs:new Map()};
 const port={id:'piano',type:'input',name:'USB Piano',state:'connected',connection:'closed',async open(){this.connection='open';requests++;access.onstatechange?.({port:this});},async close(){this.connection='closed';}};
 access.inputs.set(port.id,port);
 const characteristic={listeners:{},addEventListener(n,f){this.listeners[n]=f;},removeEventListener(n){delete this.listeners[n];},async startNotifications(){}};
 const device={name:'BLE Piano',listeners:{},addEventListener(n,f){this.listeners[n]=f;},removeEventListener(n){delete this.listeners[n];},gatt:{connected:false,async connect(){this.connected=true;return this;},disconnect(){this.connected=false;},async getPrimaryService(){return {async getCharacteristic(){return characteristic;}};}}};
 const navigator={async requestMIDIAccess(){return access;},bluetooth:{async requestDevice(options){navigator.bluetooth.options=options;return device;}}};
 const window={isSecureContext:true,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../piano/app.js'),'utf8'),{PianoMidi,document,navigator,window});
 return {elements,port,access,device,characteristic,navigator,requests:()=>requests,click:id=>elements[id].listeners.click()};
}
test('USB opens once, receives notes, clears on unplug and reconnects',async()=>{
 const app=setup();await app.click('usb');assert.equal(app.requests(),1);
 assert.match(app.elements.connection.textContent,/USB Piano/);
 app.port.onmidimessage({data:[0x90,60,100]});assert.equal(app.elements.notes.textContent,'C4');
 app.port.state='disconnected';app.access.onstatechange({port:app.port});assert.equal(app.elements.notes.textContent,'—');
 app.port.state='connected';app.access.onstatechange({port:app.port});await new Promise(setImmediate);
 assert.equal(app.requests(),2);assert.match(app.elements.connection.textContent,/USB Piano/);
 await app.click('disconnect');assert.equal(app.port.onmidimessage,null);assert.equal(app.access.onstatechange,null);
});
test('BLE notifications show notes and disconnect removes listeners',async()=>{
 const app=setup();await app.click('bluetooth');assert.match(app.elements.connection.textContent,/BLE Piano/);
 app.characteristic.listeners.characteristicvaluechanged({target:{value:new DataView(Uint8Array.from([0x80,0x80,0x90,64,100]).buffer)}});
 assert.equal(app.elements.notes.textContent,'E4');app.device.listeners.gattserverdisconnected();
 assert.equal(app.elements.notes.textContent,'—');assert.equal(app.device.gatt.connected,false);
 assert.equal(app.characteristic.listeners.characteristicvaluechanged,undefined);
});
test('permission denial restores controls and shows error',async()=>{
 const app=setup();app.navigator.requestMIDIAccess=async()=>{throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});};
 await app.click('usb');assert.match(app.elements.message.textContent,/denied/);assert.equal(app.elements.usb.disabled,false);
});
test('cancelled Bluetooth attempt cannot attach a late device',async()=>{
 const app=setup();let resolve;app.navigator.bluetooth.requestDevice=()=>new Promise(r=>resolve=r);
 const start=app.click('bluetooth');await app.click('disconnect');resolve(app.device);await start;
 assert.equal(app.device.gatt.connected,false);assert.equal(app.elements.connection.textContent,'No keyboard connected');
});

test('Bluetooth picker filters by the standard MIDI service only',async()=>{
 const app=setup();await app.click('bluetooth');
 assert.equal(app.navigator.bluetooth.options.filters[0].services[0],'03b80e5a-ede8-4b33-a751-6ce34ec4c700');
 assert.equal(app.navigator.bluetooth.options.acceptAllDevices,undefined);
});
