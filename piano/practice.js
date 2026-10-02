(() => {
'use strict';
const $=id=>document.getElementById(id), {eventsFor,Follower,parseDocument}=PianoScore;
let demoAttempt=0;
let score,events=[],follower,connected=false,mode='idle',audio,clock,voices=new Set(),demoStart=0,demoBeat=0,nextEvent=0,loadVersion=0;
let scoreXML='',renderVersion=0,rendering=false;
const notation=new PianoNotation($('score-notes'),jumpTo);
const tempo=()=>Math.max(20,Math.min(240,Number($('tempo').value)||100));
function info(s){$('practice-message').textContent=s;}
function stop(){demoAttempt++;clearInterval(clock);clock=null;for(const v of voices){try{v.stop();}catch{}}voices.clear();mode='idle';$('demo').textContent='▶ Demonstrate';$('practice').textContent='Practice with keyboard';$('tempo').disabled=false;}
function update(scroll=false){
 const index=follower?.index ?? 0;
 notation.position(index,null,scroll);
 $('progress').textContent=events.length ? `${Math.min(index+1,events.length)} / ${events.length}${index===events.length?' · Complete':''}`:'No score loaded';
 const e=events[index];$('target').textContent=e?(e.expected.length?e.expected.map(PianoMidi.noteName).join(' + '):'Rest'):(events.length?'Finished!':'Load a score to begin');
 $('demo').disabled=rendering||!events.length;$('practice').disabled=rendering||!events.length||!connected;$('restart').disabled=rendering||!events.length;

}
function jumpTo(index){
 if(rendering||!follower)return;
 const practicing=mode==='practice';stop();follower.jump(index);if(practicing){mode='practice';follower.skipRests();$('practice').textContent='Pause practice';}update(true);info('Position changed. '+(practicing?'Play the notes at the line.':'Choose Demonstrate or Practice.'));
}
async function selectPart(){
 stop();const version=++renderVersion,partIndex=Number($('score-part').value),part=score.parts[partIndex];
 rendering=true;events=eventsFor(part);follower=new Follower(events);follower.jump(0);$('tempo').value=Math.round(Math.min(240,Math.max(20,part.tempo)));update();info('Preparing sheet music…');
 try{await notation.load(scoreXML,partIndex,part,events);if(version!==renderVersion)return;rendering=false;update();info('Ready. Tap a note to choose a starting point.');}
 catch(error){if(version!==renderVersion)return;events=[];rendering=false;update();info(`Could not display score: ${error.message}`);}
}
async function load(file){
 const version=++loadVersion;if(!file)return;stop();
 ++renderVersion;++notation.version;rendering=true;events=[];follower=null;notation.points=[];if(notation.line)notation.line.hidden=true;update();info('Loading score…');
 try{
  const content=await PianoFiles.readScore(file);if(version!==loadVersion)return;
  const parsed=parseDocument(new DOMParser().parseFromString(content,'application/xml'));
  scoreXML=content;score=parsed;$('score-title').textContent=score.title==='Untitled score'?file.name:score.title;
  $('score-part').replaceChildren();score.parts.forEach((p,i)=>{const option=document.createElement('option');option.value=i;option.textContent=p.name;option.disabled=!p.notes.length;$('score-part').append(option);});
  $('score-part').value=score.parts.findIndex(p=>p.notes.length);
  $('score-warnings').textContent=score.warnings.join(' ');await selectPart();
 }catch(error){if(version===loadVersion){rendering=false;update();info(`Could not load score: ${error.message}`);}}
}
$('score-file').addEventListener('change',e=>{load(e.target.files[0]);e.target.value='';});
$('open-local').addEventListener('click',()=>$('score-file').click());
$('open-drive').addEventListener('click',()=>{info('In the file picker, open the ☰ menu and choose Google Drive. If Drive is missing, install/open the Google Drive app and sign in, then try again.');$('score-file').click();});
$('score-part').addEventListener('change',selectPart);
$('tempo').addEventListener('change',()=>{$('tempo').value=tempo();});
$('restart').addEventListener('click',()=>{stop();follower.jump(0);update(true);info('Returned to the beginning.');});
$('practice').addEventListener('click',()=>{
 if(mode==='practice'){stop();info('Practice paused.');return;}
 stop();if(!connected){info('Connect your keyboard first.');return;}
 if(follower.index>=events.length)follower.jump(0);follower.down.clear();follower.skipRests();mode='practice';$('practice').textContent='Pause practice';update(true);info('Play the notes at the line. For a chord, press all the indicated keys together.');
});
function playNote(n,when,seconds){
 const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.value=440*2**((n.midi-69)/12);
 const end=when+Math.max(.06,seconds);gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.08/Math.sqrt(Math.max(1,events[nextEvent]?.notes.length||1)),when+.01);gain.gain.exponentialRampToValueAtTime(.001,end);
 osc.connect(gain).connect(audio.destination);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(when);osc.stop(end+.02);
}
function tick(){
 if(mode!=='demo')return;
 const rate=60/tempo(),now=audio.currentTime,beat=demoBeat+(now-demoStart)/rate;
 while(nextEvent<events.length&&events[nextEvent].time<=beat+1/rate){
  const e=events[nextEvent];for(const n of e.notes)playNote(n,Math.max(now,demoStart+(n.time-demoBeat)*rate),n.duration*rate);nextEvent++;
 }
 let current=follower.index;while(current+1<events.length&&events[current+1].time<=beat)current++;
 const changed=current!==follower.index;if(changed){follower.jump(current);update();}
 notation.position(current,beat,changed);
 const end=Math.max(events.at(-1).end,...events.at(-1).notes.map(n=>n.time+n.duration));
 if(beat>=end){stop();follower.jump(events.length);update();info('Demonstration finished.');}
}
$('demo').addEventListener('click',async()=>{
 if(mode==='demo'){demoAttempt++;stop();info('Demonstration paused.');return;}
 stop();const attempt=++demoAttempt;
 try{
  audio ||= new (window.AudioContext||window.webkitAudioContext)();await audio.resume();
  if(attempt!==demoAttempt||document.hidden)return;
  if(follower.index>=events.length)follower.jump(0);
  mode='demo';$('demo').textContent='■ Stop demonstration';$('tempo').disabled=true;follower.down.clear();
  nextEvent=follower.index;demoBeat=events[nextEvent].time;demoStart=audio.currentTime+.08;
  update(true);info('Playing through your phone speakers.');tick();clock=setInterval(tick,30);
 }catch(error){stop();info(`Audio could not start: ${error.message}`);}
});
function pause(){demoAttempt++;stop();follower?.down.clear();update();}
window.PianoPractice={
 setConnected(value){connected=value;if(!value&&mode==='practice'){pause();info('Practice paused: reconnect your keyboard to continue.');}update();},
 receive(m){if(mode!=='practice'||!follower)return;const result=follower.input(m);if(result==='wrong')info('Wrong key — release it and play '+events[follower.index].expected.map(PianoMidi.noteName).join(' + ')+'.');
 else if(result==='partial')info('Keep these keys down and add the remaining chord notes.');
 else if(result==='advance'){update(true);info('Correct! Play the next notes at the line.');}
 else if(result==='complete'){stop();update();info('Finished — well played!');}},
 clear(){follower?.down.clear();}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();info('Paused while the app is in the background.');}});
window.addEventListener('pagehide',pause);update();
})();
