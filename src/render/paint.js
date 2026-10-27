import * as PIXI from 'pixi.js';
import {plan} from '../core/plan.js';
import {FLQ,S,TOOLS,TOOL_IDS,fxOff} from '../core/settings.js';
import {inR,legEase,legPath,legPt} from '../core/strokes.js';
import {SS,TAU,clamp,mk,noiseAt,rngOf,smooth,vnoise} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {GL,glueGeo} from './glitter.js';
import {fluidLayer} from './liquid.js';
import {app,emptyTex,paperShader} from './scene.js';
/* ================= PAINT ================= */
export let colorCv,colorCtx,colorTex,colorDirty=false,cursor=0;
export let tmpCv=mk(4,4),tmpCtx=tmpCv.getContext('2d');
export function regionMask(r){
  const sloppy=r.Hs||0,key=sloppy.toFixed(2)+'_'+r.lk;
  if(r.maskCv&&r.maskKey===key)return r.maskCv;
  const ext=Math.round(sloppy*4.5*SS),pad=Math.ceil(r.w||40)+6+ext,W=seg.W,H=seg.H;
  const bx=Math.max(0,r.x0-pad),by=Math.max(0,r.y0-pad),bx1=Math.min(W-1,r.x1+pad),by1=Math.min(H-1,r.y1+pad);
  const bw=bx1-bx+1,bh=by1-by+1;
  let m=new Uint8Array(bw*bh);
  for(let y=0;y<bh;y++){let p=(y+by)*W+bx,q=y*bw;for(let x=0;x<bw;x++,p++,q++)if(inR(r,p))m[q]=1}
  const tight=m.slice();
  for(let it=0;it<Math.round(2.5*SS);it++){const n=m.slice();for(let y=1;y<bh-1;y++)for(let x=1;x<bw-1;x++){const q=y*bw+x;if(m[q])continue;if(!seg.isLine[(y+by)*W+x+bx])continue;if(m[q-1]||m[q+1]||m[q-bw]||m[q+bw])n[q]=1}m=n}
  if(ext>0){ // sloppy spots: let the marker leak over the line in random places
    let l=m.slice();for(let it=0;it<Math.round(2.5*SS)+ext;it++){const n=l.slice();for(let y=1;y<bh-1;y++)for(let x=1;x<bw-1;x++){const q=y*bw+x;if(l[q])continue;if(l[q-1]||l[q+1]||l[q-bw]||l[q+bw])n[q]=1}l=n}
    const sc=1/(16*SS),thr=.7-sloppy*.12;for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const q=y*bw+x;if(l[q]&&!m[q]&&seg.lab[(y+by)*W+x+bx]!==r.i&&vnoise((x+bx)*sc+r.i*3.1,(y+by)*sc)>thr)m[q]=1}
  }
  const cv=mk(bw,bh),cx=cv.getContext('2d'),id=cx.createImageData(bw,bh);
  for(let q=0;q<m.length;q++)if(m[q])id.data[q*4+3]=255;
  cx.putImageData(id,0,0);
  const tc=mk(bw,bh),tx=tc.getContext('2d'),td=tx.createImageData(bw,bh);for(let q=0;q<tight.length;q++)if(tight[q])td.data[q*4+3]=255;tx.putImageData(td,0,0);
  r.maskCv=cv;r.tightCv=tc;r.maskKey=key;r.bx=bx;r.by=by;r.bw=bw;r.bh=bh;
  return cv;
}
export let settledCv,settledCtx,dynamic=[];
export function resetPaint(){
  colorCtx.clearRect(0,0,colorCv.width,colorCv.height);settledCtx.clearRect(0,0,settledCv.width,settledCv.height);colorDirty=true;fullUpload=true;cursor=0;dynamic=[];
  if(matCtx){matCtx.clearRect(0,0,matCv.width,matCv.height);matDirty=true}if(glitCtx){glitCtx.clearRect(0,0,glitCv.width,glitCv.height);glitDirty=true}
  if(plan)plan.order.forEach(r=>{r.cv=null;r.cvx=null;r.done=0;r.dd=0;r.gs=0;r.gd=0;r.fl=null});
  wetSlots.forEach(s=>{s.k=-1});
}
export function strokeLeg(ctx,l,r,f,col,alphaMul){
  if(l.kind==='jump'||l.kind==='pause')return;
  ctx.strokeStyle=col||r.color;ctx.globalAlpha=Math.min(1,l.alpha*(alphaMul==null?1:alphaMul));ctx.lineWidth=r.w*l.wm;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();legPath(ctx,l,Math.min(1,f),r.bx,r.by);ctx.stroke();ctx.globalAlpha=1;
}
/* tool-aware stroke: style st={a,wm,blur} */
/* Watercolour dabs, ported from the fill of p5.brush (A. Campos, MIT), itself after Tyler Hobbs: every dab is a
   polygon that 'bleeds' outward by recursive edge growth with per-vertex strength (part of the rim stays tight);
   many faint layers of partially trimmed growths are stacked, each outlined very lightly (pigment gathering at the
   edge), a denser off-centre layer adds depth, a sparse scattered layer adds texture, and every few layers random
   soft circles are erased so the wash gets the uneven, flocculated look of real pigment. */
