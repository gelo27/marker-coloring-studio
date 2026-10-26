import {addonOn} from '../addons/registry.js';
import {SND} from '../audio/audio.js';
import {drawMask,extractLines,loadArtFromImage} from '../core/segment.js';
import {IMP,OUT,PREV,S,SHADE,TOOLS,isMobileUI,view} from '../core/settings.js';
import {$,clamp,durLabel,mk} from '../core/utils.js';
import {GROUP_RULES,applyPalette,applySrcColors,art,colorGroups,groupedOrder,nextPalSeed,orderFromGroups,orderMode,orderedZones,pageArea,palSeed,palette,presetOrder,seg,setZoneColor,zoneByI,zones} from '../core/zones.js';
import {buildDemo} from '../data/demoArt.js';
import {drawBrush,ed} from '../editor/editor.js';
import {ic} from './controls.js';
import {estimateExport,exportVideo,sizeNote} from './exporter.js';
import {addToPalette,isMerged,makeSwatch,mergeSel,selZones,setOrder,setSegValue,setSegValue2,unmergeSel,updateInspector,zonesChanged} from './inspector.js';
import {resegment,setArt} from './load.js';
import {busy,setMode} from './playback.js';
import {applyProject,loadImg,lsArm,readURL} from './project.js';
import {bindSoundStep,syncSound} from './sound.js';
import {fillToolThumbs} from './toolThumbs.js';
/* ================= STEP-BY-STEP MODE =================
   Six steps for a casual user: picture → check the zones → colours (tap to paint) → order (colour groups) →
   camera & speed (tap a setting onto zones) → video. Every control drives the same state as the full settings panel. */
export const WZ={step:1,brush:'#ff8fab',tag:{k:'close',v:'on'},undo:[]};
const STEPS=7;
const zonesWord=n=>n+(n%10===1&&n%100!==11?' зона':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?' зони':' зон');
/* ---------- files: picture or project, from the drop zone, a picker or drag & drop anywhere ---------- */
/* Is this the same drawing as the page that is open? Compares the line art of both on small thumbnails (dark pixels of
   each that have a dark neighbour in the other); a coloured picture and its clean line art come out well above 0.6 */
function sameDrawing(A,B){if(!A||!B)return false;const ra=A.width/A.height,rb=B.width/B.height;if(Math.abs(ra-rb)/ra>.04)return false;
  const w=120,h=Math.max(8,Math.round(w/ra)),dark=src=>{const c=mk(w,h),x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(src,0,0,w,h);
    const d=x.getImageData(0,0,w,h).data,m=new Uint8Array(w*h);for(let i=0;i<w*h;i++)m[i]=d[i*4]+d[i*4+1]+d[i*4+2]<540?1:0;return m};
  const grow=m=>{const o=new Uint8Array(m.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!m[y*w+x])continue;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<w&&Y<h)o[Y*w+X]=1}}return o};
  const a=dark(A),b=dark(B),ga=grow(a),gb=grow(b);let na=0,nb=0,ha=0,hb=0;for(let i=0;i<w*h;i++){if(a[i]){na++;if(gb[i])ha++}if(b[i]){nb++;if(ga[i])hb++}}
  return na>20&&nb>20&&(ha/na+hb/nb)/2>.6}
/* Several pictures at once: a clean page and its coloured version are recognised as a pair - the page is opened from the
   line art and its zones take their colours from the coloured one. Otherwise the first picture is opened. */
