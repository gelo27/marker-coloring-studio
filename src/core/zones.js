import {IMP,S,SHADE} from './settings.js';
import {SS,clamp,colDist,hex,hex2hsl,hsl2hex,lighten,mk,rgbHex,rngOf} from './utils.js';
import {DEMO_COLORS,DEMO_GROUP,DEMO_ORDER,DEMO_ZOOM} from '../data/demoArt.js';
import {regionMask} from '../render/paint.js';
/* ================= ZONES (user-editable settings) ================= */
export const DEFAULT_PALETTES=[
  ['#FF8FAB','#FFC2D1','#FFD25E','#9BE3C3','#7CC8F0','#B49CF2','#F7A072','#FFE08A','#8ED1B2','#E98AC6'],
  ['#F4A6B8','#F9D27D','#A7D8DE','#B8A1E3','#F08D7E','#C4E3A1','#7FB8E8','#FFCBA4','#E7A3D6','#94D1BE']
];
export let art,seg,zones=[],zoneByI=new Map(),palette=[],palSeed=1;
export function pageArea(){return seg.W*seg.H}
/* the paper round the drawing is not a zone. A region touching the page edge is that margin when it is bare paper in a
   coloured source, or, on a black-and-white page, when it runs along most of the edge (a framed drawing); the sky, ground
   and objects of a full-bleed picture also reach the edge, but only along part of it */
export function isMargin(r){
  if(!r.edge)return r.area>=pageArea()*.6;
  if(art.colored&&r.paper!=null)return r.paper>.5;
  return r.bord>.6||r.area>=pageArea()*.6}
export function initZones(){
  const minArea=(IMP.minArea||95)*SS*SS,rnd=rngOf(4242);
  // zones painted by hand are always kept, whatever their size or position
  let regs=seg.regs.filter(r=>r.user?r.area>=16:r.area>=minArea);
  if(art.demo)regs=regs.filter(r=>r.user||(r.id&&DEMO_COLORS[r.id]));
  else regs=regs.filter(r=>r.user||!isMargin(r));
  zones=[];zoneByI=new Map();
  const big=art.demo?null:regs.slice().sort((a,b)=>b.area-a.area)[0];
  regs.forEach((r,k)=>{
    const z={i:r.i,r,skip:false,close:'auto',zoom:null,speed:'auto',hue:hsl2hex(((k*0.61803)%1),.68,.72)};
    r.isBg=art.demo?r.id==='bg':(r===big&&r.area>pageArea()*.18);
    if(art.demo){z.color=DEMO_COLORS[r.id]||'#FF8FAB';r.group=DEMO_GROUP[r.id]||'deco'}
    // automatic (random) defaults
    const bw=r.x1-r.x0+1,bh=r.y1-r.y0+1,frac=r.area/pageArea();
    if(art.demo){const g=r.group;z.aClose=!!DEMO_ZOOM[g]&&DEMO_ZOOM[g]>=1.6;z.aZoom=DEMO_ZOOM[g]||1.3;z.aFast=g==='bg'||(g==='liner'&&rnd()<.5)||(g==='frost'&&rnd()<.35)}
    else{const fit=clamp(.5*Math.min(seg.W/bw,seg.H/bh),1.5,3.4);z.aClose=!r.isBg&&frac<.06&&rnd()<.62;z.aZoom=+(fit*(.9+rnd()*.2)).toFixed(1);z.aFast=r.isBg||(frac>.01&&rnd()<.3)}
    zones.push(z);zoneByI.set(r.i,z);
  });
  if(art.demo)palette=[...new Set(Object.values(DEMO_COLORS))];
  else{palette=DEFAULT_PALETTES[0].slice();applyPalette(1)}
}
export function applyPalette(seed){
  if(!palette.length)return;const rnd=rngOf(seed*977+13);let prev=null;
  orderedZones().forEach(z=>{let c;let tries=0;do{c=palette[Math.floor(rnd()*palette.length)];tries++}while(c===prev&&palette.length>1&&tries<6);z.color=c;z.flat=true;prev=c;if(z.r.isBg&&!art.demo)z.color=lighten(c,.72)});
}
/* companion shades a liquid zone is marbled with: a neighbouring hue and a lighter/deeper tint */
export function liqShades(c,i){const[h,s,l]=hex2hsl(c),sg=(i*7919%2)?1:-1;
  return[hsl2hex((h+sg*(.07+.03*((i*13)%3))+1)%1,clamp(s*1.08+.05,0,1),clamp(l*.9-.02,.12,.85)),hsl2hex((h-sg*.035+1)%1,clamp(s*.95,0,1),clamp(l+(l<.6?.16:-.18),.1,.92))]}
