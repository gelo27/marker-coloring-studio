import {planVer} from '../core/plan.js';
import {FLQ,TOOLS} from '../core/settings.js';
import {TAU,clamp,hex,lerp,mk,rngOf,smooth,vnA,vnoise} from '../core/utils.js';
import {liqShades} from '../core/zones.js';
import {regionPoint} from './camera.js';
import {ensureTmp,regionMask,tmpCtx,tmpCv} from './paint.js';
/* ================= LIQUID: stable-fluids ink poured into each zone =================
   A small Navier–Stokes grid (semi-Lagrangian advection, pressure projection, vorticity confinement) lives inside the
   zone's mask. The dropper injects dye and pushes the liquid as it moves, so the colour swirls and creeps outward;
   at the end the ink floods the rest of the zone and settles into one even, permanent colour. No glow, no fading. */
/* which ink the dropper carries at progress p (0..1) */
export function liqPhase(p){const m=FLQ.mix;return m>=3?(p<.42?0:p<.72?1:2):m===2?(p<.5?0:p<.8?1:0):0}
export function liqPenColor(r,p){const k=liqPhase(p);if(!k)return r.color;const sh=liqShades(r.color,r.i);return sh[k-1]}
export const FL_DT=1/60,FLCACHE=new Map();
export function fluidInit(r){
  regionMask(r);const res=FLQ.res,bw=r.bw,bh=r.bh,cs=Math.max(1.5,Math.max(bw,bh)/res),gw=Math.ceil(bw/cs)+2,gh=Math.ceil(bh/cs)+2,N=gw*gh;
  const md=r.maskCv.getContext('2d').getImageData(0,0,bw,bh).data,f=new Uint8Array(N);let nf=0;
  for(let gy=1;gy<gh-1;gy++)for(let gx=1;gx<gw-1;gx++){let hit=0;for(const[ox,oy]of[[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){const x=Math.min(bw-1,Math.floor((gx-1+ox)*cs)),y=Math.min(bh-1,Math.floor((gy-1+oy)*cs));if(md[(y*bw+x)*4+3]>127)hit++}
    if(hit>=2){f[gy*gw+gx]=1;nf++}}
  const ring=[];for(let k=0;k<N;k++){if(f[k])continue;const x=k%gw,y=(k/gw)|0,nb=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=gw||Y>=gh)continue;if(f[Y*gw+X])nb.push(Y*gw+X)}if(nb.length)ring.push([k,nb])}
  // distance to the zone's edge (in cells), for the dried watercolour rim
  const ed=new Float32Array(N);for(let k=0;k<N;k++)ed[k]=f[k]?1e9:0;
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(f[k])ed[k]=Math.min(ed[k],ed[k-1]+1,ed[k-gw]+1,ed[k-gw-1]+1.414,ed[k-gw+1]+1.414)}
  for(let y=gh-2;y>=1;y--)for(let x=gw-2;x>=1;x--){const k=y*gw+x;if(f[k])ed[k]=Math.min(ed[k],ed[k+1]+1,ed[k+gw]+1,ed[k+gw+1]+1.414,ed[k+gw-1]+1.414)}
  const cv=mk(gw,gh),cx=cv.getContext('2d'),A=()=>new Float32Array(N),n=hex(r.color),gr=A(),sc=.06*140/res;
  for(let k=0;k<N;k++){const x=k%gw,y=(k/gw)|0;gr[k]=vnoise(x*sc*4.3+r.i,y*sc*4.3)*.6+vnoise(x*sc*11+3,y*sc*11+r.i)*.4}
  const sh=liqShades(r.color,r.i).map(hex),C=x=>[(x>>16)&255,(x>>8)&255,x&255];
  // watercolour blooms that open up while it dries: lighter cauliflower patches with a deeper frilly edge
  const rb=rngOf(r.i*313+r.lk*7+11),blooms=[];if(FLQ.blooms){const want=nf>4000?(rb()<.85?1+Math.floor(rb()*2.4):0):nf>900?(rb()<.6?1:0):0;
    for(let j=0,tries=0;j<want&&tries<200;tries++){const k=Math.floor(rb()*N);if(!f[k]||ed[k]<4)continue;const R=Math.min(ed[k]*1.6,Math.sqrt(nf)*(.12+.12*rb()));if(R<3)continue;blooms.push({x:k%gw,y:(k/gw)|0,R,ph:rb()*TAU,del:rb()*.35});j++}}
  const wc=mk(gw,gh),wx=wc.getContext('2d');
  return{gw,gh,cs,N,f,nf,ring,ed,gr,blooms,u:A(),v:A(),u2:A(),v2:A(),d:A(),d2:A(),p:A(),dv:A(),w:A(),tb:A(),tc:A(),tb2:A(),tc2:A(),t:r.t0,lx:null,ly:null,cv,cx,img:cx.createImageData(gw,gh),
    wc,wx,wimg:wx.createImageData(gw,gh),col:C(n),colB:C(sh[0]),colC:C(sh[1]),kr:140/res,sat:[]}
}
export function flSample(F,a,x,y,fluidOnly){const gw=F.gw,gh=F.gh;x=clamp(x,.5,gw-1.5);y=clamp(y,.5,gh-1.5);const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,k=y0*gw+x0;
  const w00=(1-fx)*(1-fy),w10=fx*(1-fy),w01=(1-fx)*fy,w11=fx*fy;
  if(!fluidOnly)return a[k]*w00+a[k+1]*w10+a[k+gw]*w01+a[k+gw+1]*w11;
  const f=F.f,ws=w00*f[k]+w10*f[k+1]+w01*f[k+gw]+w11*f[k+gw+1];if(ws<1e-4)return 0;
  return(a[k]*w00*f[k]+a[k+1]*w10*f[k+1]+a[k+gw]*w01*f[k+gw]+a[k+gw+1]*w11*f[k+gw+1])/ws}
