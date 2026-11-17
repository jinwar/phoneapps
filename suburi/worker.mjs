import {detect,calibrate} from './detector.mjs';
self.onmessage=({data:m})=>{try{const result=m.action==='calibrate'?calibrate(m.sessions,m.templates,m.settings,m.type):detect(m.samples,m.templates,m.settings);self.postMessage({id:m.id,result});}catch(e){self.postMessage({id:m.id,error:e.message});}};