export const zClose=z=>z.close==='auto'?z.aClose:z.close==='on';
export const zZoom=z=>z.zoom!=null?z.zoom:z.aZoom;
export const zFast=z=>z.speed==='auto'?z.aFast:z.speed==='fast';
export const zCut=z=>z.speed==='cut'&&!S.noCuts;  // without cuts such a zone is simply painted
export let customOrder=null,orderMode='auto';
export function presetOrder(kind){
  if(kind==='groups')return groupedOrder('light');
  const list=zones.slice(),bg=list.filter(z=>z.r.isBg),rest=list.filter(z=>!z.r.isBg),cx=seg.W/2,cy=seg.H/2;
  const by=f=>rest.sort((a,b)=>f(a.r)-f(b.r));
  if(kind==='top')by(r=>r.cy*4+r.cx);else if(kind==='bottom')by(r=>-r.cy*4+r.cx);else if(kind==='left')by(r=>r.cx*4+r.cy);
  else if(kind==='center')by(r=>Math.hypot(r.cx-cx,r.cy-cy));else if(kind==='big')return list.sort((a,b)=>b.r.area-a.r.area).map(z=>z.i);
  else if(kind==='small')by(r=>r.area);
  else if(kind==='color'){const pi=c=>{const k=palette.indexOf(c);return k<0?999:k};rest.sort((a,b)=>pi(a.color)-pi(b.color)||a.color.localeCompare(b.color)||a.r.cy-b.r.cy)}
  return rest.concat(bg).map(z=>z.i);
}
export function orderedZones(){
  const auto=autoOrderZones();if(!customOrder)return auto;
  const set=new Set(customOrder),out=customOrder.map(i=>zoneByI.get(i)).filter(Boolean);
  auto.forEach(z=>{if(!set.has(z.i))out.push(z)});return out;
}
/* nearest-neighbour path through zones (starting top-left, or from a point), so the hand never jumps across the page */
export function nnPath(arr,start){const out=[];let cur=start;const rest=arr.slice();while(rest.length){let bi=0,bd=1e18;for(let i=0;i<rest.length;i++){const r=rest[i].r;const d=cur?Math.hypot(r.cx-cur.x,r.cy-cur.y):r.cy*3+r.cx;if(d<bd){bd=d;bi=i}}const z=rest.splice(bi,1)[0];out.push(z);cur={x:z.r.cx,y:z.r.cy}}return out}
export function autoOrderZones(){
  const list=zones.slice();
  let out=[],cur=null;
  if(art.demo){DEMO_ORDER.forEach(g=>{const o=nnPath(list.filter(z=>z.r.group===g),cur);if(o.length){cur={x:o[o.length-1].r.cx,y:o[o.length-1].r.cy};out.push(...o)}})}
  else{const bands=4,bh=seg.H/bands,by=[];list.filter(z=>!z.r.isBg).forEach(z=>{const b=Math.min(bands-1,Math.floor(z.r.cy/bh));(by[b]=by[b]||[]).push(z)});
    by.forEach(l=>{if(!l)return;const o=nnPath(l,cur);if(o.length){cur={x:o[o.length-1].r.cx,y:o[o.length-1].r.cy};out.push(...o)}});out.push(...list.filter(z=>z.r.isBg))}
  return out;
}
/* ---- colour groups: zones sharing a colour are painted together, like picking up one marker at a time ---- */
const lumHex=c=>{const n=hex(c);return(((n>>16)&255)*.3+((n>>8)&255)*.59+(n&255)*.11)/255};
/* one marker per family of close shades: colours taken from a picture give nearly every zone its own shade (a pumpkin
   a touch redder than its neighbour), but a hand would colour them all with the same orange. The largest zones set the
   marker colours; every zone joins the nearest marker within the tolerance */
const MARKER_TOL=35;
function markerOf(){const reps=[],m=new Map();
  zones.slice().sort((a,b)=>b.r.area-a.r.area).forEach(z=>{let b=null,bd=MARKER_TOL;reps.forEach(c=>{const d=colDist(c,z.color);if(d<bd){bd=d;b=c}});if(!b){b=z.color;reps.push(b)}m.set(z,b)});return m}
