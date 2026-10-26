import {addonFocus} from '../addons/registry.js';
import {flyPose,paperRot,plan,viewFit} from '../core/plan.js';
import {S,TOOLS,view} from '../core/settings.js';
import {STROKE,legPt} from '../core/strokes.js';
import {SS,TAU,clamp,ease3,lerp,smooth} from '../core/utils.js';
import {inkPen} from '../core/inking.js';
import {seg} from '../core/zones.js';
import {GL,glueGeo,pourAt} from './glitter.js';
import {liqPenColor} from './liquid.js';
import {legAt} from './paint.js';
import {TOOL_LEN} from './toolSprites.js';
/* ================= PEN & CAMERA ================= */
export function regionPoint(r,p){if(p>=1){const l=r.legs[r.legs.length-1];return{x:l.p1[0],y:l.p1[1],kind:'end',k:r.legs.length}}const{k,f}=legAt(r,p);const l=r.legs[k];const q=legPt(l,f);return{x:q[0],y:q[1],kind:l.kind,k,f}}
/* where a painter stands for leg l at fraction f: carried between the two stands on a walking leg */
function standAt(l,f){if(!l)return undefined;if(!l.st0||f==null)return l.st;return[lerp(l.st0[0],l.st[0],f),lerp(l.st0[1],l.st[1],f)]}
/* how high the tool is above the paper: it lifts and lands smoothly over a lifted move ('jump') instead of popping up
   and down at its ends (that made the tool, its tilt and its shadow twitch for a frame, e.g. as a new zone began) */
