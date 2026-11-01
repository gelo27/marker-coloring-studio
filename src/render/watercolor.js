import {SS,clamp,mk,rngOf,smooth} from '../core/utils.js';
import {liqShades} from '../core/zones.js';
import {legPt} from '../core/strokes.js';
import {ensureTmp,legAt,regionMask,tmpCtx,tmpCv} from './paint.js';
/* ================= WATERCOLOUR: a pigment-and-water simulation per zone (WebGL2) =================
   Every zone being painted gets its own little wet sheet, clipped by the zone's mask:
   - the brush lays leaf-shaped dabs (analytic SDF) into a stroke mask; the distance to the silhouette gives the dark
     rim where pigment gathers at the edge of a stroke laid on dry paper;
   - pigment is kept as Kubelka–Munk (K·S, S), so overlapping washes and neighbouring hues mix like real paint;
   - water moves pigment: it diffuses, runs into lower/drier spots over the paper relief (backruns, pooling) and
     a stroke laid into wet paint loses its hard edge and melts into it (wet-in-wet);
   - while it dries, the edge of the zone dries first and capillary flow carries pigment towards it, so the wash
     ends with a deeper line against the drawing's outline, and the paper grain leaves soft granulation.
   The brush is a tuft of bristles: each tip hangs on a damped spring behind the handle, so it bends against the paper,
   splays under pressure, swings out and flicks on turns, and runs dry at its own pace (dry-brush streaks at the end).
   It runs with a fixed time step, so a frame looks the same in the preview and in the exported video. */
const DT=1/60,SIM_PX=4.2e5,DRY_RATE=.2,EDGE_PX=20*SS,STROKE_LEN=11;
export const WC={opacity:1.05,edge:1,leaf:.7,dep:.45,dry:.35,wet:.5,flow:.55,bleed:.14,gran:.5,warp:.5,cap:.8,edgeEv:1.6,level:.22,S:.42,vary:.4,body:.6,bend:.55,splay:1,tuft:1,veins:.3,hold:1};
export const WC_DEF=Object.assign({},WC);

const VS_FULL=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
/* dab → stroke mask: R coverage, G charge·coverage, B dryness·coverage, A distance to the silhouette (px); MAX blend */
const VS_STAMP=`#version 300 es
in vec4 a_inst;in vec4 a_aux;uniform vec2 u_res;out vec2 v_p;out vec4 v_aux;out float v_r;
void main(){vec2 c=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.-1.;float r=max(a_inst.z,.5);
  float ext=r*1.7*max(a_aux.z,1.)+2.;vec2 l=c*ext;float ca=cos(a_inst.w),sa=sin(a_inst.w);
  vec2 pos=a_inst.xy+vec2(ca*l.x-sa*l.y,sa*l.x+ca*l.y);v_p=l/r;v_aux=a_aux;v_r=r;gl_Position=vec4(pos/u_res*2.-1.,0.,1.);}`;
const FS_STAMP=`#version 300 es
precision highp float;in vec2 v_p;in vec4 v_aux;in float v_r;uniform sampler2D u_noise;uniform float u_leaf,u_rough;uniform vec2 u_seed;out vec4 o;
void main(){vec2 p=v_p;float wy=max(1.+u_leaf*.24*p.x,.25)*v_aux.z,stretch=1.+u_leaf*.2;
  float d=length(vec2(p.x/stretch,p.y/wy))-1.;vec2 nuv=p*.32+u_seed;
  d+=((texture(u_noise,nuv).g-.5)*.3+(texture(u_noise,nuv*2.9+.37).b-.5)*.14)*u_rough;
  float aa=max(fwidth(d),1e-3),m=clamp(.5-d/aa,0.,1.),dist=max(-d,0.)*v_r*min(stretch,wy)*v_aux.w;
  o=vec4(m,m*v_aux.x,m*v_aux.y,dist*step(.5,m));}`;