export async function openFiles(list,force){
  const fl=[...(list||[])].filter(Boolean);if(!fl.length||busy)return;
  const imgs=fl.filter(f=>/^image\//.test(f.type));
  if(imgs.length>=2){const loaded=[];for(const f of imgs.slice(0,2)){const url=await readURL(f),img=await loadImg(url);loaded.push({f,url,img,a:loadArtFromImage(img)})}
    const L=loaded.find(q=>!q.a.colored),C=loaded.find(q=>q.a.colored);
    if(L&&C){await openFile(L.f,{img:C.img,url:C.url,name:C.f.name});return}}
  await openFile(fl[0],null,force)}
export async function openFile(f,pair,force){
  if(!f||busy)return;
  if(/\.json$/i.test(f.name)||f.type==='application/json'){
    try{await applyProject(JSON.parse(await f.text()));$('lsInfo').textContent='Відкрито проєкт «'+f.name+'».';lsArm();gotoStep(7)}catch(err){$('wArtInfo').textContent='Не вдалося відкрити файл: це не проєкт студії або він пошкоджений.'}
    return}
  if(!/^image\//.test(f.type)){$('wArtInfo').textContent='Це не картинка. Підійдуть PNG, JPG або WebP.';return}
  const url=await readURL(f),img=await loadImg(url),a=loadArtFromImage(img);a.srcURL=url;
  // a coloured version of the page that is already open: its colours go into the zones, the page stays (Shift + drop opens it as a new page)
  if(!pair&&!force&&a.colored&&art&&seg&&zones.length&&sameDrawing(art.lineCv,a.lineCv)){art.refURL=url;snap(zones);applySrcColors(img);zonesChanged(true);
    $('wArtInfo').textContent='«'+f.name+'» — розфарбована версія цієї ж сторінки: кольори зон узято з неї (Скасувати на кроці «Кольори» поверне попередні). Щоб відкрити її як нову сторінку, перетягніть її із затиснутим Shift.';gotoStep(3);return}
  // the clean line art of a page that was opened from its coloured version: cleaner lines, the same colours
  const keep=!pair&&!force&&!a.colored&&art&&art.colored&&art.srcCv&&seg&&sameDrawing(art.lineCv,a.lineCv)?art.srcCv:null;
  lsArm();
  setArt(a,true,()=>{
    if(pair){art.refURL=pair.url;applySrcColors(pair.img);zonesChanged(true);$('wArtInfo').textContent='Завантажено «'+f.name+'», кольори зон узято з «'+pair.name+'».';gotoStep(3);return}
    if(keep){applySrcColors(keep);zonesChanged(true);$('wArtInfo').textContent='Завантажено «'+f.name+'»: чисті контури тієї ж сторінки, кольори збережено з попередньої картинки.';gotoStep(3);return}
    $('wArtInfo').textContent='Завантажено «'+f.name+'».';gotoStep(2)});
}
function bindDrop(){
  const ov=$('dropOverlay'),dz=$('dropZone');let depth=0;
  const hasFiles=e=>e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files');
  window.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();depth++;ov.hidden=false});
  window.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy'});
  window.addEventListener('dragleave',e=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)ov.hidden=true});
  window.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();depth=0;ov.hidden=true;openFiles(e.dataTransfer.files,e.shiftKey)});
  dz.onclick=()=>$('wArtFile').click();dz.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('wArtFile').click()}};
  $('wArtFile').onchange=e=>{openFiles(e.target.files);e.target.value=''};
  $('wProjFile').onchange=e=>{openFile(e.target.files[0]);e.target.value=''};
}
/* ---------- steps ---------- */
function enterEditor(v,onTap){ed.view=v;setSegValue2('viewSeg',v);ed.onTap=onTap||null;if(!ed.on)setMode('zones');ed.dirtyPaint=true;ed.dirtySel=true}
const HINTS={2:'Торкніться зони, щоб вибрати · два пальці або колесо — масштаб',3:'Торкайтеся зон, щоб зафарбувати вибраним кольором',4:'Номери показують чергу замальовування',5:'Торкайтеся зон, щоб призначити вибране налаштування'};
export function gotoStep(n){
  if(busy)return;n=clamp(n,1,STEPS);WZ.step=n;
  document.querySelectorAll('#wiz .step').forEach(s=>s.hidden=+s.dataset.step!==n);
  [...$('steps').children].forEach(b=>{const k=+b.dataset.s;b.setAttribute('aria-current',k===n?'step':'false');b.classList.toggle('done',k<n)});
  $('wPrev').hidden=n===1;$('wNext').hidden=n===STEPS;$('wStepN').textContent=n+' / '+STEPS;
  if(n!==2&&ed.brush.on){ed.brush.on=false;ed.brush.mask=null;ed.brush.stroke=null}
  if(seg){
    if(n===2)enterEditor($('wZoneView').querySelector('[aria-pressed="true"]')?.dataset.v||'map',null);
    else if(n===3){ed.sel.clear();if(WZ.brush!=null&&palette.length&&!palette.some(c=>c.toLowerCase()===WZ.brush.toLowerCase()))WZ.brush=palette[0];enterEditor('final',paintTap)}
    else if(n===4){ed.sel.clear();enterEditor('order',null)}
    else if(n===5){ed.sel.clear();enterEditor('cam',tagTap)}
    else{ed.onTap=null;if(ed.on)setMode('anim')}
    if(ed.on&&HINTS[n])$('modeHint').textContent=HINTS[n];
  }
  if(isMobileUI())$('panel').scrollTo({top:0,behavior:'smooth'});
  syncWizard();
}
/* ---------- undo for taps (colours and settings) ---------- */
function snap(list){WZ.undo.push(list.map(z=>({i:z.i,color:z.color,skip:z.skip,close:z.close,speed:z.speed})));if(WZ.undo.length>40)WZ.undo.shift();$('wUndo').disabled=false}
function undo(){const s=WZ.undo.pop();if(!s)return;s.forEach(q=>{const z=zoneByI.get(q.i);if(z)Object.assign(z,{color:q.color,skip:q.skip,close:q.close,speed:q.speed})});$('wUndo').disabled=!WZ.undo.length;zonesChanged(true)}
/* step 3: tap paints with the brush colour (null = leave unpainted); optionally every zone of the same colour */
function paintTap(z){if(!z)return true;
  const list=$('wSame').checked?zones.filter(q=>!q.skip&&q.color.toLowerCase()===z.color.toLowerCase()):[z];if(z.skip&&!list.includes(z))list.push(z);
  snap(list);list.forEach(q=>{if(WZ.brush==null)q.skip=true;else{q.skip=false;setZoneColor(q,WZ.brush)}});zonesChanged(true);return true}
