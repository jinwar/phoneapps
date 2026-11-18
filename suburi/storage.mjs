import {retainPractices,mergeSummaries,validSummaries} from './history.mjs?v=1.6.0';
const DB='suburi-practice-v1';
export function openDatabase(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore('sessions',{keyPath:'id'});request.result.createObjectStore('settings');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Suburi tabs to update local storage.'));});}
export function readAll(db){return new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','settings'],'readonly');const s=tx.objectStore('sessions').getAll(),m=tx.objectStore('settings').get('model'),h=tx.objectStore('settings').get('practiceSummaries');tx.oncomplete=()=>resolve({sessions:s.result,model:m.result,summaries:h.result||[]});tx.onerror=()=>reject(tx.error);});}
// Update summaries and remove excess raw recordings atomically. A failed write
// aborts the entire transaction, so raw data cannot be deleted without its count.
export function save(db,session,model){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['sessions','settings'],'readwrite'),store=tx.objectStore('sessions'),settings=tx.objectStore('settings');
 if(session)store.put(session);if(model)settings.put(model,'model');
 const all=store.getAll(),history=settings.get('practiceSummaries');let result;
 history.onsuccess=()=>{if(!validSummaries(history.result||[])){tx.abort();return;}
 const sessions=all.result,summaries=mergeSummaries(history.result||[],sessions),retained=retainPractices(sessions),ids=new Set(retained.map(s=>s.id));
 settings.put(summaries,'practiceSummaries');for(const s of sessions)if(!ids.has(s.id))store.delete(s.id);
 result={sessions:retained,summaries};};
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save interrupted'));
});}
