import {SS,TAU,mk} from '../core/utils.js';
/* ================= DEMO PAGE (original artwork) ================= */
export const DEMO_COLORS={
  bg:'#E3D7FB', heart:'#FF8DB0', star:'#FFD45C', dot:'#A9D8F5',
  linerA:'#84CDE6', linerB:'#BFE6F4', band:'#FF9FBC', bow:'#FF6A93', knot:'#E14C7C',
  wafer1:'#FBE2AE', wafer2:'#EC7C90', waferTop:'#C08D5F',
  frost1:'#FFB0C6', frost2:'#FFC4D5', frost3:'#FFD9E4',
  blue:'#6A7BE0', blueCrown:'#39448F', berry2:'#F2525C', leaf2:'#66BE77',
  sprY:'#FFCF5A', sprB:'#6FD3EE', sprP:'#B597F0', sprG:'#84DCA0', fheart:'#FF5A85',
  body:'#F2BC86', feet:'#F2BC86', pad:'#F7A0B4', arm:'#F2BC86',
  berry:'#EF4955', leaf:'#58B56A', ear:'#F2BC86', earIn:'#F8A7B8', head:'#F2BC86',
  muzzle:'#FFEBD3', cheek:'#FF8AA4'
};
export const DEMO_GROUP={
  muzzle:'face',cheek:'face', earIn:'ears', ear:'head',head:'head', berry:'berry',leaf:'berry',
  body:'body',feet:'body',pad:'body',arm:'body', frost1:'frost',frost2:'frost',frost3:'frost',
  sprY:'spr',sprB:'spr',sprP:'spr',sprG:'spr',fheart:'spr', blue:'blue',blueCrown:'blue',berry2:'blue',leaf2:'blue',
  wafer1:'wafer',wafer2:'wafer',waferTop:'wafer', linerA:'liner',linerB:'liner', band:'bow',bow:'bow',knot:'bow',
  heart:'deco',star:'deco',dot:'deco', bg:'bg'
};
export const DEMO_ORDER=['face','ears','head','berry','body','frost','spr','blue','wafer','liner','bow','deco','bg'];
export const DEMO_ZOOM={face:2.7,ears:2.2,berry:2.9,spr:2.6,blue:2.5,wafer:3.1,bow:2.4,deco:2.4,body:1.75,head:1.7};