/* step 5: tap assigns the chosen camera or speed setting */
function tagTap(z){if(!z)return true;snap([z]);z[WZ.tag.k]=WZ.tag.v;zonesChanged(true);return true}
/* ---------- rendering of each step ---------- */
function renderWPal(){const el=$('wPal');el.innerHTML='';
  const add=(c)=>{const b=makeSwatch(c,c==null?WZ.brush==null:WZ.brush!=null&&WZ.brush.toLowerCase()===c.toLowerCase());b.onclick=()=>{WZ.brush=c;if(c)$('wColor').value=c;renderWPal()};el.appendChild(b)};
  add(null);palette.forEach(add)}
function zoneStats(){
  const el=$('wZoneStats'),wl=$('wZoneWarn');el.innerHTML='';wl.innerHTML='';if(!seg)return;
  const A=pageArea(),minA=(IMP.minArea||95)*4,tiny=seg.regs.filter(r=>r.area<minA&&r.area>16&&!r.edge).length;
  const big=zones.filter(z=>!z.r.isBg).sort((a,b)=>b.r.area-a.r.area)[0],skip=zones.filter(z=>z.skip).length;
  const chip=t=>{const s=document.createElement('span');s.textContent=t;el.appendChild(s)};
  chip(zonesWord(zones.length));if(big)chip('найбільша '+(big.r.area/A*100).toFixed(1)+'%');if(skip)chip(skip+' без фарби');if(tiny)chip(tiny+' дрібних ділянок');
  const warn=(t,ids)=>{const li=document.createElement('li');li.textContent=t;if(ids){li.tabIndex=0;li.onclick=()=>{ed.sel=new Set(ids);ed.dirtySel=true;updateInspector()}}wl.appendChild(li)};
  zones.filter(z=>!z.r.isBg&&z.r.area>A*.22).forEach(z=>warn('Зона #'+z.i+' займає '+Math.round(z.r.area/A*100)+'% сторінки: можливо, в контурі розрив і дві ділянки злилися.',[z.i]));
  if(zones.length<4)warn('Знайдено мало зон. Спробуйте підняти чутливість контуру.');
  if(tiny>30)warn(tiny+' дрібних ділянок не стали зонами й залишаться білими. Зменшіть «Найменша зона», якщо це деталі малюнка.');
}
function renderGroups(){
  const el=$('wGroups');el.innerHTML='';if(!seg)return;
  const gs=colorGroups(orderedZones());let dragC=null;
  gs.forEach((g,k)=>{const live=g.zs.filter(z=>!z.skip).length,li=document.createElement('li');li.draggable=true;li.dataset.c=g.color;if(!live)li.className='skip';
    const sw=document.createElement('span');sw.className='d';sw.style.background=g.color;
    li.innerHTML='<span class="grip" aria-hidden="true">⋮⋮</span><span class="n">'+(k+1)+'</span>';li.appendChild(sw);
    const t=document.createElement('span');t.className='t';t.textContent=zonesWord(live)+(g.zs.length>live?' · '+(g.zs.length-live)+' без фарби':'');li.appendChild(t);
    const btn=(txt,lbl,d)=>{const b=document.createElement('button');b.className='ib';b.textContent=txt;b.setAttribute('aria-label',lbl);b.disabled=k+d<0||k+d>=gs.length;
      b.onclick=e=>{e.stopPropagation();const cs=gs.map(x=>x.color);[cs[k],cs[k+d]]=[cs[k+d],cs[k]];setOrder(orderFromGroups(cs),'groups')};li.appendChild(b)};
    btn('↑','Раніше',-1);btn('↓','Пізніше',1);
    li.onclick=()=>{const ids=g.zs.map(z=>z.i),same=ids.every(i=>ed.sel.has(i))&&ed.sel.size===ids.length;ed.sel=new Set(same?[]:ids);ed.dirtySel=true;updateInspector()};
    li.ondragstart=e=>{dragC=g.color;li.classList.add('drag');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',g.color)}catch(_){}};
    li.ondragend=()=>{[...el.children].forEach(x=>x.classList.remove('drag','over'));dragC=null};
    li.ondragover=e=>{e.preventDefault();[...el.children].forEach(x=>x.classList.toggle('over',x===li))};
    li.ondrop=e=>{e.preventDefault();if(!dragC||dragC===g.color)return;const cs=gs.map(x=>x.color).filter(c=>c!==dragC);cs.splice(cs.indexOf(g.color),0,dragC);setOrder(orderFromGroups(cs),'groups')};
    el.appendChild(li)});
}
export function syncOrderUI(){if(WZ.step!==4||!seg)return;
  $('wOrderRule').value=orderMode==='color'?'groups':orderMode;$('wGroupRuleRow').hidden=orderMode!=='groups';renderGroups();ed.dirtyPaint=true}
function syncCam(){setSegValue('wCamMode',S.camMode);setSegValue('camMode',S.camMode);
  $('wCamHint').textContent=S.camMode==='cat'?(addonOn('cat')?'Камера тримає в кадрі котика, який зараз малює, разом із ділянкою під його інструментом; на фіналі — всю компанію.':'«Котик крупно» працює, коли на кроці 1 вибрано котиків; без них камера знімає як «Перо крупно».'):S.camMode==='nib'?'Макрозйомка: камера весь час веде кінчик інструмента, у кадрі лише його передня половина. Крупні й загальні плани зон нижче діють лише в режимі «Монтаж».':'Камера змінює плани: загальні, середні й крупні, зі склейками між ними. Пензликом нижче задайте, які зони показати крупно.';
  [...$('wTags').children].forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===WZ.tag.k&&b.dataset.v===WZ.tag.v)));
  $('wFast').value=S.fastMul;$('wFastV').textContent='×'+(+S.fastMul).toFixed(1);
  const fm=$('flyMode').querySelector('[aria-pressed="true"]');setSegValue('wFly',fm?fm.dataset.v:'before')}
