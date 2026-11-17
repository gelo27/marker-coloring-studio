import {IMP} from '../core/settings.js';
import {art,customOrder,orderMode,palette,palSeed,zones} from '../core/zones.js';
const ZONE_FIELDS=['color','skip','flat','close','zoom','speed','hue','aClose','aZoom','aFast','tmul','vshade','tool','style','preset','fill','tones'];
const IMP_FIELDS=['thr','useColors','lineK','minArea','inkTiny','vec','vecSm'];
const LIMIT=40;
let undoStack=[],redoStack=[],baseline=null,restoring=false,restoreHandler=null,lastMergeAt=0;
function clone(value){return value==null?null:JSON.parse(JSON.stringify(value))}
function capture(){
  const zonesState=zones.map(z=>{const q={i:z.i};ZONE_FIELDS.forEach(k=>{if(z[k]!==undefined)q[k]=clone(z[k])});return q});
  const imp={};IMP_FIELDS.forEach(k=>{imp[k]=IMP[k]});
  return{zones:zonesState,palette:palette.slice(),palSeed,order:customOrder?customOrder.slice():null,orderMode,
    art:art?{merges:clone(art.merges||[]),masks:clone(art.masks||[]),walls:clone(art.walls||[])}:null,IMP:imp};
}
function updateUI(){
  const u=document.getElementById('historyUndo'),r=document.getElementById('historyRedo');
  if(u)u.disabled=!undoStack.length||restoring;if(r)r.disabled=!redoStack.length||restoring;
  const c=document.getElementById('historyCount');if(c)c.textContent=undoStack.length?String(undoStack.length):'';
}
export function canUndo(){return undoStack.length>0&&!restoring}
export function canRedo(){return redoStack.length>0&&!restoring}
export function setHistoryRestoreHandler(fn){restoreHandler=fn}
export function resetHistory(){undoStack=[];redoStack=[];baseline=capture();restoring=false;lastMergeAt=0;updateUI()}
export function observeHistory(label='Зміна зон',mergeKey=''){
  if(restoring)return;const next=capture();if(!baseline){baseline=next;updateUI();return}
  if(JSON.stringify(next)===JSON.stringify(baseline))return;
  const now=Date.now(),last=undoStack[undoStack.length-1];
  if(mergeKey&&last&&last.mergeKey===mergeKey&&now-lastMergeAt<700){last.after=next;last.at=now;lastMergeAt=now}
  else{undoStack.push({label,before:baseline,after:next,mergeKey,at:now});if(undoStack.length>LIMIT)undoStack.shift();lastMergeAt=now}
  baseline=next;redoStack=[];updateUI();
}
function restoreFrom(from,to,side){
  if(restoring||!from.length||!restoreHandler)return false;
  const entry=from[from.length-1],target=entry[side];restoring=true;updateUI();let finished=false;
  const done=()=>{if(finished)return;finished=true;baseline=capture();restoring=false;lastMergeAt=0;updateUI()};
  let accepted=false;try{accepted=restoreHandler(target,done)!==false}catch(error){restoring=false;updateUI();throw error}
  if(!accepted){restoring=false;updateUI();return false}
  from.pop();to.push(entry);lastMergeAt=0;updateUI();return true;
}
export function undoHistory(){return restoreFrom(undoStack,redoStack,'before')}
export function redoHistory(){return restoreFrom(redoStack,undoStack,'after')}
