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

  // Thin the dark centre of each outline to a one-pixel skeleton (Zhang-Suen).
  const sk=new Uint8Array(N),fg=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(A[i]>=110){sk[i]=1;fg.push(i)}}
  for(let it=0;it<80;it++){
    let changed=0;
    for(let pass=0;pass<2;pass++){
      const del=[];
      for(const i of fg){
        if(!sk[i])continue;
        const p2=sk[i-W],p3=sk[i-W+1],p4=sk[i+1],p5=sk[i+W+1],p6=sk[i+W],p7=sk[i+W-1],p8=sk[i-1],p9=sk[i-W-1];
        const b=p2+p3+p4+p5+p6+p7+p8+p9;
        if(b<2||b>6)continue;
        const a=(!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2);
        if(a!==1)continue;
        if(pass===0?(p2*p4*p6||p4*p6*p8):(p2*p4*p8||p2*p6*p8))continue;
        del.push(i);
      }
      for(const i of del)sk[i]=0;
      changed+=del.length;
    }
    if(!changed)break;
  }

  // Remove redundant corner pixels. The graph below suppresses diagonal links whenever
  // an orthogonal two-step link exists, so a staircase is not mistaken for a junction.
  const DX=[1,1,0,-1,-1,-1,0,1],DY=[0,1,1,1,0,-1,-1,-1];
  for(const i of fg){
    if(!sk[i])continue;
    const n=sk[i-W],e=sk[i+1],s=sk[i+W],w=sk[i-1],dg=sk[i-W+1]+sk[i+W+1]+sk[i+W-1]+sk[i-W-1];
    if(dg===0&&n+e+s+w===2&&((n&&e)||(e&&s)||(s&&w)||(w&&n)))sk[i]=0;
  }

  // Build a true pixel graph. Diagonal links are ignored if either orthogonal
  // neighbour already connects the same two pixels; this prevents false forks
  // and tiny back-and-forth strokes around diagonal corners.
  const neighbours=(i,k)=>{
    const x=i%W,y=(i-x)/W,xx=x+DX[k],yy=y+DY[k];
    if(xx<0||xx>=W||yy<0||yy>=H)return -1;
    const q=yy*W+xx;
    if(!sk[q])return -1;
    if(k&1){
      if(sk[y*W+xx]||sk[yy*W+x])return -1;
    }
    return q;
  };
  const degree=new Uint8Array(N);
  for(const i of fg)if(sk[i]){
    let n=0;
    for(let k=0;k<8;k++)if(neighbours(i,k)>=0)n++;
    degree[i]=n;
  }

  // Local half-width around real graph nodes. This is used only to union the
  // reveal time of existing line pixels near a junction; it never expands ink.
  const nodePads=[];
  for(const i of fg){
    if(!sk[i]||degree[i]<1||degree[i]===2)continue;
    const x=i%W,y=(i-x)/W,widths=[];
    for(let k=0;k<8;k++){
      if(neighbours(i,k)<0)continue;
      const dx=DX[k],dy=DY[k],nx=-dy,ny=dx,sx=x+dx*6,sy=y+dy*6;
      let a=0,b=0;
      for(let r=1;r<=18;r++){
        const xx=Math.round(sx+nx*r),yy=Math.round(sy+ny*r);
        if(xx<0||xx>=W||yy<0||yy>=H||A[yy*W+xx]<45)break;
        a=r;
      }
      for(let r=1;r<=18;r++){
        const xx=Math.round(sx-nx*r),yy=Math.round(sy-ny*r);
        if(xx<0||xx>=W||yy<0||yy>=H||A[yy*W+xx]<45)break;
        b=r;
      }
      widths.push(a+b+1);
    }
    if(!widths.length)continue;
    widths.sort((a,b)=>a-b);
    const w=widths[Math.floor((widths.length-1)*.5)];
    nodePads.push({i,x:i%W+.5,y:(i/W|0)+.5,r:clamp(w*.55+1,2,10)});
  }

  // Trace every graph edge exactly once. A stroke runs from one endpoint/junction
  // to the next. At junctions the shared node is included in both paths, allowing
  // the pen to continue through the meeting point without leaving a visible gap.
  const edgeSeen=new Uint8Array(N),raw=[];
  const hasEdge=(i,k)=>(edgeSeen[i]&(1<<k))!==0;
  const markEdge=(i,k,q)=>{
    edgeSeen[i]|=1<<k;
    edgeSeen[q]|=1<<((k+4)&7);
  };
  const traceEdge=(start,firstDir)=>{
    const first=neighbours(start,firstDir);
    if(first<0||hasEdge(start,firstDir))return null;
    const path=[start];
    let prev=start,cur=first,guard=0;
    markEdge(start,firstDir,first);
    while(cur>=0&&guard++<=fg.length+1){
      path.push(cur);
      if(cur===start||degree[cur]!==2)break;
      let next=-1,nextDir=-1;
      for(let k=0;k<8;k++){
        const q=neighbours(cur,k);
        if(q<0||q===prev||hasEdge(cur,k))continue;
        next=q;nextDir=k;break;
      }
      if(next<0)break;
      markEdge(cur,nextDir,next);
      prev=cur;cur=next;
    }
    return path;
  };

  // Endpoints and junctions form the graph's vertices.
  for(const i of fg){
    if(!sk[i])continue;
    if(degree[i]===0){
      // A real isolated mark (such as the dot above a letter) has a small ink blob
      // around its skeleton pixel. Ignore one-pixel scan dust.
      let support=0,x=i%W,y=(i-x)/W;
      for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)
        for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++)
          if(A[yy*W+xx]>24)support++;
      if(support>=3)raw.push([i]);
      continue;
    }
    if(degree[i]===2)continue;
    for(let k=0;k<8;k++){
      const q=neighbours(i,k);
      if(q<0||hasEdge(i,k))continue;
      const path=traceEdge(i,k);
      if(path&&path.length>1)raw.push(path);
    }
  }
  // Components with no endpoints or junctions are closed loops. Trace any
  // remaining unvisited edge to preserve the whole loop instead of dropping it.
  for(const i of fg){
    if(!sk[i])continue;
    for(let k=0;k<8;k++){
      const q=neighbours(i,k);
      if(q<0||hasEdge(i,k))continue;
      const path=traceEdge(i,k);
      if(path&&path.length>1)raw.push(path);
    }
  }

  // Convert pixel chains to smoothed polylines. Closed loops are smoothed cyclically
  // so their start/end point stays joined and does not create a tiny notch.
  const sid=new Int32Array(N).fill(-1),sarc=new Float32Array(N),strokes=[];
  for(const px of raw){
    if(px.length===1){
      const i=px[0],j=strokes.length,x=i%W+.5,y=(i/W|0)+.5;
      sid[i]=j;sarc[i]=0;
      strokes.push({X:new Float32Array([x,x]),Y:new Float32Array([y,y]),cum:new Float32Array([0,0]),len:0,dot:true});
      continue;
    }
    const n=px.length,closed=n>4&&px[0]===px[n-1],m=closed?n-1:n;
    const s=new Float32Array(n);
    for(let k=1;k<n;k++){
      const a=px[k-1],b=px[k];
      s[k]=s[k-1]+Math.hypot((b%W)-(a%W),(b/W|0)-(a/W|0));
    }
    let x=new Float32Array(m),y=new Float32Array(m);
    for(let k=0;k<m;k++){x[k]=px[k]%W+.5;y[k]=(px[k]/W|0)+.5}
    for(let it=0;it<2;it++){
      const nx=new Float32Array(m),ny=new Float32Array(m);
      for(let k=0;k<m;k++){
        if(!closed&&(k===0||k===m-1)){nx[k]=x[k];ny[k]=y[k];continue}
        const p=(k+m-1)%m,q=(k+1)%m;
        nx[k]=(x[p]+2*x[k]+x[q])*.25;
        ny[k]=(y[p]+2*y[k]+y[q])*.25;
      }
      x=nx;y=ny;
    }
    const X=new Float32Array(closed?m+1:m),Y=new Float32Array(closed?m+1:m);
    X.set(x);Y.set(y);
    if(closed){X[m]=X[0];Y[m]=Y[0]}
    const cum=new Float32Array(X.length);
    for(let k=1;k<X.length;k++)cum[k]=cum[k-1]+Math.hypot(X[k]-X[k-1],Y[k]-Y[k-1]);
    const j=strokes.length,L=cum[cum.length-1]||1,sL=s[n-1]||1;
    for(let k=0;k<n;k++){
      const i=px[k];
      if(sid[i]<0){sid[i]=j;sarc[i]=s[k]/sL*L}
    }
    strokes.push({X,Y,cum,len:cum[cum.length-1],nodeA:px[0],nodeB:px[n-1]});
  }

  // Assign every antialiased line pixel to its nearest skeleton stroke using a
  // multi-source flood fill. Use -1 only for genuinely unvisited pixels; -2 is a
  // deliberate "tiny speck" marker and must never be visited a second time.
  const own=new Int32Array(N).fill(-1),Q=new Int32Array(N);
  let qh=0,qt=0;
  for(const i of fg)if(sk[i]&&sid[i]>=0&&own[i]===-1){own[i]=i;Q[qt++]=i}
  const grow=()=>{
    while(qh<qt){
      const p=Q[qh++],x=p%W,y=(p-x)/W;
      for(let k=0;k<8;k++){
        const xx=x+DX[k],yy=y+DY[k];
        if(xx<0||xx>=W||yy<0||yy>=H)continue;
        const q=yy*W+xx;
        if(!A[q]||own[q]!==-1)continue;
        own[q]=own[p];Q[qt++]=q;
      }
    }
  };
  grow();

  // Disconnected weak marks are usually construction sketches or scan noise:
  // do not invent a late dot stroke for them. They are excluded from the ink mask.
  for(let i=0;i<N;i++){
    if(!A[i]||own[i]!==-1)continue;
    const q0=qt;own[i]=i;Q[qt++]=i;grow();
    for(let k=q0;k<qt;k++)own[Q[k]]=-2;
  }

  // Label connected ink objects for ordering. Within each object the next stroke
  // is selected by its nearest endpoint, so neighbouring branches naturally join.
  const cl=new Int32Array(N),cs=[];let C=0;
  for(let i=0;i<N;i++){
    if(!A[i]||cl[i])continue;
    C++;let n2=0;cl[i]=C;Q[0]=i;let h=0,t=1;
    while(h<t){
      const p=Q[h++],x=p%W;n2++;
      for(let k=0;k<8;k++){
        const xx=x+DX[k],yy=((p-x)/W|0)+DY[k];
        if(xx<0||xx>=W||yy<0||yy>=H)continue;
        const q=yy*W+xx;
        if(!A[q]||cl[q])continue;
        cl[q]=C;Q[t++]=q;
      }
    }
    cs[C]=n2;
  }
  strokes.forEach(S2=>{
    const x=Math.max(0,Math.min(W-1,S2.X[0]|0)),y=Math.max(0,Math.min(H-1,S2.Y[0]|0));
    let c=cl[y*W+x];
    if(!c)for(let k=0;k<8;k++){
      const xx=x+DX[k],yy=y+DY[k];
      if(xx<0||xx>=W||yy<0||yy>=H)continue;
      const q=yy*W+xx;
      if(cl[q]){c=cl[q];break}
    }
    S2.comp=c;S2.csz=cs[c]||0;
  });

  const n=strokes.length,used=new Uint8Array(n),order=[];
  let px0=W*.5,py0=0,comp=-1,left2=n;
  const nearest=only=>{
    let bj=-1,bd=1e18,rev=false;
    for(let j=0;j<n;j++){
      if(used[j]||(only>=0&&strokes[j].comp!==only))continue;
      const S2=strokes[j],e=S2.X.length-1;
      const d0=(S2.X[0]-px0)**2+(S2.Y[0]-py0)**2,d1=(S2.X[e]-px0)**2+(S2.Y[e]-py0)**2;
      if(d0<bd){bd=d0;bj=j;rev=false}
      if(d1<bd){bd=d1;bj=j;rev=true}
    }
    return{bj,rev};
  };
  while(left2>0){
    let pick=comp>=0?nearest(comp):{bj:-1};
    if(pick.bj<0){
      if(comp<0){
        let big=0;
        strokes.forEach((S2,j)=>{if(S2.csz>strokes[big].csz)big=j});
        comp=strokes[big].comp;
        const S2=strokes[big];px0=S2.X[0];py0=S2.Y[0];
        pick=nearest(comp);
      }else{
        pick=nearest(-1);
        comp=strokes[pick.bj].comp;
      }
    }
    const S2=strokes[pick.bj];
    used[pick.bj]=1;left2--;S2.rev=pick.rev;order.push(pick.bj);
    const e=pick.rev?0:S2.X.length-1;
    px0=S2.X[e];py0=S2.Y[e];
  }

  // 2-opt shortens travel between strokes without changing the strokes themselves.
  {
    const m=order.length,sx=new Float64Array(m),sy=new Float64Array(m),ex=new Float64Array(m),ey=new Float64Array(m);
    order.forEach((j,k)=>{
      const S2=strokes[j],e=S2.X.length-1,a=S2.rev?e:0,b=S2.rev?0:e;
      sx[k]=S2.X[a];sy[k]=S2.Y[a];ex[k]=S2.X[b];ey[k]=S2.Y[b];
    });
    const D=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
    const flip=(i,j)=>{
      for(;i<j;i++,j--){
        [order[i],order[j]]=[order[j],order[i]];
        let t=sx[i];sx[i]=ex[j];ex[j]=t;
        t=sy[i];sy[i]=ey[j];ey[j]=t;
        t=ex[i];ex[i]=sx[j];sx[j]=t;
        t=ey[i];ey[i]=sy[j];sy[j]=t;
      }
      if(i===j){
        let t=sx[i];sx[i]=ex[i];ex[i]=t;
        t=sy[i];sy[i]=ey[i];ey[i]=t;
      }
    };
    for(let pass=0;pass<12;pass++){
      let better=false;
      for(let i=1;i<m-1;i++)for(let j=i+1;j<m;j++){
        const last=j===m-1;
        const old=D(ex[i-1],ey[i-1],sx[i],sy[i])+(last?0:D(ex[j],ey[j],sx[j+1],sy[j+1]));
        const nw=D(ex[i-1],ey[i-1],ex[j],ey[j])+(last?0:D(sx[i],sy[i],sx[j+1],sy[j+1]));
        if(nw<old-.5){flip(i,j);better=true}
      }
      if(!better)break;
    }
    order.forEach((j,k)=>{
      const S2=strokes[j];
      S2.rev=Math.abs(S2.X[0]-sx[k])+Math.abs(S2.Y[0]-sy[k])>Math.abs(S2.X[S2.X.length-1]-sx[k])+Math.abs(S2.Y[S2.Y.length-1]-sy[k]);
    });
  }

  const rank=new Int32Array(n);order.forEach((j,k)=>rank[j]=k);
  G={seg,W,H,N,A,own,sid,sarc,nodePads,strokes:order.map(j=>strokes[j]),rank,id:(G?G.id:0)+1};
  return G;
}
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
  if(!TX||TX.key!==key){
    const tS=new Float32Array(T.length*2);
    st.forEach((q,k)=>{tS[k*2]=(q.t0-c0)/I.dur;tS[k*2+1]=(q.t1-c0)/I.dur});

    // A graph junction is shared by all incident branches. Give its single centre
    // pixel the time of the first arriving branch; do not draw a circular patch
    // over the outline, which creates visible marker-like bulbs at the joins.
    const nodeTime=new Map();
    const addNodeTime=(id,v)=>{
      if(id==null)return;
      const prev=nodeTime.get(id);
      if(prev==null||v<prev)nodeTime.set(id,v);
    };
    st.forEach(q=>{
      const S2=q.S;
      if(S2.nodeA==null||S2.nodeB==null)return;
      addNodeTime(S2.rev?S2.nodeB:S2.nodeA,(q.t0-c0)/I.dur);
      addNodeTime(S2.rev?S2.nodeA:S2.nodeB,(q.t1-c0)/I.dur);
    });

    const data=new Uint8Array(g.N*4),inv=p=>{
      let x=p;
      for(let it=0;it<5;it++){
        const s=smooth(x),F=.5*x+.5*s-p,dF=.5+3*x*(1-x);
        x=clamp(x-F/Math.max(.2,dF),0,1);
      }
      return x;
    };
    for(let i=0;i<g.N;i++){
      const o=g.own[i];
      if(o<0||g.sid[o]<0)continue;
      const j=g.rank[g.sid[o]],S2=T[j];
      if(!S2)continue;
      let p=S2.len>0?g.sarc[o]/S2.len:0;
      if(S2.rev)p=1-p;
      const v=lerp(tS[j*2],tS[j*2+1],inv(clamp(p,0,1)));
      const q=Math.round(clamp(v,0,1)*65535);
      data[i*4]=q>>8;data[i*4+1]=q&255;data[i*4+3]=255;
    }

    // UNION the physical marker footprint at a junction: a raster line pixel
    // belongs to the earliest incident stroke that could cover it. We only
    // change timestamps for pixels already present in the source line mask;
    // no circles, extra alpha, or thicker outlines are introduced.
    for(const node of g.nodePads){
      const v=nodeTime.get(node.i);
      if(v==null)continue;
      const time=Math.round(clamp(v,0,1)*65535);
      const x0=Math.max(0,Math.floor(node.x-node.r)),x1=Math.min(g.W-1,Math.ceil(node.x+node.r));
      const y0=Math.max(0,Math.floor(node.y-node.r)),y1=Math.min(g.H-1,Math.ceil(node.y+node.r));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const dx=x+.5-node.x,dy=y+.5-node.y;
        if(dx*dx+dy*dy>node.r*node.r)continue;
        const k=(y*g.W+x)*4;
        if(!g.A[y*g.W+x]||data[k+3]===0)continue;
        const old=(data[k]*256+data[k+1]);
        if(time>=old)continue;
        data[k]=time>>8;data[k+1]=time&255;
      }
    }
    TX={key,data,W:g.W,H:g.H}
  }  I.tex=TX;return I}
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
