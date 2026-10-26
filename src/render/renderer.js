import * as PIXI from 'pixi.js';
import {addonHasFocus,runHook} from '../addons/registry.js';
import {paperRot,plan,viewFit} from '../core/plan.js';
import {OVS,S,TOOLS,fxOff,view} from '../core/settings.js';
import {SS,clamp,hex,lerp,smooth,smoothstep2} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {ed} from '../editor/editor.js';
import {P2W,PR,cam,penState,setPR} from './camera.js';
import {GL,updateParts} from './glitter.js';
import {OC,outroAt} from './outro.js';
import {flushPaint,paintAt,wetAt} from './paint.js';
import {app,jarC,jarTint,liqDropAt,markHeightDirty,paperC,paperShader,penC,penShadow,penTint,post,postShader,renderHeight,sceneRT,useSprite,world} from './scene.js';
import {shadowHover} from './toolSprites.js';
/* ================= RENDER ================= */
export const fxv=k=>S.fx[k].on&&!fxOff()?S.fx[k].v:0;
export function renderAt(v){
  const c=plan.cOf(v);
  paintAt(c);wetAt(c);
  if(flushPaint())markHeightDirty();
  paperShader.uniforms.uFlat=0;paperShader.uniforms.uPxS=viewFit()*cam.z*SS;
  if(plan.hasThick)renderHeight();
  paperShader.uniforms.uSelOn=0;paperShader.uniforms.uTime=v;inkUniforms(c);
  {const dv=cam.rv==null?0:clamp(v-cam.rv,0,.1),fz=viewFit()*cam.z;const dz=cam.rz==null||dv<=0?0:Math.abs(cam.z-cam.rz)/dv;
   const spd=Math.hypot(cam.vx,cam.vy)*fz+dz*500;cam.phase+=dv*(.7+spd*.014);cam.rv=v;cam.rz=cam.z;paperShader.uniforms.uCamPhase=cam.phase;
   paperShader.uniforms.uCamV=(cam.x/seg.W)*2.4+(cam.y/seg.H)*1.7+Math.log(Math.max(.2,cam.z))*1.3+(PR||0)*1.5}
  const st=penState(c);
  const tl=st.tool||S.tool;useSprite(tl);
  const col=hex(st.color);penTint.forEach(g=>g.tint=col);
  const h=Math.max(st.h,TOOLS[tl].hover||0);penC.visible=penShadow.visible=st.jar==null;
  setPR(S.human?paperRot(c):0);paperC.rotation=PR;const pw=P2W(st.x,st.y);
  penC.position.set(pw[0],pw[1]);
  const wob=S.human?(.05*Math.sin(v*1.7)+.03*Math.sin(v*5.1+1)):.035*Math.sin(v*1.9);
  const ang=.64+wob+.02*Math.sin(v*4.3)-.05*h;
  const pp=fxv('persp'),lean=.08+.42*pp;
  penC.rotation=ang-lean*.55;penC.scale.set((1+.05*h)*(1+.06*pp),(1+.05*h));
  penShadow.position.set(pw[0]+(4+38*h)*SS,pw[1]+(6+52*h)*SS);penShadow.rotation=ang+lean*.45;penShadow.scale.set((1+.03*h)*(1-.04*pp),1+.03*h);shadowHover(penShadow,h);
  runHook('render',{v,c,st,pw,h});
  const fit=viewFit()*cam.z;
  const hx=(Math.sin(v*.7)*5+Math.sin(v*1.31+1)*2.5)*SS/cam.z*(S.human?.6+2*S.hum.shake:1),hy=(Math.cos(v*.57)*5+Math.sin(v*1.13+2)*2.5)*SS/cam.z*(S.human?.6+2*S.hum.shake:1);
  let tsx=0,tsy=0;if(st.jar!=null){const s=st.jar;jarC.visible=s<GL.t1;if(jarC.visible){const a=smooth(clamp(s/.08,0,1))*(1-smooth(clamp((s-GL.p1-.02)/(GL.t1-GL.p1-.02),0,1)));jarC.alpha=a;
      jarC.position.set(pw[0]+Math.sin(v*31)*2*SS,pw[1]+Math.cos(v*27)*2*SS);jarC.rotation=-1.05+Math.sin(v*14)*.06;jarTint.forEach(g=>g.tint=col);jarC.scale.set(.9+.1*a)}
    if(s>GL.t0&&s<GL.t1){const e=Math.sin(clamp((s-GL.t0)/(GL.t1-GL.t0),0,1)*Math.PI);tsx=Math.sin(v*63)*7*SS*e/cam.z;tsy=Math.cos(v*71)*5*SS*e/cam.z}}else if(jarC)jarC.visible=false;
  updateParts(c,st);liqDropAt(c,st);
  const cw=P2W(cam.x+hx+tsx,cam.y+hy+tsy);world.scale.set(fit);world.pivot.set(cw[0],cw[1]);world.position.set(view.W*OVS/2,view.H*OVS/2);world.rotation=Math.sin(v*.43)*.004;
  const ot=c-plan.revealC;
  paperShader.uniforms.uShine=ot>0?lerp(-.4,1.9,clamp((ot-.7)/1.9,0,1)):-1;
  (plan.sparkles||[]).forEach(s=>{if(!s.g)return;const u=(ot-1.0-s.d)/.9;const k=u>0&&u<1?Math.sin(Math.PI*u):0;s.g.scale.set(k*s.s);s.g.rotation=u*.8});
  // post FX
  const U2=postShader.uniforms,since=v-cam.lastCut;
  U2.uTilt=fxv('tilt')*smoothstep2(1.35,2.4,cam.z)*(S.camMode==='cat'&&addonHasFocus()?.45:1);
  U2.uFocusY=plan.shots[cam.shot]&&plan.shots[cam.shot].fly?.5:clamp(cam.fy==null?.5:cam.fy,.1,.9);
  U2.uBlurG=(cam.lastTrans==='cut'?fxv('focus')*14*(1-smooth(clamp(since/.5,0,1))):0)+(cam.lastTrans==='start'?fxv('focus')*10*(1-smooth(clamp(since/.6,0,1))):0);
  let mv=[0,0];const mb=Math.max(fxv('mblur'),cam.whip?.6:0);if(mb>0){const k=fit/50*mb*1.6;mv=[clamp(cam.vx*k,-140,140),clamp(cam.vy*k,-140,140)]}U2.uVel=mv;
  U2.uCA=fxv('ca')*(1+Math.min(2,Math.hypot(mv[0],mv[1])/40));U2.uVig=fxv('vig');
  const bl=fxv('bloom');U2.uBloom=bl*.6;
  let leak=0;if(bl>0){if(cam.leak&&since<.9&&cam.lastTrans!=='start')leak=Math.sin(Math.PI*since/.9)*bl;if(ot>.5)leak=Math.max(leak,Math.sin(Math.PI*clamp((ot-.5)/2.2,0,1))*bl*.9)}
  U2.uLeak=leak;U2.uLeakPos=ot>.5?[1.05,.05]:cam.leakPos;U2.uLeakHue=cam.leakHue;
  {const pp=fxv('persp'),sh2=plan.shots[cam.shot],fly=sh2&&sh2.fly,pq=pp*.22*(S.camMode==='cat'&&addonHasFocus()?1.6:1),yaw=clamp(cam.vx*fit/view.W*.0035,-.035,.035)*pp/.55+.022*pp*Math.sin(v*.19);
   U2.uPersp=[pq*(fly?.8:1),yaw,fxv('lens')*.07];U2.uDof=pp*(.35+.65*smoothstep2(1.1,2.4,cam.z));
   U2.uBreath=1+fxv('lens')*.022*clamp(Math.abs(cam.fyv||0)*2.2,0,1);U2.uTime=v;U2.uGrain=fxv('grain');U2.uDust=fxv('lens')}
  runHook('late',{v,c});
  penBlur(c,v,st,pw,fit);
  outroAt(v);
  draw();
}
/* inking: the lines appear where the black tool has passed (each line pixel knows its moment, see core/inking.js) */
let inkTex=null,inkKey=null;
function inkUniforms(c){const I=plan.ink,u=paperShader.uniforms;
  if(!I||c>=I.c1){u.uInkP=2;return}
  if(!inkTex||inkKey!==I.tex.key||inkTex.baseTexture.destroyed){if(inkTex)inkTex.destroy(true);inkTex=PIXI.Texture.fromBuffer(I.tex.data,I.tex.W,I.tex.H,{scaleMode:PIXI.SCALE_MODES.NEAREST,alphaMode:PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA,mipmap:PIXI.MIPMAP_MODES.OFF});inkKey=I.tex.key}
  u.uInk=inkTex;u.uInkP=(c-I.c0)/I.dur;u.uInkW=.06/I.dur}
