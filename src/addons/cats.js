import * as PIXI from 'pixi.js';
import {ADD,registerAddon} from './registry.js';
import {BQ,SR,nz} from '../audio/synth.js';
import {plan,planVer,viewFit} from '../core/plan.js';
import {S,view} from '../core/settings.js';
import {SS,clamp,lerp,rngOf} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {P2W,penState} from '../render/camera.js';
import {app,paperC,penC,penShadow,postShader,world} from '../render/scene.js';
import {TOOL_LEN,buildTool,shadowHover} from '../render/toolSprites.js';
/* ================= ADDON: CAT PAINTERS =================
   Flat doodle cats (thick ink outline, flat fur, blush) that stand on their hind legs and hold the tool with both
   front paws. With a character, zones are filled patch by patch within paw's reach (see reachFill), so a cat stands
   still while it hatches a patch and then steps to the next one. Bodies move on a critically damped spring towards
   their stand points; everything comes from tables built once per plan, so any moment can be shown exactly
   (seeking, the zone timeline and video export stay in sync).
   Several cats: 'parallel' - every cat has its own tool and its own share of the zones;
                 'relay'    - one tool: the cat who paints next waits at its zone, the other brings it the tool.
   Paw prints: a cat that steps into fresh paint leaves fading prints of that colour for a few steps. */
const INK=0x2A1F2B;
export const CAT_FURS=[['#F7C27E','Медовий'],['#F4978E','Рожевий'],['#F4A259','Рудий'],['#B9B4C7','Сірий'],['#F7F2EA','Білий'],['#4A4350','Чорний'],['#F2D49B','Кремовий']];
const DT=1/60,SPRING=9,VMAX=2.6,ACC=6.5,TOOL_ANG=-.6,STRIDE=.28,PRINT_LIFE=4.5;
const C={cats:[],pens:[],prints:null,key:'',tab:null};
const col=h=>parseInt(String(h).slice(1),16);
const shade=(h,k)=>{const n=col(h),f=v=>Math.round(clamp(v*k,0,255));return(f(n>>16&255)<<16)|(f(n>>8&255)<<8)|f(n&255)};
const catH=cfg=>seg.W*.15*cfg.size;
const toolK=(cfg,tool)=>1.2*catH(cfg)/((TOOL_LEN[tool]||560)*SS);
const furOf=(cfg,k)=>{if(!k)return cfg.fur;const rest=CAT_FURS.map(f=>f[0]).filter(f=>f!==cfg.fur);return rest[(k-1)%rest.length]};
/* body centre for a cat holding the tool with its tip at P: the grip sits along the tool, the cat stands right of it */
/* facing f: 1 = looking left (tool down-left), -1 = looking right (tool mirrored down-right); turning goes through upright */
const toolAng=f=>-Math.PI/2+f*(Math.PI/2+TOOL_ANG);
function holdBody(P,u,L,f){f=f==null?1:f;const a=toolAng(f),gx=P[0]+Math.cos(a)*L*.62,gy=P[1]+Math.sin(a)*L*.62;return[gx+.3*u*f,gy+.05*u]}
/* the tool held on the other side is not a mirror image: the light still comes from the top left. The sprite is flipped
   across its own axis (so the lit edge stays on top) and the cast shadow is worked out for that direction: the raised back
   end throws its shadow down-right (0.308 L along the light), which turns the shadow +0.3 rad for the usual tool and
   about -0.15 rad (and shorter) for one held on the right */
