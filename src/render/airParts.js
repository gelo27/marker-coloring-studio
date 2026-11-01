import * as PIXI from 'pixi.js';
import {plan,viewFit} from '../core/plan.js';
import {OVS,view} from '../core/settings.js';
import {SS,TAU,clamp,mk,rngOf,smoothstep2} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {P2W,PR as PRot,cam,penState} from './camera.js';
/* ================= AIRBORNE PARTICLES =================
   Dust motes in a beam of light, cherry petals, autumn leaves, soap bubbles and dandelion seeds, built like the snow:
   each lives in a page cell and repeats a cycle with fresh random spots, all a closed form of the video time.
   Height is a fraction of the way to the lens (perspective), focus is on the paper (near ones blur into discs).
   Petals, leaves and seeds tumble down, land and lie on the page a while; bubbles drift down and pop on it. */
const K=o=>Object.assign({on:0,amount:.35,size:.5,speed:.5},o);
export const AIR_DEF={wind:.25,dof:.6,dust:K({}),petals:K({}),leaves:K({}),bubbles:K({}),fluff:K({})};
export const AIR=JSON.parse(JSON.stringify(AIR_DEF));
export function airLoad(d){const D=JSON.parse(JSON.stringify(AIR_DEF));
  if(d)Object.keys(D).forEach(k=>{if(d[k]===undefined)return;if(typeof D[k]==='object')Object.assign(D[k],d[k]);else D[k]=d[k]});
  Object.keys(D).forEach(k=>{AIR[k]=D[k]})}
const LEAF_TINTS=[0xe0662a,0xf0a23c,0xc23b22,0xd98a2b,0x9a5b2c,0xe8c046];
/* per kind: candidates per cell, how many show on screen, size (of the frame height), fall time (s), sway, spin,
   tumble, wind share, seconds it lies on the page */
const KD={
  dust:{M:96,want:a=>20+a*a*380,size:.0045,Tf:26,float:1,wind:.25},
  petals:{M:16,want:a=>4+a*a*60,size:.03,Tf:11,sway:.07,swayF:.7,spin:1.4,tum:2.2,wind:1,lie:10,flat:.25,col:0xf6c3d2},
  leaves:{M:16,want:a=>3+a*a*42,size:.05,Tf:7.5,sway:.09,swayF:.55,spin:2,tum:3,wind:.8,lie:12,flat:.2,col:0xd98a2b},
  bubbles:{M:16,want:a=>3+a*a*40,size:.045,Tf:17,sway:.04,swayF:.4,spin:.3,tum:0,wind:.6,pop:1,col:0xd8ecff},
  fluff:{M:16,want:a=>4+a*a*50,size:.04,Tf:20,sway:.06,swayF:.35,spin:.4,tum:.6,wind:2,lie:8,flat:.65,rim:1,col:0xf4f4f0}};
const KINDS=Object.keys(KD),MAXS=900;
const hh=a=>{a|=0;a=Math.imul(a^a>>>16,0x45d9f3b);a=Math.imul(a^a>>>16,0x45d9f3b);return((a^a>>>16)>>>0)/4294967296};
/* ---- textures ---- */
const N=128;
function cv(draw){const c=mk(N,N),x=c.getContext('2d');x.translate(N/2,N/2);draw(x);return c}
function blurred(src,px){const c=mk(N,N),x=c.getContext('2d');x.filter='blur('+px+'px)';x.drawImage(src,0,0);return c}
function radCv(stops){const c=mk(N,N),x=c.getContext('2d'),g=x.createRadialGradient(N/2,N/2,0,N/2,N/2,N/2);stops.forEach(([o,a])=>g.addColorStop(o,'rgba(255,255,255,'+a+')'));x.fillStyle=g;x.fillRect(0,0,N,N);return c}
function petalCv(seed){const r=rngOf(seed+7);return cv(x=>{const L=N*.44,W=N*(.24+r()*.06),n=N*(.05+r()*.04);x.rotate((r()-.5)*.3);
  x.beginPath();x.moveTo(0,L);x.bezierCurveTo(W*1.2,L*.4,W*1.1,-L*.7,n*1.4,-L);x.lineTo(0,-L+n*1.6);x.lineTo(-n*1.4,-L);x.bezierCurveTo(-W*1.1,-L*.7,-W*1.2,L*.4,0,L);x.closePath();
  const hue=[['#f6a9c0','#fde6ee'],['#f39bb5','#fbd9e4'],['#fbd3df','#fff4f7'],['#f7b2c6','#fff0f4']][seed%4],g=x.createLinearGradient(0,-L,0,L);
  g.addColorStop(0,hue[0]);g.addColorStop(1,hue[1]);x.fillStyle=g;x.fill();
  x.save();x.clip();x.strokeStyle='rgba(200,90,120,.2)';x.lineWidth=1;for(let k=-2;k<=2;k++){x.beginPath();x.moveTo(0,L*.9);x.quadraticCurveTo(k*W*.3,0,k*W*.35,-L*.85);x.stroke()}x.restore()})}
