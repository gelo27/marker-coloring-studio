import {S,TOOLS} from './settings.js';
import {SS,TAU,clamp,lerp,mk,noiseAt,rngOf,smooth} from './utils.js';
import {seg} from './zones.js';
/* ================= STROKE PATHS ================= */
export function inR(r,p){return seg.lab[p]===r.i&&(r.lk<0||seg.rank[p]>=r.lk)&&(!r.pf||r.pf(p))}
export function inside(r,x,y){const xi=Math.round(x),yi=Math.round(y);return xi>=0&&yi>=0&&xi<seg.W&&yi<seg.H&&inR(r,yi*seg.W+xi)}
export function mkLeg(p0,p1,kind,bend,alpha,wmul){
  const mx=(p0[0]+p1[0])/2,my=(p0[1]+p1[1])/2,L=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])||1;
  const nx=-(p1[1]-p0[1])/L,ny=(p1[0]-p0[0])/L;
  return {p0,p1,c:[mx+nx*bend,my+ny*bend],len:L,kind,alpha:(kind==='jump'||kind==='pause')?0:alpha,wm:wmul||1,nx,ny,tr:0,tw:1,ts:0};
}
export function pauseLeg(p,wt){const l=mkLeg(p,p,'pause',0,0,1);l.len=0;l.wt0=wt;return l}
export function vn1(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(noiseAt(i,7.1),noiseAt(i+1,7.1),u)}
/* point on a leg, including the hand-tremor wobble (zero at both ends so legs stay joined) */
export function legPt(l,t){const a=1-t;let x=a*a*l.p0[0]+2*a*t*l.c[0]+t*t*l.p1[0],y=a*a*l.p0[1]+2*a*t*l.c[1]+t*t*l.p1[1];
  if(l.tr>0){const L=l.len,e=Math.min(1,t*L/l.tw,(1-t)*L/l.tw);const o=(vn1(l.ts+t*L/(l.tw*2.4))-.5)*2*l.tr*e;x+=l.nx*o;y+=l.ny*o}return[x,y]}
export function legPath(ctx,l,f,ox,oy,off){
  off=off||0;const nx=l.nx,ny=l.ny;
  if(!(l.tr>0)){let c=l.c,p1=l.p1;if(f<1){c=[lerp(l.p0[0],c[0],f),lerp(l.p0[1],c[1],f)];p1=qpt(l,f)}
    ctx.moveTo(l.p0[0]+nx*off-ox,l.p0[1]+ny*off-oy);ctx.quadraticCurveTo(c[0]+nx*off-ox,c[1]+ny*off-oy,p1[0]+nx*off-ox,p1[1]+ny*off-oy);return}
  const N=Math.max(3,Math.ceil(l.len/(l.tw*.35)*f));
  for(let i=0;i<=N;i++){const p=legPt(l,f*i/N);i?ctx.lineTo(p[0]+nx*off-ox,p[1]+ny*off-oy):ctx.moveTo(p[0]+nx*off-ox,p[1]+ny*off-oy)}
}
export function setTremor(l,w,H,rnd){if(H.on&&H.tremor>0&&l.kind==='run'&&l.len>w*1.5){l.tr=w*.13*H.tremor;l.tw=w;l.ts=rnd()*500}return l}
export function traceOutline(r,w,rnd,H){
  const W=seg.W,id=r.i;let sx=-1,sy=-1;
  outer:for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++)if(inR(r,y*W+x)){sx=x;sy=y;break outer}
  if(sx<0)return[];
  const DX=[1,1,0,-1,-1,-1,0,1],DY=[0,1,1,1,0,-1,-1,-1];
  const pts=[[sx,sy]];let cx=sx,cy=sy,d=0;const cap=(r.x1-r.x0+r.y1-r.y0)*8+100;
  for(let n=0;n<cap;n++){let found=false;for(let k=0;k<8;k++){const dd=(d+5+k)%8;const nx=cx+DX[dd],ny=cy+DY[dd];if(nx>=0&&ny>=0&&nx<W&&ny<seg.H&&inR(r,ny*W+nx)){cx=nx;cy=ny;d=dd;found=true;break}}
    if(!found)break;if(cx===sx&&cy===sy)break;pts.push([cx,cy])}
  if(pts.length<12)return[];
  const step=w*.55,res=[];let acc=0;res.push(pts[0]);
  for(let i=1;i<pts.length;i++){acc+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);if(acc>=step){res.push(pts[i]);acc=0}}
  if(res.length<4)return[];
  const n=res.length,off=w*.42,out=[],seed=rnd()*300,vary=H.sloppy+H.jitter*.5;
  for(let i=0;i<n;i++){const a=res[(i-1+n)%n],b=res[(i+1)%n];let tx=b[0]-a[0],ty=b[1]-a[1];const L=Math.hypot(tx,ty)||1;tx/=L;ty/=L;let nx=-ty,ny=tx;
    const o=off*(1+(rnd()-.5)*.5*vary)+(vn1(seed+i*.33)-.5)*w*.22*H.tremor;let p=[res[i][0]+nx*o,res[i][1]+ny*o];
    if(!inside(r,p[0],p[1])){p=[res[i][0]-nx*o,res[i][1]-ny*o];if(!inside(r,p[0],p[1]))p=res[i].slice()}
    out.push(p)}
  for(let it=0;it<2;it++){const cp=out.map(p=>p.slice());for(let i=0;i<n;i++){const a=cp[(i-1+n)%n],b=cp[(i+1)%n];out[i]=[(a[0]+2*cp[i][0]+b[0])/4,(a[1]+2*cp[i][1]+b[1])/4]}}
  const st=Math.floor(rnd()*n),legs=[];const extra=Math.ceil(n*.06)+1;
  for(let k=0;k<n+extra;k++){const p0=out[(st+k)%n],p1=out[(st+k+1)%n];legs.push(mkLeg(p0,p1,'trace',0,clamp(.76+(rnd()-.5)*.2*H.pressure,.6,.9),.85))}
  return legs;
}
export function scribble(r,w,rnd,H){
  const R=Math.sqrt(r.area/Math.PI),legs=[];let prev=null;const loops=Math.max(1,Math.round(R/(w*.45)));
  for(let l=0;l<loops;l++){const rr=Math.max(w*.15,R*(1-l/loops)-w*.35);const segs=9,a0=rnd()*TAU;
    for(let k=0;k<=segs;k++){const a=a0+k/segs*TAU*1.05;const j=1+(rnd()-.5)*.18*(.5+H.jitter);const p=[r.cx+Math.cos(a)*rr*j,r.cy+Math.sin(a)*rr*j];if(prev)legs.push(mkLeg(prev,p,'run',0,clamp(.76+(rnd()-.5)*.24*H.pressure,.55,.92),1));prev=p}}
  return legs;
}
/* one hatching pass across the region. Neighbouring rows bend the same way (correlated noise),
   so jitter never opens white gaps between them. */