function toolLook(rot){const dx=Math.cos(rot)+.185,dy=Math.sin(rot)+.246;return{flip:Math.cos(rot)<0,shRot:Math.atan2(dy,dx),shLen:Math.hypot(dx,dy)/1.062}}
/* cats are drawn in their own big local units and scaled down: smooth curves at any camera zoom */
const CAT_U=400;
/* ---------------- motion tables ---------------- */
function build(cfg){
  const n=Math.max(1,Math.round(cfg.count)),relay=n>1&&cfg.mode==='relay',follow=n>1?cfg.camFollow||'switch':'lead',every=cfg.camEvery||7,key=[planVer,cfg.size,n,relay,follow,every].join('|');if(C.key===key&&C.tab)return C.tab;
  const u=catH(cfg),N=Math.ceil((plan.cTotal+1)/DT)+2,o=plan.order;
  // relay: a new cat for every new zone; who holds the tool at time c, and each cat's next zone
  const rc=new Int8Array(o.length);if(relay){let cur=0;for(let j=1;j<o.length;j++){if(o[j].i!==o[j-1].i)cur=(cur+1)%n;rc[j]=cur}}
  const mine=Array.from({length:n},(_,k)=>o.map((r,j)=>j).filter(j=>rc[j]===k));
  const regAt=c=>{let lo=-1,hi=o.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(o[m].t0-o[m].travel<=c)lo=m;else hi=m-1}return lo};
  const owner=c=>{const j=regAt(c);if(j<0)return rc[0];return c<o[j].t0&&j>0?rc[j-1]:rc[j]};
  const nextOf=(k,c)=>{for(const j of mine[k])if(o[j].t0>c)return o[j];return null};
  // zones: when they get their paint (for paw prints)
  const zt=new Map();o.forEach(r=>{if(r.layerOf||r.shadowOf)return;const q=zt.get(r.i);if(!q)zt.set(r.i,{t0:r.t0,t1:r.t1,color:r.color});else{q.t0=Math.min(q.t0,r.t0);q.t1=Math.max(q.t1,r.t1)}});
  // finale: a cat that is done puts its tool down, walks to a spot of the page that stays free of paint (each its own,
  // picked near it with some randomness) and curls up there to sleep
  const F=plan.endC+.4,trackEnd=k=>{const T=plan.tracks&&plan.tracks[k];return T&&T.length?T[T.length-1].t1:0},doneAt=k=>relay?F:Math.min(F,trackEnd(k)+.25);
  const cats=[],prints=[],steps=[],purrs=[],meows=[],mrrps=[],puffs=[],own=new Int8Array(N),rs=rngOf(4441);
  const painted=new Set(o.filter(r=>!r.shadowOf&&!r.layerOf).map(r=>r.i));
  const freeAt=(x,y)=>{if(x<0||y<0||x>=seg.W||y>=seg.H)return false;const p=Math.round(y)*seg.W+Math.round(x);return!seg.isLine[p]&&!painted.has(seg.lab[p])};
  const roomy=(x,y)=>{for(let a=-2;a<=2;a++)for(let b=-1;b<=1;b++)if(!freeAt(x+a*.2*u,y+.32*u+b*.09*u))return false;return true};
  const cand=[];for(let y=.15*u;y<seg.H-.5*u;y+=.18*u)for(let x=.45*u;x<seg.W-.45*u;x+=.18*u)if(roomy(x,y))cand.push([x,y]);
  const taken=[];
  const spotFor=(k,x,y)=>{let best=null,bs=1e18;for(const q of cand){if(taken.some(t=>Math.hypot(t[0]-q[0],(t[1]-q[1])*1.6)<.95*u))continue;const sc=Math.hypot(q[0]-x,q[1]-y)*(.5+rs());if(sc<bs){bs=sc;best=q}}
    // no free paper left: a random spot along the bottom of the page, apart from the others
    for(let t=0;!best&&t<40;t++){const q=[seg.W*(.12+.76*rs()),seg.H*(.8+.1*rs())];if(!taken.some(p=>Math.hypot(p[0]-q[0],(p[1]-q[1])*1.6)<.95*u))best=q}
    if(!best)best=[seg.W/2+(k-(n-1)/2)*.9*u,seg.H*.88];taken.push(best);return best};
  if(relay)for(let i=0;i<N;i++)own[i]=owner(i*DT);
  for(let k=0;k<n;k++){
    const bx=new Float32Array(N),by=new Float32Array(N),dist=new Float32Array(N),spd=new Float32Array(N),vxa=new Float32Array(N),vya=new Float32Array(N),fac=new Float32Array(N),hf=new Float32Array(N),sid=new Float32Array(N),hold=new Uint8Array(N),done=doneAt(k),
      lean=new Float32Array(N),sq=new Float32Array(N),swx=new Float32Array(N),swy=new Float32Array(N),tail=new Float32Array(N),
      lkx=new Float32Array(N),lky=new Float32Array(N),rests=[],surp=[];
    let x=0,y=0,vx=0,vy=0,d=0,step=0,load=0,inkC='#000000',pa=-1,fc=1,want=1,spot=null,side=1,sleepAt=-1,pend=0,dcnt=0,hfc=1,toolSide=1,sa=1,
      le=0,lv=0,q=0,qv=0,rx=0,ry=0,rvx=0,rvy=0,tl=0,tv=0,pvx=0,pvy=0,pfc=1,ptx=null,pty=0,stH=null,rs0=-1;
    for(let i=0;i<N;i++){const c=i*DT,fin=c>=done,h=!fin&&(relay?own[i]===k:true);let tx,ty;stH=null;
      if(fin){if(!spot){spot=spotFor(k,x,y);side=rs()<.5?1:-1}[tx,ty]=spot}
      else if(h){const st=stH=penState(c,relay?0:k),L=(TOOL_LEN[st.tool]||560)*SS*toolK(cfg,st.tool);// while it carries the tool (between zones or patches) it walks with the tool itself, not with its next stand point
        // (aiming a little ahead, since a spring always trails what it follows)
        // while painting it also stands higher or lower with where the tool works (a smoothed tip height), so the paws
        // stay at its chest instead of reaching down past its feet
        const w=st.tf==null?0:Math.sin(Math.PI*clamp(st.tf,0,1));let sp=st.stand||[st.x,st.y];if(st.stand&&w===0){let my=0;for(const dd of [-.4,-.2,0,.2,.4])my+=penState(c+dd,relay?0:k).y;sp=[sp[0],lerp(sp[1],my/5,.6)]}const ah=w>0?penState(c+.2,relay?0:k):st;[tx,ty]=holdBody([lerp(sp[0],ah.x,w),lerp(sp[1],ah.y,w)],u,L,sa)}
      else{const r=nextOf(k,c);if(r){const L=(TOOL_LEN[r.tool]||560)*SS*toolK(cfg,r.tool),b=holdBody(r.legs[0].st||r.legs[0].p0,u,L,1);tx=b[0]+.45*u;ty=b[1]+.08*u}else{tx=seg.W*(.18+.22*k);ty=seg.H*.9}}
      // turn to where it is going (with a margin, so it does not flicker on the spot); the turn takes about a third of a second
      // the cats start right at their first zone, tool in paws (not all in one corner)
      if(!i){x=tx;y=ty}
      // facing: on the move (not painting) it turns to where it walks; while painting it keeps its side of the tool
      const moving=!stH||stH.tf!=null||stH.kind==='air';
      // (a real walk: going the same way, fast enough, for a third of a second; short hops between patches do not count)
      if(moving&&Math.abs(vx)>.6*u&&Math.abs(vx)>Math.abs(vy)*.5){const sd=vx>0?-1:1;if(sd===pend)dcnt++;else{pend=sd;dcnt=1}if(dcnt>20)want=sd}else dcnt=0;
      // on a walk between zones the tool goes over to the other paw, so the cat can carry it in front (early in the walk,
      // so it settles before painting again); short hops between patches keep the paw and the tool just trails behind
      if(!relay&&stH&&stH.kind==='air'&&stH.tf<.6&&dcnt>20)toolSide=want;
      // painting: it faces its tool
      if(stH&&!moving)want=toolSide;
      if(fin&&sleepAt<0&&Math.hypot(tx-x,ty-y)<.12*u&&Math.hypot(vx,vy)<.25*u){sleepAt=c;want=side}
      // head first: the head turns quickly, the body follows once the head is past halfway (constant rates, so the
      // in-between front view is seen for a moment); the tool swings over to the other paw in about 0.8 s
      hfc+=clamp(want-hfc,-7*DT,7*DT);if(Math.abs(want-hfc)<1)fc+=clamp(want-fc,-4*DT,4*DT);
      sa+=clamp(toolSide-sa,-2.6*DT,2.6*DT);
      // spring towards the target, but no sprinting: acceleration and walking speed are limited
      if(i){let nx=vx+(SPRING*SPRING*(tx-x)-2*SPRING*vx)*DT,ny=vy+(SPRING*SPRING*(ty-y)-2*SPRING*vy)*DT;
        const ex=nx-vx,ey=ny-vy,da=Math.hypot(ex,ey),am=ACC*u*DT;if(da>am){nx=vx+ex*am/da;ny=vy+ey*am/da}
        const sv=Math.hypot(nx,ny),vm=VMAX*u;if(sv>vm){nx*=vm/sv;ny*=vm/sv}
        vx=nx;vy=ny;const px=x,py=y;x+=vx*DT;y+=vy*DT;d+=Math.hypot(x-px,y-py)}
      bx[i]=x;by[i]=y;dist[i]=d;vxa[i]=vx;vya[i]=vy;fac[i]=fc;hf[i]=hfc;sid[i]=sa;hold[i]=h?1:0;spd[i]=Math.hypot(vx,vy);
      // a little puff of paper dust when it stops short or sets off
      if(i>8){const sp0=spd[i-8];if((sp0>.75*u&&spd[i]<.2*u)||(sp0<.12*u&&spd[i]>.6*u))if(!puffs.length||c-puffs[puffs.length-1].t>.5||puffs[puffs.length-1].k!==k)puffs.push({t:c,x,y:y+.42*u,k,dir:Math.sign(vx||1)})}
      // secondary motion, all in the cat's own frame (sg: +1 looking left): it gives the body weight
      {const sg=fc>=0?1:-1,vl=vx*sg,ax=(vx-pvx)/DT,ay=(vy-pvy)/DT;pvx=vx;pvy=vy;
        // lean into the walk and towards the stroke it is making; underdamped, so on a stop it rocks past upright and back
        let lt=clamp(vl/(3*u),-.45,.45);if(stH&&stH.stand)lt+=clamp((stH.x-stH.stand[0])*sg/u*.6,-.22,.22);
        {const w=8,z=.32;lv+=(w*w*(lt-le)-2*z*w*lv)*DT;le+=lv*DT}
        // squash on hard starts and stops, with a little bounce
        {const qt=clamp(Math.hypot(ax,ay)/(30*u),0,.07),w=11,z=.3;qv+=(w*w*(qt-q)-2*z*w*qv)*DT;q+=qv*DT}
        // the upper body sways with the strokes: it follows the hand a little, a beat late
        let hx=0,hy=0;if(stH&&stH.kind!=='air'){if(ptx!=null){hx=(stH.x-ptx)/DT;hy=(stH.y-pty)/DT}ptx=stH.x;pty=stH.y}else ptx=null;
        {const w=12,z=.5,gx=clamp(hx*.02,-.05*u,.05*u),gy=clamp(hy*.012,-.03*u,.03*u);rvx+=(w*w*(gx-rx)-2*z*w*rvx)*DT;rvy+=(w*w*(gy-ry)-2*z*w*rvy)*DT;rx+=rvx*DT;ry+=rvy*DT}
        // tail: trails back while walking, whips round on stops and turns, then settles (a loose spring)
        {const tt=clamp(-vl/(2*u),-.7,.7)+clamp((fc-pfc)/DT*.07,-.5,.5),w=6,z=.22;pfc=fc;tv+=(w*w*(tt-tl)-2*z*w*tv)*DT;tl+=tv*DT}
        lean[i]=le;sq[i]=q;swx[i]=rx*sg;swy[i]=ry;tail[i]=tl}
      // where it looks: the tip while painting, where it is going while walking, nowhere in particular otherwise
      if(stH){lkx[i]=stH.x;lky[i]=stH.y}else if(Math.hypot(tx-x,ty-y)>.3*u){lkx[i]=tx;lky[i]=ty}else{lkx[i]=NaN;lky[i]=NaN}
      if(stH&&stH.rest){if(rs0<0)rs0=c}else if(rs0>=0){rests.push([rs0,c]);rs0=-1}
      // purring while it stands and paints
      const calm=h&&spd[i]<.6*u;if(calm&&pa<0)pa=c;if((!calm||i===N-1)&&pa>=0){if(c-pa>1)purrs.push({a:pa,b:c,x,y});pa=-1}
      // a foot lands every half stride: fresh paint under it loads the paws, the next steps print that colour
      const s=Math.floor(d/(STRIDE*u*.5));if(s!==step){step=s;steps.push({t:c,x,y:y+.42*u});const sp=Math.hypot(vx,vy)||1,dx=vx/sp,dy=vy/sp,side=s%2?1:-1,fx=x+dx*.06*u-dy*side*.05*u,fy=y+.42*u+dx*side*.02*u,
        L=fx>=0&&fy>=0&&fx<seg.W&&fy<seg.H?seg.lab[Math.round(fy)*seg.W+Math.round(fx)]:0,z=L&&zt.get(L);
        if(z&&c>=z.t1-(z.t1-z.t0)*.3&&c<=z.t1+3.5){if(load<.5)surp.push(c);load=1;inkC=z.color}else if(load>.12){prints.push({t:c,x:fx,y:fy,a:Math.atan2(dy,dx),color:col(inkC),k:.78*load});load*=.72}}}
    // a sleepy meow when it lies down, then quiet purring
    if(sleepAt>=0){meows.push({t:sleepAt+.15,x,y});purrs.push({a:sleepAt+1.4,b:N*DT,x,y,soft:true})}
    cats.push({bx,by,dist,spd,vxa,vya,fac,hf,sid,hold,done,sleepAt,lean,sq,swx,swy,tail,lkx,lky,rests,surp})}
  prints.sort((a,b)=>a.t-b.t);puffs.sort((a,b)=>a.t-b.t);
  // personal space: cats that would overlap drift apart a little (smoothly, mostly sideways, never far from their work);
  // the offsets go through a spring, so a cat sidesteps instead of jumping
  if(n>1){const aw=new Float32Array(n),R0=.62*u,K=7,ox=new Float32Array(n),oy=new Float32Array(n),wx=new Float32Array(n),wy=new Float32Array(n),px=new Float32Array(n),py=new Float32Array(n);
    for(let i=0;i<N;i++){const c=i*DT;px.fill(0);py.fill(0);
      for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){const A=cats[a],B=cats[b];if((A.sleepAt>=0&&c>=A.sleepAt)||(B.sleepAt>=0&&c>=B.sleepAt))continue;
        let dx=A.bx[i]-B.bx[i],dy=(A.by[i]-B.by[i])*1.8;const d=Math.hypot(dx,dy);if(d>=R0)continue;if(d<1e-3){dx=1;dy=0}
        const L=Math.hypot(dx,dy),q=(R0-d)/R0*.32*u;px[a]+=dx/L*q;py[a]+=dy/L*q*.4;px[b]-=dx/L*q;py[b]-=dy/L*q*.4}
      // and a cat steps aside when another one paints right where it stands (no strokes under somebody's feet)
      // (looking a little ahead: where that tool will be over the next half second, so there is time to step away)
      if(i%3===0){aw.fill(0);for(let a=0;a<n;a++){const A=cats[a];if(!A.hold[i])continue;
        for(const dt of [-.15,0,.2,.4,.6]){const st=penState(c+dt,relay?0:a);if(st.kind!=='run'&&st.kind!=='trace'&&st.kind!=='link')continue;
          for(let b=0;b<n;b++){if(b===a)continue;const B=cats[b];if(B.sleepAt>=0&&c>=B.sleepAt)continue;const dx=B.bx[i]-st.x,dy=B.by[i]-st.y;
            if(Math.abs(dx)<.5*u&&dy>-.5*u&&dy<.65*u){const q=(dx<0?-1:1)*(.5*u-Math.abs(dx));if(Math.abs(q)>Math.abs(aw[b]))aw[b]=q}}}}}
      // a cat that is painting itself only leans away a little (its paws must stay on its own tool)
      if(i%3===0)for(let b=0;b<n;b++){const B=cats[b];let busy=false;if(B.hold[i]){const sb=penState(c,relay?0:b);busy=sb.kind==='run'||sb.kind==='trace'||sb.kind==='link'}aw[b]*=busy?.45:1.2}
      for(let b=0;b<n;b++)px[b]+=aw[b];
      for(let k=0;k<n;k++){wx[k]+=(K*K*(px[k]-ox[k])-2*K*wx[k])*DT;wy[k]+=(K*K*(py[k]-oy[k])-2*K*wy[k])*DT;ox[k]+=wx[k]*DT;oy[k]+=wy[k]*DT;cats[k].bx[i]+=ox[k];cats[k].by[i]+=oy[k]}}}
  // a meow now and then when a zone is finished; a short "mrrp" when the tool changes paws
  const zoneEnds=k=>{const L=relay?o.filter((r,j)=>rc[j]===k):(plan.tracks[k]||[]);return L.filter((r,j)=>!L[j+1]||L[j+1].i!==r.i).map(r=>r.t1)};
  const zoneRuns=k=>{const L=relay?o.filter((r,j)=>rc[j]===k):(plan.tracks[k]||[]),out=[];let a=0;L.forEach((r,j)=>{if(!L[j-1]||L[j-1].i!==r.i)a=r.t0;if(!L[j+1]||L[j+1].i!==r.i)out.push([a,r.t1])});return out};
  const zoneStarts=k=>{const L=relay?o.filter((r,j)=>rc[j]===k):(plan.tracks[k]||[]);return L.filter((r,j)=>!L[j-1]||L[j-1].i!==r.i).map(r=>r.t0)};
  // the face: 0 calm, 1 happy (a zone done, a friend met), 2 ears up (a new zone), 3 surprised (stepped in wet paint),
  // 4 yawning (a rest). mT/mD: seconds into it / its length. A stronger mood wins over a weaker one
  const PR=[0,2,1,3,4],setMood=(m,t0,dur,code)=>{const a=Math.max(0,Math.round(t0/DT)),b=Math.min(N,Math.round((t0+dur)/DT));for(let i=a;i<b;i++)if(PR[code]>=PR[m.mood[i]]){m.mood[i]=code;m.mT[i]=(i-a)*DT;m.mD[i]=dur}};
  cats.forEach((m,k)=>{m.mood=new Uint8Array(N);m.mT=new Float32Array(N);m.mD=new Float32Array(N);
    zoneStarts(k).forEach(t=>setMood(m,t-.35,.9,2));zoneRuns(k).forEach(([a,b])=>{if(b-a>3)setMood(m,b+.05,1.1,1)});m.surp.forEach(t=>setMood(m,t,.7,3));m.rests.forEach(([a,b])=>setMood(m,a,b-a,4))});
  // gaze (a soft spring towards what it looks at); two cats that meet stop to look at each other and smile
  cats.forEach(m=>{m.gzx=new Float32Array(N);m.gzy=new Float32Array(N)});
  {const gx=new Float32Array(n),gy=new Float32Array(n),vx=new Float32Array(n),vy=new Float32Array(n),until=new Float32Array(n).fill(-1),wth=new Int8Array(n).fill(-1),cool={},W=9;
    for(let i=0;i<N;i++){const c=i*DT;
      if(n>1&&i%6===0)for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){const A=cats[a],B=cats[b],key=a+'_'+b;
        if(c<until[a]||c<until[b]||(cool[key]!=null&&c<cool[key]+45))continue;if((A.sleepAt>=0&&c>=A.sleepAt)||(B.sleepAt>=0&&c>=B.sleepAt))continue;
        if(Math.hypot(A.bx[i]-B.bx[i],A.by[i]-B.by[i])<1.4*u&&A.spd[i]<.6*u&&B.spd[i]<.6*u){until[a]=until[b]=c+1.6;wth[a]=b;wth[b]=a;cool[key]=c;setMood(A,c+.45,1.1,1);setMood(B,c+.45,1.1,1)}}
      for(let k=0;k<n;k++){const m=cats[k];let tx=m.lkx[i],ty=m.lky[i];if(c<until[k]){const O=cats[wth[k]];tx=O.bx[i];ty=O.by[i]-.24*u}
        const sg=m.fac[i]>=0?1:-1;let ax=0,ay=0;if(!isNaN(tx)){const dx=tx-m.bx[i],dy=ty-(m.by[i]-.24*u),L=Math.max(Math.hypot(dx,dy),.6*u);ax=clamp(dx*sg/L,-1,.6);ay=clamp(dy/L,-1,1)}
        if(!i){gx[k]=ax;gy[k]=ay}else{vx[k]+=(W*W*(ax-gx[k])-2*W*vx[k])*DT;vy[k]+=(W*W*(ay-gy[k])-2*W*vy[k])*DT;gx[k]+=vx[k]*DT;gy[k]+=vy[k]*DT}
        m.gzx[i]=gx[k];m.gzy[i]=gy[k]}}}
  for(let k=0;k<n;k++)zoneEnds(k).forEach(t=>{if(t<F-1&&rs()<.22)meows.push({t:t+.15,x:seg.W/2,y:seg.H/2})});
  if(relay)for(let j=1;j<o.length;j++)if(rc[j]!==rc[j-1])mrrps.push({t:o[j].t0,x:o[j].legs[0].p0[0],y:o[j].legs[0].p0[1]});
  // camera "cat close-up": which cat is filmed and where, run through a soft spring so the frame glides with the cat
  // instead of chasing the tip of its tool; in the finale it widens to the whole group. camS/camH = visible size (page px).
  // follow: 'switch' cuts to another working cat every few seconds, 'lead' stays with one cat until it is done,
  // 'group' keeps every cat that still works in the frame. A change of the filmed cat is a cut, never a long pan.
  const camX=new Float32Array(N),camY=new Float32Array(N),camS=new Float32Array(N),camH=new Float32Array(N),camK=new Int8Array(N).fill(-1);
  {let x=0,y=0,w=0,h=0,vx=0,vy=0,vw=0,vh=0,cur=0,nextSw=every;const K=3,Kw=2,rc2=rngOf(9157);
    const works=(k,i,c)=>relay?own[i]===k:c<cats[k].done;
    // what has to be in the frame for a cat: the cat itself (ears to feet) and the tip of the tool it works with,
    // whichever paw holds it (on a walk between zones the tool rides in its paws, so the cat alone is enough)
    const ext=(m,k,i,c)=>{let x0=m.bx[i]-.36*u,x1=m.bx[i]+.36*u,y0=m.by[i]-.62*u,y1=m.by[i]+.46*u;
      if(m.hold[i]){const st=penState(c,relay?0:k);if(st.kind==='air')return[x0,x1,y0,y1];
        // the whole patch it can reach from where it stands (steady while it hatches), and the tip itself if it strays further
        if(st.stand){const R=.56*u;x0=Math.min(x0,st.stand[0]-R);x1=Math.max(x1,st.stand[0]+R);y0=Math.min(y0,st.stand[1]-R);y1=Math.max(y1,st.stand[1]+R)}
        x0=Math.min(x0,st.x-.12*u);x1=Math.max(x1,st.x+.12*u);y0=Math.min(y0,st.y-.12*u);y1=Math.max(y1,st.y+.12*u)}return[x0,x1,y0,y1]};
    for(let i=0;i<N;i++){const c=i*DT;let tx,ty,tw,th,jump=false;
      if(c>=F){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;cats.forEach(m=>{x0=Math.min(x0,m.bx[i]);x1=Math.max(x1,m.bx[i]);y0=Math.min(y0,m.by[i]);y1=Math.max(y1,m.by[i])});
        tx=(x0+x1)/2;ty=(y0+y1)/2+.1*u;tw=x1-x0+1.8*u;th=y1-y0+1.8*u}
      else if(follow==='group'){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;cats.forEach((m,k)=>{if(!relay&&!works(k,i,c))return;const e=ext(m,k,i,c);x0=Math.min(x0,e[0]);x1=Math.max(x1,e[1]);y0=Math.min(y0,e[2]);y1=Math.max(y1,e[3])});
        if(x0>x1)[x0,x1,y0,y1]=ext(cats[0],0,i,c);tx=(x0+x1)/2;ty=(y0+y1)/2;tw=Math.max(2.2*u,(x1-x0)*1.2+.4*u);th=Math.max(2.64*u,(y1-y0)*1.2+.4*u)}
      else{let want=cur;
        if(relay)want=own[i];
        else if(!works(cur,i,c)||(follow==='switch'&&c>=nextSw)){const L=[];for(let k=0;k<n;k++)if(k!==cur&&works(k,i,c))L.push(k);
          if(L.length)want=L[Math.floor(rc2()*L.length)];if(follow==='switch')nextSw=c+every*(.75+.5*rc2())}
        if(want!==cur){cur=want;jump=true}
        // (and where it will be working a moment later, so the frame is already there when it moves on)
        const e=ext(cats[cur],cur,i,c),j2=Math.min(N-1,i+36),e2=ext(cats[cur],cur,j2,j2*DT);e[0]=Math.min(e[0],e2[0]);e[1]=Math.max(e[1],e2[1]);e[2]=Math.min(e[2],e2[2]);e[3]=Math.max(e[3],e2[3]);tx=(e[0]+e[1])/2;ty=(e[2]+e[3])/2;tw=Math.max(2.2*u,(e[1]-e[0])*1.15);th=Math.max(2.64*u,(e[3]-e[2])*1.15);camK[i]=cur}
      if(!i||jump){x=tx;y=ty;w=tw;h=th;vx=vy=vw=vh=0}else{vx+=(K*K*(tx-x)-2*K*vx)*DT;vy+=(K*K*(ty-y)-2*K*vy)*DT;vw+=(Kw*Kw*(tw-w)-2*Kw*vw)*DT;vh+=(Kw*Kw*(th-h)-2*Kw*vh)*DT;x+=vx*DT;y+=vy*DT;w+=vw*DT;h+=vh*DT}
      camX[i]=x;camY[i]=y;camS[i]=w;camH[i]=h}}
  C.key=key;return C.tab={n,N,relay,cats,prints,puffs,steps,purrs,meows,mrrps,own,F,camX,camY,camS,camH,camK};
}
const at=(a,f,i)=>lerp(a[i],a[Math.min(i+1,a.length-1)],f);
/* ---------------- drawing ---------------- */
function limb(g,a,b,c,w,fur){for(const [cl,wd] of [[INK,w],[fur,w*.6]]){g.lineStyle({width:wd,color:cl,cap:PIXI.LINE_CAP.ROUND,join:PIXI.LINE_JOIN.ROUND});g.moveTo(a[0],a[1]);g.quadraticCurveTo(b[0],b[1],c[0],c[1])}g.lineStyle(0)}
function blob(g,x,y,rx,ry,fill,lw){g.lineStyle({width:lw,color:INK,join:PIXI.LINE_JOIN.ROUND});g.beginFill(fill);g.drawEllipse(x,y,rx,ry);g.endFill();g.lineStyle(0)}
/* an upright doodle cat in the flat sticker style: a big round head with pink ears, line eyes, whiskers and darker
   cheeks, a small pear body, stubby arms and legs, a striped tail, one thick even outline. Body centre (x,y), height u,
   looking left (mirror the graphics to look right). o: fur, blush, move 0..1, phase, t, lean, paws [[x,y],[x,y]] or null,
   cheer 0..1, fwd (walking direction in this frame) */