/* a maple leaf seen flat: five pointed lobes (a long top one, two big side ones, two small lower ones) with deep
   notches between them and a toothed edge; [angle from the top in degrees, length] of its tips and notches, right half */
const MAPLE=[[0,1],[27,.4],[62,.94],[98,.44],[130,.6],[160,.27],[180,.2]];
function mapleEdge(x,R,r){const half=MAPLE.map(([a,q])=>[a*Math.PI/180,q]),K=half.concat(half.slice(0,-1).reverse().map(([a,q])=>[TAU-a,q]));
  const P=(a,q)=>[Math.sin(a)*q*R,-Math.cos(a)*q*R];x.moveTo(...P(K[0][0],K[0][1]));
  for(let k=1;k<K.length;k++){const[a0,q0]=K[k-1],[a1,q1]=K[k],lobe=Math.max(q0,q1)>.5;
    // teeth along a lobe's sides: points just outside then just inside the straight edge
    if(lobe)for(let t=1;t<=4;t++){const u=t/5,j=t%2?1.09+r()*.04:.95;x.lineTo(...P(a0+(a1-a0)*u,(q0+(q1-q0)*u)*j))}
    x.lineTo(...P(a1,q1))}}
/* leaves are drawn light grey (white body, darker veins) and tinted per leaf */
function leafCv(seed){const r=rngOf(seed+31),maple=seed%2===0;return cv(x=>{const R=N*.45;x.lineJoin='miter';x.beginPath();
  if(maple)mapleEdge(x,R,r);
  else{const W=R*(.42+r()*.12);x.moveTo(0,-R);x.bezierCurveTo(W*1.3,-R*.45,W,R*.5,0,R*.72);x.bezierCurveTo(-W,R*.5,-W*1.3,-R*.45,0,-R)}
  x.closePath();const g=x.createLinearGradient(-R,-R,R,R);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#cfcfcf');x.fillStyle=g;x.fill();
  x.save();x.clip();x.lineCap='round';
  if(maple){const o=[0,R*.2];MAPLE.filter(([,q])=>q>.5).forEach(([a,q])=>[a,-a].forEach((b,i)=>{if(i&&!a)return;const t=b*Math.PI/180,ex=Math.sin(t)*q*R*.88,ey=-Math.cos(t)*q*R*.88;
      x.strokeStyle='rgba(0,0,0,.3)';x.lineWidth=a?1.6:2;x.beginPath();x.moveTo(o[0],o[1]);x.lineTo(ex,ey);x.stroke();
      // side veins off each main one
      x.strokeStyle='rgba(0,0,0,.15)';x.lineWidth=.9;for(let k=1;k<=3;k++){const u=k/4,mx=o[0]+(ex-o[0])*u,my=o[1]+(ey-o[1])*u;[-.7,.7].forEach(d=>{x.beginPath();x.moveTo(mx,my);x.lineTo(mx+Math.sin(t+d)*R*.18*(1-u*.5),my-Math.cos(t+d)*R*.18*(1-u*.5));x.stroke()})}}));
    x.restore();x.strokeStyle='rgba(70,45,25,.9)';x.lineWidth=2.2;x.beginPath();x.moveTo(0,R*.18);x.quadraticCurveTo(R*.02,R*.55,R*.08,R*.92);x.stroke();return}
  x.strokeStyle='rgba(0,0,0,.3)';x.lineWidth=2;x.beginPath();x.moveTo(0,R*.7);x.lineTo(0,-R*.9);x.stroke();x.lineWidth=1.1;x.strokeStyle='rgba(0,0,0,.18)';
  for(let k=0;k<6;k++){const y=-R*.6+k*R*.22;[-1,1].forEach(s=>{x.beginPath();x.moveTo(0,y+R*.1);x.lineTo(s*R*.38,y-R*.08);x.stroke()})}
  x.restore();x.strokeStyle='rgba(70,45,25,.9)';x.lineWidth=2.2;x.beginPath();x.moveTo(0,R*.62);x.lineTo(R*.05,R*.98);x.stroke()})}
