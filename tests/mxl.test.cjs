const {test}=require('node:test'),assert=require('node:assert/strict'),{deflateRawSync}=require('node:zlib');
const {readScore,unzipScore}=require('../piano/files.js');
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(entries){const local=[],central=[];let offset=0;for(const [name,text,method=8] of entries){const n=Buffer.from(name),data=Buffer.from(text),packed=method===8?deflateRawSync(data):data,l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(method,8);l.writeUInt32LE(crc(data),14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(method,10);c.writeUInt32LE(crc(data),16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(l,n,packed);central.push(c,n);offset+=l.length+n.length+packed.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);}
// DOM adapter models the container contract; archive bytes and inflation are real.
function parse(text){return {documentElement:{localName:text.includes('<container')?'container':'bad'},getElementsByTagName(){return [];},getElementsByTagNameNS(){return [...text.matchAll(/<rootfile full-path="([^"]+)"/g)].map(m=>({getAttribute(){return m[1].replace('&amp;','&');}}));}};}
const xml='<score-partwise version="4.0"><work><work-title>Test</work-title></work></score-partwise>';
function archive(method=8){return zip([['preview.xml','wrong score',method],['META-INF/container.xml','<container><rootfiles><rootfile full-path="scores/piano &amp; flute.xml"/><rootfile full-path="preview.xml"/></rootfiles></container>',method],['scores/piano & flute.xml',xml,method]]);}
test('stored and deflated MXL select first container rootfile, including nested escaped paths',async()=>{for(const method of [0,8])assert.equal(await unzipScore(archive(method),parse),xml);});
test('plain MusicXML and UTF-16 XML still load',async()=>{for(const bytes of [Buffer.from(xml),Buffer.from('\ufeff'+xml,'utf16le')])assert.equal(await readScore({name:'score.xml',size:bytes.length,arrayBuffer:async()=>bytes}),xml);});
test('MXL extension and ZIP signature route through decompression',async()=>{global.DOMParser=class{parseFromString(t){return parse(t);}};try{for(const name of ['SCORE.MXL','drive-download']){const bytes=archive();assert.equal(await readScore({name,size:bytes.length,arrayBuffer:async()=>bytes}),xml);}}finally{delete global.DOMParser;}});
test('damaged, incomplete and oversized archives give errors',async()=>{
 await assert.rejects(unzipScore(Buffer.from('bad'),parse),/Invalid/);
 await assert.rejects(unzipScore(zip([['score.xml',xml]]),parse),/missing META/);
 const damaged=archive(0);damaged[damaged.indexOf(Buffer.from(xml))]^=1;await assert.rejects(unzipScore(damaged,parse),/damaged/);
 const oversized=archive();let p=oversized.indexOf(Buffer.from([80,75,1,2]));p=oversized.indexOf(Buffer.from([80,75,1,2]),p+4);p=oversized.indexOf(Buffer.from([80,75,1,2]),p+4);oversized.writeUInt32LE(21*1024*1024,p+24);await assert.rejects(unzipScore(oversized,parse),/too large/);
 await assert.rejects(readScore({size:21*1024*1024}),/smaller than 20 MB/);
});
