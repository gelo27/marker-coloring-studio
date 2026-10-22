import * as PIXI from 'pixi.js';
import {TOOLS} from '../core/settings.js';
import {SS} from '../core/utils.js';
import {app} from '../render/scene.js';
import {TOOL_LEN,buildTool,shadowHover} from '../render/toolSprites.js';
/* ================= TOOL THUMBNAILS =================
   Square previews of every tool, rendered from the same 3D-shaded sprites the video uses: the tool lies across a
   sheet of paper at 45°, its contact shadow under it, a few strokes of its colour next to the tip. Rendered once,
   lazily (one tool per idle moment), and cached as data URLs. */
export const TOOL_THUMB_COLORS={marker:0xE3416F,copic:0x4F8FE0,pencil:0x3CA65A,watercolor:0x8E5BD6,pastel:0xF0A030,gel:0x20B5C0,puffy:0xFF6A93,glue:0xE8C030,chameleon:0x9B59B6,liquid:0x2A63C8};
const THUMB={};
export function toolThumb(t,size){
  size=size||192;const key=t+'@'+size;if(THUMB[key])return THUMB[key];
  const col=TOOL_THUMB_COLORS[t]||0xE3416F,c=new PIXI.Container();
  const bg=new PIXI.Graphics();bg.beginFill(0xF7F2EA);bg.drawRect(0,0,size,size);bg.endFill();
  // soft paper grain
  for(let k=0;k<70;k++){const x=(k*73%97)/97*size,y=(k*41%89)/89*size;bg.beginFill(k%2?0xffffff:0xe9e1d6,.35);bg.drawCircle(x,y,size*.012*(1+k%3));bg.endFill()}
  c.addChild(bg);
  // a few strokes in the tool's colour around the tip
  const sc=new PIXI.Graphics(),tip=[size*.33,size*.67];sc.lineStyle({width:size*.075,color:col,alpha:.82,cap:PIXI.LINE_CAP.ROUND,join:PIXI.LINE_JOIN.ROUND});
  sc.moveTo(size*.08,size*.9);for(let k=0;k<5;k++){const u=k/4;sc.lineTo(size*(.1+.22*u),size*(.62+.06*u));sc.lineTo(size*(.06+.22*u),size*(.9-.02*u))}
  sc.alpha=.9;c.addChild(sc);
  const B=buildTool(t),holder=new PIXI.Container();B.tint.forEach(g=>g.tint=col);
  B.sh.position.set(5*SS,8*SS);B.sh.rotation=.3;shadowHover(B.sh,.12);holder.addChild(B.sh,B.c);
  const L=(TOOL_LEN[t]||560)*SS;holder.scale.set(Math.min(size*2.1/L,size*.0062));holder.rotation=-Math.PI/4;holder.position.set(tip[0],tip[1]);
  c.addChild(holder);
  const vign=new PIXI.Graphics();vign.beginFill(0x000000,.05);vign.drawRect(0,size*.92,size,size*.08);vign.endFill();c.addChild(vign);
  const cv=app.renderer.extract.canvas(c,new PIXI.Rectangle(0,0,size,size));
  const url=cv.toDataURL('image/png');c.destroy({children:true});return THUMB[key]=url;
}
/* fills every <img data-tool-thumb="tool"> on the page, one tool per idle slice so the start stays smooth */
export function fillToolThumbs(){
  const todo=Object.keys(TOOLS);const idle=window.requestIdleCallback||(f=>setTimeout(f,30));
  const step=()=>{const t=todo.shift();if(!t)return;const url=toolThumb(t);document.querySelectorAll('img[data-tool-thumb="'+t+'"]').forEach(i=>{i.src=url});idle(step)};idle(step);
}
