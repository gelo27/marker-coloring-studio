import * as PIXI from 'pixi.js';
import {plan,viewFit} from '../core/plan.js';
import {OVS,TOOLS,view} from '../core/settings.js';
import {inside} from '../core/strokes.js';
import {SS,TAU,clamp,hex,lerp,lighten,rngOf} from '../core/utils.js';
import {liqShades,seg} from '../core/zones.js';
import {P2W,cam} from './camera.js';
import {cursor} from './paint.js';
import {app,paperC} from './scene.js';
/* ================= GLITTER PHYSICS =================
   A glue zone gets thousands of real grains (one per flake) with closed-form motion, so any frame can be shown
   exactly, also when seeking: the shaker pulses them out in bursts, they fall under gravity in a spreading cone
   and tumble (flashing when they catch the light); glued grains stick where they land, dry ones bounce and rest;
   after the tap a gust blows the loose grains far off the page. Only the active zone is simulated, flying grains are
   found by index ranges (no full scans), sprites come from one big ParticleContainer pool, and off-camera grains
   are skipped. */
export const GL={p0:.05,p1:.6,t0:.62,t1:.74,b0:.75,b1:1};
export let grainPC=null,grainPool=[],grainTex=null,grainSh=null,grainShPool=[],grainUsed=0,grainShUsed=0;
export function glueGeo(r){if(r.gg&&r.ggKey===r.t0+'|'+r.dur)return r.gg;
  const rnd=rngOf(r.i*733+r.lk*19+5),A=r.area,Rs=clamp(Math.sqrt(A)*.16,24*SS,80*SS);
  // pour path: serpentine rows over the zone, only points over the glue
  const rows=Math.max(1,Math.round((r.y1-r.y0)/(Rs*1.05))),pts=[];
  for(let k=0;k<rows;k++){const y=r.y0+(k+.5)*(r.y1-r.y0)/rows,row=[];for(let x=r.x0;x<=r.x1;x+=Rs*.5)if(inside(r,x,y))row.push([x,y+(rnd()-.5)*Rs*.3]);if(k%2)row.reverse();pts.push(...row)}
  if(!pts.length)pts.push([r.cx,r.cy]);
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  // one grain per flake: enough to cover the glue about twice over (half-res flake ~2.4 px)
  const fA=2.4*2.4*4,n=Math.round(clamp(A/fA*1.9,600,70000)),F=()=>new Float32Array(n);
  const G={pts,cum,len:cum[cum.length-1],Rs,n,ts:F(),tl:F(),sx:F(),sy:F(),lx:F(),ly:F(),rx:F(),ry:F(),tb:F(),bx:F(),by:F(),rot:F(),spin:F(),sc:F(),rnd:F(),fs:F(),col:new Uint8Array(n),glued:new Uint8Array(n),ord:null,dry:[]};
  const wa=rnd()*TAU,wx=Math.cos(wa),wy=Math.sin(wa);
  const sdC=r.dur*(1-r.sf),fallS=Math.min(.22,.3/Math.max(.3,sdC)),span=GL.p1-GL.p0-fallS;G.span=span;const burst=Math.max(3,Math.round(span*sdC*6));
  for(let i=0;i<n;i++){const u=(i+rnd())/n,ts=GL.p0+span*(u+.55*Math.sin(u*burst*TAU)/(burst*TAU)),p=pourAt(G,clamp((ts-GL.p0)/span,0,1));  // shaker pulses
    const sx=p[0]+(rnd()-.5)*10*SS,sy=p[1]+(rnd()-.5)*10*SS,ang=rnd()*TAU,rad=Math.sqrt(-2*Math.log(1-rnd()*.999))*Rs*.42,tf=fallS*(.8+rnd()*.4);
    const lx=sx+Math.cos(ang)*rad,ly=sy+Math.sin(ang)*rad,gl=inside(r,lx,ly)?1:0;
    G.ts[i]=ts;G.tl[i]=ts+tf;G.sx[i]=sx;G.sy[i]=sy;G.lx[i]=lx;G.ly[i]=ly;G.glued[i]=gl;G.rot[i]=rnd()*TAU;G.spin[i]=(rnd()-.5)*46;G.sc[i]=.45+rnd()*.6;G.rnd[i]=rnd();G.col[i]=Math.floor(rnd()*3);G.fs[i]=1.6+rnd()*1.6;
    if(!gl){G.dry.push(i);const hop=(3+rnd()*14)*SS;G.rx[i]=lx+Math.cos(ang)*hop;G.ry[i]=ly+Math.sin(ang)*hop;
      const ox=lx-r.cx,oy=ly-r.cy,ol=Math.hypot(ox,oy)||1,dx=wx*.7+ox/ol*.5+(rnd()-.5)*.45,dy=wy*.7+oy/ol*.5+(rnd()-.5)*.45,dl=Math.hypot(dx,dy)||1;
      G.tb[i]=Math.min(GL.b0+rnd()*(GL.b1-GL.b0)*.3,ts+tf+(.12+rnd()*.12)/Math.max(.3,sdC));G.bx[i]=dx/dl;G.by[i]=dy/dl}}
  G.ord=Array.from({length:n},(_,i)=>i).sort((a,b)=>G.tl[a]-G.tl[b]);G.maxF=fallS*1.25;
  // last settling grains: random spots on the glue
  const nt=Math.round(n*.5),tx=new Float32Array(nt),ty=new Float32Array(nt),trn=new Float32Array(nt);let k=0;
  for(let t=0;t<nt*6&&k<nt;t++){const x=r.x0+rnd()*(r.x1-r.x0),y=r.y0+rnd()*(r.y1-r.y0);if(inside(r,x,y)){tx[k]=x;ty[k]=y;trn[k]=rnd();k++}}
  G.nt=k;G.tx=tx;G.ty=ty;G.trn=trn;
  r.gg=G;r.ggKey=r.t0+'|'+r.dur;return G}