export function drawCat(gb,gf,x,y,u,o){
  const fur=col(o.fur),furD=shade(o.fur,.86),furDD=shade(o.fur,.74),belly=shade(o.fur,1.1),lw=.035*u,m=o.move,ph=o.phase,t=o.t,lean=o.lean||0;
  // gait by speed (o.spd, cat heights a second): slow is a low sneak, fast a bouncy trot with high steps
  const sv=o.spd||0,trot=clamp((sv-.9)/.8,0,1),sneak=m*clamp(1-sv/.55,0,1);
  // pf: how much in profile the body is (1, looking left) or turned to the viewer (0, mid-turn); hl: where the head looks
  // in this frame (1 forward, 0 at the viewer, -1 back over the shoulder) - the head turns before the body
  const pf=clamp((o.turn==null?1:o.turn)*1.3,0,1),hl=o.hl==null?1:o.hl;
  const bob=-Math.abs(Math.cos(ph))*(.016+.03*trot)*u*m+(o.swy||0)*u+.025*u*sneak,br=1+.015*Math.sin(t*2.1),ux=lean*.2*u*pf;
  gb.beginFill(0x1a1020,.16);gb.drawEllipse(x+.02*u,y+.43*u,.2*u,.045*u);gb.endFill();
  // hind legs along the walking direction (fwd): in stance the foot stays planted while the body passes over it
  // (a stride of STRIDE per cycle, so feet do not slide), in swing it is lifted and carried forward
  const fw=o.fwd||[-1,0],A=STRIDE*u*.25*m;
  const leg=(sg,g,fill)=>{const cy=(((ph+(sg>0?0:Math.PI))/(2*Math.PI))%1+1)%1;let off,lift;
    if(cy<.5){off=1-cy*4;lift=0}else{const s=(cy-.5)*2,e=s*s*(3-2*s);off=-1+2*e;lift=Math.sin(s*Math.PI)}
    const hx=x+(sg>0?-.065:.065)*u+ux*.4,hy=y+.27*u+bob,fx=hx+fw[0]*off*A,fy=y+.405*u+fw[1]*off*A*.6-lift*(.045+.05*trot)*u*m;
    limb(g,[hx,hy],[(hx+fx)/2,(hy+fy)/2],[fx,fy-.02*u],.1*u,fill);blob(g,fx-.02*u,fy,.06*u,.036*u,fill,lw)};
  const cw=Math.sin(t*8)*.03*u,ch=o.cheer||0,
    P=o.paws||[[lerp(x-.14*u,x-.34*u,ch),lerp(y+.17*u,y-.24*u+cw,ch)+bob],[lerp(x+.1*u,x+.32*u,ch),lerp(y+.18*u,y-.26*u-cw,ch)+bob]];
  const sN=[x-.11*u+ux,y+.05*u+bob],sF=[x+.1*u+ux,y+.04*u+bob];
  // tail with darker stripes
  // tail: a lazy idle sway plus the lagging swing from the motion tables (o.tail, radians: + = back and down)
  const tw=Math.sin(t*2.2+ph*.3)*.035*u,T0=[x+.12*u*pf,y+.27*u+bob],ta=o.tail||0,
    rot=(p,a)=>{const dx=p[0]-T0[0],dy=p[1]-T0[1],c=Math.cos(a),s=Math.sin(a);return[T0[0]+dx*c-dy*s,T0[1]+dx*s+dy*c]},
    T1=rot([x+.44*u*pf,y+.3*u+tw*.5],ta*.45*pf),T2=rot([x+.36*u*pf,y-.02*u+tw*1.4],ta*pf);
  limb(gb,T0,T1,T2,.1*u,fur);
  gb.lineStyle({width:.028*u,color:furDD,cap:PIXI.LINE_CAP.ROUND});
  for(const q of [.55,.8]){const a1=1-q,px=a1*a1*T0[0]+2*a1*q*T1[0]+q*q*T2[0],py=a1*a1*T0[1]+2*a1*q*T1[1]+q*q*T2[1],
    tx=2*a1*(T1[0]-T0[0])+2*q*(T2[0]-T1[0]),ty=2*a1*(T1[1]-T0[1])+2*q*(T2[1]-T1[1]),tl=Math.hypot(tx,ty)||1,nx=-ty/tl*.022*u,ny=tx/tl*.022*u;
    gb.moveTo(px-nx,py-ny);gb.lineTo(px+nx,py+ny)}
  gb.lineStyle(0);
  // both arms and paws are behind the tummy (and the tool behind the whole cat): it hugs the tool from behind
  // arms bend at the elbow: the closer the paw to the shoulder, the more the elbow sticks out (down and outwards)
  const elbow=(a,p,out)=>{const dx=p[0]-a[0],dy=p[1]-a[1],L=Math.hypot(dx,dy)||1;let nx=-dy/L,ny=dx/L;if(ny<0){nx=-nx;ny=-ny}const k=.035*u+Math.max(0,.34*u-L)*.75;return[(a[0]+p[0])/2+nx*k+out*.02*u,(a[1]+p[1])/2+ny*k]};
  limb(gb,sF,elbow(sF,P[1],1),P[1],.085*u,furD);
  limb(gb,sN,elbow(sN,P[0],-1),P[0],.085*u,fur);
  P.forEach((p,k)=>{blob(gb,p[0],p[1],.048*u,.042*u,k?furD:fur,lw);gb.lineStyle({width:lw*.45,color:INK,cap:PIXI.LINE_CAP.ROUND});
    gb.moveTo(p[0]-.012*u,p[1]+.014*u);gb.lineTo(p[0]-.012*u,p[1]+.034*u);gb.moveTo(p[0]+.012*u,p[1]+.014*u);gb.lineTo(p[0]+.012*u,p[1]+.034*u);gb.lineStyle(0)});
  leg(-1,gb,furD);leg(1,gb,fur);
  // small pear body with a lighter belly
  blob(gb,x+ux*.6,y+.16*u+bob,.165*u,.19*u*br,fur,lw);gb.beginFill(belly);gb.drawEllipse(x-.015*u*pf+ux*.6,y+.2*u+bob,.09*u,.12*u*br);gb.endFill();
  // big round head; the face sits a little towards where the cat looks
  // gaze turns the head a little and the face more (so it reads as a turn); a yawn tips the head back
  const gz=o.gaze||[0,0],mood=o.mood||0,pk=o.mD?Math.sin(Math.PI*clamp(o.mT/o.mD,0,1)):0;
  const hx=x-.02*u*pf+ux+Math.sin(t*1.1)*.006*u+gz[0]*.025*u,hy=y-.24*u+bob+gz[1]*.015*u-(mood===4?.03*u*pk:0),fx0=hx-.045*u*hl+gz[0]*.035*u;
  const perk=mood===2?pk:0;
  const ear=e=>{gb.lineStyle({width:lw,color:INK,join:PIXI.LINE_JOIN.ROUND});gb.beginFill(fur);gb.drawPolygon(e.flatMap(q=>[hx+q[0]*u,hy+q[1]*u]));gb.endFill();
    const c=[(e[0][0]+e[1][0]+e[2][0])/3,(e[0][1]+e[1][1]+e[2][1])/3+.02];gb.lineStyle({width:lw*.7,color:INK,join:PIXI.LINE_JOIN.ROUND});gb.beginFill(0xF59AB0);
    gb.drawPolygon(e.flatMap(q=>[hx+(c[0]+(q[0]-c[0])*.5)*u,hy+(c[1]+(q[1]-c[1])*.5)*u]));gb.endFill();gb.lineStyle(0)};
  ear([[-.28,-.06],[-.27-.02*perk,-.37-.06*perk],[-.05,-.23]]);ear([[.05,-.23],[.26+.02*perk,-.37-.06*perk],[.28,-.06]]);
  blob(gb,hx,hy,.3*u,.25*u,fur,lw);
  gb.beginFill(furD,.55);gb.drawEllipse(hx,hy+.15*u,.2*u,.07*u);gb.endFill();
  // darker cheeks (and a blush), line eyes with a lash, whiskers, a small mouth
  gb.beginFill(furD);gb.drawEllipse(fx0-.15*u,hy+.06*u,.075*u,.05*u);gb.drawEllipse(fx0+.13*u,hy+.06*u,.075*u,.05*u);gb.endFill();
  if(o.blush){gb.beginFill(0xE8505B,.35);gb.drawEllipse(fx0-.15*u,hy+.065*u,.045*u,.028*u);gb.drawEllipse(fx0+.13*u,hy+.065*u,.045*u,.028*u);gb.endFill()}
  // eyes by mood: calm lines with a lash, happy arcs, round surprised eyes, squeezed shut while yawning; they follow the gaze
  const ey=hy-.015*u+gz[1]*.012*u,eo=gz[0]*.018*u;gb.lineStyle({width:lw*.85,color:INK,cap:PIXI.LINE_CAP.ROUND});
  for(const [ex0,sd] of [[fx0-(.09+.012*hl)*u,-1],[fx0+(.09-.012*hl)*u,1]]){const ex=ex0+eo;
    if(mood===1){gb.moveTo(ex-.045*u,ey+.012*u);gb.quadraticCurveTo(ex,ey-.035*u,ex+.045*u,ey+.012*u)}
    else if(mood===3){gb.lineStyle(0);gb.beginFill(INK);gb.drawEllipse(ex,ey,.026*u,.036*u);gb.endFill();gb.beginFill(0xffffff);gb.drawCircle(ex-.008*u,ey-.012*u,.009*u);gb.endFill();gb.lineStyle({width:lw*.85,color:INK,cap:PIXI.LINE_CAP.ROUND})}
    else if(mood===4){gb.moveTo(ex-.045*u,ey-.005*u);gb.quadraticCurveTo(ex,ey+.028*u,ex+.045*u,ey-.005*u)}
    else{gb.moveTo(ex-.045*u,ey);gb.lineTo(ex+.045*u,ey);gb.moveTo(ex+sd*.045*u,ey);gb.lineTo(ex+sd*.07*u,ey-.022*u)}}
  gb.lineStyle({width:lw*.6,color:INK,cap:PIXI.LINE_CAP.ROUND});
  for(const [sd,x0] of [[-1,fx0-.17*u],[1,fx0+.15*u]])for(const k of [-1,0,1]){gb.moveTo(x0,hy+.06*u+k*.03*u);gb.lineTo(x0+sd*.1*u,hy+.055*u+k*.05*u)}
  // mouth: a small line, a cat smile when happy, an "o" when surprised, wide open in a yawn
  if(mood===4&&pk>.05){gb.lineStyle({width:lw*.7,color:INK,join:PIXI.LINE_JOIN.ROUND});gb.beginFill(0xC94F6D);gb.drawEllipse(fx0,hy+.115*u,.03*u+.015*u*pk,.055*u*pk);gb.endFill()}
  else if(mood===1){gb.moveTo(fx0-.035*u,hy+.098*u);gb.quadraticCurveTo(fx0-.018*u,hy+.122*u,fx0,hy+.1*u);gb.quadraticCurveTo(fx0+.018*u,hy+.122*u,fx0+.035*u,hy+.098*u)}
  else if(mood===3){gb.lineStyle({width:lw*.6,color:INK});gb.drawEllipse(fx0,hy+.108*u,.014*u,.02*u)}
  else{gb.moveTo(fx0-.03*u,hy+.1*u);gb.quadraticCurveTo(fx0-.01*u,hy+.112*u,fx0+.01*u,hy+.1*u)}
  gb.lineStyle(0);
}
/* a cat curled up asleep on the ground line (y+.42u) of the standing frame, head to the left: slow breathing, closed eyes,
   the tail round its front and a few z's floating up. o: fur, blush, t, z (seconds asleep), mx (frame mirroring, so the
   letters still read) */