/* stroke mask → pigment (K·S, S) and water. Laid into wet paint, the stroke loses its dark rim and bleeds softly. */
const FS_CONTRIB=`#version 300 es
precision highp float;uniform sampler2D u_mask,u_noise,u_zone,u_wet;uniform vec2 u_res,u_off,u_seed;uniform float u_R,u_ik,u_S;uniform vec3 u_ks;
uniform float u_opacity,u_edge,u_bleed,u_warp,u_water;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
vec4 mk4(vec2 p){return texture(u_mask,p/u_res);}
void main(){vec2 px=gl_FragCoord.xy;float Z=texture(u_zone,px/u_res).r;if(Z<.004){o0=vec4(0.);o1=vec4(0.);return;}
  float R=u_R;vec2 pp=px*u_ik+u_off;
  vec2 n1=texture(u_noise,px/(R*12.)+u_seed).gb-.5,n2=texture(u_noise,px/(R*4.1)+.31+u_seed).gb-.5,n3=texture(u_noise,px/(R*1.3)+.67).gb-.5;
  vec2 q=px+(n1+.5*n2+.22*n3)*(u_warp*R*.5);
  float wIn=smoothstep(.03,.35,texture(u_wet,px/u_res).r),bleed=max(u_bleed,.6*wIn);
  vec4 m0v=mk4(q);float M0=m0v.r;if(M0<=.002&&bleed<.01){o0=vec4(0.);o1=vec4(0.);return;}
  float charge=M0>.002?clamp(m0v.g/M0,0.,1.):1.,dry=M0>.002?clamp(m0v.b/M0,0.,1.):0.;
  float E=clamp(R*.22,3.,36.),rim=0.;
  if(M0>.002){float dist=m0v.a;rim=(pow(1.-smoothstep(0.,E,dist),1.3)+.2*(1.-smoothstep(0.,E*3.2,dist)))*M0;}
  float cover=M0;
  if(bleed>.01){float Eb=R*.5*bleed+1.;vec3 acc=vec3(0.);
    for(int i=0;i<16;i++){float fi=float(i)+.5,r=sqrt(fi/16.)*Eb,a=fi*2.39996323+1.3;acc+=mk4(q+r*vec2(cos(a),sin(a))).rgb;}
    cover=mix(M0,acc.r/16.,clamp(bleed*1.5,0.,1.));float wH=smoothstep(0.,.25,M0);
    if(acc.r>.01){charge=mix(clamp(acc.g/acc.r,0.,1.),charge,wH);dry=mix(clamp(acc.b/acc.r,0.,1.),dry,wH);}}
  if(cover<.002&&rim<.002){o0=vec4(0.);o1=vec4(0.);return;}
  float nb=texture(u_noise,px/(R*6.)+.5).a,nb2=texture(u_noise,px/(R*2.2)+.2).a,nb3=texture(u_noise,px/(R*1.6)+.8).a;
  float blot=1.+u_warp*(1.1*(nb-.5)+.55*(nb2-.5)+.35*(nb3-.5));
  float h=texture(u_noise,pp/1024.).r;
  float dm=smoothstep(dry*.75-.1,dry*.75+.1,h+(nb-.5)*.4);cover*=mix(1.,dm,dry);rim*=mix(1.,dm,dry*.8);
  float rimD=rim*u_edge*(.3+.7*min(u_opacity,1.))*1.9*mix(1.,charge,.7)*(1.-.65*bleed)*(1.-.85*wIn);
  float d=(cover*u_opacity*blot*charge+rimD)*Z;
  o0=vec4(u_ks*u_S*d,u_S*d);o1=vec4(cover*u_water*Z,0.,0.,0.);}`;
const FS_COMMIT_D=`#version 300 es
precision highp float;uniform sampler2D u_dens,u_stroke;out vec4 o;
void main(){ivec2 ip=ivec2(gl_FragCoord.xy);o=texelFetch(u_dens,ip,0)+texelFetch(u_stroke,ip,0);}`;
const FS_COMMIT_W=`#version 300 es
precision highp float;uniform sampler2D u_wet,u_stroke0,u_stroke1;out vec4 o;
void main(){ivec2 ip=ivec2(gl_FragCoord.xy);vec2 wc=texelFetch(u_wet,ip,0).rg;vec4 s0=texelFetch(u_stroke0,ip,0);float sw=texelFetch(u_stroke1,ip,0).r;
  float w=wc.x,fresh=wc.y;
  if(s0.a+sw>.0003){if(w>.02){w=min(1.,w+sw);fresh=0.;}else if(sw>.003){w=sw;fresh=1.;}}
  o=vec4(w,fresh,0.,0.);}`;
/* water moving pigment: diffusion, flow over the paper relief (backruns, pooling), capillary flow towards drier spots,
   drying (faster along the zone's edge). Two passes share the flux function so water and pigment stay in step. */
const FLOW_COMMON=`#version 300 es
precision highp float;uniform sampler2D u_dens,u_wet,u_noise,u_zone;uniform float u_rate,u_dry,u_frame,u_flow,u_ik,u_cap,u_edgeEv,u_level,u_veins;uniform vec2 u_off;uniform int u_rad;out vec4 o;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
const ivec2 D[8]=ivec2[8](ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1),ivec2(1,1),ivec2(-1,1),ivec2(1,-1),ivec2(-1,-1));
ivec2 cl(ivec2 p){return clamp(p,ivec2(0),textureSize(u_wet,0)-1);}
vec2 pg(vec2 p){return p*u_ik+u_off;}
float hAt(vec2 p){return texture(u_noise,pg(p)/4096.).r;}
float nAt(vec2 p){return texture(u_noise,pg(p)/1024.*6.).a;}
vec2 wetAt(ivec2 p){return texelFetch(u_wet,cl(p),0).rg;}
vec4 densAt(ivec2 p){return texelFetch(u_dens,cl(p),0);}
vec2 zAt(ivec2 p){return texelFetch(u_zone,cl(p),0).rg;}
float flux(float wp,float fp,float hp,float np,float wq,float hq,float nq){
  if(fp>.5||wp<=.001)return 0.;float thr=.015+.055*(np+nq),ex=(wp+.35*hp)-(wq+.35*hq)-thr;return min(u_flow*max(ex,0.),.1*wp);}
`;
const FS_FLOW_A=FLOW_COMMON+`
void main(){ivec2 ip=ivec2(gl_FragCoord.xy);vec2 pos=gl_FragCoord.xy;vec4 c=densAt(ip);
  if(zAt(ip).r<.5){o=c;return;}
  vec2 wc=wetAt(ip);float wp=wc.x,fp=wc.y,hp=hAt(pos),np=nAt(pos);
  float gp=zAt(ip).g;vec4 sum=c*wp,sumL=c*wp,outc=vec4(0.),inc=vec4(0.),capI=vec4(0.);float ws=wp,wsL=wp,capO=0.,nn=0.;vec4 nb=vec4(0.);
  for(int i=0;i<8;i++){ivec2 qi=ip+D[i]*u_rad;vec2 zq=zAt(qi);if(zq.r<.5)continue;vec2 qpos=vec2(qi)+.5;vec4 cq=densAt(qi);vec2 wq=wetAt(qi);float hq=hAt(qpos),nq=nAt(qpos);
    outc+=flux(wp,fp,hp,np,wq.x,hq,nq)*c/max(wp,.05);inc+=flux(wq.x,wq.y,hq,nq,wp,hp,np)*cq/max(wq.x,.05);
    sum+=cq*wq.x;ws+=wq.x;nb+=cq;nn+=1.;
    // capillary flow: as the wash dries, pigment drifts down the distance field towards the zone's outline
    if(wp>.003&&wq.x>.003){float dg=(gp-zq.g)*u_cap;if(dg>0.)capO+=dg*(1.-gp);else capI+=-dg*(1.-zq.g)*cq;}
    ivec2 li=ip+D[i]*u_rad*5;if(zAt(li).r>.5){float wl=wetAt(li).x;sumL+=densAt(li)*wl;wsL+=wl;}}
  vec4 r=c;if(fp<.5&&wp>.001){r=mix(c,sum/ws,clamp(u_rate*(.35+.65*wp),0.,.9));r=mix(r,sumL/wsL,clamp(u_level*wp,0.,.5));}
  vec4 res=max(r-outc+inc-capO*c+capI,0.);
  // capillary drift leaves light veins along the middle of a shape, where pigment flows out on both sides; a wet
  // pixel lighter than its neighbours is filled back from them (u_veins = 1 keeps the veins, 0 smooths them away)
  if(nn>0.&&fp<.5&&wp>.001){vec4 m=nb/nn;if(res.a<m.a)res=mix(res,m,(1.-u_veins)*.4*smoothstep(0.,.12,wp));}
  o=res;}`;
