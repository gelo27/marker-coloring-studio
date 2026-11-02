import {PEN,PEN_BRUSHES} from '../core/settings.js';
import {legPt,mkLeg,vn1} from '../core/strokes.js';
import {SS,TAU,clamp,mk,rngOf,smooth,vnoise} from '../core/utils.js';
import {liqShades} from '../core/zones.js';
/* ================= COLOURED-PENCIL BRUSHES (WebGL2) =================
   Adapted from the Atelier brush engine. A stroke is a row of stamps laid along the leg: every stamp is a procedural
   tip shape whose depth (pressure × flow × shape) is compared with the height of a procedural paper grain, so the
   pigment catches the tops of the tooth first and fills the valleys as the pressure grows. Stamps of one leg merge
   with MAX (no darker beads where they overlap); legs are laid over each other like separate pencil strokes.
   The ends taper where the pencil is lifted. Stamps are deterministic per leg, so a half-drawn leg is exactly the
   start of the finished one.
   Smooth transition: across a zone the hand presses harder towards one side, so the pigment fills more of the
   grain there and is laid more thinly towards the other side (the paper shows through); the heavy side also leans
   to a deeper neighbouring hue and the light side to a paler one, like a second pencil layered over the first. */
const GRAIN_IDS={tooth:0,weave:1,grit:2,fiber:3,speck:4},SHAPE_IDS={round:10,soft:11,pencil:12,bristle:13,flat:14,messy:15,shaggy:16,spatter:17,speckle:18,chalk:19};