/* a soap film: faint body, a thin-film rainbow along the rim (turns with the bubble), a hairline edge */
function bubbleCv(){return cv(x=>{const R=N*.47,g=x.createConicGradient?x.createConicGradient(0,0,0):null;
  if(g)['#ff6aa8','#ffd36a','#7dffb0','#6ac8ff','#b07dff','#ff6aa8'].forEach((c,i,a)=>g.addColorStop(i/(a.length-1),c));
  x.filter='blur(1px)';x.globalAlpha=.07;x.fillStyle='#dfefff';x.beginPath();x.arc(0,0,R,0,TAU);x.fill();
  x.globalAlpha=.5;x.strokeStyle=g||'#cfe6ff';x.lineWidth=N*.05;x.beginPath();x.arc(0,0,R*.93,0,TAU);x.stroke();
  x.globalAlpha=.15;x.lineWidth=N*.16;x.beginPath();x.arc(0,0,R*.78,0,TAU);x.stroke();
  x.globalAlpha=.35;x.strokeStyle='#283c5a';x.lineWidth=1.2;x.beginPath();x.arc(0,0,R*.985,0,TAU);x.stroke()})}
/* the window reflection stays put while the film turns */
function bubbleHiCv(){return cv(x=>{const R=N*.47;x.filter='blur(2px)';x.strokeStyle='rgba(255,255,255,.95)';x.lineWidth=N*.05;x.lineCap='round';
  x.beginPath();x.arc(0,0,R*.72,Math.PI*1.08,Math.PI*1.42);x.stroke();x.fillStyle='rgba(255,255,255,.8)';x.beginPath();x.arc(R*.45,R*.45,N*.03,0,TAU);x.fill()})}
function fluffCv(seed){const r=rngOf(seed+53);return cv(x=>{const R=N*.45,n=34+Math.floor(r()*12);x.lineCap='round';
  for(let k=0;k<n;k++){const a=k/n*TAU+r()*.12,L=R*(.75+r()*.25),bend=(r()-.5)*.25,ex=Math.sin(a)*L,ey=-Math.cos(a)*L;
    x.strokeStyle='rgba(255,255,255,.8)';x.lineWidth=1.1;x.beginPath();x.moveTo(0,0);x.quadraticCurveTo(Math.sin(a+bend)*L*.5,-Math.cos(a+bend)*L*.5,ex,ey);x.stroke();
    x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=.8;for(let t=0;t<4;t++){const b=a+(r()-.5)*1.1,l=R*(.08+r()*.1);x.beginPath();x.moveTo(ex,ey);x.lineTo(ex+Math.sin(b)*l,ey-Math.cos(b)*l);x.stroke()}}
  x.fillStyle='rgba(150,120,90,.95)';x.beginPath();x.arc(0,0,N*.028,0,TAU);x.fill()})}
