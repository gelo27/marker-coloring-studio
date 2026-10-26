import * as PIXI from 'pixi.js';
import {addonsState,applyAddonsState} from '../addons/registry.js';
import {SND,stopAudio} from '../audio/audio.js';
import {plan} from '../core/plan.js';
import {loadArtFromImage} from '../core/segment.js';
import {DESK,DUO,FLQ,FLY,FORMATS,GLT,HUM_DEF,HUM_META,IMP,INK,OUT,PUFF,S,SHADE,TOOLS,U,VS,view} from '../core/settings.js';
import {$,durLabel,mk} from '../core/utils.js';
import {applySrcColors,art,customOrder,orderMode,palette,seg,setCustomOrder,setPalette,zoneByI,zones} from '../core/zones.js';
import {buildDemo} from '../data/demoArt.js';
import {ed} from '../editor/editor.js';
import {renderAt} from '../render/renderer.js';
import {PATTERN_SRC,applyFormat,makeProceduralPattern,setPattern,setPatternSrc,setToolSprite,updateDesk} from '../render/scene.js';
import {renderAddonsUI} from './addons.js';
import {buildFxUI} from './controls.js';
import {renderPal,setSegValue,updateInspector} from './inspector.js';
import {setArt} from './load.js';
import {T,busy,playing,rebuild,setPlayIcon,setPlaying} from './playback.js';
import {syncSound} from './sound.js';
/* ================= PROJECT (JSON + browser storage) ================= */
export const LS_KEY='mcs.project.v1';export let lsTimer=0,lsOn=true,lsArmed=false;
export function readURL(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}
export function loadImg(url){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url})}
export async function setDeskImage(url,name,auto){
  const img=await loadImg(url);const mx=2048,k=Math.min(1,mx/Math.max(img.width,img.height)),c=mk(Math.round(img.width*k),Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  if(DESK.tex)DESK.tex.destroy(true);DESK.tex=PIXI.Texture.from(c);DESK.tex.baseTexture.mipmap=PIXI.MIPMAP_MODES.ON;DESK.iw=img.width;DESK.ih=img.height;DESK.src=url;
  if(auto&&DESK.mode==='default')DESK.mode=Math.max(img.width,img.height)<900?'tile':'cover';setSegValue('deskMode',DESK.mode);
  $('deskInfo').textContent='Зображення столу'+(name?': '+name:'')+'.';updateDesk();if(!playing&&!ed.on&&!busy&&plan)renderAt(T);
}
export function projectData(img){
  const pick=(o,ks)=>{const r={};ks.forEach(k=>r[k]=o[k]);return r};
  return{app:'marker-coloring-studio',v:1,saved:new Date().toISOString(),
    art:Object.assign(art.demo?{demo:true}:{src:img?art.srcURL||null:null,ref:img?art.refURL||null:null},{walls:art.walls&&art.walls.length?art.walls:null,masks:art.masks&&art.masks.length?art.masks:null,merges:art.merges&&art.merges.length?art.merges:null}),
    INK:Object.assign({},INK),S:{camMode:S.camMode,tool:S.tool,duration:S.duration,montage:S.montage,wideBig:S.wideBig,introWide:S.introWide!==false,human:S.human,hum:Object.assign({},S.hum),humPreset:S.humPreset,fastMul:S.fastMul,seed:S.seed,fx:JSON.parse(JSON.stringify(S.fx))},
    U:Object.assign({},U),PUFF:Object.assign({},PUFF),DUO:Object.assign({},DUO),GLT:Object.assign({},GLT),IMP:Object.assign({},IMP),SHADE:Object.assign({},SHADE),
    SND:Object.assign(pick(SND,['on','vol','strokes','events','room','reverb']),{tools:JSON.parse(JSON.stringify(SND.tools||{}))}),FLY:JSON.parse(JSON.stringify(FLY)),
    desk:Object.assign(pick(DESK,['mode','scale','bright','blur','tint']),{img:img?DESK.src||null:null}),
    VS:Object.assign({},VS),ADDONS:addonsState(),FLQ:{prev:FLQ.prev,render:FLQ.render,mix:FLQ.mix,blooms:FLQ.blooms,drops:FLQ.drops,cine:FLQ.cine,gloss:FLQ.gloss},pattern:img?PATTERN_SRC:null,fmt:view.fmt,fps:$('fps').value,res:$('res').value,vfmt:$('vfmt').value,OUT:Object.assign({},OUT),
    order:{custom:customOrder,mode:orderMode},palette:palette.slice(),
    zones:zones.map(z=>({i:z.i,color:z.color,skip:!!z.skip,flat:!!z.flat,close:z.close,zoom:z.zoom,speed:z.speed,tmul:z.tmul||1,vshade:z.vshade||'auto',tool:z.tool||'',style:z.style||'',preset:z.preset||'',fill:z.fill||''}))};
}
/* the inking and opening-shot controls (tool tab, camera tab and the wizard) */
export function syncInk(){$('inkOn').checked=$('wInkOn').checked=!!INK.on;$('inkBox').hidden=!INK.on;$('inkBadge').textContent=INK.on?'увімк.':'вимк.';setSegValue('inkTool',INK.tool||'marker');
  $('inkDur').value=INK.dur||0;$('inkDurV').textContent=INK.dur>0?durLabel(INK.dur):'авто';$('introWide').checked=$('wIntroWide').checked=S.introWide!==false}
export function syncUI(){
  syncInk();
  const setv=(id,v,txt,vid)=>{const e=$(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v;if(vid)$(vid).textContent=txt};
  setv('dur',S.duration,durLabel(S.duration),'durV');setv('fastMul',S.fastMul,'×'+(+S.fastMul).toFixed(1),'fastMulV');setv('montage',S.montage);setv('wideBig',S.wideBig!==false);
  [...$('styleSeg').children].forEach(b=>b.setAttribute('aria-pressed',(b.dataset.s==='human')===S.human));$('humBox').setAttribute('aria-disabled',String(!S.human));
  $('humPreset').value=S.humPreset||'custom';HUM_META.forEach(([k])=>{const e=$('hum_'+k);if(e){e.value=S.hum[k];$('humv_'+k).textContent=Math.round(S.hum[k]*100)}});
  setv('humTouch',S.hum.touch!==false);setv('humFill',S.hum.fill||'auto');
  [...$('toolSeg').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===S.tool));
  buildFxUI();
  setv('pstr',U.patStr,(+U.patStr).toFixed(2),'pstrV');setv('pscl',U.patScale,(+U.patScale).toFixed(1)+'×','psclV');setv('grain',U.grain,(+U.grain).toFixed(2),'grainV');
  setSegValue('deskMode',DESK.mode);setSegValue('camMode',S.camMode||'montage');setv('deskScale',DESK.scale,(+DESK.scale).toFixed(1)+'×','deskScaleV');setv('deskBright',DESK.bright,(+DESK.bright).toFixed(2),'deskBrightV');setv('deskBlur',DESK.blur,(+DESK.blur).toFixed(1),'deskBlurV');setv('deskTint',DESK.tint);
  setv('sndOn',SND.on);$('sndBadge').textContent=SND.on?'ASMR':'вимк.';setv('sndVol',SND.vol,Math.round(SND.vol*100),'sndVolV');
  [['sndStrokes','strokes'],['sndEvents','events'],['sndRoom','room'],['sndRev','reverb']].forEach(([id,k])=>setv(id,SND[k],Math.round(SND[k]*100),id+'V'));if(!SND.tools)SND.tools={};syncSound();
  setSegValue('flyMode',FLY.mode);setv('flyDur',FLY.dur,(+FLY.dur).toFixed(1)+' с','flyDurV');setv('flyCount',FLY.count,FLY.count,'flyCountV');setv('flyZoom',FLY.zoomMul,'×'+(+FLY.zoomMul).toFixed(2),'flyZoomV');
  setv('impColors',IMP.useColors);setv('impThr',IMP.thr,(+IMP.thr).toFixed(2),'impThrV');setv('impShade',SHADE.on);setv('impWhen',SHADE.when);
  setv('puffRel',PUFF.ns,PUFF.ns,'puffRelV');setv('puffGloss',PUFF.gloss,(+PUFF.gloss).toFixed(2),'puffGlossV');
  setv('outOn',OUT.on);$('outBox').hidden=!OUT.on;setv('outDur',OUT.dur,(+OUT.dur).toFixed(1).replace('.0','')+' с','outDurV');setv('outText',OUT.text);setv('outColor',OUT.color);setv('outStyle',OUT.style||'hand');setv('vsOn',VS.on);setv('vsDir',VS.dir);setv('vsStyle',VS.style||'solid');setv('vsW',VS.w,(+VS.w).toFixed(2),'vsWV');setv('vsDark',VS.dark,(+VS.dark).toFixed(2),'vsDarkV');$('vsBadge').textContent=VS.on?'увімк.':'вимк.';
  setv('liqPrev',FLQ.prev);setv('liqRender',FLQ.render);setv('liqMix',FLQ.mix);setv('liqDrops',FLQ.drops);setv('liqBlooms',FLQ.blooms);setv('liqCine',FLQ.cine);setv('liqGloss',FLQ.gloss);
  setv('duoShift',Math.round(DUO.shift*180/Math.PI),Math.round(DUO.shift*180/Math.PI)+'°','duoShiftV');setv('gltDens',GLT.dens,Math.round(GLT.dens*100),'gltDensV');
}
export async function applyProject(d){
  if(!d||d.app!=='marker-coloring-studio')throw new Error('bad');
  setPlaying(false);stopAudio();setPlayIcon();
  const s=d.S||{};['camMode','tool','duration','montage','wideBig','introWide','human','humPreset','fastMul','seed'].forEach(k=>{if(s[k]!==undefined)S[k]=s[k]});
  Object.assign(INK,{on:false,tool:'marker',dur:0},d.INK||{});if(s.introWide===undefined)S.introWide=true;
  if(!TOOLS[S.tool])S.tool='marker';
  S.hum=Object.assign({},HUM_DEF,s.hum||{});if(s.fx)Object.keys(s.fx).forEach(k=>{if(S.fx[k])Object.assign(S.fx[k],s.fx[k])});
  [[U,d.U],[PUFF,d.PUFF],[DUO,d.DUO],[GLT,d.GLT],[IMP,d.IMP],[SHADE,d.SHADE],[SND,d.SND]].forEach(([a,b])=>{if(b)Object.assign(a,b)});
  if(d.FLY)Object.assign(FLY,d.FLY);
  if(d.desk){Object.assign(DESK,{mode:d.desk.mode||'default',scale:d.desk.scale||1,bright:d.desk.bright||1,blur:d.desk.blur||0,tint:d.desk.tint||'#ccded6'});
    if(d.desk.img)await setDeskImage(d.desk.img,'',false);else if(!DESK.tex)DESK.mode='default'}
  if(d.pattern){const im=await loadImg(d.pattern),c=mk(im.width,im.height);c.getContext('2d').drawImage(im,0,0);setPatternSrc(d.pattern);setPattern(c);$('patInfo').textContent='Свій патерн із проєкту.'}
  else{setPatternSrc(null);setPattern(makeProceduralPattern())}
  if(d.fmt&&FORMATS[d.fmt]){[...$('formats').children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.f===d.fmt));applyFormat(d.fmt)}
  if(d.fps)$('fps').value=d.fps;if(d.res)$('res').value=d.res;if(d.vfmt)$('vfmt').value=d.vfmt;if(d.OUT)Object.assign(OUT,d.OUT);if(d.VS)Object.assign(VS,d.VS);applyAddonsState(d.ADDONS);renderAddonsUI();if(d.FLQ){if(d.FLQ.prev)FLQ.prev=d.FLQ.prev;else if(d.FLQ.res)FLQ.prev=d.FLQ.res;if(d.FLQ.render)FLQ.render=d.FLQ.render;['mix','blooms','drops','cine','gloss'].forEach(k=>{if(d.FLQ[k]!==undefined)FLQ[k]=d.FLQ[k]});FLQ.res=FLQ.prev}
  syncUI();
  let a;
  if(d.art&&d.art.demo)a=buildDemo();
  else if(d.art&&d.art.src){const im=await loadImg(d.art.src);a=loadArtFromImage(im);a.srcURL=d.art.src}
  else throw new Error('noimg');
  if(d.art&&d.art.walls)a.walls=d.art.walls;if(d.art&&d.art.masks)a.masks=d.art.masks;if(d.art&&d.art.merges)a.merges=d.art.merges;
  const refIm=d.art&&d.art.ref?await loadImg(d.art.ref):null;
  await new Promise(res=>setArt(a,false,()=>{
    if(refIm){applySrcColors(refIm);art.refURL=d.art.ref}
    (d.zones||[]).forEach(q=>{const z=zoneByI.get(q.i);if(!z)return;['color','skip','close','zoom','speed','tmul','vshade','tool','style','preset','fill'].forEach(k=>{if(q[k]!==undefined)z[k]=q[k]});if(z.tool&&!TOOLS[z.tool])z.tool='';if(q.flat)z.flat=true});
    if(d.palette&&d.palette.length)setPalette(d.palette.slice());
    if(d.order){setCustomOrder(d.order.custom||null,d.order.mode||'auto');$('orderPreset').value=orderMode;$('orderBadge').textContent=orderMode==='auto'?'авто':orderMode==='custom'?'власний':$('orderPreset').selectedOptions[0].textContent.toLowerCase()}
    if(d.FLY)FLY.segs=d.FLY.segs||null;
    setToolSprite();renderPal('palette',true);ed.dirtyPaint=true;rebuild(false);updateInspector();res()}));
}
/* Autosave lives in IndexedDB (room for the page pictures, which rarely fit into localStorage's ~5 MB);
   localStorage is the fallback when IndexedDB is unavailable. */
