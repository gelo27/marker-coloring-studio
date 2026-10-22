import {SND,audioCtx,ensureAudio,startAudio,stopAudio} from '../audio/audio.js';
import {plan,planDirty,replan} from '../core/plan.js';
import {MOBILE_MQ,PREV,PREV_SCALE,isMobileUI,view} from '../core/settings.js';
import {$,clamp} from '../core/utils.js';
import {seg,zoneByI} from '../core/zones.js';
import {ed,edFit,hideLasso,renderEditor} from '../editor/editor.js';
import {camInit,camStep} from '../render/camera.js';
import {resetPaint} from '../render/paint.js';
import {renderAt} from '../render/renderer.js';
import {applyFormat,buildSparkles,paperShader} from '../render/scene.js';
import {renderFlyList,showTab} from './controls.js';
import {setSegValue2,updateInspector} from './inspector.js';
import {lsSchedule} from './project.js';
import {syncWizard} from './wizard.js';
/* ================= PLAYBACK ================= */
export let playing=false,T=0,lastNow=0,busy=false;
const LITE={ema:16,slow:0};
export function rebuild(keepTime){
  lsSchedule();
  if(playing){playing=false;stopAudio();setPlayIcon()}
  replan();buildSparkles();
  if(T>plan.total)T=0;
  if(ed.on)return;
  seek(keepTime?T:0);drawMarks();
}
export function seek(v){
  v=clamp(v,0,plan.total);resetPaint();camInit();
  const dt=1/30;for(let x=dt;x<=v;x+=dt)camStep(x,dt);
  T=v;renderAt(T);updateUI();
}
export function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(.05,(now-lastNow)/1000);lastNow=now;
  if(busy||!seg)return;
  if(ed.on){renderEditor(now/1000);return}
  if(!playing)return;
  if(PREV.q==='lite'){LITE.ema=LITE.ema*.92+dt*1000*.08;if(LITE.ema>30&&PREV_SCALE.lite>.35){if(++LITE.slow>75){PREV_SCALE.lite=Math.max(.34,Math.round(PREV_SCALE.lite*80)/100);LITE.slow=0;LITE.ema=20;applyFormat(view.fmt)}}else LITE.slow=0}
  let d=dt;if(SND.src&&SND.ctx){const nt=SND.startT+(SND.ctx.currentTime-SND.startCtx);d=clamp(nt-T,0,.05);T=nt}else T+=dt;
  if(T>=plan.total){T=plan.total;playing=false;stopAudio();setPlayIcon()}
  camStep(T,d);renderAt(T);updateUI();
}
export function fmtT(t){const m=Math.floor(t/60),s=t-m*60;return String(m).padStart(2,'0')+':'+s.toFixed(1).padStart(4,'0')}
export function updateUI(){if(!plan)return;$('fill').style.width=(T/plan.total*100)+'%';laneHead();$('time').textContent=fmtT(T)+' / '+fmtT(plan.total)}
export function drawMarks(){renderFlyList();drawZoneBars();syncWizard();const m=$('marks');m.innerHTML='';plan.shots.forEach(s=>{if(s.trans==='glide'||s.intro)return;const i=document.createElement('i');if(s.trans==='whip')i.className='w';i.style.left=(plan.vOf(s.ts)/plan.total*100)+'%';m.appendChild(i)})}
/* a slim colour strip of the zones over the scrub bar (click jumps to a zone) and the zone lane, laid out like a
   mobile video editor: blocks in painting order with number, colour and time, a fixed playhead in the middle and the
   strip sliding under it every frame while playing. Swiping the strip scrubs (the frame is redrawn once it rests),
   pinch or ctrl+wheel zooms around the playhead, tapping a block glides to it, dragging a block's right edge gives the
   zone more or less time. On phones the lane is always shown. */
export const LANE={pps:48,open:false,items:[],touch:false,input:0,cur:-1};
const isPhone=isMobileUI;
export function laneOpen(){return LANE.open||isPhone()}
export function syncLaneBox(){const b=$('zlaneBox');if(!b)return;const o=laneOpen();if(b.hidden===!o)return;b.hidden=!o;if(o&&plan)drawLane()}
function laneX(t){let px=0;for(const it of LANE.items){if(t<it.a)return it.x;if(t<=it.b)return it.x+(t-it.a)/Math.max(1e-3,it.b-it.a)*it.w;px=it.x+it.w}return px}
function laneT(px){let t=0;for(const it of LANE.items){if(px<it.x)return it.a;if(px<=it.x+it.w)return it.a+(px-it.x)/it.w*(it.b-it.a);t=it.b}return plan?plan.total:t}
function pauseForScrub(){if(playing){playing=false;stopAudio();setPlayIcon()}}
export function drawZoneBars(){const el=$('zbars');syncLaneBox();if(!el||!plan||!plan.order)return;el.innerHTML='';const tot=plan.total;
  plan.order.forEach((r,k)=>{const a=plan.vOf(r.t0),b=plan.vOf(r.t1),d=document.createElement('div');d.className='zb';d.style.left=(a/tot*100)+'%';d.style.width=Math.max(.12,(b-a)/tot*100)+'%';d.style.background=r.color;d.title='№'+(k+1)+' · '+(b-a).toFixed(1)+' с';
    d.onclick=e=>{e.stopPropagation();if(busy)return;if(ed.on)setMode('anim');seek(a)};el.appendChild(d)});
  drawLane()}
