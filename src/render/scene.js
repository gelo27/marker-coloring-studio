import * as PIXI from 'pixi.js';
import {plan,viewFit} from '../core/plan.js';
import {DESK,DUO,FLQ,FORMATS,GLT,OVS,PUFF,S,TOOLS,TOOL_IDS,U,fxOff,previewScale,setOVS,view} from '../core/settings.js';
import {$,SS,clamp,hex,lerp,mk,rngOf,smooth} from '../core/utils.js';
import {seg,zones} from '../core/zones.js';
import {resetGrains} from './glitter.js';
import {liqPenColor} from './liquid.js';
import {colorTex,cursor,glitTex,initSurfaces,matTex} from './paint.js';
import {DESK_FRAG,PAPER_FRAG,POST_FRAG,VERT} from './shaders.js';
import {CYL_PROF,buildTool,cylTex} from './toolSprites.js';
export let PATTERN_SRC=null; // custom pattern (data URL); null → procedural default
/* ================= PIXI SCENE ================= */
export let app,world,post,postMesh,postShader,sceneRT,paperMesh,paperShader,deskMesh,penC,penTint=[],penShadow,sparkG,lineTex,patTex,emptyTex,selCv,selCtx,selTex;
export function quad(x0,y0,x1,y1){return new PIXI.Geometry().addAttribute('aVertexPosition',[x0,y0,x1,y0,x1,y1,x0,y1],2).addAttribute('aUvs',[0,0,1,0,1,1,0,1],2).addIndex([0,1,2,0,2,3])}
export function makeSparkle(){const gr=new PIXI.Graphics();gr.beginFill(0xFFFFFF);const r=30*SS,ri=5*SS;gr.moveTo(0,-r);gr.quadraticCurveTo(ri,-ri,r,0);gr.quadraticCurveTo(ri,ri,0,r);gr.quadraticCurveTo(-ri,ri,-r,0);gr.quadraticCurveTo(-ri,-ri,0,-r);gr.endFill();return gr}
/* procedural seamless pattern (default) */
export function makeProceduralPattern(){
  const N=256,rnd=rngOf(31337);
  function lattice(fx,fy){const g=new Float32Array(fx*fy);for(let i=0;i<g.length;i++)g[i]=rnd();return(u,v)=>{const X=u*fx,Y=v*fy,xi=Math.floor(X),yi=Math.floor(Y),sx=smooth(X-xi),sy=smooth(Y-yi);const G=(a,b)=>g[((b%fy+fy)%fy)*fx+((a%fx+fx)%fx)];return lerp(lerp(G(xi,yi),G(xi+1,yi),sx),lerp(G(xi,yi+1),G(xi+1,yi+1),sx),sy)}}
  const o=[lattice(8,8),lattice(32,32),lattice(64,64),lattice(128,128),lattice(14,110),lattice(10,64)];
  const a=new Float32Array(N*N);let m=0;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=x/N,v=y/N;const fiber=o[4]((u+v*2)%1,v);const fib2=o[5]((u+1-v)%1,v);
    const val=.12*o[0](u,v)+.22*o[1](u,v)+.3*o[2](u,v)+.36*o[3](u,v)+.3*Math.pow(fiber,2)+.18*fib2;a[y*N+x]=val;m+=val}
  m/=N*N;let s=0;for(let i=0;i<a.length;i++)s+=(a[i]-m)*(a[i]-m);s=Math.sqrt(s/a.length)||1;
  const c=mk(N,N),x=c.getContext('2d'),id=x.createImageData(N,N);
  for(let i=0;i<a.length;i++){const q=clamp((a[i]-m)/(s*4)+.5,0,1)*255;id.data[i*4]=id.data[i*4+1]=id.data[i*4+2]=q;id.data[i*4+3]=255}
  x.putImageData(id,0,0);return c;
}
export function seamlessFromImage(img){
  const c=mk(256,256),x=c.getContext('2d');const s=Math.min(img.width,img.height);x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,256,256);
  const d=x.getImageData(0,0,256,256).data,L=new Float32Array(65536);for(let i=0;i<65536;i++)L[i]=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;
  const B=new Float32Array(65536),r=12;for(let y=0;y<256;y++)for(let xx=0;xx<256;xx++){let s2=0,n=0;for(let k=-r;k<=r;k+=3)for(let j=-r;j<=r;j+=3){s2+=L[((y+k)&255)*256+((xx+j)&255)];n++}B[y*256+xx]=s2/n}
  const D=new Float32Array(65536);let m=0,v=0;
  for(let i=0;i<65536;i++){const y=i>>8,xx=i&255;const w=Math.sin(Math.PI*(xx+.5)/256)*Math.sin(Math.PI*(y+.5)/256);const j=((y+128)&255)*256+((xx+128)&255);const a=L[i]-B[i],b=L[j]-B[j];D[i]=(w*a+(1-w)*b)/Math.sqrt(w*w+(1-w)*(1-w));m+=D[i]}
  m/=65536;for(let i=0;i<65536;i++)v+=(D[i]-m)*(D[i]-m);const sd=Math.sqrt(v/65536)||1;
  const out=x.createImageData(256,256);for(let i=0;i<65536;i++){const q=clamp((D[i]-m)/(sd*4)+.5,0,1)*255;out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=q;out.data[i*4+3]=255}
  x.putImageData(out,0,0);return c;
}
export function setPattern(canvas){
  const nt=PIXI.Texture.from(canvas);nt.baseTexture.wrapMode=PIXI.WRAP_MODES.REPEAT;nt.baseTexture.mipmap=PIXI.MIPMAP_MODES.ON;
  patTex=nt;if(paperShader)paperShader.uniforms.uPattern=nt;if(deskMesh)deskMesh.shader.uniforms.uPattern=nt;
}

