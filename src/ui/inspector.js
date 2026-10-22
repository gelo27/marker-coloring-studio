import {setPlanDirty,vsAuto} from '../core/plan.js';
import {HUM_PRESETS,S,TOOLS} from '../core/settings.js';
import {$} from '../core/utils.js';
import {applyPalette,nextPalSeed,orderedZones,pageArea,palSeed,palette,presetOrder,seg,setCustomOrder,setZoneColor,zClose,zFast,zZoom,zoneByI,zones} from '../core/zones.js';
import {ed} from '../editor/editor.js';
import {applyToolUniforms} from '../render/scene.js';
import {busy,rebuild,setMode} from './playback.js';
import {lsSchedule} from './project.js';
import {syncOrderUI,syncWizard,syncWizardSel} from './wizard.js';
export function setOrder(ids,mode){setCustomOrder(ids,mode);$('orderPreset').value=mode;syncOrderUI();$('orderBadge').textContent=mode==='auto'?'авто':mode==='custom'?'власний':$('orderPreset').selectedOptions[0].textContent.toLowerCase();zonesChanged(ed.view==='order')}
/* ================= INSPECTOR & PALETTE UI ================= */
export function selZones(){return[...ed.sel].map(i=>zoneByI.get(i)).filter(Boolean)}
export function setSegValue(id,val){[...$(id).children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===val))}
export function renderOrderList(){
  const el=$('orderList');if(!el||!seg)return;el.innerHTML='';
  orderedZones().forEach((z,k)=>{const li=document.createElement('li');li.draggable=true;li.dataset.i=z.i;if(ed.sel.has(z.i))li.className='on';if(z.skip)li.classList.add('skip');
    const tags=[z.tool?TOOLS[z.tool].name.toLowerCase():'',zClose(z)?'крупно':'',z.speed==='cut'?'склейка':zFast(z)?'швидко':''].filter(Boolean).join(' · ');
    li.innerHTML='<span class="n">'+(k+1)+'</span><span class="d" style="background:'+z.color+'"></span><span>Зона #'+z.i+'</span><span class="t">'+tags+'</span>';el.appendChild(li)});
}
export function bindOrderList(){
  const el=$('orderList');let dragI=null;
  el.addEventListener('click',e=>{const li=e.target.closest('li');if(!li)return;const i=+li.dataset.i;if(e.shiftKey||e.metaKey||e.ctrlKey){ed.sel.has(i)?ed.sel.delete(i):ed.sel.add(i)}else{ed.sel.clear();ed.sel.add(i)}ed.dirtySel=true;updateInspector()});
  el.addEventListener('dragstart',e=>{const li=e.target.closest('li');if(!li)return;dragI=+li.dataset.i;li.classList.add('drag');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(dragI))}catch(_){}});
  el.addEventListener('dragend',e=>{[...el.children].forEach(x=>x.classList.remove('drag','over'));dragI=null});
  el.addEventListener('dragover',e=>{e.preventDefault();const li=e.target.closest('li');[...el.children].forEach(x=>x.classList.toggle('over',x===li))});
  el.addEventListener('drop',e=>{e.preventDefault();const li=e.target.closest('li');if(dragI==null||!li)return;const to=+li.dataset.i;if(to===dragI)return;
    const ids=orderedZones().map(z=>z.i).filter(i=>i!==dragI);ids.splice(ids.indexOf(to),0,dragI);setOrder(ids,'custom')});
  $('orderPreset').onchange=e=>{const v=e.target.value;if(v==='auto')setOrder(null,'auto');else setOrder(presetOrder(v),v)};
  $('orderReset').onclick=()=>{ed.seq=null;$('seqBtn').textContent='Задати кліками';$('seqBtn').classList.remove('active');setOrder(null,'auto')};
  $('seqBtn').onclick=()=>{if(ed.seq){ed.seq=null;$('seqBtn').textContent='Задати кліками';$('seqBtn').classList.remove('active');return}
    ed.seq=[];$('seqBtn').textContent='Готово (0)';$('seqBtn').classList.add('active');if(!ed.on)setMode('zones');ed.view='order';setSegValue2('viewSeg','order');ed.dirtyPaint=true;$('modeHint').textContent='Клацайте зони в потрібному порядку'};
  const move=kind=>{const sel=ed.sel;if(!sel.size)return;let ids=orderedZones().map(z=>z.i);
    if(kind==='first')ids=ids.filter(i=>sel.has(i)).concat(ids.filter(i=>!sel.has(i)));
    else if(kind==='last')ids=ids.filter(i=>!sel.has(i)).concat(ids.filter(i=>sel.has(i)));
    else if(kind==='up'){for(let k=1;k<ids.length;k++)if(sel.has(ids[k])&&!sel.has(ids[k-1])){const t=ids[k];ids[k]=ids[k-1];ids[k-1]=t}}
    else{for(let k=ids.length-2;k>=0;k--)if(sel.has(ids[k])&&!sel.has(ids[k+1])){const t=ids[k];ids[k]=ids[k+1];ids[k+1]=t}}
    setOrder(ids,'custom')};
  $('oFirst').onclick=()=>move('first');$('oUp').onclick=()=>move('up');$('oDown').onclick=()=>move('down');$('oLast').onclick=()=>move('last');
}
export function fillZoneSelects(){
  const t=$('zTool');if(!t.options.length){t.innerHTML='<option value="">Як у проєкті</option>'+Object.keys(TOOLS).map(k=>'<option value="'+k+'">'+TOOLS[k].name+'</option>').join('')}
  const p=$('zPreset');if(!p.options.length){p.innerHTML='<option value="">Як у проєкті</option>'+Object.keys(HUM_PRESETS).map(k=>'<option value="'+k+'">'+HUM_PRESETS[k].name+'</option>').join('')}
}
export function updateInspector(){
  renderOrderList();fillZoneSelects();syncWizardSel();
  const sel=selZones();
  $('selBadge').textContent=sel.length?('вибрано: '+sel.length):'не вибрано';
  $('inspEmpty').hidden=!!sel.length;$('inspBody').hidden=!sel.length;
  if(!sel.length)return;
  const z=sel[0];
  $('selDot').style.background=z.skip?'transparent':z.color;
  $('selTitle').textContent=sel.length===1?'Зона #'+z.i:sel.length+' зон';
  $('selArea').textContent=sel.length===1?(()=>{const p=z.r.area/pageArea()*100;return (p<1?p.toFixed(2):p.toFixed(1))+'% сторінки'})():'';
  $('zColor').value=z.color;
  setSegValue('zClose',z.close);setSegValue('zSpeed',z.speed);setSegValue('zVShade',z.vshade||'auto');[...$('zVShade').children].forEach(b=>{if(b.dataset.v==='auto')b.textContent='Авто ('+(vsAuto(z)?'так':'ні')+')'});
  const zv=zZoom(z);$('zZoom').value=zv;$('zZoomV').textContent=zv.toFixed(1)+'×';
  $('zZoom').disabled=!zClose(z);
  $('zTool').value=z.tool||'';$('zStyle').value=z.style||'';$('zPreset').value=z.preset||'';$('zFill').value=z.fill||'';$('zPreset').disabled=$('zFill').disabled=(z.style||(S.human?'human':'neat'))==='neat'&&false;
  [...$('zClose').children].forEach(b=>{if(b.dataset.v==='auto')b.textContent='Авто ('+(z.aClose?'так':'ні')+')'});
  [...$('zSpeed').children].forEach(b=>{if(b.dataset.v==='auto')b.textContent='Авто ('+(z.aFast?'швидко':'звич.')+')'});

  renderPal('zPal',false);
}
export function addToPalette(c){c=c.toLowerCase();if(!palette.some(p=>p.toLowerCase()===c))palette.push(c);renderPal('palette',true);renderPal('zPal',false);lsSchedule()}
/* a palette swatch; c=null is the "do not paint" swatch (white circle, red cross) */
export function makeSwatch(c,on){const b=document.createElement('button');b.className='sw'+(c?'':' nop')+(on?' on':'');
  if(c){b.style.background=c;b.title=c;b.setAttribute('aria-label','Колір '+c)}else{b.title='Не замальовувати';b.setAttribute('aria-label','Не замальовувати зону')}return b}
