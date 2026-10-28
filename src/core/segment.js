import {IMP} from './settings.js';
import {SS,clamp,mk} from './utils.js';
import {VEC_MIN_K,vectorUpscale} from './vectorize.js';
/* ================= SEGMENTATION ================= */
/* a zone the user painted with the brush: strokes {e: eraser, r: radius, p: points} in page pixels, drawn at scale k */
export function drawMask(x,strokes,k){x.lineCap='round';x.lineJoin='round';
  for(const st of strokes){x.globalCompositeOperation=st.e?'destination-out':'source-over';const r=st.r*k;
    if(st.p.length===1){x.beginPath();x.arc(st.p[0][0]*k,st.p[0][1]*k,r,0,Math.PI*2);x.fill()}
    else{x.lineWidth=r*2;x.beginPath();st.p.forEach((q,i)=>i?x.lineTo(q[0]*k,q[1]*k):x.moveTo(q[0]*k,q[1]*k));x.stroke()}}
  x.globalCompositeOperation='source-over'}
export function analyze(art){
  const W=art.W,H=art.H,N=W*H;
  const d=art.lineCv.getContext('2d').getImageData(0,0,W,H).data;
  const isLine=new Uint8Array(N);
  const lineTexCv=mk(W,H),ltx=lineTexCv.getContext('2d'),lt=ltx.createImageData(W,H),ld=lt.data;
  for(let i=0,j=0;i<N;i++,j+=4){
    const a=d[j+3]/255,lum=(d[j]*.3+d[j+1]*.59+d[j+2]*.11)/255;
    const drk=a*(1-lum);const k=clamp((drk-.1)/.55,0,1);
    ld[j]=40;ld[j+1]=30;ld[j+2]=48;ld[j+3]=k*255;
    if(drk>IMP.lineK)isLine[i]=1;
  }
  // contours the user drew around zones the outline did not close: they split regions like lines, but leave no ink
  // (zone masks grow over line pixels, so the paint of both sides meets under the invisible wall)
  if(art.walls&&art.walls.length){const wc=mk(W,H),wx=wc.getContext('2d');wx.strokeStyle='#000';wx.lineWidth=2.5*SS;wx.lineCap='round';wx.lineJoin='round';
    for(const p of art.walls){if(p.length<3)continue;wx.beginPath();p.forEach((q,k)=>k?wx.lineTo(q[0],q[1]):wx.moveTo(q[0],q[1]));wx.closePath();wx.stroke()}
    const wd=wx.getImageData(0,0,W,H).data;for(let i=0;i<N;i++)if(wd[i*4+3]>40)isLine[i]=1}
  // painted zones: the outer ring of the painted shape becomes an invisible wall; the drawing's own black lines
  // inside stay lines (paint never goes over them), and the pieces between them are merged into one zone below
  const um=new Uint16Array(N);let mi=0;
  if(art.masks&&art.masks.length)for(const m of art.masks){mi++;if(!m.s||!m.s.length)continue;const mc=mk(W,H),mx=mc.getContext('2d');mx.fillStyle=mx.strokeStyle='#000';drawMask(mx,m.s,1);
    const md=mx.getImageData(0,0,W,H).data,inn=new Uint8Array(N);for(let i=0;i<N;i++)if(md[i*4+3]>127)inn[i]=1;
    for(let i=0;i<N;i++){if(!inn[i])continue;const x=i%W,b=x===0||x===W-1||i<W||i>=N-W||!inn[i-1]||!inn[i+1]||!inn[i-W]||!inn[i+W];if(b){isLine[i]=1;um[i]=0}else if(!isLine[i])um[i]=mi}}
  ltx.putImageData(lt,0,0);
  const lab=new Int32Array(N),stack=new Int32Array(N);let regs=[],R=0;
  for(let s=0;s<N;s++){
    if(isLine[s]||lab[s])continue;
    R++;let sp=0;stack[sp++]=s;lab[s]=R;
    let cnt=0,x0=W,y0=H,x1=0,y1=0,sx=0,sy=0,sxx=0,syy=0,sxy=0,edge=false,bord=0;
    while(sp){const p=stack[--sp];const x=p%W,y=(p-x)/W;cnt++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
      if(x===0||y===0||x===W-1||y===H-1){edge=true;bord++}
      if(x>0){const q=p-1;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
      if(x<W-1){const q=p+1;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
      if(y>0){const q=p-W;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
      if(y<H-1){const q=p+W;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
    }
    const cx=sx/cnt,cy=sy/cnt,vxx=sxx/cnt-cx*cx,vyy=syy/cnt-cy*cy,vxy=sxy/cnt-cx*cy;
    regs.push({i:R,lk:-1,user:!!um[s],area:cnt,x0,y0,x1,y1,cx,cy,edge,bord:bord/(2*(W+H)-4),ang:.5*Math.atan2(2*vxy,vxx-vyy),elong:Math.sqrt(Math.pow(vxx-vyy,2)+4*vxy*vxy)/(vxx+vyy+1e-6)});
  }
  // how much of each region touching the page edge is bare paper in a coloured source: a full-bleed picture fills its
  // sky and ground right up to the edge, while the margin round a framed drawing stays white
  if(art.colored&&art.srcCv){const sd=art.srcCv.getContext('2d').getImageData(0,0,W,H).data,pp=new Int32Array(R+1),pn=new Int32Array(R+1);
    for(let i=0,j=0;i<N;i+=3,j+=12){const r=lab[i];if(!r)continue;const a=sd[j],b=sd[j+1],c=sd[j+2],mx=Math.max(a,b,c),mn=Math.min(a,b,c);pn[r]++;if(mx>225&&(mx-mn)<.08*mx)pp[r]++}
    regs.forEach(g=>{g.paper=pn[g.i]?pp[g.i]/pn[g.i]:1})}
  if(art.idCv){
    const K=art.names.length,votes=new Int32Array((R+1)*(K+1));
    const idd=art.idCv.getContext('2d').getImageData(0,0,W,H).data;
    for(let i=0,j=0;i<N;i++,j+=4){const r=lab[i];if(!r)continue;if(idd[j+1]===200&&idd[j+2]===100&&idd[j]>0&&idd[j]<=K)votes[r*(K+1)+idd[j]]++}
    regs.forEach(g=>{let best=0,bv=0;for(let k=1;k<=K;k++){const v=votes[g.i*(K+1)+k];if(v>bv){bv=v;best=k}}g.id=best?art.names[best-1]:null});
  }
  // merge the pieces of each painted zone into one region (the zone may consist of several parts between lines)
  if(mi){const into=new Int32Array(R+1),byI=new Map(regs.map(g=>[g.i,g]));
    for(let i=0;i<N;i++){const k=um[i],l=lab[i];if(!k||!l||into[l])continue;into[l]=-k}
    const first=new Map();for(let l=1;l<=R;l++){if(into[l]>=0){into[l]=0;continue}const k=-into[l];if(!first.has(k)){first.set(k,l);into[l]=0}else into[l]=first.get(k)}
    let any=false;for(let l=1;l<=R;l++)if(into[l]){any=true;const a=byI.get(into[l]),b=byI.get(l),n=a.area+b.area;
      a.cx=(a.cx*a.area+b.cx*b.area)/n;a.cy=(a.cy*a.area+b.cy*b.area)/n;a.area=n;a.x0=Math.min(a.x0,b.x0);a.y0=Math.min(a.y0,b.y0);a.x1=Math.max(a.x1,b.x1);a.y1=Math.max(a.y1,b.y1);a.edge=a.edge||b.edge;a.bord=(a.bord||0)+(b.bord||0);b.gone=true}
    if(any){for(let i=0;i<N;i++){const l=lab[i];if(l&&into[l])lab[i]=into[l]}regs=regs.filter(g=>!g.gone)}
    first.forEach(l=>{const g=byI.get(l);if(g)g.user=true})}
  // zones merged by hand (Shift-select + «Об'єднати»): every group holds one point inside each of its zones; the zones
  // those points fall in now become one. Points rather than ids, so a merge survives re-segmenting (masks, new settings)
  if(art.merges&&art.merges.length){const byI=new Map(regs.map(g=>[g.i,g])),into=new Int32Array(R+1),root=l=>{while(into[l])l=into[l];return l};let any=false;
    for(const grp of art.merges){const ls=[...new Set(grp.map(p=>{const x=Math.round(p[0]),y=Math.round(p[1]);return x>=0&&y>=0&&x<W&&y<H?lab[y*W+x]:0}).filter(Boolean).map(root))];if(ls.length<2)continue;
      const a=byI.get(ls[0]);if(!a)continue;
      for(const l of ls.slice(1)){const b=byI.get(l);if(!b||b.gone)continue;const n=a.area+b.area;
        a.cx=(a.cx*a.area+b.cx*b.area)/n;a.cy=(a.cy*a.area+b.cy*b.area)/n;a.area=n;a.x0=Math.min(a.x0,b.x0);a.y0=Math.min(a.y0,b.y0);a.x1=Math.max(a.x1,b.x1);a.y1=Math.max(a.y1,b.y1);a.edge=a.edge||b.edge;a.bord=(a.bord||0)+(b.bord||0);a.user=a.user||b.user;
        b.gone=true;into[l]=ls[0];any=true}}
    if(any){for(let i=0;i<N;i++){const l=lab[i];if(l&&into[l])lab[i]=root(l)}regs=regs.filter(g=>!g.gone)}}
  return {W,H,lab,isLine,lineTexCv,regs,rank:new Int8Array(N)};
}
export function loadArtFromImage(img){
  const maxW=1080*SS;const sc=maxW/img.width;let W=Math.round(img.width*sc),H=Math.round(img.height*sc);
  if(H>1800*SS){const k=1800*SS/H;W=Math.round(W*k);H=Math.round(H*k)}
  const cv=mk(W,H),c=cv.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,W,H);c.drawImage(img,0,0,W,H);
  const colored=isColored(cv),a={W,H,srcCv:cv,lineCv:colored?extractLines(cv,IMP.thr):cv,idCv:null,demo:false,colored};
  // a small clean page: its outline is traced and filled again at the working size instead of stretching the pixels
  if(!colored&&W/img.width>=VEC_MIN_K){const raw=mk(img.width,img.height),rx=raw.getContext('2d',{willReadFrequently:true});rx.fillStyle='#fff';rx.fillRect(0,0,raw.width,raw.height);rx.drawImage(img,0,0);
    a.rawCv=raw;retrace(a)}
  return a;
}
/* the page's lines from its own-resolution copy: traced when IMP.vec is on, otherwise just stretched */
export function retrace(a){if(!a.rawCv)return;
  if(IMP.vec){a.lineCv=a.srcCv=vectorUpscale(a.rawCv,a.W,a.H,IMP.lineK,IMP.vecSm);a.vec=+(a.W/a.rawCv.width).toFixed(1)}
  else{const cv=mk(a.W,a.H),c=cv.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,a.W,a.H);c.drawImage(a.rawCv,0,0,a.W,a.H);a.lineCv=a.srcCv=cv;a.vec=0}}
export function isColored(cv){const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0,t=0;
  for(let i=0;i<d.length;i+=4*97){t++;const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>60&&mx<252&&(mx-mn)/mx>.22)n++}return n/t>.04}
/* colored page -> clean line art: dark, low-saturation pixels are outline; colored fills become white */
export function extractLines(src,thr){
  const W=src.width,H=src.height,d=src.getContext('2d').getImageData(0,0,W,H).data,out=mk(W,H),oc=out.getContext('2d'),od=oc.createImageData(W,H),o=od.data;
  for(let i=0;i<d.length;i+=4){const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),lum=r*.3+g*.59+b*.11,sat=mx>0?(mx-mn)/mx:0;
    let k=clamp((thr+.07-lum)/.14,0,1)*clamp(1-(sat-.32)/.28,0,1);if(lum<thr*.45)k=1;const v=255*(1-k);o[i]=o[i+1]=o[i+2]=v;o[i+3]=255}
  oc.putImageData(od,0,0);return out;
}