export function gss(rr,m,sd){return m+sd*(rr()+rr()+rr()+rr()-2)*1.2247}
export function wcGrow(P,rr,f,mode,bleed,cap){let v=P.v,m=P.m;const n0=v.length;
  if(f<1&&f>0&&n0>8){const nT=Math.floor((1-f)*n0),s0=Math.floor(n0/2-nT/2),e0=v[(s0-1+n0)%n0],e1=v[(s0+nT)%n0],nv=[],nm=[];
    for(let i=0;i<s0;i++){nv.push(v[i]);nm.push(m[i])}const L=Math.hypot(e1[0]-e0[0],e1[1]-e0[1]),j=L*.06;
    for(let k=1;k<=2;k++){const t=k/3;nv.push([e0[0]+(e1[0]-e0[0])*t+(rr()*2-1)*j,e0[1]+(e1[1]-e0[1])*t+(rr()*2-1)*j]);nm.push(.3+rr()*.2)}
    for(let i=s0+nT;i<n0;i++){nv.push(v[i]);nm.push(m[i])}v=nv;m=nm}
  const n=v.length,ov=[],om=[];const md0=mode===999?.6+rr()*.2:bleed;
  for(let i=0;i<n;i++){const a=v[i],b=v[(i+1)%n],mi=m[i],mod=mode>=997?md0:mi;ov.push(a);om.push(mi);
    if(mod<.05){ov.push([(a[0]+b[0])/2,(a[1]+b[1])/2]);om.push(mi);continue}
    const sx=b[0]-a[0],sy=b[1]-a[1],an=(-90+(rr()*2-1)*5)*Math.PI/180,c=Math.cos(an),sn=Math.sin(an),dx=c*sx+sn*sy,dy=c*sy-sn*sx,d=gss(rr,.5,.2)*(.65+rr()*.7)*mod;
    ov.push([a[0]+sx*.5+dx*d,a[1]+sy*.5+dy*d]);om.push(mi+gss(rr,0,.02))}
  if(ov.length>cap){const st=Math.ceil(ov.length/cap),fv=[],fm=[];for(let j=0;j<ov.length;j+=st){fv.push(ov[j]);fm.push(om[j])}return{v:fv,m:fm}}
  return{v:ov,m:om}}