export function renderPal(id,editable){
  const el=$(id);el.innerHTML='';const cur=selZones()[0];
  const np=makeSwatch(null,!!(cur&&cur.skip));np.onclick=()=>{const sel=selZones();if(sel.length){sel.forEach(z=>z.skip=true);zonesChanged(true)}};el.appendChild(np);
  palette.forEach((c,k)=>{const b=makeSwatch(c,!!(cur&&!cur.skip&&cur.color.toLowerCase()===c.toLowerCase()));
    if(editable){const x=document.createElement('span');x.className='x';x.textContent='×';x.title='Прибрати з палітри';x.onclick=e=>{e.stopPropagation();palette.splice(k,1);renderPal('palette',true);updateInspector()};b.appendChild(x)}
    b.onclick=()=>{const sel=selZones();if(sel.length){sel.forEach(z=>{z.skip=false;setZoneColor(z,c)});zonesChanged(true)}else{$('newColor').value=c}};
    el.appendChild(b)});
}
export function zonesChanged(paint){lsSchedule();setPlanDirty(true);if(paint)ed.dirtyPaint=true;updateInspector();renderPal('palette',true);syncWizard();if(!ed.on&&!busy){rebuild(true)}}
export function bindInspector(){
  bindOrderList();
  $('zColor').oninput=e=>{selZones().forEach(z=>{z.skip=false;setZoneColor(z,e.target.value)});if(ed.view!=='final'){ed.view='final';setSegValue2('viewSeg','final')}zonesChanged(true)};
  $('zClose').onclick=e=>{const b=e.target.closest('button');if(!b)return;selZones().forEach(z=>z.close=b.dataset.v);zonesChanged(false)};
  $('zVShade').onclick=e=>{const b=e.target.closest('button');if(!b)return;selZones().forEach(z=>z.vshade=b.dataset.v);zonesChanged(true)};
  $('zSpeed').onclick=e=>{const b=e.target.closest('button');if(!b)return;selZones().forEach(z=>z.speed=b.dataset.v);zonesChanged(false)};
  $('zZoom').oninput=e=>{selZones().forEach(z=>z.zoom=+e.target.value);$('zZoomV').textContent=(+e.target.value).toFixed(1)+'×';setPlanDirty(true)};
  $('zZoom').onchange=()=>zonesChanged(false);
  $('zReset').onclick=()=>{selZones().forEach(z=>{z.close='auto';z.zoom=null;z.speed='auto';z.tmul=1;z.vshade='auto';z.skip=false;z.tool='';z.style='';z.preset='';z.fill=''});applyToolUniforms();zonesChanged(true)};
  [['zTool','tool'],['zStyle','style'],['zPreset','preset'],['zFill','fill']].forEach(([id,k])=>{$(id).onchange=e=>{selZones().forEach(z=>z[k]=e.target.value);applyToolUniforms();zonesChanged(false)}});
  $('selAll').onclick=()=>{zones.forEach(z=>ed.sel.add(z.i));ed.dirtySel=true;updateInspector()};
  $('selNone').onclick=()=>{ed.sel.clear();ed.dirtySel=true;updateInspector()};
  $('selSame').onclick=()=>{const c=selZones()[0];if(!c)return;zones.forEach(z=>{if(z.color===c.color)ed.sel.add(z.i)});ed.dirtySel=true;updateInspector()};
  $('addColor').onclick=()=>{addToPalette($('newColor').value)};
  $('newColor').onchange=e=>{addToPalette(e.target.value)};
  $('zColor').onchange=e=>{addToPalette(e.target.value)};
  $('applyPal').onclick=()=>{applyPalette(palSeed);if(ed.on){ed.view='final';setSegValue2('viewSeg','final')}zonesChanged(true)};
  $('shufflePal').onclick=()=>{applyPalette(nextPalSeed());if(ed.on){ed.view='final';setSegValue2('viewSeg','final')}zonesChanged(true)};
}
export function setSegValue2(id,val){[...$(id).children].forEach(b=>b.setAttribute('aria-pressed',(b.dataset.v||b.dataset.m)===val))}
