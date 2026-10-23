import {addonHasFocus,painters} from '../addons/registry.js';
import {FLQ,FLY,HP,OUT,S,SHADE,TOOLS,VS,VS_DIRS,view,zoneH,zoneTool} from './settings.js';
import {STROKE,buildPath} from './strokes.js';
import {SS,TAU,clamp,ease3,hex2hsl,hsl2hex,lerp,rngOf} from './utils.js';
import {art,customOrder,orderedZones,pageArea,seg,syncLk,zClose,zCut,zFast,zZoom,zoneByI,zoneTone,zones} from './zones.js';
import {clampCenter} from '../render/camera.js';
/* ================= PLAN (schedule, shots, time warp) ================= */
export let plan=null,planDirty=true;
export function flySegs(){
  const rnd=rngOf(555+S.seed);let groups;
  if(FLY.segs&&FLY.segs.length)groups=FLY.segs.map(g=>({ids:g.ids.slice(),move:g.move}));
  else{
    let picks=[];
    if(art.demo){['face','berry','bow','wafer','blue','spr'].forEach(g=>{const zs=zones.filter(z=>z.r.group===g&&!z.skip&&z.r.id!=='band');if(zs.length&&picks.length<FLY.count)picks.push(zs.map(z=>z.i))})}
    else{const diag=Math.hypot(seg.W,seg.H);const cand=zones.filter(z=>!z.skip&&!z.r.isBg&&z.r.area>pageArea()*.002&&z.r.area<pageArea()*.12).map(z=>({z,sc:Math.sqrt(z.r.area)*(zClose(z)?1.4:1)})).sort((a,b)=>b.sc-a.sc);
      const chosen=[];cand.forEach(c=>{if(chosen.length>=FLY.count)return;if(chosen.every(o=>Math.hypot(o.r.cx-c.z.r.cx,o.r.cy-c.z.r.cy)>diag*.2))chosen.push(c.z)});
      chosen.sort((a,b)=>a.r.cy-b.r.cy);picks=chosen.map(z=>[z.i])}
    groups=picks.map(ids=>({ids,move:'auto'}));
  }
  const cyc=['in','pan','out'];
  return groups.map((g,k)=>{const zs=g.ids.map(i=>zoneByI.get(i)).filter(Boolean);if(!zs.length)return null;
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;zs.forEach(z=>{x0=Math.min(x0,z.r.x0);y0=Math.min(y0,z.r.y0);x1=Math.max(x1,z.r.x1);y1=Math.max(y1,z.r.y1)});
    const minE=seg.W*.16;let bw=Math.max(x1-x0,minE),bh=Math.max(y1-y0,minE);
    const z=clamp(clamp(Math.min(view.W/(bw*1.45),view.H/(bh*1.45))/viewFit(),1.6,5)*FLY.zoomMul,1.15,5);
    return{ids:g.ids,moveSel:g.move,move:g.move==='auto'?cyc[k%3]:g.move,cx:(x0+x1)/2,cy:(y0+y1)/2,z,dir:rnd()*TAU,span:Math.max(bw,bh)*.3}}).filter(Boolean);
}
export function flyPose(sh,e){
  let z,x=sh.cx,y=sh.cy;const ox=Math.cos(sh.dir),oy=Math.sin(sh.dir);
  if(sh.move==='in'){z=sh.z*lerp(.86,1.14,e);x+=ox*sh.span*.5*(e-.5);y+=oy*sh.span*.5*(e-.5)}
  else if(sh.move==='out'){z=sh.z*lerp(1.14,.86,e);x+=ox*sh.span*.5*(e-.5);y+=oy*sh.span*.5*(e-.5)}
  else{z=sh.z*1.02;x+=ox*sh.span*1.2*(e-.5);y+=oy*sh.span*1.2*(e-.5)}
  const p=clampCenter(x,y,z);return[p[0],p[1],z];
}
/* ================= VOLUME SHADOWS =================
   For a light direction L, a pixel of a zone is in shadow when stepping a distance d toward the light-away side
   leaves the zone: that is the crescent along the far edge, like a cel-shaded drawing. The band is computed on a
   coarse grid, blurred and re-thresholded for smooth curves, and becomes a region of its own (with a darker shade of
   the zone colour) that the marker paints after all zones. */