/* the beam itself: a soft band across its width (along it the sprite is simply stretched) */
function beamCv(){const c=mk(256,4),x=c.getContext('2d'),g=x.createLinearGradient(0,0,256,0);for(let k=0;k<=16;k++){const u=k/16,d=(u-.5)*4;g.addColorStop(u,'rgba(255,255,255,'+Math.exp(-d*d).toFixed(3)+')')}x.fillStyle=g;x.fillRect(0,0,256,4);return c}
let T=null;
function textures(){if(T)return T;const t=c=>PIXI.Texture.from(c,{mipmap:PIXI.MIPMAP_MODES.ON}),both=cs=>({s:cs.map(t),b:cs.map(c=>t(blurred(c,5)))});
  const bub=bubbleCv();
  T={petals:both([0,1,2,3].map(petalCv)),leaves:both([0,1,2,3].map(leafCv)),bubbles:{s:[t(bub)],b:[t(blurred(bub,5))]},fluff:both([0,1,2,3].map(fluffCv)),
    hi:t(bubbleHiCv()),dot:t(radCv([[0,1],[.12,.92],[.3,.3],[1,0]])),disc:t(radCv([[0,.42],[.62,.5],[.86,.75],[.93,.45],[1,0]])),
    beam:t(beamCv()),soft:t(radCv([[0,.9],[.35,.55],[1,0]])),ring:t(radCv([[0,0],[.7,.1],[.88,.7],[.96,.3],[1,0]]))};return T}
function pool(parent,blend){const p={c:new PIXI.Container(),s:[],n:0,blend};parent.addChild(p.c);return p}
function take(p,tex){let s=p.s[p.n];if(!s){if(p.s.length>=MAXS)return null;s=new PIXI.Sprite(tex);s.anchor.set(.5);if(p.blend)s.blendMode=p.blend;p.c.addChild(s);p.s.push(s)}
  p.n++;s.texture=tex;s.visible=true;s.rotation=0;s.tint=0xffffff;return s}
function finish(p){for(let i=p.n;i<p.s.length;i++)p.s[i].visible=false;p.n=0}
let C=null,L=null,landC=null,G=null;
function setup(paperC){textures();const ADD=PIXI.BLEND_MODES.ADD;
  if(!C){C=new PIXI.Container();L={beam:pool(C,ADD),rim:pool(C,0),sharp:pool(C,0),bok:pool(C,0),add:pool(C,ADD)}}
  if(!landC||landC.parent!==paperC){if(landC){if(landC.parent)landC.parent.removeChild(landC);landC.destroy({children:true})}landC=new PIXI.Container();paperC.addChild(landC);
    G={mark:pool(landC,0),shadow:pool(landC,0),rim:pool(landC,0),lie:pool(landC,0),add:pool(landC,ADD)}}}
export const airC=()=>C;
/* the page-space box under the frame, padded by m: only cells in it can show (anything higher in the air is projected
   farther out, so the footprint on the page bounds it). The page and the world may be turned a little. */
const VB=[0,0,0,0];
export function viewBox(pv,hw,hh,rot,m){const a=rot+PRot,co=Math.abs(Math.cos(a)),si=Math.abs(Math.sin(a)),ex=hw*co+hh*si+m,ey=hw*si+hh*co+m;
  let x=pv.x,y=pv.y;if(PRot){const cx=seg.W/2,cy=seg.H/2,c=Math.cos(-PRot),s=Math.sin(-PRot),dx=x-cx,dy=y-cy;x=cx+dx*c-dy*s;y=cy+dx*s+dy*c}
  VB[0]=x-ex;VB[1]=y-ey;VB[2]=x+ex;VB[3]=y+ey;return VB}
/* ---- the tools sweep and blow what lies on the page ----
   The tips' path is sampled on a fixed grid of video time (cached), and each lying particle replays its own push from
   the moment it landed: a tool passing close drags it along and blows it away from the tip, the more the faster and
   closer it goes (touching the paper it sweeps, lifted only its draught). The same at any frame, however reached. */
