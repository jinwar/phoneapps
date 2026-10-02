(() => {
'use strict';
const stage=document.getElementById('score-stage'),library=document.getElementById('score-library'),toggle=document.getElementById('toggle-library');
let focused=false,native=false,previousFocus;
function showLibrary(show){library.hidden=!show;toggle.setAttribute('aria-expanded',String(show));}
function enter(){if(!focused)previousFocus=document.activeElement;focused=true;stage.classList.add('score-focused');document.body.classList.add('score-open');document.getElementById('close-score').hidden=false;}
async function leave(){focused=false;stage.classList.remove('score-focused');document.body.classList.remove('score-open');document.getElementById('close-score').hidden=true;if(document.fullscreenElement===stage)try{await document.exitFullscreen();}catch{}previousFocus?.focus?.();}
document.getElementById('fullscreen-score').addEventListener('click',async()=>{
 enter();if(document.fullscreenElement===stage)return;
 try{await stage.requestFullscreen();native=true;}catch{/* The fixed viewport layout also works without the Fullscreen API. */}
});
document.getElementById('close-score').addEventListener('click',leave);
document.getElementById('score-connect').addEventListener('click',async()=>{await leave();document.getElementById('bluetooth').focus();document.getElementById('connect-title').scrollIntoView({block:'start'});});
toggle.addEventListener('click',()=>showLibrary(library.hidden));
document.addEventListener('fullscreenchange',()=>{if(native&&document.fullscreenElement!==stage){native=false;leave();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&focused&&!document.fullscreenElement)leave();});
window.PianoView={enter,leave,showLibrary};
})();