function drawSleep(g,x,y,u,o){
  const fur=col(o.fur),furD=shade(o.fur,.86),furDD=shade(o.fur,.74),lw=.035*u,br=1+.045*Math.sin(o.t*1.5);
  g.beginFill(0x1a1020,.16);g.drawEllipse(x+.03*u,y+.44*u,.4*u,.055*u);g.endFill();
  blob(g,x+.08*u,y+.42*u-.13*u*br,.3*u,.13*u*br,fur,lw);
  g.lineStyle({width:.026*u,color:furDD,cap:PIXI.LINE_CAP.ROUND});for(const q of [.06,.18]){const yt=y+.42*u-.25*u*br;g.moveTo(x+q*u,yt+.01*u);g.quadraticCurveTo(x+(q+.03)*u,yt+.04*u,x+(q+.01)*u,yt+.07*u)}g.lineStyle(0);
  blob(g,x+.3*u,y+.405*u,.065*u,.034*u,furD,lw);
  limb(g,[x+.36*u,y+.35*u],[x+.32*u,y+.5*u],[x-.08*u,y+.455*u],.08*u,fur);
  const hx=x-.2*u,hy=y+.25*u+.008*u*Math.sin(o.t*1.5);
  const ear=e=>{g.lineStyle({width:lw,color:INK,join:PIXI.LINE_JOIN.ROUND});g.beginFill(fur);g.drawPolygon(e.flatMap(q=>[hx+q[0]*u,hy+q[1]*u]));g.endFill();
    const c=[(e[0][0]+e[1][0]+e[2][0])/3,(e[0][1]+e[1][1]+e[2][1])/3+.015];g.lineStyle({width:lw*.7,color:INK,join:PIXI.LINE_JOIN.ROUND});g.beginFill(0xF59AB0);
    g.drawPolygon(e.flatMap(q=>[hx+(c[0]+(q[0]-c[0])*.5)*u,hy+(c[1]+(q[1]-c[1])*.5)*u]));g.endFill();g.lineStyle(0)};
  ear([[-.21,-.04],[-.2,-.28],[-.04,-.18]]);ear([[.04,-.18],[.19,-.27],[.21,-.03]]);
  blob(g,hx,hy,.22*u,.18*u,fur,lw);
  g.beginFill(furD);g.drawEllipse(hx-.11*u,hy+.05*u,.055*u,.036*u);g.drawEllipse(hx+.1*u,hy+.05*u,.055*u,.036*u);g.endFill();
  if(o.blush){g.beginFill(0xE8505B,.35);g.drawEllipse(hx-.11*u,hy+.055*u,.034*u,.021*u);g.drawEllipse(hx+.1*u,hy+.055*u,.034*u,.021*u);g.endFill()}
  g.lineStyle({width:lw*.8,color:INK,cap:PIXI.LINE_CAP.ROUND});
  for(const ex of [hx-.08*u,hx+.07*u]){g.moveTo(ex-.035*u,hy-.012*u);g.quadraticCurveTo(ex,hy+.022*u,ex+.035*u,hy-.012*u)}
  g.lineStyle({width:lw*.55,color:INK,cap:PIXI.LINE_CAP.ROUND});
  for(const [sd,x0] of [[-1,hx-.13*u],[1,hx+.12*u]])for(const k of [-.5,.5]){g.moveTo(x0,hy+.06*u+k*.03*u);g.lineTo(x0+sd*.08*u,hy+.055*u+k*.05*u)}
  g.moveTo(hx-.02*u,hy+.085*u);g.quadraticCurveTo(hx,hy+.095*u,hx+.02*u,hy+.085*u);g.lineStyle(0);
  blob(g,hx-.08*u,hy+.17*u,.05*u,.032*u,fur,lw);blob(g,hx+.07*u,hy+.175*u,.05*u,.032*u,furD,lw);
  for(let j=0;j<3;j++){const ph=o.z*.32-j/3;if(ph<0)continue;const q=ph%1,a=Math.min(1,q*6)*(1-q);if(a<.02)continue;
    const sz=.03*u*(.6+q*.9),sx=sz*(o.mx||1),zx=hx+(.12+q*.24)*u+Math.sin(q*6+j)*.03*u,zy=hy-.2*u-q*.5*u;
    g.lineStyle({width:lw*.7,color:INK,alpha:a,cap:PIXI.LINE_CAP.ROUND,join:PIXI.LINE_JOIN.ROUND});g.moveTo(zx-sx,zy-sz);g.lineTo(zx+sx,zy-sz);g.lineTo(zx-sx,zy+sz);g.lineTo(zx+sx,zy+sz)}
  g.lineStyle(0)}
