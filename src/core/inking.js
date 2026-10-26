import {INK,S} from './settings.js';
import {SS,clamp,lerp,smooth} from './utils.js';
/* ================= INKING =================
   Before the colouring, a black tool draws the drawing's own lines. The lines are thinned to a one-pixel skeleton,
   the skeleton is walked into strokes (at a fork the hand carries on along the straightest branch, the other
   branches start later from where they leave), and the strokes are put in the order a hand would take them.
   The ink itself is the original line art: every line pixel gets the moment the tip passes its nearest skeleton
   pixel, and the paper shader shows a pixel only from that moment on, so the finished drawing is exactly the original. */
const INK_COLOR='#1d1a22';
let G=null,TX=null;
/* skeleton strokes of the drawing (cached per segmentation) */
function geometry(seg){
  if(G&&G.seg===seg)return G;
  const W=seg.W,H=seg.H,N=W*H,d=seg.lineTexCv.getContext('2d').getImageData(0,0,W,H).data,A=new Uint8Array(N);
  for(let i=0;i<N;i++)A[i]=d[i*4+3];
  // the dark middle of the lines, thinned (Zhang-Suen)
  const sk=new Uint8Array(N);let fg=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(A[i]>=110){sk[i]=1;fg.push(i)}}
  for(let it=0;it<80;it++){let ch=0;
    for(let pass=0;pass<2;pass++){const del=[];
      for(const i of fg){if(!sk[i])continue;
        const p2=sk[i-W],p3=sk[i-W+1],p4=sk[i+1],p5=sk[i+W+1],p6=sk[i+W],p7=sk[i+W-1],p8=sk[i-1],p9=sk[i-W-1],b=p2+p3+p4+p5+p6+p7+p8+p9;if(b<2||b>6)continue;
        const a=(!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2);if(a!==1)continue;
        if(pass===0?(p2*p4*p6||p4*p6*p8):(p2*p4*p8||p2*p6*p8))continue;del.push(i)}
      for(const i of del)sk[i]=0;ch+=del.length}
    fg=fg.filter(i=>sk[i]);if(!ch)break}
  // staircase corners (two perpendicular neighbours only) are redundant: without them the forks are real forks
  for(const i of fg){if(!sk[i])continue;const n=sk[i-W],e=sk[i+1],s=sk[i+W],w=sk[i-1],dg=sk[i-W+1]+sk[i+W+1]+sk[i+W-1]+sk[i-W-1];
    if(dg===0&&n+e+s+w===2&&((n&&e)||(e&&s)||(s&&w)||(w&&n)))sk[i]=0}
  fg=fg.filter(i=>sk[i]);
  const OFF=[1,W+1,W,W-1,-1,-W-1,-W,-W+1],vis=new Uint8Array(N),deg=i=>{let n=0;for(const o of OFF)if(sk[i+o])n++;return n};
  const cand=[];for(const i of fg)if(deg(i)<=1)cand.push({q:i,par:-1});
  const raw=[];let cx=W,cy=0;
  const walk=(start,par)=>{const px=par>=0?[par]:[];let cur=start,dir=-1;if(par>=0)dir=OFF.indexOf(start-par);
    for(;;){vis[cur]=1;px.push(cur);let best=-1,bs=-1e9;
      for(let k=0;k<8;k++){const q=cur+OFF[k];if(!sk[q]||vis[q])continue;let sc=k&1?0:.3;if(dir>=0){const dd=Math.abs(k-dir);sc-=Math.min(dd,8-dd)}if(sc>bs){bs=sc;best=k}}
      for(let k=0;k<8;k++){const q=cur+OFF[k];if(k!==best&&sk[q]&&!vis[q])cand.push({q,par:cur})}
      if(best<0)break;dir=best;cur+=OFF[best]}
    // close the joint with a line already drawn (a loop back to its start, a T-junction)
    const recent=new Set(px.slice(-5));for(const o of OFF){const q=cur+o;if(sk[q]&&vis[q]&&!recent.has(q)){px.push(q);break}}
    return px};
  let left=fg.length;
  while(left>0){let bi=-1,bd=1e18;
    for(let j=0;j<cand.length;j++){const q=cand[j].q;if(vis[q]){cand[j]=cand[cand.length-1];cand.pop();j--;continue}const dx=q%W-cx,dy=(q/W|0)-cy,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;bi=j}}
    let st;if(bi>=0){st=cand[bi];cand[bi]=cand[cand.length-1];cand.pop()}
    else{let q0=-1;for(const i of fg)if(!vis[i]){const dx=i%W-cx,dy=(i/W|0)-cy,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;q0=i}}if(q0<0)break;st={q:q0,par:-1}}
    const px=walk(st.q,st.par);left-=px.length-(st.par>=0?1:0);const e=px[px.length-1];cx=e%W;cy=e/W|0;
    if(px.length>=4)raw.push(px)}
  // strokes: the pixel path smoothed into a polyline; every skeleton pixel knows its stroke and how far along it lies
  const sid=new Int32Array(N).fill(-1),sarc=new Float32Array(N),strokes=[];
  raw.forEach(px=>{const n=px.length,X=new Float32Array(n),Y=new Float32Array(n),s=new Float32Array(n);
    for(let k=0;k<n;k++){X[k]=px[k]%W+.5;Y[k]=(px[k]/W|0)+.5;if(k)s[k]=s[k-1]+Math.hypot(X[k]-X[k-1],Y[k]-Y[k-1])}
    for(let it=0;it<3;it++)for(let k=1;k<n-1;k++){X[k]=(X[k-1]+2*X[k]+X[k+1])/4;Y[k]=(Y[k-1]+2*Y[k]+Y[k+1])/4}
    const cum=new Float32Array(n);for(let k=1;k<n;k++)cum[k]=cum[k-1]+Math.hypot(X[k]-X[k-1],Y[k]-Y[k-1]);
    const j=strokes.length,L=cum[n-1]||1,sL=s[n-1]||1;for(let k=0;k<n;k++){const i=px[k];if(sid[i]<0){sid[i]=j;sarc[i]=s[k]/sL*L}}
    strokes.push({X,Y,cum,len:cum[n-1]})});
  // every pixel of the line art takes after its nearest skeleton pixel
  const own=new Int32Array(N).fill(-1),Q=new Int32Array(N);let qh=0,qt=0;
  for(const i of fg)if(sid[i]>=0){own[i]=i;Q[qt++]=i}
  const grow=()=>{while(qh<qt){const p=Q[qh++],x=p%W;for(const o of OFF){const q=p+o,qx=q%W;if(q<0||q>=N||Math.abs(qx-x)>1||own[q]>=0||!A[q])continue;own[q]=own[p];Q[qt++]=q}}};grow();
  // bits of line with no skeleton of their own (dots, specks): a dot each, a quick touch of the tip
  for(let i=0;i<N;i++){if(!A[i]||own[i]>=0)continue;const q0=qt;own[i]=i;Q[qt++]=i;grow();const n=qt-q0;
    let sx=0,sy=0;for(let k=q0;k<qt;k++){sx+=Q[k]%W;sy+=Q[k]/W|0}
    if(n>=6){const x=sx/n+.5,y=sy/n+.5;sid[i]=strokes.length;sarc[i]=0;strokes.push({X:new Float32Array([x,x]),Y:new Float32Array([y,y]),cum:new Float32Array([0,0]),len:0,dot:true})}
    else for(let k=q0;k<qt;k++)own[Q[k]]=-2}
  // the order: object by object (pieces of line that touch), the biggest object first, then always the nearest one;
  // inside an object always the nearest stroke next, from either end
  const cl=new Int32Array(N),cs=[];let C=0;
  for(let i=0;i<N;i++){if(!A[i]||cl[i])continue;C++;let n2=0;cl[i]=C;Q[0]=i;let h=0,t=1;
    while(h<t){const p=Q[h++],x=p%W;n2++;for(const o of OFF){const q=p+o;if(q<0||q>=N||Math.abs(q%W-x)>1||cl[q]||!A[q])continue;cl[q]=C;Q[t++]=q}}cs[C]=n2}
  strokes.forEach(S=>{const x=Math.min(W-1,S.X[0]|0),y=Math.min(H-1,S.Y[0]|0);let c=cl[y*W+x];
    if(!c)for(const o of OFF){const q=y*W+x+o;if(q>=0&&q<N&&cl[q]){c=cl[q];break}}S.comp=c;S.csz=cs[c]||0});
  const n=strokes.length,used=new Uint8Array(n),order=[];let px0=W*.5,py0=0,comp=-1,left2=n;
  const nearest=only=>{let bj=-1,bd=1e18,rev=false;
    for(let j=0;j<n;j++){if(used[j]||(only>=0&&strokes[j].comp!==only))continue;const S=strokes[j],e=S.X.length-1,d0=(S.X[0]-px0)**2+(S.Y[0]-py0)**2,d1=(S.X[e]-px0)**2+(S.Y[e]-py0)**2;
      if(d0<bd){bd=d0;bj=j;rev=false}if(d1<bd){bd=d1;bj=j;rev=true}}return{bj,rev}};
  while(left2>0){let pick=comp>=0?nearest(comp):{bj:-1};
    if(pick.bj<0){if(comp<0){let big=0;strokes.forEach((S,j)=>{if(S.csz>strokes[big].csz)big=j});comp=strokes[big].comp;const S=strokes[big];px0=S.X[0];py0=S.Y[0];pick=nearest(comp)}
      else{pick=nearest(-1);comp=strokes[pick.bj].comp}}
    const S=strokes[pick.bj];used[pick.bj]=1;left2--;S.rev=pick.rev;order.push(pick.bj);const e=pick.rev?0:S.X.length-1;px0=S.X[e];py0=S.Y[e]}
  // the nearest-next order leaves stragglers behind (long trips back later): 2-opt shortens the moves in the air,
  // turning a run of strokes round (order and direction) wherever that makes the hops shorter
  {const m=order.length,sx=new Float64Array(m),sy=new Float64Array(m),ex=new Float64Array(m),ey=new Float64Array(m);
   order.forEach((j,k)=>{const S=strokes[j],e=S.X.length-1,a=S.rev?e:0,b=S.rev?0:e;sx[k]=S.X[a];sy[k]=S.Y[a];ex[k]=S.X[b];ey[k]=S.Y[b]});
   const D=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1),flip=(i,j)=>{for(;i<j;i++,j--){[order[i],order[j]]=[order[j],order[i]];
       let t=sx[i];sx[i]=ex[j];ex[j]=t;t=sy[i];sy[i]=ey[j];ey[j]=t;t=ex[i];ex[i]=sx[j];sx[j]=t;t=ey[i];ey[i]=sy[j];sy[j]=t}
     if(i===j){let t=sx[i];sx[i]=ex[i];ex[i]=t;t=sy[i];sy[i]=ey[i];ey[i]=t}};
   for(let pass=0;pass<12;pass++){let better=false;
     for(let i=1;i<m-1;i++)for(let j=i+1;j<m;j++){const last=j===m-1,old=D(ex[i-1],ey[i-1],sx[i],sy[i])+(last?0:D(ex[j],ey[j],sx[j+1],sy[j+1])),nw=D(ex[i-1],ey[i-1],ex[j],ey[j])+(last?0:D(sx[i],sy[i],sx[j+1],sy[j+1]));
       if(nw<old-.5){flip(i,j);better=true}}
     if(!better)break}
   order.forEach((j,k)=>{const S=strokes[j];S.rev=Math.abs(S.X[0]-sx[k])+Math.abs(S.Y[0]-sy[k])>Math.abs(S.X[S.X.length-1]-sx[k])+Math.abs(S.Y[S.Y.length-1]-sy[k])})}
  const rank=new Int32Array(n);order.forEach((j,k)=>rank[j]=k);
  G={seg,W,H,N,A,own,sid,sarc,strokes:order.map(j=>strokes[j]),rank,id:(G?G.id:0)+1};return G}
