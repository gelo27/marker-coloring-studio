import {S} from '../core/settings.js';
import {TAU,vnA} from '../core/utils.js';
export const SR=48000;
export let nsd=1;export function nz(){nsd^=nsd<<13;nsd^=nsd>>>17;nsd^=nsd<<5;return (nsd>>>0)/2147483648-1}
export const u01=()=>(nz()+1)/2;
export function BQ(type,f,Q){this.x1=this.x2=this.y1=this.y2=0;this.type=type;this.Q=Q;this.set(f)}
BQ.prototype.set=function(f){const w=2*Math.PI*Math.min(Math.max(f,20),SR*.45)/SR,cs=Math.cos(w),al=Math.sin(w)/(2*this.Q),a0=1+al;let b0,b1,b2;
  if(this.type==='lp'){b0=(1-cs)/2;b1=1-cs;b2=b0}else if(this.type==='hp'){b0=(1+cs)/2;b1=-(1+cs);b2=b0}else{b0=al;b1=0;b2=-al}
  this.b0=b0/a0;this.b1=b1/a0;this.b2=b2/a0;this.a1=-2*cs/a0;this.a2=(1-al)/a0;return this};
BQ.prototype.p=function(x){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y};
/* paper-tooth crackle: grains fire per distance travelled, so a faster hand crackles faster */
export function Crackle(f,Q,dec,dens,prob){this.bp=new BQ('bp',f,Q);this.k=Math.exp(-1/(SR*dec));this.e=0;this.cell=0;this.dens=dens;this.prob=prob}
Crackle.prototype.p=function(d,amt){const c=Math.floor(d*this.dens);if(c!==this.cell){this.cell=c;if(u01()<this.prob)this.e=Math.max(this.e,(.3+.7*u01())*amt)}this.e*=this.k;return this.bp.p(nz()*this.e)};
export const SND_TOOLS={
  chameleon:null,
  marker:{att:.006,rel:.03,tap:{f:190,dec:.016,click:.55,amt:.5},
    init(r){return{a:new BQ('bp',2500,.8),b:new BQ('bp',5200,1.1),sq:new BQ('bp',1900,26),sqf:1500+r()*900,sqa:0}},
    proc(s,e,sp,d,det,i,t){if((i&63)===0){s.a.set(2400*det*(.82+.36*sp));s.b.set(5000*det*(.9+.24*sp));s.sq.set(s.sqf*det*(.96+.1*sp))}
      const n=nz(),tm=.55+.9*vnA(d*.75);let o=(s.a.p(n)+s.b.p(n)*.4)*tm;
      
      return o*e*(.1+.9*Math.pow(sp,.8))}},
  copic:{att:.008,rel:.04,tap:{f:160,dec:.02,click:.35,amt:.4},
    init(){return{a:new BQ('bp',1700,.7),b:new BQ('bp',3600,.9),lp:new BQ('lp',6500,.7)}},
    proc(s,e,sp,d,det,i){if((i&63)===0){s.a.set(1650*det*(.85+.3*sp));s.b.set(3500*det*(.9+.25*sp))}const n=nz(),tm=.78+.44*vnA(d*.4);return s.lp.p(s.a.p(n)+s.b.p(n)*.25)*tm*e*(.08+.92*Math.pow(sp,.7))}},
  pencil:{att:.004,rel:.02,tap:{f:430,dec:.011,click:1,amt:.55},
    init(){return{h:new BQ('hp',2600,.7),body:new BQ('bp',1100,.8),cr:new Crackle(3900,1.2,.0008,1.7,.55)}},
    proc(s,e,sp,d,det,i){if((i&63)===0){s.h.set(2500*det);s.body.set(1050*det)}const n=nz(),tm=.35+1.3*vnA(d*2.3),a=.15+.85*Math.pow(sp,.7);
      return (s.h.p(n)*.55*tm+s.body.p(n)*.22)*e*a+s.cr.p(d,e*a)*2.2}},
  watercolor:{att:.02,rel:.07,tap:{f:120,dec:.03,click:.08,amt:.15},
    init(){return{l:new BQ('lp',900,.5),b:new BQ('bp',2300,.7),pla:0,plf:0,plp:0,pln:0}},
    proc(s,e,sp,d,det,i,t){if((i&63)===0){s.l.set((550+800*sp)*det);s.b.set(2200*det)}
      const n=nz(),tm=.7+.6*vnA(t*2.3+9);let o=(s.l.p(n)*1.1+s.b.p(n)*.16)*tm*e*(.06+.94*Math.pow(sp,.9));
      if(e>.3&&u01()<1.6*sp/SR){s.pla=.06+.08*u01();s.plf=800+900*u01();s.pln=0}
      if(s.pla>1e-4){s.pln++;const f=s.plf*(1+Math.min(1.2,s.pln/SR*60));s.plp+=2*Math.PI*f/SR;o+=Math.sin(s.plp)*s.pla;s.pla*=.9986}
      return o}},
  pastel:{att:.006,rel:.03,tap:{f:230,dec:.024,click:.55,amt:.5},
    init(){return{a:new BQ('bp',1300,.6),rum:new BQ('lp',240,.7),cr:new Crackle(1900,1,.0016,1.1,.5)}},
    proc(s,e,sp,d,det,i){if((i&63)===0)s.a.set(1250*det*(.85+.3*sp));const n=nz(),tm=.45+1.1*vnA(d*1.1),a=.12+.88*Math.pow(sp,.75);
      return (s.a.p(n)*.75*tm+s.rum.p(n)*.5*sp)*e*a+s.cr.p(d,e*a)*1.6}},
  gel:{att:.005,rel:.025,tap:{f:320,dec:.012,click:.8,amt:.4},
    init(){return{a:new BQ('bp',950,2.5),h:new BQ('hp',5200,.7),cr:new Crackle(6500,1.5,.0005,.7,.32)}},
    proc(s,e,sp,d,det,i){if((i&63)===0)s.a.set(950*det*(.9+.25*sp));const n=nz(),a=.1+.9*Math.pow(sp,.8);
      return (s.a.p(n)*.8+s.h.p(n)*.12)*e*a+s.cr.p(d,e*a)*.9}},
  puffy:{att:.012,rel:.05,tap:{f:140,dec:.03,click:.2,amt:.3},
    init(){return{l:new BQ('lp',650,.7),b:new BQ('bp',1400,1.2),sq:new BQ('bp',900,5),cr:new Crackle(1200,1.5,.003,.35,.4)}},
    proc(s,e,sp,d,det,i){if((i&63)===0){s.l.set((450+500*sp)*det);s.b.set(1300*det)}const n=nz(),a=.08+.92*Math.pow(sp,.8),tm=.7+.6*vnA(d*.3);
      return (s.l.p(n)+s.b.p(n)*.25)*e*a*tm+s.sq.p(s.cr.p(d,e*a)*4)*1.2}},
  glue:{att:.015,rel:.05,tap:{f:150,dec:.025,click:.15,amt:.22},
    init(){return{l:new BQ('lp',600,.7),b:new BQ('bp',1300,1.4),sq:new BQ('bp',800,6),cr:new Crackle(1100,1.5,.003,.3,.35)}},
    proc(s,e,sp,d,det,i){if((i&63)===0){s.l.set((420+450*sp)*det);s.b.set(1250*det)}const n=nz(),a=.08+.92*Math.pow(sp,.8),tm=.7+.6*vnA(d*.3);
      return ((s.l.p(n)+s.b.p(n)*.2)*e*a*tm+s.sq.p(s.cr.p(d,e*a)*4)*1.1)*.75}},
  airbrush:{att:.05,rel:.12,tap:{amt:0},
    init(){return{h:new BQ('hp',450,.7),l:new BQ('lp',8500,.7)}},
    proc(s,e,sp,d,det,i,t){return s.l.p(s.h.p(nz()))*.55*e*(1+.07*Math.sin(2*Math.PI*17.3*t))*(.85+.15*sp)}}
};
SND_TOOLS.chameleon=SND_TOOLS.marker;/* one bubble after van den Doel: Minnaert pitch from its radius, physical damping, slight upward chirp as it
   rises, sharp onset. Radii follow a power law, so many tiny ticks and only a few deeper blips. */