export function fluidStep(F,r,c,pen,flood){
  const{gw,gh,N,f,u,v,d}=F,dt=FL_DT,ik=1/F.kr;
  // the dropper: dye + push along its motion + a gentle outward pour
  if(pen){const gx=pen.x/F.cs+1,gy=pen.y/F.cs+1,R=Math.max(1.4,r.w*1.05/F.cs),R2=R*R,vx=F.lx==null?0:(gx-F.lx)/dt,vy=F.ly==null?0:(gy-F.ly)/dt;F.lx=gx;F.ly=gy;
    F.inj=.45+1.1*vnA(c*3.7+r.i*.71);const sp=Math.hypot(vx,vy),lim=60*ik,kx=sp>lim?vx*lim/sp:vx,ky=sp>lim?vy*lim/sp:vy,ri=Math.ceil(R*2.6);
    for(let y=Math.max(1,Math.floor(gy-ri));y<=Math.min(gh-2,Math.ceil(gy+ri));y++)for(let x=Math.max(1,Math.floor(gx-ri));x<=Math.min(gw-2,Math.ceil(gx+ri));x++){const k=y*gw+x;if(!f[k])continue;
      const dx=x-gx,dy=y-gy,q=dx*dx+dy*dy,g=Math.exp(-q/R2);if(g<.004)continue;const L=Math.sqrt(q)+.6;
      const add=Math.min(1.7,d[k]+g*dt*7.5*F.inj)-d[k],nd=d[k]+add;if(nd>1e-4){const w0=d[k]/nd,w1=add/nd;F.tb[k]=F.tb[k]*w0+(pen.ink===1?w1:0);F.tc[k]=F.tc[k]*w0+(pen.ink===2?w1:0)}
      d[k]=nd;u[k]+=g*(kx*.85+dx/L*1.3*ik);v[k]+=g*(ky*.85+dy/L*1.3*ik)}}
  else{F.lx=F.ly=null}
  // the drop lands: a crown ring of ink and a few satellite droplets
  if(FLQ.drops&&F.drop){const D=F.drop,a=c-D.t;
    // impact: a blob of ink with an outward burst of motion (the crown), then satellite droplets settle around it
    if(a>=0&&a<.05){const R=D.R*1.6,R2=R*R,ri=Math.ceil(R*3);for(let y=Math.max(1,Math.floor(D.y-ri));y<=Math.min(gh-2,Math.ceil(D.y+ri));y++)for(let x=Math.max(1,Math.floor(D.x-ri));x<=Math.min(gw-2,Math.ceil(D.x+ri));x++){const k=y*gw+x;if(!f[k])continue;
        const dx=x-D.x,dy=y-D.y,q=dx*dx+dy*dy,g=Math.exp(-q/R2);if(g<.01)continue;d[k]=Math.min(1.7,d[k]+g*dt*26);const L=Math.sqrt(q)+.6,gg=Math.exp(-q/(R2*2.2));u[k]+=gg*dx/L*D.R*14;v[k]+=gg*dy/L*D.R*14}}
    if(!D.sat&&a>.06){D.sat=true;for(const st of D.sats){const rr=st[2],ri=Math.ceil(rr*2.6);for(let y=Math.max(1,Math.round(st[1])-ri);y<=Math.min(gh-2,Math.round(st[1])+ri);y++)for(let x=Math.max(1,Math.round(st[0])-ri);x<=Math.min(gw-2,Math.round(st[0])+ri);x++){const k=y*gw+x;if(!f[k])continue;
      const g=Math.exp(-((x-st[0])**2+(y-st[1])**2)/(rr*rr));if(g<.02)continue;d[k]=Math.min(1.5,d[k]+g)}}}}
  // vorticity confinement: keeps little swirls alive
  const w=F.w;for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;w[k]=f[k]?.5*((v[k+1]-v[k-1])-(u[k+gw]-u[k-gw])):0}
  const eps=34;for(let y=2;y<gh-2;y++)for(let x=2;x<gw-2;x++){const k=y*gw+x;if(!f[k])continue;const nx=Math.abs(w[k+1])-Math.abs(w[k-1]),ny=Math.abs(w[k+gw])-Math.abs(w[k-gw]),l=Math.hypot(nx,ny)+1e-5;
    u[k]+=dt*eps*(ny/l)*w[k];v[k]-=dt*eps*(nx/l)*w[k]}
  const u2=F.u2,v2=F.v2;for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!f[k]){u2[k]=v2[k]=0;continue}const bx=x-dt*u[k],by=y-dt*v[k];u2[k]=flSample(F,u,bx,by)*.988;v2[k]=flSample(F,v,bx,by)*.988}
  F.u=u2;F.v=v2;F.u2=u;F.v2=v;
  const U=F.u,V=F.v,p=F.p,dv=F.dv;
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!f[k]){dv[k]=0;continue}const uR=f[k+1]?U[k+1]:0,uL=f[k-1]?U[k-1]:0,vD=f[k+gw]?V[k+gw]:0,vU=f[k-gw]?V[k-gw]:0;dv[k]=-.5*(uR-uL+vD-vU)}
  for(let it=0;it<18;it++)for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!f[k])continue;const pk=p[k];
    p[k]=(dv[k]+(f[k+1]?p[k+1]:pk)+(f[k-1]?p[k-1]:pk)+(f[k+gw]?p[k+gw]:pk)+(f[k-gw]?p[k-gw]:pk))/4}
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!f[k])continue;const pk=p[k];U[k]-=.5*((f[k+1]?p[k+1]:pk)-(f[k-1]?p[k-1]:pk));V[k]-=.5*((f[k+gw]?p[k+gw]:pk)-(f[k-gw]?p[k-gw]:pk))}
  const d2=F.d2,tb2=F.tb2,tc2=F.tc2;for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!f[k]){d2[k]=0;continue}const bx=x-dt*U[k],by=y-dt*V[k];d2[k]=flSample(F,d,bx,by,true);tb2[k]=flSample(F,F.tb,bx,by,true);tc2[k]=flSample(F,F.tc,bx,by,true)}
  {const t1=F.tb;F.tb=tb2;F.tb2=t1;const t2=F.tc;F.tc=tc2;F.tc2=t2}const TB=F.tb,TC=F.tc;
  // ink creeps outward from wet areas (capillary spreading) and, at the end, floods the zone; rates follow the grid size
  const kr=F.kr,df=1-Math.pow(1-.07,kr),c1=1-Math.pow(1-(.035+flood*.32),kr),c2=1-Math.pow(1-flood*.012,kr);
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!f[k]){d[k]=0;continue}let s=0,n=0;if(f[k+1]){s+=d2[k+1];n++}if(f[k-1]){s+=d2[k-1];n++}if(f[k+gw]){s+=d2[k+gw];n++}if(f[k-gw]){s+=d2[k-gw];n++}
    let val=n?d2[k]+(s/n-d2[k])*df:d2[k];
    if(n&&val<1){let mx=0,mk2=k;for(const q of[k+1,k-1,k+gw,k-gw])if(f[q]&&d2[q]>mx){mx=d2[q];mk2=q}
      // along the line the liquid races ahead in little tongues (capillary fingers), then they merge
      if(mx>.45){const fk=F.ed[k]<2.6?Math.min(.9,c1*(1.2+(F.gr[k]>.52?3.2:.3))):c1,nv=val+(mx-val)*fk,wq=(nv-val)/Math.max(nv,1e-3);TB[k]+=(TB[mk2]-TB[k])*wq;TC[k]+=(TC[mk2]-TC[k])*wq;val=nv}}
    if(flood>0)val+=(1-val)*c2;d[k]=val}
}
/* live look while wet (flow, fronts, depth) blended into the dried look: a liquid-watercolour pattern that stays —
   deeper pigment where the ink pooled, paler where it thinned, a darker rim where it dried against the line, soft granulation */