const PR=30,TOOL_R=42*SS,TS=new Map(),PC=new Map(),SP=[0,0],PQ=[0,0,0,0];let tsPlan=null,pcFrame=0;
function toolAt(g){let s=TS.get(g);if(s)return s;
  const c=plan.cOf(g/PR),n=plan.tracks?plan.tracks.length:1;s=[];for(let k=0;k<n;k++){const q=penState(c,k);s.push(q.x,q.y,q.h||0)}
  // keep only the last ~20 s around the current time (a lying particle never looks further back)
  if(TS.size>1500)for(const key of TS.keys())if(key<g-20*PR||key>g+20*PR)TS.delete(key);
  TS.set(g,s);return s}
/* where a particle that landed at (lx,ly) at time tl has been pushed to by time v; r: its radius (page units).
   Returns [x, y, turn, lift] (lift 0..1: how fast it is sliding, for its shadow), in one shared array: read it at once;
   key: a number naming the particle's landing; its state is kept, so during playback it only steps the new frames */
export function pushOf(lx,ly,tl,v,r,key){
  if(tsPlan!==plan){TS.clear();PC.clear();tsPlan=plan}
  const g0=Math.ceil(tl*PR),g1=Math.floor(v*PR),dt=1/PR,fr=Math.exp(-5*dt),fw=Math.exp(-3*dt);
  PQ[0]=lx;PQ[1]=ly;PQ[2]=PQ[3]=0;if(!plan||g1<g0)return PQ;
  let st=PC.get(key);if(!st||st.tl!==tl||st.lx!==lx||st.g>g1){st={tl,lx,ly,g:g0-1,x:lx,y:ly,vx:0,vy:0,w:0,a:0};PC.set(key,st)}st.f=pcFrame;
  let{x,y,vx,vy,w,a}=st,prev=toolAt(st.g);
  for(let g=st.g+1;g<=g1;g++){const s=toolAt(g);
    for(let k=0;k<s.length;k+=3){const tx=s[k],ty=s[k+1],h=s[k+2],tvx=(tx-prev[k])*PR,tvy=(ty-prev[k+1])*PR,sp=Math.hypot(tvx,tvy);if(sp<5)continue;
      const Rh=(TOOL_R+r)*(1+h*1.5),dx=x-tx,dy=y-ty,d2=dx*dx+dy*dy;if(d2>Rh*Rh*5)continue;
      const d=Math.sqrt(d2)+1e-3,inf=Math.exp(-d2/(Rh*Rh))*(h<.05?1:.55*Math.max(0,1-h)),k1=Math.min(1,inf*14*dt);
      vx+=(tvx*.6-vx)*k1;vy+=(tvy*.6-vy)*k1;                       // dragged along
      const pu=sp*inf*2*dt/d;vx+=dx*pu;vy+=dy*pu;                // blown away from the tip
      w+=(tvx*dy-tvy*dx)/(d2+r*r)*inf*dt*1.5}                      // and set spinning
    vx*=fr;vy*=fr;w*=fw;x+=vx*dt;y+=vy*dt;a+=w;prev=s}
  st.g=g1;st.x=x;st.y=y;st.vx=vx;st.vy=vy;st.w=w;st.a=a;
  const rest=v-g1/PR;x+=vx*rest;y+=vy*rest;
  PQ[0]=x;PQ[1]=y;PQ[2]=a*dt*PR*.05;PQ[3]=clamp(Math.hypot(vx,vy)/(r*12+1),0,1);return PQ}