const VS_FULL=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
/* procedural grain (mode 0..4: R height, G pigment clumps, B tone) and tip shapes (mode 10..19) */
const FS_GEN=`#version 300 es
precision highp float;
uniform int u_mode; uniform float u_res; uniform float u_seed;
out vec4 o;
const float PI=3.14159265;
vec2 h2(vec2 p){ p+=u_seed*vec2(.137,.271); p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
float h1(vec2 p){ return fract(sin(dot(p+u_seed*.731,vec2(12.9898,78.233)))*43758.5453); }
float gn(vec2 p, vec2 per){
  vec2 i=floor(p), f=fract(p), u=f*f*f*(f*(f*6.-15.)+10.);
  vec2 a=h2(mod(i,per))*2.-1., b=h2(mod(i+vec2(1,0),per))*2.-1., c=h2(mod(i+vec2(0,1),per))*2.-1., d=h2(mod(i+vec2(1,1),per))*2.-1.;
  float v=mix(mix(dot(a,f),dot(b,f-vec2(1,0)),u.x), mix(dot(c,f-vec2(0,1)),dot(d,f-vec2(1,1)),u.x), u.y);
  return clamp(.5+.75*v,0.,1.);
}
float fbm(vec2 uv, vec2 per, int oct){ float s=0.,a=.5,n=0.; for(int k=0;k<6;k++){ if(k>=oct) break; s+=a*gn(uv*per,per); n+=a; per*=2.; a*=.5; } return s/n; }
vec3 wor(vec2 uv, float per){
  vec2 p=uv*per, i=floor(p), f=fract(p); float d1=9., d2=9., id=0.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 c=vec2(x,y), cell=mod(i+c,per), r=c+h2(cell)-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; id=h1(cell); } else if(d<d2) d2=d;
  }
  return vec3(sqrt(d1),sqrt(d2),id);
}
float nn(vec2 p){ return gn(p+17.3, vec2(4096.)); }
float nf(vec2 p,int oct){ float s=0.,a=.5,n=0.; for(int k=0;k<6;k++){ if(k>=oct) break; s+=a*nn(p); n+=a; p*=2.03; a*=.5; } return s/n; }

void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  if(u_mode<10){
    float ht=0.;                                   // висота «зуба» паперу: 1 = вершина (фарба лягає першою)
    if(u_mode==0){        // cold-press tooth
      vec3 w=wor(uv,96.);
      ht=.22*(1.-smoothstep(0.,.9,w.x)) + .45*fbm(uv,vec2(48.),4) + .33*fbm(uv,vec2(160.),2);
    } else if(u_mode==1){ // canvas weave
      float wp=(fbm(uv,vec2(8.),3)-.5)*.55;
      vec2 q=uv*84.+wp, c=floor(q), f=fract(q);
      float chk=mod(c.x+c.y,2.);
      float hx=sin(PI*f.y)*(.5+.5*sin(PI*f.x)), hy=sin(PI*f.x)*(.5+.5*sin(PI*f.y));
      ht=.7*mix(hx,hy,chk) + .3*fbm(uv,vec2(64.),3);
    } else if(u_mode==2){ // coarse grit
      vec3 w=wor(uv,44.);
      ht=.42*fbm(uv,vec2(20.),5) + .2*(1.-smoothstep(0.,1.,w.x)) + .38*fbm(uv,vec2(128.),2);
    } else if(u_mode==3){ // fibre (анізотропний)
      ht=.55*fbm(uv,vec2(14.,112.),3) + .45*fbm(uv,vec2(64.),3);
    } else if(u_mode==5){ // папір для фону: дрібна фактура + волокна
      ht=.5*fbm(uv,vec2(40.),4) + .3*fbm(uv,vec2(10.,80.),3) + .2*fbm(uv,vec2(160.),2);
    } else {              // sparse speckle
      vec3 w=wor(uv,60.);
      float spot=step(.55,w.z)*(1.-smoothstep(.06,.4,w.x));
      ht=.8*spot + .2*fbm(uv,vec2(32.),3);
    }
    vec3 w2=wor(uv,140.);
    float spk=step(.88,w2.z)*(1.-smoothstep(.1,.5,w2.x));       // згустки пігменту
    float tone=fbm(uv,vec2(6.),3);
    o=vec4(1.-ht, spk, tone, 1.);
    return;
  }
  vec2 q=uv*2.-1.; float r=length(q); float an=atan(q.y,q.x); vec2 cs=vec2(cos(an),sin(an));
  float v=0.;
  if(u_mode==10){ v=1.-smoothstep(.8,.97,r+.05*(nn(q*5.)-.5)); }
  else if(u_mode==11){ v=exp(-r*r*3.)*(1.-smoothstep(.8,1.,r)); }
  else if(u_mode==12){ float e=1.-smoothstep(.45,.96,r+.2*(nf(q*3.,3)-.5)); v=e*(.6+.4*nn(q*16.)); }
  else if(u_mode==13){ // bristle cluster
    for(int k=0;k<70;k++){ float fk=float(k); vec2 hh=h2(vec2(fk,3.)); float rr=sqrt(hh.x)*.76, aa=hh.y*6.2832;
      vec2 c=rr*vec2(cos(aa),sin(aa)); float s=.09+.08*h1(vec2(fk,7.)), it=.6+.4*h1(vec2(fk,11.));
      v=max(v, it*(1.-smoothstep(s*.35,s,length(q-c)))); }
    v*=.8+.2*nn(q*10.);
  }
  else if(u_mode==14){ // flat chisel (довга вісь поперек штриха)
    float d=length(max(abs(q)-vec2(.1,.6),0.))-.24;
    v=(1.-smoothstep(-.07,.04,d+.07*(nn(q*7.)-.5)))*(.82+.18*nn(q*vec2(3.,22.)));
  }
  else if(u_mode==15){ // messy: паралельні лінії
    for(int k=0;k<5;k++){ float fk=float(k); float yk=(h1(vec2(fk,1.))-.5)*1.35; float th=.035+.05*h1(vec2(fk,2.)), it=.45+.55*h1(vec2(fk,3.));
      float dy=abs(q.y-yk-.08*(nn(vec2(q.x*2.,fk*5.))-.5)); float ln=1.-smoothstep(th*.4,th,dy); float ax=1.-smoothstep(.55,.95,abs(q.x));
      v=max(v, ln*ax*it*(.55+.45*nn(vec2(q.x*9.,fk*3.7)))); }
  }
  else if(u_mode==16){ // shaggy
    float edge=.5+.42*pow(nn(cs*22.+3.),1.6)+.06*nn(cs*5.);
    v=(1.-smoothstep(edge-.12,edge+.02,r))*(.7+.3*nn(q*12.));
  }
  else if(u_mode==17){ // spatter blobs
    for(int k=0;k<12;k++){ float fk=float(k); vec2 c=(h2(vec2(fk,5.))-.5)*1.3; float rad=.06+.18*h1(vec2(fk,9.));
      float d=length(q-c)/rad+.55*(nf((q-c)*6.+fk*3.1,3)-.5);
      v=max(v,(1.-smoothstep(.75,1.,d))*(.6+.4*h1(vec2(fk,13.)))); }
  }
  else if(u_mode==18){ // speckles
    for(int k=0;k<55;k++){ float fk=float(k); vec2 hh=h2(vec2(fk,21.)); float rr=sqrt(hh.x)*.82, aa=hh.y*6.2832;
      vec2 c=rr*vec2(cos(aa),sin(aa)); float s=.035+.07*pow(h1(vec2(fk,23.)),2.);
      v=max(v,(.5+.5*h1(vec2(fk,29.)))*(1.-smoothstep(s*.3,s,length(q-c)))); }
  }
  else { float e=1.-smoothstep(.58,.97,r+.24*(nf(q*2.2,3)-.5)); v=e*(.85+.15*nn(q*9.)); } // chalk
  v*=1.-smoothstep(.95,1.,max(abs(q.x),abs(q.y)));
  o=vec4(v,v,v,1.);
}`;
/* one stamp: page position, radii, angle, flow, seed, random; drawn into a box whose top-left is u_org on the page */
const VS_STAMP=`#version 300 es
layout(location=0) in vec2 a_q;layout(location=1) in vec4 a_i0;layout(location=2) in vec4 a_i1;layout(location=3) in float a_m;
uniform vec2 u_res,u_org;out vec2 v_l;out vec3 v_d;out vec2 v_g;out vec2 v_r;out float v_m;
void main(){float c=cos(a_i1.x),s=sin(a_i1.x);vec2 loc=a_q*a_i0.zw;vec2 p=a_i0.xy+vec2(c*loc.x-s*loc.y,s*loc.x+c*loc.y);
  vec2 q=p-u_org;gl_Position=vec4(q.x/u_res.x*2.-1.,1.-q.y/u_res.y*2.,0.,1.);
  v_l=a_q;v_d=vec3(a_i1.y,a_i1.z,a_i1.w);v_g=p;v_r=a_i0.zw;v_m=a_m;}`;