export function vsAuto(z){const r=z.r;return !r.isBg&&!(SHADE.on&&z.tones&&z.tones.length>1&&!z.flat)&&r.area>Math.pow(46*SS,2)&&r.area<pageArea()*.5}
export function vsWanted(z){return VS.on&&(z.vshade==='on'||(z.vshade!=='off'&&vsAuto(z)))}
export function vsColor(c,k){k=k==null?1:k;const[h,s2,l]=hex2hsl(c),dk=VS.dark*k;return hsl2hex(h,clamp(s2*(1+.08*k)+.04*k,0,1),clamp(l*(1-dk)-.02*k,.04,.95))}
/* Form shading: the zone's silhouette (holes filled) is treated as an inflated cushion. Its height rises from the
   edge with a round profile, normals come from that height, and the light (from the chosen side, a bit from the
   front) gives a shade value; the darkest part of the form becomes the shadow, so the terminator curves around the
   shape. Styles: solid, soft (a lighter outer band + a darker core) and comic hatching (lines + cross lines in the core). */
export function vsRegions(z){const r=z.r,key=[VS.dir,VS.w,VS.style,r.x0,r.y0,r.x1,r.y1,r.area].join('|');if(z.vsKey===key)return z.vsRegs;
  const W=seg.W,dv=VS_DIRS[VS.dir];
  const q=Math.max(2,Math.round(Math.sqrt(r.area)/110)),gw=Math.ceil((r.x1-r.x0+1)/q)+2,gh=Math.ceil((r.y1-r.y0+1)/q)+2,N=gw*gh,m=new Uint8Array(N);
  const P=(gx,gy)=>{const x=Math.min(W-1,Math.max(0,Math.round(r.x0+(gx-1+.5)*q))),y=Math.min(seg.H-1,Math.max(0,Math.round(r.y0+(gy-1+.5)*q)));return y*W+x};
  for(let gy=1;gy<gh-1;gy++)for(let gx=1;gx<gw-1;gx++)if(seg.lab[P(gx,gy)]===r.i)m[gy*gw+gx]=1;
  const out=new Uint8Array(N),st=[];for(let x=0;x<gw;x++){st.push(x,(gh-1)*gw+x)}for(let y=0;y<gh;y++){st.push(y*gw,y*gw+gw-1)}
  while(st.length){const k=st.pop();if(out[k]||m[k])continue;out[k]=1;const x=k%gw,y=(k/gw)|0;if(x>0)st.push(k-1);if(x<gw-1)st.push(k+1);if(y>0)st.push(k-gw);if(y<gh-1)st.push(k+gw)}
  // distance inside the silhouette
  const D=new Float32Array(N);let fA=0,Dm=0;for(let k=0;k<N;k++){D[k]=out[k]?0:1e9;if(!out[k])fA++}
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(D[k])D[k]=Math.min(D[k],D[k-1]+1,D[k-gw]+1,D[k-gw-1]+1.414,D[k-gw+1]+1.414)}
  for(let y=gh-2;y>=1;y--)for(let x=gw-2;x>=1;x--){const k=y*gw+x;if(D[k]){D[k]=Math.min(D[k],D[k+1]+1,D[k+gw]+1,D[k+gw+1]+1.414,D[k+gw-1]+1.414);if(D[k]>Dm)Dm=D[k]}}
  const R=Math.max(2,Math.min(Dm,Math.sqrt(fA)*.42));let h=new Float32Array(N);for(let k=0;k<N;k++){const u=Math.min(D[k],R)/R;h[k]=Math.sqrt(Math.max(0,1-(1-u)*(1-u)))*R}
  const blur=(a,rad)=>{for(let it=0;it<2;it++){const t=new Float32Array(N);for(let y=0;y<gh;y++){let s2=0;for(let x=-rad;x<gw+rad;x++){if(x+rad<gw)s2+=a[y*gw+x+rad];if(x-rad-1>=0)s2-=a[y*gw+x-rad-1];if(x>=0&&x<gw)t[y*gw+x]=s2/(2*rad+1)}}
      const u=new Float32Array(N);for(let x=0;x<gw;x++){let s2=0;for(let y=-rad;y<gh+rad;y++){if(y+rad<gh)s2+=t[(y+rad)*gw+x];if(y-rad-1>=0)s2-=t[(y-rad-1)*gw+x];if(y>=0&&y<gh)u[y*gw+x]=s2/(2*rad+1)}}a=u}return a};
  h=blur(h,Math.max(1,Math.round(R*.12)));
  const ll=Math.hypot(dv[0],dv[1],.8),lx=dv[0]/ll,ly=dv[1]/ll,lz=.8/ll,sh=new Float32Array(N),vals=[];
  for(let y=1;y<gh-1;y++)for(let x=1;x<gw-1;x++){const k=y*gw+x;if(!m[k])continue;const hx=(h[k+1]-h[k-1])*.5,hy=(h[k+gw]-h[k-gw])*.5,nl=Math.hypot(hx,hy,1);
    sh[k]=(-hx*lx-hy*ly+lz)/nl;vals.push(sh[k])}
  if(vals.length<8){z.vsKey=key;z.vsRegs=[];return []}
  vals.sort((a,b)=>a-b);const qv=f=>vals[Math.min(vals.length-1,Math.floor(clamp(f,.02,.9)*vals.length))];
  const fr=clamp(VS.w*1.5,.06,.8),tOut=qv(fr),tCore=qv(fr*.42);
  const mk2=(thr,k,extra)=>{const S2=new Uint8Array(N);let a=0,x0=1e9,y0=1e9,x1=-1,y1=-1,sx=0,sy=0;
    for(let gy=1;gy<gh-1;gy++)for(let gx=1;gx<gw-1;gx++){const kk=gy*gw+gx;if(m[kk]&&sh[kk]<thr){S2[kk]=1;a++;const X=r.x0+(gx-1)*q,Y=r.y0+(gy-1)*q;x0=Math.min(x0,X);y0=Math.min(y0,Y);x1=Math.max(x1,X+q);y1=Math.max(y1,Y+q);sx+=X;sy+=Y}}
    if(a*q*q<Math.pow(9*SS,2))return null;const rx0=r.x0,ry0=r.y0;
    return Object.assign({i:r.i,lk:-1,pf:p=>{const x=p%W,y=(p/W)|0,gx=Math.floor((x-rx0)/q)+1,gy=Math.floor((y-ry0)/q)+1;return gx>=0&&gy>=0&&gx<gw&&gy<gh&&S2[gy*gw+gx]===1},
      area:a*q*q,x0:Math.max(0,x0-q),y0:Math.max(0,y0-q),x1:Math.min(W-1,x1+q),y1:Math.min(seg.H-1,y1+q),cx:sx/a,cy:sy/a,edge:false,isBg:false,shadowOf:r,vsK:k,ang:Math.atan2(dv[1],dv[0])+Math.PI/2,elong:.5},extra||{})};
  let regs=[];
  if(VS.style==='soft')regs=[mk2(tOut,.5,{vsStyle:'form'}),mk2(tCore,1,{vsStyle:'form'})];
  else if(VS.style==='hatch')regs=[mk2(tOut,1,{vsStyle:'hatch',vsDir:-.78}),mk2(tCore,1.15,{vsStyle:'hatch',vsDir:.78})];
  else regs=[mk2(tOut,1,{vsStyle:'form'})];
  regs=regs.filter(Boolean);z.vsKey=key;z.vsRegs=regs;return regs}