function hoverOf(q){const f=clamp(q.f==null?.5:q.f,0,1);return q.kind==='jump'?.35*Math.pow(Math.sin(Math.PI*f),.6):q.kind==='pause'?.07*Math.min(1,f*5,(1-f)*5):0}
/* where painter k (0 = the lead one) has its tool at plan time c */
export function penState(c,k){
  const o=plan.tracks?plan.tracks[k||0]||[]:plan.order,W=seg.W,H=seg.H,off={x:W*1.15,y:H*1.12};
  if(!o.length)return{x:off.x,y:off.y,h:1,color:'#888',kind:'air',lid:-1};
  const first=o[0],I=!k&&plan.ink;
  // inking the lines first: the black tool, then over to the first zone, swapping the tool on the way
  if(I&&c<first.t0){const q=inkPen(I,c,S.introWide!==false);if(q)return q;
    const s=first.legs[0].p0,u=smooth(clamp((c-I.c1)/Math.max(.05,first.t0-I.c1),0,1));
    return{x:lerp(I.end[0],s[0],u),y:lerp(I.end[1],s[1],u),h:Math.pow(Math.sin(Math.PI*u),.7),color:u<.5?I.color:first.color,kind:'air',lid:-1,tool:u<.5?I.tool:first.tool,ink:u<.5}}
  if(c<first.t0){const s=first.legs[0].p0;const u=STROKE.reach>0||S.introWide===false?1:smooth(clamp((c-.3)/(first.t0-.3),0,1));const h=1-smooth(clamp((c-(first.t0-.35))/.35,0,1));return{x:lerp(off.x,s[0],u),y:lerp(off.y,s[1],u),h:Math.max(h,0),color:first.color,kind:'air',lid:-1,tool:first.tool}}
  let lo=0,hi=o.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(o[m].t0-o[m].travel<=c)lo=m;else hi=m-1}
  const r=o[lo];
  if(c<r.t0&&lo>0){const pr=o[lo-1],e=pr.legs[pr.legs.length-1].p1,s=r.legs[0].p0,t1r=Math.min(pr.t1+(r.rest||0)+(r.wait||0),r.t0-.05);
    // a rest (yawn and stretch) and/or waiting for another painter to move on: the tool stays where the last zone ended
    if(c<t1r&&(r.rest||r.wait))return{x:e[0],y:e[1],h:.07,color:pr.color,kind:'pause',lid:-1,tool:pr.tool,rest:c<pr.t1+(r.rest||0)};
    const u=clamp((c-t1r)/(r.t0-t1r),0,1);const e2=S.human?ease3(u):smooth(u);
    let x=lerp(e[0],s[0],e2),y=lerp(e[1],s[1],e2);
    if(S.human){const dx=s[0]-e[0],dy=s[1]-e[1],L=Math.hypot(dx,dy)||1;const Hh=S.hum,arc=Math.sin(Math.PI*u)*Math.min(L*.18,120*SS)*(.4+Hh.jitter*1.3);x+=-dy/L*arc;y+=dx/L*arc;
      if(u>.7){const hv=(u-.7)/.3;x+=Math.sin(hv*TAU*1.5)*8*SS*(1-hv)*(.3+Hh.pauses*1.8);y+=Math.cos(hv*TAU*1.5)*6*SS*(1-hv)*(.3+Hh.pauses*1.8)}}
    // (a short hop between nearby zones only lifts the tool a little, a long move lifts it fully)
    return{x,y,h:Math.pow(Math.sin(Math.PI*u),.7)*clamp((r.t0-t1r)/.6,.25,1),color:u<.5?pr.color:r.color,kind:'air',lid:-1,tool:u<.5?pr.tool:r.tool,tf:u}}
  if(c<=r.t1){const SD=r.dur*r.sf,pp=(c-r.t0)/SD;
    if(pp>1&&r.sf<1){const s=clamp((c-r.t0-SD)/(r.dur*(1-r.sf)),0,1),e=r.legs[r.legs.length-1].p1,G=glueGeo(r);let q;
      if(s<GL.p0)q=(()=>{const a=pourAt(G,0),u=smooth(s/GL.p0);return[lerp(e[0],a[0],u),lerp(e[1],a[1],u)]})();else q=pourAt(G,clamp((s-GL.p0)/G.span,0,1));
      return{x:q[0],y:q[1],h:1,color:r.color,kind:'air',lid:-1,tool:r.tool,jar:s,jr:r}}
    const q=regionPoint(r,pp);return{x:q.x,y:q.y,h:hoverOf(q),kind:q.kind,lid:lo*100000+q.k,tool:r.tool,stand:standAt(r.legs[q.k],q.f),tf:q.kind==='jump'&&r.legs[q.k]&&r.legs[q.k].st0?q.f:undefined,rest:!!(r.legs[q.k]&&r.legs[q.k].rest),drop:!!(r.legs[q.k]&&r.legs[q.k].drop),color:TOOLS[r.tool].fluid?liqPenColor(r,pp):r.color}}
  const e=r.legs[r.legs.length-1].p1;const u=STROKE.reach>0?0:smooth(clamp((c-r.t1-.25)/1.4,0,1));const h=smooth(clamp((c-r.t1)/.3,0,1));return{x:lerp(e[0],off.x*1.1,u),y:lerp(e[1],off.y*1.1,u),h,color:r.color,kind:'air',lid:-1,tool:r.tool};
}
export const cam={x:0,y:0,z:1,ax:0,ay:0,shot:-1,vx:0,vy:0,lastCut:-9,lastTrans:'cut',whip:null,leak:false,leakPos:[0,0],leakHue:0};
export function shotIndex(c){const s=plan.shots;let k=0;for(let i=0;i<s.length;i++)if(s[i].ts<=c)k=i;return k}
export function clampCenter(x,y,z){const s=viewFit()*z;const hw=view.W/s/2,hh=view.H/s/2;const pad=seg.W*.05;const minx=-pad+hw,maxx=seg.W+pad-hw,miny=-pad+hh,maxy=seg.H+pad-hh;
  return[minx>maxx?seg.W/2:clamp(x,minx,maxx),miny>maxy?seg.H/2:clamp(y,miny,maxy)]}
export function camTarget(sh){const tx=sh.cx+(cam.ax-sh.cx)*sh.follow,ty=sh.cy+(cam.ay-sh.cy)*sh.follow;return clampCenter(tx,ty,sh.z)}
export function camInit(){cam.fax=null;cam.fay=null;cam.fy=.5;cam.fyv=0;cam.phase=0;cam.rv=null;cam.rz=null;cam.shot=-1;cam.nib=false;cam.whip=null;cam.lastCut=-9;camStep(0,0)}
/* tilt-shift focus: follows a slow average of where the tool works, through a critically damped spring,
   so it settles calmly instead of jumping with every stroke; on a cut it lands with a short rack-focus */
