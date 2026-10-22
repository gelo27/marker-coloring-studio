import {stopAudio} from '../audio/audio.js';
import {flySegs,plan,planDirty,replan,setPlanDirty} from '../core/plan.js';
import {FLY,FLY_MOVES,FX_META,HUM_META,HUM_PRESETS,S,TOOLS} from '../core/settings.js';
import {$} from '../core/utils.js';
import {zoneByI} from '../core/zones.js';
import {ed} from '../editor/editor.js';
import {renderAt} from '../render/renderer.js';
import {setToolSprite} from '../render/scene.js';
import {setSegValue} from './inspector.js';
import {T,busy,playFresh,playing,rebuild,seek,setMode,setPlaying} from './playback.js';
/* ================= WIRE UI ================= */
export function buildFxUI(){
  const el=$('fxList');el.innerHTML='';
  FX_META.forEach(([k,label])=>{const f=S.fx[k];
    const sw=document.createElement('label');sw.className='switch';sw.innerHTML='<input type="checkbox" id="fx_'+k+'"'+(f.on?' checked':'')+'> '+label;
    const rg=document.createElement('input');rg.type='range';rg.min='0';rg.max='1';rg.step='0.05';rg.value=f.v;rg.id='fxv_'+k;rg.setAttribute('aria-label',label+': сила');rg.disabled=!f.on;
    el.appendChild(sw);el.appendChild(rg);
    const needsPlan=k==='whip'||k==='ramp';
    sw.querySelector('input').onchange=e=>{f.on=e.target.checked;rg.disabled=!f.on;if(needsPlan)rebuild(true);else if(!playing&&!ed.on&&!busy)renderAt(T)};
    rg.oninput=e=>{f.v=+e.target.value;if(!needsPlan&&!playing&&!ed.on&&!busy)renderAt(T)};
    rg.onchange=()=>{if(needsPlan)rebuild(true)};
  });
}
export function buildToolUI(){
  const el=$('toolSeg');el.innerHTML='';
  Object.keys(TOOLS).forEach(k=>{const T=TOOLS[k];const b=document.createElement('button');b.dataset.t=k;b.setAttribute('aria-pressed',k===S.tool);b.innerHTML='<b>'+T.name+'</b><span>'+T.sub+'</span>';
    b.onclick=()=>{if(busy)return;S.tool=k;[...el.children].forEach(x=>x.setAttribute('aria-pressed',x===b));setToolSprite();rebuild(false)};el.appendChild(b)});
}
export function renderFlyList(){
  const el=$('flyList');if(!el||!plan)return;el.innerHTML='';
  $('flyBadge').textContent=FLY.mode==='off'?'вимк.':FLY.segs&&FLY.segs.length?'власні':'авто';
  const fs=plan.shots.filter(s=>s.fly);
  (fs.length?fs:(FLY.mode==='off'?[]:flySegs())).forEach((f,k)=>{const li=document.createElement('li');li.style.cursor='default';
    const name=f.ids.length===1?'Зона #'+f.ids[0]:f.ids.length+' зон';
    li.innerHTML='<span class="n">'+(k+1)+'</span><span class="d" style="background:'+((zoneByI.get(f.ids[0])||{}).color||'#ccc')+'"></span><span>'+name+'</span>';
    const sel=document.createElement('select');sel.setAttribute('aria-label','Рух камери');Object.keys(FLY_MOVES).forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m==='auto'?'Авто ('+FLY_MOVES[f.move].toLowerCase()+')':FLY_MOVES[m];sel.appendChild(o)});sel.value=f.moveSel;
    sel.onchange=()=>{pinFly();FLY.segs[k].move=sel.value;flyChanged()};
    const show=document.createElement('button');show.className='ib';show.textContent='▶';show.title='Показати';show.onclick=()=>{if(busy)return;if(ed.on)setMode('anim');if(planDirty)rebuild(true);const s=plan.shots.filter(x=>x.fly)[k];if(s){setPlaying(false);stopAudio();seek(plan.vOf(s.ts)+.05);playFresh()}};
    const del=document.createElement('button');del.className='ib';del.textContent='×';del.title='Прибрати сегмент';del.onclick=()=>{pinFly();FLY.segs.splice(k,1);if(!FLY.segs.length)FLY.segs=null;flyChanged()};
    li.appendChild(sel);li.appendChild(show);li.appendChild(del);el.appendChild(li)});
}
export function pinFly(){if(!FLY.segs)FLY.segs=flySegs().map(f=>({ids:f.ids.slice(),move:f.moveSel}))}
export function flyChanged(){if(busy)return;rebuild(true);renderFlyList()}
export function bindFly(){
  $('flyMode').onclick=e=>{const b=e.target.closest('button');if(!b)return;FLY.mode=b.dataset.v;setSegValue('flyMode',FLY.mode);flyChanged()};
  $('flyDur').oninput=e=>{$('flyDurV').textContent=(+e.target.value).toFixed(1)+' с'};$('flyDur').onchange=e=>{FLY.dur=+e.target.value;flyChanged()};
  $('flyCount').oninput=e=>{$('flyCountV').textContent=e.target.value};$('flyCount').onchange=e=>{FLY.count=+e.target.value;flyChanged()};
  $('flyZoom').oninput=e=>{$('flyZoomV').textContent='×'+(+e.target.value).toFixed(2)};$('flyZoom').onchange=e=>{FLY.zoomMul=+e.target.value;flyChanged()};
  $('flyAdd').onclick=()=>{const ids=[...ed.sel];if(!ids.length){if(!ed.on)setMode('zones');$('modeHint').textContent='Виберіть зони для сегмента прольоту, потім натисніть «Додати вибрані зони»';return}
    if(!FLY.segs)FLY.segs=[];FLY.segs.push({ids,move:'auto'});if(FLY.mode==='off'){FLY.mode='before';setSegValue('flyMode','before')}setPlanDirty(true);if(!ed.on)rebuild(true);else{replan();setPlanDirty(true)}renderFlyList()};
  $('flyAuto').onclick=()=>{FLY.segs=null;flyChanged()};
}
export function buildHumUI(){
  const sel=$('humPreset');sel.innerHTML='';Object.keys(HUM_PRESETS).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=HUM_PRESETS[k].name;sel.appendChild(o)});
  const oc=document.createElement('option');oc.value='custom';oc.textContent='Власний';oc.hidden=true;sel.appendChild(oc);sel.value=S.humPreset;
  const el=$('humList');el.innerHTML='';
  HUM_META.forEach(([k,label])=>{const lb=document.createElement('label');lb.htmlFor='hum_'+k;lb.textContent=label;
    const rg=document.createElement('input');rg.type='range';rg.min='0';rg.max='1';rg.step='0.05';rg.id='hum_'+k;rg.value=S.hum[k];
    const vv=document.createElement('span');vv.className='val';vv.id='humv_'+k;vv.textContent=Math.round(S.hum[k]*100);
    rg.oninput=e=>{vv.textContent=Math.round(e.target.value*100)};
    rg.onchange=e=>{S.hum[k]=+e.target.value;S.humPreset='custom';sel.value='custom';if(k==='shake'){if(!playing&&!ed.on&&!busy)renderAt(T)}else rebuild(true)};
    el.appendChild(lb);el.appendChild(rg);el.appendChild(vv)});
  sel.onchange=()=>{const p=HUM_PRESETS[sel.value];if(!p)return;S.humPreset=sel.value;Object.assign(S.hum,p.v);HUM_META.forEach(([k])=>{$('hum_'+k).value=S.hum[k];$('humv_'+k).textContent=Math.round(S.hum[k]*100)});rebuild(false)};
  $('humTouch').onchange=e=>{S.hum.touch=e.target.checked;rebuild(true)};
  $('humFill').onchange=e=>{S.hum.fill=e.target.value;rebuild(false)};
}
export const ICP={doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',zones:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><circle cx="16.5" cy="16.5" r="3.5"/>',
 pen:'<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M12.5 6.5l5 5"/>',video:'<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 10.5l6-3v9l-6-3z"/>',download:'<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
 film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
 save:'<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',folder:'<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',history:'<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4l3 2"/>',
 trash:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',upload:'<path d="M12 20V9"/><path d="M7 14l5-5 5 5"/><path d="M5 4h14"/>',sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
 palette:'<path d="M12 3a9 9 0 100 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1-1.6-1-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 004-4c0-4.6-4-8.2-9-8.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
 image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',reset:'<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',brush:'<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12l-2 6 6-2"/>',
 shuffle:'<path d="M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3"/><path d="M18 5l2 2-2 2M18 15l2 2-2 2"/>',top:'<path d="M5 4h14"/><path d="M12 20V9"/><path d="M7 13l5-5 5 5"/>',up:'<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
 down:'<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',bottom:'<path d="M5 20h14"/><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',hd:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M10 10v4M7 12h3M13 10h2a2 2 0 010 4h-2z"/>',shrink:'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',sliders:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
 map:'<path d="M9 4l6 2 5-2v14l-5 2-6-2-5 2V6z"/><path d="M9 4v14M15 6v14"/>',drop:'<path d="M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z"/>',list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'};
export function ic(n){return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICP[n]||'')+'</svg>'}
export function decorate(el,icon,text,title){if(typeof el==='string')el=$(el);if(!el)return;const inp=el.querySelector('input');el.innerHTML=ic(icon)+(text?'<span>'+text+'</span>':'');if(inp)el.appendChild(inp);
  if(!text){el.classList.add('icon');el.setAttribute('aria-label',title)}if(title)el.title=title}