/* the tool smears along its motion like it would with a real shutter (180°: half a frame of travel).
   Uses Pixi's own blur filter (split into x and y strength along the motion), always attached so nothing toggles. */
export let penMB=null;
export function penBlur(c,v,st,pw,fit){const k=fxv('penblur');if(!penC)return;
  if(k<=0){if(penC.filters)penC.filters=null;return}
  if(!penMB){penMB=new PIXI.BlurFilter(0,2);penMB.padding=60}
  if(!penC.filters||penC.filters[0]!==penMB)penC.filters=[penMB];
  let dx=0,dy=0;if(st.jar==null){const c2=plan.cOf(Math.max(0,v-1/120)),p2=penState(c2),q=P2W(p2.x,p2.y);dx=(pw[0]-q[0])*fit*k*1.6;dy=(pw[1]-q[1])*fit*k*1.6;const L=Math.hypot(dx,dy);if(L>70){dx*=70/L;dy*=70/L}}
  penMB.blurXFilter.blur=Math.abs(dx)*.35;penMB.blurYFilter.blur=Math.abs(dy)*.35}
export function draw(){app.renderer.render(world,{renderTexture:sceneRT,clear:true,blit:true});if(OC&&OC.c.visible&&!ed.on){OC.c.position.set(view.W*(OVS-1)/2,view.H*(OVS-1)/2);app.renderer.render(OC.c,{renderTexture:sceneRT,clear:false,blit:true})}app.renderer.render(post)}