export function bubbleParams(rr,scale){const rmin=.9,rmax=7.5,u=rr(),r=rmin*Math.pow(1-u*(1-Math.pow(rmin/rmax,1.5)),-1/1.5),f0=3260/r,d=(.13*f0+.0072*Math.pow(f0,1.5))*.62;
  return{f0,d,sg:d*(.09+.18*rr()),a:(scale||1)*.11*Math.pow(r/2,1.15)*(.55+.6*rr()),ph:rr()*TAU,k:0}}
export function bubbleTick(B){const q=B.k/SR,f=B.f0*(1+B.sg*q);B.ph+=TAU*f/SR;B.k++;return Math.sin(B.ph)*B.a*Math.exp(-B.d*q)*(1-Math.exp(-q/.00025))}
SND_TOOLS.liquid={loud:.5,att:.05,rel:.22,tap:{f:600,dec:.02,click:0,amt:0},
  init(){return{b:[],lp:new BQ('lp',230,.6),sm:[],bp:new BQ('bp',750,1.1)}},
  // wet paint moving: clusters of tiny bubbles (gurgle), rare deeper blips, little viscous 'smacks', a faint low body
  proc(s,e,sp,d,det,i,t){let o=s.lp.p(nz())*.05*e*(.4+.6*vnA(t*1.3+5));
    const burst=Math.pow(vnA(t*2.6+11),2.2)*2.4,rate=e*(2+20*Math.min(1.3,sp))*burst;
    if(s.b.length<10&&u01()<rate/SR){const B=bubbleParams(u01,1);B.f0*=det;s.b.push(B)}
    for(let j=s.b.length-1;j>=0;j--){const B=s.b[j];o+=bubbleTick(B);if(B.k>SR*7/B.d)s.b.splice(j,1)}
    if(u01()<e*(1.5+5*Math.min(1,sp))/SR)s.sm.push({k:0,a:.06+.08*u01(),dc:.003+.005*u01()});
    let sx=0;for(let j=s.sm.length-1;j>=0;j--){const M=s.sm[j],q=M.k/SR;sx+=nz()*M.a*Math.exp(-q/M.dc);M.k++;if(q>M.dc*6)s.sm.splice(j,1)}o+=s.bp.p(sx);
    return o}};