export function fluidRender(F,r,settle){
  const{gw,f,d,img,ed,gr}=F,D=img.data,c=F.col,W=F.w,kr=FLQ.res/140;
  for(let k=0;k<F.N;k++){const i=k*4;if(!f[k]){D[i+3]=0;continue}
    const x=d[k],a=smooth(clamp(x*1.25,0,1)),gx=(f[k+1]?d[k+1]:x)-(f[k-1]?d[k-1]:x),gy=(f[k+gw]?d[k+gw]:x)-(f[k-gw]?d[k-gw]:x),edge=clamp(Math.hypot(gx,gy)*1.7*kr,0,1);
    const wet=clamp(x-.8,0,.7)*.5+edge*.55+clamp(Math.abs(W[k])*.006,0,.1);
    const xd=clamp(x,.55,1.6),rim=Math.exp(-ed[k]/(2.2*kr))*.42,dry=clamp(xd-1,0,.6)*.75+rim+(gr[k]-.5)*.18,lt=clamp(1-xd,0,.45)*.7*(1-rim);
    let bl=0,bring=0;if(F.blooms.length&&settle>0){const x0=k%gw,y0=(k/gw)|0;for(const B of F.blooms){const g=clamp((settle-B.del)/(1-B.del),0,1);if(g<=0)continue;const dx=x0-B.x,dy=y0-B.y,an=Math.atan2(dy,dx);
        const Rb=B.R*Math.sqrt(g)*(1+.18*Math.sin(an*5+B.ph)+.1*Math.sin(an*11+B.ph*2)+.12*(gr[k]-.5)),q=Math.hypot(dx,dy)/Math.max(.5,Rb);if(q<1)bl=Math.max(bl,smooth(clamp((1-q)/.35,0,1)));bring=Math.max(bring,Math.exp(-Math.pow((q-1)/.09,2))*g)}}
    const tb=clamp(F.tb[k],0,1),tc=clamp(F.tc[k],0,1-tb),ta=1-tb-tc,cb=F.colB,cc=F.colC,R0=c[0]*ta+cb[0]*tb+cc[0]*tc,G0=c[1]*ta+cb[1]*tb+cc[1]*tc,B0=c[2]*ta+cb[2]*tb+cc[2]*tc;
    const dark=lerp(wet,dry,settle)+bring*.32*settle-bl*.1,e=1+dark*1.6,l2=lt*settle+bl*.26*settle;
    D[i]=255*lerp(Math.pow(R0/255,e),1,l2);D[i+1]=255*lerp(Math.pow(G0/255,e),1,l2);D[i+2]=255*lerp(Math.pow(B0/255,e),1,l2);D[i+3]=255*lerp(a,1,settle)}
  {const WD=F.wimg.data;for(let k=0;k<F.N;k++){const i=k*4;WD[i]=WD[i+1]=WD[i+2]=255;WD[i+3]=f[k]?255*smooth(clamp(d[k]*1.3,0,1))*(1-settle):0}F.wx.putImageData(F.wimg,0,0)}
  for(const[k,nb]of F.ring){let s0=0,s1=0,s2=0,s3=0;for(const q of nb){s0+=D[q*4];s1+=D[q*4+1];s2+=D[q*4+2];s3+=D[q*4+3]}const n=nb.length,i=k*4;D[i]=s0/n;D[i+1]=s1/n;D[i+2]=s2/n;D[i+3]=s3/n}
  F.cx.putImageData(img,0,0)}
