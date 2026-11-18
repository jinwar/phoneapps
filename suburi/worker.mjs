import {templateTrial} from './hayasuburi-trial.mjs?v=1.5.0';
import {detect,calibrate,prepare} from './detector.mjs?v=1.5.0';
import {learnTemplates} from './template-learning.mjs?v=1.5.0';
self.onmessage=({data:m})=>{try{
 const templates=m.model?.stationaryTemplates||m.templates;let result;
 if(m.action==='prepare')result={segments:prepare(m.samples,templates),trial:templateTrial(m.samples,m.model?.hayasuburiTemplate)};
 else if(m.action==='calibrate'){
  const fit=calibrate(m.sessions,templates,m.settings,m.type);
  const learned=learnTemplates(m.sessions,m.templates,{...m.model,settings:fit.settings},m.type);
  result={...fit,changed:fit.changed||learned.changed,learnedTemplates:learned.templates,templateLearning:learned.report,message:`${fit.message} ${learned.message}`};
 }else result=detect(m.samples,templates,m.settings);
 self.postMessage({id:m.id,result});
}catch(e){self.postMessage({id:m.id,error:e.message});}};