export function iconizeUI(){
  [['page','doc','Сторінка, проєкт і стіл'],['zones','zones','Зони, порядок і палітра'],['hand','pen','Інструмент і рука'],['cam','video','Камера та ефекти'],['out','download','Звук і експорт']].forEach(([t,i,tt])=>decorate(document.querySelector('#tabs [data-tab="'+t+'"]'),i,'',tt));
  decorate(document.querySelector('#modeSeg [data-m="anim"]'),'film','Анімація');decorate(document.querySelector('#modeSeg [data-m="zones"]'),'zones','Зони');
  decorate(document.querySelector('#viewSeg [data-v="map"]'),'map','Карта');decorate(document.querySelector('#viewSeg [data-v="final"]'),'drop','Кольори');decorate(document.querySelector('#viewSeg [data-v="order"]'),'list','Порядок');decorate(document.querySelector('#viewSeg [data-v="cam"]'),'video','Камера');
  [['lite','bolt','Легке'],['fx','sparkle','Ефекти'],['full','hd','Повне']].forEach(([q,i,t])=>decorate(document.querySelector('#prevSeg [data-q="'+q+'"]'),i,t,t+' превʼю'));
  decorate('projSave','save','Зберегти .json');decorate(document.getElementById('projFile').parentElement,'folder','Відкрити');decorate('lsRestore','history','Відновити');decorate('lsClear','trash','','Видалити збереження з браузера');
  decorate(document.getElementById('artFile').parentElement,'upload','Сторінка…','Завантажити розмальовку, чисту або зафарбовану');decorate('demo','sparkle','Демо');decorate(document.getElementById('refFile').parentElement,'palette','Кольори з картинки…');
  decorate(document.getElementById('deskFile').parentElement,'image','Зображення…','Завантажити зображення для столу');decorate(document.getElementById('patFile').parentElement,'image','Свій патерн…');decorate('patReset','reset','Стандартний');
  decorate('addColor','plus','','Додати колір у палітру');decorate('applyPal','brush','Розфарбувати');decorate('shufflePal','shuffle','','Перемішати кольори');
  decorate('oFirst','top','','Замальовувати першою');decorate('oUp','up','','Раніше');decorate('oDown','down','','Пізніше');decorate('oLast','bottom','','Замальовувати останньою');
  decorate('zReset','reset','Авто-налаштування');decorate('orderReset','reset','','Скинути порядок');decorate('flyAdd','plus','Додати вибрані зони');decorate('flyAuto','reset','Авто');
  decorate('render','film','Зрендерити відео');decorate('cancelRender','x','Скасувати рендер');decorate('frameBtn','camera','Зберегти кадр PNG');decorate('save','download','Зберегти файл');
}
export function showTab(t){[...$('tabs').children].forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  document.querySelectorAll('#panel details[data-tab]').forEach(d=>d.hidden=d.dataset.tab!==t);$('panel').scrollTop=0;try{localStorage.setItem('mcs.tab',t)}catch(e){}}
export function compactUI(){
  iconizeUI();
  document.querySelectorAll('#panel input[type=range]').forEach(r=>{const row=r.previousElementSibling;if(!row||!row.classList.contains('row'))return;
    if(row.querySelector('select,input'))return;const v=row.querySelector('.val');if(!v)return;row.insertBefore(r,v);row.classList.add('sl')});
  document.querySelectorAll('#toolSeg button').forEach(b=>{const sub=b.querySelector('span');if(sub)b.title=sub.textContent});
  $('tabs').onclick=e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)};
  let t='page';try{t=localStorage.getItem('mcs.tab')||'page'}catch(e){}showTab(t);
}
