/* Engrave the original MusicXML; overlay a timing cursor in OSMD's SVG coordinates. */
(function(root){
'use strict';
class Notation {
 constructor(host,onJump){
  this.host=host;this.onJump=onJump;this.points=[];this.index=0;this.beat=null;this.version=0;
  this.paper=document.createElement('div');this.paper.className='score-paper';
  this.line=document.createElement('div');this.line.className='score-cursor';this.line.hidden=true;this.line.setAttribute('aria-hidden','true');
  host.replaceChildren(this.paper,this.line);
  host.addEventListener('click',event=>{
   if(!this.points.length)return;
   const rect=this.paper.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
   // Choose a system first, then the nearest note column within that system.
   const distance=p=>y<p.top?p.top-y:y>p.bottom?y-p.bottom:0;
   const row=this.points.reduce((a,b)=>distance(a)<=distance(b)?a:b);
   const near=this.points.filter(p=>p.system===row.system).reduce((a,b)=>Math.abs(a.x-x)<=Math.abs(b.x-x)?a:b);
   let index=0;for(let i=0;i<this.events.length;i++){if(this.events[i].time>near.time+.00001)break;index=i;}
   this.onJump(index);
  });
  host.addEventListener('keydown',event=>{if(!this.events?.length)return;let index=this.index;if(event.key==='ArrowRight')index++;else if(event.key==='ArrowLeft')index--;else if(event.key==='Home')index=0;else if(event.key==='End')index=this.events.length-1;else return;event.preventDefault();this.onJump(Math.max(0,Math.min(this.events.length-1,index)));});
  if(typeof ResizeObserver!=='undefined'){
   let width=0;this.observer=new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(Math.abs(next-width)<1)return;width=next;clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>{if(this.ready)this.render();},120);});this.observer.observe(host);
  }
 }
 async load(xml,partIndex,part,events){
  const version=++this.version;this.ready=false;this.line.hidden=true;this.points=[];
  if(!root.opensheetmusicdisplay?.OpenSheetMusicDisplay)throw Error('The sheet-music renderer could not load. Check your internet connection and refresh.');
  this.paper.replaceChildren();
  const display=new root.opensheetmusicdisplay.OpenSheetMusicDisplay(this.paper,{backend:'svg',autoResize:false,pageFormat:'Endless',drawTitle:true,drawSubtitle:true,drawComposer:true,drawPartNames:false,drawCredits:true,newSystemFromXML:false,newPageFromXML:false});
  await display.load(xml);if(version!==this.version)return false;
  display.Sheet.Instruments.forEach((instrument,i)=>{instrument.Visible=i===partIndex;});
  this.display=display;this.part=part;this.events=events;this.index=0;this.beat=null;this.ready=true;this.render();return true;
 }
 render(){
  this.display.render();const scale=10*this.display.Zoom,points=[];
  this.display.GraphicSheet.MeasureList.forEach((staves,mi)=>{
   const timing=this.part.measures[mi];if(!timing)return;
   for(const measure of staves){
    if(!measure?.isVisible())continue;
    const system=measure.ParentMusicSystem,lines=system.StaffLines;
    const top=lines[0].PositionAndShape.AbsolutePosition.y*scale;
    const last=lines[lines.length-1],bottom=(last.PositionAndShape.AbsolutePosition.y+last.StaffHeight)*scale;
    for(const entry of measure.staffEntries){
     const time=timing.start+entry.relInMeasureTimestamp.RealValue*4;
     points.push({time,x:entry.PositionAndShape.AbsolutePosition.x*scale,top,bottom,system});
    }
    // Add an end-of-system anchor so long final notes continue towards the barline.
    if(measure===measure.ParentStaffLine.Measures.at(-1))points.push({time:timing.end,x:(measure.PositionAndShape.AbsolutePosition.x+measure.PositionAndShape.Size.width)*scale,top,bottom,system,end:true});
   }
  });
  this.points=points.sort((a,b)=>a.time-b.time||Number(!!b.end)-Number(!!a.end)).filter((p,i,all)=>!i||p.time!==all[i-1].time||p.system!==all[i-1].system);
  this.position(this.index,this.beat);
 }
 position(index,beat=null,scroll=false){
  this.index=index;this.beat=beat;if(!this.points.length)return;
  const time=beat??this.events[Math.min(index,this.events.length-1)]?.time;
  let current=this.points[0],next;
  for(const point of this.points){if(point.time<=time+.00001)current=point;else{next=point;break;}}
  let x=current.x;
  if(beat!==null&&next&&next.system===current.system&&next.time>current.time)x+=(next.x-x)*Math.max(0,Math.min(1,(time-current.time)/(next.time-current.time)));
  const complete=index>=this.events.length;if(complete){current=this.points.at(-1);x=current.x;}
  Object.assign(this.line.style,{left:`${x}px`,top:`${current.top-8}px`,height:`${current.bottom-current.top+16}px`});
  this.line.hidden=false;this.line.classList.toggle('complete',complete);
  this.host.setAttribute('aria-label',complete?'Score complete':`Sheet music. Position ${index+1} of ${this.events.length}. Tap a note to jump, or use arrow keys.`);
  if(scroll||this.lastSystem!==current.system){this.lastSystem=current.system;const r=this.line.getBoundingClientRect(),h=this.host.parentElement.getBoundingClientRect();if(r.top<h.top||r.bottom>h.bottom||r.left<h.left||r.right>h.right)this.line.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});}
 }
}
root.PianoNotation=Notation;
})(typeof globalThis!=='undefined'?globalThis:this);
