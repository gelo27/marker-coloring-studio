import * as PIXI from 'pixi.js';
import {plan,viewFit} from '../core/plan.js';
import {OVS,SHADE,view} from '../core/settings.js';
import {inside} from '../core/strokes.js';
import {$,SS,TAU,clamp,hsl2hex} from '../core/utils.js';
import {art,orderedZones,seg,syncLk,zClose,zFast,zoneByI,zoneTone,zones} from '../core/zones.js';
import {setPR} from '../render/camera.js';
import {hideGrains} from '../render/glitter.js';
import {colorCtx,colorTex,ensureTmp,regionMask,setWetUniforms,tmpCtx,tmpCv,wetSlots} from '../render/paint.js';
import {draw} from '../render/renderer.js';
import {app,jarC,paperC,paperShader,penC,penShadow,postShader,selCtx,selCv,selTex,world} from '../render/scene.js';
import {showTab} from '../ui/controls.js';
import {setOrder,updateInspector} from '../ui/inspector.js';
/* ================= ZONE EDITOR ================= */
export const ed={on:false,view:'map',x:0,y:0,z:1,sel:new Set(),dirtyPaint:true,dirtySel:true,lasso:{on:false,pts:null}};
/* the contour being drawn and the contours already added, over the page while editing */
let lassoG=null;
export function drawLasso(){
  if(!paperC)return;if(!lassoG||lassoG.parent!==paperC){lassoG=new PIXI.Graphics();paperC.addChild(lassoG)}
  const g=lassoG,cw=app.view.getBoundingClientRect().width||view.W,lw=3*view.W/cw/(viewFit()*ed.z),p=ed.lasso.pts;g.clear();g.visible=ed.on;
  (art&&art.walls||[]).forEach(w=>{if(w.length<3)return;g.lineStyle(lw,0xE3416F,.75);g.moveTo(w[0][0],w[0][1]);for(let k=1;k<w.length;k++)g.lineTo(w[k][0],w[k][1]);g.closePath()});
  if(p&&p.length){g.lineStyle(lw*1.4,0xE3416F,1);g.moveTo(p[0][0],p[0][1]);for(let k=1;k<p.length;k++)g.lineTo(p[k][0],p[k][1]);
    if(p.length>2){g.lineStyle(lw,0xE3416F,.45);g.lineTo(p[0][0],p[0][1])}
    g.lineStyle(0);g.beginFill(0xffffff);g.drawCircle(p[0][0],p[0][1],lw*2.4);g.endFill();g.beginFill(0xE3416F);g.drawCircle(p[0][0],p[0][1],lw*1.4);g.endFill()}}
export function hideLasso(){if(lassoG)lassoG.visible=false}
export function edFit(){ed.x=seg.W/2;ed.y=seg.H/2;ed.z=1}
export function paintPreview(){
  colorCtx.clearRect(0,0,seg.W,seg.H);
  zones.forEach(z=>{syncLk(z);const r=z.r;regionMask(r);ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);
    if(z.skip){tmpCtx.fillStyle='rgba(120,110,130,.35)';for(let k=-r.bh;k<r.bw;k+=14*SS){tmpCtx.fillRect(k,0,4*SS,r.bh)}tmpCtx.setTransform(1,0,0,1,0,0)}
    else if(ed.view==='cam')camFill(z,r);
    else{tmpCtx.globalAlpha=ed.view==='map'?.95:.9;tmpCtx.fillStyle=ed.view==='map'?z.hue:ed.view==='order'?orderHue(z):z.color;tmpCtx.fillRect(0,0,r.bw,r.bh);tmpCtx.globalAlpha=1}
    tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(r.tightCv,0,0);tmpCtx.globalCompositeOperation='source-over';
    colorCtx.drawImage(tmpCv,0,0,r.bw,r.bh,r.bx,r.by,r.bw,r.bh);
    if(ed.view==='final'&&!z.skip&&SHADE.on&&!z.flat&&r.layers)r.layers.forEach(L=>{regionMask(L);ensureTmp(L.bw,L.bh);tmpCtx.clearRect(0,0,L.bw,L.bh);tmpCtx.globalAlpha=.9;tmpCtx.fillStyle=zoneTone(z,L.tidx);tmpCtx.fillRect(0,0,L.bw,L.bh);tmpCtx.globalAlpha=1;
      tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(L.tightCv,0,0);tmpCtx.globalCompositeOperation='source-over';colorCtx.drawImage(tmpCv,0,0,L.bw,L.bh,L.bx,L.by,L.bw,L.bh)})});
  if(ed.view==='order'){const ord=orderedZones().filter(z=>!z.skip);
    ord.forEach((z,k)=>{const r=z.r;let x=r.cx,y=r.cy;if(!inside(r,x,y)){let best=null,bd=1e18;for(let t=0;t<200;t++){const px=r.x0+Math.random()*(r.x1-r.x0),py=r.y0+Math.random()*(r.y1-r.y0);if(inside(r,px,py)){const d=Math.hypot(px-r.cx,py-r.cy);if(d<bd){bd=d;best=[px,py]}}}if(best){x=best[0];y=best[1]}}
      const fs=clamp(Math.sqrt(r.area)*.22,9*SS,22*SS);colorCtx.font='700 '+fs+'px Figtree,system-ui,sans-serif';colorCtx.textAlign='center';colorCtx.textBaseline='middle';
      const txt=String(k+1),w=colorCtx.measureText(txt).width;colorCtx.globalAlpha=1;colorCtx.fillStyle='rgba(255,255,255,.92)';colorCtx.beginPath();colorCtx.arc(x,y,Math.max(w*.62,fs*.66),0,TAU);colorCtx.fill();
      colorCtx.fillStyle='#2A2131';colorCtx.fillText(txt,x,y+fs*.04)})}
  colorTex.baseTexture.update();ed.dirtyPaint=false;
}
/* camera & speed view: violet = close-up, teal = wide; orange stripes = faster, grey cross-hatch = montage cut.
   Settings left on auto are shown paler. */