/* groups (markers) in the order they appear in a zone list */
export function colorGroups(list){const mk=markerOf(),m=new Map();(list||orderedZones()).forEach(z=>{const c=mk.get(z)||z.color,k=c.toLowerCase();if(!m.has(k))m.set(k,{color:c,zs:[]});m.get(k).zs.push(z)});return[...m.values()]}
export const GROUP_RULES={light:'Від світлих до темних',dark:'Від темних до світлих',top:'Зверху вниз',big:'Більші групи спершу',count:'Де більше зон — спершу'};
/* how far the pen is from a zone (0 inside its box) and the gap between two zones' boxes */
const ptGap=(p,r)=>Math.hypot(Math.max(0,r.x0-p.x,p.x-r.x1),Math.max(0,r.y0-p.y,p.y-r.y1));
const boxGap=(a,b)=>Math.hypot(Math.max(0,a.x0-b.x1,b.x0-a.x1),Math.max(0,a.y0-b.y1,b.y0-a.y1));
/* the hand's way through the zones of one marker: it starts at the zone nearest the pen, always goes on to the nearest
   unpainted one (by the gap between them, so a neighbour across a thin line counts as next door), and the path is then
   untangled (2-opt): a nearest-neighbour walk leaves stragglers that it fetches with long jumps back across the page */
export function routeZones(zs,start){
  if(zs.length<2)return zs.slice();
  const n=zs.length,rest=zs.slice(),o=[];let p=start||{x:0,y:0},prev=null;
  while(rest.length){let bi=0,bd=1e18;rest.forEach((z,k)=>{const d=(prev?boxGap(prev.r,z.r):ptGap(p,z.r))+.25*Math.hypot(z.r.cx-p.x,z.r.cy-p.y);if(d<bd){bd=d;bi=k}});
    prev=rest.splice(bi,1)[0];o.push(prev);p={x:prev.r.cx,y:prev.r.cy}}
  const dist=(a,b)=>boxGap(a.r,b.r)+.25*Math.hypot(a.r.cx-b.r.cx,a.r.cy-b.r.cy);
  // the first zone stays (it is where the pen is), the end is free
  for(let pass=0,better=true;better&&pass<40;pass++){better=false;
    for(let i=0;i<n-2;i++)for(let j=i+2;j<n;j++){const a=o[i],b=o[i+1],c=o[j],d=j+1<n?o[j+1]:null;
      const was=dist(a,b)+(d?dist(c,d):0),now=dist(a,c)+(d?dist(b,d):0);
      if(now<was-1e-6){for(let x=i+1,y=j;x<y;x++,y--){const t=o[x];o[x]=o[y];o[y]=t}better=true}}}
  return o}
/* order by colour groups, the way a person colours a page: picks up one marker, colours every zone of that colour
   (walking the shortest way between them), puts it down and takes the next one. A marker is picked up once. The rule
   (light to dark, top down...) sets the queue of markers; the hand may take one of the next few markers out of turn
   when it starts much closer to where the pen is, the way you reach for the colour of the part right under your hand.
   Background last. */
export function groupedOrder(rule){
  const bg=zones.filter(z=>z.r.isBg),gs=colorGroups(zones.filter(z=>!z.r.isBg));if(!gs.length)return routeZones(bg,null).map(z=>z.i);
  const D=Math.hypot(seg.W,seg.H),area=g=>g.zs.reduce((a,z)=>a+z.r.area,0),top=g=>Math.min(...g.zs.map(z=>z.r.cy));
  const key={light:g=>-lumHex(g.color),dark:g=>lumHex(g.color),top,big:g=>-area(g),count:g=>-g.zs.length}[rule]||(g=>-lumHex(g.color));
  gs.sort((a,b)=>key(a)-key(b)||top(a)-top(b));
  const m=markerRun(gs,true);return m.zs.concat(routeZones(bg,m.pen)).map(z=>z.i);
}
/* zones of the markers in the given queue; with `free`, each next marker is the best of the first three still waiting:
   its distance from the pen counts against its place in the queue (each step back in the queue costs 9% of the page).
   The marker at the head of the queue is passed over twice at most, so no colour drifts far from its turn */
function markerRun(gs,free){const q=gs.slice(),out=[],D=Math.hypot(seg.W,seg.H);let cur={x:0,y:0},passed=0;
  while(q.length){let bi=0;
    if(free&&passed<2){let bc=1e18;for(let k=0;k<Math.min(3,q.length);k++){let d=1e18;q[k].zs.forEach(z=>{d=Math.min(d,ptGap(cur,z.r))});const c=d/D+.09*k;if(c<bc){bc=c;bi=k}}}
    passed=bi?passed+1:0;
    const o=routeZones(q.splice(bi,1)[0].zs,cur),l=o[o.length-1].r;cur={x:l.cx,y:l.cy};out.push(...o)}
  return{zs:out,pen:cur}}
