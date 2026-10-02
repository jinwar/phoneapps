/* IndexedDB score copies survive reloads without storing file-system permissions. */
(function(root){
'use strict';
async function transaction(mode,run){
 if(!root.indexedDB)throw Error('Saving scores is unavailable in this browser.');
 const db=await new Promise((resolve,reject)=>{
  const request=root.indexedDB.open('phoneapps-piano-scores',1);let blocked=false;
  request.onupgradeneeded=()=>{request.result.createObjectStore('scores',{keyPath:'id'});request.result.createObjectStore('titles',{keyPath:'id'});};
  request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>{blocked=true;reject(Error('Close other piano tabs and try again.'));};
 });
 return new Promise((resolve,reject)=>{
  let result,tx;
  try{tx=db.transaction(['scores','titles'],mode);run(tx,value=>{result=value;});}catch(error){db.close();reject(error);return;}
  tx.oncomplete=()=>{db.close();resolve(result);};
  tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('Could not save score.'));};
 });
}
const api={
 async save({xml,title,name}){
  const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml));
  const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const metadata={id,title,name,updated:Date.now()};
  await transaction('readwrite',tx=>{tx.objectStore('scores').put({id,xml});tx.objectStore('titles').put(metadata);});return metadata;
 },
 list(){return transaction('readonly',(tx,done)=>{const request=tx.objectStore('titles').getAll();request.onsuccess=()=>done(request.result.sort((a,b)=>b.updated-a.updated));});},
 get(id){return transaction('readonly',(tx,done)=>{const content=tx.objectStore('scores').get(id),title=tx.objectStore('titles').get(id);title.onsuccess=()=>done(content.result&&title.result?{...title.result,xml:content.result.xml}:null);});},
 remove(id){return transaction('readwrite',tx=>{tx.objectStore('scores').delete(id);tx.objectStore('titles').delete(id);});}
};
root.PianoLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this);