export function hatch(r,legs,w,dir,spacing,rnd,H,o){
  const J=H.jitter,ca=Math.cos(dir),sa=Math.sin(dir);
  let umin=1e9,umax=-1e9,vmin=1e9,vmax=-1e9;
  [[r.x0,r.y0],[r.x1,r.y0],[r.x0,r.y1],[r.x1,r.y1]].forEach(([x,y])=>{const u=x*ca+y*sa,v=-x*sa+y*ca;umin=Math.min(umin,u);umax=Math.max(umax,u);vmin=Math.min(vmin,v);vmax=Math.max(vmax,v)});
  const s=w*spacing,step=Math.max(1.5,w*.1),rows=[];
  const span=vmax-vmin,nRows=Math.max(1,Math.ceil((span-s*.2)/s));
  let v=vmin+(span-(nRows-1)*s)/2,da=0;
  const ucx=r.cx*ca+r.cy*sa;
  for(let ri=0;ri<nRows;ri++){
    da=clamp(da*.75+(rnd()-.5)*.05*J,-.07*J,.07*J);
    const vv=v+(rnd()-.5)*s*.18*J;
    const rca=Math.cos(dir+da),rsa=Math.sin(dir+da);
    const qx=ucx*ca-vv*sa,qy=ucx*sa+vv*ca;
    const runs=[];let a=null,last=null;const ext=(umax-umin)*.75+w;
    for(let u=-ext;u<=ext;u+=step){const x=qx+u*rca,y=qy+u*rsa;if(inside(r,x,y)){if(a===null)a=u;last=u}else if(a!==null&&u-last>w*.6){runs.push([a,last]);a=null}}
    if(a!==null)runs.push([a,last]);
    if(runs.length)rows.push({qx,qy,rca,rsa,runs});
    v+=s*(1+(rnd()-.5)*.12*J);
  }
  if(!rows.length)rows.push({qx:r.cx,qy:r.cy,rca:ca,rsa:sa,runs:[[-1,1]]});
  let prev=legs.length?legs[legs.length-1].p1:null,flip=false,bend=0;
  if(o.cross&&prev&&H.on)legs.push(pauseLeg(prev,w*(2+rnd()*3)));
  rows.forEach(row=>{
    let runs=row.runs.slice();if(flip)runs.reverse();
    runs.forEach(([a,b])=>{
      const ov=()=>H.on?w*(.2+rnd()*.3*(.35+J)):w*.32;
      let ua=a-ov(),ub=b+ov();if(flip){const t=ua;ua=ub;ub=t}
      const Pp=u=>[row.qx+u*row.rca,row.qy+u*row.rsa];
      const p0=Pp(ua),p1=Pp(ub);
      if(prev){const dd=Math.hypot(p0[0]-prev[0],p0[1]-prev[1]);const lift=dd>w*2.2||o.uni||(H.on&&rnd()<H.lifts*.12);legs.push(mkLeg(prev,p0,lift?'jump':'link',0,.76,1))}
      const L=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),bm=Math.min(w*(H.on?.08+.4*J:.12),L*.1);
      bend=clamp(bend*.6+(rnd()-.5)*w*(H.on?.5*J:.2),-bm,bm);
      legs.push(setTremor(mkLeg(p0,p1,'run',bend,o.alpha(),o.wm()),w,H,rnd));
      prev=p1;
      if(H.on&&H.pauses>0&&rnd()<H.pauses*.06)legs.push(pauseLeg(prev,w*(3+rnd()*9)));
    });
    if(!o.uni)flip=!flip;
  });
}
/* radial fill: contour after contour from the edge to the middle, using a distance field */
export const DX8=[1,1,0,-1,-1,-1,0,1],DY8=[0,1,1,1,0,-1,-1,-1];
export function radialFill(r,legs,w,spacing,rnd,H){
  const q=2*SS,gw=Math.ceil((r.x1-r.x0+1)/q)+2,gh=Math.ceil((r.y1-r.y0+1)/q)+2,N=gw*gh,W=seg.W;
  const inn=new Uint8Array(N);
  for(let gy=1;gy<gh-1;gy++)for(let gx=1;gx<gw-1;gx++){const x=Math.min(seg.W-1,Math.round(r.x0+(gx-1)*q+q/2)),y=Math.min(seg.H-1,Math.round(r.y0+(gy-1)*q+q/2));if(inR(r,y*W+x))inn[gy*gw+gx]=1}
  const D=new Float32Array(N);for(let k=0;k<N;k++)D[k]=inn[k]?1e9:0;
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(inn[k])D[k]=Math.min(D[k],D[k-1]+1,D[k-gw]+1,D[k-gw-1]+1.414,D[k-gw+1]+1.414)}
  for(let y=gh-2;y>=1;y--)for(let x=gw-2;x>=1;x--){const k=y*gw+x;if(inn[k])D[k]=Math.min(D[k],D[k+1]+1,D[k+gw]+1,D[k+gw+1]+1.414,D[k+gw-1]+1.414)}
  let maxD=0;for(let k=0;k<N;k++)if(inn[k]&&D[k]>maxD)maxD=D[k];
  const s=w*spacing,o0=w*.42,J=H.jitter,seed=rnd()*300;
  let cur=legs.length?legs[legs.length-1].p1:null;
  const P=(gx,gy)=>[r.x0+(gx-1)*q+q/2,r.y0+(gy-1)*q+q/2];
  for(let lev=0;lev<80;lev++){
    let d=(o0+lev*s)/q;if(d>maxD){if(lev>0)break;d=maxD*.6}
    const M=new Uint8Array(N);let cnt=0;for(let k=0;k<N;k++)if(inn[k]&&D[k]>=d){M[k]=1;cnt++}
    if(cnt<2)break;
    const vis=new Uint8Array(N),loops=[];
    for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!M[k]||vis[k]||M[k-1])continue;
      const pts=[];let cx=x,cy=y,dd=0,n=0;const cap=cnt*3+20;
      do{pts.push([cx,cy]);vis[cy*gw+cx]=1;let f=false;for(let j=0;j<8;j++){const nd=(dd+5+j)%8,nx=cx+DX8[nd],ny=cy+DY8[nd];if(M[ny*gw+nx]){cx=nx;cy=ny;dd=nd;f=true;break}}if(!f)break;n++}while((cx!==x||cy!==y)&&n<cap);
      if(pts.length>=3)loops.push(pts.map(p=>P(p[0],p[1])))}
    const slow=lev===0?1.4:lev===1?1.18:1;
    while(loops.length){
      let bi=0,bk=0,bd=1e18;loops.forEach((L,i)=>{const st=Math.max(1,Math.floor(L.length/40));for(let k=0;k<L.length;k+=st){const dd=cur?Math.hypot(L[k][0]-cur[0],L[k][1]-cur[1]):k;if(dd<bd){bd=dd;bi=i;bk=k}}});
      const raw=loops.splice(bi,1)[0];
      // resample, smooth, add hand noise
      const step=w*.45,res=[raw[bk]];let acc=0;const n0=raw.length;
      for(let i=1;i<=n0;i++){const a=raw[(bk+i-1)%n0],b=raw[(bk+i)%n0];acc+=Math.hypot(b[0]-a[0],b[1]-a[1]);if(acc>=step){res.push(b);acc=0}}
      if(res.length<3){if(res.length){const a=res[0];const b=res[res.length-1];if(cur)legs.push(mkLeg(cur,a,Math.hypot(a[0]-cur[0],a[1]-cur[1])>w*2?'jump':'link',0,.76,1));legs.push(mkLeg(a,[b[0]+w*.2,b[1]],'run',0,.8,1));cur=legs[legs.length-1].p1}continue}
      const n=res.length;let pts=res.map(p=>p.slice());
      for(let it=0;it<2;it++){const cp=pts.map(p=>p.slice());for(let i=0;i<n;i++){const a=cp[(i-1+n)%n],b=cp[(i+1)%n];pts[i]=[(a[0]+2*cp[i][0]+b[0])/4,(a[1]+2*cp[i][1]+b[1])/4]}}
      if(H.on){const ls=(rnd()-.5)*s*.22*J;pts=pts.map((p,i)=>{const a=pts[(i-1+n)%n],b=pts[(i+1)%n];let tx=b[0]-a[0],ty=b[1]-a[1];const L=Math.hypot(tx,ty)||1;const o=ls+(vn1(seed+lev*7.3+i*.31)-.5)*w*.2*(H.tremor+J*.4);return[p[0]-ty/L*o,p[1]+tx/L*o]})}
      const al=H.on?clamp(.76+(rnd()-.5)*.26*H.pressure,.55,.92):.78,wm=H.on?1+(rnd()-.5)*.2*H.pressure:1;
      if(cur){const dd=Math.hypot(pts[0][0]-cur[0],pts[0][1]-cur[1]);legs.push(mkLeg(cur,pts[0],dd>w*2.2?'jump':'link',0,.76,1))}
      const extra=Math.ceil(n*.05)+1;
      let tacc=0,tlim=1.9+rnd()*1.4,run=0;
      for(let k=0;k<n+extra;k++){const l=mkLeg(pts[k%n],pts[(k+1)%n],'trace',0,al,wm);l.slow=slow;legs.push(l);run++;
        if(H.on&&k>0){const a=pts[(k-1+n)%n],b=pts[k%n],c2=pts[(k+1)%n];let d=Math.atan2(c2[1]-b[1],c2[0]-b[0])-Math.atan2(b[1]-a[1],b[0]-a[0]);while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;tacc+=Math.abs(d);
          // the wrist can only turn so far: the tip lifts for a moment and the hand re-sets
          if(tacc>tlim&&run>6&&k<n+extra-3){legs.push(pauseLeg(l.p1,w*(.8+rnd()*1.6)));tacc=0;tlim=1.9+rnd()*1.4;run=0}}}
      cur=legs[legs.length-1].p1;
      if(H.on&&H.pauses>0&&rnd()<H.pauses*.12)legs.push(pauseLeg(cur,w*(3+rnd()*8)));
    }
  }
}
/* scumbling: small overlapping circles travelling along serpentine rows */
export function circleFill(r,legs,w,rnd,H,dir){
  const R=w*.42,rowS=w*.95,ca=Math.cos(dir),sa=Math.sin(dir),J=H.jitter,seed=rnd()*300;
  let umin=1e9,umax=-1e9,vmin=1e9,vmax=-1e9;
  [[r.x0,r.y0],[r.x1,r.y0],[r.x0,r.y1],[r.x1,r.y1]].forEach(([x,y])=>{const u=x*ca+y*sa,v=-x*sa+y*ca;umin=Math.min(umin,u);umax=Math.max(umax,u);vmin=Math.min(vmin,v);vmax=Math.max(vmax,v)});
  const step=Math.max(1.5,w*.1),nRows=Math.max(1,Math.ceil((vmax-vmin-rowS*.3)/rowS));let v=vmin+((vmax-vmin)-(nRows-1)*rowS)/2;
  let cur=legs.length?legs[legs.length-1].p1:null,flip=false,ph=rnd()*TAU;
  const al=()=>H.on?clamp(.76+(rnd()-.5)*.26*H.pressure,.55,.92):.78;
  for(let ri=0;ri<nRows;ri++,v+=rowS){
    const runs=[];let a=null,last=null;
    for(let u=umin-w;u<=umax+w;u+=step){const x=u*ca-v*sa,y=u*sa+v*ca;if(inside(r,x,y)){if(a===null)a=u;last=u}else if(a!==null&&u-last>w*.6){runs.push([a,last]);a=null}}
    if(a!==null)runs.push([a,last]);if(flip)runs.reverse();
    runs.forEach(([a,b])=>{
      let ua=a-R*.3,ub=b+R*.3;if(flip){const t=ua;ua=ub;ub=t}
      const L=Math.abs(ub-ua),sg=ub>ua?1:-1,du=R*.11,n=Math.max(4,Math.ceil(L/du)),pitch=R*(.85+.2*J),A=al();
      let prev=null;
      for(let k=0;k<=n;k++){const u=ua+sg*k*du;ph+=TAU*du/pitch;const rr=R*(1+(vn1(seed+k*.07+ri*3.1)-.5)*.5*(.3+J));
        const bx=u*ca-v*sa,by=u*sa+v*ca,p=[bx+rr*(Math.cos(ph)*ca-Math.sin(ph)*sa),by+rr*(Math.cos(ph)*sa+Math.sin(ph)*ca)];
        if(!prev){if(cur){const dd=Math.hypot(p[0]-cur[0],p[1]-cur[1]);legs.push(mkLeg(cur,p,dd>w*2.2?'jump':'link',0,.76,1))}}
        else{const l=mkLeg(prev,p,'trace',0,A,.82);l.cw=1;legs.push(l)}prev=p}
      cur=prev;
      if(H.on&&H.pauses>0&&rnd()<H.pauses*.05)legs.push(pauseLeg(cur,w*(3+rnd()*7)));
    });
    flip=!flip;
  }
}
/* patches: a big zone is filled in several sections, each hatched at its own angle (the hand moves) */
export function patchFill(r,legs,w,spacing,rnd,H,baseDir,opt){
  const ps=w*10,k=clamp(Math.round(r.area/(ps*ps)),2,6),cand=[];
  for(let t=0;t<600&&cand.length<160;t++){const x=r.x0+rnd()*(r.x1-r.x0),y=r.y0+rnd()*(r.y1-r.y0);if(inside(r,x,y))cand.push([x,y])}
  if(cand.length<k*3)return false;
  const seeds=[cand[Math.floor(rnd()*cand.length)]];
  while(seeds.length<k){let bi=0,bd=-1;cand.forEach((c,i)=>{let m=1e18;seeds.forEach(sd=>{m=Math.min(m,Math.hypot(c[0]-sd[0],c[1]-sd[1]))});if(m>bd){bd=m;bi=i}});seeds.push(cand[bi])}
  const near=(x,y)=>{let bi=0,bd=1e18;for(let i=0;i<seeds.length;i++){const d=(x-seeds[i][0])**2+(y-seeds[i][1])**2;if(d<bd){bd=d;bi=i}}return bi};
  const subs=seeds.map((sd,idx)=>{let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0,sx=0,sy=0;const st=Math.max(2,Math.round(w*.3));
    for(let y=r.y0;y<=r.y1;y+=st)for(let x=r.x0;x<=r.x1;x+=st){if(!inR(r,y*seg.W+x)||near(x,y)!==idx)continue;n++;sx+=x;sy+=y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
    return n?{i:r.i,lk:r.lk,pf:p=>{if(r.pf&&!r.pf(p))return false;const x=p%seg.W;return near(x,(p-x)/seg.W)===idx},x0:Math.max(0,x0-st),y0:Math.max(0,y0-st),x1:Math.min(seg.W-1,x1+st),y1:Math.min(seg.H-1,y1+st),cx:sx/n,cy:sy/n,area:n*st*st}:null}).filter(Boolean);
  let cur=legs.length?legs[legs.length-1].p1:[r.cx,r.cy];
  while(subs.length){let bi=0,bd=1e18;subs.forEach((q,i)=>{const d=Math.hypot(q.cx-cur[0],q.cy-cur[1]);if(d<bd){bd=d;bi=i}});const q=subs.splice(bi,1)[0];
    hatch(q,legs,w,baseDir+(rnd()-.5)*1.8,spacing,rnd,H,{alpha:opt.alpha,wm:opt.wm,uni:H.on&&rnd()<H.lifts*.6});
    cur=legs[legs.length-1].p1;if(H.on&&subs.length&&rnd()<.4+H.pauses*.5)legs.push(pauseLeg(cur,w*(3+rnd()*6)))}
  return true;
}
/* coverage check at 1 page-px resolution: finds interior spots no stroke reaches */
export let covCv=null,covCtx=null;
export function effW(l,r,T){const st=T.st(l,1);if(T.thick)return r.w*l.wm*st.wm*(1+st.soft*.6);return T.lines?r.w*l.wm*1.0:r.w*l.wm*st.wm*(1-st.blur*.6)*(r.w<16*SS?.94:1)}
export function coverageGaps(r,legs,T){
  const q=SS,cw=Math.ceil((r.x1-r.x0+1)/q)+2,ch=Math.ceil((r.y1-r.y0+1)/q)+2;
  if(!covCv||covCv.width<cw||covCv.height<ch){covCv=mk(Math.max(cw,covCv?covCv.width:0),Math.max(ch,covCv?covCv.height:0));covCtx=covCv.getContext('2d',{willReadFrequently:true})}
  const c=covCtx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cw,ch);c.setTransform(1/q,0,0,1/q,1-r.x0/q,1-r.y0/q);
  c.strokeStyle='#000';c.lineCap='round';c.lineJoin='round';c.globalAlpha=1;
  legs.forEach(l=>{if(l.kind==='jump'||l.kind==='pause')return;c.lineWidth=effW(l,r,T);c.beginPath();legPath(c,l,1,0,0);c.stroke()});
  c.setTransform(1,0,0,1,0,0);
  const d=c.getImageData(0,0,cw,ch).data,W=seg.W,lab=seg.lab,id=r.i,gap=new Uint8Array(cw*ch),e=SS;let any=0;
  for(let y=1;y<ch-1;y++)for(let x=1;x<cw-1;x++){const k=y*cw+x;if(d[k*4+3]>200)continue;
    const fx=Math.round(r.x0+(x-1)*q+q/2),fy=Math.round(r.y0+(y-1)*q+q/2);
    if(fx<e||fy<e||fx>=W-e||fy>=seg.H-e)continue;const p=fy*W+fx;
    if(!inR(r,p)||!inR(r,p-e)||!inR(r,p+e)||!inR(r,p-e*W)||!inR(r,p+e*W))continue;
    gap[k]=1;any++}
  if(!any)return[];
  const out=[],stack=[],seen=new Uint8Array(cw*ch);
  for(let k=0;k<gap.length;k++){if(!gap[k]||seen[k])continue;let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;stack.length=0;stack.push(k);seen[k]=1;
    while(stack.length){const p=stack.pop();const x=p%cw,y=(p-x)/cw;n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const qq=p+dy*cw+dx;if(qq>=0&&qq<gap.length&&gap[qq]&&!seen[qq]){seen[qq]=1;stack.push(qq)}}}
    if(n<3)continue;
    const mx=sx/n,my=sy/n,vxx=sxx/n-mx*mx,vyy=syy/n-my*my,vxy=sxy/n-mx*my;
    const tr=vxx+vyy,det=vxx*vyy-vxy*vxy,l1=tr/2+Math.sqrt(Math.max(0,tr*tr/4-det)),l2=Math.max(0,tr-l1);
    out.push({cx:r.x0+(mx-1)*q+q/2,cy:r.y0+(my-1)*q+q/2,ang:.5*Math.atan2(2*vxy,vxx-vyy),len:Math.sqrt(12*l1)*q,wid:Math.sqrt(12*l2)*q})}
  return out;
}
/* the hand goes back and fills what it missed */
export function addTouchups(r,legs,gaps,w,rnd,H,it){
  let cur=legs.length?legs[legs.length-1].p1:[r.cx,r.cy];
  if(H.on&&it===0)legs.push(pauseLeg(cur,w*(3+rnd()*5)));
  const rest=gaps.slice();
  while(rest.length){let bi=0,bd=1e18;rest.forEach((g,i)=>{const d=Math.hypot(g.cx-cur[0],g.cy-cur[1]);if(d<bd){bd=d;bi=i}});const g=rest.splice(bi,1)[0];
    const ca=Math.cos(g.ang),sa=Math.sin(g.ang),nx=-sa,ny=ca,len=Math.max(g.len+w*.4,w*.3),rowsN=Math.max(1,Math.ceil(g.wid/(w*.5)));
    for(let k=0;k<rowsN;k++){const o=(k-(rowsN-1)/2)*w*.48,sg=k%2?-1:1;
      const a=[g.cx+nx*o-ca*len/2*sg,g.cy+ny*o-sa*len/2*sg],b=[g.cx+nx*o+ca*len/2*sg,g.cy+ny*o+sa*len/2*sg];
      const dd=Math.hypot(a[0]-cur[0],a[1]-cur[1]);legs.push(mkLeg(cur,a,dd>w*1.5?'jump':'link',0,.76,1));
      legs.push(mkLeg(a,b,'run',0,H.on?.8+rnd()*.1:.84,1.06));cur=b}}
}
/* reach: when a character paints (e.g. a cat), how far its paws reach from where it stands (page px); 0 = a hand */
export const STROKE={reach:0,walkK:0};
/* Fill for a character that walks on the page: the zone is cut into patches as big as its reach (jittered grid,
   nearest seed), visited row by row in a serpentine; each patch is hatched in one direction while the painter stands
   still. Every leg remembers its stand point (l.st), which the character walks to. */
