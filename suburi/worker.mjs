import {templateTrial} from './hayasuburi-trial.mjs?v=1.4.0';
import {detect,calibrate,prepare} from './detector.mjs?v=1.3.0';
self.onmessage=({data:m})=>{try{const result=m.action==='prepare'?{segments:prepare(m.samples,m.templates),trial:templateTrial(m.samples)}:m.action==='calibrate'?calibrate(m.sessions,m.templates,m.settings,m.type):detect(m.samples,m.templates,m.settings);self.postMessage({id:m.id,result});}catch(e){self.postMessage({id:m.id,error:e.message});}};