export function initPixi(){
  app=new PIXI.Application({width:view.W,height:view.H,backgroundColor:0x2a2430,antialias:true,preserveDrawingBuffer:true,autoStart:false,resolution:1,powerPreference:'high-performance'});
  app.ticker.stop();
  $('screen').insertBefore(app.view,$('overlay'));
  setPattern(PATTERN_SRC?(()=>{const i=new Image();i.src=PATTERN_SRC;return i})():makeProceduralPattern());
  emptyTex=PIXI.Texture.from(mk(1,1));
  world=new PIXI.Container();post=new PIXI.Container();
  postShader=PIXI.Shader.from(VERT,POST_FRAG,{uOvs:OVS,uPersp:[0,0,0],uDof:0,uBreath:1,uTime:0,uGrain:0,uDust:0,uScene:PIXI.Texture.EMPTY,uRes:[view.W,view.H],uTilt:0,uFocusY:.5,uBlurG:0,uVel:[0,0],uCA:0,uVig:0,uBloom:0,uLeak:0,uLeakPos:[0,0],uLeakHue:0});
}
export let heightRT=null,heightSpr=null,heightBox=null,heightDirty=true,paperC=null;
export function buildScene(){
  world.removeChildren();
  const W=seg.W,H=seg.H;
  deskMesh=new PIXI.Mesh(quad(-W*3,-H*3,W*4,H*4),PIXI.Shader.from(VERT,DESK_FRAG,{uPattern:patTex,uDesk:DESK.tex||emptyTex,uTint:[.80,.87,.84],uSS:SS,uMode:0,uTexSize:[512,512],uScale:1,uRect:[0,0,1,1],uBright:1,uBlur:0}));updateDesk();world.addChild(deskMesh);
  paperC=new PIXI.Container();paperC.pivot.set(W/2,H/2);paperC.position.set(W/2,H/2);world.addChild(paperC);
  const sh=new PIXI.Graphics();sh.beginFill(0x20302a,.35);sh.drawRect(10*SS,16*SS,W,H);sh.endFill();sh.filters=[new PIXI.BlurFilter(26*SS,4)];paperC.addChild(sh);
  if(!paramTex)paramTex=buildParamTex();
  initSurfaces(W,H);
  if(lineTex)lineTex.destroy(true);if(selTex)selTex.destroy(true);
  lineTex=PIXI.Texture.from(seg.lineTexCv);lineTex.baseTexture.mipmap=PIXI.MIPMAP_MODES.ON;
  selCv=mk(W>>1,H>>1);selCtx=selCv.getContext('2d');selTex=PIXI.Texture.from(selCv);
  paperShader=PIXI.Shader.from(VERT,PAPER_FRAG,{uColor:colorTex,uLine:lineTex,uPattern:patTex,uSel:selTex,uSelOn:0,uTime:0,uWet0:emptyTex,uWet1:emptyTex,uWetRect0:[0,0,0,0],uWetRect1:[0,0,0,0],uWetStr:0,uTexel:[1/W,1/H],uRelief:0,uCamPhase:0,uNS:7.5,uGloss:1,uHeight:emptyTex,uMat:matTex,uParams:paramTex,uGlit:glitTex,uDefMat:0,uFlat:0,uPxS:1,uCamV:0,uDuoShift:DUO.shift,uGlitDens:GLT.dens,uPatStr:U.patStr,uPatScale:U.patScale,uGrain:U.grain,uShine:-1,uSS:SS});
  paperMesh=new PIXI.Mesh(quad(0,0,W,H),paperShader);paperC.addChild(paperMesh);
  if(heightRT){heightRT.destroy(true);heightRT=null}
  heightRT=PIXI.RenderTexture.create({width:Math.ceil(W/2),height:Math.ceil(H/2)});
  heightSpr=new PIXI.Sprite(colorTex);heightSpr.scale.set(.5);heightSpr.filters=[new PIXI.BlurFilter(7,4)];heightBox=new PIXI.Container();heightBox.addChild(heightSpr);
  paperShader.uniforms.uHeight=heightRT;heightDirty=true;
  sparkG=new PIXI.Container();paperC.addChild(sparkG);
  setToolSprite();
}
export const SPR={};export let sprTool=null,jarC=null,jarTint=[],parts=[];
export function spriteFor(tool){if(!SPR[tool]){SPR[tool]=buildTool(tool)}return SPR[tool]}
export function useSprite(tool){if(sprTool===tool&&penC&&penC.parent)return;if(penC){penC.visible=false;penShadow.visible=false}const s=spriteFor(tool);penC=s.c;penShadow=s.sh;penTint=s.tint;
  if(!penC.parent){world.addChild(penShadow);world.addChild(penC)}sprTool=tool}