export function makePlan(){
  planVer++;{const pn=painters();STROKE.reach=pn.reach||0;STROKE.walkK=pn.pace&&pn.walk?pn.pace/pn.walk:0}
  const H=HP(),human=H.on;
  let list=orderedZones().filter(z=>!z.skip);
  if(human&&!customOrder){const rnd=rngOf(77+S.seed);for(let i=1;i<list.length-1;i++)if(!list[i].r.isBg&&!list[i+1].r.isBg&&rnd()<H.shuffle*.3){const t=list[i];list[i]=list[i+1];list[i+1]=t;i++}}
  const rnd=rngOf(991+S.seed);
  const regsL=[],late=[];
  list.forEach(z=>{syncLk(z);regsL.push(z.r);const ly=SHADE.on&&!z.flat&&z.r.layers;if(ly){if(SHADE.when==='end')late.push(...ly);else regsL.push(...ly)}});
  const vsL=[];list.forEach(z=>{if(vsWanted(z))vsL.push(...vsRegions(z))});
  const PN=painters(),par=PN.n>1&&PN.mode==='parallel',PACE=PN.pace||0,WALK=PN.walk||1;
  let order=regsL.concat(late,vsL).map((r,k)=>{const z=zoneByI.get(r.i);r.color=r.shadowOf?vsColor(z.color,r.vsK):r.layerOf?zoneTone(z,r.tidx):z.color;r.fast=zFast(z);r.instant=zCut(z);r.close=zClose(z);r.zoomV=zZoom(z);r.tool=r.shadowOf?'marker':zoneTool(z);const Hz=zoneH(z);r.Hs=Hz.sloppy;r.sf=TOOLS[r.tool].glue?.72:1;r.gs=0;buildPath(r,Hz,S.seed);r.k=k;return r});
  if(!order.length)return {order,shots:[{ts:0,cx:seg.W/2,cy:seg.H/2,z:1,follow:0,rate:1.4,zrate:1,trans:'cut',intro:true}],total:2,endC:1.7,cTotal:2,vTab:null,sparkles:[],cOf:v=>v,vOf:c=>c,revealC:1.7,fly:[]};
  const intro=1.7,REVEAL=3.8,fly=FLY.mode!=='off'?flySegs():[],flyT=fly.length*FLY.dur;
  // a character's camera gets a few seconds for the finale scene before the reveal
  const fin=S.camMode==='cat'&&addonHasFocus()?7:0,outro=fin+(!fly.length?4.8:FLY.mode==='after'?REVEAL+flyT+.2:.5+flyT+REVEAL);
  // free painters help with big zones: those are cut into pieces (runs of whole reach patches) that anyone can take
  if(par&&PN.help&&STROKE.reach>0){order=splitForHelp(order,PN.n,PACE?PACE*8:0);order.forEach((r,k)=>r.k=k)}
  // walking from one zone to the next: a quick hand move, or a painter's walk at its own speed
  const trvOf=(e,s)=>{if(!e)return .25;const d=Math.hypot(e[0]-s[0],e[1]-s[1]);return(PACE?clamp(.25+d/(WALK*Math.min(1.47,1+d/(4*WALK/.95))),.25,8):clamp(.12+d/(5200*SS/2),.12,.5))+(human?.04+rnd()*.18*(.4+H.pauses*1.5):0)};
  order.forEach((r,k)=>{r.raw=(PACE?r.pathW/PACE:.12+.55*Math.pow(r.pathW/(1000*SS),.72))*(TOOLS[r.tool].fluid?1.8:1);if(TOOLS[r.tool].glue){const spr=2+3.4*Math.sqrt(r.area/pageArea());r.sf=r.raw/(r.raw+spr);r.raw+=spr}else r.sf=1;r.raw*=clamp((zoneByI.get(r.i)||{}).tmul||1,.15,8);
    r.turnTo=undefined;
    if(k>0){const p=order[k-1];r.trRaw=trvOf(p.legs[p.legs.length-1].p1,r.legs[0].p0)}else r.trRaw=0;
    // montage cut: the zone takes no screen time, it is simply finished when the next shot starts
    if(r.instant){r.raw=0;r.trRaw=0}});
  if(human&&H.turn>0){let ang=0,cool=0;const nat=-.62;
    order.forEach((r,k)=>{if(k===0||r.layerOf||r.instant||cool-->0)return;if(rnd()>H.turn*.32)return;
      let t;if(r.hdir!=null){t=nat-r.hdir;while(t>Math.PI/2)t-=Math.PI;while(t<-Math.PI/2)t+=Math.PI;t=clamp(t*(.7+rnd()*.3),-.42,.42)}else t=(rnd()-.5)*.6;
      if(Math.abs(ang)>.15&&rnd()<.4)t=0;if(Math.abs(t-ang)<.08)return;
      r.turnTo=t;ang=t;r.trRaw+=.55+.35*Math.abs(t);cool=2})}
  const k_=r=>r.fast&&!TOOLS[r.tool].fluid&&!TOOLS[r.tool].glue?S.fastMul:1;
  let built=null,tracks=null,endC;
  if(par){
    // several painters at once: every track runs its own zones back to back, all tracks start together;
    // "fast" zones are simply shorter (a global time warp would speed up the other painters too)
    order.forEach(r=>r.turnTo=undefined);tracks=shareOut(order,PN.n,trvOf,PACE?restDue:null,PN.reach?PN.reach/.33*1.3:0);
    const load=tracks.map(T=>T.reduce((a,r)=>a+r.rawP+r.trRaw,0)),f=PACE?1:(S.duration-intro-outro)/Math.max(1e-3,...load);
    tracks.forEach(T=>{let t=intro;T.forEach(r=>{r.travel=r.trRaw*f;t+=r.travel;r.t0=t;r.dur=r.instant?.001:Math.max(.12,r.rawP*f);t+=r.dur;r.t1=t})});
    order.sort((a,b)=>a.t0-b.t0);order.forEach((r,k)=>{r.k=k;r.fast=false});
    endC=Math.max(...order.map(r=>r.t1));built=warp(order,endC+outro,endC);
  }else{
    // characters rest now and then (r.rest seconds before a zone: they stand, yawn and stretch, the tool resting)
    order.forEach(r=>r.rest=0);if(PACE){let w=0,due=restDue(order[0]);order.forEach((r,k)=>{if(k>0&&!r.instant&&w>=due){r.rest=REST;r.trRaw+=REST;w=0;due=restDue(r)}w+=r.raw})}
    let f=PACE?1:(S.duration-intro-outro)/Math.max(1e-3,order.reduce((a,r)=>a+(r.raw+r.trRaw)/k_(r),0));
    for(let it=0;it<3;it++){
      let t=intro;order.forEach(r=>{r.trk=0;r.travel=r.trRaw*f;t+=r.travel;r.t0=t;r.dur=r.instant?.001:Math.max(.12,r.raw*f);t+=r.dur;r.t1=t});
      const cTotal=t+outro;endC=t;
      built=warp(order,cTotal,endC);if(PACE)break;
      const V=built.total;f*=(S.duration-intro-outro)/Math.max(.5,V-intro-outro);
      if(Math.abs(V-S.duration)<.05)break;
    }
  }
  const p={order,tracks:tracks||[order],intro,endC,cTotal:built.cTotal,total:built.total,vTab:built.vTab,dc:built.dc};
  {let a=0;p.turns=[];if(!par)order.forEach(r=>{if(r.turnTo===undefined)return;p.turns.push({c0:r.t0-r.travel*.92,c1:r.t0-r.travel*.12,a0:a,a1:r.turnTo});a=r.turnTo});
   if(a!==0){const e=order[order.length-1].t1;p.turns.push({c0:e+.3,c1:e+1.4,a0:a,a1:0})}}
  p.vOf=c=>{const x=clamp(c/p.dc,0,p.vTab.length-1);const i=Math.floor(x),fr=x-i;return i+1<p.vTab.length?lerp(p.vTab[i],p.vTab[i+1],fr):p.vTab[i]};
  p.cOf=v=>{const T=p.vTab;if(v<=0)return 0;if(v>=T[T.length-1])return (T.length-1)*p.dc;let lo=0,hi=T.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(T[m]<=v)lo=m;else hi=m}return (lo+(v-T[lo])/(T[hi]-T[lo]||1))*p.dc};
  p.fly=fly;p.shots=buildShots(par?tracks[0]:order,rnd,fly,REVEAL,endC+fin);p.revealC=p.shots.revealC;
  p.hasThick=order.some(r=>TOOLS[r.tool].thick);
  const sp=order.filter(r=>!r.isBg).sort((a,b)=>b.area-a.area).slice(0,14);
  p.sparkles=sp.map((r,i)=>({x:r.cx,y:r.cy,d:i*.11,s:.6+rnd()*.6}));
  p.mainTotal=p.total;if(OUT.on)p.total+=OUT.dur;
  return p;
}
export function warp(order,cTotal,endC){
  const dc=1/200,N=Math.ceil(cTotal/dc)+2,rate=new Float32Array(N).fill(1);
  order.forEach(r=>{if(!r.fast||TOOLS[r.tool].fluid||TOOLS[r.tool].glue)return;const a=Math.floor((r.t0-r.travel)/dc),b=Math.ceil(r.t1/dc);for(let i=Math.max(0,a);i<=Math.min(N-1,b);i++)rate[i]=S.fastMul});
  if(S.fx.ramp.on&&S.fx.ramp.v>0){const win=Math.max(1,Math.round(S.fx.ramp.v*.9/dc));for(let pass=0;pass<3;pass++){const src=rate.slice();let acc=0;const h=win>>1;for(let i=-h;i<=h;i++)acc+=src[clamp(i,0,N-1)];for(let i=0;i<N;i++){rate[i]=acc/(2*h+1);acc+=src[clamp(i+h+1,0,N-1)]-src[clamp(i-h,0,N-1)]}}}
  const vTab=new Float32Array(N);for(let i=1;i<N;i++)vTab[i]=vTab[i-1]+dc/rate[i-1];
  const cEnd=cTotal;const total=vTab[Math.min(N-1,Math.round(cEnd/dc))];
  return {vTab,dc,total,cTotal};
}
export function paperRot(c){const T=plan&&plan.turns;if(!T||!T.length)return 0;let a=0;for(const k of T){if(c<k.c0)break;a=c>=k.c1?k.a1:lerp(k.a0,k.a1,ease3((c-k.c0)/(k.c1-k.c0)))}return a}
export function viewFit(){return Math.min(view.W/(seg.W*1.1),view.H/(seg.H*1.1))}
/* zones shared out between painters: each zone (with its shade layers) goes to the track that is free soonest,
   counting the walk from where that painter stopped */