const FS_STAMP=`#version 300 es
precision highp float;in vec2 v_l;in vec3 v_d;in vec2 v_g;in vec2 v_r;in float v_m;
uniform sampler2D u_shape,u_grain;uniform vec3 u_color,u_dark,u_light;
uniform float u_gs,u_depth,u_hard,u_gain,u_gamt,u_streak,u_streakF,u_sseed,u_speck,u_valJ;uniform vec2 u_gofs;out vec4 o;
float h1(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
float n1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(h1(i),h1(i+1.),f);}
void main(){vec2 suv=v_l*.5+.5;if(fract(v_d.y*7.31)>.5)suv.x=1.-suv.x;
  float sh=texture(u_shape,suv).r;if(sh<.002)discard;
  vec4 gr=texture(u_grain,v_g*u_gs+u_gofs);
  float ly=v_l.y*v_r.y,s=.55*n1(ly*u_streakF+u_sseed)+.45*n1(ly*u_streakF*2.7+u_sseed*1.7+19.);
  float dep=sh*v_d.x*(1.+u_streak*(s*2.-1.))*u_gain;
  float aH=smoothstep(gr.r-u_depth,gr.r+u_depth,dep),aM=clamp(dep,0.,1.)*(1.-u_gamt*gr.r);
  float a=clamp(mix(aM,aH,u_hard),0.,1.);if(a<.003)discard;
  vec3 col=(v_m>0.?mix(u_color,u_dark,v_m):mix(u_color,u_light,-v_m))*(1.-u_speck*gr.g)*(.95+.1*gr.b)*(1.+u_valJ*(v_d.z-.5));
  o=vec4(clamp(col,0.,1.)*a,a);}`;
