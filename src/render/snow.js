import * as PIXI from 'pixi.js';
import {viewFit} from '../core/plan.js';
import {OVS,view} from '../core/settings.js';
import {TAU,clamp,mk,rngOf,smoothstep2} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {P2W,cam} from './camera.js';
/* ================= SNOW =================
   Flakes fall through the air between the lens and the page. Each one lives in a cell of the page and repeats a fall
   cycle with fresh random spots, everything a closed form of the video time: playback, seeking and export agree.
   Height is a fraction of the way to the lens, so a flake near the camera is projected bigger and farther out
   (perspective) and, with the focus on the paper, blurred into a soft disc (circle of confusion); near the page it
   is a sharp six-branched crystal that tumbles and flashes when a facet catches the light, more so as the camera moves.
   On the page it lies a moment, then melts into a small wet spot that dries away. */
export const SNOW_DEF={on:0,amount:.3,size:.5,speed:.5,wind:.25,dof:.6,glint:.6,melt:.5,crystal:.6};
export const SNOW=Object.assign({},SNOW_DEF);
const M=48,MAXS=700;  // candidates per cell, sprite cap per layer
let T=null,C=null,air=null,glints=null,landC=null,pools=null;
const hh=a=>{a|=0;a=Math.imul(a^a>>>16,0x45d9f3b);a=Math.imul(a^a>>>16,0x45d9f3b);return((a^a>>>16)>>>0)/4294967296};
/* ---- textures (white, tinted per sprite) ---- */
function crystalCv(seed){const N=128,c=mk(N,N),x=c.getContext('2d'),r=rngOf(seed),R=N*.46;x.translate(N/2,N/2);x.strokeStyle='#fff';x.lineCap='round';
  const br=[];for(let k=0;k<3+Math.floor(r()*3);k++)br.push([.25+r()*.6,.12+r()*.28,.4+r()*.5]);  // where along the arm, how long, angle
  const arm=w=>{x.lineWidth=w;x.beginPath();x.moveTo(0,0);x.lineTo(0,-R);br.forEach(([p,l,a])=>{const y=-R*p,L=R*l*(1-p*.5);[-1,1].forEach(s=>{x.moveTo(0,y);x.lineTo(s*Math.sin(a)*L,y-Math.cos(a)*L)})});x.stroke()};
  for(let k=0;k<6;k++){x.save();x.rotate(k*TAU/6);x.globalAlpha=.35;arm(9);x.globalAlpha=1;arm(3.2);x.restore()}
  x.globalAlpha=1;x.fillStyle='#fff';x.beginPath();for(let k=0;k<6;k++){const a=k*TAU/6;x.lineTo(Math.sin(a)*R*.16,-Math.cos(a)*R*.16)}x.fill();return c}
function radCv(stops){const N=128,c=mk(N,N),x=c.getContext('2d'),g=x.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);stops.forEach(([o,a])=>g.addColorStop(o,'rgba(255,255,255,'+a+')'));x.fillStyle=g;x.fillRect(0,0,N,N);return c}
function glintCv(){const N=128,c=mk(N,N),x=c.getContext('2d');x.translate(N/2,N/2);
  const ray=(a,L,w)=>{x.save();x.rotate(a);const g=x.createLinearGradient(0,0,L,0);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.moveTo(0,-w);x.lineTo(L,0);x.lineTo(0,w);x.fill();x.restore()};
  [0,1,2,3].forEach(k=>ray(k*TAU/4,N/2,2.4));[0,1,2,3].forEach(k=>ray(k*TAU/4+TAU/8,N*.22,1.4));
  const g=x.createRadialGradient(0,0,0,0,0,N*.16);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(-N/2,-N/2,N,N);return c}
function textures(){if(T)return T;const t=cv=>PIXI.Texture.from(cv,{mipmap:PIXI.MIPMAP_MODES.ON});
  T={cry:[11,23,37,59].map(s=>t(crystalCv(s))),soft:t(radCv([[0,.9],[.35,.55],[1,0]])),
    bokeh:t(radCv([[0,.42],[.62,.5],[.86,.78],[.93,.5],[1,0]])),glint:t(glintCv()),
    wet:t(radCv([[0,.5],[.7,.42],[.88,.62],[1,0]])),drop:t(radCv([[0,1],[.4,.5],[1,0]]))};return T}