/* a paw print: pad and four toes towards the walking direction */
function drawPrint(g,p,a,u){g.beginFill(p.color,a);g.drawCircle(p.x,p.y,.034*u);
  [-.55,-.18,.18,.55].forEach(o=>{const d=.05*u;g.drawCircle(p.x+Math.cos(p.a+o)*d,p.y+Math.sin(p.a+o)*d,.015*u)});g.endFill()}
/* ---------------- stage objects ---------------- */
function catObj(k){if(!C.cats[k]||C.cats[k].back.destroyed)C.cats[k]={back:new PIXI.Graphics(),front:new PIXI.Graphics()};return C.cats[k]}
function penObj(k,tool){let p=C.pens[k];if(!p||p.tool!==tool||p.c.destroyed){if(p){p.c.destroy({children:true});p.sh.destroy({children:true})}const B=buildTool(tool);p=C.pens[k]={tool,c:B.c,sh:B.sh,tint:B.tint}}return p}
/* The page is seen through the post shader's tilted camera (uPersp): drawn flat on the page, a cat would be squashed
   and skewed like a sticker. Billboard: for a foot point (world) this returns the 2x2 world matrix that undoes the local
   distortion of that warp and leaves a plain scale by depth, so cats stand up like sprites in a 3D scene. */
const mul=(X,Y)=>[X[0]*Y[0]+X[2]*Y[1],X[1]*Y[0]+X[3]*Y[1],X[0]*Y[2]+X[2]*Y[3],X[1]*Y[2]+X[3]*Y[3]];
function billboard(){const U2=postShader&&postShader.uniforms;if(!U2)return null;const Pp=U2.uPersp,B=U2.uBreath||1;
  if(!Pp||Math.abs(Pp[0])+Math.abs(Pp[1])+Math.abs(Pp[2])+Math.abs(B-1)<1e-5)return null;
  const Rs=U2.uRes,O=U2.uOvs,asp=Rs[0]/Rs[1];
  // output uv -> scene pixel, exactly like warpN in post.frag
  const fwd=(ox,oy)=>{let nx=(ox-.5)*2,ny=(oy-.5)*2;const r2=(nx*nx*asp*asp+ny*ny)*.25,q=(1+Pp[2]*r2)/B;nx*=q;ny*=q;const w=1/(1+Pp[0]*ny+Pp[1]*nx);return[(.5+nx*w*.5/O)*Rs[0]*O,(.5+ny*w*.5/O)*Rs[1]*O]};
  world.transform.updateLocalTransform();const M=world.transform.localTransform,W=[M.a,M.b,M.c,M.d],dw=W[0]*W[3]-W[1]*W[2],Wi=[W[3]/dw,-W[1]/dw,-W[2]/dw,W[0]/dw];
  return p=>{const sp=M.apply(new PIXI.Point(p[0],p[1]));let ox=.5+(sp.x/(Rs[0]*O)-.5)*O,oy=.5+(sp.y/(Rs[1]*O)-.5)*O,J=[1,0,0,1];const e=1e-3;
    for(let it=0;it<6;it++){const f0=fwd(ox,oy),fx=fwd(ox+e,oy),fy=fwd(ox,oy+e);
      J=[(fx[0]-f0[0])/(e*Rs[0]),(fx[1]-f0[1])/(e*Rs[0]),(fy[0]-f0[0])/(e*Rs[1]),(fy[1]-f0[1])/(e*Rs[1])];
      const rx=sp.x-f0[0],ry=sp.y-f0[1],dj=J[0]*J[3]-J[1]*J[2];if(Math.abs(dj)<1e-9)break;ox+=(J[3]*rx-J[2]*ry)/dj/Rs[0];oy+=(-J[1]*rx+J[0]*ry)/dj/Rs[1];if(Math.hypot(rx,ry)<.05)break}
    const dj=J[0]*J[3]-J[1]*J[2];if(Math.abs(dj)<1e-9)return[1,0,0,1];const sc=Math.hypot(J[3],J[1])/Math.abs(dj);
    return mul(Wi,mul(J.map(v=>v*sc),W))}}