/* several painters: the next piece of work goes to whoever gets to it first (a painter who just did a piece of the
   same zone is preferred a little, so a zone is not torn apart without need) */
/* a character's rest comes after 25..45 s of work (a hash of the zone, so it is the same on every build) */
const REST=2.6,restDue=r=>{const v=Math.sin((r&&r.i||1)*12.9898+7.1)*43758.5453;return 25+20*(v-Math.floor(v))};
function shareOut(order,n,trv,rd,sep){
  const tr=Array.from({length:n},()=>[]),free=new Float64Array(n),endP=new Array(n).fill(null),lastI=new Array(n).fill(-1),worked=new Float64Array(n),due=Array.from({length:n},(_,k)=>rd?rd({i:k+3}):Infinity);
  order.forEach((r,j)=>{const fk=r.fast&&!TOOLS[r.tool].fluid&&!TOOLS[r.tool].glue?S.fastMul:1;r.rawP=r.raw/fk;r.k0=j});
  // characters (sep = elbow room): of the next three pieces of work it takes the first one where its tool would not
  // come near another painter's (checked at the start, middle and end); if all three would, it simply takes the next one
  const start=new Map(),tipAt=(r,S0,t)=>{const p=clamp((t-S0)/Math.max(1e-3,r.rawP),0,1),L=r.legs;let lo=0,hi=L.length-1;while(lo<hi){const m=(lo+hi)>>1;if(p<L[m].f1)hi=m;else lo=m+1}return L[lo].p1};
  const clash=(r,k,S0)=>{if(r.instant)return false;for(let j=0;j<n;j++){if(j===k)continue;for(let q=tr[j].length-1;q>=0;q--){const o=tr[j][q],a=start.get(o),b=a+o.rawP;if(b<S0)break;if(a>S0+r.rawP||o.instant)continue;
      for(const z of [0,.5,1]){const t=S0+r.rawP*z;if(t<a||t>b)continue;const p1=tipAt(r,S0,t),p2=tipAt(o,a,t);if(Math.hypot(p1[0]-p2[0],p1[1]-p2[1])<sep)return true}}}return false};
  const pend=order.slice();
  while(pend.length){
    // whoever is free first (when two are, the one that has just worked on that zone carries on)
    let k=0,best=1e18;for(let q=0;q<n;q++){const t=pend[0].instant?0:trv(endP[q],pend[0].legs[0].p0),c=free[q]+t-(lastI[q]===pend[0].i?.4:0);if(c<best-1e-9){best=c;k=q}}
    let pick=0;if(sep)for(let q=0;q<Math.min(3,pend.length);q++){if(!clash(pend[q],k,free[k]+(pend[q].instant?0:trv(endP[k],pend[q].legs[0].p0)))){pick=q;break}}
    const r=pend.splice(pick,1)[0];let bt=r.instant?0:trv(endP[k],r.legs[0].p0);
    r.wait=0;r.rest=0;if(rd&&!r.instant&&tr[k].length&&worked[k]>=due[k]){r.rest=REST;bt+=REST;worked[k]=0;due[k]=rd(r)}worked[k]+=r.rawP;
    r.trk=k;r.trRaw=bt;start.set(r,free[k]+bt);free[k]+=bt+r.rawP;endP[k]=r.legs[r.legs.length-1].p1;lastI[k]=r.i;tr[k].push(r)}
  return tr}
