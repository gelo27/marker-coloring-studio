import {replan} from '../core/plan.js';
import {analyze} from '../core/segment.js';
import {FLY,IMP} from '../core/settings.js';
import {$} from '../core/utils.js';
import {applySrcColors,art,initZones,setArtDoc,setCustomOrder,setSeg,zones} from '../core/zones.js';
import {ed} from '../editor/editor.js';
import {buildScene,buildSparkles} from '../render/scene.js';
import {renderFlyList} from './controls.js';
import {renderOrderList,renderPal,setSegValue2} from './inspector.js';
import {drawMarks,seek,setMode,setPlayIcon,setPlaying,setT} from './playback.js';
import {syncWizard} from './wizard.js';
/* ================= LOAD ================= */
export function setArt(a,openEditor,after){
  setArtDoc(a);$('overlay').hidden=false;$('overlay').textContent='Розбиваю сторінку на зони…';setPlaying(false);setPlayIcon();
  setTimeout(()=>{
    setSeg(analyze(art));initZones();let imp=null;if(art.colored&&IMP.useColors)imp=applySrcColors(art.srcCv);FLY.segs=null;setCustomOrder(null,'auto');ed.seq=null;$('orderPreset').value='auto';$('orderBadge').textContent='авто';$('seqBtn').textContent='Задати кліками';$('seqBtn').classList.remove('active');ed.sel.clear();buildScene();
    replan();buildSparkles();setT(0);
    renderPal('palette',true);renderOrderList();renderFlyList();
    $('overlay').hidden=true;
    $('impBox').hidden=!art.colored;
    $('artInfo').textContent=art.demo?'Демо: ведмежа на капкейку, '+zones.length+' зон.':art.colored?('Зафарбована сторінка: контури виділено автоматично, зон: '+zones.length+'.'+(imp?' Кольори взято з оригіналу для '+imp.n+' зон'+(imp.shaded?', з тінями та відблисками: '+imp.shaded:'')+(imp.blank?', '+imp.blank+' білих зон пропущено.':'.'):'')):'Знайдено зон: '+zones.length+'. Перевірте їх на карті й задайте кольори.';
    if(openEditor){ed.view=imp?'final':'map';setSegValue2('viewSeg',ed.view);setMode('zones')}else{setMode('anim');seek(0);drawMarks()}
    if(after)after();
    syncWizard();
  },30);
}
