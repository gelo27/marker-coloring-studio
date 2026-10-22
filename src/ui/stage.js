import {plan} from '../core/plan.js';
import {$} from '../core/utils.js';
import {ed} from '../editor/editor.js';
import {app} from '../render/scene.js';
import {ic} from './controls.js';
import {drawZoneBars,togglePlay} from './playback.js';
/* ================= FULL SCREEN PREVIEW =================
   The stage (preview, controls, zone lane) goes full screen; where the browser cannot do that for an element
   (iPhone Safari) it is pinned over the page instead. In full screen a tap on the picture plays / pauses. */
export function bindFullscreen(){
  const st=document.querySelector('.stage'),b=$('fsBtn');if(!st||!b)return;
  const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;let native=false;
  const on=()=>st.classList.contains('pfs');
  const upd=()=>{const f=on();b.innerHTML=ic(f?'shrink':'expand');b.setAttribute('aria-label',f?'Вийти з повного екрана':'На весь екран');b.title=b.getAttribute('aria-label');
    document.body.classList.toggle('fs',f);requestAnimationFrame(()=>{if(plan)drawZoneBars()})};
  // the stage always covers the window (works everywhere, also on iPhone); real full screen additionally hides the browser bars
  b.onclick=()=>{
    if(on()){st.classList.remove('pfs');if(fsEl()){const x=document.exitFullscreen||document.webkitExitFullscreen;try{const p=x&&x.call(document);if(p&&p.catch)p.catch(()=>{})}catch(e){}}native=false}
    else{st.classList.add('pfs');const el=document.documentElement,rq=el.requestFullscreen||el.webkitRequestFullscreen;
      if(rq&&!fsEl()){try{const p=rq.call(el,{navigationUI:'hide'});native=true;if(p&&p.catch)p.catch(()=>{native=false})}catch(e){native=false}}}
    upd()};
  // leaving full screen with the system back gesture / Esc also closes the stage
  const chg=()=>{if(!fsEl()&&native){native=false;st.classList.remove('pfs')}upd()};
  document.addEventListener('fullscreenchange',chg);document.addEventListener('webkitfullscreenchange',chg);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&st.classList.contains('pfs')){st.classList.remove('pfs');upd()}});
  app.view.addEventListener('click',()=>{if(on()&&!ed.on)togglePlay()});
  upd();
}