export function fluidKey(r){return[r.i,r.lk,r.color,FLQ.res,FLQ.mix,FLQ.blooms,FLQ.drops,planVer,r.t0.toFixed(3),r.dur.toFixed(3)].join('|')}
export function fluidPrep(F,r){const l=r.legs[0];if(!l)return F;const x=(l.p0[0]-r.bx)/F.cs+1,y=(l.p0[1]-r.by)/F.cs+1,R=Math.max(1.4,r.w*.7/F.cs),q=rngOf(r.i*71+3),sats=[];
  for(let j=0;j<6;j++){const a=q()*TAU,dd=R*(3+q()*2.5);sats.push([x+Math.cos(a)*dd,y+Math.sin(a)*dd,Math.max(.8,R*(.25+q()*.3))])}F.drop={t:r.t0,x,y,R,sats,sat:false};return F}
export function fluidRun(r,F,c){const SD=r.dur*(r.sf||1),tEnd=r.t0+SD,T=TOOLS[r.tool];let guard=0;
  while(F.t+FL_DT<=c&&guard++<6000){F.t+=FL_DT;const p=(F.t-r.t0)/SD;let pen=null;
    if(p<=1){const q=regionPoint(r,clamp(p,0,1));if(q.kind!=='jump'&&q.kind!=='pause')pen={x:q.x-r.bx,y:q.y-r.by,ink:liqPhase(p)}}
    const flood=smooth(clamp((p-.72)/.28,0,1))*.6+smooth(clamp((F.t-tEnd)/T.dry,0,1))*.4;fluidStep(F,r,F.t,pen,flood)}}