function pool(parent,blend){const p={c:new PIXI.Container(),s:[],n:0,blend};parent.addChild(p.c);return p}
function take(p,tex){let s=p.s[p.n];if(!s){if(p.s.length>=MAXS)return null;s=new PIXI.Sprite(tex);s.anchor.set(.5);if(p.blend)s.blendMode=p.blend;p.c.addChild(s);p.s.push(s)}p.n++;s.texture=tex;s.visible=true;return s}
function finish(p){for(let i=p.n;i<p.s.length;i++)p.s[i].visible=false;p.n=0}
function setup(paperC){textures();
  if(!C){C=new PIXI.Container();air={soft:pool(C,0),rim:pool(C,0),cry:pool(C,0),shade:pool(C,0),bokeh:pool(C,PIXI.BLEND_MODES.ADD),glint:pool(C,PIXI.BLEND_MODES.ADD)};glints=air.glint}
  if(!landC||landC.parent!==paperC){if(landC&&landC.parent)landC.parent.removeChild(landC);landC=new PIXI.Container();paperC.addChild(landC);
    pools={wet:pool(landC,0),shadow:pool(landC,0),rim:pool(landC,0),cry:pool(landC,0),drop:pool(landC,PIXI.BLEND_MODES.ADD)}}}
export const snowC=()=>C;
/* world: the Pixi container holding the page; paperC: the page itself (flakes that land are drawn in its space) */
export function snowAt(v,world,paperC){
  if(!SNOW.on){if(C)C.visible=false;if(landC)landC.visible=false;return}
  setup(paperC);C.visible=landC.visible=true;
  const fit=viewFit()*cam.z,RW=view.W*OVS,RH=view.H*OVS,cx=RW/2,cy=RH/2,rot=world.rotation,rc=Math.cos(rot),rs=Math.sin(rot),pv=world.pivot;
  const scr=(x,y,k)=>{const w=P2W(x,y),dx=(w[0]-pv.x)*fit*k,dy=(w[1]-pv.y)*fit*k;return[cx+dx*rc-dy*rs,cy+dx*rs+dy*rc]};
  // fixed page cells; a zoom-dependent share of their candidates shows, so close-ups are not empty and wide shots not crowded
  const cell=Math.max(seg.W,seg.H)*.18,hw=RW/fit/2,hh2=RH/fit/2,cells=(hw*2/cell)*(hh2*2/cell);
  const want=10+SNOW.amount*SNOW.amount*230,dens=clamp(want*3.2/(M*Math.max(.6,cells)),0,1);
  const base=RH*.016*(.4+SNOW.size*1.3)*Math.pow(cam.z,.35);  // flake size on the page's plane, screen px
  const Tf0=4+(1-SNOW.speed)*9,wind=(SNOW.wind*2-.5)*cell*.06,Tm=1.2+SNOW.melt*5,coc0=SNOW.dof*RH*.035;
  const camT=(cam.x/seg.W)*9+(cam.y/seg.H)*7+cam.z*3;  // the light's angle to each facet shifts as the camera moves
  const mx=Math.abs(wind)*Tf0*1.6+cell*.2;
  // page-space box under the view (the paper is only slightly rotated: pad generously)
  const R=Math.hypot(hw,hh2)*1.05+mx,i0=Math.floor((pv.x-R)/cell),i1=Math.floor((pv.x+R)/cell),j0=Math.floor((pv.y-R)/cell),j1=Math.floor((pv.y+R)/cell);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const cs=(i*73856093^j*19349663)|0;
    for(let n=0;n<M;n++){const sd=cs+n*0x9E3779B1|0,rank=hh(sd);if(rank>=dens)continue;const fade=clamp((dens-rank)/(dens*.25+1e-4),0,1);
      const Tf=Tf0*(.75+.5*hh(sd+1)),ph=hh(sd+2),u=v/Tf+ph,k=Math.floor(u),f=1-(u-k),ss=.55+.9*Math.pow(hh(sd+3),2);
      // ---- in the air ----
      if(f<.965){const cy2=sd+k*7919|0,bx=(i+hh(cy2+4))*cell,by=(j+hh(cy2+5))*cell,left=f*Tf,
          sw=Math.sin(v*(.8+hh(sd+6))+hh(sd+7)*TAU)*cell*.025*f,x=bx-wind*left+sw,y=by-wind*.25*left+Math.cos(v*.9+hh(sd+8)*TAU)*cell*.012*f;
        const kz=1/(1-f),p=scr(x,y,kz),sz=base*ss*kz,coc=coc0*f*kz,ext=sz+coc;
        if(p[0]>-ext&&p[0]<RW+ext&&p[1]>-ext&&p[1]<RH+ext){
          const al=fade*smoothstep2(.965,.88,f),bl=coc/sz,m1=smoothstep2(.15,.7,bl),m2=smoothstep2(.7,2,bl);
          const tum=v*(1.2+hh(sd+9)*2.4)+hh(sd+10)*TAU,spin=hh(sd+11)*TAU+v*(hh(sd+12)-.5)*1.6,sy=.3+.7*Math.abs(Math.cos(tum));
          const g=Math.pow(Math.max(0,Math.cos(tum*1.7+camT+p[0]*.004+p[1]*.003+hh(sd+13)*TAU)),60)*SNOW.glint;
          // ice is clear: its edges refract the darker world behind, so a flake reads on white paper as well as on the desk
          if(m1<1){const r=take(air.rim,T.cry[(sd>>>3)&3]);if(r){r.position.set(p[0]+sz*.03,p[1]+sz*.05);r.rotation=spin;r.scale.set(sz/128*1.1*(1+.2*m1),sz/128*sy*1.1*(1+.2*m1));r.alpha=al*(1-m1)*.7;r.tint=0x4a5a70}
            const s=take(air.cry,T.cry[(sd>>>3)&3]);if(s){s.position.set(p[0],p[1]);s.rotation=spin;s.scale.set(sz/128*(1+.2*m1),sz/128*sy*(1+.2*m1));
            s.alpha=al*(1-m1)*(.55+.45*SNOW.crystal)*(.85+.4*g);s.tint=0xf4f8ff}
            if(SNOW.crystal<1){const q=take(air.soft,T.soft);if(q){q.position.set(p[0],p[1]);q.rotation=0;q.scale.set(sz*.75/128);q.alpha=al*(1-m1)*(1-SNOW.crystal)*.8;q.tint=0xffffff}}}
          if(m1>0&&m2<1){const s=take(air.soft,T.soft);if(s){s.position.set(p[0],p[1]);s.rotation=0;s.scale.set((sz*.8+coc*.9)/128);s.alpha=al*m1*(1-m2)*clamp(1.3*sz/(sz+coc),.18,1);s.tint=0xffffff}}
          if(m1>.3){const s=take(air.shade,T.bokeh);if(s){s.position.set(p[0],p[1]);s.rotation=0;s.scale.set((sz*.6+coc)/128);s.alpha=al*smoothstep2(.3,1.2,bl)*clamp(.14+.6*sz/(sz+coc),.12,.3);s.tint=0x6a7a90}}
          if(m2>0){const s=take(air.bokeh,T.bokeh);if(s){s.position.set(p[0],p[1]);s.rotation=0;s.scale.set((sz*.6+coc)/128);s.alpha=al*m2*clamp(.3+1.2*sz/(sz+coc),.26,.7)*(1+g*.8);s.tint=0xe8eef8}}
          if(g>.04&&m2<1){const s=take(glints,T.glint);if(s){s.position.set(p[0],p[1]);s.rotation=.4+spin*.1;s.scale.set(sz*(1.2+2.4*g)/128*(1+m1));s.alpha=al*clamp(g*1.4,0,1)*(1-m2);s.tint=0xffffff}}}
        // a soft shadow gathers under a flake about to land
        if(f<.07){const lx=bx,ly=by,s=take(pools.shadow,T.soft);if(s){s.position.set(lx+f*cell*.35,ly+f*cell*.5);s.scale.set(base*ss/fit*(1+f*8)/128);s.alpha=fade*.16*(1-f/.07);s.tint=0x1a2030;s.rotation=0}}}
      // ---- landed: lies a moment, then melts into a wet spot that dries ----
      for(let q=1;q<=3;q++){const kl=k-q+1,tl=(kl-ph)*Tf,age=v-tl;if(age<0)continue;if(age>Tm)break;
        const cy2=sd+(kl-1)*7919|0,lx=(i+hh(cy2+4))*cell,ly=(j+hh(cy2+5))*cell,p=scr(lx,ly,1),r=base*ss*1.4;
        if(p[0]<-r||p[0]>RW+r||p[1]<-r||p[1]>RH+r)continue;
        const e=age/Tm,szp=base*ss/fit,melt=smoothstep2(.12,.7,e),dry=smoothstep2(.45,1,e),ang=hh(cy2+14)*TAU;
        const w=take(pools.wet,T.wet);if(w){w.position.set(lx,ly);w.rotation=ang;w.scale.set(szp*(.55+.35*melt)/128,szp*(.5+.3*melt)/128);w.alpha=fade*.22*smoothstep2(0,.3,e)*(1-dry);w.tint=0x18263a}
        if(melt<1){const r=take(pools.rim,T.cry[(cy2>>>3)&3]);if(r){r.position.set(lx+szp*.03,ly+szp*.05);r.rotation=ang;r.scale.set(szp*(1-.55*melt)*1.1/128);r.alpha=fade*(1-melt)*.55;r.tint=0x4a5a70}}
        if(melt<1){const s=take(pools.cry,T.cry[(cy2>>>3)&3]);if(s){s.position.set(lx,ly);s.rotation=ang;s.scale.set(szp*(1-.55*melt)/128);s.alpha=fade*(1-melt)*.95;s.tint=0xf6faff}}
        const g=Math.pow(Math.max(0,Math.cos(camT*1.3+hh(cy2+15)*TAU+v*.6)),24)*SNOW.glint;
        const d=take(pools.drop,T.drop);if(d){d.position.set(lx-szp*.12,ly-szp*.14);d.rotation=0;d.scale.set(szp*(.18+.25*g)/128);d.alpha=fade*(.25+.75*g)*smoothstep2(.2,.5,e)*(1-dry)*.9;d.tint=0xffffff}}}}
  [...Object.values(air),...Object.values(pools)].forEach(finish);
}
export function resetSnow(){landC=null}