const FS_FLOW_B=FLOW_COMMON+`
void main(){ivec2 ip=ivec2(gl_FragCoord.xy);vec2 pos=gl_FragCoord.xy;vec2 z=zAt(ip);if(z.r<.5){o=vec4(0.);return;}
  vec2 wc=wetAt(ip);float wp=wc.x,fp=wc.y,hp=hAt(pos),np=nAt(pos),fo=0.,fi=0.,mobN=0.;
  for(int i=0;i<8;i++){ivec2 qi=ip+D[i]*u_rad;if(zAt(qi).r<.5)continue;vec2 qpos=vec2(qi)+.5;vec2 wq=wetAt(qi);float hq=hAt(qpos),nq=nAt(qpos);
    fo+=flux(wp,fp,hp,np,wq.x,hq,nq);fi+=flux(wq.x,wq.y,hq,nq,wp,hp,np);mobN=max(mobN,(1.-wq.y)*wq.x);}
  float eW=(1.-z.g)*(1.-z.g),w=wp-fo+fi-u_dry*max(.6,1.+u_edgeEv*eW+.8*(np-.5)),fresh=fp;
  if(fi>.0004)fresh=0.;if(fresh>.5&&mobN>.25&&hash(vec2(ip)+u_frame*1.37)<.18)fresh=0.;
  if(w<=.001){w=0.;fresh=0.;}o=vec4(w,fresh,0.,0.);}`;
/* show: Kubelka–Munk thin layer over white; written as colour + coverage so that paper × (1 − a + a·ink) = reflectance */
const FS_DISPLAY=`#version 300 es
precision highp float;uniform sampler2D u_dens,u_stroke,u_noise;uniform float u_h,u_ik,u_gran;uniform vec2 u_off;out vec4 o;
vec3 km(vec3 K,float S){if(S<2e-4)return vec3(1.);vec3 a=1.+K/S,b=sqrt(max(a*a-1.,1e-8)),e2=exp(-2.*b*S),ct=(1.+e2)/max(1.-e2,1e-5);return (1.-(a-b*ct))/(a-1.+b*ct);}
void main(){ivec2 ip=ivec2(int(gl_FragCoord.x),int(u_h)-1-int(gl_FragCoord.y));vec4 d=max(texelFetch(u_dens,ip,0)+texelFetch(u_stroke,ip,0),0.);
  float h=texture(u_noise,(vec2(ip)*u_ik+u_off)/1024.).r;d*=clamp(1.+u_gran*(.5-h)*1.4,.45,1.8);
  vec3 R=clamp(km(d.rgb,d.a),0.,1.);float a=1.-min(R.r,min(R.g,R.b));vec3 ink=a>1e-4?1.-(1.-R)/a:vec3(1.);o=vec4(ink*a,a);}`;
