import * as PIXI from 'pixi.js';
import {SND,stopAudio} from '../audio/audio.js';
import {plan} from '../core/plan.js';
import {loadArtFromImage} from '../core/segment.js';
import {DESK,DUO,FLQ,FLY,FORMATS,GLT,HUM_DEF,HUM_META,IMP,OUT,PUFF,S,SHADE,TOOLS,U,VS,view} from '../core/settings.js';
import {$,mk} from '../core/utils.js';
import {applySrcColors,art,customOrder,orderMode,palette,seg,setCustomOrder,setPalette,zoneByI,zones} from '../core/zones.js';
import {buildDemo} from '../data/demoArt.js';
import {ed} from '../editor/editor.js';
import {renderAt} from '../render/renderer.js';
import {PATTERN_SRC,applyFormat,makeProceduralPattern,setPattern,setPatternSrc,setToolSprite,updateDesk} from '../render/scene.js';
import {buildFxUI} from './controls.js';
import {renderPal,setSegValue,updateInspector} from './inspector.js';
import {setArt} from './load.js';
import {T,busy,playing,rebuild,setPlayIcon,setPlaying} from './playback.js';
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
    art:art.demo?{demo:true}:{src:img?art.srcURL||null:null,ref:img?art.refURL||null:null},
    S:{camMode:S.camMode,tool:S.tool,duration:S.duration,montage:S.montage,human:S.human,hum:Object.assign({},S.hum),humPreset:S.humPreset,fastMul:S.fastMul,seed:S.seed,fx:JSON.parse(JSON.stringify(S.fx))},
    U:Object.assign({},U),PUFF:Object.assign({},PUFF),DUO:Object.assign({},DUO),GLT:Object.assign({},GLT),IMP:Object.assign({},IMP),SHADE:Object.assign({},SHADE),
    SND:pick(SND,['on','vol','strokes','events','room','reverb']),FLY:JSON.parse(JSON.stringify(FLY)),
    desk:Object.assign(pick(DESK,['mode','scale','bright','blur','tint']),{img:img?DESK.src||null:null}),
    VS:Object.assign({},VS),FLQ:{prev:FLQ.prev,render:FLQ.render,mix:FLQ.mix,blooms:FLQ.blooms,drops:FLQ.drops,cine:FLQ.cine,gloss:FLQ.gloss},pattern:img?PATTERN_SRC:null,fmt:view.fmt,fps:$('fps').value,res:$('res').value,vfmt:$('vfmt').value,OUT:Object.assign({},OUT),
    order:{custom:customOrder,mode:orderMode},palette:palette.slice(),
    zones:zones.map(z=>({i:z.i,color:z.color,skip:!!z.skip,flat:!!z.flat,close:z.close,zoom:z.zoom,speed:z.speed,tmul:z.tmul||1,vshade:z.vshade||'auto',tool:z.tool||'',style:z.style||'',preset:z.preset||'',fill:z.fill||''}))};
}
export function syncUI(){
  const setv=(id,v,txt,vid)=>{const e=$(id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else e.value=v;if(vid)$(vid).textContent=txt};
  setv('dur',S.duration,S.duration+' с','durV');setv('fastMul',S.fastMul,'×'+(+S.fastMul).toFixed(1),'fastMulV');setv('montage',S.montage);
  [...$('styleSeg').children].forEach(b=>b.setAttribute('aria-pressed',(b.dataset.s==='human')===S.human));$('humBox').setAttribute('aria-disabled',String(!S.human));
  $('humPreset').value=S.humPreset||'custom';HUM_META.forEach(([k])=>{const e=$('hum_'+k);if(e){e.value=S.hum[k];$('humv_'+k).textContent=Math.round(S.hum[k]*100)}});
  setv('humTouch',S.hum.touch!==false);setv('humFill',S.hum.fill||'auto');
  [...$('toolSeg').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===S.tool));
  buildFxUI();
  setv('pstr',U.patStr,(+U.patStr).toFixed(2),'pstrV');setv('pscl',U.patScale,(+U.patScale).toFixed(1)+'×','psclV');setv('grain',U.grain,(+U.grain).toFixed(2),'grainV');
  setSegValue('deskMode',DESK.mode);setSegValue('camMode',S.camMode||'montage');setv('deskScale',DESK.scale,(+DESK.scale).toFixed(1)+'×','deskScaleV');setv('deskBright',DESK.bright,(+DESK.bright).toFixed(2),'deskBrightV');setv('deskBlur',DESK.blur,(+DESK.blur).toFixed(1),'deskBlurV');setv('deskTint',DESK.tint);
  setv('sndOn',SND.on);$('sndBadge').textContent=SND.on?'ASMR':'вимк.';setv('sndVol',SND.vol,Math.round(SND.vol*100),'sndVolV');
  [['sndStrokes','strokes'],['sndEvents','events'],['sndRoom','room'],['sndRev','reverb']].forEach(([id,k])=>setv(id,SND[k],Math.round(SND[k]*100),id+'V'));
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
  const s=d.S||{};['camMode','tool','duration','montage','human','humPreset','fastMul','seed'].forEach(k=>{if(s[k]!==undefined)S[k]=s[k]});
  if(!TOOLS[S.tool])S.tool='marker';
  S.hum=Object.assign({},HUM_DEF,s.hum||{});if(s.fx)Object.keys(s.fx).forEach(k=>{if(S.fx[k])Object.assign(S.fx[k],s.fx[k])});
  [[U,d.U],[PUFF,d.PUFF],[DUO,d.DUO],[GLT,d.GLT],[IMP,d.IMP],[SHADE,d.SHADE],[SND,d.SND]].forEach(([a,b])=>{if(b)Object.assign(a,b)});
  if(d.FLY)Object.assign(FLY,d.FLY);
  if(d.desk){Object.assign(DESK,{mode:d.desk.mode||'default',scale:d.desk.scale||1,bright:d.desk.bright||1,blur:d.desk.blur||0,tint:d.desk.tint||'#ccded6'});
    if(d.desk.img)await setDeskImage(d.desk.img,'',false);else if(!DESK.tex)DESK.mode='default'}
  if(d.pattern){const im=await loadImg(d.pattern),c=mk(im.width,im.height);c.getContext('2d').drawImage(im,0,0);setPatternSrc(d.pattern);setPattern(c);$('patInfo').textContent='Свій патерн із проєкту.'}
  else{setPatternSrc(null);setPattern(makeProceduralPattern())}
  if(d.fmt&&FORMATS[d.fmt]){[...$('formats').children].forEach(x=>x.setAttribute('aria-pressed',x.dataset.f===d.fmt));applyFormat(d.fmt)}
  if(d.fps)$('fps').value=d.fps;if(d.res)$('res').value=d.res;if(d.vfmt)$('vfmt').value=d.vfmt;if(d.OUT)Object.assign(OUT,d.OUT);if(d.VS)Object.assign(VS,d.VS);if(d.FLQ){if(d.FLQ.prev)FLQ.prev=d.FLQ.prev;else if(d.FLQ.res)FLQ.prev=d.FLQ.res;if(d.FLQ.render)FLQ.render=d.FLQ.render;['mix','blooms','drops','cine','gloss'].forEach(k=>{if(d.FLQ[k]!==undefined)FLQ[k]=d.FLQ[k]});FLQ.res=FLQ.prev}
  syncUI();
  let a;
  if(d.art&&d.art.demo)a=buildDemo();
  else if(d.art&&d.art.src){const im=await loadImg(d.art.src);a=loadArtFromImage(im);a.srcURL=d.art.src}
  else throw new Error('noimg');
  const refIm=d.art&&d.art.ref?await loadImg(d.art.ref):null;
  await new Promise(res=>setArt(a,false,()=>{
    if(refIm){applySrcColors(refIm);art.refURL=d.art.ref}
    (d.zones||[]).forEach(q=>{const z=zoneByI.get(q.i);if(!z)return;['color','skip','close','zoom','speed','tmul','vshade','tool','style','preset','fill'].forEach(k=>{if(q[k]!==undefined)z[k]=q[k]});if(z.tool&&!TOOLS[z.tool])z.tool='';if(q.flat)z.flat=true});
    if(d.palette&&d.palette.length)setPalette(d.palette.slice());
    if(d.order){setCustomOrder(d.order.custom||null,d.order.mode||'auto');$('orderPreset').value=orderMode;$('orderBadge').textContent=orderMode==='auto'?'авто':orderMode==='custom'?'власний':$('orderPreset').selectedOptions[0].textContent.toLowerCase()}
    if(d.FLY)FLY.segs=d.FLY.segs||null;
    setToolSprite();renderPal('palette',true);ed.dirtyPaint=true;rebuild(false);updateInspector();res()}));
}
export function lsRead(){try{const t=localStorage.getItem(LS_KEY);return t?JSON.parse(t):null}catch(e){return null}}
export function lsArm(){lsArmed=true}
export function lsSave(){
  if(!lsOn||!lsArmed||!seg||busy)return;
  const t=new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
  try{let note='з картинками';try{localStorage.setItem(LS_KEY,JSON.stringify(projectData(true)))}catch(e){localStorage.setItem(LS_KEY,JSON.stringify(projectData(false)));note='без картинок: забагато для браузера, для повної копії збережіть .json'}
    $('lsInfo').textContent='Автозбережено о '+t+', '+note+'.';$('lsRestore').hidden=$('lsClear').hidden=false}
  catch(e){$('lsInfo').textContent='Браузер не дозволяє зберігати дані на цій сторінці. Користуйтеся збереженням .json.'}
}
export function lsSchedule(){if(!lsOn||!lsArmed)return;clearTimeout(lsTimer);lsTimer=setTimeout(lsSave,2000)}
export function lsInit(){
  try{const a=localStorage.getItem(LS_KEY+'.auto');if(a==='0'){lsOn=false;$('lsAuto').checked=false}}catch(e){}
  const d=lsRead();if(d){$('lsRestore').hidden=$('lsClear').hidden=false;const when=d.saved?new Date(d.saved).toLocaleString('uk-UA',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'';
    $('lsInfo').textContent='У браузері є збережений проєкт'+(when?' ('+when+')':'')+(d.art&&!d.art.demo&&!d.art.src?', без картинки сторінки':'')+'.';}
}
export function setLsOn(v){lsOn=v}