/* the inking phase of a plan: strokes with their times (plan time), starting at c0 */
export function inkPlan(seg,c0){
  const g=geometry(seg),T=g.strokes;if(!T.length)return null;
  const V=650*SS,gapOf=(a,b)=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1]);return d<2.5*SS?.015:clamp(.09+.2*Math.sqrt(d/(400*SS)),.1,.55)};
  const drawOf=S2=>S2.dot?.07:.05+S2.len/V,ends=S2=>{const e=S2.X.length-1,a=S2.rev?e:0,b=S2.rev?0:e;return[[S2.X[a],S2.Y[a]],[S2.X[b],S2.Y[b]]]};
  let rd=0,rg=0;T.forEach((S2,k)=>{rd+=drawOf(S2);if(k)rg+=gapOf(ends(T[k-1])[1],ends(S2)[0])});const raw=rd+rg;
  const dur=INK.dur>0?INK.dur:clamp(raw,3,Math.max(6,(S.duration||60)*.35));
  // squeezed into less time than a hand would take: the moves in the air are cut down more than the drawing itself
  let f=dur/raw,fg=f;if(f<1){let lo=f,hi=1;for(let it=0;it<40;it++){const m=(lo+hi)/2;if(rd*m+rg*Math.pow(m,1.6)>dur)hi=m;else lo=m}f=lo;fg=Math.pow(f,1.6)}
  const st=[];let t=c0;T.forEach((S2,k)=>{const[a,b]=ends(S2);if(k)t+=gapOf(st[k-1].b,a)*fg;const d=drawOf(S2)*f;st.push({S:S2,t0:t,t1:t+d,a,b});t+=d});
  const I={c0,c1:t,dur:t-c0,st,tool:INK.tool||'marker',color:INK_COLOR,start:st[0].a,end:st[st.length-1].b};
  // the moment each line pixel is drawn (0..1 of the phase, 16 bits in red and green); cached while the timing holds
  const key=g.id+'|'+f.toFixed(6);
  if(!TX||TX.key!==key){const tS=new Float32Array(T.length*2);st.forEach((q,k)=>{tS[k*2]=(q.t0-c0)/I.dur;tS[k*2+1]=(q.t1-c0)/I.dur});
    const data=new Uint8Array(g.N*4),inv=p=>{let x=p;for(let it=0;it<5;it++){const s=smooth(x),F=.5*x+.5*s-p,dF=.5+3*x*(1-x);x=clamp(x-F/Math.max(.2,dF),0,1)}return x};
    for(let i=0;i<g.N;i++){if(!g.A[i])continue;const o=g.own[i];let v=1;
      if(o>=0){const j=g.rank[g.sid[o]],S2=T[j];let p=S2.len>0?g.sarc[o]/S2.len:0;if(S2.rev)p=1-p;v=lerp(tS[j*2],tS[j*2+1],inv(clamp(p,0,1)))}
      const q=Math.round(clamp(v,0,1)*65535);data[i*4]=q>>8;data[i*4+1]=q&255;data[i*4+3]=255}
    TX={key,data,W:g.W,H:g.H}}
  I.tex=TX;return I}