/* paper relief (R) and three smooth noises (G,B,A), tileable 1024² */
const FS_NOISE=`#version 300 es
precision highp float;out vec4 o;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vn2(vec2 uv,vec2 P,float seed){vec2 p=uv*P,i=floor(p),f=fract(p),u=f*f*(3.-2.*f),s=vec2(seed*17.13,seed*31.77);
  return mix(mix(hash(mod(i,P)+s),hash(mod(i+vec2(1.,0.),P)+s),u.x),mix(hash(mod(i+vec2(0.,1.),P)+s),hash(mod(i+vec2(1.,1.),P)+s),u.x),u.y);}
float vn(vec2 uv,float P,float seed){return vn2(uv,vec2(P),seed);}
void main(){vec2 uv=gl_FragCoord.xy/1024.;
  float h=.12*vn(uv,32.,1.)+.2*vn(uv,64.,2.)+.32*vn(uv,128.,3.)+.26*vn(uv,256.,4.)+.1*vn(uv,512.,5.);h=(h-.5)*2.1+.5;
  h+=((1.-abs(vn2(uv,vec2(320.,11.),21.)*2.-1.)+1.-abs(vn2(uv,vec2(12.,300.),22.)*2.-1.))*.5-.5)*.14;
  o=vec4(clamp(h,0.,1.),.75*vn(uv,8.,11.)+.25*vn(uv,16.,12.),.75*vn(uv,8.,13.)+.25*vn(uv,16.,14.),.7*vn(uv,8.,15.)+.3*vn(uv,32.,16.));}`;

/* ---------------- GL plumbing ---------------- */
let G=null,gl=null;
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function prog(vs,fs,names){const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));const u={};names.forEach(n=>u[n]=gl.getUniformLocation(p,n));return{p,u}}
function tex(w,h,fmt){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,fmt,w,h);
  for(const[k,v]of[[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return t}
function rt(w,h,fmt=gl.RGBA16F,fmt2=0){const t=tex(w,h,fmt),t2=fmt2?tex(w,h,fmt2):null,fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
  if(t2){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,t2,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1])}
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('float FBO incomplete');
  gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return{tex:t,tex2:t2,fbo,w,h}}
function freeRT(o){gl.deleteFramebuffer(o.fbo);gl.deleteTexture(o.tex);if(o.tex2)gl.deleteTexture(o.tex2)}
function blit(src,dst,rc){gl.disable(gl.SCISSOR_TEST);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);
  gl.blitFramebuffer(rc.x,rc.y,rc.x+rc.w,rc.y+rc.h,rc.x,rc.y,rc.x+rc.w,rc.y+rc.h,gl.COLOR_BUFFER_BIT,gl.NEAREST)}
function clearRT(o){gl.bindFramebuffer(gl.FRAMEBUFFER,o.fbo);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}
function bindTex(list){list.forEach(([loc,t],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(loc,i)})}
function full(){gl.bindVertexArray(null);gl.drawArrays(gl.TRIANGLES,0,3)}
const MAXI=4096,STRIDE=8,inst=new Float32Array(MAXI*STRIDE);
/* the engine, created on first use; null when the device has no WebGL2 with float render targets (old fallback is used) */
export function wcGL(){
  if(G!==null)return G||null;G=false;
  try{
    const cv=mk(64,64);gl=cv.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
    if(!gl||!gl.getExtension('EXT_color_buffer_float'))return null;
    const FU=['u_dens','u_wet','u_noise','u_zone','u_rate','u_dry','u_frame','u_flow','u_ik','u_cap','u_edgeEv','u_level','u_veins','u_off','u_rad'];
    const P={stamp:prog(VS_STAMP,FS_STAMP,['u_res','u_noise','u_leaf','u_rough','u_seed']),
      contrib:prog(VS_FULL,FS_CONTRIB,['u_mask','u_noise','u_zone','u_wet','u_res','u_off','u_seed','u_R','u_ik','u_S','u_ks','u_opacity','u_edge','u_bleed','u_warp','u_water']),
      commitD:prog(VS_FULL,FS_COMMIT_D,['u_dens','u_stroke']),commitW:prog(VS_FULL,FS_COMMIT_W,['u_wet','u_stroke0','u_stroke1']),
      flowA:prog(VS_FULL,FS_FLOW_A,FU),flowB:prog(VS_FULL,FS_FLOW_B,FU),disp:prog(VS_FULL,FS_DISPLAY,['u_dens','u_stroke','u_noise','u_h','u_ik','u_gran','u_off']),noise:prog(VS_FULL,FS_NOISE,[])};
    const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,MAXI*STRIDE*4,gl.DYNAMIC_DRAW);
    const aI=gl.getAttribLocation(P.stamp.p,'a_inst'),aA=gl.getAttribLocation(P.stamp.p,'a_aux');
    gl.enableVertexAttribArray(aI);gl.vertexAttribPointer(aI,4,gl.FLOAT,false,STRIDE*4,0);gl.vertexAttribDivisor(aI,1);
    gl.enableVertexAttribArray(aA);gl.vertexAttribPointer(aA,4,gl.FLOAT,false,STRIDE*4,16);gl.vertexAttribDivisor(aA,1);gl.bindVertexArray(null);
    const noise=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,noise);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const[k,v]of[[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    const nf=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,nf);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,noise,0);
    gl.viewport(0,0,1024,1024);gl.useProgram(P.noise.p);full();gl.deleteFramebuffer(nf);
    const probe=rt(4,4,gl.RGBA16F,gl.RG16F);freeRT(probe);
    G={cv,P,vao,buf,noise};
  }catch(e){console.warn('watercolour engine unavailable, using the simple one',e);G=false}
  return G||null;
}

/* ---------------- one zone ---------------- */
const cache=new Map();
const toLin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
function ksOf(hx){const n=parseInt(hx.slice(1),16),l=[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255].map(toLin),lum=.2126*l[0]+.7152*l[1]+.0722*l[2];
  return l.map(v=>{const m=Math.max(v*.83+lum*.17,.035);return(1-m)*(1-m)/(2*m)})}