export let wcScr=null,wcScrX=null;
export function wcPaint(dst,d,r){
  const rr=rngOf(d.seed),R=d.R,S=Math.ceil(R*3.4),bleed=.17,cap=420;
  if(!wcScr||wcScr.width<S||wcScr.height<S){wcScr=mk(Math.max(S,wcScr?wcScr.width:0),Math.max(S,wcScr?wcScr.height:0));wcScrX=wcScr.getContext('2d')}
  const x=wcScrX;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,S,S);x.setTransform(1,0,0,1,S/2,S/2);
  // base shape: a slightly irregular ellipse; a quarter of the rim (the 'fluid' side) bleeds less
  const n=9,ra=rr()*TAU,el=.8+rr()*.35,v=[],m=[],fl=Math.floor(n*.25*(1+Math.floor(rr()*3)));
  for(let i=0;i<n;i++){const a=ra+i/n*TAU,q=1+(rr()-.5)*.18;v.push([Math.cos(a)*R*el*q*.78,Math.sin(a)*R/el*q*.78]);m.push((i>fl?1:.3)*(.85+rr()*.55)*bleed)}
  let pol=wcGrow({v,m},rr,1,0,bleed,cap);const sparse=wcGrow({v:v.filter((_,i)=>i%3===0).map(p=>[p[0]*(.3+rr()*.4),p[1]*(.3+rr()*.4)]),m:m.filter((_,i)=>i%3===0)},rr,1,0,bleed,cap);
  const darker=.15+rr()*.55,layers=12,inten=(.9+.25*d.a)*.026,tex=.8*3,size=R;
  const draw=(P,al,lw)=>{const V=P.v;x.beginPath();x.moveTo(V[0][0],V[0][1]);for(let i=1;i<V.length;i++)x.lineTo(V[i][0],V[i][1]);x.closePath();x.globalAlpha=al;x.fill();x.globalAlpha=Math.min(1,al*.42);x.lineWidth=lw;x.stroke()};
  x.fillStyle=r.color;x.strokeStyle=r.color;x.lineJoin='round';let pols=null;
  for(let i=0;i<layers;i++){if(i%4===0)pol=wcGrow(pol,rr,1,0,bleed,cap);
    if(i%2===0)pols=[wcGrow(pol,rr,1-.02*i,0,bleed,cap),wcGrow(pol,rr,.7-.02*i,0,bleed,cap),wcGrow(pol,rr,.4-.02*i,0,bleed,cap)];
    const lw=size/25*(1-i/layers*.15);
    for(const p of pols)draw(wcGrow(wcGrow(p,rr,1,999,bleed,cap),rr,1,997,bleed,cap),inten,lw);
    if(i%2===1)draw(wcGrow(wcGrow(sparse,rr,1,999,bleed,cap),rr,1,997,bleed,cap),inten*tex*.5,lw*.6);
    if(i%2===0)draw(wcGrow(wcGrow(pol,rr,darker,0,bleed,cap),rr,1,999,bleed,cap),inten*2,lw);
    if(i%5===4||i===layers-1){x.globalCompositeOperation='destination-out';x.globalAlpha=1;x.fillStyle='rgba(0,0,0,'+(.045*tex/2.4)+')';
      const nc=60+Math.floor(rr()*40),mn=size*1.3;for(let k=0;k<nc;k++){if(k%5===0)continue;const cx=gss(rr,0,size/1.3),cy=gss(rr,0,size/1.3),rad=mn*(.03+rr()*.42);x.beginPath();x.arc(cx,cy,rad,0,TAU);x.fill()}
      x.globalCompositeOperation='source-over';x.fillStyle=r.color}}
  x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;
  dst.drawImage(wcScr,0,0,S,S,d.x-r.bx-S/2,d.y-r.by-S/2,S,S)}
export function wcStamps(l,r){if(l.wc&&l.wcW===r.w)return l.wc;const rnd=rngOf(Math.round(l.p0[0]*7+l.p0[1]*13+l.p1[0]*3)),L=Math.max(1,l.len||Math.hypot(l.p1[0]-l.p0[0],l.p1[1]-l.p0[1])),n=Math.max(1,Math.ceil(L/(r.w*.55))),out=[];
  for(let j=0;j<n;j++){const t=(j+.5)/n,q=legPt(l,t);out.push({t,x:q[0],y:q[1],R:r.w*l.wm*(.5+rnd()*.18),a:rnd(),seed:Math.floor(rnd()*1e9)})}l.wc=out;l.wcW=r.w;return out}
/* watercolour regions paint each dab once, permanently, as the brush reaches it */
export function wcRegion(r,c){
  const SD=r.dur*(r.sf||1),mask=regionMask(r);
  if(!r.cv){r.cv=mk(r.bw,r.bh);r.cvx=r.cv.getContext('2d');r.done=0;r.dd=0}
  const p=clamp((c-r.t0)/SD,0,1),cur=p>=1?{k:r.legs.length,f:0}:legAt(r,p),L=r.legs;
  while(r.done<L.length){const l=L[r.done];
    if(l.kind==='jump'||l.kind==='pause'){if(r.done<cur.k){r.done++;r.dd=0;continue}break}
    const S2=wcStamps(l,r),lim=r.done<cur.k?2:r.done===cur.k?cur.f:-1;
    while(r.dd<S2.length&&S2[r.dd].t<=lim){wcPaint(r.cvx,S2[r.dd],r);r.dd++}
    if(r.dd>=S2.length&&r.done<cur.k){r.done++;r.dd=0}else break}
  ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);tmpCtx.drawImage(r.cv,0,0);
  tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(mask,0,0);tmpCtx.globalCompositeOperation='source-over';
  return r.done>=L.length}