function syncExport(){['res','fps','vq'].forEach(k=>{$('w'+k[0].toUpperCase()+k.slice(1)).value=$(k).value});$('wSnd').checked=SND.on;$('wOutOn').checked=OUT.on;
  const P={short:['9x16','1080','60'],youtube:['16x9','1080','60'],post:['4x5','1080','30'],square:['1x1','1080','30']};
  [...$('wPresets').children].forEach(b=>{const p=P[b.dataset.p];b.setAttribute('aria-pressed',String(p[0]===view.fmt&&p[1]===$('res').value&&p[2]===$('fps').value))});
  const e=estimateExport(),t=e?'≈ '+(e.mb<10?e.mb.toFixed(1):Math.round(e.mb))+' МБ · '+e.w+'×'+e.h+' · '+e.frames+' кадрів':'';const tt=t&&t+sizeNote(e.mb);$('wEst').textContent=tt;$('vEst').textContent=tt}
export function syncWizard(){
  if(!$('wiz'))return;const n=WZ.step;
  setSegValue('wFormats',view.fmt);
  if(n===1){$('wDur').value=S.duration;$('wDurV').textContent=durLabel(S.duration);[...$('wToolGrid').children].forEach(b=>b.setAttribute('aria-checked',String(b.dataset.t===S.tool)))}
  else if(n===2){zoneStats();if(WZ.maskUI)WZ.maskUI();const col=!!(art&&art.colored);const r=$('wLineK');if(col){r.min=.15;r.max=.6;r.value=IMP.thr}else{r.min=.2;r.max=.7;r.value=IMP.lineK}$('wLineKV').textContent=(+r.value).toFixed(2);
    $('wMinArea').value=IMP.minArea;$('wMinAreaV').textContent=IMP.minArea;setSegValue('wZoneView',ed.view==='final'?'final':'map')}
  else if(n===3){renderWPal();$('wShadeRow').hidden=!(art&&art.colored);$('wShade').checked=SHADE.on;$('wUndo').disabled=!WZ.undo.length}
  else if(n===4){$('wGroupRule').value=$('wGroupRule').value||'light';syncOrderUI()}
  else if(n===5)syncCam();
  else if(n===6)syncSound();
  else if(n===7)syncExport();
}
export function syncWizardSel(){const box=$('wZoneSel');if(!box)return;const sel=selZones();box.hidden=WZ.step!==2||!sel.length;if(box.hidden)return;const z=sel[0];
  $('wSelDot').style.background=z.skip?'transparent':z.color;$('wSelName').textContent=sel.length===1?'Зона #'+z.i+' · '+(z.r.area/pageArea()*100).toFixed(z.r.area/pageArea()<.01?2:1)+'%':sel.length+' зон';
  $('wSelSkip').textContent=z.skip?'Замальовувати':'Не замальовувати';
  $('wSelMerge').hidden=sel.length<2;{const n=sel.length,few=n%10>=2&&n%10<=4&&(n%100<12||n%100>14);$('wSelMerge').textContent='Об\'єднати '+n+(few?' зони':' зон')+' в одну'}$('wSelUnmerge').hidden=!(sel.length===1&&isMerged(z))}