/* where the inking tool is at plan time c, or null once the inking is over */
export function inkPen(I,c,introWide){
  const st=I.st,base={color:I.color,tool:I.tool,ink:true};
  // coming in from beyond the page corner (or, without the opening wide shot, already hovering over the first line)
  if(c<I.c0){const ox=G.W*1.15,oy=G.H*1.12,u=introWide?smooth(clamp((c-.3)/Math.max(.05,I.c0-.3),0,1)):1;
    return Object.assign({x:lerp(ox,I.start[0],u),y:lerp(oy,I.start[1],u),h:1-smooth(clamp((c-(I.c0-.35))/.35,0,1)),kind:'air',lid:-1},base)}
  if(c>=I.c1)return null;
  let lo=0,hi=st.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(st[m].t0<=c)lo=m;else hi=m-1}
  const q=st[lo];
  if(c<=q.t1){const S2=q.S,u=(c-q.t0)/Math.max(1e-6,q.t1-q.t0),p=.5*u+.5*smooth(u);let s=(q.S.rev?1-p:p)*S2.len;
    const C=S2.cum;let a=0,b=C.length-1;while(b-a>1){const m=(a+b)>>1;if(C[m]<=s)a=m;else b=m}const fr=C[b]>C[a]?clamp((s-C[a])/(C[b]-C[a]),0,1):0;
    return Object.assign({x:lerp(S2.X[a],S2.X[b],fr),y:lerp(S2.Y[a],S2.Y[b],fr),h:0,kind:'ink',lid:-1000-lo},base)}
  // between two strokes: the tip lifts (a little for a short hop) and lands at the next one
  const nx=st[lo+1],u=clamp((c-q.t1)/Math.max(1e-6,nx.t0-q.t1),0,1),e=smooth(u),d=Math.hypot(nx.a[0]-q.b[0],nx.a[1]-q.b[1]);
  return Object.assign({x:lerp(q.b[0],nx.a[0],e),y:lerp(q.b[1],nx.a[1],e),h:d<2.5*SS?0:.3*Math.pow(Math.sin(Math.PI*u),.6)*clamp(d/(80*SS),.25,1),kind:d<2.5*SS?'ink':'air',lid:-1000-lo},base)}