const newRect=()=>({x0:1e9,y0:1e9,x1:-1e9,y1:-1e9}),valid=q=>q.x1>=q.x0;
function grow(q,x,y,r){q.x0=Math.min(q.x0,x-r);q.y0=Math.min(q.y0,y-r);q.x1=Math.max(q.x1,x+r);q.y1=Math.max(q.y1,y+r)}
function fit(F,q,m){const x0=clamp(Math.floor(q.x0-m),0,F.sw),y0=clamp(Math.floor(q.y0-m),0,F.sh),x1=clamp(Math.ceil(q.x1+m),0,F.sw),y1=clamp(Math.ceil(q.y1+m),0,F.sh);return{x:x0,y:y0,w:x1-x0,h:y1-y0}}
/* the dried look depends only on the zone, its colour and its brush path, so re-planning other zones keeps the cache */
function wcKey(r){const L=r.legs,a=L[0],z=L[L.length-1];let h=0;for(const l of L)h=(h*31+Math.round(l.p1[0]*7+l.p1[1]*13+(l.wm||1)*100))|0;
  return[Object.values(WC).join(','),r.i,r.lk,r.color,r.w,L.length,a&&a.p0.join(','),z&&z.p1.join(','),h,r.dur.toFixed(3),r.maskKey].join('|')}