function late(){const f=C.fr;C.fr=null;if(f)f(billboard())}
function hide(){C.fr=null;C.cats.forEach(o=>{o.back.visible=o.front.visible=false});C.pens.forEach(p=>{if(p){p.c.visible=p.sh.visible=false}});if(C.prints)C.prints.visible=false}
function render(cfg,f){
  if(!plan||!plan.order||!plan.order.length||!penC||!penC.parent||!seg){hide();return}
  const T=build(cfg),u=catH(cfg),c=f.c,fi=clamp(c/DT,0,T.N-1.001),i=Math.floor(fi),fr=fi-i,wob=.03*Math.sin(f.v*1.9);
  // inking the lines first: that is the hand's tool, as without the cats; the cats wait for the colouring
  const inking=!!f.st.ink;
  // the lead tool: smaller, held tip down-left in front of the cat
  const k0=inking?1:toolK(cfg,f.st.tool||'marker'),lsd=at(T.cats[T.relay?T.own[i]:0].sid,fr,i);if(!inking){penC.scale.x*=k0;penC.scale.y*=k0;penC.rotation=toolAng(lsd)+wob-.04*f.h*lsd;
  penShadow.scale.x*=k0;penShadow.scale.y*=k0;{const lk=toolLook(penC.rotation);penShadow.rotation=lk.shRot;penShadow.scale.x*=lk.shLen;if(lk.flip){penC.scale.y*=-1;penShadow.scale.y*=-1}}penShadow.position.set(f.pw[0]+(penShadow.position.x-f.pw[0])*k0,f.pw[1]+(penShadow.position.y-f.pw[1])*k0);}
  // on a walk between zones the tool rides in the paws (so it can swap paws), blended in and out over the walk
  const carry=st=>st.kind==='air'&&st.tf!=null?Math.pow(Math.sin(Math.PI*clamp(st.tf,0,1)),.8):0;
  const heldTip=(m,tool,sd)=>{const a=toolAng(sd),L=(TOOL_LEN[tool]||560)*SS*toolK(cfg,tool),bx=at(m.bx,fr,i),by=at(m.by,fr,i);return P2W(bx-.3*u*sd-Math.cos(a)*L*.62,by-.05*u-Math.sin(a)*L*.62)};
  let lpw=f.pw;if(!inking){const w=carry(f.st);if(w>0){const q=heldTip(T.cats[T.relay?T.own[i]:0],f.st.tool||'marker',lsd),dx=(q[0]-f.pw[0])*w,dy=(q[1]-f.pw[1])*w;lpw=[f.pw[0]+dx,f.pw[1]+dy];penC.position.set(lpw[0],lpw[1]);penShadow.position.set(penShadow.position.x+dx,penShadow.position.y+dy)}}
  // a cat that is done has put its tool down
  if(c>=(T.relay?T.F:T.cats[0].done)){penC.visible=false;penShadow.visible=false}
  const pens=[{pw:lpw,rot:penC.rotation,L:(TOOL_LEN[f.st.tool]||560)*SS*penC.scale.x,vis:penC.visible&&!inking}];
  if(!T.relay)for(let k=1;k<T.n;k++){const st=penState(c,k),tool=st.tool||'marker',p=penObj(k,tool),kk=toolK(cfg,tool),h=st.h||0,sk=at(T.cats[k].sid,fr,i);let pw=P2W(st.x,st.y);{const w=carry(st);if(w>0){const q=heldTip(T.cats[k],tool,sk);pw=[lerp(pw[0],q[0],w),lerp(pw[1],q[1],w)]}}
    p.c.visible=p.sh.visible=st.jar==null&&c<T.cats[k].done;p.tint.forEach(g=>g.tint=col(st.color||'#888888'));p.c.position.set(pw[0],pw[1]);p.c.rotation=toolAng(sk)+.03*Math.sin(f.v*1.7+k)-.04*h*sk;p.c.scale.set(kk*(1+.05*h));
    p.sh.position.set(pw[0]+(4+38*h)*SS*kk,pw[1]+(6+52*h)*SS*kk);{const lk=toolLook(p.c.rotation);p.sh.rotation=lk.shRot;p.sh.scale.set(kk*(1+.03*h)*lk.shLen,kk*(1+.03*h)*(lk.flip?-1:1));if(lk.flip)p.c.scale.y*=-1}shadowHover(p.sh,h);
    pens[k]={pw,rot:p.c.rotation,L:(TOOL_LEN[tool]||560)*SS*kk*(1+.05*h),vis:p.c.visible}}
  C.pens.forEach((p,k)=>{if(p&&(T.relay||k>=T.n)){p.c.visible=p.sh.visible=false}});
  // stage order: extra tool shadows, cat bodies (back to front), lead tool, extra tools, paws
  const cats=[];for(let k=0;k<T.n;k++){const m=T.cats[k];cats.push({k,m,b:P2W(at(m.bx,fr,i),at(m.by,fr,i)),obj:catObj(k)})}
  cats.sort((a,b)=>a.b[1]-b.b[1]);
  const extra=C.pens.filter((p,k)=>p&&k<T.n&&!T.relay);
  [...C.cats.flatMap(q=>[q.back,q.front]),...C.pens.filter(Boolean).flatMap(p=>[p.c,p.sh])].forEach(q=>{if(q.parent)q.parent.removeChild(q)});
  let idx=world.getChildIndex(penC);extra.forEach(p=>world.addChildAt(p.sh,idx++));
  idx=world.getChildIndex(penC)+1;extra.forEach(p=>world.addChildAt(p.c,idx++));cats.forEach(q=>{world.addChildAt(q.obj.back,idx++);world.addChildAt(q.obj.front,idx++)});
  // the cats are drawn late (hook 'late'), once the camera and the perspective of this frame are known
  C.fr=BB=>cats.forEach(({k,b,m,obj})=>{
    const holding=m.hold[i]&&m.hold[Math.min(i+1,T.N-1)],pn=pens[T.relay?0:k],fa=at(m.fac,fr,i),fv=fa<0?-1:1;let paws=null;
    if(holding&&pn&&pn.vis){const dx=Math.cos(pn.rot),dy=Math.sin(pn.rot);paws=[[pn.pw[0]+dx*pn.L*.58,pn.pw[1]+dy*pn.L*.58],[pn.pw[0]+dx*pn.L*.74,pn.pw[1]+dy*pn.L*.74]];
      // arms are stretchy, not endless: the body follows if the tool got too far
      const s=[b[0]-.09*u*fv,b[1]-.06*u],ex=paws[0][0]-s[0],ey=paws[0][1]-s[1],R=Math.hypot(ex,ey),mx=.65*u;if(R>mx){const q=(R-mx)/R;b=[b[0]+ex*q,b[1]+ey*q]}
      // the paws never go below the hips: if the tool works low, the cat goes down with it
      const low=Math.max(paws[0][1],paws[1][1])-(b[1]+.16*u);if(low>0)b=[b[0],b[1]+low]}
    // asleep: the standing cat fades into the curled-up one
    const sl=m.sleepAt>=0?clamp((c-m.sleepAt-.35)/.6,0,1):0,cheer=0;
    const seed=Math.floor(c/3.1+k*.37),blink=((c/3.1+k*.37)%1)>.965&&(seed*7919%5)!==0;
    // drawn in the cat's own frame (big units, mirrored when it looks right), then placed and scaled
    const U=CAT_U,sx=fv*u/U,sy=u/U,vx=at(m.vxa,fr,i),vy=at(m.vya,fr,i),sp=Math.hypot(vx,vy),fwd=sp>1e-3?[vx/sp*Math.sign(fv),vy/sp]:[-1,0];
    // standing up in the camera's perspective: feet on the page, body upright and evenly scaled by depth
    // squash and stretch about the feet
    const mood=m.mood[i],mT=m.mT[i],mD=m.mD[i],yawn=mood===4&&mD?Math.sin(Math.PI*clamp(mT/mD,0,1)):0;
    const sqz=sl<1?at(m.sq,fr,i)-.06*yawn:0,sx2=sx*(1+sqz*.6),sy2=sy*(1-sqz),hk=.42*u*(1-sqz);
    const ft=[b[0],b[1]+.42*u],A=BB?BB(ft):[1,0,0,1],mtx=new PIXI.Matrix(A[0]*sx2,A[1]*sx2,A[2]*sy2,A[3]*sy2,ft[0]-A[2]*hk,ft[1]-A[3]*hk);
    const lp=paws&&paws.map(p=>{const q=mtx.applyInverse(new PIXI.Point(p[0],p[1]));return[clamp(q.x,-.7*U,.7*U),q.y]});
    obj.back.clear();obj.front.clear();obj.back.visible=obj.front.visible=true;
    for(const g of [obj.back,obj.front])g.transform.setFromMatrix(mtx);
    obj.back.alpha=1-sl;obj.front.alpha=sl;
    if(sl<1)drawCat(obj.back,obj.front,0,0,U,{fur:furOf(cfg,k),blush:cfg.blush,move:clamp(sp/(1.2*u),0,1),phase:at(m.dist,fr,i)/(STRIDE*u)*Math.PI*2,t:c+k*1.7,blink,lean:at(m.lean,fr,i)+at(m.swx,fr,i)/(.2*u)+.3*yawn,spd:sp/u,turn:Math.abs(fa),hl:at(m.hf,fr,i)*fv,mood,mT,mD,gaze:[at(m.gzx,fr,i),at(m.gzy,fr,i)],swy:at(m.swy,fr,i)/u,tail:at(m.tail,fr,i),paws:lp,cheer,fwd});
    if(sl>0)drawSleep(obj.front,0,0,U,{fur:furOf(cfg,k),blush:cfg.blush,t:c+k*1.3,z:c-m.sleepAt,mx:Math.sign(fv)})});
  // paw prints on the page (they turn with the paper)
  if(!C.prints||C.prints.parent!==paperC||C.prints.destroyed){C.prints=new PIXI.Graphics();paperC.addChild(C.prints)}
  const g=C.prints;g.clear();g.visible=true;for(const p of T.prints){if(p.t>c)break;const age=c-p.t;if(age>PRINT_LIFE)continue;drawPrint(g,p,p.k*(age<2.5?1:Math.max(0,1-(age-2.5)/2)),u)}
  for(const p of T.puffs){if(p.t>c)break;const age=c-p.t;if(age>.7)continue;const e=age/.7;
    for(let j=0;j<5;j++){const a=Math.PI*(.15+.7*j/4),sx=(j<2?-1:j>2?1:0)||p.dir*.3;g.beginFill(0xD9D0C5,.38*(1-e)*(1-e));g.drawCircle(p.x+sx*Math.abs(Math.cos(a))*(.06+.3*e)*u,p.y-Math.sin(a)*(.02+.08*e)*u,(.025+.045*e)*u);g.endFill()}}
}
/* camera "cat close-up": the painting cat and the patch it works on; in the finale the whole group ([x,y,zoom], page space) */
function focus(cfg,c){if(!plan||!plan.order||!plan.order.length||!seg)return null;
  const T=build(cfg),fi=clamp(c/DT,0,T.N-1.001),i=Math.floor(fi),fr=fi-i,zk=cfg.camZoom||1,j=Math.abs(T.camX[Math.min(i+1,T.N-1)]-T.camX[i])>.5*catH(cfg)?0:fr,
    w=at(T.camS,j,i)/zk,h=at(T.camH,j,i)/zk;
  return[at(T.camX,j,i),at(T.camY,j,i),clamp(Math.min(view.W/(viewFit()*w),view.H/(viewFit()*h)),1,5)]}