export function fluidBlit(r,F,settle,mask){
  tmpCtx.imageSmoothingEnabled=true;tmpCtx.imageSmoothingQuality='high';tmpCtx.drawImage(F.cv,1,1,F.gw-2,F.gh-2,0,0,(F.gw-2)*F.cs,(F.gh-2)*F.cs);
  if(settle>=1){tmpCtx.globalCompositeOperation='destination-over';tmpCtx.fillStyle=r.color;tmpCtx.fillRect(0,0,r.bw,r.bh);tmpCtx.globalCompositeOperation='source-over'}
  tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(mask,0,0);tmpCtx.globalCompositeOperation='source-over'}
export function fluidLayer(r,c){
  const T=TOOLS[r.tool],SD=r.dur*(r.sf||1),tEnd=r.t0+SD,mask=regionMask(r);
  ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);
  const key=fluidKey(r);
  if(c>=tEnd+T.dry){
    // dried: the pattern stays. Cached per zone so seeking never re-simulates it twice.
    let fin=FLCACHE.get(key);
    if(!fin){const F=(r.fl&&r.fl.key===key&&r.fl.t<=tEnd+T.dry)?r.fl:fluidPrep(Object.assign(fluidInit(r),{key}),r);if(F.nf>=10){fluidRun(r,F,tEnd+T.dry);fluidRender(F,r,1)}
      fin=mk(r.bw,r.bh);const x=fin.getContext('2d');ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);
      if(F.nf>=10)fluidBlit(r,F,1,mask);else{tmpCtx.fillStyle=r.color;tmpCtx.fillRect(0,0,r.bw,r.bh);tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(mask,0,0);tmpCtx.globalCompositeOperation='source-over'}
      x.drawImage(tmpCv,0,0,r.bw,r.bh,0,0,r.bw,r.bh);if(FLCACHE.size>400)FLCACHE.clear();FLCACHE.set(key,fin)}
    r.fl=null;tmpCtx.clearRect(0,0,r.bw,r.bh);tmpCtx.drawImage(fin,0,0);return true}
  if(!r.fl||r.fl.t>c+1e-6||r.fl.key!==key)r.fl=fluidPrep(Object.assign(fluidInit(r),{key}),r);const F=r.fl;
  if(F.nf<10){const s=smooth(clamp((c-r.t0)/(SD+T.dry),0,1));tmpCtx.globalAlpha=s;tmpCtx.fillStyle=r.color;tmpCtx.fillRect(0,0,r.bw,r.bh);tmpCtx.globalAlpha=1;
    tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(mask,0,0);tmpCtx.globalCompositeOperation='source-over';return false}
  fluidRun(r,F,c);
  const settle=smooth(clamp((c-tEnd)/T.dry,0,1));fluidRender(F,r,settle);fluidBlit(r,F,settle,mask);
  return false}