export function drawWCLeg(ctx,l,r,f,st){const S2=wcStamps(l,r);for(const d of S2){if(d.t>f)break;wcPaint(ctx,d,r)}}
export function drawLeg(ctx,l,r,f,st){
  if(l.kind==='jump'||l.kind==='pause'||st.a<=.003)return;
  const T=TOOLS[r.tool||S.tool];if(T.stamps){drawWCLeg(ctx,l,r,f,st);return}
  ctx.strokeStyle=r.color;ctx.lineCap='round';ctx.lineJoin='round';
  if(st.blur>0)ctx.filter='blur('+(st.blur*r.w).toFixed(1)+'px)';
  const sd=noiseAt(l.p0[0]*.37,l.p1[1]*.53),n=T.lines||1,ox=r.bx,oy=r.by;
  const line=(o,a,lw)=>{ctx.globalAlpha=Math.min(1,a);ctx.lineWidth=lw;ctx.beginPath();legPath(ctx,l,Math.min(1,f),ox,oy,o);ctx.stroke()};
  // dry media: the stroke is a band of fine streaks of uneven strength (the lead's grain), different on every stroke
  if(n>1){const W=r.w*l.wm;for(let j=0;j<n;j++){const h=(sd*(j+1)*7.31)%1,h2=(sd*(j+3)*3.17+.37)%1;line(((j+.5)/n-.5)*W*.92+(h-.5)*W*.09,st.a*(.42+h2*.5),W*(.11+h*.08))}}
  else if(st.soft){const W0=r.w*l.wm*st.wm;line(0,.5,W0*(1+st.soft*1.6));line(0,.6,W0*(1+st.soft*.6));line(0,.9,W0*.7)}
  else line(0,st.a,r.w*l.wm*st.wm);
  if(T.rough){line((sd-.5)*r.w*.5,st.a*.5,r.w*l.wm*.45);line((.5-sd)*r.w*.35,st.a*.35,r.w*l.wm*.3)}
  ctx.filter='none';ctx.globalAlpha=1;
}
export function legAt(r,p){const L=r.legs;let lo=0,hi=L.length-1;while(lo<hi){const m=(lo+hi)>>1;if(p<L[m].f1)hi=m;else lo=m+1}const l=L[lo];const f=clamp((p-l.f0)/(l.f1-l.f0||1),0,1);return{k:lo,f:legEase(f)}}
export function ensureTmp(w,h){if(tmpCv.width<w||tmpCv.height<h){tmpCv.width=Math.max(tmpCv.width,w);tmpCv.height=Math.max(tmpCv.height,h);tmpCtx=tmpCv.getContext('2d')}}
/* Builds the region's current look into tmpCv. Strokes start streaky and, after the tool's drying time,
   settle into a wider, near-opaque version, so marker streaks fade instead of staying. Returns true once fully dry. */
export function regionLayer(r,c){
  if(TOOLS[r.tool||S.tool].fluid)return fluidLayer(r,c);
  if(TOOLS[r.tool||S.tool].stamps)return wcRegion(r,c);
  const T=TOOLS[r.tool||S.tool],D=T.dry,mask0=regionMask(r),mask=T.thick?r.tightCv:mask0,SD=r.dur*(r.sf||1);
  if(!r.cv){r.cv=mk(r.bw,r.bh);r.cvx=r.cv.getContext('2d');r.done=0}
  const p=clamp((c-r.t0)/SD,0,1),cur=p>=1?{k:r.legs.length,f:0}:legAt(r,p);
  const te=i=>r.t0+SD*r.legs[i].f1;
  while(r.done<cur.k&&(D<=0||te(r.done)<=c-D)){drawLeg(r.cvx,r.legs[r.done],r,1,T.st(r.legs[r.done],1));r.done++}
  ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);tmpCtx.drawImage(r.cv,0,0);
  for(let i=r.done;i<cur.k;i++){const d=D>0?smooth(clamp((c-te(i))/D,0,1)):1;drawLeg(tmpCtx,r.legs[i],r,1,T.st(r.legs[i],d))}
  if(cur.k<r.legs.length&&cur.f>0)drawLeg(tmpCtx,r.legs[cur.k],r,cur.f,T.st(r.legs[cur.k],D>0?0:1));
  tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(mask,0,0);tmpCtx.globalCompositeOperation='source-over';
  return r.done>=r.legs.length;
}
export function drawMat(r){regionMask(r);if(!r.matMask||r.matKey!==r.tool){r.matKey=r.tool;const T=TOOLS[r.tool],m=mk(r.bw,r.bh),x=m.getContext('2d');x.fillStyle='rgb('+(TOOL_IDS().indexOf(r.tool)*20)+',0,0)';x.fillRect(0,0,r.bw,r.bh);x.globalCompositeOperation='destination-in';x.drawImage(T.thick?r.tightCv:r.maskCv,0,0);r.matMask=m}
  matCtx.drawImage(r.matMask,r.bx/2,r.by/2,r.bw/2,r.bh/2);matDirty=true}