export function camFocus(c,dt,snap){const W=seg.W,H=seg.H,pr=S.human?paperRot(c):0,cs=Math.cos(pr),sn=Math.sin(pr),Y=(x,y)=>H/2+(x-W/2)*sn+(y-H/2)*cs;
  const fit=viewFit()*cam.z,tgt=clamp((Y(cam.fax,cam.fay)-Y(cam.x,cam.y))*fit/view.H+.5,.14,.86);
  if(snap||dt<=0){cam.fy=snap==="rack"?clamp(tgt+(tgt<.5?.07:-.07),.1,.9):tgt;cam.fyv=0;return}
  const w=3.4,a=w*w*(tgt-cam.fy)-2*w*cam.fyv;cam.fyv+=a*dt;cam.fy+=cam.fyv*dt}
/* "nib" camera: a macro shot that keeps the tip at a fixed spot of the frame, zoomed so the frame edge cuts the tool
   in half: only the working end is ever visible. Returns the camera centre (page space) and zoom for a pen state. */
export const NIB={ax:.42,ay:.4};
/* page point → camera target in world space (the paper may be turned) */
function pageTarget(q,c){const pr=S.human?paperRot(c):0,cx=seg.W/2,cy=seg.H/2,cs=Math.cos(pr),sn=Math.sin(pr);return[cx+(q[0]-cx)*cs-(q[1]-cy)*sn,cy+(q[0]-cx)*sn+(q[1]-cy)*cs,q[2]]}
export function nibTarget(st,c){const pr=S.human?paperRot(c):0,cx=seg.W/2,cy=seg.H/2,cs=Math.cos(pr),sn=Math.sin(pr);
  const wx=cx+(st.x-cx)*cs-(st.y-cy)*sn,wy=cy+(st.x-cx)*sn+(st.y-cy)*cs;
  const pp=S.fx.persp.on?S.fx.persp.v:0,a=.64-(.08+.42*pp)*.55;
  const d=Math.min((1-NIB.ax)*view.W/Math.max(.05,Math.cos(a)),(1-NIB.ay)*view.H/Math.max(.05,Math.sin(a)));
  const half=(TOOL_LEN[st.tool||S.tool]||560)*SS*.5,z=clamp(d/half/viewFit(),1.2,6),f=viewFit()*z;
  const dx=wx-(NIB.ax-.5)*view.W/f-cx,dy=wy-(NIB.ay-.5)*view.H/f-cy;
  return[cx+dx*cs+dy*sn,cy-dx*sn+dy*cs,z]}
