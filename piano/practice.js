(() => {
'use strict';
const $=id=>document.getElementById(id), {eventsFor,Follower,parseDocument}=PianoScore;
let demoAttempt=0;
let score,events=[],follower,connected=false,mode='idle',audio,clock,voices=new Set(),demoStart=0,demoBeat=0,nextEvent=0,loadVersion=0;
const NS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},value){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(value!==undefined)e.textContent=value;return e;}
const tempo=()=>Math.max(20,Math.min(240,Number($('tempo').value)||100));
function info(s){$('practice-message').textContent=s;}
function stop(){demoAttempt++;clearInterval(clock);clock=null;for(const v of voices){try{v.stop();}catch{}}voices.clear();mode='idle';$('demo').textContent='▶ Demonstrate';$('practice').textContent='Practice with keyboard';$('tempo').disabled=false;}
function update(scroll=false){
 const index=follower?.index ?? 0;
 for(const tile of $('score-notes').children){const i=Number(tile.dataset.index);tile.classList.toggle('current',i===index);tile.classList.toggle('done',i<index);tile.setAttribute('aria-current',i===index?'step':'false');}
 $('progress').textContent=events.length ? `${Math.min(index+1,events.length)} / ${events.length}${index===events.length?' · Complete':''}`:'No score loaded';
 const e=events[index];$('target').textContent=e?(e.expected.length?e.expected.map(PianoMidi.noteName).join(' + '):'Rest'):(events.length?'Finished!':'Load a score to begin');
 if(scroll&&e)$('score-notes').children[index]?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
 $('demo').disabled=!events.length;$('practice').disabled=!events.length||!connected;$('restart').disabled=!events.length;
}
function pitchPosition(midi,bass){
 const pcs=[0,0,1,1,2,3,3,4,4,5,5,6],oct=Math.floor(midi/12)-1;
 const diatonic=oct*7+pcs[midi%12];
 return (bass?160:70)-5*(diatonic-(bass?2*7+4:4*7+2));
}
function draw(){
 $('score-notes').replaceChildren();
 events.forEach((event,index)=>{
  const button=document.createElement('button');button.className='score-note';button.type='button';button.dataset.index=index;
  const label=`Measure ${event.measure}, ${event.expected.map(PianoMidi.noteName).join(' and ')||'rest'}`;button.setAttribute('aria-label',`Jump to ${label}`);
  const graphic=svg('svg',{viewBox:'0 0 116 215','aria-hidden':'true'});
  graphic.append(svg('text',{x:8,y:17,'font-size':11},`m. ${event.measure}`));
  for(const bottom of [70,160])for(let line=0;line<5;line++)graphic.append(svg('line',{x1:4,x2:112,y1:bottom-line*10,y2:bottom-line*10,stroke:'#9aabb8','stroke-width':.7}));
  graphic.append(svg('text',{x:5,y:64,'font-size':32},'𝄞'),svg('text',{x:5,y:149,'font-size':27},'𝄢'));
  if(!event.notes.length)graphic.append(svg('text',{x:54,y:66,'font-size':28},'𝄽'));
  const seen=new Set();
  for(const n of event.notes){
   if(seen.has(n.midi))continue;seen.add(n.midi);
   const bass=n.midi<60,y=pitchPosition(n.midi,bass),bottom=bass?160:70,top=bottom-40;
   // Octave displacement keeps extreme MIDI pitches readable on a compact staff.
   let drawnY=y,octave=0;while(drawnY<top-20){drawnY+=35;octave++;}while(drawnY>bottom+20){drawnY-=35;octave--;}
   if(octave)graphic.append(svg('text',{x:79,y:drawnY-9,'font-size':8},`${Math.abs(octave)*8}${octave>0?'va':'vb'}`));
   for(let l=bottom+10;l<=drawnY;l+=10)graphic.append(svg('line',{x1:44,x2:73,y1:l,y2:l,stroke:'currentColor'}));
   for(let l=top-10;l>=drawnY;l-=10)graphic.append(svg('line',{x1:44,x2:73,y1:l,y2:l,stroke:'currentColor'}));
   graphic.append(svg('ellipse',{cx:58,cy:drawnY,rx:7,ry:5,transform:`rotate(-15 58 ${drawnY})`,fill:n.duration>=2?'#f7fafc':'currentColor',stroke:'currentColor','stroke-width':1.6}));
   if(n.duration<4){graphic.append(svg('line',{x1:64,x2:64,y1:drawnY,y2:drawnY-27,stroke:'currentColor','stroke-width':1.4}));
    if(n.duration<1)graphic.append(svg('path',{d:`M64 ${drawnY-27}q18 10 5 20`,fill:'none',stroke:'currentColor','stroke-width':2}));}
   if([1,3,6,8,10].includes(n.midi%12))graphic.append(svg('text',{x:35,y:drawnY+4,'font-size':15},'♯'));
  }
  graphic.append(svg('text',{x:58,y:200,'text-anchor':'middle','font-size':10},event.expected.map(PianoMidi.noteName).join(' ')||'Rest'));
  button.append(graphic);button.addEventListener('click',()=>{const practicing=mode==='practice';stop();follower.jump(index);if(practicing){mode='practice';follower.skipRests();$('practice').textContent='Pause practice';}update(true);info('Position changed. '+(practicing?'Play the highlighted notes.':'Choose Demonstrate or Practice.'));});
  $('score-notes').append(button);
 });update();
}
function selectPart(){stop();const part=score.parts[Number($('score-part').value)];events=eventsFor(part);follower=new Follower(events);follower.jump(0);$('tempo').value=Math.round(Math.min(240,Math.max(20,part.tempo)));draw();info('Ready. Tap any note to choose a starting point.');}
async function load(file){
 const version=++loadVersion;if(!file)return;stop();
 try{
  const content=await PianoFiles.readScore(file);if(version!==loadVersion)return;
  const parsed=parseDocument(new DOMParser().parseFromString(content,'application/xml'));
  score=parsed;$('score-title').textContent=score.title==='Untitled score'?file.name:score.title;
  $('score-part').replaceChildren();score.parts.forEach((p,i)=>{const option=document.createElement('option');option.value=i;option.textContent=p.name;option.disabled=!p.notes.length;$('score-part').append(option);});
  $('score-part').value=score.parts.findIndex(p=>p.notes.length);
  $('score-warnings').textContent=score.warnings.join(' ');selectPart();
 }catch(error){if(version===loadVersion)info(`Could not load score: ${error.message}`);}
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
 if(follower.index>=events.length)follower.jump(0);follower.down.clear();follower.skipRests();mode='practice';$('practice').textContent='Pause practice';update(true);info('Play the highlighted notes. For a chord, press all the indicated keys together.');
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
 if(current!==follower.index){follower.jump(current);update(true);}
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
 else if(result==='advance'){update(true);info('Correct! Play the next highlighted notes.');}
 else if(result==='complete'){stop();update();info('Finished — well played!');}},
 clear(){follower?.down.clear();}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();info('Paused while the app is in the background.');}});
window.addEventListener('pagehide',pause);update();
})();