/* moves whole colour groups; `colors` is the list of colours in the new order (each group is walked again from
   where the previous one ended) */
export function orderFromGroups(colors){const gs=colorGroups(),by=new Map(gs.map(g=>[g.color.toLowerCase(),g]));
  return markerRun(colors.map(c=>by.get(c.toLowerCase())).filter(Boolean),false).zs.map(z=>z.i)}
export function syncLk(z){const want=(SHADE.on&&z.tones&&!z.flat)?0:-1;if(z.r.lk!==want)z.r.lk=want}
/* recolouring keeps the zone's own shadows and highlights: they follow the new base colour */
export function setZoneColor(z,c){z.color=c}
/* colour of tone k of a zone (0 = base): the original tone, moved by the same hue/lightness shift as the base */
export function zoneTone(z,k){const t=z.tones&&z.tones[k];if(!t||!k)return z.color;const B=z.tones[0];if(z.color.toLowerCase()===B.toLowerCase())return t;
  const[bh,bs,bl]=hex2hsl(B),[th,ts,tl]=hex2hsl(t),[nh,ns,nl]=hex2hsl(z.color);
  const l=tl<=bl?nl*tl/Math.max(.02,bl):nl+(1-nl)*(tl-bl)/Math.max(.02,1-bl),s=bs>.05?ns*ts/bs:ns;
  return hsl2hex((nh+th-bh+2)%1,clamp(s,0,1),clamp(l,0,1))}
/* Reads a coloured reference: for every zone finds its tones and what each one is. The dominant tone is the base
   (painted over the whole zone except white paper highlights), darker tones become shadow layers (lighter shadows
   first, each layer is its tone plus every darker one), lighter tones become highlight layers painted last.
   Tones come from a histogram of the zone away from the outline, refined with a few k-means passes; per-pixel
   labels are smoothed by a majority filter and specks of a few page pixels are merged into their neighbours. */
