import {lerp} from './utils.js';
/* ================= SETTINGS ================= */
export const TOOLS={
  marker:{name:'Фломастер',sub:'смуги, що висихають',wMul:1,spacing:.70,outline:true,mat:{pat:1,relief:.12},wet:true,dry:1.3,tooth:0,glitter:0,edge:0,
    st:(l,d)=>({a:lerp(l.alpha,.95,d),wm:lerp(1,1.34,d),blur:0})},
  copic:{name:'Спиртовий маркер',sub:'мʼякий, без смуг',wMul:1.12,spacing:.62,outline:true,mat:{pat:.2,relief:.1,beer:1.2},wet:true,dry:.9,tooth:0,glitter:0,edge:0,
    st:(l,d)=>({a:lerp(l.alpha*.68,.9,d),wm:lerp(1.12,1.38,d),blur:.07})},
  pencil:{name:'Кольорові олівці',sub:'зерниста штриховка',wMul:.6,spacing:.55,outline:true,mat:{pat:.25,relief:.15,tooth:1,toothScale:.32},wet:false,dry:0,tooth:.95,glitter:0,edge:0,lines:9,
    // a pencil does not dry: every stroke is a band of thin streaks of pigment along the motion, final at once
    st:l=>({a:Math.min(1,l.alpha*1.05),wm:1,blur:0})},
  watercolor:{name:'Акварель',sub:'мокрі мазки, прозорі шари',wMul:1.85,spacing:.8,outline:false,mat:{pat:0,relief:.5,gran:.3,rim:.6,beer:2.5},wet:true,dry:0,stamps:true,tooth:.12,glitter:0,edge:1,scribble:false,
    st:(l,d)=>({a:lerp(.42,.33,d)*(l.alpha/.76),wm:lerp(1.3,1.45,d),blur:lerp(.26,.12,d)})},
  pastel:{name:'Пастель',sub:'грубий фактурний мазок',wMul:1.2,spacing:.74,outline:false,mat:{pat:.35,relief:.85,tooth:1.25,toothScale:.75,chalk:1},wet:false,dry:.8,tooth:1.25,glitter:0,edge:0,rough:true,
    st:(l,d)=>({a:lerp(.62+l.alpha*.2,.92,d),wm:1,blur:0})},
  gel:{name:'Гелева ручка',sub:'блискітки, що мерехтять',wMul:.5,spacing:.55,outline:true,mat:{pat:0,relief:.1,glitter:1},wet:true,dry:.8,tooth:0,glitter:1,edge:0,
    st:(l,d)=>({a:lerp(l.alpha,.96,d),wm:lerp(1,1.22,d),blur:0})},
  puffy:{name:'Обʼємна фарба',sub:'рельєф і глянець',wMul:.9,spacing:.8,outline:true,mat:{pat:0,relief:.15,thick:1},wet:true,dry:1.8,tooth:0,glitter:0,edge:0,thick:true,scribble:false,
    st:(l,d)=>({a:.96,wm:lerp(.64,.7,d),blur:0,soft:lerp(.55,.8,d)})},
  glue:{name:'Клей + блискітки',sub:'посипати й струсити',wMul:.95,spacing:.66,outline:true,mat:{pat:0,relief:.12,glue:1},wet:true,dry:.6,tooth:0,glitter:0,edge:0,glue:true,scribble:false,
    st:(l,d)=>({a:.9,wm:lerp(1,1.15,d),blur:0})},
  chameleon:{name:'Хамелеон',sub:'дуохром, переливається',wMul:1,spacing:.64,outline:true,mat:{pat:.15,relief:.1,duo:1},wet:true,dry:1,tooth:0,glitter:0,edge:0,
    st:(l,d)=>({a:lerp(l.alpha,.96,d),wm:lerp(1,1.3,d),blur:0})},
  liquid:{name:'Рідка фарба',sub:'тече й заливає зону',wMul:1.7,spacing:.95,outline:false,mat:{pat:.05,relief:.32,gran:.4,beer:1.1},wet:true,dry:1.5,tooth:0,glitter:0,edge:0,scribble:false,hover:.5,fluid:true,
    st:(l,d)=>({a:.95,wm:1,blur:0})}

};
export const TOOL_IDS=()=>Object.keys(TOOLS);
export const HUM_DEF={fill:'auto',turn:.35,sloppy:.3,jitter:.45,tremor:.3,pressure:.5,tempo:.5,pauses:.35,outline:.75,lifts:.25,cross:.15,dirVar:.5,shuffle:.4,shake:.4,touch:true};
export const HUM_PRESETS={
  careful:{name:'Акуратна людина',v:{turn:.2,sloppy:.06,jitter:.22,tremor:.12,pressure:.3,tempo:.3,pauses:.2,outline:1,lifts:.15,cross:.05,dirVar:.3,shuffle:.15,shake:.25}},
  normal:{name:'Звичайна людина',v:(({fill,touch,...o})=>o)(HUM_DEF)},
  relaxed:{name:'Розслаблено',v:{turn:.55,sloppy:.25,jitter:.55,tremor:.25,pressure:.65,tempo:.7,pauses:.6,outline:.6,lifts:.45,cross:.35,dirVar:.6,shuffle:.5,shake:.45}},
  hasty:{name:'Поспіхом',v:{turn:.1,sloppy:.55,jitter:.7,tremor:.35,pressure:.6,tempo:.75,pauses:.08,outline:.35,lifts:.1,cross:.05,dirVar:.8,shuffle:.7,shake:.6}},
  kid:{name:'Дитина',v:{turn:.6,sloppy:.85,jitter:.9,tremor:.6,pressure:.85,tempo:.8,pauses:.55,outline:.2,lifts:.35,cross:.3,dirVar:1,shuffle:1,shake:.7}}};