export function buildJar(){if(jarC){if(jarC.parent)jarC.parent.removeChild(jarC);jarC.destroy({children:true})}const g=v=>v*SS,G=()=>new PIXI.Graphics();jarC=new PIXI.Container();jarTint=[];
  const P=CYL_PROF.shaker,T=cylTex('shaker');
  const sh=G();sh.beginFill(0x1a1020,.3);sh.drawRoundedRect(g(8),-g(P.R),g(P.L-8),g(P.R*2),g(P.R));sh.endFill();sh.filters=[new PIXI.BlurFilter(14*SS,3)];sh.position.set(g(46),g(70));jarC.addChild(sh);
  [['plain',0],['tint',1],['over',0]].forEach(([k,ti])=>{if(!T[k])return;const sp=new PIXI.Sprite(T[k]);sp.scale.set(SS/T.K);sp.position.set(-T.pad*SS,-T.cy*SS);jarC.addChild(sp);if(ti)jarTint.push(sp)});
  // sifter holes along the rim of the cap and a printed band on the label (no text)
  const d=G();d.beginFill(0x2a2430,.55);for(let k=-3;k<=3;k++)d.drawEllipse(g(3.2),g(k*10),g(1.4),g(2.6));d.endFill();
  d.beginFill(0x000000,.08);d.drawRect(g(140),-g(43.6),g(52),g(87.2));d.endFill();d.beginFill(0x000000,.12);d.drawRect(g(146),-g(14),g(40),g(5));d.drawRect(g(146),-g(4),g(28),g(4));d.endFill();jarC.addChild(d);
  jarC.visible=false;world.addChild(jarC);
  parts=[];
  resetGrains();}
export let dropG=null;
export function liqDropAt(c,st){
  if(!dropG||dropG.parent!==paperC){dropG=new PIXI.Graphics();paperC.addChild(dropG)}dropG.clear();if(!FLQ.drops)return;
  const o=plan.order;for(let i=Math.max(0,cursor-1);i<Math.min(o.length,cursor+2);i++){const r=o[i];if(!TOOLS[r.tool].fluid||!r.legs.length)continue;const u=(c-(r.t0-.26))/.26;if(u<0||u>1)continue;
    const P=r.legs[0].p0,tip=[st.x,st.y],e=u*u,x=lerp(tip[0],P[0],Math.min(1,u*1.4)),y=lerp(tip[1],P[1],Math.min(1,u*1.4)),rd=r.w*.32*(1-.2*e),col=hex(liqPenColor(r,0));
    const so=(1-e)*34*SS;dropG.beginFill(0x1a1020,.18*(.4+.6*e));dropG.drawEllipse(x+so*.6,y+so*.8,rd*(1.1-.3*e),rd*(.9-.2*e));dropG.endFill();
    dropG.beginFill(col,.96);dropG.drawEllipse(x,y-rd*.15*(1-e),rd*(.9+.1*e),rd*(1.15-.15*e));dropG.endFill();
    dropG.beginFill(0xffffff,.7);dropG.drawEllipse(x-rd*.32,y-rd*.42,rd*.22,rd*.3);dropG.endFill()}}