/* one finished leg (premultiplied) laid over what is already in the box */
const FS_COMP=`#version 300 es
precision highp float;uniform sampler2D u_tex;out vec4 o;
void main(){o=texelFetch(u_tex,ivec2(gl_FragCoord.xy),0);}`;

const SCAP=4096,FL=9;
let G=null,gl=null;
function prog(vs,fs){
  const sh=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const f=gl.getActiveUniform(p,i);u[f.name]=gl.getUniformLocation(p,f.name)}
  return{p,u}}
function tex(w,h,px,filter,wrap){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,px||null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter===gl.NEAREST?gl.NEAREST:gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);return t}
/* grain and shape textures are rendered on the GPU, read back, the grain's height equalised (pressure then behaves
   the same on every grain) and uploaded with mipmaps; made on first use */
function genTex(mode,size,isGrain){
  const t=tex(size,size,null,gl.NEAREST,gl.CLAMP_TO_EDGE),fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
  gl.viewport(0,0,size,size);gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.useProgram(G.gen.p);
  gl.uniform1i(G.gen.u.u_mode,mode);gl.uniform1f(G.gen.u.u_res,size);gl.uniform1f(G.gen.u.u_seed,mode*3.17+1);gl.bindVertexArray(G.empty);gl.drawArrays(gl.TRIANGLES,0,3);
  const px=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,px);gl.deleteFramebuffer(fb);gl.deleteTexture(t);
  if(isGrain){const hist=new Float64Array(256);for(let i=0;i<px.length;i+=4)hist[px[i]]++;const map=new Uint8Array(256),N=size*size;let acc=0;
    for(let i=0;i<256;i++){const c0=acc;acc+=hist[i];map[i]=Math.round((c0+acc)*.5/N*255)}for(let i=0;i<px.length;i+=4)px[i]=map[px[i]]}
  const out=tex(size,size,px,gl.LINEAR_MIPMAP_LINEAR,isGrain?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);return out}
const grainTex=k=>G.grains[k]||(G.grains[k]=genTex(GRAIN_IDS[k],512,true));
const shapeTex=k=>G.shapes[k]||(G.shapes[k]=genTex(SHAPE_IDS[k],256,false));

/* the engine, created on first use; null without WebGL2 (the classic pencil is used then) */
function penGL(){
  if(G!==null)return G||null;G=false;
  try{
    const cv=mk(256,256);gl=cv.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
    if(!gl)return null;
    const g={cv,grains:{},shapes:{},empty:gl.createVertexArray(),inst:new Float32Array(SCAP*FL),scr:null,sw:0,sh:0};G=g;
    g.gen=prog(VS_FULL,FS_GEN);g.stamp=prog(VS_STAMP,FS_STAMP);g.comp=prog(VS_FULL,FS_COMP);
    g.vao=gl.createVertexArray();gl.bindVertexArray(g.vao);
    const qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    g.buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,g.buf);gl.bufferData(gl.ARRAY_BUFFER,g.inst.byteLength,gl.STREAM_DRAW);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,FL*4,0);gl.vertexAttribDivisor(1,1);
    gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,FL*4,16);gl.vertexAttribDivisor(2,1);
    gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,1,gl.FLOAT,false,FL*4,32);gl.vertexAttribDivisor(3,1);gl.bindVertexArray(null);
    g.max=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0],8192);
  }catch(e){console.warn('pencil brushes unavailable, using the classic pencil',e);G=false}
  return G||null;
}
/* the brush the pencil uses now, or null for the classic one */
export function penBrush(){const B=PEN_BRUSHES[PEN.brush];return B&&penGL()?B:null}
/* the canvas and the scratch target (one leg) grow to the largest box asked for */
function ensure(w,h){
  if(G.scr&&G.sw>=w&&G.sh>=h)return;
  const W=Math.max(w,G.sw),H=Math.max(h,G.sh);G.cv.width=W;G.cv.height=H;G.sw=W;G.sh=H;
  if(G.scr){gl.deleteFramebuffer(G.scr.fb);gl.deleteTexture(G.scr.t)}
  const t=tex(W,H,null,gl.NEAREST,gl.CLAMP_TO_EDGE),fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);G.scr={t,fb}}

