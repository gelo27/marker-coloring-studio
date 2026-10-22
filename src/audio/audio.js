import {BQ,SND_TOOLS,SR,nz,reverb,seedNoise,toolEvent} from './synth.js';
import {plan,planVer} from '../core/plan.js';
import {FLQ,OUT,S,TOOLS} from '../core/settings.js';
import {$,SS,clamp,rngOf,sleep,vnA} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {penState} from '../render/camera.js';
import {GL} from '../render/glitter.js';
import {outroSnd} from '../render/outro.js';
import {busy,setBusy} from '../ui/playback.js';
export const SND={on:true,vol:.8,strokes:1,events:.8,room:.4,reverb:.35,data:null,key:'',ctx:null,gain:null,src:null,buf:null,bufKey:'',startCtx:0,startT:0};
export function sndKey(){return planVer+'|'+S.tool+'|'+[SND.strokes,SND.events,SND.room,SND.reverb,OUT.on,OUT.dur,OUT.text,OUT.style,FLQ.drops].join(',')}
export async function genAudio(p,onProg){
  seedNoise((12345+S.seed*7919)|0||1);
  const rnd=rngOf(777+S.seed),RCS={},getRC=t=>{if(!RCS[t]){const R=SND_TOOLS[t]||SND_TOOLS.marker;RCS[t]={R,st:R.init(rnd),kA:1-Math.exp(-1/(SR*R.att)),kR:1-Math.exp(-1/(SR*R.rel))}}return RCS[t]};
  // control signals from the pen at 1 kHz
  const CR=1000,M=Math.ceil(p.total*CR)+2,px=new Float32Array(M),py=new Float32Array(M),con=new Uint8Array(M),lid=new Int32Array(M),spd=new Float32Array(M),gl=new Float32Array(M),gr=new Float32Array(M),pa=new Float32Array(M),tl=[];
  for(let j=0;j<M;j++){const v=Math.min(j/CR,p.total),st=(OUT.on&&p.mainTotal!=null&&v>p.mainTotal)?outroSnd(v-p.mainTotal):penState(p.cOf(v));px[j]=st.x;py[j]=st.y;con[j]=((st.kind==='run'||st.kind==='link'||st.kind==='trace')&&st.h<.05)||(st.drop&&st.kind==='pause')?1:0;lid[j]=st.kind==='trace'?-7:st.lid;tl[j]=st.tool||S.tool;
    const pan=clamp((st.x/seg.W-.5)*1.1,-.55,.55);pa[j]=pan;gl[j]=Math.cos((pan+1)*Math.PI/4);gr[j]=Math.sin((pan+1)*Math.PI/4)}
  for(let j=1;j<M;j++)spd[j]=Math.hypot(px[j]-px[j-1],py[j]-py[j-1])*CR/SS;
  const ka=1-Math.exp(-1/(CR*.008));for(let j=1;j<M;j++)spd[j]=spd[j-1]+(spd[j]-spd[j-1])*ka;for(let j=M-2;j>=0;j--)spd[j]=spd[j+1]+(spd[j]-spd[j+1])*ka;
  const cs=[];for(let j=0;j<M;j++)if(con[j])cs.push(spd[j]);cs.sort((a,b)=>a-b);const norm=cs.length?Math.max(30,cs[Math.floor(cs.length*.85)]):100;
  const N=Math.ceil((p.total+.6)*SR),SL=new Float32Array(N),SRt=new Float32Array(N),EL=new Float32Array(N),ER=new Float32Array(N);
  const put=(t,dur,pan,gen,g)=>{const n0=Math.round(t*SR),len=Math.round(dur*SR),G=g==null?SND.events:g,a=Math.cos((pan+1)*Math.PI/4),b=Math.sin((pan+1)*Math.PI/4);
    for(let k=0;k<len;k++){const x=gen(k)*G,n=n0+k;if(n<0||n>=N)continue;EL[n]+=x*a;ER[n]+=x*b}};
  /* human gestures: a hand colours in sweeps. Each sweep swells and fades (the pen slows to turn round),
     has its own pressure and pitch, pushes scratch more than pulls, sometimes the tip lifts for a moment,
     long sweeps are broken by re-grips, and the felt squeaks only now and then in short chirps. */
  const gEnv=new Float32Array(M).fill(1),gSp=new Float32Array(M).fill(1),gGain=new Float32Array(M).fill(1),gId=new Int32Array(M),gDet=new Float32Array(M).fill(1),gTone=new Float32Array(M).fill(1);
  {const ang=new Float32Array(M);for(let j=0;j<M;j++){const a=Math.max(0,j-6),b=Math.min(M-1,j+6);ang[j]=Math.atan2(py[b]-py[a],px[b]-px[a])}
   const wrap=d=>{while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d};
   const ax=Math.cos(.64),ay=Math.sin(.64);
   // continuous timbre from the direction of travel against the pen: pushing the felt forward scratches and squeaks,
   // pulling it back is soft and dark, sideways is wide and quieter; tight turns slow the hand down
   const turn=new Float32Array(M),pullA=new Float32Array(M);
   for(let j=1;j<M;j++){const d=Math.abs(wrap(ang[j]-ang[j-1]));turn[j]=con[j]&&con[j-1]&&spd[j]>norm*.05?d:0;pullA[j]=Math.cos(ang[j])*ax+Math.sin(ang[j])*ay}
   {const k=1-Math.exp(-1/(CR*.035));let tr=0,pl=0;for(let j=0;j<M;j++){tr+=(turn[j]*CR-tr)*k;pl+=(pullA[j]-pl)*k;
     const side=1-Math.abs(pl),push=Math.max(0,-pl),pull=Math.max(0,pl),slow=1/(1+tr*.11);
     gTone[j]=(1+.16*push-.1*pull-.05*side)*(.93+.07*slow);gSp[j]=slow*(1+.22*push-.12*pull);gGain[j]=(1+.2*push-.08*pull-.16*side)*(.75+.25*slow)}}
   // segment into sweeps: sharp reversals, a new path, a re-grip on long straight runs, and on curves the wrist
   // can only turn so far before the hand lifts and re-sets
   const segs=[];let s0=-1,acc=0,kind=0,lim=0,tlim=0;const reset=j=>{s0=j;acc=0;lim=300+rnd()*550;tlim=1.4+rnd()*1.3};
   for(let j=0;j<M;j++){
     if(!con[j]){if(s0>=0){segs.push([s0,j,kind]);s0=-1}continue}
     if(s0<0){reset(j);kind=0;continue}
     const d=wrap(ang[j]-ang[Math.max(0,j-12)]);acc+=turn[j];
     if(spd[j]>norm*.08&&Math.abs(d)>1.35&&j-s0>18){segs.push([s0,j,kind]);reset(j);kind=0}
     else if(lid[j]!==lid[j-1]&&j-s0>18){segs.push([s0,j,kind]);reset(j);kind=0}
     else if(acc>tlim&&j-s0>60){segs.push([s0,j,kind]);reset(j);kind=2}
     else if(j-s0>lim){segs.push([s0,j,kind]);reset(j);kind=1}}
   if(s0>=0)segs.push([s0,M,kind]);
   const SQ={marker:.26,chameleon:.26,copic:.12,gel:.08,puffy:.05,glue:.05};
   segs.forEach(([a,b,k],gi)=>{const L=b-a,g=.7+rnd()*.46,det=.9+rnd()*.2,m=Math.min(b-1,a+(L>>1));
     // a re-set after turning round a curve: the tip leaves the paper briefly and lands a bit differently
     const lift=k===2?(rnd()<.8?Math.round(22+rnd()*55):0):k===0&&L>60&&rnd()<.16?Math.round(12+rnd()*30):k===1&&rnd()<.35?Math.round(10+rnd()*25):0;
     const floor=k===1?.4:k===2?.12:.08,pk=k===2?.18+rnd()*.25:.35+rnd()*.3,dk=k===2?.88+rnd()*.24:1;
     let push=0;for(let j=a;j<b;j++)push+=pullA[j]<0?1:0;push=push>L/2?1:0;
     for(let j=a;j<b;j++){const u=(j-a)/Math.max(1,L);const sh=u<pk?Math.sin(Math.PI*.5*u/pk):Math.cos(Math.PI*.5*(u-pk)/(1-pk));
       let e=L<30?.55*Math.sin(Math.PI*u):floor+(1-floor)*Math.pow(Math.max(0,sh),.55);if(j-a<lift)e=0;
       gEnv[j]=e*(.82+.36*vnA(j/CR*3.1+gi*.37))*gGain[j];gSp[j]*=(.35+.65*e);gGain[j]=g;gId[j]=gi;gDet[j]=det*dk}
     if(lift>0&&k===2){const tt=(a+lift)/CR,T0=getRC(tl[m]).R.tap;if(T0&&T0.amt>0){const am=T0.amt*(.12+rnd()*.12),f=T0.f*(.85+rnd()*.3),lp=new BQ('lp',3200,.7);
       put(tt,.05,pa[m],q=>{const x=q/SR;return (Math.sin(2*Math.PI*f*x)*Math.exp(-x/T0.dec)+lp.p(nz())*Math.exp(-x/.0015)*T0.click*.5)*am},SND.strokes)}}
     const pq=SQ[tl[m]]||0;if(L>90&&rnd()<pq*(push?1.5:.6)){const t0=(a+L*(.15+rnd()*.5))/CR,dur=.045+rnd()*.12,f0=1700+rnd()*1700,gl=(rnd()-.5)*.35,am=(.12+rnd()*.2)*g;let ph=0,lpn=0;
       put(t0,dur,pa[m],q=>{const r=q/(dur*SR),f=f0*(1+gl*r)*(1+.012*Math.sin(q*.0021));ph+=2*Math.PI*f/SR;lpn+=(nz()-lpn)*.08;const w=Math.pow(Math.sin(Math.PI*Math.min(1,r)),1.6);
         return (Math.sin(ph)*.7+Math.sin(2*ph)*.22+Math.sin(3*ph)*.08)*w*am*(.65+.7*lpn)},SND.strokes)}})
   let sm=0,sn=0;for(let j=0;j<M;j++)if(con[j]){sm+=gEnv[j];sn++}const nrm=sn?Math.min(1.6,.92*sn/Math.max(1e-3,sm)):1;for(let j=0;j<M;j++)gEnv[j]*=nrm}
  // continuous stroke layer
  let env=0,dist=0,lastLid=-2,det=1,detT=1,gn=1,gT=1,ss=0,sc=0;
  for(let i=0;i<N;i++){
    const tc=i*CR/SR;let j=tc|0;if(j>M-2)j=M-2;const fr=tc-j;
    const c=con[j],gE=gEnv[j]+(gEnv[j+1]-gEnv[j])*fr,sp=Math.min(1.8,(spd[j]+(spd[j+1]-spd[j])*fr)/norm*gSp[j]);
    const rc=getRC(tl[j]);env+=(c-env)*(c>env?rc.kA:rc.kR);
    if(gId[j]!==lastLid){lastLid=gId[j];gT=gGain[j]}detT=gDet[j]*gTone[j];
    det+=(detT-det)*.004;gn+=(gT-gn)*.003;dist+=sp*norm/SR;
    if(env>1e-4){const x=rc.R.proc(rc.st,env,sp,dist,det,i,i/SR)*gn*gE*SND.strokes;SL[i]=x*gl[j];SRt[i]=x*gr[j];if(env>.3){const lw=1/(rc.R.loud||1);ss+=x*x*lw*lw;sc++}}
    if((i&65535)===0&&onProg){onProg(i/N*.7);await sleep(0)}
  }
  // pen touch-downs
  {let off=99;for(let j=1;j<M;j++){if(!con[j]){off++;continue}const T0=getRC(tl[j]).R.tap;if(T0.amt>0&&!con[j-1]&&off>40){const a=T0.amt*(.6+rnd()*.4)*clamp(off/400,.28,1),f=T0.f*(.9+rnd()*.2),lp=new BQ('lp',3500,.7);
      put(j/CR,.06,pa[j],k=>{const q=k/SR;return (Math.sin(2*Math.PI*f*q)*Math.exp(-q/T0.dec)+lp.p(nz())*Math.exp(-q/.0015)*T0.click*.6)*a},SND.strokes)}off=0}}
  // cap / click / water events at colour changes
  const o=p.order.filter(r=>!r.instant),ev=[];
  if(o.length){const panOf=x=>clamp((x/seg.W-.5)*1.1,-.55,.55);
    ev.push({t:Math.max(.05,p.vOf(o[0].t0)-.38-rnd()*.1),type:'open',pan:panOf(o[0].legs[0].p0[0]),tool:o[0].tool});
    for(let k=1;k<o.length;k++){const a=o[k-1],b=o[k];if(a.color===b.color&&a.tool===b.tool)continue;const tc=p.vOf(a.t1)+.03+rnd()*.04,to=Math.max(tc+.09,p.vOf(b.t0)-.12-rnd()*.05);
      ev.push({t:tc,type:'close',pan:panOf(a.legs[a.legs.length-1].p1[0]),tool:a.tool});ev.push({t:to,type:'open',pan:panOf(b.legs[0].p0[0]),tool:b.tool})}
    const L=o[o.length-1];ev.push({t:p.vOf(L.t1)+.12,type:'close',pan:panOf(L.legs[L.legs.length-1].p1[0]),tool:L.tool})}
  o.forEach(r=>{if(!TOOLS[r.tool].glue)return;const s0=r.t0+r.dur*r.sf,sd=r.dur*(1-r.sf),pn=clamp((r.cx/seg.W-.5)*1.1,-.55,.55);const a=p.vOf(s0+sd*(GL.p0+.02)),b=p.vOf(s0+sd*(GL.p1+.04));ev.push({t:a,d:Math.max(.1,b-a),type:'pour',pan:pn,tool:r.tool});ev.push({t:p.vOf(s0+sd*(GL.t0+.01)),type:'tap',pan:pn,tool:r.tool})});
  if(FLQ.drops)o.forEach(r=>{if(!TOOLS[r.tool].fluid)return;const pn=clamp((r.cx/seg.W-.5)*1.1,-.55,.55);ev.push({t:p.vOf(r.t0),type:'drip',pan:pn,tool:r.tool})});
  ev.forEach(e=>toolEvent(put,e,rnd));
  if(onProg){onProg(.78);await sleep(0)}
  // reverb on the dry mix
  const mid=new Float32Array(N);for(let n=0;n<N;n++)mid[n]=(SL[n]+SRt[n]+EL[n]+ER[n])*.5;
  const [wl,wr]=reverb(mid,N,SND.reverb*.9);
  if(onProg){onProg(.92);await sleep(0)}
  const g=sc?.08/Math.sqrt(ss/sc):1,L=new Float32Array(N),R=new Float32Array(N);
  const rl=new BQ('lp',380,.5),rh=new BQ('hp',55,.7),rl2=new BQ('lp',380,.5),rh2=new BQ('hp',55,.7),room=SND.room*.05;
  for(let n=0;n<N;n++){const m=room*(.6+.4*vnA(n/SR*.35+3));
    L[n]=Math.tanh((SL[n]+EL[n]+wl[n])*g*1.1)/1.1+rh.p(rl.p(nz()))*m;R[n]=Math.tanh((SRt[n]+ER[n]+wr[n])*g*1.1)/1.1+rh2.p(rl2.p(nz()))*m}
  const fade=Math.round(.25*SR);for(let k=0;k<fade;k++){const a=k/fade;L[N-1-k]*=a;R[N-1-k]*=a}
  return{L,R,N};
}
export let sndGen=null;
export async function ensureAudio(silent){
  if(!SND.on||!plan)return null;const k=sndKey();if(SND.data&&SND.key===k)return SND.data;
  if(sndGen&&sndGen.k===k)return sndGen.p;
  const wasBusy=busy;if(!silent){setBusy(true);$('overlay').hidden=false;$('overlay').textContent='Генерую звук…'}
  const pr=genAudio(plan,silent?null:f=>{$('overlay').textContent='Генерую звук… '+Math.round(f*100)+'%'}).then(d=>{SND.data=d;SND.key=k;sndGen=null;return d});
  sndGen={k,p:pr};const d=await pr;if(!silent){$('overlay').hidden=true;setBusy(wasBusy)}return d;
}
export function audioCtx(){if(!SND.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;try{SND.ctx=new AC({sampleRate:SR})}catch(e){SND.ctx=new AC()}SND.gain=SND.ctx.createGain();SND.gain.connect(SND.ctx.destination)}SND.gain.gain.value=SND.vol;return SND.ctx}
export function startAudio(t){stopAudio();if(!SND.on||!SND.data||SND.key!==sndKey())return;const ctx=audioCtx();if(!ctx)return;if(ctx.state==='suspended')ctx.resume();
  if(!SND.buf||SND.bufKey!==SND.key){SND.buf=ctx.createBuffer(2,SND.data.N,SR);SND.buf.copyToChannel(SND.data.L,0);SND.buf.copyToChannel(SND.data.R,1);SND.bufKey=SND.key}
  const s=ctx.createBufferSource();s.buffer=SND.buf;s.connect(SND.gain);s.start(0,Math.max(0,t));SND.src=s;SND.startCtx=ctx.currentTime;SND.startT=t}