export function buildDemo(){
  const PW=1080,PH=1400,W=PW*SS,H=PH*SS;
  const cl=mk(W,H),ci=mk(W,H);
  const lc=cl.getContext('2d'),ic=ci.getContext('2d');
  lc.scale(SS,SS);ic.scale(SS,SS);
  lc.lineJoin='round';lc.lineCap='round';lc.strokeStyle='#000';
  const names=[],idx={};
  function idCol(n){if(!(n in idx)){idx[n]=names.length;names.push(n)}return 'rgb('+(idx[n]+1)+',200,100)'}
  function S(name,build,lw){lc.beginPath();build(lc);lc.fillStyle='#fff';lc.fill();lc.lineWidth=lw||7;lc.stroke();ic.beginPath();build(ic);ic.fillStyle=name?idCol(name):'#000';ic.fill()}
  function D(build,lw){lc.beginPath();build(lc);lc.lineWidth=lw||5;lc.stroke()}
  function F(build,col){lc.beginPath();build(lc);lc.fillStyle=col;lc.fill();ic.beginPath();build(ic);ic.fillStyle='#000';ic.fill()}
  const E=(x,y,rx,ry,r)=>c=>c.ellipse(x,y,rx,ry,r||0,0,TAU);
  const C=(x,y,r)=>c=>c.arc(x,y,r,0,TAU);
  function heart(x,y,s,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot||0);c.moveTo(0,.62*s);c.bezierCurveTo(-1.25*s,-.05*s,-.6*s,-1.0*s,0,-.32*s);c.bezierCurveTo(.6*s,-1.0*s,1.25*s,-.05*s,0,.62*s);c.closePath();c.restore()}}
  function star(x,y,r,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot||0);const ri=r*.5;const P=(k,rr)=>{const a=-Math.PI/2+k*TAU/10;return[Math.cos(a)*rr,Math.sin(a)*rr]};let p=P(9,ri);c.moveTo(p[0],p[1]);for(let k=0;k<5;k++){const o=P(2*k,r*1.45),i=P(2*k+1,ri);c.quadraticCurveTo(o[0],o[1],i[0],i[1])}c.closePath();c.restore()}}
  function rrect(x,y,w,h,r){return c=>{c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}}
  function capsule(x,y,len,r,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot);c.moveTo(-len/2,-r);c.lineTo(len/2,-r);c.arc(len/2,0,r,-Math.PI/2,Math.PI/2);c.lineTo(-len/2,r);c.arc(-len/2,0,r,Math.PI/2,Math.PI*1.5);c.closePath();c.restore()}}
  function tier(cx,cy,hw,hh,n){return c=>{const ly=cy+hh*.25;c.moveTo(cx-hw,ly);c.bezierCurveTo(cx-hw*1.02,cy-hh*1.55,cx+hw*1.02,cy-hh*1.55,cx+hw,ly);for(let k=0;k<n;k++){const x0=cx+hw-2*hw*k/n,x1=cx+hw-2*hw*(k+1)/n;const y1=k===n-1?ly:cy+hh*.5;c.quadraticCurveTo((x0+x1)/2,cy+hh*1.35,x1,y1)}c.closePath()}}
  function swirl(cx,cy,hw,hh){return c=>{c.moveTo(cx-hw*.78,cy+hh*.1);c.quadraticCurveTo(cx-hw*.1,cy-hh*.6,cx+hw*.72,cy-hh*.05)}}
  function berryBody(x,y,s,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot);c.moveTo(-.56*s,-.36*s);c.bezierCurveTo(-.78*s,.1*s,-.36*s,.76*s,0,.86*s);c.bezierCurveTo(.36*s,.76*s,.78*s,.1*s,.56*s,-.36*s);c.bezierCurveTo(.36*s,-.62*s,-.36*s,-.62*s,-.56*s,-.36*s);c.closePath();c.restore()}}
  function calyx(x,y,s,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot);c.translate(0,-.43*s);const n=5;for(let k=0;k<n*2;k++){const a=Math.PI*(k/(n*2))*2-Math.PI/2+Math.PI/n/2;const out=k%2===0;const rx=out?.5*s:.13*s,ry=out?.26*s:.08*s;const px=Math.cos(a)*rx,py=Math.sin(a)*ry+(out&&Math.sin(a)>0?.05*s:0);k?c.lineTo(px,py):c.moveTo(px,py)}c.closePath();c.restore()}}
  function stem(x,y,s,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot);c.moveTo(-.05*s,-.47*s);c.quadraticCurveTo(-.07*s,-.72*s,.02*s,-.8*s);c.lineTo(.08*s,-.74*s);c.quadraticCurveTo(.03*s,-.66*s,.06*s,-.47*s);c.closePath();c.restore()}}
  function seeds(x,y,s,rot){return c=>{c.save();c.translate(x,y);c.rotate(rot);const rows=[[-.12,4],[.12,5],[.36,4],[.58,2]];rows.forEach(([ry,n],ri)=>{const half=(ry<.3?.42:.3)*s;for(let i=0;i<n;i++){const px=n===1?0:-half+2*half*i/(n-1)+(ri%2?.04*s:0);const py=ry*s;c.moveTo(px,py-.035*s);c.lineTo(px+.012*s,py+.025*s)}});c.restore()}}
  function strawberry(x,y,s,rot,bn,ln){S(bn,berryBody(x,y,s,rot));D(seeds(x,y,s,rot),4.5);S(ln,stem(x,y,s,rot),6);S(ln,calyx(x,y,s,rot),6)}
  S('bg',rrect(40,40,1000,1320,40),7);
  [[150,250,40,-.2],[930,330,36,.25],[112,630,32,-.15],[972,640,30,.2],[122,1205,34,-.2],[958,1215,36,.15]].forEach(h=>S('heart',heart(h[0],h[1],h[2],h[3]),6));
  [[190,118,34,.1],[880,122,32,-.15],[90,900,30,.2],[992,905,30,-.1],[205,1298,28,.15],[895,1302,28,-.2]].forEach(s=>S('star',star(s[0],s[1],s[2],s[3]),6));
  [[330,128,9],[730,176,8],[80,420,8],[1000,470,8],[1000,1050,8],[78,1060,8]].forEach(d=>S('dot',C(d[0],d[1],d[2]),5));
  const ytop=930,ybot=1300,xt0=175,xt1=905,xb0=255,xb1=825,N=9;
  const yb=x=>ybot+16*(1-Math.pow((x-540)/285,2));
  for(let k=0;k<N;k++){const a=xt0+(xt1-xt0)*k/N,b=xt0+(xt1-xt0)*(k+1)/N,ba=xb0+(xb1-xb0)*k/N,bb=xb0+(xb1-xb0)*(k+1)/N;
    S(k%2?'linerB':'linerA',c=>{c.moveTo(a,ytop);c.quadraticCurveTo((a+b)/2,ytop-30,b,ytop);c.lineTo(bb,yb(bb));c.lineTo(ba,yb(ba));c.closePath()})}
  const xl=y=>xt0+(xb0-xt0)*(y-ytop)/(ybot-ytop),xr=y=>xt1-(xt1-xb1)*(y-ytop)/(ybot-ytop);
  S('band',c=>{c.moveTo(xl(1000),1000);c.quadraticCurveTo(540,1020,xr(1000),1000);c.lineTo(xr(1062),1062);c.quadraticCurveTo(540,1082,xl(1062),1062);c.closePath()});
  const bowTail=m=>c=>{c.moveTo(540+m*-12,1050);c.lineTo(540+m*-70,1140);c.lineTo(540+m*-46,1131);c.lineTo(540+m*-34,1156);c.lineTo(540+m*10,1060);c.closePath()};
  S('bow',bowTail(1));S('bow',bowTail(-1));
  const loop=m=>c=>{c.moveTo(540-m*8,1034);c.bezierCurveTo(540-m*40,990,540-m*112,962,540-m*118,1000);c.bezierCurveTo(540-m*124,1048,540-m*72,1086,540-m*8,1046);c.closePath()};
  S('bow',loop(1));S('bow',loop(-1));
  D(c=>{c.moveTo(512,1028);c.quadraticCurveTo(470,1000,452,1010)});D(c=>{c.moveTo(568,1028);c.quadraticCurveTo(610,1000,628,1010)});
  S('knot',rrect(516,1014,48,52,16));
  {const bx=735,by=640,tx=815,ty=400,L=Math.hypot(tx-bx,ty-by),dx=(tx-bx)/L,dy=(ty-by)/L,nx=-dy,ny=dx;
   const P=(s,w)=>[bx+dx*s+nx*w,by+dy*s+ny*w];const n=7,end=L-6;
   for(let k=0;k<n;k++){const s0=-40+(end+40)*k/n,s1=-40+(end+40)*(k+1)/n;const sl0=k===0?0:9,sl1=k===n-1?0:9;
     S(k%2?'wafer2':'wafer1',c=>{let p=P(s0-sl0,-19);c.moveTo(p[0],p[1]);p=P(s1-sl1,-19);c.lineTo(p[0],p[1]);p=P(s1+sl1,19);c.lineTo(p[0],p[1]);p=P(s0+sl0,19);c.lineTo(p[0],p[1]);c.closePath()},6)}
   const cp=P(end,0);S('waferTop',E(cp[0],cp[1],19,8,Math.atan2(ny,nx)),6)}
  S('frost1',tier(540,830,400,110,7));D(swirl(540,830,400,110));
  S('frost2',tier(540,700,315,95,6));D(swirl(540,700,315,95));
  S('frost3',tier(540,592,215,80,5));D(swirl(540,592,215,80));
  [[372,600,10],[712,612,10]].forEach((d,i)=>S(i?'sprB':'sprY',C(d[0],d[1],d[2]),5));
  S('sprP',capsule(450,746,22,8,.5),5);S('sprG',C(612,752,10),5);S('sprY',capsule(690,728,22,8,-.6),5);S('sprB',C(240,712,9),5);
  S('fheart',heart(330,688,34,-.25),6);
  S('sprB',capsule(392,900,24,8,-.4),5);S('sprP',C(520,912,10),5);S('sprG',capsule(645,905,22,8,.7),5);S('sprY',C(735,880,10),5);S('sprP',C(452,860,9),5);
  strawberry(800,708,62,.38,'berry2','leaf2');
  [[205,812,36],[276,872,30],[812,872,34],[872,815,27]].forEach(b=>{S('blue',C(b[0],b[1],b[2]),6);S('blueCrown',star(b[0]+b[2]*.15,b[1]-b[2]*.2,b[2]*.27,.3),4.5)});
  S('body',E(540,565,132,98));
  strawberry(540,528,96,-.1,'berry','leaf');
  [[458,640],[622,640]].forEach(f=>{S('feet',E(f[0],f[1],54,38));S('pad',E(f[0],f[1]+6,23,16),5);[[-21,-18],[0,-25],[21,-18]].forEach(o=>S('pad',C(f[0]+o[0],f[1]+o[1],7.5),4.5))});
  S('arm',E(450,522,38,30,.6));S('arm',E(630,522,38,30,-.6));
  [[418,205],[662,205]].forEach(e=>S('ear',C(e[0],e[1],60)));
  [[424,212],[656,212]].forEach(e=>S('earIn',C(e[0],e[1],32),6));
  S('head',E(540,325,180,150));
  D(c=>{c.moveTo(522,180);c.quadraticCurveTo(536,160,552,178)},5);
  S('cheek',E(436,390,30,19),5);S('cheek',E(644,390,30,19),5);
  S('muzzle',E(540,384,54,37),6);
  F(E(478,335,15,21),'#000');F(E(602,335,15,21),'#000');
  F(C(484,326,5.5),'#fff');F(C(608,326,5.5),'#fff');
  F(E(540,368,13,9),'#000');
  D(c=>{c.moveTo(540,376);c.lineTo(540,386);c.moveTo(523,386);c.quadraticCurveTo(531,398,540,386);c.quadraticCurveTo(549,398,557,386)},4.5);
  return {W,H,lineCv:cl,idCv:ci,names,demo:true};
}