function wcInit(r){
  regionMask(r);const k=Math.min(1,Math.sqrt(SIM_PX/(r.bw*r.bh))),sw=Math.max(4,Math.round(r.bw*k)),sh=Math.max(4,Math.round(r.bh*k));
  // zone mask at simulation size (R) and distance to its edge (G), so the edge can dry first
  const zc=mk(sw,sh),zx=zc.getContext('2d');zx.imageSmoothingEnabled=true;zx.drawImage(r.maskCv,0,0,sw,sh);
  const md=zx.getImageData(0,0,sw,sh).data,N=sw*sh,dist=new Float32Array(N),zd=new Uint8Array(N*4);
  for(let i=0;i<N;i++)dist[i]=md[i*4+3]>127?1e9:0;
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const i=y*sw+x;if(!dist[i])continue;let d=dist[i];if(x>0)d=Math.min(d,dist[i-1]+1);if(y>0){d=Math.min(d,dist[i-sw]+1);if(x>0)d=Math.min(d,dist[i-sw-1]+1.414);if(x<sw-1)d=Math.min(d,dist[i-sw+1]+1.414)}if(x===0||y===0||x===sw-1||y===sh-1)d=Math.min(d,1);dist[i]=d}
  for(let y=sh-1;y>=0;y--)for(let x=sw-1;x>=0;x--){const i=y*sw+x;if(!dist[i])continue;let d=dist[i];if(x<sw-1)d=Math.min(d,dist[i+1]+1);if(y<sh-1){d=Math.min(d,dist[i+sw]+1);if(x<sw-1)d=Math.min(d,dist[i+sw+1]+1.414);if(x>0)d=Math.min(d,dist[i+sw-1]+1.414)}dist[i]=d}
  for(let i=0;i<N;i++){zd[i*4]=md[i*4+3];zd[i*4+1]=Math.round(clamp(dist[i]/k/EDGE_PX,0,1)*255);zd[i*4+3]=255}
  const zone=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,zone);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,sw,sh,0,gl.RGBA,gl.UNSIGNED_BYTE,zd);
  for(const[a,v]of[[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,a,v);
  const rnd=rngOf(r.i*977+r.lk*13+7),base=ksOf(r.color),sh2=liqShades(r.color,r.i).map(ksOf);
  return{key:wcKey(r),k,sw,sh,zone,rnd,base,shades:sh2,t:r.t0,li:0,si:0,st:null,frame:0,wetLevel:0,wetBase:null,wetPad:0,ni:0,
    dens:rt(sw,sh),densB:rt(sw,sh),wet:rt(sw,sh,gl.RG16F),wetB:rt(sw,sh,gl.RG16F),mask:rt(sw,sh),stroke:rt(sw,sh,gl.RGBA16F,gl.RG16F),
    R:Math.max(2,r.w*.7*k)};
}
export function wcFree(r){const F=r.wg;r.wg=null;if(!F||!gl)return;[F.dens,F.densB,F.wet,F.wetB,F.mask,F.stroke].forEach(freeRT);gl.deleteTexture(F.zone)}
/* dabs along one leg at an even spacing (in simulation pixels), with the parameter t at which the brush reaches each */
function legStamps(F,r,l){
  if(l.wcg&&l.wcgK===F.k&&l.wcgW===r.w)return l.wcg;
  const sp=Math.max(1,F.R*.11),n=Math.max(4,Math.ceil((l.len||1)*F.k/1.2)),out=[];let px=null,py=null,acc=sp;
  for(let i=0;i<=n;i++){const t=i/n,q=legPt(l,t),x=(q[0]-r.bx)*F.k,y=(q[1]-r.by)*F.k;
    if(px===null){out.push({t,x,y,a:Math.atan2(l.p1[1]-l.p0[1],l.p1[0]-l.p0[0])});px=x;py=y;acc=0;continue}
    const d=Math.hypot(x-px,y-py);acc+=d;if(acc>=sp){out.push({t,x,y,a:Math.atan2(y-py,x-px)});acc=0}px=x;py=y}
  l.wcg=out;l.wcgK=F.k;l.wcgW=r.w;return out}
function beginStroke(F){
  const rr=F.rnd,v=rr()<WC.vary?(.25+.35*rr()):0,sk=F.shades[rr()<.6?0:1],ks=F.base.map((b,i)=>b+(sk[i]-b)*v),R=F.R;
  const E=clamp(R*.22,3,36),Eb=R*.5*Math.max(WC.bleed,.6)+1;
  F.st={ks,ang:rr()*Math.PI*2,ph:[rr()*6.28,rr()*6.28,rr()*6.28],seed:[rr()*4,rr()*4],trav:0,bbox:newRect(),dirty:newRect(),margin:Math.ceil(.42*WC.warp*R+Math.max(E,Eb)+6),lx:null,ly:null}}
function emit(F,x,y,rad,ang,ch,dry,asp=1,dg=1){
  if(F.ni>=MAXI)flushStamps(F);const o=F.ni*STRIDE;inst[o]=x;inst[o+1]=y;inst[o+2]=rad;inst[o+3]=ang;inst[o+4]=ch;inst[o+5]=dry;inst[o+6]=asp;inst[o+7]=dg;F.ni++;
  grow(F.st.bbox,x,y,rad*1.8);grow(F.st.dirty,x,y,rad*1.8)}
function stampAt(F,d,l){
  const s=F.st,R=F.R;if(s.lx!==null)s.trav+=Math.hypot(d.x-s.lx,d.y-s.ly);s.lx=d.x;s.ly=d.y;
  const tt=s.trav/R,tin=smooth(clamp(s.trav/(R*1.1),0,1)),jS=1+.05*(Math.sin(tt*2.1+s.ph[0])+.5*Math.sin(tt*5.3+s.ph[1])),jA=.14*Math.sin(tt*1.7+s.ph[2]);
  let da=d.a-s.ang;da=Math.atan2(Math.sin(da),Math.cos(da));s.ang+=da*(s.trav<1?1:.3);
  const pr=clamp(.62+.38*(l.alpha||.76)/.76,.6,1),ch=(1-WC.dep*.8*(1-Math.exp(-s.trav/(R*7))))*(.8+.2*pr),dry=clamp((1-ch)*.5,0,1)*WC.dry;
  const rad=R*(l.wm||1)*(.55+.45*pr)*(.75+.25*tin)*jS;
  if(WC.tuft>0){emit(F,d.x,d.y,rad*WC.body,s.ang+jA,ch*.84,dry);bristles(F,d,rad,pr,ch,s)}else emit(F,d.x,d.y,rad,s.ang+jA,ch,dry)}
/* the tuft: bristles rooted across the ferrule, each with its own length, stiffness, thickness and thirst */
function makeTuft(F,d,rad,s){
  const rr=F.rnd,n=clamp(Math.round(8+F.R*.5),10,26),T=[],ca=Math.cos(s.ang),sa=Math.sin(s.ang);
  for(let i=0;i<n;i++){const o=clamp(((i+.5)/n*2-1)*1.05+(rr()-.5)*.18,-1.1,1.1),edge=Math.abs(o);
    // touch-down: the tips start gathered into a point and fan out as the brush is pressed and pulled
    T.push({o,len:(.55+.45*rr())*(1-.3*edge*edge),k:.13+.11*rr(),damp:.7+.12*rr(),w:(.13+.09*rr())*(1-.25*edge),ink:.8+.32*rr(),dep:.3+1.1*rr()*(.6+.6*edge),
      x:d.x-sa*o*rad*.2,y:d.y+ca*o*rad*.2,vx:0,vy:0})}
  return T}
function bristles(F,d,rad,pr,ch,s){
  const T=F.tuft||(F.tuft=makeTuft(F,d,rad,s)),ca=Math.cos(s.ang),sa=Math.sin(s.ang),R=F.R;
  const use=1-Math.exp(-s.trav/(R*6)),spl=WC.splay*(.62+.4*pr+.4*use*WC.dep),bend=WC.bend*(.6+.6*pr);
  for(const b of T){
    // where friction drags the tip: behind the handle, spread across the stroke
    const ac=b.o*rad*spl,al=-b.len*rad*bend,tx=d.x+ca*al-sa*ac,ty=d.y+sa*al+ca*ac;
    b.vx=b.vx*b.damp+(tx-b.x)*b.k;b.vy=b.vy*b.damp+(ty-b.y)*b.k;b.x+=b.vx;b.y+=b.vy;
    // it is held at its root in the ferrule: it can bend and swing, not stretch
    const rx=d.x-sa*b.o*rad*.55,ry=d.y+ca*b.o*rad*.55,ex=b.x-rx,ey=b.y-ry,e=Math.hypot(ex,ey),L=b.len*rad*1.1;
    if(e>L){b.x=rx+ex/e*L;b.y=ry+ey/e*L;b.vx*=.6;b.vy*=.6}
    const bc=clamp(ch*b.ink*(1-WC.dep*.75*b.dep*use),0,1),bd=clamp((1-bc)*.9,0,1)*WC.dry,sp=Math.hypot(b.vx,b.vy);
    // the bristle lies along its own motion, thinner as it whips around a turn
    const ang=sp>.05?Math.atan2(b.vy,b.vx):s.ang,asp=clamp(1-sp/(R*.6),.55,1);
    emit(F,b.x,b.y,Math.max(.7,rad*b.w*(.85+.3*pr)),ang,bc,bd,asp,1.8);
    // the mid-bristle drags pigment between root and tip, so the tuft leaves a closed mark, not dots
    emit(F,(b.x+rx)*.5,(b.y+ry)*.5,Math.max(.7,rad*b.w*1.15),ang,bc,bd*.6,asp,1.8)}}
function flushStamps(F){
  if(!F.ni)return;const P=G.P.stamp,s=F.st;gl.bindFramebuffer(gl.FRAMEBUFFER,F.mask.fbo);gl.viewport(0,0,F.sw,F.sh);gl.disable(gl.SCISSOR_TEST);
  gl.enable(gl.BLEND);gl.blendEquation(gl.MAX);gl.useProgram(P.p);bindTex([[P.u.u_noise,G.noise]]);
  gl.uniform2f(P.u.u_res,F.sw,F.sh);gl.uniform1f(P.u.u_leaf,WC.leaf);gl.uniform1f(P.u.u_rough,WC.warp);gl.uniform2f(P.u.u_seed,s.seed[0],s.seed[1]);
  gl.bindVertexArray(G.vao);gl.bindBuffer(gl.ARRAY_BUFFER,G.buf);gl.bufferSubData(gl.ARRAY_BUFFER,0,inst.subarray(0,F.ni*STRIDE));gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,F.ni);
  gl.bindVertexArray(null);gl.disable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);F.ni=0}