/* cuts big zones into up to n pieces (each at least minW of path, i.e. a few seconds of work) along their reach patches (legs that share a stand point stay together) */
function splitForHelp(order,n,minW){const out=[];
  order.forEach(r=>{const T=TOOLS[r.tool];
    if(r.instant||r.shadowOf||r.layerOf||T.fluid||T.glue||!r.legs.length||(minW>0&&r.pathW<minW*2.5)){out.push(r);return}
    const runs=[];let cur=null;r.legs.forEach(l=>{if(!cur||l.st!==cur.st){cur={st:l.st,legs:[],w:0};runs.push(cur)}cur.legs.push(l);cur.w+=l.wt});
    const m=Math.min(n,Math.floor(runs.length/3),minW>0?Math.floor(r.pathW/minW):n);if(m<2){out.push(r);return}
    const pieces=[];let piece=[],acc=0;runs.forEach(q=>{piece.push(...q.legs);acc+=q.w;if(pieces.length<m-1&&acc>=r.pathW*(pieces.length+1)/m){pieces.push(piece);piece=[]}});
    if(piece.length)pieces.push(piece);
    pieces.forEach((L,j)=>{const w=L.reduce((a,l)=>a+l.wt,0)||1;let a=0;
      const legs=L.map(l=>{const c=Object.assign({},l);c.f0=a/w;a+=l.wt;c.f1=a/w;return c});
      out.push(Object.assign({},r,{legs,pathW:w,part:j,parts:pieces.length,cv:null,cvx:null,done:0}))})});
  return out}