export function drawLane(){const el=$('zlaneIn'),sc=$('zlane');if(!el||!plan||!laneOpen())return;el.innerHTML='';const pad=Math.round(sc.clientWidth/2);let x=pad;LANE.items=[];LANE.cur=-1;
  plan.order.forEach((r,k)=>{const a=plan.vOf(r.t0),b=plan.vOf(r.t1),dur=b-a,w=Math.max(30,dur*LANE.pps),d=document.createElement('div');d.className='lz';d.style.left=x+'px';d.style.width=w+'px';
    const z=zoneByI.get(r.i),tm=z&&z.tmul||1;d.style.setProperty('--c',r.color);
    d.innerHTML='<b>'+(k+1)+'</b><span>'+dur.toFixed(1)+' с'+(Math.abs(tm-1)>.01?' · ×'+tm.toFixed(2):'')+'</span><i class="h" title="Тягніть, щоб змінити час зони"></i>';d.title='Зона №'+(k+1)+' · '+dur.toFixed(2)+' с';
    LANE.items.push({x,w,a,b,el:d});
    d.onclick=e=>{if(e.target.classList.contains('h')||LANE.drag)return;if(busy)return;if(ed.on)setMode('anim');pauseForScrub();LANE.input=0;seek(a+.001)};
    const h=d.querySelector('.h'),setW=nw=>{if(z){z.tmul=clamp((z.tmul||1)*nw/w,.15,8);lsSchedule();rebuild(true)}};
    // touch: hold the edge ~0.4 s (a short buzz confirms), then drag; a plain swipe over it just scrolls the lane
    h.addEventListener('touchstart',e=>{if(e.touches.length!==1||busy)return;const x0=e.touches[0].clientX,y0=e.touches[0].clientY;let armed=false,nw=w;
      const tm=setTimeout(()=>{armed=true;LANE.drag=true;d.classList.add('drag');if(navigator.vibrate)navigator.vibrate(12)},400);
      const mv=ev=>{const t=ev.touches[0];if(!armed){if(Math.hypot(t.clientX-x0,t.clientY-y0)>8)done();return}ev.preventDefault();nw=Math.max(24,w+t.clientX-x0);d.style.width=nw+'px';d.querySelector('span').textContent='≈'+(dur*nw/w).toFixed(1)+' с'};
      const end=()=>{const was=armed;done();if(was&&Math.abs(nw-w)>=2)setW(nw)};
      const done=()=>{clearTimeout(tm);h.removeEventListener('touchmove',mv);h.removeEventListener('touchend',end);h.removeEventListener('touchcancel',end);d.classList.remove('drag');if(armed)setTimeout(()=>LANE.drag=false,350);armed=false};
      h.addEventListener('touchmove',mv,{passive:false});h.addEventListener('touchend',end);h.addEventListener('touchcancel',end)},{passive:true});
    h.onpointerdown=e=>{if(busy||e.pointerType==='touch')return;e.preventDefault();e.stopPropagation();h.setPointerCapture(e.pointerId);const x0=e.clientX,w0=w;LANE.drag=true;d.classList.add('drag');
      h.onpointermove=ev=>{const nw=Math.max(24,w0+ev.clientX-x0);d.style.width=nw+'px';d.querySelector('span').textContent='≈'+(dur*nw/w0).toFixed(1)+' с'};
      h.onpointerup=ev=>{h.onpointermove=h.onpointerup=null;d.classList.remove('drag');setTimeout(()=>LANE.drag=false,0);const nw=Math.max(24,w0+ev.clientX-x0);if(Math.abs(nw-w0)<2)return;
        setW(nw)}};
    el.appendChild(d);x+=w+3});
  el.style.width=(x-3+pad)+'px';laneHead(true)}