export function applySrcColors(src){
  const W=seg.W,H=seg.H;let cv=src;
  if(!src.getContext||src.width!==W||src.height!==H){cv=mk(W,H);const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,W,H);c.drawImage(src,0,0,W,H)}
  const d=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H).data,lab=seg.lab,isL=seg.isLine,rank=seg.rank,Z=zones.length;
  rank.fill(0);zones.forEach(z=>{z.tones=null;z.flat=false;z.r.layers=null;z.r.lk=-1;z.r.pArea=0});
  const zi=new Int32Array(seg.regs.length+2).fill(-1);zones.forEach((z,k)=>zi[z.i]=k);
  const NB=4096,hist=new Uint32Array(Z*NB),e=2*SS;
  for(let y=e;y<H-e;y+=2)for(let x=e;x<W-e;x+=2){const p=y*W+x,k=zi[lab[p]];if(k<0)continue;if(isL[p-e]||isL[p+e]||isL[p-e*W]||isL[p+e*W])continue;const j=p*4;hist[k*NB+((d[j]>>4)<<8|(d[j+1]>>4)<<4|(d[j+2]>>4))]++}
  const lumOf=c=>(c[0]*.3+c[1]*.59+c[2]*.11)/255,satOf=c=>{const mx=Math.max(c[0],c[1],c[2]),mn=Math.min(c[0],c[1],c[2]);return mx>0?(mx-mn)/mx:0};
  const isPaper=c=>lumOf(c)>.9&&satOf(c)<.08,binC=bi=>[((bi>>8)&15)*16+8,((bi>>4)&15)*16+8,(bi&15)*16+8];
  const pal=[];let n=0,blank=0,shaded=0;
  const addPal=c=>{if(!pal.some(p=>colDist(p,c)<22))pal.push(c)};
  const N4=[[1,0],[-1,0],[0,1],[0,-1]];
  zones.forEach((z,k)=>{
    const o=k*NB,bins=[];let tot=0;for(let i=0;i<NB;i++){const c=hist[o+i];if(c){tot+=c;bins.push(i)}}
    if(!tot)return;
    bins.sort((a,b)=>hist[o+b]-hist[o+a]);
    const cl=[];
    for(const bi of bins){const c=hist[o+bi],[R,G,B]=binC(bi);let best=null,bd=1e9;
      for(const q of cl){const dd=Math.hypot(q.r/q.n-R,q.g/q.n-G,q.b/q.n-B);if(dd<bd){bd=dd;best=q}}
      const lt=(R+G+B)/765,thr=lt>.82?16:lt>.65?24:34;
      if(best&&bd<thr){best.r+=R*c;best.g+=G*c;best.b+=B*c;best.n+=c}else cl.push({r:R*c,g:G*c,b:B*c,n:c})}
    let keep=cl.filter(q=>q.n>=Math.max(tot*.02,24)).sort((a,b)=>b.n-a.n).slice(0,5);if(!keep.length)keep=[cl[0]];
    let T=keep.map(q=>[q.r/q.n,q.g/q.n,q.b/q.n]),wt=keep.map(q=>q.n);
    // k-means over the histogram: the greedy clusters drift towards their first bins, this pulls them to the true means
    for(let it=0;it<4&&T.length>1;it++){const acc=T.map(()=>[0,0,0,0]);
      for(const bi of bins){const c=hist[o+bi],q=binC(bi);let bc=0,bd=1e9;for(let j=0;j<T.length;j++){const t=T[j],dd=(t[0]-q[0])**2+(t[1]-q[1])**2+(t[2]-q[2])**2;if(dd<bd){bd=dd;bc=j}}const a=acc[bc];a[0]+=q[0]*c;a[1]+=q[1]*c;a[2]+=q[2]*c;a[3]+=c}
      const ok=acc.filter(a=>a[3]>=Math.max(tot*.015,16));T=ok.map(a=>[a[0]/a[3],a[1]/a[3],a[2]/a[3]]);wt=ok.map(a=>a[3])}
    {const M=[],MW=[];T.forEach((t,j)=>{const m=M.findIndex(q=>Math.hypot(q[0]-t[0],q[1]-t[1],q[2]-t[2])<18);if(m<0){M.push(t);MW.push(wt[j])}else MW[m]+=wt[j]});
     const ix=M.map((_,j)=>j).sort((a,b)=>MW[b]-MW[a]);T=ix.map(j=>M[j])}
    if(!SHADE.on||T.length===1){const c=T[0];if(isPaper(c)){z.skip=true;blank++;return}z.skip=false;z.color=rgbHex(c[0],c[1],c[2]);addPal(z.color);n++;return}
    // per-pixel tone labels inside the zone, then a majority filter so labels form clean shapes
    const r=z.r,bw=r.x1-r.x0+1,bh=r.y1-r.y0+1,nC=T.length,lb=new Int8Array(bw*bh).fill(-1);
    for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const p=(y+r.y0)*W+x+r.x0;if(lab[p]!==r.i)continue;const j=p*4;let bc=0,bd=1e9;
      for(let c=0;c<nC;c++){const t=T[c],dd=(d[j]-t[0])**2+(d[j+1]-t[1])**2+(d[j+2]-t[2])**2;if(dd<bd){bd=dd;bc=c}}lb[y*bw+x]=bc}
    const Rr=Math.round(1.5*SS),out=lb.slice(),best=new Float32Array(bw*bh),I=new Int32Array((bw+1)*(bh+1));
    for(let c=0;c<nC;c++){
      for(let y=0;y<bh;y++){let row=0;for(let x=0;x<bw;x++){row+=lb[y*bw+x]===c?1:0;I[(y+1)*(bw+1)+x+1]=I[y*(bw+1)+x+1]+row}}
      for(let y=0;y<bh;y++){const y0=Math.max(0,y-Rr),y1=Math.min(bh,y+Rr+1);for(let x=0;x<bw;x++){const q=y*bw+x;if(lb[q]<0)continue;const x0=Math.max(0,x-Rr),x1=Math.min(bw,x+Rr+1);
        const sm=I[y1*(bw+1)+x1]-I[y0*(bw+1)+x1]-I[y1*(bw+1)+x0]+I[y0*(bw+1)+x0];if(sm>best[q]){best[q]=sm;out[q]=c}}}}
    // specks: islands smaller than a few page pixels take the label that surrounds them most
    {const minIsl=Math.pow(3.5*SS,2),seen=new Uint8Array(bw*bh),stk=[],comp=[];
     for(let q0=0;q0<out.length;q0++){if(out[q0]<0||seen[q0])continue;const lbl=out[q0],nb=new Map();comp.length=0;stk.length=0;stk.push(q0);seen[q0]=1;
       while(stk.length){const q=stk.pop();comp.push(q);const x=q%bw,y=(q-x)/bw;
         for(const[dx,dy]of N4){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=bw||Y>=bh)continue;const p=Y*bw+X,l2=out[p];if(l2<0)continue;if(l2===lbl){if(!seen[p]){seen[p]=1;stk.push(p)}}else nb.set(l2,(nb.get(l2)||0)+1)}}
       if(comp.length<minIsl&&nb.size){let bl=-1,bv=0;nb.forEach((v,l)=>{if(v>bv){bv=v;bl=l}});for(const q of comp)out[q]=bl}}}
    const cnt=new Float64Array(nC);for(let q=0;q<out.length;q++)if(out[q]>=0)cnt[out[q]]++;
    const tones=T.map((c,i)=>({i,c,lum:lumOf(c),paper:isPaper(c),n:cnt[i]})).filter(t=>t.n>0);
    const painted=tones.filter(t=>!t.paper);
    if(!painted.length){z.skip=true;blank++;return}
    const base=painted.reduce((a,b)=>b.n>a.n?b:a);
    const shadows=painted.filter(t=>t!==base&&t.lum<=base.lum).sort((a,b)=>b.lum-a.lum),highs=painted.filter(t=>t!==base&&t.lum>base.lum).sort((a,b)=>a.lum-b.lum);
    // rank: -1 paper (left white), 0 base, 1.. shadows from light to dark, 10.. highlights from the base towards white
    const rk=new Int8Array(nC).fill(-1);rk[base.i]=0;shadows.forEach((t,j)=>rk[t.i]=1+j);highs.forEach((t,j)=>rk[t.i]=10+j);
    let pA=0;for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const q=y*bw+x;if(out[q]<0)continue;const v=rk[out[q]];rank[(y+r.y0)*W+x+r.x0]=v;if(v>=0)pA++}
    const hx=t=>rgbHex(t.c[0],t.c[1],t.c[2]);
    z.skip=false;z.color=hx(base);z.tones=[base,...shadows,...highs].map(hx);r.pArea=pA;
    z.tones.forEach(addPal);n++;
    const layers=[],mkLayer=(lk,tidx,mem,pf)=>{let a=0,x0=1e9,y0=1e9,x1=-1,y1=-1,sx=0,sy=0,sxx=0,syy=0,sxy=0;
      for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const q=y*bw+x;if(out[q]<0||!mem(rk[out[q]]))continue;const X=x+r.x0,Y=y+r.y0;a++;if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y;sx+=X;sy+=Y;sxx+=X*X;syy+=Y*Y;sxy+=X*Y}
      if(a<Math.pow(6*SS,2))return;
      const cx=sx/a,cy=sy/a,vxx=sxx/a-cx*cx,vyy=syy/a-cy*cy,vxy=sxy/a-cx*cy;
      layers.push({i:r.i,lk,pf,area:a,x0,y0,x1,y1,cx,cy,edge:false,isBg:false,layerOf:r,tidx,hl:lk>=10,ang:.5*Math.atan2(2*vxy,vxx-vyy),elong:Math.sqrt(Math.pow(vxx-vyy,2)+4*vxy*vxy)/(vxx+vyy+1e-6)})};
    const notHl=p=>rank[p]<10;
    shadows.forEach((t,j)=>mkLayer(1+j,1+j,v=>v>=1+j&&v<10,notHl));
    highs.forEach((t,j)=>mkLayer(10+j,1+shadows.length+j,v=>v>=10+j,null));
    r.layers=layers.length?layers:null;if(shadows.length||highs.length||tones.some(t=>t.paper))shaded++;
  });
  if(pal.length)palette=pal.slice(0,48);
  return{n,blank,shaded};
}
export function composeColored(){const W=seg.W,H=seg.H,cv=mk(W,H),c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,W,H);
  zones.forEach(z=>{const r=z.r;regionMask(r);const t=mk(r.bw,r.bh),x=t.getContext('2d');x.fillStyle=z.color;x.fillRect(0,0,r.bw,r.bh);x.globalCompositeOperation='destination-in';x.drawImage(r.maskCv,0,0);c.drawImage(t,r.bx,r.by)});
  c.globalCompositeOperation='multiply';c.drawImage(art.lineCv,0,0);return cv.toDataURL('image/png')}
export function setArtDoc(a){art=a}
export function setSeg(s){seg=s}
export function setPalette(p){palette=p}
export function nextPalSeed(){return ++palSeed}
export function setCustomOrder(ids,mode){customOrder=ids;orderMode=mode}