export function airAt(v,world,paperC){
  if(!KINDS.some(k=>AIR[k].on)){if(C)C.visible=false;if(landC)landC.visible=false;return}
  setup(paperC);C.visible=landC.visible=true;
  const fit=viewFit()*cam.z,RW=view.W*OVS,RH=view.H*OVS,cx=RW/2,cy=RH/2,rot=world.rotation,rc=Math.cos(rot),rs=Math.sin(rot),pv=world.pivot;
  const scr=(x,y,k)=>{const w=P2W(x,y),dx=(w[0]-pv.x)*fit*k,dy=(w[1]-pv.y)*fit*k;SP[0]=cx+dx*rc-dy*rs;SP[1]=cy+dx*rs+dy*rc;return SP};  // one shared result: no garbage per particle
  const cell=Math.max(seg.W,seg.H)*.18,hw=RW/fit/2,hh2=RH/fit/2,cells=Math.max(.6,(hw*2/cell)*(hh2*2/cell));
  const windB=(AIR.wind*2-.5)*cell*.06,coc0=AIR.dof*RH*.035,zs=Math.pow(cam.z,.35);
  const beamC=v2=>.32+.12*Math.sin(v2*.05)+(cam.x/seg.W-.5)*.25;
  if(AIR.dust.on){const b=take(L.beam,T.beam),o=beamC(v)*RW-(cx*.8-cy*.6);if(b){b.position.set(cx+.8*o,cy-.6*o);b.rotation=Math.atan2(-.6,.8);b.scale.set(RW*.8/256,RW*3/4);b.alpha=.05+.07*AIR.dust.amount;b.tint=0xfff0d6}}
  KINDS.forEach((id,ki)=>{const c=AIR[id];if(!c.on)return;const D=KD[id],TX=T[id];
    const dens=clamp(D.want(c.amount)*3.2/(D.M*cells),0,1),base=RH*D.size*(.4+c.size*1.3)*zs,sp=1.5-c.speed,wind=windB*D.wind;
    const TfMin=D.Tf*sp*.75,mx=Math.abs(wind)*D.Tf*sp*1.3+cell*(.2+(D.sway||0)),qmax=D.lie?Math.ceil(D.lie/TfMin)+1:D.pop?2:0;
    const B=viewBox(pv,hw,hh2,rot,mx+base*2/fit),i0=Math.floor(B[0]/cell),i1=Math.floor(B[2]/cell),j0=Math.floor(B[1]/cell),j1=Math.floor(B[3]/cell);
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const cs=(i*73856093^j*19349663^(ki+1)*83492791)|0;
      for(let n=0;n<D.M;n++){const sd=cs+n*0x9E3779B1|0,rank=(n+hh(sd))/D.M;if(rank>=dens)break;  // ranks rise with n: stop at the first one not shown
        const fade=clamp((dens-rank)/(dens*.04+1e-4),0,1);  // a thin band: only those crossing it while the zoom changes fade
        const Tf=D.Tf*(D.float?1:sp)*(.75+.5*hh(sd+1)),ph=hh(sd+2),u=v/Tf+ph,k=Math.floor(u),ss=.6+.8*Math.pow(hh(sd+3),2),vr=(sd>>>3)&3;
        const cy2=sd+k*7919|0,bx=(i+hh(cy2+4))*cell,by=(j+hh(cy2+5))*cell;
        if(D.float){dust(v,u-k,bx,by,sd,cy2,fade,ss);continue}
        const f=1-(u-k);
        // ---- in the air ----
        if(f<.965){const left=f*Tf,wf=D.swayF*(.8+.4*hh(sd+6)),ws=hh(sd+7)*TAU,
            x=bx-wind*left+Math.sin(v*wf*TAU*.3+ws)*cell*D.sway*f,y=by-wind*.25*left+Math.cos(v*wf*TAU*.22+ws)*cell*D.sway*.45*f;
          const kz=1/(1-f),p=scr(x,y,kz),sz=base*ss*kz,coc=coc0*f*kz,ext=sz+coc;
          if(p[0]>-ext&&p[0]<RW+ext&&p[1]>-ext&&p[1]<RH+ext){
            const al=fade*smoothstep2(.965,.88,f),bl=coc/sz,m1=smoothstep2(.12,.6,bl),m2=smoothstep2(.6,1.8,bl);
            const tum=v*D.tum*(.7+.6*hh(sd+9))+hh(sd+10)*TAU,fl=Math.cos(tum),spin=hh(sd+11)*TAU+v*D.spin*(hh(sd+12)-.5)*2;
            const sy=id==='bubbles'?1+.04*Math.sin(v*3+ws):D.flat+(1-D.flat)*Math.abs(fl),sx=id==='bubbles'?1-.04*Math.sin(v*3+ws):1;
            const tint=tintOf(id,sd,fl),tx=TX.s[vr%TX.s.length],tb=TX.b[vr%TX.b.length];
            if(m1<1&&D.rim){const r=take(L.rim,tx);if(r){r.position.set(p[0]+sz*.03,p[1]+sz*.05);r.rotation=spin;r.scale.set(sz*sx*1.06/N,sz*sy*1.06/N);r.alpha=al*(1-m1)*.45;r.tint=0x56606e}}
            // an opaque thing stays opaque as it goes out of focus: the blurred copy lies under the sharp one at full
            // strength and the sharp one fades out over it (two half-transparent copies would let the page show through)
            if(m1>0&&m2<1){const s=take(L.sharp,tb),g=1+bl*.5;if(s){s.position.set(p[0],p[1]);s.rotation=spin;s.scale.set(sz*sx*g/N,sz*sy*g/N);s.alpha=al*(1-m2)*smoothstep2(0,.35,m1)*clamp(1.2/g,.55,1);s.tint=tint}}
            if(m1<1){const s=take(L.sharp,tx);if(s){s.position.set(p[0],p[1]);s.rotation=spin;s.scale.set(sz*sx/N,sz*sy/N);s.alpha=al*(1-m1);s.tint=tint}}
            if(m2>0){const s=take(L.bok,T.disc);if(s){s.position.set(p[0],p[1]);s.scale.set((sz*.6+coc)/N);s.alpha=al*m2*(D.pop?clamp(.15+.9*sz/(sz+coc),.12,.45):clamp(.35+.9*sz/(sz+coc),.35,.75));s.tint=D.col}}
            if(D.pop){const s=take(L.add,T.hi);if(s){s.position.set(p[0],p[1]);s.scale.set((sz*sx+coc*.5)/N,(sz*sy+coc*.5)/N);s.alpha=al*(.85-.6*m2)}}}
          // a soft shadow gathers under it before it touches down
          if(f<.08){const s=take(G.shadow,T.soft);if(s){s.position.set(bx+f*cell*.35,by+f*cell*.5);s.scale.set(base*ss/fit*(1+f*8)/N);s.alpha=fade*(D.pop?.07:.15)*(1-f/.08);s.tint=0x1a2030}}}
        // ---- on the page ----
        for(let q=1;q<=qmax;q++){const kl=k-q+1,tl=(kl-ph)*Tf,age=v-tl,life=D.lie||3;if(age<0)continue;if(age>life)break;
          const c2=sd+(kl-1)*7919|0,lx=(i+hh(c2+4))*cell,ly=(j+hh(c2+5))*cell,p=scr(lx,ly,1),r=base*ss*1.6;
          if(p[0]<-r||p[0]>RW+r||p[1]<-r||p[1]>RH+r)continue;
          const szp=base*ss/fit,ang=hh(c2+14)*TAU;
          if(D.pop){  // the film bursts: a quick ring, then the faint ring of its water dries away
            if(age<.18){const s=take(G.add,TX.s[0]);if(s){s.position.set(lx,ly);s.rotation=ang;s.scale.set(szp*(1+age*4)/N);s.alpha=fade*(1-age/.18)*.7}}
            const m=take(G.mark,T.ring);if(m){m.position.set(lx,ly);m.scale.set(szp*.8/N);m.alpha=fade*.16*smoothstep2(0,.1,age)*(1-smoothstep2(.6,3,age));m.tint=0x3a5068}
            continue}
          const out=smoothstep2(life-1.5,life,age),fl=hh(c2+15)>.3?1:-1,tint=tintOf(id,sd,fl),tx=TX.s[vr%TX.s.length],sq=.8+.2*hh(c2+16);
          const pq=pushOf(lx,ly,tl,v,szp*.5,c2*8+ki),px=pq[0],py=pq[1],pa=ang+pq[2],lf=1+pq[3]*3;
          const sh=take(G.shadow,tx);if(sh){sh.position.set(px+szp*.05*lf,py+szp*.08*lf);sh.rotation=pa;sh.scale.set(szp*1.04/N,szp*sq*1.04/N);sh.alpha=fade*.22*(1-out);sh.tint=0x101418}
          if(D.rim){const rr=take(G.rim,tx);if(rr){rr.position.set(px+szp*.03,py+szp*.05);rr.rotation=pa;rr.scale.set(szp*1.06/N,szp*sq*1.06/N);rr.alpha=fade*.45*(1-out);rr.tint=0x56606e}}
          const s=take(G.lie,tx);if(s){s.position.set(px,py);s.rotation=pa;s.scale.set(szp/N,szp*sq/N);s.alpha=fade*(1-out);s.tint=tint}}}}});
  /* dust: floats in place, drifting a little; bright where it crosses the beam of light, twinkling as it turns */
  function dust(v,e,bx,by,sd,cy2,fade,ss){const D=KD.dust,c=AIR.dust,base=RH*D.size*(.4+c.size*1.3)*zs,wind=windB*D.wind,
      f=clamp(.06+.86*hh(cy2+9)+.05*Math.sin(v*.4+hh(sd+6)*TAU),0,.95),
      x=bx+wind*(e-.5)*D.Tf+Math.sin(v*.23+hh(sd+7)*TAU)*cell*.03,y=by+Math.cos(v*.19+hh(sd+8)*TAU)*cell*.03-(e-.5)*cell*.04;
    const kz=1/(1-f),p=scr(x,y,kz),sz=base*ss*kz,coc=coc0*f*kz,ext=sz+coc;if(p[0]<-ext||p[0]>RW+ext||p[1]<-ext||p[1]>RH+ext)return;
    const d=(p[0]*.8-p[1]*.6)/RW,bc=beamC(v),beam=.4+.6*Math.exp(-Math.pow((d-bc)/.2,2));
    const tw=.55+.45*Math.pow(Math.sin(v*(1.5+2*hh(sd+9))+hh(sd+10)*TAU),2)+Math.pow(Math.max(0,Math.sin(v*(2+hh(sd+11)*3)+hh(sd+12)*TAU)),30)*.8;
    const env=fade*Math.sqrt(Math.sin(Math.PI*e)),al=Math.min(1,env*beam*tw*1.6),m=smoothstep2(.8,2.2,coc/sz);
    // a faint warm shade around each mote keeps it readable over white paper
    if(m<1){const h=take(L.rim,T.dot);if(h){h.position.set(p[0]+sz*.15,p[1]+sz*.2);h.scale.set((sz*2.6+coc*.6)/N);h.alpha=env*(1-m)*.42;h.tint=0x6b5a48}}
    if(m<1){const s=take(L.add,T.dot);if(s){s.position.set(p[0],p[1]);s.scale.set((sz*1.8+coc*.6)/N);s.alpha=al*(1-m)*clamp(sz*1.8/(sz*1.8+coc*.6),.35,1);s.tint=0xfff0d0}}
    if(m>0){const s=take(L.add,T.disc);if(s){s.position.set(p[0],p[1]);s.scale.set((sz+coc)/N);s.alpha=al*m*clamp(.15+.8*sz/(sz+coc),.1,.35);s.tint=0xffe2b8}}}
  [...Object.values(L),...Object.values(G)].forEach(finish);
}
/* forget the pushes of particles nobody asked for lately (gone from view or melted away) */
export function pushSweep(){pcFrame++;if(PC.size>600)for(const[k,s]of PC)if(s.f<pcFrame-30)PC.delete(k)}
/* colour of a particle: leaves take an autumn hue (and look darker from the back), petals blush a little on the back */
function tintOf(id,sd,fl){if(id==='leaves'){const t=LEAF_TINTS[(sd>>>5)%LEAF_TINTS.length];return fl<0?((t>>16&255)*.78<<16|(t>>8&255)*.78<<8|(t&255)*.78):t}
  if(id==='petals')return fl<0?0xf2dde4:0xffffff;return 0xffffff}