/* keeps time T under the playhead: every frame while playing, a short glide after a jump; the block under it lights up */
export function laneHead(force){if(!laneOpen()||!LANE.items.length)return;const sc=$('zlane');
  const k=LANE.items.findIndex(it=>T<=it.b);if(k!==LANE.cur){if(LANE.items[LANE.cur])LANE.items[LANE.cur].el.classList.remove('cur');if(LANE.items[k])LANE.items[k].el.classList.add('cur');LANE.cur=k}
  if(LANE.touch||(!force&&performance.now()-LANE.input<900))return;
  const tgt=Math.round(laneX(T)-sc.clientWidth/2);if(Math.abs(sc.scrollLeft-tgt)<1)return;
  sc.scrollTo({left:tgt,behavior:!playing&&Math.abs(sc.scrollLeft-tgt)>4&&!force?'smooth':'auto'})}
export function bindLane(){const sc=$('zlane');let tm=0,pz=null;
  const mark=()=>{LANE.input=performance.now()};
  sc.addEventListener('pointerdown',()=>{LANE.touch=true;mark();pauseForScrub()});
  window.addEventListener('pointerup',()=>{if(LANE.touch){LANE.touch=false;mark()}});
  sc.addEventListener('wheel',e=>{mark();if(e.ctrlKey||e.metaKey){e.preventDefault();zoomLane(LANE.pps*Math.exp(-e.deltaY*.003))}else pauseForScrub()},{passive:false});
  // only scrolling the person caused moves the time; the playhead's own follow is ignored
  sc.addEventListener('scroll',()=>{if(!LANE.items.length||busy||(!LANE.touch&&performance.now()-LANE.input>900))return;mark();
    const t=clamp(laneT(sc.scrollLeft+sc.clientWidth/2),0,plan.total);$('time').textContent=fmtT(t)+' / '+fmtT(plan.total);
    clearTimeout(tm);tm=setTimeout(()=>{if(!ed.on&&!busy)seek(t)},150)},{passive:true});
  const dist=e=>Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)||1;
  sc.addEventListener('touchstart',e=>{if(e.touches.length===2)pz={d:dist(e),pps:LANE.pps}},{passive:true});
  sc.addEventListener('touchmove',e=>{if(pz&&e.touches.length===2){e.preventDefault();zoomLane(pz.pps*dist(e)/pz.d)}},{passive:false});
  sc.addEventListener('touchend',e=>{if(e.touches.length<2)pz=null});
  const z=$('laneZoom');if(z)z.oninput=e=>zoomLane(+e.target.value);
  window.addEventListener('resize',()=>{if(plan)drawZoneBars()});
  matchMedia(MOBILE_MQ).addEventListener('change',()=>{syncLaneBox();if(plan)drawZoneBars()})}
/* zoom around the time under the playhead */
function zoomLane(pps){const sc=$('zlane'),t=LANE.items.length?laneT(sc.scrollLeft+sc.clientWidth/2):T;LANE.pps=clamp(pps,10,220);const z=$('laneZoom');if(z)z.value=LANE.pps;
  drawLane();sc.scrollLeft=Math.round(laneX(t)-sc.clientWidth/2)}
export function setPlayIcon(){$('play').innerHTML=playing?'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>':'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';$('play').setAttribute('aria-label',playing?'Пауза':'Відтворити')}
export async function togglePlay(){if(busy)return;if(ed.on)setMode('anim');if(planDirty)rebuild(false);if(T>=plan.total)seek(0);
  if(playing){playing=false;stopAudio();setPlayIcon();return}
  if(SND.on){audioCtx();await ensureAudio()}
  playing=true;lastNow=performance.now();setPlayIcon();startAudio(T)}
export function playFresh(){playing=false;stopAudio();togglePlay()}
export function setMode(m){
  if(busy)return;ed.on=m==='zones';setSegValue2('modeSeg',m);
  $('viewSeg').hidden=!ed.on;$('screen').classList.toggle('editing',ed.on);document.body.classList.toggle('editing',ed.on);
  ['play','restart'].forEach(id=>$(id).disabled=false);
  $('modeHint').textContent=ed.on?'Клік: вибрати зону · Shift: додати · колесо: зум':'';
  if(ed.on){playing=false;stopAudio();setPlayIcon();edFit();ed.dirtyPaint=true;ed.dirtySel=true;showTab('zones');$('zoneSec').open=true;updateInspector()}
  else{paperShader.uniforms.uSelOn=0;ed.lasso.on=false;ed.lasso.pts=null;hideLasso();if(planDirty||!plan)rebuild(false);else seek(T)}
}
export function setT(v){T=v}
export function setPlaying(v){playing=v}
export function setBusy(v){busy=v}
export function setLastNow(v){lastNow=v}
