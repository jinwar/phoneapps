import {detect,calibrate,prepare} from './detector.mjs?v=1.1.1';
self.onmessage=({data:m})=>{try{const result=m.action==='prepare'?prepare(m.samples,m.templates):m.action==='calibrate'?calibrate(m.sessions,m.templates,m.settings,m.type):detect(m.samples,m.templates,m.settings);self.postMessage({id:m.id,result});}catch(e){self.postMessage({id:m.id,error:e.message});}};