/* ---------- full / step-by-step switch and preview quality ---------- */
export function setUiMode(m){setSegValue('uiMode',m);const ab=$('steps').querySelector('[data-s="adv"]');if(ab)ab.setAttribute('aria-current',m==='adv'?'page':'false');$('wiz').hidden=m!=='wiz';$('adv').hidden=m!=='adv';document.body.classList.toggle('advmode',m==='adv');try{localStorage.setItem('mcs.ui',m)}catch(e){}
  if(m==='wiz')gotoStep(WZ.step);else{ed.onTap=null;$('modeHint').textContent=ed.on?'Клік: вибрати зону · Shift: додати · колесо: зум':''}}
export function bindWizard(onPreview){
  bindDrop();
  // the step bar (a bottom tab bar on phones): the last tab opens all settings
  [['1','image'],['2','zones'],['3','palette'],['4','list'],['5','video'],['6','sound'],['7','film'],['adv','sliders']].forEach(([k,i])=>{const b=$('steps').querySelector('[data-s="'+k+'"]');if(b)b.insertAdjacentHTML('afterbegin',ic(i))});
  $('steps').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.s==='adv'){setUiMode('adv');return}const n=+b.dataset.s;if($('wiz').hidden){WZ.step=n;setUiMode('wiz')}else gotoStep(n)};
  $('wPrev').onclick=()=>gotoStep(WZ.step-1);$('wNext').onclick=()=>gotoStep(WZ.step+1);
  $('uiMode').onclick=e=>{const b=e.target.closest('button');if(b)setUiMode(b.dataset.v)};
  $('prevSeg').onclick=e=>{const b=e.target.closest('button');if(!b||busy)return;PREV.q=b.dataset.q;[...$('prevSeg').children].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.q===PREV.q)));try{localStorage.setItem('mcs.prev',PREV.q)}catch(err){}onPreview()};
  // step 1
  $('wDemo').onclick=()=>{if(busy)return;setArt(buildDemo(),false,()=>{$('wArtInfo').textContent='Демо: ведмежа на капкейку. Далі — перевірка зон.'})};
  $('wFormats').onclick=e=>{const b=e.target.closest('button');if(b)$('formats').querySelector('[data-f="'+b.dataset.f+'"]').click();syncWizard()};
  $('wDur').oninput=e=>{$('wDurV').textContent=durLabel(e.target.value)};$('wDur').onchange=e=>{$('dur').value=e.target.value;$('dur').dispatchEvent(new Event('change'))};
  // tool tiles with square previews; they drive the tool buttons of the full settings
  $('wToolGrid').innerHTML=Object.keys(TOOLS).map(k=>'<button role="radio" data-t="'+k+'" aria-checked="false" title="'+TOOLS[k].sub+'"><img class="tthumb" data-tool-thumb="'+k+'" alt="" width="96" height="96"><b>'+TOOLS[k].name+'</b></button>').join('');
  $('wToolGrid').onclick=e=>{const b=e.target.closest('button');if(!b||busy)return;const t=$('toolSeg').querySelector('[data-t="'+b.dataset.t+'"]');if(t)t.click();syncWizard()};
  fillToolThumbs();
  // step 2
  $('wZoneView').onclick=e=>{const b=e.target.closest('button');if(!b)return;setSegValue('wZoneView',b.dataset.v);enterEditor(b.dataset.v,null)};
  $('wLineK').oninput=e=>{$('wLineKV').textContent=(+e.target.value).toFixed(2)};
  $('wMinArea').oninput=e=>{$('wMinAreaV').textContent=e.target.value};
  $('wReseg').onclick=()=>{if(!art||busy)return;const v=+$('wLineK').value;IMP.minArea=+$('wMinArea').value;
    if(art.colored){IMP.thr=v;$('impThr').value=v;$('impThrV').textContent=v.toFixed(2);art.lineCv=extractLines(art.srcCv,IMP.thr)}else IMP.lineK=v;
    setArt(art,true,()=>gotoStep(2))};
  // zones the outline did not separate: paint them with a brush (any number of strokes), then turn the paint into a zone
  const maskUI=()=>{const B=ed.brush,nm=art&&art.masks?art.masks.length:0,nw=art&&art.walls?art.walls.length:0;$('wBrushBox').hidden=!B.on;$('wBrush').hidden=B.on;
    $('wMaskUndo').disabled=!nm||B.on;$('wMaskClear').disabled=!(nm+nw)||B.on;$('wBrushApply').disabled=!(B.mask&&B.mask.s.some(q=>!q.e));$('wBrushUndo').disabled=!(B.mask&&B.mask.s.length);
    setSegValue('wBrushMode',B.erase?'erase':'paint');if(ed.on)$('modeHint').textContent=B.on?'Замальовуйте ділянку · гумка підправляє краї · два пальці — масштаб':HINTS[2]};
  WZ.maskUI=maskUI;ed.onBrush=maskUI;
  $('wBrush').onclick=()=>{if(!seg||busy)return;if(!ed.on)enterEditor('map',null);Object.assign(ed.brush,{on:true,erase:false,mask:{s:[]},stroke:null});ed.sel.clear();ed.dirtySel=true;drawBrush();maskUI()};
  $('wBrushMode').onclick=e=>{const b=e.target.closest('button');if(!b)return;ed.brush.erase=b.dataset.v==='erase';maskUI()};
  $('wBrushSize').oninput=e=>{ed.brush.size=+e.target.value;$('wBrushSizeV').textContent=e.target.value;drawBrush()};
  $('wBrushUndo').onclick=()=>{if(ed.brush.mask)ed.brush.mask.s.pop();drawBrush();maskUI()};
  $('wBrushCancel').onclick=()=>{Object.assign(ed.brush,{on:false,mask:null,stroke:null});drawBrush();maskUI()};
  $('wBrushApply').onclick=()=>{const m=ed.brush.mask;if(!m||busy||!art)return;Object.assign(ed.brush,{on:false,mask:null,stroke:null});drawBrush();art.masks=(art.masks||[]).concat([m]);maskUI();
    resegment(()=>{// the new zone: the hand-painted zone that overlaps this paint the most
      const k=.25,c=mk(Math.ceil(seg.W*k),Math.ceil(seg.H*k)),x=c.getContext('2d');x.fillStyle=x.strokeStyle='#000';drawMask(x,m.s,k);const md=x.getImageData(0,0,c.width,c.height).data;
      let hit=null,best=0;zones.filter(z=>z.r.user).forEach(z=>{const r=z.r;let n=0;for(let y=r.y0;y<=r.y1;y+=4)for(let X=r.x0;X<=r.x1;X+=4){if(seg.lab[y*seg.W+X]!==r.i)continue;if(md[(Math.floor(y*k)*c.width+Math.floor(X*k))*4+3]>127)n++}if(n>best){best=n;hit=z}});
      if(hit){ed.sel=new Set([hit.i]);ed.dirtySel=true;updateInspector();$('wMaskHint').textContent='Готово: замальоване стало зоною #'+hit.i+'. Її колір і налаштування можна змінити на наступних кроках.'}
      else $('wMaskHint').textContent='Не вийшло окремої зони: замалюйте ділянку щільніше.';
      maskUI()})};
  $('wMaskUndo').onclick=()=>{if(!art||!art.masks||!art.masks.length||busy)return;art.masks=art.masks.slice(0,-1);resegment(maskUI)};
  $('wMaskClear').onclick=()=>{if(!art||busy)return;art.masks=[];art.walls=[];art.merges=[];resegment(maskUI)};
  $('wSelMerge').onclick=mergeSel;$('wSelUnmerge').onclick=unmergeSel;
  $('wSelSkip').onclick=()=>{const sel=selZones();if(!sel.length)return;const on=!sel[0].skip;sel.forEach(z=>z.skip=on);zonesChanged(true)};
  // step 3
  $('wAddColor').onclick=()=>{const c=$('wColor').value;addToPalette(c);WZ.brush=c;renderWPal()};
  $('wColor').onchange=e=>{WZ.brush=e.target.value;addToPalette(e.target.value);renderWPal()};
  $('wUndo').onclick=undo;
  $('wAutoPal').onclick=()=>{snap(zones);applyPalette(palSeed);zonesChanged(true)};
  $('wShuffle').onclick=()=>{snap(zones);applyPalette(nextPalSeed());zonesChanged(true)};
  $('wRefFile').onchange=async e=>{const f=e.target.files[0];if(!f||busy||!seg)return;const url=await readURL(f),img=await loadImg(url);art.refURL=url;snap(zones);applySrcColors(img);zonesChanged(true);e.target.value=''};
  $('wShade').onchange=e=>{$('impShade').checked=e.target.checked;$('impShade').dispatchEvent(new Event('change'))};
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&(WZ.step===3||WZ.step===5)&&!$('wiz').hidden&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();undo()}});
  // step 4
  $('wGroupRule').innerHTML=Object.entries(GROUP_RULES).map(([k,t])=>'<option value="'+k+'">'+t+'</option>').join('');
  const applyRule=()=>{const v=$('wOrderRule').value;if(v==='groups')setOrder(groupedOrder($('wGroupRule').value),'groups');else if(v==='auto')setOrder(null,'auto');else if(v!=='custom')setOrder(presetOrder(v),v)};
  $('wOrderRule').onchange=applyRule;$('wGroupRule').onchange=applyRule;
  $('wSeq').onclick=()=>{$('seqBtn').click();$('wSeq').textContent=ed.seq?'Готово':'Задати кліками'};
  $('wOrderReset').onclick=()=>{$('orderReset').click();$('wSeq').textContent='Задати кліками'};
  // step 5
  $('wCamMode').onclick=e=>{const b=e.target.closest('button');if(b)$('camMode').querySelector('[data-v="'+b.dataset.v+'"]').click();syncCam()};
  $('wTags').onclick=e=>{const b=e.target.closest('button');if(!b)return;WZ.tag={k:b.dataset.k,v:b.dataset.v};syncCam()};
  $('wTagAll').onclick=()=>{snap(zones);zones.forEach(z=>z[WZ.tag.k]=WZ.tag.v);zonesChanged(true)};
  $('wFast').oninput=e=>{$('wFastV').textContent='×'+(+e.target.value).toFixed(1)};$('wFast').onchange=e=>{$('fastMul').value=e.target.value;$('fastMulV').textContent='×'+(+e.target.value).toFixed(1);$('fastMul').dispatchEvent(new Event('change'))};
  $('wFly').onclick=e=>{const b=e.target.closest('button');if(b)$('flyMode').querySelector('[data-v="'+b.dataset.v+'"]').click();syncCam()};
  bindSoundStep();
  // step 7
  const P={short:['9x16','1080','60'],youtube:['16x9','1080','60'],post:['4x5','1080','30'],square:['1x1','1080','30']};
  $('wPresets').onclick=e=>{const b=e.target.closest('button');if(!b||busy)return;const p=P[b.dataset.p];if(view.fmt!==p[0])$('formats').querySelector('[data-f="'+p[0]+'"]').click();$('res').value=p[1];$('fps').value=p[2];syncExport()};
  ['res','fps','vq'].forEach(k=>{const w=$('w'+k[0].toUpperCase()+k.slice(1));w.onchange=()=>{$(k).value=w.value;$(k).dispatchEvent(new Event('change'));syncExport()};$(k).addEventListener('change',syncExport)});
  $('wSnd').onchange=e=>{$('sndOn').checked=e.target.checked;$('sndOn').dispatchEvent(new Event('change'))};
  $('wOutOn').onchange=e=>{$('outOn').checked=e.target.checked;$('outOn').dispatchEvent(new Event('change'));syncExport()};
  // the two "write to disk" switches mirror each other
  $('wToDisk').onchange=e=>{$('toDisk').checked=e.target.checked;syncWizard()};$('toDisk').onchange=e=>{$('wToDisk').checked=e.target.checked;syncWizard()};
  $('wRender').onclick=()=>{exportVideo();const o=$('renderOut');if(o&&o.scrollIntoView)o.scrollIntoView({block:'nearest',behavior:'smooth'})};
  let m='wiz';try{m=localStorage.getItem('mcs.ui')||'wiz'}catch(e){}setUiMode(m==='adv'?'adv':'wiz');
}
