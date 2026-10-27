import {clamp,mk} from './utils.js';
/* ================= VECTOR UPSCALE ================= */
/* A small black-and-white page stretched to the working size gets soft, stepped lines. Instead its outline is traced at
   the source resolution - iso-lines of the lightly blurred darkness, crossing points interpolated to sub-pixel - and the
   contours are filled again as smooth curves at the working size: crisp antialiased lines at any scale. */
export const VEC_MIN_K=1.25; // the upscale from which tracing pays off; bigger pages are only stretched

/* src: the page at its own resolution on white; W,H: the working size; lev: darkness counted as ink (0..1);
   sm: smoothing 0..3 (blur of the darkness before tracing - irons out JPEG noise and pixel steps, rounds tiny details) */
export function vectorUpscale(src,W,H,lev=.42,sm=1){
  const w=src.width,h=src.height,N=w*h,d=src.getContext('2d').getImageData(0,0,w,h).data;
  // darkness stretched between the paper and the ink levels, so grey scans and faded prints trace like clean ones
  const L=new Uint8Array(N),hist=new Uint32Array(256);
  for(let i=0,j=0;i<N;i++,j+=4){const l=Math.round(d[j]*.3+d[j+1]*.59+d[j+2]*.11);L[i]=l;hist[l]++}
  const pct=q=>{let s=0;const t=q*N;for(let v=0;v<256;v++){s+=hist[v];if(s>=t)return v}return 255};
  const ink=Math.min(pct(.01),90),paper=Math.max(pct(.6),160),span=paper-ink;
  // padded by one sample of paper on every side, so every contour closes
  const pw=w+2,ph=h+2,P=new Float32Array(pw*ph);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)P[(y+1)*pw+x+1]=clamp((paper-L[y*w+x])/span,0,1);
  blur(P,pw,ph,.25+.25*sm);
  // marching squares, every segment directed so the ink stays on one side: an edge crossed by the contour starts exactly
  // one segment and ends exactly one, so following them walks closed loops. Edge id: (sample index)*2 + (0 across, 1 down)
  const nx=new Map();
  for(let y=0;y<ph-1;y++)for(let x=0;x<pw-1;x++){const k=y*pw+x,a=P[k],b=P[k+1],c=P[k+pw+1],e=P[k+pw];
    const m=(a>lev)|(b>lev)<<1|(c>lev)<<2|(e>lev)<<3;if(m===0||m===15)continue;
    // the cell's sides clockwise from the top-left corner: top a-b, right b-c, bottom c-d, left d-a
    const sides=[[k*2,a,b],[(k+1)*2+1,b,c],[(k+pw)*2,c,e],[k*2+1,e,a]],cr=[];
    for(const [id,u,v] of sides)if((u>lev)!==(v>lev))cr.push([id,v>lev]); // [edge, entering the ink]
    if(cr.length===2){const [p,q]=cr;if(p[1])nx.set(q[0],p[0]);else nx.set(p[0],q[0]);continue}
    // a saddle: the centre decides whether the two ink corners touch
    const inC=(a+b+c+e)/4>lev;
    for(let i=0;i<4;i++){const p=cr[i],q=cr[(i+1)%4];if(inC&&!p[1])nx.set(p[0],q[0]);else if(!inC&&p[1])nx.set(q[0],p[0])}}
  const pt=id=>{const k=id>>1,x=k%pw,y=(k-x)/pw,u=P[k],v=id&1?P[k+pw]:P[k+1],t=(lev-u)/(v-u);return id&1?[x,y+t]:[x+t,y]};
  // samples sit at pixel centres: padded sample x is source pixel x-1, centred at x-.5 source pixels
  const kx=W/w,ky=H/h,path=new Path2D();let loops=0;
  for(const s of nx.keys()){if(nx.get(s)<0)continue;const q=[];let id=s;
    do{q.push(pt(id));const n=nx.get(id);nx.set(id,-1);id=n}while(id!==undefined&&id>=0&&id!==s);
    if(q.length<3)continue;let ar=0;for(let i=0,j=q.length-1;i<q.length;j=i++)ar+=(q[j][0]-q[i][0])*(q[j][1]+q[i][1]);
    if(Math.abs(ar)/2<1.2)continue; // specks of dust and pinholes in the ink
    for(let i=0;i<q.length;i++){q[i][0]=(q[i][0]-.5)*kx;q[i][1]=(q[i][1]-.5)*ky}
    // a smooth curve through the midpoints, the traced points as its control points
    const n=q.length,mid=i=>{const p=q[i%n],r=q[(i+1)%n];return[(p[0]+r[0])/2,(p[1]+r[1])/2]};
    let m=mid(0);path.moveTo(m[0],m[1]);for(let i=1;i<=n;i++){m=mid(i);path.quadraticCurveTo(q[i%n][0],q[i%n][1],m[0],m[1])}
    path.closePath();loops++}
  const out=mk(W,H),o=out.getContext('2d',{willReadFrequently:true});o.fillStyle='#fff';o.fillRect(0,0,W,H);
  o.fillStyle='#111';o.fill(path,'evenodd');out.loops=loops;return out;
}
/* separable gaussian in place */
function blur(P,w,h,s){
  const r=Math.ceil(s*2.5),K=new Float32Array(r*2+1);let t=0;for(let i=-r;i<=r;i++){K[i+r]=Math.exp(-i*i/(2*s*s));t+=K[i+r]}for(let i=0;i<K.length;i++)K[i]/=t;
  const T=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let i=-r;i<=r;i++){const xx=x+i<0?0:x+i>=w?w-1:x+i;v+=P[y*w+xx]*K[i+r]}T[y*w+x]=v}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let i=-r;i<=r;i++){const yy=y+i<0?0:y+i>=h?h-1:y+i;v+=T[yy*w+x]*K[i+r]}P[y*w+x]=v}
}
