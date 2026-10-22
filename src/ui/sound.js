import {SND,stopAudio} from '../audio/audio.js';
import {SND_META,toolSnd} from '../audio/synth.js';
import {plan} from '../core/plan.js';
import {S,TOOLS} from '../core/settings.js';
import {$} from '../core/utils.js';
import {zones} from '../core/zones.js';
import {ed} from '../editor/editor.js';
import {busy,playing,seek,setMode,setPlayIcon,setPlaying,togglePlay} from './playback.js';
import {lsSchedule} from './project.js';
/* ================= SOUND SETTINGS =================
   The general mix (on/off, volume, strokes, events, room, reverb) and a panel per tool: its own volume and pitch and
   each part of its sound separately (paper rustle, crackle, resonance/"bubbling", squeaks, caps and clicks, tip taps).
   The same panel is shown in the step-by-step sound step and in the full settings. */
const PARTS=[['vol','Гучність інструмента',0,2,.05],['tone','Висота тону',.6,1.6,.02],['body','Шурхіт по паперу',0,2,.05],['grain',null,0,2,.05],['reso',null,0,2,.05],
  ['squeak','Скрип',0,3,.05],['events','Ковпачок і клацання',0,2,.05],['taps','Удари кінчиком',0,2,.05]];
const fmtPart=(k,v)=>k==='tone'?'×'+(+v).toFixed(2):Math.round(v*100)+'%';
export const SNDUI={tool:null};
function usedTools(){const s=new Set([S.tool]);zones.forEach(z=>{if(z.tool)s.add(z.tool)});return[...s]}
/* any change invalidates the generated sound; playback stops so the next play regenerates it */
function soundChanged(){if(playing){setPlaying(false);stopAudio();setPlayIcon()}lsSchedule();renderSoundTools()}
function previewTool(t){if(busy||!plan)return;const r=plan.order.find(q=>q.tool===t);if(!r)return;if(ed.on)setMode('anim');if(playing)togglePlay();seek(Math.max(0,plan.vOf(r.t0)-.3));togglePlay()}
function row(label,min,max,step,val,fmt,onInput,onChange){const d=document.createElement('div');d.className='row sl';
  const l=document.createElement('label'),r=document.createElement('input'),v=document.createElement('span');l.textContent=label;r.type='range';r.min=min;r.max=max;r.step=step;r.value=val;r.setAttribute('aria-label',label);v.className='val';v.textContent=fmt(val);
  r.oninput=()=>{v.textContent=fmt(+r.value);onInput(+r.value)};r.onchange=()=>onChange(+r.value);d.append(l,r,v);return d}
function renderInto(el){
  if(!el)return;el.innerHTML='';const used=usedTools(),all=Object.keys(TOOLS);if(!SNDUI.tool||!TOOLS[SNDUI.tool]||(!SNDUI.picked&&!used.includes(SNDUI.tool)))SNDUI.tool=used[0];const t=SNDUI.tool;
  const chips=document.createElement('div');chips.className='tags';
  [...used,...all.filter(k=>!used.includes(k))].forEach(k=>{const b=document.createElement('button');b.textContent=TOOLS[k].name;b.setAttribute('aria-pressed',String(k===t));if(!used.includes(k))b.classList.add('dim');
    b.onclick=()=>{SNDUI.tool=k;SNDUI.picked=true;renderSoundTools()};chips.appendChild(b)});
  el.appendChild(chips);
  const P=toolSnd(t),M=SND_META[t]||{};
  PARTS.forEach(([k,label,min,max,step])=>{if(k==='grain'&&!M.grain)return;if(k==='reso'&&!M.reso)return;if(k==='squeak'&&!M.squeak)return;
    el.appendChild(row(label||M[k],min,max,step,P[k],v=>fmtPart(k,v),v=>{SND.tools[t]=Object.assign({},SND.tools[t],{[k]:v})},soundChanged))});
  const b=document.createElement('div');b.className='btns';
  const pv=document.createElement('button');pv.className='btn small';pv.textContent='Прослухати';pv.disabled=!plan||!plan.order.some(r=>r.tool===t);pv.title=pv.disabled?'Цим інструментом у проєкті нічого не малюється':'Відтворити з першої зони цього інструмента';pv.onclick=()=>previewTool(t);
  const mute=document.createElement('button');mute.className='btn small';const off=P.vol===0;mute.textContent=off?'Увімкнути звук':'Без звуку';mute.onclick=()=>{SND.tools[t]=Object.assign({},SND.tools[t],{vol:off?1:0});soundChanged()};
  const rs=document.createElement('button');rs.className='btn small';rs.textContent='Скинути';rs.onclick=()=>{delete SND.tools[t];soundChanged()};
  b.append(pv,mute,rs);el.appendChild(b);
  const h=document.createElement('p');h.className='hint';h.textContent=used.includes(t)?'Налаштування діють для всіх зон, які малює «'+TOOLS[t].name+'». 0% — вимкнути цю складову звуку.':'Цим інструментом зараз нічого не малюється; налаштування знадобляться, коли ви його виберете.';el.appendChild(h);
}
export function renderSoundTools(){renderInto($('sndToolsW'));renderInto($('sndToolsA'))}
/* the step's general controls drive the controls of the full settings (one code path for both) */
export function bindSoundStep(){
  const box=$('wSndMix');if(!box)return;
  const wire=(label,id,min,max,step,fmt)=>{const src=$(id);box.appendChild(row(label,min,max,step,+src.value,fmt,v=>{src.value=v;src.dispatchEvent(new Event('input'))},v=>{src.value=v;src.dispatchEvent(new Event('change'))}))};
  wire('Загальна гучність','sndVol',0,1,.05,v=>Math.round(v*100));wire('Штрихи по паперу','sndStrokes',0,1.5,.05,v=>Math.round(v*100));wire('Ковпачки, клацання, вода','sndEvents',0,1.5,.05,v=>Math.round(v*100));
  wire('Тиша кімнати','sndRoom',0,1,.05,v=>Math.round(v*100));wire('Реверберація','sndRev',0,1,.05,v=>Math.round(v*100));
  $('wSndOn').onchange=e=>{$('sndOn').checked=e.target.checked;$('sndOn').dispatchEvent(new Event('change'))};
}
export function syncSound(){const on=$('wSndOn');if(on)on.checked=SND.on;const box=$('wSndMix');if(box){const ids=['sndVol','sndStrokes','sndEvents','sndRoom','sndRev'];[...box.querySelectorAll('input')].forEach((r,k)=>{r.value=$(ids[k]).value;r.nextElementSibling.textContent=Math.round(r.value*100)})}renderSoundTools()}