export function reachFill(r,legs,w,spacing,rnd,H,dir,Rch,opt){
  const W=seg.W,cell=Math.max(w*3,Rch*1.5),gx=Math.max(1,Math.ceil((r.x1-r.x0+1)/cell)),gy=Math.max(1,Math.ceil((r.y1-r.y0+1)/cell)),sd=[];
  for(let j=0;j<gy;j++)for(let i=0;i<gx;i++)sd.push([r.x0+(i+.5+(rnd()-.5)*.5)*cell,r.y0+(j+.5+(rnd()-.5)*.5)*cell]);
  const near=(x,y)=>{const ci=clamp(Math.floor((x-r.x0)/cell),0,gx-1),cj=clamp(Math.floor((y-r.y0)/cell),0,gy-1);let bi=0,bd=1e18;
    for(let j=Math.max(0,cj-1);j<=Math.min(gy-1,cj+1);j++)for(let i=Math.max(0,ci-1);i<=Math.min(gx-1,ci+1);i++){const q=sd[j*gx+i],d=(x-q[0])**2+(y-q[1])**2;if(d<bd){bd=d;bi=j*gx+i}}return bi};
  const st=Math.max(2,Math.round(w*.3)),acc=sd.map(()=>({n:0,sx:0,sy:0,x0:1e9,y0:1e9,x1:-1,y1:-1}));
  for(let y=r.y0;y<=r.y1;y+=st)for(let x=r.x0;x<=r.x1;x+=st){if(!inR(r,y*W+x))continue;const a=acc[near(x,y)];a.n++;a.sx+=x;a.sy+=y;if(x<a.x0)a.x0=x;if(x>a.x1)a.x1=x;if(y<a.y0)a.y0=y;if(y>a.y1)a.y1=y}
  const subs=[];acc.forEach((a,idx)=>{if(!a.n)return;const row=Math.floor(idx/gx),col=idx%gx;
    subs.push({i:r.i,lk:r.lk,pf:p=>{if(r.pf&&!r.pf(p))return false;const x=p%W;return near(x,(p-x)/W)===idx},x0:Math.max(0,a.x0-st),y0:Math.max(0,a.y0-st),x1:Math.min(W-1,a.x1+st),y1:Math.min(seg.H-1,a.y1+st),cx:a.sx/a.n,cy:a.sy/a.n,area:a.n*st*st,ord:row*gx+(row%2?gx-1-col:col)})});
  subs.sort((a,b)=>a.ord-b.ord);
  subs.forEach(q=>{const k0=legs.length;hatch(q,legs,w,dir+(rnd()-.5)*.2*H.dirVar,spacing,rnd,H,{alpha:opt.alpha,wm:opt.wm,uni:false});for(let k=k0;k<legs.length;k++)legs[k].st=[q.cx,q.cy]});
  return subs.length>0}