/* ---------------- sounds: soft steps, purring while painting, a meow now and then ---------------- */
/* recorded meows (src/addons/sounds), decoded once at the soundtrack's rate, trimmed and peak-normalised */
const MEOW_URLS=Object.values(import.meta.glob('./sounds/*.mp3',{eager:true,query:'?url',import:'default'}));
const CLIPS=[];let clipsP=null;
function prepClip(buf){const n=buf.length,ch=buf.numberOfChannels,m=new Float32Array(n);for(let c=0;c<ch;c++){const d=buf.getChannelData(c);for(let i=0;i<n;i++)m[i]+=d[i]/ch}
  let pk=0;for(let i=0;i<n;i++)pk=Math.max(pk,Math.abs(m[i]));if(pk<1e-4)return null;
  const th=pk*.03;let a=0,b=n-1;while(a<n&&Math.abs(m[a])<th)a++;while(b>a&&Math.abs(m[b])<th)b--;b=Math.min(b,a+Math.round(SR*2.5));
  const L=b-a+1,o=new Float32Array(L),fo=Math.round(SR*.03);for(let i=0;i<L;i++)o[i]=m[a+i]/pk*Math.min(1,(L-1-i)/fo,(i+1)/32);return o}
function loadClips(){if(!clipsP)clipsP=Promise.all(MEOW_URLS.map(url=>fetch(url).then(r=>r.arrayBuffer()).then(b=>new OfflineAudioContext(1,1,SR).decodeAudioData(b)).then(prepClip).catch(()=>null)))
  .then(a=>{CLIPS.length=0;a.forEach(q=>{if(q)CLIPS.push(q)})});return clipsP}
function footstep(put,t,pan,amp){const lp=new BQ('lp',900,.7);let ph=0;put(t,.07,pan,k=>{const a=k/SR;ph+=2*Math.PI*105/SR;return(lp.p(nz())*Math.exp(-a/.011)*1.3+Math.sin(ph)*Math.exp(-a/.028)*.5)*amp})}
function purr(put,t,dur,pan,amp){const lp=new BQ('lp',170,.8),lp2=new BQ('lp',420,.7);put(t,dur,pan,k=>{const a=k/SR,fade=Math.min(1,a/.25,(dur-a)/.35),br=.55+.45*Math.sin(2*Math.PI*a/1.9),
  pulse=Math.pow(.5+.5*Math.sin(2*Math.PI*(br>.55?25:22)*a),3);return(lp.p(nz())*1.6+lp2.p(nz())*.25)*pulse*br*amp*Math.max(0,fade)})}
function meow(put,t,pan,amp,len,f0){const f1=new BQ('bp',800,4),f2=new BQ('bp',1700,6),f3=new BQ('bp',2900,8);let ph=0;
  put(t,len,pan,k=>{const a=k/(len*SR),v=Math.sin(Math.PI*Math.min(1,a*1.25)),pitch=f0*(1+.35*v)*(1-.15*a);ph=(ph+pitch/SR)%1;const src=ph*2-1;
    if(k%64===0){f1.set(600+520*v);f2.set(1300+1100*v-400*a);f3.set(2800+300*v)}return(f1.p(src)+f2.p(src)*.7+f3.p(src)*.3)*Math.min(1,a*14)*Math.pow(1-a,.6)*amp})}
function sound(cfg,ctx){if(!cfg.voice||!plan||!plan.order||!plan.order.length||!seg)return;
  const T=build(cfg),{put,putS,p}=ctx,v=c=>p.vOf(c),pan=x=>clamp((x/seg.W-.5)*1.1,-.55,.55),rr=rngOf(4242);
  // with spatial audio every sound is placed where its cat is (putS); otherwise a plain left-right pan
  const at2=(x,y)=>putS?(t,d,pn,gen,g)=>putS(t,d,x,y,gen,g):put;
  T.steps.forEach(q=>footstep(at2(q.x,q.y),v(q.t),pan(q.x),.16+rr()*.08));
  T.purrs.forEach(q=>{const a=v(q.a),b=Math.min(v(q.b),a+(q.soft?12:6));if(b>a+.3)purr(at2(q.x,q.y),a,b-a,pan(q.x),q.soft?.32:.55)});
  const voice=(t,x,y,amp,len,f0)=>{const q=CLIPS.length?CLIPS[Math.floor(rr()*CLIPS.length)]:null,P=at2(x,y);if(q)P(t,q.length/SR,pan(x),k=>q[k]*amp);else meow(P,t,pan(x),amp*.95,len,f0)};
  T.meows.forEach(q=>voice(v(q.t),q.x,q.y,1,.45+rr()*.2,430+rr()*170));
  T.mrrps.forEach(q=>voice(v(q.t),q.x,q.y,.5,.17,640+rr()*80))}
/* spatial audio: a sound at page point (x,y), plan time c, as heard from the camera of that moment (the cat close-up's
   own framing; the whole page otherwise). pan from where it is across the frame, quieter and duller the further it is
   outside the frame (lp: 1 = clear), slightly closer and louder when the camera is in close */
function spatial(cfg){if(!cfg.spatial||!seg)return null;
  return(x,y,c)=>{let cx=seg.W/2,cy=seg.H/2,z=1;if(S.camMode==='cat'){const fo=focus(cfg,c);if(fo)[cx,cy,z]=fo}
    const k=viewFit()*z,hw=view.W/k/2,hh=view.H/k/2,rx=(x-cx)/hw,ry=(y-cy)/hh,d=Math.hypot(rx,ry*.8);
    return{pan:clamp(rx*.8,-.92,.92),gain:(d<.75?1:1/(1+1.1*(d-.75)))*clamp(.85+.06*z,.9,1.2),lp:d<.9?1:clamp(1-.4*(d-.9),.15,1)}}}
/* tile picture: the cat holding a marker on paper */
function thumb(size){
  const c=new PIXI.Container(),bg=new PIXI.Graphics();bg.beginFill(0xF7F2EA);bg.drawRect(0,0,size,size);bg.endFill();c.addChild(bg);
  const gb=new PIXI.Graphics(),gf=new PIXI.Graphics(),mk=new PIXI.Graphics(),u=size*.66,x=size*.6,y=size*.47,tip=[size*.17,size*.88];
  const sc=new PIXI.Graphics();sc.lineStyle({width:size*.05,color:0xE3416F,alpha:.75,cap:PIXI.LINE_CAP.ROUND});sc.moveTo(size*.04,size*.95);for(let k=0;k<4;k++){sc.lineTo(size*(.07+.05*k),size*.8);sc.lineTo(size*(.05+.05*k),size*.95)}
  const g1=[x-.2*u,y+.12*u],g2=[x-.06*u,y+.03*u];
  mk.lineStyle({width:u*.1,color:INK,cap:PIXI.LINE_CAP.ROUND});mk.moveTo(tip[0],tip[1]);mk.lineTo(g2[0]+.04*u,g2[1]-.03*u);mk.lineStyle({width:u*.07,color:0xE3416F,cap:PIXI.LINE_CAP.ROUND});mk.moveTo(tip[0]+1,tip[1]-1);mk.lineTo(g2[0]+.04*u,g2[1]-.03*u);
  c.addChild(sc,gb,mk,gf);
  drawCat(gb,gf,x,y,u,{fur:'#F7C27E',blush:true,move:0,phase:0,t:.4,blink:false,paws:[g1,g2]});
  const cv=app.renderer.extract.canvas(c,new PIXI.Rectangle(0,0,size,size)),url=cv.toDataURL('image/png');c.destroy({children:true});return url;
}
registerAddon({id:'cat',name:'Котики-художники',desc:'Дудл-котики стоять на задніх лапках, тримають інструмент передніми й самі розфарбовують сторінку: ділянка за ділянкою, без метушні.',
  settings:[{k:'count',label:'Скільки котиків',type:'range',min:1,max:4,step:1,def:1,replan:true},
    {k:'mode',label:'Як працюють разом',type:'seg',def:'parallel',options:[['parallel','Паралельно'],['relay','Естафетою']],replan:true,show:c=>c.count>1},
    {k:'fur',label:'Колір шерсті (першого котика)',type:'choice',def:'#F7C27E',options:CAT_FURS.map(([v,l])=>[v,l,v])},
    {k:'size',label:'Розмір котиків',type:'range',min:.6,max:1.6,step:.05,def:1,replan:true},
    {k:'pace',label:'Темп котиків',type:'range',min:.4,max:2.5,step:.1,def:1,replan:true},
    {k:'help',label:'Вільні котики допомагають з великими зонами',type:'bool',def:true,replan:true,show:c=>c.count>1&&c.mode!=='relay'},
    {k:'blush',label:'Рум\'янець',type:'bool',def:true},
    {k:'camFollow',label:'Камера «Котик крупно»: кого знімати',type:'seg',def:'switch',options:[['switch','По черзі'],['lead','Одного'],['group','Усіх разом']],show:c=>c.count>1&&c.mode!=='relay'},
    {k:'camEvery',label:'Перемикати камеру кожні, с',type:'range',min:3,max:15,step:1,def:7,show:c=>c.count>1&&c.mode!=='relay'&&(c.camFollow||'switch')==='switch'},
    {k:'camZoom',label:'Наближення камери «Котик крупно»',type:'range',min:.6,max:1.8,step:.05,def:1},
    {k:'spatial',label:'Просторовий звук: котики й інструменти звучать там, де вони в кадрі',type:'bool',def:true},
    {k:'voice',label:'Звуки котиків: кроки, муркотіння, «мяу»',type:'bool',def:true}],
    // cats work at their own pace (the length of the video follows from it), the tip moves ~1.6 cat heights a second
  painters:cfg=>{const n=Math.max(1,Math.round(cfg.count)),u=seg?catH(cfg):0;return{n,mode:n>1?cfg.mode:'solo',reach:.33*u,pace:1.6*u*(cfg.pace||1),walk:.95*u,help:cfg.help!==false}},
  thumb,focus,spatial,prepare:cfg=>cfg.voice?loadClips():null,hooks:{render,late,sound,hide:()=>hide()}});