let idbP=null;
function idb(){return idbP||(idbP=new Promise((res,rej)=>{const r=indexedDB.open('mcs',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))}
async function idbDo(mode,fn){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction('kv',mode),q=fn(t.objectStore('kv'));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
/* the saved project; a newer settings-only snapshot written while the page was closing wins, with the pictures
   taken from the full save */
export async function lsRead(){let d=null,p=null;try{d=await idbDo('readonly',st=>st.get(LS_KEY))}catch(e){}
  if(!d){try{const t=localStorage.getItem(LS_KEY);d=t?JSON.parse(t):null}catch(e){}}
  try{const t=localStorage.getItem(LS_KEY+'.pending');p=t?JSON.parse(t):null}catch(e){}
  if(!p||(d&&d.saved>=p.saved))return d;if(!d)return p.art&&(p.art.demo||p.art.src)?p:null;
  if(d.art&&!p.art.demo){p.art.src=d.art.src;p.art.ref=d.art.ref}if(p.desk&&d.desk&&!p.desk.img)p.desk.img=d.desk.img;if(!p.pattern)p.pattern=d.pattern;return p}
export async function lsClearAll(){try{await idbDo('readwrite',st=>st.delete(LS_KEY))}catch(e){}try{localStorage.removeItem(LS_KEY);localStorage.removeItem(LS_KEY+'.pending')}catch(e){}}
export function lsArm(){lsArmed=true}
export async function lsSave(){
  lsTimer=0;if(!lsOn||!lsArmed||!seg||busy)return;
  const t=new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});let note='з картинками';
  try{await idbDo('readwrite',st=>st.put(projectData(true),LS_KEY));try{localStorage.removeItem(LS_KEY);localStorage.removeItem(LS_KEY+'.pending')}catch(e){}}
  catch(e){try{try{localStorage.setItem(LS_KEY,JSON.stringify(projectData(true)))}catch(e2){localStorage.setItem(LS_KEY,JSON.stringify(projectData(false)));note='без картинок: забагато для браузера, для повної копії збережіть .json'}}
    catch(e3){$('lsInfo').textContent='Браузер не дозволяє зберігати дані на цій сторінці. Користуйтеся збереженням .json.';return}}
  $('lsInfo').textContent='Автозбережено о '+t+', '+note+'.';$('lsRestore').hidden=$('lsClear').hidden=false;
}
export function lsSchedule(){if(!lsOn||!lsArmed)return;clearTimeout(lsTimer);lsTimer=setTimeout(lsSave,2000)}
export function lsInit(){
  try{const a=localStorage.getItem(LS_KEY+'.auto');if(a==='0'){lsOn=false;$('lsAuto').checked=false}}catch(e){}
  // leaving the page (closing the tab, switching apps on a phone) saves pending changes at once
  // the IndexedDB write may not finish while the page closes, so the settings also go synchronously to localStorage
  const flush=()=>{if(!lsTimer)return;clearTimeout(lsTimer);if(lsOn&&lsArmed&&seg&&!busy){try{localStorage.setItem(LS_KEY+'.pending',JSON.stringify(projectData(false)))}catch(e){}}lsSave()};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});window.addEventListener('pagehide',flush);
}
/* On start: the last autosaved project opens by itself; without one (or if it cannot be read) the demo loads. */
export async function restoreLast(fallback){
  let d=null;if(lsOn){try{d=await lsRead()}catch(e){}}
  if(d&&d.art&&(d.art.demo||d.art.src)){$('lsRestore').hidden=$('lsClear').hidden=false;
    try{await applyProject(d);lsArm();const when=d.saved?new Date(d.saved).toLocaleString('uk-UA',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'';
      $('lsInfo').textContent='Відкрито останній проєкт'+(when?' ('+when+')':'')+'.';return true}catch(e){}}
  if(d)$('lsInfo').textContent='Збережений проєкт без картинки сторінки не вдалося відкрити — завантажено демо.';
  fallback();return false;
}
export function setLsOn(v){lsOn=v}