export function pourAt(G,u){const L=u*G.len,c=G.cum;let lo=0,hi=c.length-1;if(hi<=0)return G.pts[0];while(hi-lo>1){const m=(lo+hi)>>1;if(c[m]<=L)lo=m;else hi=m}
  const f=(L-c[lo])/((c[hi]-c[lo])||1);return[lerp(G.pts[lo][0],G.pts[hi][0],f),lerp(G.pts[lo][1],G.pts[hi][1],f)]}
export const GRAIN_MAX=9000;
export let grainShTex=null;
export function grainSetup(){if(!grainShTex){const g=new PIXI.Graphics();g.beginFill(0x1a1020,.55);g.drawCircle(0,0,2.4*SS);g.endFill();g.beginFill(0x1a1020,.25);g.drawCircle(0,0,3.6*SS);g.endFill();grainShTex=app.renderer.generateTexture(g);g.destroy()}
  if(!grainTex){const g=new PIXI.Graphics(),q=2.2*SS;g.beginFill(0xffffff);g.drawPolygon([q,0,q*.5,q*.87,-q*.5,q*.87,-q,0,-q*.5,-q*.87,q*.5,-q*.87]);g.endFill();grainTex=app.renderer.generateTexture(g);g.destroy()}
  if(!grainPC||grainPC.parent!==paperC){grainPC=new PIXI.ParticleContainer(GRAIN_MAX,{position:true,rotation:true,scale:true,tint:true,alpha:true});paperC.addChild(grainPC);grainPool=[];
    grainSh=new PIXI.ParticleContainer(3000,{position:true,scale:true,alpha:true});paperC.addChildAt(grainSh,paperC.getChildIndex(grainPC));grainShPool=[];
    grainUsed=0;grainShUsed=0;for(let i=0;i<3000;i++){const sp=new PIXI.Sprite(grainShTex);sp.anchor.set(.5);sp.visible=false;sp.alpha=0;sp.scale.set(0);grainSh.addChild(sp);grainShPool.push(sp)}
    for(let i=0;i<GRAIN_MAX;i++){const sp=new PIXI.Sprite(grainTex);sp.anchor.set(.5);sp.visible=false;sp.alpha=0;sp.scale.set(0);grainPC.addChild(sp);grainPool.push(sp)}}}