export function buildShots(order,rnd,fly,REVEAL,Eend){
  const shots=[{ts:0,cx:seg.W/2,cy:seg.H/2,z:1,follow:0,rate:1.4,zrate:1,trans:'cut',intro:true}];
  const radius=z=>Math.min(view.W,view.H)/(viewFit()*z)/2;
  let cur=null,cutAt=null;
  order.forEach(r=>{
    // zones skipped by a montage cut pop in exactly on the cut to the next shot
    if(r.instant){if(cutAt==null)cutAt=r.t0;return}
    let key,z,follow;
    if(!S.montage){key='wide';z=1;follow=0}
    else if(TOOLS[r.tool].fluid&&FLQ.cine&&!r.isBg&&r.area>pageArea()*.006&&r.area<pageArea()*.3){key='liq'+r.i;const ext=Math.max(r.x1-r.x0,r.y1-r.y0);z=clamp(Math.min(view.W,view.H)/(viewFit()*ext)*.85,1.45,3.6);follow=.18}
    else if(r.close){key='close';z=r.zoomV;follow=.5}
    else if(r.isBg||r.area>pageArea()*.18){key='wide';z=1;follow=0}
    else{key='medium';z=1.3;follow=.35}
    const d=cur?Math.hypot(r.cx-cur.ax,r.cy-cur.ay):1e9;
    const same=cur&&cur.key===key&&(key==='wide'||(key==='close'?Math.abs(cur.z-z)<.35&&d<radius(z)*.85:d<radius(z)*.9));
    if(same&&cutAt==null){cur.regs.push(r);return}
    let trans='glide';
    if(S.montage&&cur&&(key==='close'||cur.key==='close'||rnd()<.25))trans=S.fx.whip.on&&rnd()<S.fx.whip.v?'whip':'cut';
    if(!cur||cutAt!=null)trans='cut';
    cur={key,z,follow,liq:key.startsWith('liq')?{t0:r.t0,t1:r.t1}:null,regs:[r],ax:r.cx,ay:r.cy,trans,rate:key==='wide'?1.1:3.0,zrate:2.2,leak:rnd()<.6,leakPos:[rnd()<.5?-.05:1.05,rnd()],leakHue:rnd(),cutTs:cutAt};cutAt=null;
    shots.push(cur);
  });
  shots.slice(1).forEach(s=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;s.regs.forEach(r=>{x0=Math.min(x0,r.x0);y0=Math.min(y0,r.y0);x1=Math.max(x1,r.x1);y1=Math.max(y1,r.y1)});s.cx=(x0+x1)/2;s.cy=(y0+y1)/2;const f=s.regs[0];s.ts=s.cutTs!=null?s.cutTs:s.trans==='glide'?f.t0-f.travel:s.liq?f.t0-Math.min(.34,f.travel*.8):f.t0;if(s.key==='wide'){s.cx=seg.W/2;s.cy=seg.H/2}});
  const last=order[order.length-1];
  const E=Eend!=null?Eend:last.t1,D=FLY.dur,mkFly=(f,ts)=>Object.assign({fly:true,ts,dur:D,trans:'cut',follow:0,rate:1,zrate:1,leak:rnd()<.5,leakPos:[rnd()<.5?-.05:1.05,rnd()],leakHue:rnd()},f);
  if(fly.length&&FLY.mode==='before'){fly.forEach((f,k)=>shots.push(mkFly(f,E+.5+k*D)));const rv=E+.5+fly.length*D;
    shots.push({ts:rv,cx:seg.W/2,cy:seg.H/2,z:1,follow:0,rate:.85,zrate:.62,trans:'glide',outro:true});shots.revealC=rv}
  else{shots.push({ts:E,cx:seg.W/2,cy:seg.H/2,z:1,follow:0,rate:1.2,zrate:1.2,trans:'glide',outro:true});shots.revealC=E;
    if(fly.length)fly.forEach((f,k)=>shots.push(mkFly(f,E+REVEAL+k*D)))}
  return shots;
}
export let planVer=0;
export function replan(){plan=makePlan();planDirty=false;return plan}
export function setPlanDirty(v){planDirty=v}
export function bumpPlanVer(){planVer++}