export let gScr=null,gScrX=null;
export function glueAt(c){
  for(const r of plan.order){if(!TOOLS[r.tool].glue)continue;const s0=r.t0+r.dur*r.sf;if(c<s0)continue;const sd=r.dur*(1-r.sf);regionMask(r);
    const G=glueGeo(r);if(r.gd==null)r.gd=0;if(r.gt==null)r.gt=0;
    const sT=clamp((c-s0-sd*GL.t0)/(sd*(GL.t1-GL.t0)),0,1),want=Math.floor(sT*G.nt);
    // the very end of the tap evens the coat out (no denser streak where the shaker passed)
    const sE=clamp((sT-.55)/.45,0,1);if(sE>(r.gs||0)){const g0=r.gs||0;glitCtx.globalAlpha=g0>=1?1:(sE-g0)/(1-g0);glitCtx.drawImage(r.tightCv,r.bx/2,r.by/2,r.bw/2,r.bh/2);glitCtx.globalAlpha=1;r.gs=sE;glitDirty=true}
    if(!(r.gd<G.n&&G.tl[G.ord[r.gd]]*sd+s0<=c)&&r.gt>=want)continue;
    // new flakes are stamped into a scratch the size of the zone, clipped by the zone's own outline, then added
    const w=Math.ceil(r.bw/2)+2,h=Math.ceil(r.bh/2)+2,ox=r.bx/2,oy=r.by/2;
    if(!gScr||gScr.width<w||gScr.height<h){gScr=mk(Math.max(w,gScr?gScr.width:0),Math.max(h,gScr?gScr.height:0));gScrX=gScr.getContext('2d')}
    const x=gScrX;x.globalCompositeOperation='source-over';x.globalAlpha=1;x.clearRect(0,0,w,h);x.fillStyle='#fff';
    while(r.gd<G.n&&G.tl[G.ord[r.gd]]*sd+s0<=c){const i=G.ord[r.gd];r.gd++;if(!G.glued[i])continue;x.globalAlpha=.55+.45*G.rnd[i];const z=G.fs[i];x.fillRect(G.lx[i]/2-ox-z/2,G.ly[i]/2-oy-z/2,z,z)}
    while(r.gt<want){const k=r.gt++;x.globalAlpha=.6+.4*G.trn[k];x.fillRect(G.tx[k]/2-ox-1.1,G.ty[k]/2-oy-1.1,2.2,2.2)}
    x.globalAlpha=1;x.globalCompositeOperation='destination-in';x.drawImage(r.tightCv,0,0,r.bw/2,r.bh/2);x.globalCompositeOperation='source-over';
    glitCtx.globalAlpha=1;glitCtx.drawImage(gScr,0,0,w,h,ox,oy,w,h);glitDirty=true}
}
export let matCv=null,matCtx=null,matTex=null,matDirty=false,glitCv=null,glitCtx=null,glitTex=null,glitDirty=false;
export function paintAt(c){
  const o=plan.order;
  while(cursor<o.length&&c>=o[cursor].t0){dynamic.push(o[cursor]);drawMat(o[cursor]);cursor++}
  glueAt(c);
  if(!dynamic.length)return;
  dynamic.forEach(r=>{regionMask(r);dirtyRects.push([r.bx,r.by,r.bw,r.bh]);colorCtx.clearRect(r.bx,r.by,r.bw,r.bh);colorCtx.drawImage(settledCv,r.bx,r.by,r.bw,r.bh,r.bx,r.by,r.bw,r.bh)});
  const still=[];
  dynamic.forEach(r=>{const dry=regionLayer(r,r.instant?r.t1+60:c);
    if(dry){settledCtx.drawImage(tmpCv,0,0,r.bw,r.bh,r.bx,r.by,r.bw,r.bh);r.cv=null;r.cvx=null}else still.push(r);
    colorCtx.drawImage(tmpCv,0,0,r.bw,r.bh,r.bx,r.by,r.bw,r.bh)});
  dynamic=still;colorDirty=true;
}
/* wet ink: two texture slots for the shader. The newest wet zone gets one; every older zone that is still wet shares the
   other (their joint box, at a lower resolution when it is large). Each zone's sheen fades out at its end, so none of
   them loses its gloss at once when more zones are wet than there are slots. */
