import {mk} from '../core/utils.js';
/* ================= LINE DISTANCE FIELD =================
   Close-ups magnify the page's line art past its own resolution: a plain texture then shows soft, stepped edges.
   Instead every texel keeps its signed distance to the outline (from the antialiased coverage, to sub-pixel), and the
   paper shader cuts the edge from the interpolated distance one screen pixel wide: crisp curves at any zoom.
   Stored in R as 0.5 + d / (2·SD_RANGE), d > 0 inside the line, in texels. */
export const SD_RANGE=4;
const INF=1e20;
/* squared Euclidean distance transform along one row or column (Felzenszwalb & Huttenlocher) */
function edt1d(g,off,stride,n,f,v,z){
  v[0]=0;z[0]=-INF;z[1]=INF;f[0]=g[off];
  for(let q=1,k=0,s=0;q<n;q++){f[q]=g[off+q*stride];const q2=q*q;
    do{const r=v[k];s=(f[q]-f[r]+q2-r*r)/(q-r)/2}while(s<=z[k]&&--k>-1);
    k++;v[k]=q;z[k]=s;z[k+1]=INF}
  for(let q=0,k=0;q<n;q++){while(z[k+1]<q)k++;const r=v[k],d=q-r;g[off+q*stride]=f[r]+d*d}}
function edt(g,w,h){const n=Math.max(w,h),f=new Float64Array(n),v=new Uint32Array(n),z=new Float64Array(n+1);
  for(let x=0;x<w;x++)edt1d(g,x,w,h,f,v,z);for(let y=0;y<h;y++)edt1d(g,y*w,1,w,f,v,z)}
export function lineSdf(lineCv){
  const W=lineCv.width,H=lineCv.height,N=W*H,src=lineCv.getContext('2d').getImageData(0,0,W,H).data;
  // coverage seeds the distance to the 0.5 contour inside edge texels (as in Mapbox's tiny-sdf)
  const out=new Float32Array(N),inn=new Float32Array(N);
  for(let i=0;i<N;i++){const a=src[i*4+3]/255;
    if(a>=1){out[i]=0;inn[i]=INF}else if(a<=0){out[i]=INF;inn[i]=0}else{const o=Math.max(0,.5-a),q=Math.max(0,a-.5);out[i]=o*o;inn[i]=q*q}}
  edt(out,W,H);edt(inn,W,H);
  const cv=mk(W,H),cx=cv.getContext('2d'),id=cx.createImageData(W,H),D=id.data,k=127.5/SD_RANGE;
  for(let i=0,j=0;i<N;i++,j+=4){const d=Math.sqrt(inn[i])-Math.sqrt(out[i]),v=Math.max(0,Math.min(255,Math.round(127.5+d*k)));D[j]=D[j+1]=D[j+2]=v;D[j+3]=255}
  cx.putImageData(id,0,0);return cv}