const gap=l=>!l||l.kind==='jump'||l.kind==='pause';
/* where the pencil is lifted: before a jump or a pause (and at both ends of the path) the leg's end tapers */
function lifts(r){if(r.pzL===r.legs)return;const L=r.legs;L.forEach((l,i)=>{l.pzS=gap(L[i-1]);l.pzE=gap(L[i+1]);l.pz=null});r.pzL=L}
/* the zone's transition: t(x,y) is 0 where the pencil barely touches and 1 where it presses hardest. The direction
   across the zone's box is its own, bent by slow noise so the change is not a ruler-straight band; small zones get
   a gentler one. null when it is off (or for the brush previews, which have no zone) */
function gradOf(r){
  const s=PEN.grad||0;if(!(s>0)||r.x0===undefined)return null;
  const key=s+'|'+r.color+'|'+r.x0+'|'+r.y0+'|'+r.x1+'|'+r.y1;if(r.pgK===key)return r.pg;
  const rnd=rngOf((r.i||0)*313+(r.lk||0)*7+11),a=rnd()*TAU,c=Math.cos(a),sn=Math.sin(a),cx=(r.x0+r.x1)/2,cy=(r.y0+r.y1)/2;
  const ext=Math.abs((r.x1-r.x0)*c)+Math.abs((r.y1-r.y0)*sn)+1,f=1.6/Math.max(r.x1-r.x0,r.y1-r.y0,1),o=rnd()*100,sh=liqShades(r.color,r.i||0);
  const S=s*(.35+.65*clamp(ext/(90*SS),0,1));
  r.pg={s:S,dark:hexRgb(sh[0]),light:hexRgb(sh[1]),t:(x,y)=>smooth(clamp(.5+((x-cx)*c+(y-cy)*sn)/ext+.45*(vnoise(x*f+o,y*f+o*.7)-.5),0,1))};r.pgK=key;return r.pg}