/* one-shot sounds */
export function evSnap(put,t,pan,amp,f){const bp=new BQ('bp',f,2.2);put(t,.03,pan,k=>{const a=k/SR;return bp.p(nz()*Math.exp(-a/.0011))*amp*3+Math.sin(2*Math.PI*f*.3*a)*Math.exp(-a/.006)*amp*.35})}
export function evSlide(put,t,pan,amp,dur,f){const bp=new BQ('bp',f,.9);put(t,dur,pan,k=>bp.p(nz())*amp*Math.sin(Math.PI*k/SR/dur))}
export function evPop(put,t,pan,amp,f0,f1){let ph=0;const lp=new BQ('lp',1600,.7);put(t,.08,pan,k=>{const a=k/SR,f=f1+(f0-f1)*Math.exp(-a/.012);ph+=2*Math.PI*f/SR;return Math.sin(ph)*Math.exp(-a/.03)*amp+lp.p(nz())*Math.exp(-a/.004)*amp*.5})}
export function evKnock(put,t,pan,amp,modes){put(t,.14,pan,k=>{const a=k/SR;let o=0;for(const m of modes)o+=Math.sin(2*Math.PI*m[0]*a)*Math.exp(-a/m[1])*m[2];return (o+nz()*Math.exp(-a/.0015)*.4)*amp})}
export function evBubbles(put,t,pan,amp,dur,n,rnd){for(let j=0;j<n;j++){const tt=t+Math.pow(rnd(),1.6)*dur,B=bubbleParams(rnd,amp*.4);put(tt,7/B.d+.002,pan+(rnd()-.5)*.3,()=>bubbleTick(B))}}
export function evPlips(put,t,pan,amp,dur,n,rnd){for(let j=0;j<n;j++){const tt=t+rnd()*dur,f0=700+rnd()*1300,a0=amp*(.4+rnd()*.6);let ph=0;put(tt,.04,pan+(rnd()-.5)*.25,k=>{const a=k/SR,f=f0*(1+Math.min(1.3,a*70));ph+=2*Math.PI*f/SR;return Math.sin(ph)*a0*Math.exp(-a/.012)})}}
export function evSwirl(put,t,pan,amp,dur){const bp=new BQ('bp',650,.6);put(t,dur,pan,k=>{const a=k/SR;return bp.p(nz())*amp*Math.sin(Math.PI*a/dur)*(.7+.3*Math.sin(2*Math.PI*6.5*a))})}
export function evHiss(put,t,pan,amp,dur){const hp=new BQ('hp',1500,.7);put(t,dur,pan,k=>{const a=k/SR;return hp.p(nz())*amp*Math.min(1,a/.01)*Math.exp(-a/(dur*.4))})}
export function toolEvent(put,e,rnd){
  const v=.8+rnd()*.4,p=.92+rnd()*.16,t=e.t,pan=e.pan,cl=e.type==='close';
  if(e.type==='pour'){const n=Math.round(e.d*230),hs=new BQ('hp',4200,.7);evSlide(put,t,pan,.03*v,e.d,5200);
    for(let j=0;j<n;j++){const tt=t+rnd()*e.d,f=4800+rnd()*4500,a=.04+rnd()*.1,bp=new BQ('bp',f,3);put(tt,.006,pan+(rnd()-.5)*.3,k=>bp.p(nz()*Math.exp(-k/SR/.0005))*a*3)}return}
  if(e.type==='drip'){ // the drop lands: a wet impact, the entrained 'plop' bubble, then a small fizz of droplets
    const bp=new BQ('bp',1500+rnd()*700,.7),lp=new BQ('lp',900,.7);put(t,.05,pan,k=>{const a=k/SR,n=nz();return (bp.p(n)*Math.exp(-a/.006)*.2+lp.p(n)*Math.exp(-a/.012)*.14)*v});
    const r0=3+rnd()*1.8,f0=3260/r0*p,B={f0,d:(.13*f0+.0072*Math.pow(f0,1.5))*.45,sg:0,a:.22*v,ph:0,k:0};B.sg=B.d*.35;put(t+.004+rnd()*.006,7/B.d,pan,()=>bubbleTick(B));
    evBubbles(put,t+.02,pan,.9*v,.22,7+Math.floor(rnd()*5),rnd);return}
  if(e.type==='tap'){[0,.1,.21].forEach((dt,j)=>{evKnock(put,t+dt,pan,(.28-j*.06)*v,[[150*p,.03,1],[420*p,.012,.3]]);for(let k=0;k<14;k++){const tt=t+dt+rnd()*.12,f=5000+rnd()*4000,bp=new BQ('bp',f,3),a=.05+rnd()*.08;put(tt,.006,pan,q=>bp.p(nz()*Math.exp(-q/SR/.0005))*a*3)}});return}
  switch(e.tool||S.tool){
    case 'chameleon':
    case 'marker':if(cl){evSlide(put,t-.04,pan,.05*v,.04,2200*p);evSnap(put,t,pan,.45*v,3300*p)}else{evSlide(put,t,pan,.04*v,.035,1800*p);evPop(put,t+.035,pan,.5*v,330*p,140*p)}break;
    case 'copic':if(cl){evSlide(put,t-.05,pan,.05*v,.05,1700*p);evSnap(put,t,pan,.38*v,2500*p)}else{evSlide(put,t,pan,.045*v,.045,1500*p);evPop(put,t+.045,pan,.55*v,260*p,105*p)}break;
    case 'pencil':if(cl)evKnock(put,t,pan,.35*v,[[650*p,.035,1],[1700*p,.015,.5],[2900*p,.008,.25]]);else{evKnock(put,t,pan,.16*v,[[700*p,.03,1],[1800*p,.012,.4]]);evSlide(put,t+.03,pan,.03*v,.05,3000*p)}break;
    case 'gel':evSnap(put,t,pan,.4*v,4300*p);evSnap(put,t+.022+rnd()*.01,pan,.3*v,3000*p);evKnock(put,t,pan,.12*v,[[1300*p,.008,.5]]);break;
    case 'liquid':evBubbles(put,t,pan,(cl?1.1:.8)*v,cl?.18:.12,cl?6:4,rnd);break;
    case 'watercolor':if(cl){evSwirl(put,t,pan,.12*v,.55);evPlips(put,t,pan,.1*v,.5,14,rnd)}else{evKnock(put,t-.13,pan,.1*v,[[2100*p,.06,1],[3400*p,.04,.5]]);evKnock(put,t-.05,pan,.08*v,[[2150*p,.06,1],[3450*p,.04,.5]])}break;
    case 'pastel':if(cl)evKnock(put,t,pan,.3*v,[[380*p,.045,1],[900*p,.02,.4]]);else evSlide(put,t,pan,.05*v,.06,1200*p);break;
    case 'puffy':if(cl){evSnap(put,t,pan,.25*v,2600*p);evPop(put,t+.03,pan,.3*v,180*p,90*p)}else{evSlide(put,t,pan,.05*v,.08,1300*p);evSnap(put,t+.08,pan,.25*v,3000*p)}break;
    case 'glue':if(cl)evSnap(put,t,pan,.22*v,2900*p);else{evSlide(put,t,pan,.04*v,.06,1500*p);evSnap(put,t+.06,pan,.22*v,3200*p)}break;
    case 'airbrush':if(cl)evSnap(put,t,pan,.12*v,2800*p);else{evSnap(put,t,pan,.15*v,3500*p);evHiss(put,t+.01,pan,.12*v,.25)}break;
  }
}
export function reverb(inp,N,wet){
  const outL=new Float32Array(N),outR=new Float32Array(N);
  const C=l=>({b:new Float32Array(l),i:0,f:0}),A=l=>({b:new Float32Array(l),i:0});
  const cl=[1557,1617,1491,1422].map(C),cr=[1580,1640,1514,1445].map(C),al=[556,441].map(A),ar=[579,464].map(A);
  const fb=.77,dm=.32,pre=Math.round(.009*SR);
  for(let n=0;n<N;n++){const x=(n>=pre?inp[n-pre]:0)*.05;let yl=0,yr=0;
    for(let k=0;k<4;k++){let c=cl[k],o=c.b[c.i];c.f=o*(1-dm)+c.f*dm;c.b[c.i]=x+c.f*fb;if(++c.i>=c.b.length)c.i=0;yl+=o;
      c=cr[k];o=c.b[c.i];c.f=o*(1-dm)+c.f*dm;c.b[c.i]=x+c.f*fb;if(++c.i>=c.b.length)c.i=0;yr+=o}
    for(let k=0;k<2;k++){let a=al[k],o=a.b[a.i];a.b[a.i]=yl+o*.5;if(++a.i>=a.b.length)a.i=0;yl=o-yl;
      a=ar[k];o=a.b[a.i];a.b[a.i]=yr+o*.5;if(++a.i>=a.b.length)a.i=0;yr=o-yr}
    outL[n]=yl*wet;outR[n]=yr*wet}
  return[outL,outR];
}
export function seedNoise(v){nsd=v}
