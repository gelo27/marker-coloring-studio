import {IMP} from './settings.js';
import {SS,clamp,mk} from './utils.js';
/* ================= SEGMENTATION ================= */
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
  ltx.putImageData(lt,0,0);
  const lab=new Int32Array(N),stack=new Int32Array(N),regs=[];let R=0;
  for(let s=0;s<N;s++){
    if(isLine[s]||lab[s])continue;
    R++;let sp=0;stack[sp++]=s;lab[s]=R;
    let cnt=0,x0=W,y0=H,x1=0,y1=0,sx=0,sy=0,sxx=0,syy=0,sxy=0,edge=false;
    while(sp){const p=stack[--sp];const x=p%W,y=(p-x)/W;cnt++;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
      if(x===0||y===0||x===W-1||y===H-1)edge=true;
      if(x>0){const q=p-1;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
      if(x<W-1){const q=p+1;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
      if(y>0){const q=p-W;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
      if(y<H-1){const q=p+W;if(!lab[q]&&!isLine[q]){lab[q]=R;stack[sp++]=q}}
    }
    const cx=sx/cnt,cy=sy/cnt,vxx=sxx/cnt-cx*cx,vyy=syy/cnt-cy*cy,vxy=sxy/cnt-cx*cy;
    regs.push({i:R,lk:-1,area:cnt,x0,y0,x1,y1,cx,cy,edge,ang:.5*Math.atan2(2*vxy,vxx-vyy),elong:Math.sqrt(Math.pow(vxx-vyy,2)+4*vxy*vxy)/(vxx+vyy+1e-6)});
  }
  if(art.idCv){
    const K=art.names.length,votes=new Int32Array((R+1)*(K+1));
    const idd=art.idCv.getContext('2d').getImageData(0,0,W,H).data;
    for(let i=0,j=0;i<N;i++,j+=4){const r=lab[i];if(!r)continue;if(idd[j+1]===200&&idd[j+2]===100&&idd[j]>0&&idd[j]<=K)votes[r*(K+1)+idd[j]]++}
    regs.forEach(g=>{let best=0,bv=0;for(let k=1;k<=K;k++){const v=votes[g.i*(K+1)+k];if(v>bv){bv=v;best=k}}g.id=best?art.names[best-1]:null});
  }
  return {W,H,lab,isLine,lineTexCv,regs,rank:new Int8Array(N)};
}
export function loadArtFromImage(img){
  const maxW=1080*SS;const sc=maxW/img.width;let W=Math.round(img.width*sc),H=Math.round(img.height*sc);
  if(H>1800*SS){const k=1800*SS/H;W=Math.round(W*k);H=Math.round(H*k)}
  const cv=mk(W,H),c=cv.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,W,H);c.drawImage(img,0,0,W,H);
  const colored=isColored(cv);
  return{W,H,srcCv:cv,lineCv:colored?extractLines(cv,IMP.thr):cv,idCv:null,demo:false,colored};
}
export function isColored(cv){const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0,t=0;
  for(let i=0;i<d.length;i+=4*97){t++;const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>60&&mx<252&&(mx-mn)/mx>.22)n++}return n/t>.04}
/* colored page -> clean line art: dark, low-saturation pixels are outline; colored fills become white */
export function extractLines(src,thr){
  const W=src.width,H=src.height,d=src.getContext('2d').getImageData(0,0,W,H).data,out=mk(W,H),oc=out.getContext('2d'),od=oc.createImageData(W,H),o=od.data;
  for(let i=0;i<d.length;i+=4){const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),lum=r*.3+g*.59+b*.11,sat=mx>0?(mx-mn)/mx:0;
    let k=clamp((thr+.07-lum)/.14,0,1)*clamp(1-(sat-.32)/.28,0,1);if(lum<thr*.45)k=1;const v=255*(1-k);o[i]=o[i+1]=o[i+2]=v;o[i+3]=255}
  oc.putImageData(od,0,0);return out;
}