export function setToolSprite(){Object.keys(SPR).forEach(k=>{const s=SPR[k];[s.c,s.sh].forEach(o=>{if(o.parent)o.parent.removeChild(o);o.destroy({children:true})});delete SPR[k]});penC=null;sprTool=null;useSprite(S.tool);buildJar();applyToolUniforms()}
export function usesTool(t){return S.tool===t||zones.some(z=>z.tool===t)}
export function applyToolUniforms(){if(!paperShader)return;const m=TOOLS[S.tool].mat,u=paperShader.uniforms;u.uRelief=m.relief||0;u.uDefMat=TOOL_IDS().indexOf(S.tool);u.uNS=PUFF.ns;u.uGloss=PUFF.gloss;u.uDuoShift=DUO.shift;u.uGlitDens=GLT.dens;
  [['puffBox','puffy'],['duoBox','chameleon'],['glueBox','glue'],['liqBox','liquid']].forEach(([id,t])=>{const e=document.getElementById(id);if(e)e.hidden=!usesTool(t)})}
export function buildParamTex(){const ids=TOOL_IDS(),d={data:new Uint8Array(16*3*4)};
  ids.forEach((k,i)=>{const m=TOOLS[k].mat,rows=[[m.pat||0,m.tooth||0,(m.toothScale||1)/2,m.gran||0],[m.rim||0,m.beer||0,m.chalk||0,m.spray||0],[m.glitter||0,m.thick||0,m.glue||0,m.duo||0]];
    rows.forEach((v,y)=>v.forEach((val,c)=>{d.data[(y*16+i)*4+c]=Math.round(clamp(val/2,0,1)*255)}))});
  return PIXI.Texture.fromBuffer(d.data,16,3,{scaleMode:PIXI.SCALE_MODES.NEAREST,alphaMode:PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA})}
export let paramTex=null;
export function buildSparkles(){sparkG.removeChildren();(plan.sparkles||[]).forEach(s=>{const g=makeSparkle();g.position.set(s.x,s.y);g.scale.set(0);s.g=g;sparkG.addChild(g)})}
export function updateDesk(){
  if(!deskMesh||!seg)return;const u=deskMesh.shader.uniforms,n=hex(DESK.tint);
  u.uTint=[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];u.uBright=DESK.bright;u.uBlur=DESK.blur;u.uScale=DESK.scale;
  const m=DESK.tex?DESK.mode:'default';u.uMode=m==='default'?0:m==='tile'?1:2;u.uDesk=DESK.tex||emptyTex;u.uTexSize=[DESK.iw,DESK.ih];
  if(DESK.tex)DESK.tex.baseTexture.wrapMode=m==='tile'?PIXI.WRAP_MODES.REPEAT:PIXI.WRAP_MODES.MIRRORED_REPEAT;
  const vw=view.W/viewFit()*1.25,vh=view.H/viewFit()*1.25,ia=DESK.iw/DESK.ih;let w=vw,h=vw/ia;if(h<vh){h=vh;w=vh*ia}
  u.uRect=[seg.W/2-w/2,seg.H/2-h/2,w,h];
  $('deskTintRow').hidden=m!=='default';
}
export function applyFormat(f,k){
  k=k||previewScale();setOVS(fxOff()?1.04:1.45);if(postShader)postShader.uniforms.uOvs=OVS;view.fmt=f;[view.W,view.H]=FORMATS[f].map(v=>Math.round(v*k/2)*2);view.k=k;
  app.renderer.resize(view.W,view.H);
  if(sceneRT)sceneRT.destroy(true);sceneRT=PIXI.RenderTexture.create({width:Math.round(view.W*OVS),height:Math.round(view.H*OVS)});
  post.removeChildren();postMesh=new PIXI.Mesh(quad(0,0,view.W,view.H),postShader);post.addChild(postMesh);
  postShader.uniforms.uScene=sceneRT;postShader.uniforms.uRes=[view.W,view.H];
  updateDesk();
  const s=$('screen');s.style.setProperty('--ar',view.W+'/'+view.H);s.style.setProperty('--arn',(view.W/view.H).toFixed(4));
}
export function setPatternSrc(s){PATTERN_SRC=s}
export function markHeightDirty(){heightDirty=true}
/* the blurred height field the puffy-paint relief is lit from */
export function renderHeight(){if(heightDirty&&heightBox){app.renderer.render(heightBox,{renderTexture:heightRT,clear:true});heightDirty=false}}