export function camStep(v,dt){
  const c=plan.cOf(v),st=penState(c),k=shotIndex(c),sh=plan.shots[k];
  const px=cam.x,py=cam.y;
  if(sh.fly){let fresh=false;if(k!==cam.shot){const was=cam.shot;cam.shot=k;fresh=true;cam.lastCut=v;cam.lastTrans=was<0?'start':'cut';cam.leak=!!sh.leak;cam.leakPos=sh.leakPos;cam.leakHue=sh.leakHue;cam.whip=null}
    const u=clamp((c-sh.ts)/sh.dur,0,1),e=u*.7+.3*smooth(u),p=flyPose(sh,e);cam.x=p[0];cam.y=p[1];cam.z=p[2];cam.ax=cam.x;cam.ay=cam.y;
    if(fresh||dt<=0){cam.vx=0;cam.vy=0}else{cam.vx=(cam.x-px)/dt;cam.vy=(cam.y-py)/dt}return}
  const camT=S.camMode==='cat'&&!(plan.ink&&c<plan.ink.c1+.4)?addonFocus(c):null;
  if((S.camMode==='nib'||S.camMode==='cat')&&!sh.intro&&!sh.outro){const T=camT?pageTarget(camT,c):nibTarget(st,c),was=cam.shot,fresh=!cam.nib||dt<=0||(k!==was&&sh.cutTs!=null)||(camT&&Math.hypot(T[0]-cam.x,T[1]-cam.y)*viewFit()*cam.z>view.W*.2);cam.nib=true;cam.shot=k;cam.ax=st.x;cam.ay=st.y;
    // focus: the nib camera focuses the tip; the cat camera the cat it films (the frame centre), not the tool below it
    const FX=camT?camT[0]:st.x,FY=camT?camT[1]:st.y;
    if(fresh){cam.x=T[0];cam.y=T[1];cam.z=T[2];cam.vx=cam.vy=0;cam.whip=null;cam.lastCut=v;cam.lastTrans=was<0?'start':'cut';cam.fax=FX;cam.fay=FY;camFocus(c,0,was<0?true:'rack');return}
    const kp=camT?1:1-Math.exp(-7*dt),kz=camT?1:1-Math.exp(-2.5*dt),kf=1-Math.exp(-4*dt);cam.x+=(T[0]-cam.x)*kp;cam.y+=(T[1]-cam.y)*kp;cam.z+=(T[2]-cam.z)*kz;
    cam.fax+=(FX-cam.fax)*kf;cam.fay+=(FY-cam.fay)*kf;cam.vx=(cam.x-px)/dt;cam.vy=(cam.y-py)/dt;camFocus(c,dt,false);return}
  cam.nib=false;
  if(k!==cam.shot){const was=cam.shot;cam.shot=k;
    if(sh.trans!=='glide'||was<0){
      const onP=st.x>=0&&st.y>=0&&st.x<=seg.W&&st.y<=seg.H,ax=onP?st.x:sh.cx,ay=onP?st.y:sh.cy;cam.ax=ax;cam.ay=ay;cam.fax=ax;cam.fay=ay;const t=camTarget(sh);
      if(sh.trans==='whip'&&was>=0&&dt>0){cam.whip={v0:v,fx:cam.x,fy:cam.y,fz:cam.z,dur:.34}}
      else{cam.x=t[0];cam.y=t[1];cam.z=sh.liq?sh.z*1.22:sh.z*(sh.intro?.95:.92);cam.whip=null}
      cam.lastCut=v;cam.lastTrans=was<0?'start':sh.trans;cam.leak=!!sh.leak;cam.leakPos=sh.leakPos||[0,0];cam.leakHue=sh.leakHue||0;
      cam.vx=0;cam.vy=0;camFocus(c,0,was<0?true:'rack');if(!cam.whip)return}
  }
  const ka=1-Math.exp(-1.7*dt);cam.ax+=(st.x-cam.ax)*ka;cam.ay+=(st.y-cam.ay)*ka;
  if(cam.fax==null){cam.fax=st.x;cam.fay=st.y}const kf=1-Math.exp(-1.6*dt);cam.fax+=(st.x-cam.fax)*kf;cam.fay+=(st.y-cam.fay)*kf;
  const t=camTarget(sh);
  if(cam.whip){const w=cam.whip,u=clamp((v-w.v0)/w.dur,0,1),e=ease3(u);cam.x=lerp(w.fx,t[0],e);cam.y=lerp(w.fy,t[1],e);cam.z=lerp(w.fz,sh.z*.96,e);if(u>=1)cam.whip=null}
  else{const kp=1-Math.exp(-sh.rate*dt),zt=sh.liq?sh.z*(1.22-.3*smooth(clamp((c-sh.liq.t0)/(sh.liq.t1-sh.liq.t0+.8),0,1))):sh.z,kz=1-Math.exp(-(sh.liq?.9:sh.zrate)*dt);cam.x+=(t[0]-cam.x)*kp;cam.y+=(t[1]-cam.y)*kp;cam.z+=(zt-cam.z)*kz}
  if(dt>0){const nvx=(cam.x-px)/dt,nvy=(cam.y-py)/dt;cam.vx=nvx;cam.vy=nvy}
  camFocus(c,dt,false);
}
export let PR=0;
export function P2W(x,y){if(!PR)return[x,y];const cx=seg.W/2,cy=seg.H/2,c=Math.cos(PR),s=Math.sin(PR),dx=x-cx,dy=y-cy;return[cx+dx*c-dy*s,cy+dx*s+dy*c]}
export function setPR(v){PR=v}