export const WET_TAU=.9,WET_END=2.8;
export const wetSlots=[{k:-1},{k:-1}];
let wetScr=null,wetScrX=null;
const wetEnd=r=>r.t0+r.dur*r.sf+(TOOLS[r.tool].fluid?TOOLS[r.tool].dry:WET_END);
/* one zone's sheen at scale sc into wetScr (its box), clipped to the zone */
function wetZone(r,c,sc){
  const w=Math.max(1,Math.ceil(r.bw*sc)),h=Math.max(1,Math.ceil(r.bh*sc));
  if(!wetScr||wetScr.width<w||wetScr.height<h){wetScr=mk(Math.max(w,wetScr?wetScr.width:0),Math.max(h,wetScr?wetScr.height:0));wetScrX=wetScr.getContext('2d')}
  const ctx=wetScrX;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.setTransform(sc,0,0,sc,0,0);
  if(TOOLS[r.tool].fluid&&r.fl){const F=r.fl;ctx.imageSmoothingEnabled=true;ctx.drawImage(F.wc,1,1,F.gw-2,F.gh-2,0,0,(F.gw-2)*F.cs,(F.gh-2)*F.cs)}
  else{const SD=r.dur*r.sf,p=clamp((c-r.t0)/SD,0,1),cur=p>=1?{k:r.legs.length,f:0}:legAt(r,p);
    if(cur.k<r.legs.length&&cur.f>0)strokeLeg(ctx,r.legs[cur.k],r,cur.f,'#fff',1.2);
    for(let i=Math.min(cur.k,r.legs.length)-1;i>=0;i--){const te=r.t0+SD*r.legs[i].f1;const k=Math.exp(-(c-te)/WET_TAU);if(k<.03)break;strokeLeg(ctx,r.legs[i],r,1,'#fff',k*1.2)}}
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(r.tightCv,0,0);ctx.globalCompositeOperation='source-over';ctx.setTransform(1,0,0,1,0,0);
  return[w,h]}