function contribution(F,r){
  const s=F.st;if(!s||!valid(s.dirty))return;const rc=fit(F,s.dirty,s.margin);s.dirty=newRect();if(rc.w<=0||rc.h<=0)return;
  const P=G.P.contrib,u=P.u;gl.bindFramebuffer(gl.FRAMEBUFFER,F.stroke.fbo);gl.viewport(0,0,F.sw,F.sh);gl.enable(gl.SCISSOR_TEST);gl.scissor(rc.x,rc.y,rc.w,rc.h);
  gl.useProgram(P.p);bindTex([[u.u_mask,F.mask.tex],[u.u_noise,G.noise],[u.u_zone,F.zone],[u.u_wet,F.wet.tex]]);
  gl.uniform2f(u.u_res,F.sw,F.sh);gl.uniform2f(u.u_off,r.bx,r.by);gl.uniform2f(u.u_seed,s.seed[0],s.seed[1]);gl.uniform1f(u.u_R,F.R);gl.uniform1f(u.u_ik,1/F.k);
  gl.uniform3f(u.u_ks,s.ks[0],s.ks[1],s.ks[2]);gl.uniform1f(u.u_S,WC.S);gl.uniform1f(u.u_opacity,WC.opacity);gl.uniform1f(u.u_edge,WC.edge);gl.uniform1f(u.u_bleed,WC.bleed);
  gl.uniform1f(u.u_warp,WC.warp);gl.uniform1f(u.u_water,WC.wet);full();gl.disable(gl.SCISSOR_TEST)}
function copyBack(F,rc){blit(F.densB,F.dens,rc);blit(F.wetB,F.wet,rc)}
function endStroke(F,r){
  const s=F.st;if(!s)return;flushStamps(F);contribution(F,r);F.st=null;if(!valid(s.bbox))return;
  const rc=fit(F,s.bbox,s.margin);if(rc.w<=0||rc.h<=0)return;gl.viewport(0,0,F.sw,F.sh);
  gl.bindFramebuffer(gl.FRAMEBUFFER,F.densB.fbo);gl.enable(gl.SCISSOR_TEST);gl.scissor(rc.x,rc.y,rc.w,rc.h);
  let P=G.P.commitD;gl.useProgram(P.p);bindTex([[P.u.u_dens,F.dens.tex],[P.u.u_stroke,F.stroke.tex]]);full();
  gl.bindFramebuffer(gl.FRAMEBUFFER,F.wetB.fbo);P=G.P.commitW;gl.useProgram(P.p);bindTex([[P.u.u_wet,F.wet.tex],[P.u.u_stroke0,F.stroke.tex],[P.u.u_stroke1,F.stroke.tex2]]);full();
  gl.disable(gl.SCISSOR_TEST);copyBack(F,rc);clearRT(F.mask);clearRT(F.stroke);
  const q={x0:rc.x,y0:rc.y,x1:rc.x+rc.w,y1:rc.y+rc.h};if(!F.wetBase)F.wetBase=q;else{const b=F.wetBase;b.x0=Math.min(b.x0,q.x0);b.y0=Math.min(b.y0,q.y0);b.x1=Math.max(b.x1,q.x1);b.y1=Math.max(b.y1,q.y1)}
  F.wetPad=Math.max(F.wetPad,8*F.k);F.wetLevel=Math.min(1,F.wetLevel+WC.wet)}