/* for checks from the console */
export function catMotion(){const T=C.tab;if(!T)return null;const cfg=ADD.cfg.cat,u=catH(cfg);
  return T.cats.map((m,k)=>{let vmax=0,amax=0,lag=0,lagT=0,nb=0,nh=0,nc=0,rmax=0,nlow=0;const ev=[];for(let i=2;i<T.N;i++){const v1=Math.hypot(m.bx[i]-m.bx[i-1],m.by[i]-m.by[i-1])/DT,v0=Math.hypot(m.bx[i-1]-m.bx[i-2],m.by[i-1]-m.by[i-2])/DT;
    vmax=Math.max(vmax,v1);amax=Math.max(amax,Math.abs(v1-v0)/DT);
    if(m.hold[i]&&i%6===0){const c=i*DT,st=penState(c,T.relay?0:k),L=(TOOL_LEN[st.tool]||560)*SS*toolK(cfg,st.tool),b=holdBody(st.stand||[st.x,st.y],u,L,m.sid[i]),d=Math.hypot(b[0]-m.bx[i],b[1]-m.by[i]);nh++;{const fa=m.fac[i],sd=m.sid[i],a=toolAng(sd),w=st.kind==='air'&&st.tf!=null?Math.pow(Math.sin(Math.PI*clamp(st.tf,0,1)),.8):0,hx=m.bx[i]-.3*u*sd-Math.cos(a)*L*.62,hy=m.by[i]-.05*u-Math.sin(a)*L*.62,tx=lerp(st.x,hx,w),ty=lerp(st.y,hy,w),px=tx+Math.cos(a)*L*.58,py=ty+Math.sin(a)*L*.58,fv=fa<0?-1:1,R=Math.hypot(px-(m.bx[i]-.09*u*fv),py-(m.by[i]-.06*u));rmax=Math.max(rmax,R);if(Math.max(py,ty+Math.sin(a)*L*.74)-m.by[i]>.16*u)nlow++;if(R>.65*u){nc++;if(ev.length<14&&(!ev.length||c-ev[ev.length-1][0]>1))ev.push([+c.toFixed(1),+(R/u).toFixed(2),st.kind,st.tf==null?-1:+st.tf.toFixed(2)])}}if(d>.3*u)nb++;if(d>lag){lag=d;lagT=c}}}
    return{vmax:+(vmax/u).toFixed(2),amax:+(amax/u).toFixed(1),lag:+(lag/u).toFixed(2),lagT:+lagT.toFixed(1),facingRight:+(m.fac.filter(v=>v<0).length/m.fac.length).toFixed(3),rightAt:(()=>{const r=[];for(let i=1;i<m.fac.length&&r.length<6;i++)if(m.fac[i]<-.9&&m.fac[i-1]>=-.9)r.push(+(i*DT+.3).toFixed(1));return r})(),rightTool:(()=>{const r=[];for(let i=1;i<m.sid.length&&r.length<4;i++)if(m.sid[i]<-.99&&m.hold[i]&&!(m.sid[i-1]<-.99&&m.hold[i-1]))r.push(+(i*DT+1.5).toFixed(1));return r})(),swaps:(()=>{let t=0;for(let i=1;i<m.sid.length;i++)if((m.sid[i]<0)!==(m.sid[i-1]<0))t++;return t})(),turns:(()=>{let t=0;for(let i=1;i<m.fac.length;i++)if((m.fac[i]<0)!==(m.fac[i-1]<0))t++;return t})(),moods:[0,1,2,3,4].map(q=>+(m.mood.filter(v=>v===q).length*DT).toFixed(1)),rests:m.rests.map(q=>+q[0].toFixed(1)),gazeMax:+Math.max(...m.gzx.map(Math.abs)).toFixed(2),leanMax:+Math.max(...m.lean.map(Math.abs)).toFixed(2),sqMax:+Math.max(...m.sq).toFixed(3),tailMax:+Math.max(...m.tail.map(Math.abs)).toFixed(2),swMax:+(Math.max(...m.swx.map(Math.abs))/u).toFixed(3),bad:nb+"/"+nh,clamped:nc,pawsLow:nlow,reachMax:+(rmax/u).toFixed(2),ev}})}
/* debug: how the drawn tool tip of cat k moves (with the carry blend): the biggest frame-to-frame change of velocity */
export function tipJerk(k,a,b,noCarry){const T=C.tab;if(!T)return null;const cfg=ADD.cfg.cat,u=catH(cfg),m=T.cats[k||0];let p0=null,p1=null,worst=0,wt=0,n=0;
  for(let c=a;c<b;c+=DT){const i=Math.min(T.N-1,Math.round(c/DT)),st=penState(c,T.relay?0:k||0),fa=m.fac[i],an=toolAng(fa),L=(TOOL_LEN[st.tool]||560)*SS*toolK(cfg,st.tool),w=noCarry||st.tf==null?0:Math.pow(Math.sin(Math.PI*clamp(st.tf,0,1)),.8),
    p=[lerp(st.x,m.bx[i]-.3*u*fa-Math.cos(an)*L*.62,w),lerp(st.y,m.by[i]-.05*u-Math.sin(an)*L*.62,w)];
    if(p1&&p0){const j=Math.hypot(p[0]-2*p1[0]+p0[0],p[1]-2*p1[1]+p0[1])/u;if(j>.02)n++;if(j>worst){worst=j;wt=c}}p0=p1;p1=p}
  return{worst:+worst.toFixed(3),at:+wt.toFixed(2),over:n}}
/* debug: how often a cat paints right under another one (its tip inside the other's footprint), share of painting frames */
export function underFeet(){const T=C.tab;if(!T||T.n<2)return null;const u=catH(ADD.cfg.cat);let bad=0,all=0;const ev=[];
  for(let i=0;i<T.N;i+=3){const c=i*DT;for(let k=0;k<T.n;k++){if(!T.cats[k].hold[i])continue;const st=penState(c,T.relay?0:k);if(st.kind!=='run'&&st.kind!=='trace')continue;all++;
    for(let j=0;j<T.n;j++){if(j===k)continue;const m=T.cats[j],dx=st.x-m.bx[i],dy=st.y-m.by[i];if(Math.abs(dx)<.28*u&&dy>-.35*u&&dy<.5*u){bad++;if(ev.length<8)ev.push(+c.toFixed(1));break}}}}
  return{share:+(bad/Math.max(1,all)).toFixed(4),bad,all,ev}}
/* debug: the walks between zones (time spent moving, distance in cat heights, speed) and the waits */
export function catWalks(){if(!plan||!plan.tracks)return null;const u=catH(ADD.cfg.cat),out=[];let waits=0,wn=0;
  plan.tracks.forEach(T=>T.forEach((r,j)=>{if(!j)return;const p=T[j-1],e=p.legs[p.legs.length-1].p1,q=r.legs[0].p0,d=Math.hypot(q[0]-e[0],q[1]-e[1])/u,mv=r.travel-(r.rest||0)-(r.wait||0);if(r.wait){waits+=r.wait;wn++}out.push([+mv.toFixed(2),+d.toFixed(2),+(d/Math.max(.05,mv)).toFixed(2)])}));
  out.sort((a,b)=>b[0]-a[0]);const order=plan.tracks.map(T=>{const seen=new Set();let back=0,sw=0;T.forEach((r,j)=>{if(j&&T[j-1].i!==r.i){sw++;if(seen.has(r.i))back++}seen.add(r.i)});return{units:T.length,switches:sw,revisits:back}});
  const ks=plan.order.map(r=>r.k0==null?0:r.k0);let inv=0,disp=0;for(let x=1;x<ks.length;x++)if(ks[x]<ks[x-1])inv++;ks.forEach((v,x)=>disp+=Math.abs(v-x));return{order,outOfOrder:inv,displace:+(disp/Math.max(1,ks.length)).toFixed(1),longest:out.slice(0,6),slowest:out.filter(w=>w[1]>.5).sort((a,b)=>a[2]-b[2]).slice(0,4),waits:+waits.toFixed(1),wn}}
/* debug: how often the tip of the filmed cat's tool is out of the picture (cat close-up camera) */
export function camCheck(){const T=C.tab,cfg=ADD.cfg.cat;if(!T)return null;let out=0,all=0;const ev=[];
  for(let i=0;i<T.N;i+=6){const k=T.camK[i],c=i*DT;if(k<0||!T.cats[k].hold[i]||c>=T.F)continue;const st=penState(c,T.relay?0:k);if(st.kind!=='run'&&st.kind!=='trace'&&st.kind!=='link')continue;const fo=focus(cfg,c);if(!fo)continue;all++;
    const s=viewFit()*fo[2],hw=view.W/s/2,hh=view.H/s/2;if(Math.abs(st.x-fo[0])>hw*.95||Math.abs(st.y-fo[1])>hh*.95){out++;if(ev.length<10&&(!ev.length||c-ev[ev.length-1][0]>.5))ev.push([+c.toFixed(1),st.kind,+(Math.abs(st.x-fo[0])/hw).toFixed(2),+(Math.abs(st.y-fo[1])/hh).toFixed(2)])}}
  return{share:+(out/Math.max(1,all)).toFixed(4),out,all,ev}}
export function catStats(){return C.tab?{cats:C.tab.n,relay:C.tab.relay,prints:C.tab.prints.length,F:+C.tab.F.toFixed(2),Fv:plan&&plan.vOf?+plan.vOf(C.tab.F).toFixed(2):null,sleep:C.tab.cats.map(m=>m.sleepAt>=0&&plan.vOf?+plan.vOf(m.sleepAt).toFixed(2):-1),done:C.tab.cats.map(m=>+plan.vOf(m.done).toFixed(2)),meows:C.tab.meows.length,firstPrints:C.tab.prints.slice(0,3).map(p=>+p.t.toFixed(2)),list:C.tab.prints.slice(0,40).map(p=>[+p.t.toFixed(2),Math.round(p.x),Math.round(p.y),+p.k.toFixed(2)])}:null}