export const CAM_COLORS={close:'#A98BF0',wide:'#86D3C3',fast:'rgba(255,138,40,.85)',cut:'#B7B0C2'};
function camFill(z,r){const x=tmpCtx,cut=z.speed==='cut';
  x.globalAlpha=cut?.95:z.close==='auto'?.55:.95;x.fillStyle=cut?CAM_COLORS.cut:zClose(z)?CAM_COLORS.close:CAM_COLORS.wide;x.fillRect(0,0,r.bw,r.bh);x.globalAlpha=1;
  const st=10*SS;
  if(cut){x.strokeStyle='rgba(60,50,70,.55)';x.lineWidth=2.2*SS;x.beginPath();for(let k=-r.bh;k<r.bw;k+=st){x.moveTo(k,0);x.lineTo(k+r.bh,r.bh);x.moveTo(k+r.bh,0);x.lineTo(k,r.bh)}x.stroke()}
  else if(zFast(z)){x.globalAlpha=z.speed==='auto'?.5:1;x.fillStyle=CAM_COLORS.fast;x.save();x.transform(1,0,-1,1,0,0);for(let k=0;k<r.bw+r.bh;k+=st*1.6)x.fillRect(k,0,st*.55,r.bh);x.restore();x.globalAlpha=1}}
export function orderHue(z){const ord=orderedZones().filter(q=>!q.skip);const k=ord.indexOf(z),n=Math.max(1,ord.length-1);return hsl2hex((.93-.42*k/n+1)%1,.62,.74)}
export function paintSel(){
  selCtx.clearRect(0,0,selCv.width,selCv.height);
  ed.sel.forEach(i=>{const z=zoneByI.get(i);if(!z)return;const r=z.r;selCtx.drawImage(r.tightCv,r.bx/2,r.by/2,r.bw/2,r.bh/2)});
  selTex.baseTexture.update();ed.dirtySel=false;
}
export function renderEditor(t){
  if(ed.dirtyPaint){paintPreview();drawLasso()}if(ed.dirtySel)paintSel();
  wetSlots.forEach(s=>s.active=false);setWetUniforms();paperShader.uniforms.uWetStr=0;
  paperShader.uniforms.uSelOn=1;paperShader.uniforms.uFlat=1;if(jarC)jarC.visible=false;hideGrains();paperShader.uniforms.uTime=t;paperShader.uniforms.uCamPhase=t*.8;paperShader.uniforms.uShine=-1;
  penC.visible=penShadow.visible=false;(plan&&plan.sparkles||[]).forEach(s=>s.g&&s.g.scale.set(0));
  const fit=viewFit()*ed.z;world.scale.set(fit);world.pivot.set(ed.x,ed.y);world.position.set(view.W*OVS/2,view.H*OVS/2);world.rotation=0;if(postShader){const u=postShader.uniforms;u.uPersp=[0,0,0];u.uDof=0;u.uBreath=1;u.uGrain=0;u.uDust=0;u.uTilt=0;u.uVel=[0,0];u.uBlurG=0;u.uLeak=0;u.uCA=0;u.uBloom=0;u.uVig=0}if(paperC)paperC.rotation=0;setPR(0);
  const U2=postShader.uniforms;U2.uTilt=0;U2.uBlurG=0;U2.uVel=[0,0];U2.uCA=0;U2.uVig=0;U2.uBloom=0;U2.uLeak=0;
  draw();
}
export function screenToWorld(e){const rc=app.view.getBoundingClientRect();const sx=(e.clientX-rc.left)/rc.width*view.W,sy=(e.clientY-rc.top)/rc.height*view.H;const fit=viewFit()*ed.z;return[(sx-view.W/2)/fit+ed.x,(sy-view.H/2)/fit+ed.y]}
export function pickZone(wx,wy){
  const W=seg.W;const xi=Math.round(wx),yi=Math.round(wy);
  for(let rad=0;rad<=6*SS;rad+=SS){for(let dy=-rad;dy<=rad;dy+=Math.max(1,rad)){for(let dx=-rad;dx<=rad;dx+=Math.max(1,rad)){const x=xi+dx,y=yi+dy;if(x<0||y<0||x>=W||y>=seg.H)continue;const l=seg.lab[y*W+x];if(l&&zoneByI.has(l))return zoneByI.get(l)}}}
  return null;
}
export function edZoom(f,cx,cy){const nz=clamp(ed.z*f,.8,8);if(cx!=null){ed.x=cx-(cx-ed.x)*ed.z/nz;ed.y=cy-(cy-ed.y)*ed.z/nz}ed.z=nz}
/* one finger / mouse: tap picks a zone, drag pans; two fingers: pinch to zoom and pan; wheel zooms */
export function bindEditor(){
  const cv=app.view,pts=new Map();let down=null,pinch=null,lastTap={t:0,x:0,y:0};
  const mid=()=>{const a=[...pts.values()];return{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1}};
  cv.addEventListener('wheel',e=>{if(!ed.on)return;e.preventDefault();const w=screenToWorld(e);edZoom(Math.exp(-e.deltaY*.0015),w[0],w[1])},{passive:false});
  cv.addEventListener('pointerdown',e=>{if(!ed.on)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});try{cv.setPointerCapture(e.pointerId)}catch(err){}
    if(pts.size===2){const m=mid();pinch={m,z:ed.z,ex:ed.x,ey:ed.y,w:screenToWorld({clientX:m.x,clientY:m.y})};down=null;if(ed.lasso.pts){ed.lasso.pts=null;drawLasso()}}
    else if(pts.size===1){if(ed.lasso.on){ed.lasso.pts=[screenToWorld(e)];drawLasso();return}down={x:e.clientX,y:e.clientY,ex:ed.x,ey:ed.y,moved:false}}});
  cv.addEventListener('pointermove',e=>{if(!ed.on||!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const rc=cv.getBoundingClientRect();
    if(pinch&&pts.size===2){const m=mid();ed.z=clamp(pinch.z*m.d/pinch.m.d,.8,8);
      ed.x=pinch.w[0]-((m.x-rc.left)/rc.width*view.W-view.W/2)/(viewFit()*ed.z);ed.y=pinch.w[1]-((m.y-rc.top)/rc.height*view.H-view.H/2)/(viewFit()*ed.z);return}
    if(ed.lasso.pts){const w=screenToWorld(e),l=ed.lasso.pts[ed.lasso.pts.length-1];if(Math.hypot(w[0]-l[0],w[1]-l[1])>1.5*SS/ed.z){ed.lasso.pts.push(w);drawLasso()}return}
    if(!down)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>(e.pointerType==='touch'?10:5))down.moved=true;if(down.moved){const k=view.W/rc.width/(viewFit()*ed.z);ed.x=down.ex-dx*k;ed.y=down.ey-dy*k}});
  const end=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null};
  cv.addEventListener('pointercancel',e=>{end(e);down=null;if(ed.lasso.pts){ed.lasso.pts=null;drawLasso()}});
  cv.addEventListener('pointerup',e=>{const wasPinch=!!pinch;end(e);
    // finishing a contour: it closes by itself; too short or too small ones are dropped
    if(ed.lasso.pts){const p=ed.lasso.pts;ed.lasso.pts=null;drawLasso();let a=0;for(let k=0;k<p.length;k++){const q=p[k],r=p[(k+1)%p.length];a+=q[0]*r[1]-r[0]*q[1]}
      if(!wasPinch&&p.length>=6&&Math.abs(a)/2>Math.pow(6*SS,2)&&ed.onLasso)ed.onLasso(p.map(q=>[Math.round(q[0]),Math.round(q[1])]));return}if(!ed.on||!down||wasPinch){if(!pts.size)down=null;return}const wasMove=down.moved;down=null;if(wasMove)return;
    if(e.pointerType==='touch'){const now=performance.now(),dbl=now-lastTap.t<300&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<30;lastTap={t:dbl?0:now,x:e.clientX,y:e.clientY};if(dbl){edFit();return}}
    const w=screenToWorld(e),z=pickZone(w[0],w[1]);
    if(ed.onTap&&!ed.seq&&ed.onTap(z,e))return;
    if(!z){if(!e.shiftKey){ed.sel.clear();ed.dirtySel=true;updateInspector()}return}
    if(ed.seq){if(!ed.seq.includes(z.i)){ed.seq.push(z.i);setOrder(ed.seq.slice(),'custom');$('seqBtn').textContent='Готово ('+ed.seq.length+')'}ed.sel.clear();ed.sel.add(z.i)}
    else if(e.shiftKey||e.metaKey||e.ctrlKey){ed.sel.has(z.i)?ed.sel.delete(z.i):ed.sel.add(z.i)}else{ed.sel.clear();ed.sel.add(z.i)}
    ed.dirtySel=true;updateInspector();showTab('zones');$('zoneSec').open=true});
  // double click / double tap fits the page back into view
  cv.addEventListener('dblclick',()=>{if(ed.on)edFit()});

}