export function stopAudio(){if(SND.src){try{SND.src.stop()}catch(e){}try{SND.src.disconnect()}catch(e){}SND.src=null}}
export async function pickAudio(webm){if(typeof AudioEncoder==='undefined')return null;
  for(const c of(webm?[{codec:'opus',mux:'A_OPUS',name:'Opus'}]:[{codec:'mp4a.40.2',mux:'aac',name:'AAC'},{codec:'opus',mux:'opus',name:'Opus'}])){try{const s=await AudioEncoder.isConfigSupported({codec:c.codec,sampleRate:SR,numberOfChannels:2,bitrate:192000});if(s.supported)return c}catch(e){}}return null}
export function wavB64(A){const n=A.N,buf=new ArrayBuffer(44+n*4),v=new DataView(buf);const w=(o,str)=>{for(let i=0;i<str.length;i++)v.setUint8(o+i,str.charCodeAt(i))};
  w(0,'RIFF');v.setUint32(4,36+n*4,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,SR,true);v.setUint32(28,SR*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*4,true);
  for(let i=0;i<n;i++){v.setInt16(44+i*4,clamp(A.L[i]*SND.vol,-1,1)*32767,true);v.setInt16(46+i*4,clamp(A.R[i]*SND.vol,-1,1)*32767,true)}
  return new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(new Blob([buf],{type:'audio/wav'}))})}