/* the stamps of a leg: [x, y, rx, ry, angle, flow, seed, rand, hue shift] each, with their place on the leg (t) */
function legStamps(l,r,B){
  const g=gradOf(r),key=B.id+'|'+r.w+'|'+(g?r.pgK:'');if(l.pz&&l.pz.key===key)return l.pz;
  // the stamps are wider than the spacing of the strokes and the contour is traced broader and firmer, so no paper
  // is left along the drawing's lines (what spills over is cut off by the zone's mask)
  const edge=l.kind==='trace',W=r.w*(l.wm||1)*(edge?2:1.4),k=W/B.size,seed=Math.round(l.p0[0]*7.3+l.p0[1]*13.1+l.p1[0]*3.7+l.p1[1]*1.9),rnd=rngOf(seed*31+B.size*977);
  const pb=clamp((l.alpha||.76)*1.1,edge?.9:.35,1),ns=rnd()*500,N=Math.max(2,Math.ceil(l.len*1.25/(.4*SS)));
  // the leg as a fine polyline with distances along it
  const px=new Float32Array(N+1),py=new Float32Array(N+1),pd=new Float32Array(N+1);
  for(let i=0;i<=N;i++){const p=legPt(l,i/N);px[i]=p[0];py[i]=p[1];pd[i]=i?pd[i-1]+Math.hypot(p[0]-px[i-1],p[1]-py[i-1]):0}
  const len=pd[N],raw=[],tMin=(B.taperS>0||B.taperE>0)?Math.max(B.taperMin,.4):1;
  let since=0,step=0,dx=1,dy=0,have=false;
  // a joined leg starts half a step in, so the joint is not stamped twice
  const emit=i=>{const d=pd[i],gt=g?g.t(px[i],py[i]):1,p=pb*(.84+.16*vn1(ns+d/(W*2.2)))*(g?1-g.s*(edge?.35:.62)*(1-gt):1);const last=raw[raw.length-1];
    if(last){const ex=px[i]-last.x,ey=py[i]-last.y,dd=Math.hypot(ex,ey);if(dd>1e-4){const ux=ex/dd,uy=ey/dd;if(!have){dx=ux;dy=uy;have=true;if(raw.length===1)last.dir=Math.atan2(uy,ux)}else{dx=dx*.8+ux*.2;dy=dy*.8+uy*.2}}}
    else if(N>0){const ex=px[Math.min(N,i+2)]-px[i],ey=py[Math.min(N,i+2)]-py[i];if(Math.hypot(ex,ey)>1e-4){dx=ex;dy=ey}}
    raw.push({x:px[i],y:py[i],d,p,t:i/N,m:g?(gt>.5?g.s*.7*Math.pow((gt-.5)*2,1.5):-g.s*.45*(1-gt*2)):0,dir:Math.atan2(dy,dx),r1:rnd(),r2:rnd(),r3:rnd(),r4:rnd(),r5:rnd(),r6:rnd()});since=0;
    step=Math.max(.5*k,.4,B.spacing*W*(1-B.pSize*(1-p))*tMin)};
  if(l.pzS!==false)emit(0);else{since=0;step=Math.max(.5*k,.4,B.spacing*W*tMin)*.5}
  for(let i=1;i<=N;i++){since+=pd[i]-pd[i-1];if(since>=step)emit(i)}
  const n=raw.length,a=new Float32Array(n*FL),ts=new Float32Array(n);
  raw.forEach((s,j)=>{
    const tS=B.taperS>0&&l.pzS!==false?Math.min(1,s.d/(B.taperS*k)):1,tE=B.taperE>0&&l.pzE!==false?Math.min(1,(len-s.d)/(B.taperE*k)):1;
    const tt=Math.min(tS,tE),t=tt*tt*(3-2*tt),tm=Math.max(B.taperMin,.65);
    const rr=Math.max(.45,W*.5*(1-B.pSize*(1-s.p))*(tm+(1-tm)*t)*(1-B.sizeJ*s.r3));
    const flow=B.flow*(1-B.pFlow*(1-s.p))*(.3+.7*t)*(1-B.flowJ*s.r4),ang=(B.follow?s.dir:0)+(s.r2-.5)*2*B.rotJ;
    const off=(s.r1-.5)*2*B.scatter*2*rr,off2=(s.r6-.5)*B.scatter*rr,c=Math.cos(s.dir),sn=Math.sin(s.dir),o=j*FL;
    a[o]=s.x-sn*off+c*off2;a[o+1]=s.y+c*off+sn*off2;a[o+2]=rr;a[o+3]=rr*B.roundness;a[o+4]=ang;a[o+5]=flow;a[o+6]=s.r5*100;a[o+7]=s.r4;a[o+8]=s.m;ts[j]=s.t});
  l.pz={key,a,t:ts,n,sseed:rnd()*100,gofs:[rnd(),rnd()],k};return l.pz}
const hexRgb=h=>{const n=parseInt(h.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
/* lays the legs ([leg, fraction drawn] pairs, in order) into ctx, whose origin is the zone's box (r.bx, r.by);
   false when the engine is not available */
export function penDraw(ctx,r,list,B){
  if(!penGL())return false;lifts(r);
  const jobs=[];let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const[l,f]of list){if(gap(l)||!(f>0))continue;const P=legStamps(l,r,B);let n=P.n;
    if(f<1){let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(P.t[m]<=f)lo=m+1;else hi=m}n=lo}
    if(!n)continue;const a=P.a;
    for(let j=0;j<n;j++){const o=j*FL,e=Math.max(a[o+2],a[o+3])*1.42+2;if(a[o]-e<x0)x0=a[o]-e;if(a[o]+e>x1)x1=a[o]+e;if(a[o+1]-e<y0)y0=a[o+1]-e;if(a[o+1]+e>y1)y1=a[o+1]+e}
    jobs.push([P,n])}
  if(!jobs.length)return true;
  x0=Math.max(Math.floor(x0),r.bx);y0=Math.max(Math.floor(y0),r.by);x1=Math.min(Math.ceil(x1),r.bx+r.bw);y1=Math.min(Math.ceil(y1),r.by+r.bh);
  // a box larger than the GPU allows is drawn in tiles
  const w=x1-x0,h=y1-y0;if(w<=0||h<=0)return true;
  const M=G.max;if(w>M||h>M){for(let ty=y0;ty<y1;ty+=M)for(let tx=x0;tx<x1;tx+=M)drawBox(ctx,r,jobs,B,tx,ty,Math.min(M,x1-tx),Math.min(M,y1-ty));return true}
  drawBox(ctx,r,jobs,B,x0,y0,w,h);return true}
