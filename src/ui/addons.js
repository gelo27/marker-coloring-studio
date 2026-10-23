import {ADD,ADDONS,addonOn,setAddonCfg,setAddonOn} from '../addons/registry.js';
import {plan,setPlanDirty} from '../core/plan.js';
import {S} from '../core/settings.js';
import {$} from '../core/utils.js';
import {ed} from '../editor/editor.js';
import {renderAt} from '../render/renderer.js';
import {T,busy,playing,rebuild} from './playback.js';
import {lsSchedule} from './project.js';
import {fillToolThumbs} from './toolThumbs.js';
/* ================= ADDONS UI =================
   "Who paints" tiles (no character, or one of the character addons) with square previews, and the settings of the
   chosen character built from its manifest. Shown in step 1 and in the full settings (tool tab). */
const THUMBS={};
function thumbOf(a){if(!THUMBS[a.id]&&a.thumb){try{THUMBS[a.id]=a.thumb(192)}catch(e){THUMBS[a.id]=''}}return THUMBS[a.id]||''}
/* settings that change who paints what (number of painters, their reach) need a new plan; the rest only a redraw.
   While busy the plan is only marked dirty, so the change is picked up by the next rebuild instead of being lost */
function changed(replan){lsSchedule();if(replan)setPlanDirty(true);if(busy||!plan)return;if(replan){if(!ed.on)rebuild(true)}else if(!playing&&!ed.on)renderAt(T)}
function settingRow(a,s){const cfg=ADD.cfg[a.id],d=document.createElement('div');
  if(s.type==='choice'){d.className='addset';const l=document.createElement('span');l.className='lbl';l.textContent=s.label;const p=document.createElement('div');p.className='pal';
    s.options.forEach(([v,label,sw])=>{const b=document.createElement('button');b.className='sw'+(cfg[s.k]===v?' on':'');b.title=label;b.setAttribute('aria-label',label);if(sw)b.style.background=sw;else b.textContent=label;
      b.onclick=()=>{setAddonCfg(a.id,s.k,v);changed(s.replan);renderAddonsUI()};p.appendChild(b)});d.append(l,p)}
  else if(s.type==='seg'){d.className='addset';const l=document.createElement('span');l.className='lbl';l.textContent=s.label;const p=document.createElement('div');p.className='seg';
    s.options.forEach(([v,label])=>{const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-pressed',String(cfg[s.k]===v));b.onclick=()=>{setAddonCfg(a.id,s.k,v);changed(s.replan);renderAddonsUI()};p.appendChild(b)});d.append(l,p)}
  else if(s.type==='range'){d.className='row sl';const l=document.createElement('label'),r=document.createElement('input'),v=document.createElement('span');l.textContent=s.label;
    const fmt=x=>s.step>=1?String(Math.round(x)):(+x).toFixed(2);Object.assign(r,{type:'range',min:s.min,max:s.max,step:s.step,value:cfg[s.k]});r.setAttribute('aria-label',s.label);v.className='val';v.textContent=fmt(cfg[s.k]);
    r.oninput=()=>{v.textContent=fmt(+r.value);if(s.replan)return;setAddonCfg(a.id,s.k,+r.value);changed()};r.onchange=()=>{setAddonCfg(a.id,s.k,+r.value);changed(s.replan);renderAddonsUI()};d.append(l,r,v)}
  else{d.className='switch';d.innerHTML='<input type="checkbox"'+(cfg[s.k]?' checked':'')+'> '+s.label;d.querySelector('input').onchange=e=>{setAddonCfg(a.id,s.k,e.target.checked);changed(s.replan)}}
  return d}
function renderInto(el){
  if(!el)return;el.innerHTML='';const grid=document.createElement('div');grid.className='tgrid';const act=ADDONS.find(a=>addonOn(a.id));
  const tile=(id,name,img,on,click)=>{const b=document.createElement('button');b.setAttribute('role','radio');b.setAttribute('aria-checked',String(on));b.innerHTML='<img class="tthumb" alt="" width="96" height="96"><b></b>';
    b.querySelector('b').textContent=name;const im=b.querySelector('img');if(img)im.src=img;else if(id==='none')im.dataset.toolThumb=S.tool;b.onclick=click;return b};
  grid.appendChild(tile('none','Без персонажа',null,!act,()=>{ADDONS.forEach(a=>setAddonOn(a.id,false));changed(true);renderAddonsUI()}));
  ADDONS.forEach(a=>grid.appendChild(tile(a.id,a.name,thumbOf(a),addonOn(a.id),()=>{ADDONS.forEach(q=>setAddonOn(q.id,q===a));changed(true);renderAddonsUI()})));
  el.appendChild(grid);
  if(act){const box=document.createElement('div');box.className='addbox';const h=document.createElement('p');h.className='hint';h.textContent=act.desc;box.appendChild(h);(act.settings||[]).forEach(s=>{if(!s.show||s.show(ADD.cfg[act.id]))box.appendChild(settingRow(act,s))});el.appendChild(box)}
  else{const h=document.createElement('p');h.className='hint';h.textContent='Інструмент малює сам, як рука за кадром. Виберіть персонажа, щоб сторінку розфарбовував він.';el.appendChild(h)}
}
export function renderAddonsUI(){const act=ADDONS.some(a=>addonOn(a.id)&&a.painters);$('wDurCat').hidden=!act;$('wDur').disabled=act;renderInto($('wAddons'));renderInto($('addonsA'));fillToolThumbs()}