function flowPass(F,r,P,dst,rc,dt,dry){
  const u=P.u;gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.viewport(0,0,F.sw,F.sh);gl.enable(gl.SCISSOR_TEST);gl.scissor(rc.x,rc.y,rc.w,rc.h);gl.useProgram(P.p);
  bindTex([[u.u_dens,F.dens.tex],[u.u_wet,F.wet.tex],[u.u_noise,G.noise],[u.u_zone,F.zone]]);
  gl.uniform1f(u.u_rate,.12);gl.uniform1f(u.u_dry,dry*DRY_RATE*dt);gl.uniform1f(u.u_frame,F.frame);gl.uniform1f(u.u_flow,.1*WC.flow);gl.uniform1f(u.u_ik,1/F.k);
  gl.uniform1f(u.u_cap,dry*WC.cap*DRY_RATE*DT*60);gl.uniform1f(u.u_level,WC.level);gl.uniform1f(u.u_veins,WC.veins);gl.uniform1f(u.u_edgeEv,WC.edgeEv);gl.uniform2f(u.u_off,r.bx,r.by);gl.uniform1i(u.u_rad,Math.max(1,Math.round(3*F.k)));full();gl.disable(gl.SCISSOR_TEST)}
/* with WC.hold the paint keeps wet while the zone is being painted (the water still moves, nothing evaporates, so
   every stroke goes on wet-in-wet) and only starts to dry after the last stroke */
function diffuse(F,r,dt){
  if(!F.wetBase||F.wetLevel<=0)return;const rc=fit(F,F.wetBase,F.wetPad);if(rc.w<=0||rc.h<=0)return;
  const dry=WC.hold>0&&(F.t<F.tEnd||F.li<r.legs.length)?0:1;
  flowPass(F,r,G.P.flowA,F.densB,rc,dt,dry);flowPass(F,r,G.P.flowB,F.wetB,rc,dt,dry);copyBack(F,rc);
  F.wetPad=Math.min(F.wetPad+2.4*F.k,112*F.k);F.wetLevel-=dry*DRY_RATE*dt;if(F.wetLevel<=0){F.wetLevel=0;F.wetBase=null;F.wetPad=0}}
/* one fixed step: the brush moves on to where it is at time t, then the water moves */
function step(F,r,t,SD){
  F.t=t;F.frame++;const L=r.legs,p=clamp((t-r.t0)/SD,0,1),cur=p>=1?{k:L.length,f:2}:legAt(r,p);
  while(F.li<L.length){const l=L[F.li];
    if(l.kind==='jump'||l.kind==='pause'){if(F.li<cur.k){endStroke(F,r);F.tuft=null;F.li++;F.si=0;continue}break}
    if(!F.st)beginStroke(F);
    const S2=legStamps(F,r,l),lim=F.li<cur.k?2:F.li===cur.k?cur.f:-1;
    while(F.si<S2.length&&S2[F.si].t<=lim){stampAt(F,S2[F.si],l);F.si++}
    if(F.si>=S2.length&&F.li<cur.k){F.li++;F.si=0;if(F.st&&F.st.trav>F.R*STROKE_LEN)endStroke(F,r)}else break}
  if(F.li>=L.length&&F.st)endStroke(F,r);
  if(F.st){flushStamps(F);contribution(F,r)}
  diffuse(F,r,DT)}
function show(F,r){
  const cv=G.cv;if(cv.width<F.sw||cv.height<F.sh){cv.width=Math.max(cv.width,F.sw);cv.height=Math.max(cv.height,F.sh)}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,F.sw,F.sh);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
  const P=G.P.disp;gl.useProgram(P.p);bindTex([[P.u.u_dens,F.dens.tex],[P.u.u_stroke,F.stroke.tex],[P.u.u_noise,G.noise]]);gl.uniform1f(P.u.u_h,F.sh);gl.uniform1f(P.u.u_ik,1/F.k);gl.uniform1f(P.u.u_gran,WC.gran);gl.uniform2f(P.u.u_off,r.bx,r.by);full();
  ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);tmpCtx.imageSmoothingEnabled=true;tmpCtx.imageSmoothingQuality='high';
  tmpCtx.drawImage(cv,0,cv.height-F.sh,F.sw,F.sh,0,0,r.bw,r.bh);
  tmpCtx.globalCompositeOperation='destination-in';tmpCtx.drawImage(r.maskCv,0,0);tmpCtx.globalCompositeOperation='source-over'}
/* the zone's look at time c into tmpCv; true once it has dried (the result is then cached for seeking) */
export function wcLayer(r,c){
  regionMask(r);const key=wcKey(r),hit=cache.get(key),SD=r.dur*(r.sf||1),tEnd=r.t0+SD;
  // seeking: a zone that had dried by then is taken from the cache (stored with how long after its last stroke it dried)
  if(hit&&c>=tEnd+hit.after){ensureTmp(r.bw,r.bh);tmpCtx.clearRect(0,0,r.bw,r.bh);tmpCtx.drawImage(hit.cv,0,0);wcFree(r);return true}
  if(r.wg&&(r.wg.key!==key||r.wg.t>c+1e-6))wcFree(r);
  if(!r.wg)r.wg=wcInit(r);const F=r.wg;F.tEnd=tEnd;
  let guard=0;while(F.t+DT<=c&&guard++<9000){step(F,r,F.t+DT,SD);if(F.t>=tEnd&&F.li>=r.legs.length&&!F.wetBase)break}
  show(F,r);
  const done=F.li>=r.legs.length&&!F.st&&(!F.wetBase||c>tEnd+12);
  if(done){const fin=mk(r.bw,r.bh);fin.getContext('2d').drawImage(tmpCv,0,0,r.bw,r.bh,0,0,r.bw,r.bh);if(cache.size>400)cache.clear();cache.set(key,{cv:fin,after:Math.max(0,F.t-tEnd)});wcFree(r)}
  return done}
export function wcClearCache(){cache.clear()}