/* a painter carries the tool from one stand point to the next: wherever the tip would leap (legs that do not join up)
   or the stand changes, a lifted 'jump' leg links them; it remembers both stands (st0 -> st) and how far the painter
   walks, so it gets walking time (STROKE.walkK = pen-path px per px walked) and the body is carried along smoothly */
function walkLegs(legs){const outL=[];let prev=null;
  for(const l of legs){if(prev){const gap=Math.hypot(l.p0[0]-prev.p1[0],l.p0[1]-prev.p1[1]),moved=prev.st!==l.st,wd=moved?Math.hypot(l.st[0]-prev.st[0],l.st[1]-prev.st[1]):0;
      if(gap>1||moved){if((l.kind==='jump'||l.kind==='link')&&gap<=1){if(moved){l.kind='jump';l.alpha=0;l.st0=prev.st;l.walk=wd}}
        else{const j=mkLeg(prev.p1,l.p0,'jump',0,.76,1);j.st=l.st;if(moved){j.st0=prev.st;j.walk=wd}outL.push(j)}}}
    outL.push(l);prev=l}
  legs.length=0;legs.push(...outL)}
/* legs without a stand point (outlines, shadows, touch-ups): the painter stays put while the tip is within reach,
   then steps to where the tip is going */
function assignStands(legs,Rch){let a=null;for(const l of legs){if(l.st){a=l.st;continue}const p=l.p1;if(!a||Math.hypot(p[0]-a[0],p[1]-a[1])>Rch*.85)a=[(l.p0[0]+p[0])/2,(l.p0[1]+p[1])/2];l.st=a}}
export function buildPath(r,H,seed){
  const key=(r.tool||S.tool)+'|'+JSON.stringify(H)+'|'+seed+'|'+r.lk+'|'+STROKE.reach+'|'+STROKE.walkK+'|'+(S.wideBig!==false);
  if(r.pathKey===key)return;
  const rnd=rngOf(r.i*7919+seed*31+(H.on?17:3));
  const T=TOOLS[r.tool||S.tool];const w=r.w=clamp(Math.sqrt(r.lk>=0&&r.pArea?r.pArea:r.area)*.085,9*SS,STROKE.reach>0||S.wideBig===false?17*SS:34*SS)*T.wMul;
  const base=r.elong>.25?r.ang:-.62;
  const dir=base+(rnd()-.5)*(.35+H.dirVar*1.3);
  const legs=[],P=H.pressure;
  const small=r.area<Math.pow(30*SS,2);
  const alpha=()=>H.on?clamp(.76+(rnd()-.5)*.26*P,.55,.92):.74+rnd()*.08;
  const wm=()=>H.on?1+(rnd()-.5)*.24*P:1;
  let mode=!H.on?(H.fill||'hatch'):H.fill;
  if(mode==='auto'){const big=r.area>Math.pow(w*14,2),cmp=r.elong<.35,dry=T.lines||T.rough;const W8=[['radial',cmp?.38:.15],['hatch',cmp?.2:.42],['circles',(dry?.3:.14)*(r.area<Math.pow(170*SS,2)?1:0)],['patches',big?(cmp?.22:.3):0]];
    let tot=W8.reduce((a,b)=>a+b[1],0),x=rnd()*tot;mode='hatch';for(const [m,p] of W8){if((x-=p)<0){mode=m;break}}}
  if(mode==='circles'&&r.area>Math.pow(220*SS,2))mode='patches';
  r.hdir=dir;
  const Rch=STROKE.reach;
  if(Rch>0&&!r.shadowOf&&r.area>Math.pow(Rch*1.1,2)&&reachFill(r,legs,w,T.spacing,rnd,H,-.62+(rnd()-.5)*.3,Rch,{alpha,wm}))r.hdir=null;
  else if(r.shadowOf&&r.vsStyle==='hatch'){const w2=Math.max(2.6*SS,w*.24);r.w=w2;hatch(r,legs,w2,r.vsDir,3.4,rnd,H,{alpha:()=>.92,wm:()=>1,uni:true});r.hdir=null}
  else if(r.shadowOf){radialFill(r,legs,w,T.spacing*.95,rnd,H);r.hdir=null}
  else if(H.on&&small&&T.scribble!==false&&rnd()<.4+.5*H.jitter){legs.push(...scribble(r,w,rnd,H))}
  else if(mode==='radial'){radialFill(r,legs,w,T.spacing*.95,rnd,H);r.hdir=null}
  else if(mode==='circles'){circleFill(r,legs,w,rnd,H,dir);r.hdir=null}
  else if(mode==='patches'&&patchFill(r,legs,w,T.spacing,rnd,H,dir,{alpha,wm})){r.hdir=null}
  else{
    if(H.on&&T.outline&&r.area>Math.pow(42*SS,2)&&!r.isBg&&rnd()<H.outline)legs.push(...traceOutline(r,w,rnd,H));
    hatch(r,legs,w,dir,T.spacing,rnd,H,{alpha,wm,uni:H.on&&rnd()<H.lifts*.6});
    if(H.on&&H.cross>0&&!r.isBg&&r.area>Math.pow(60*SS,2)&&(r.tool||S.tool)!=='airbrush'&&rnd()<H.cross)
      hatch(r,legs,w,dir+(rnd()<.5?1:-1)*(1.05+rnd()*.35),T.spacing*1.35,rnd,H,{alpha:()=>alpha()*.55,wm,uni:rnd()<.5,cross:true});
  }
  if((H.touch!==false||!H.on)&&r.vsStyle!=='hatch')for(let it=0;it<2;it++){const gaps=coverageGaps(r,legs,T);if(!gaps.length)break;addTouchups(r,legs,gaps,w,rnd,H,it)}
  if(Rch>0){assignStands(legs,Rch);walkLegs(legs)}
  let tw=0;
  legs.forEach(l=>{let wt=l.cw?l.len*1.1+w*.01:l.kind==='run'?l.len+w*1.6:l.kind==='link'?l.len*.8+w*.7:l.kind==='trace'?(l.len*1.25+w*.15)*(l.slow||1):l.kind==='pause'?l.wt0:l.len*.35+w*1.2;
    if(H.on&&l.kind!=='pause')wt*=clamp(1+(rnd()-.5)*.8*H.tempo,.5,1.6);if(l.walk)wt+=l.walk*STROKE.walkK*1.15/Math.min(1.47,1+l.walk/(4*STROKE.reach/.33));l.wt=wt;tw+=wt});
  let acc=0;legs.forEach(l=>{l.f0=acc/tw;acc+=l.wt;l.f1=acc/tw});
  r.legs=legs;r.pathW=tw;r.pathKey=key;
}
export function qpt(l,t){const a=1-t;return[a*a*l.p0[0]+2*a*t*l.c[0]+t*t*l.p1[0],a*a*l.p0[1]+2*a*t*l.c[1]+t*t*l.p1[1]]}
export const legEase=f=>f*.35+.65*smooth(f);