function drawBox(ctx,r,jobs,B,x0,y0,w,h){
  const sh=shapeTex(B.shape),gr=grainTex(B.grain);// made first: making them changes the viewport
  ensure(w,h);const H=G.sh,S=G.stamp,u=S.u,col=hexRgb(r.color);
  gl.viewport(0,H-h,w,h);gl.enable(gl.SCISSOR_TEST);gl.scissor(0,H-h,w,h);gl.clearColor(0,0,0,0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clear(gl.COLOR_BUFFER_BIT);
  for(const[P,n]of jobs){
    gl.bindFramebuffer(gl.FRAMEBUFFER,G.scr.fb);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(S.p);gl.uniform2f(u.u_res,w,h);gl.uniform2f(u.u_org,x0,y0);gl.uniform3f(u.u_color,col[0],col[1],col[2]);const g=gradOf(r),dk=g?g.dark:col,lt=g?g.light:col;gl.uniform3f(u.u_dark,dk[0],dk[1],dk[2]);gl.uniform3f(u.u_light,lt[0],lt[1],lt[2]);
    gl.uniform1f(u.u_gs,1/(B.tile*SS));gl.uniform1f(u.u_depth,B.depth);gl.uniform1f(u.u_hard,B.hard);gl.uniform1f(u.u_gain,B.gain);gl.uniform1f(u.u_gamt,B.gamt);
    gl.uniform1f(u.u_streak,B.streak);gl.uniform1f(u.u_streakF,B.streakF/P.k);gl.uniform1f(u.u_sseed,P.sseed);gl.uniform1f(u.u_speck,B.speck);gl.uniform1f(u.u_valJ,B.valJ);gl.uniform2f(u.u_gofs,P.gofs[0],P.gofs[1]);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sh);gl.uniform1i(u.u_shape,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,gr);gl.uniform1i(u.u_grain,1);
    gl.enable(gl.BLEND);gl.blendEquation(gl.MAX);gl.blendFunc(gl.ONE,gl.ONE);gl.bindVertexArray(G.vao);gl.bindBuffer(gl.ARRAY_BUFFER,G.buf);
    for(let i=0;i<n;i+=SCAP){const m=Math.min(SCAP,n-i);gl.bufferData(gl.ARRAY_BUFFER,P.a.subarray(i*FL,(i+m)*FL),gl.STREAM_DRAW);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,m)}
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(G.comp.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,G.scr.t);gl.uniform1i(G.comp.u.u_tex,0);
    gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.bindVertexArray(G.empty);gl.drawArrays(gl.TRIANGLES,0,3)}
  gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);gl.bindVertexArray(null);
  ctx.drawImage(G.cv,0,0,w,h,x0-r.bx,y0-r.by,w,h)}
/* a sample stroke of a brush (a gentle S), for the brush picker */
export function penPreview(id,color,w,h){
  const B=PEN_BRUSHES[id],cv=mk(w,h);if(!B||!penGL())return cv;
  const W=h*B.size/84,pts=[];for(let i=0;i<=24;i++){const t=i/24;pts.push([w*(.08+.84*t),h*(.5-.22*Math.sin(t*Math.PI*2))])}
  const legs=[];for(let i=0;i<24;i++)legs.push(mkLeg(pts[i],pts[i+1],'run',0,.8,1));
  const r={color,w:W,bx:0,by:0,bw:w,bh:h,legs};penDraw(cv.getContext('2d'),r,legs.map(l=>[l,1]),B);return cv}