export function lowerTs(G,s){let lo=0,hi=G.n;while(lo<hi){const m=(lo+hi)>>1;if(G.ts[m]<s)lo=m+1;else hi=m}return lo}
export function updateParts(c,st){
  grainSetup();let used=0,shU=0;const o=plan.order;
  const fit=viewFit()*cam.z,hw=view.W*OVS/fit/2+40*SS,hh=view.H*OVS/fit/2+40*SS,cc=P2W(cam.x,cam.y);
  for(let ri=Math.max(0,cursor-2);ri<Math.min(o.length,cursor+1);ri++){const r=o[ri];if(!TOOLS[r.tool].glue)continue;const s0=r.t0+r.dur*r.sf,sd=r.dur*(1-r.sf);
    const s=(c-s0)/sd;if(s<0||s>1.02)continue;const G=glueGeo(r),cl=hex(r.color),diag=Math.hypot(seg.W,seg.H),fadeS=Math.min(.12,.22/sd);
    // flakes are mostly the ink colour, some lighter and deeper, a few silver and holographic ones
    const pal=[cl,cl,hex(lighten(r.color,.35)),hex(liqShades(r.color,r.i)[0]),0xE8EAF2,hex(lighten(r.color,.6))];
    const vis=(x,y)=>{const w=P2W(x,y);return Math.abs(w[0]-cc[0])<=hw&&Math.abs(w[1]-cc[1])<=hh};
    const put=(i,x,y,z,al,rot,str,sa)=>{if(used>=GRAIN_MAX||!vis(x,y))return;
      const sp=grainPool[used++];sp.visible=true;sp.position.set(x,y);const fl=Math.pow(Math.abs(Math.sin(rot*1.7+G.rnd[i]*6)),12),sc=G.sc[i]*(1+z*1.4);
      if(str>1.05){sp.rotation=sa;sp.scale.set(sc*str*.6,sc*.55)}else{sp.rotation=rot;sp.scale.set(sc*(.3+.7*Math.abs(Math.cos(rot*1.3))),sc)}
      sp.tint=fl>.5?0xffffff:pal[(G.col[i]+(G.rnd[i]>.82?3:0))%pal.length];sp.alpha=al*(.78+.22*fl)};
    const shadow=(x,y,z)=>{if(shU>=grainShPool.length)return;const sp=grainShPool[shU++];sp.visible=true;sp.position.set(x+z*16*SS,y+z*22*SS);sp.scale.set(.6+z*1.1);sp.alpha=.13*(1-z*.8)};
    // falling grains (gravity: height drops with t²), a soft shadow converging under them, fast ones drawn as short streaks
    const i0=lowerTs(G,s-G.maxF-fadeS),i1=lowerTs(G,s);
    for(let i=i0;i<i1;i++){const tl=G.tl[i];
      if(s<tl){const T=tl-G.ts[i],u=(s-G.ts[i])/T,x=lerp(G.sx[i],G.lx[i],u),y=lerp(G.sy[i],G.ly[i],u),z=1-u*u,str=1+u*2.2;
        put(i,x,y,z,1,G.rot[i]+G.spin[i]*u*T*sd,u>.35?str:1,Math.atan2(G.ly[i]-G.sy[i],G.lx[i]-G.sx[i]));if((i%7)===0&&vis(x,y))shadow(lerp(G.sx[i],G.lx[i],Math.min(1,u+.15)),lerp(G.sy[i],G.ly[i],Math.min(1,u+.15)),z)}
      else if(G.glued[i]){const a=(s-tl)/fadeS;if(a<1)put(i,G.lx[i],G.ly[i],0,(1-a)*(1-a),G.rot[i]+G.spin[i]*(tl-G.ts[i])*sd,1,0)}}
    // loose grains on dry paper: bounce, rest, then the gust blows every one of them off the page
    const Tb=Math.max(.05,Math.min(.35,(GL.b1-GL.b0)*.6*sd)),acc=2*diag*1.8/(Tb*Tb);
    for(const i of G.dry){const tl=G.tl[i];if(s<tl)continue;const hb=Math.min(1,(s-tl)*sd/.09);let x=lerp(G.lx[i],G.rx[i],hb),y=lerp(G.ly[i],G.ry[i],hb)-Math.sin(Math.PI*hb)*5*SS,z=0,rot=G.rot[i]+G.spin[i]*.3*hb;
      if(s>G.tb[i]){const tau=(s-G.tb[i])*sd,d=.5*acc*tau*tau;x+=G.bx[i]*d+Math.sin(tau*16+i)*30*SS*Math.min(1,tau*5);y+=G.by[i]*d-d*.12;z=Math.min(.7,tau*4);rot+=tau*40*(G.rnd[i]-.5);
        if(d>diag*.9)continue}
      put(i,x,y,z,1,rot,1,0)}}
  for(let i=used;i<grainUsed;i++){const sp=grainPool[i];sp.visible=false;sp.alpha=0;sp.scale.set(0)}grainUsed=used;
  for(let i=shU;i<grainShUsed;i++){const sp=grainShPool[i];sp.visible=false;sp.alpha=0;sp.scale.set(0)}grainShUsed=shU}
export function resetGrains(){grainPC=null}
export function hideGrains(){if(!grainPC)return;grainPool.forEach(p=>{p.visible=false;p.alpha=0});grainShPool.forEach(p=>{p.visible=false;p.alpha=0});grainUsed=grainShUsed=0}
