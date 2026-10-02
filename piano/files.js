/* Local MusicXML and compressed MusicXML reader. No files leave the device. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PianoFiles=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const LIMIT=20*1024*1024;
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function decode(bytes){let encoding='utf-8';if((bytes[0]===255&&bytes[1]===254)||(bytes[0]===60&&bytes[1]===0))encoding='utf-16le';else if((bytes[0]===254&&bytes[1]===255)||(bytes[0]===0&&bytes[1]===60))encoding='utf-16be';else{const declaration=new TextDecoder().decode(bytes.subarray(0,200)).match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i);if(declaration)encoding=declaration[1];}return new TextDecoder(encoding,{fatal:true}).decode(bytes);}
async function unzipScore(bytes,parseXML=text=>new DOMParser().parseFromString(text,'application/xml')){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),fail=()=>{throw Error('Invalid or unsupported MXL archive.');};
 const u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))fail();
 const count=u16(end+10),size=u32(end+12),start=u32(end+16);if(count===65535||start+size>end)fail();
 const entries=new Map();let p=start;
 for(let i=0;i<count;i++){
  if(p+46>start+size||u32(p)!==0x02014b50)fail();
  const nameLength=u16(p+28),next=p+46+nameLength+u16(p+30)+u16(p+32);if(next>start+size)fail();
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p+46,p+46+nameLength));
  if(entries.has(name))fail();
  entries.set(name,{flags:u16(p+8),method:u16(p+10),crc:u32(p+16),packed:u32(p+20),length:u32(p+24),offset:u32(p+42)});p=next;
 }
 async function extract(name,limit){
  const e=entries.get(name);if(!e)throw Error(`MXL archive is missing ${name}.`);
  if(e.length>limit)throw Error('The expanded MusicXML file is too large.');
  if((e.flags&1)||![0,8].includes(e.method)||e.offset+30>start||e.packed===0xffffffff)fail();
  const o=e.offset;if(u32(o)!==0x04034b50||u16(o+8)!==e.method)fail();
  const begin=o+30+u16(o+26)+u16(o+28);if(begin+e.packed>start)fail();
  let result=bytes.subarray(begin,begin+e.packed);
  if(e.method===8){
   let inflater;try{inflater=new DecompressionStream('deflate-raw');}catch{throw Error('Please update Chrome to open compressed MXL files.');}
   const reader=new Blob([result]).stream().pipeThrough(inflater).getReader(),chunks=[];let total=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit||total>e.length){await reader.cancel();throw Error('The expanded MusicXML file is too large or damaged.');}chunks.push(value);}}finally{reader.releaseLock();}
   result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  }
  if(result.length!==e.length||crc32(result)!==e.crc)throw Error('The MXL file is damaged. Please download or export it again.');
  return decode(result);
 }
 const container=parseXML(await extract('META-INF/container.xml',1024*1024));
 if(container.getElementsByTagName('parsererror').length||container.documentElement?.localName!=='container')throw Error('Invalid MXL container.xml.');
 const roots=container.getElementsByTagNameNS('*','rootfile');
 const path=roots[0]?.getAttribute('full-path');if(!path)throw Error('MXL container does not identify a score.');
 return extract(path,LIMIT);
}
async function readScore(file){
 if(file.size>LIMIT)throw Error('Please choose a MusicXML or MXL file smaller than 20 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 return /\.mxl$/i.test(file.name)|| (bytes[0]===80&&bytes[1]===75)?unzipScore(bytes):decode(bytes);
}
return {readScore,unzipScore};
});