export const HUM_META=[['sloppy','Виходи за контур'],['jitter','Нерівність штрихів'],['tremor','Тремтіння руки'],['pressure','Нерівний натиск'],['tempo','Нерівний темп'],['pauses','Паузи й вагання'],['outline','Спершу обвести контур'],['lifts','Відриви пера між рядками'],['cross','Перехресні проходи'],['dirVar','Різний напрямок штриховки'],['shuffle','Хаотичність порядку'],['turn','Повертати папір'],['shake','Камера з рук']];
export const NEAT={on:false,fill:'hatch',turn:0,sloppy:0,jitter:0,tremor:0,pressure:0,tempo:0,pauses:0,outline:0,lifts:0,cross:0,dirVar:0,shuffle:0,shake:0,touch:true};
export function HP(){return S.human?Object.assign({on:true},S.hum):NEAT}
export function zoneTool(z){return (z&&z.tool)||S.tool}
export function zoneH(z){const st=(z&&z.style)||(S.human?'human':'neat');let H;if(st==='neat')H=Object.assign({},NEAT);else{H=Object.assign({on:true},S.hum);if(z&&z.preset&&HUM_PRESETS[z.preset])Object.assign(H,HUM_PRESETS[z.preset].v)}if(z&&z.fill)H.fill=z.fill;return H}
export const S={tool:'marker',duration:60,montage:true,human:true,hum:Object.assign({},HUM_DEF),humPreset:'normal',fastMul:2.6,seed:1,camMode:'montage',wideBig:true,introWide:true,
  fx:{tilt:{on:true,v:.6},vig:{on:true,v:.45},focus:{on:true,v:.6},mblur:{on:true,v:.55},bloom:{on:true,v:.45},wet:{on:true,v:.6},ca:{on:true,v:.25},whip:{on:true,v:.5},ramp:{on:true,v:.6},persp:{on:true,v:.55},lens:{on:true,v:.5},grain:{on:true,v:.4},penblur:{on:true,v:.7}}};
export const FX_META=[['tilt','Tilt-shift на крупних'],['vig','Віньєтка'],['focus','Перевід фокусу на склейках'],['mblur','Motion blur'],['bloom','Bloom і відблиски'],['wet','Мокрий блиск чорнила'],['ca','Хроматична аберація'],['whip','Whip-pan (частка склейок)'],['ramp','Speed-ramp (плавність)'],['persp','Камера під кутом і глибина різкості'],['lens','Оптика: дисторсія, дихання фокусу, пил'],['grain','Зерно сенсора'],['penblur','Розмиття інструмента в русі']];
export const U={patStr:.45,patScale:1,grain:.6};
export const FLY={mode:'before',dur:3,count:3,zoomMul:1,segs:null};
export const FLY_MOVES={auto:'Авто',in:'Наближення',out:'Віддалення',pan:'Панорама'};
export const VS={on:false,dir:'ul',w:.26,dark:.3,style:'solid'};
export const VS_DIRS={ul:[-1,-1],u:[0,-1],ur:[1,-1],r:[1,0],dr:[1,1],d:[0,1],dl:[-1,1],l:[-1,0]};
export const FORMATS={'9x16':[1080,1920],'4x5':[1080,1350],'1x1':[1080,1080],'16x9':[1920,1080]};
export const view={W:1080,H:1920,fmt:'9x16'};
// the scene is rendered with this much extra margin so the camera can look at the page at an angle (none in the light preview)
export let OVS=1.45;
export function setOVS(v){OVS=v}
export const DUO={shift:2.094},GLT={dens:.88};
export const PUFF={ns:7.5,gloss:1};
export const DESK={mode:'default',tex:null,iw:1,ih:1,scale:1,bright:1,blur:0,tint:'#ccded6'};
export const FLQ={prev:140,render:320,res:140,mix:2,blooms:true,drops:true,cine:true,gloss:true};
export const OUT={on:false,dur:6,color:'#e3263b',text:'SUBSCRIBE',style:'hand'},OUTRO_TR=1.0,OUT_FONT='"Permanent Marker","Marker Felt","Comic Sans MS",cursive';
export const IMP={thr:.38,useColors:true,lineK:.42,minArea:95};
export const SHADE={on:true,when:'zone'};
/* inking: a black tool first draws the drawing's lines, then the zones are coloured (dur 0 = by the length of the lines) */
export const INK={on:false,tool:'marker',dur:0};
/* preview quality: 'lite' renders at half size without camera effects (phones), 'fx' half size with effects, 'full' as exported */
export const PREV={q:'full',exporting:false};
export const PREV_SCALE={lite:.5,fx:.5,full:1};
export function previewScale(){return PREV.exporting?1:PREV_SCALE[PREV.q]||1}
export function fxOff(){return PREV.q==='lite'&&!PREV.exporting}
/* phones and tablets (touch screens without a mouse) share the compact mobile layout */
export const MOBILE_MQ='(max-width:600px), (hover:none) and (pointer:coarse)';
export const isMobileUI=()=>matchMedia(MOBILE_MQ).matches;
