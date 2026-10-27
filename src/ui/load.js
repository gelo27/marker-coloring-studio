import {replan} from '../core/plan.js';
import {analyze} from '../core/segment.js';
import {FLY,IMP} from '../core/settings.js';
import {$} from '../core/utils.js';
import {applySrcColors,art,customOrder,initZones,orderMode,seg,setArtDoc,setCustomOrder,setSeg,zones} from '../core/zones.js';
import {ed} from '../editor/editor.js';
import {buildScene,buildSparkles} from '../render/scene.js';
import {renderFlyList} from './controls.js';
import {renderOrderList,renderPal,setSegValue2} from './inspector.js';
import {drawMarks,seek,setMode,setPlayIcon,setPlaying,setT} from './playback.js';
import {lsSchedule} from './project.js';
import {syncWizard} from './wizard.js';
/* ================= LOAD ================= */
export function setArt(a,openEditor,after){
  setArtDoc(a);$('overlay').hidden=false;$('overlay').textContent='Розбиваю сторінку на зони…';setPlaying(false);setPlayIcon();
  setTimeout(()=>{
    setSeg(analyze(art));initZones();let imp=null;if(art.colored&&IMP.useColors)imp=applySrcColors(art.srcCv);FLY.segs=null;setCustomOrder(null,'auto');ed.seq=null;$('orderPreset').value='auto';$('orderBadge').textContent='авто';$('seqBtn').textContent='Задати кліками';$('seqBtn').classList.remove('active');ed.sel.clear();buildScene();
    replan();buildSparkles();setT(0);
    renderPal('palette',true);renderOrderList();renderFlyList();
    $('overlay').hidden=true;
    $('impBox').hidden=!art.colored;$('impVecBox').hidden=$('wVecBox').hidden=!art.rawCv;
    $('artInfo').textContent=art.demo?'Демо: ведмежа на капкейку, '+zones.length+' зон.':art.colored?('Зафарбована сторінка: контури виділено автоматично, зон: '+zones.length+'.'+(imp?' Кольори взято з оригіналу для '+imp.n+' зон'+(imp.shaded?', з тінями та відблисками: '+imp.shaded:'')+(imp.blank?', '+imp.blank+' білих зон пропущено.':'.'):'')):'Знайдено зон: '+zones.length+'.'+(art.vec?' Контури векторизовано й збільшено ×'+art.vec+'.':'')+' Перевірте їх на карті й задайте кольори.';
    if(openEditor){ed.view=imp?'final':'map';setSegValue2('viewSeg',ed.view);setMode('zones')}else{setMode('anim');seek(0);drawMarks()}
    if(after)after();
    syncWizard();
  },30);
}
/* Re-runs the segmentation after the user drew a contour. Every new zone takes the settings of the old zone it
   mostly lies in (colour, skip, camera, speed, tool…), the custom order follows, so only the split zone changes. */
export function resegment(after){
  const oldLab=seg.lab,oldBy=new Map(zones.map(z=>[z.i,z])),oldOrder=customOrder,oldMode=orderMode;
  $('overlay').hidden=false;$('overlay').textContent='Перераховую зони…';setPlaying(false);setPlayIcon();
  setTimeout(()=>{
    setSeg(analyze(art));initZones();if(art.colored&&IMP.useColors)applySrcColors(art.srcCv);
    const from=new Map();
    zones.forEach(z=>{const r=z.r,cnt=new Map(),st=Math.max(1,Math.round(Math.sqrt(r.area)/40));
      for(let y=r.y0;y<=r.y1;y+=st)for(let x=r.x0;x<=r.x1;x+=st){const p=y*seg.W+x;if(seg.lab[p]!==r.i)continue;const o=oldLab[p];if(o)cnt.set(o,(cnt.get(o)||0)+1)}
      let best=0,bv=0;cnt.forEach((v,k)=>{if(v>bv){bv=v;best=k}});const o=oldBy.get(best);if(!o)return;from.set(z.i,best);
      ['skip','close','zoom','speed','tmul','vshade','tool','style','preset','fill'].forEach(k=>{if(o[k]!==undefined)z[k]=o[k]});
      if(!(art.colored&&IMP.useColors&&o.tones)){z.color=o.color;if(o.flat)z.flat=true}});
    if(oldOrder){const ids=[];oldOrder.forEach(oi=>zones.forEach(z=>{if(from.get(z.i)===oi&&!ids.includes(z.i))ids.push(z.i)}));setCustomOrder(ids,oldMode)}
    else setCustomOrder(null,'auto');
    FLY.segs=null;ed.seq=null;ed.sel.clear();buildScene();
    replan();buildSparkles();setT(0);
    renderPal('palette',true);renderOrderList();renderFlyList();
    $('overlay').hidden=true;ed.dirtyPaint=true;ed.dirtySel=true;lsSchedule();
    if(after)after();
    syncWizard();
  },30);
}