export function wetAt(c){
  const on=S.fx.wet.on&&S.fx.wet.v>0&&!fxOff();
  for(let s=0;s<2;s++){wetSlots[s].active=false}
  if(!on||!plan.order.length){setWetUniforms();return}
  // zones still wet; the order is sorted by start, so they are among the last ones started
  const o=plan.order,cand=[];
  for(let i=Math.min(o.length,cursor)-1;i>=0&&i>=cursor-40;i--){const r=o[i],T=TOOLS[r.tool];if(T.wet&&!r.instant&&c>=r.t0&&c<wetEnd(r)&&(!T.fluid||(r.fl&&FLQ.gloss)))cand.unshift(r)}
  const groups=cand.length>2?[cand.slice(0,-1),cand.slice(-1)]:cand.map(r=>[r]);
  groups.forEach((G,s)=>{
    G.forEach(r=>regionMask(r));
    const gx=Math.min(...G.map(r=>r.bx)),gy=Math.min(...G.map(r=>r.by)),gw=Math.max(...G.map(r=>r.bx+r.bw))-gx,gh=Math.max(...G.map(r=>r.by+r.bh))-gy;
    const sc=Math.min(1,Math.sqrt(9e5/(gw*gh))),cw=Math.max(1,Math.ceil(gw*sc)),ch=Math.max(1,Math.ceil(gh*sc));
    const slot=wetSlots[s];slot.k=G[G.length-1].k;
    if(!slot.cv){slot.cv=mk(cw,ch);slot.ctx=slot.cv.getContext('2d')}
    if(slot.cv.width!==cw||slot.cv.height!==ch){slot.cv.width=cw;slot.cv.height=ch;if(slot.tex){slot.tex.destroy(true);slot.tex=null}}
    const ctx=slot.ctx;ctx.clearRect(0,0,cw,ch);ctx.globalCompositeOperation='lighter';
    G.forEach(r=>{const [w,h]=wetZone(r,c,sc);ctx.globalAlpha=smooth(clamp((wetEnd(r)-c)/.8,0,1));ctx.drawImage(wetScr,0,0,w,h,(r.bx-gx)*sc,(r.by-gy)*sc,w,h)});
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(!slot.tex)slot.tex=PIXI.Texture.from(slot.cv);else slot.tex.baseTexture.update();
    slot.active=true;slot.rect=[gx/seg.W,gy/seg.H,cw/sc/seg.W,ch/sc/seg.H]});
  setWetUniforms();
}
export function setWetUniforms(){
  if(!paperShader)return;
  for(let s=0;s<2;s++){const sl=wetSlots[s];const on=sl.active&&sl.tex;paperShader.uniforms['uWet'+s]=on?sl.tex:emptyTex;paperShader.uniforms['uWetRect'+s]=on?sl.rect:[0,0,0,0]}
  paperShader.uniforms.uWetStr=S.fx.wet.on&&!fxOff()?S.fx.wet.v:0;
}
/* paint surfaces for a page of W x H (material and glitter maps at half resolution) */
export function initSurfaces(W,H){
  if(matTex)matTex.destroy(true);if(glitTex)glitTex.destroy(true);if(colorTex)colorTex.destroy(true);
  matCv=mk(W>>1,H>>1);matCtx=matCv.getContext('2d');matCtx.imageSmoothingEnabled=false;matTex=PIXI.Texture.from(matCv);matTex.baseTexture.scaleMode=PIXI.SCALE_MODES.NEAREST;
  glitCv=mk(W>>1,H>>1);glitCtx=glitCv.getContext('2d');glitTex=PIXI.Texture.from(glitCv);
  colorCv=mk(W,H);colorCtx=colorCv.getContext('2d');settledCv=mk(W,H);settledCtx=settledCv.getContext('2d');dynamic=[];
  colorTex=PIXI.Texture.from(colorCv);fullUpload=true;dirtyRects=[];
}
/* uploads changed paint canvases; true when the colour layer changed */
/* The colour layer is a page-sized canvas (millions of pixels); re-uploading all of it every frame is what made phones
   slow. Only the boxes of the zones being painted this frame go to the GPU (texSubImage2D through small scratch canvases);
   a full upload happens after a reset, before the texture exists, or when the boxes cover most of the page. */
let dirtyRects=[],fullUpload=true;const subCv=new Map();
function uploadRects(){const R=app.renderer,gl=R.gl,bt=colorTex.baseTexture,gt=bt._glTextures&&bt._glTextures[R.CONTEXT_UID];
  if(!gl||!gt||gt.dirtyId!==bt.dirtyId||!dirtyRects.length)return false;
  let a=0;for(const q of dirtyRects)a+=q[2]*q[3];if(a>colorCv.width*colorCv.height*.35)return false;
  R.texture.bind(bt,0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,bt.alphaMode===PIXI.ALPHA_MODES.UNPACK);
  for(const[x,y,w,h]of dirtyRects){const k=w+'x'+h;let c=subCv.get(k);if(!c){if(subCv.size>16)subCv.clear();c=mk(w,h);subCv.set(k,c)}
    const cx=c.getContext('2d');cx.clearRect(0,0,w,h);cx.drawImage(colorCv,x,y,w,h,0,0,w,h);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,c)}
  return true}
export function flushPaint(){const ch=colorDirty;if(colorDirty){if(fullUpload||!uploadRects())colorTex.baseTexture.update();colorDirty=false;fullUpload=false;dirtyRects.length=0}
  if(matDirty){matTex.baseTexture.update();matDirty=false}if(glitDirty){glitTex.baseTexture.update();glitDirty=false}return ch}
export function markColorDirty(){colorDirty=true}
