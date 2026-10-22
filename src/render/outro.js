import * as PIXI from 'pixi.js';
import {plan} from '../core/plan.js';
import {OUT,OUTRO_TR,OUT_FONT,view} from '../core/settings.js';
import {SS,clamp,hex,lerp,mk,rngOf,smooth} from '../core/utils.js';
import {seg} from '../core/zones.js';
import {HERSHEY_CURSIVE,HERSHEY_SANS} from '../data/hershey.js';
import {ed} from '../editor/editor.js';
import {makeSparkle,patTex,postShader} from './scene.js';
import {buildTool,shadowHover} from './toolSprites.js';
/* ================= OUTRO: a fresh sheet, a like icon and SUBSCRIBE drawn with a marker ================= */
export let OC=null,OG=null,OUTF=false;
/* Hershey "cursive" single-stroke font (hersheytext, MIT © James T): [half-advance, path] for chars 33..126 */
/* Hershey "futural" single-stroke sans (same package): base of the easy-to-read handwritten style */
export function handOK(t){return /^[\x20-\x7e]+$/.test(t)}
export function chaikin(p,n){for(let k=0;k<n;k++){if(p.length<3)return p;const q=[p[0]];for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];q.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75])}q.push(p[p.length-1]);p=q}return p}
/* handwritten strokes for a text line, in font units (baseline y=22), with a little human jitter per letter */
export function handStrokes(txt,style){const rnd=rngOf([...txt].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7)),strokes=[],scr=style==='script',F=scr?HERSHEY_CURSIVE:HERSHEY_SANS,J=scr?1:1.7,sl=scr?0:.17;let x=0;
  for(const ch of txt){if(ch===' '){x+=scr?16:14;continue}const g=F[ch.charCodeAt(0)-33];if(!g)continue;const o=g[0],dy=(rnd()-.5)*1.4*J,rot=(rnd()-.5)*.05*J,sc=1+(rnd()-.5)*.06*J,cx=o,cy=14,ph=rnd()*6;
    g[1].split('M').filter(Boolean).forEach(sub=>{const pts=[...sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m=>{const px=(+m[1]-cx)*sc,py=(+m[2]-cy)*sc;let X=x+cx+px*Math.cos(rot)-py*Math.sin(rot),Y=cy+dy+px*Math.sin(rot)+py*Math.cos(rot);if(!scr){X+=(22-Y)*sl+.35*Math.sin(Y*.45+ph);Y+=.3*Math.sin(X*.5+ph)}return[X,Y]});
      if(pts.length<2)return;const last=strokes[strokes.length-1];
      if(last&&Math.hypot(last[last.length-1][0]-pts[0][0],last[last.length-1][1]-pts[0][1])<1.6)last.push(...pts.slice(1));else strokes.push(pts)});
    x+=o*2-(scr?0:1.2)}
  return{strokes:strokes.map(p=>chaikin(p,2)),w:x+(scr?0:4)}}
export function plPiece(pts){const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return{pts,cum,len:cum[cum.length-1]}}
export function plAt(pc,L){const{pts,cum}=pc;if(L<=0)return pts[0];if(L>=pc.len)return pts[pts.length-1];let lo=0,hi=cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(cum[m]<=L)lo=m;else hi=m}
  const f=(L-cum[lo])/((cum[hi]-cum[lo])||1);return[lerp(pts[lo][0],pts[hi][0],f),lerp(pts[lo][1],pts[hi][1],f)]}
export function mkMove(type,pieces,o){let s0=0;pieces.forEach(p=>{p.s0=s0;s0+=p.len});return Object.assign({type,pieces,len:s0},o)}
export function moveAt(m,L){for(const p of m.pieces)if(L<=p.s0+p.len)return plAt(p,L-p.s0);const p=m.pieces[m.pieces.length-1];return p.pts[p.pts.length-1]}
export function sampleCmds(cmds,T){const out=[];let cx=0,cy=0,sx=0,sy=0;
  for(const c of cmds){const k=c[0];
    if(k==='M'){[cx,cy]=T(c[1],c[2]);sx=cx;sy=cy;out.push([cx,cy])}
    else if(k==='L'){const[x,y]=T(c[1],c[2]);for(let i=1;i<=6;i++)out.push([lerp(cx,x,i/6),lerp(cy,y,i/6)]);cx=x;cy=y}
    else if(k==='C'){const a=T(c[1],c[2]),b=T(c[3],c[4]),e=T(c[5],c[6]);for(let i=1;i<=24;i++){const t=i/24,m=1-t;out.push([m*m*m*cx+3*m*m*t*a[0]+3*m*t*t*b[0]+t*t*t*e[0],m*m*m*cy+3*m*m*t*a[1]+3*m*t*t*b[1]+t*t*t*e[1]])}cx=e[0];cy=e[1]}
    else if(k==='Q'){const a=T(c[1],c[2]),e=T(c[3],c[4]);for(let i=1;i<=10;i++){const t=i/10,m=1-t;out.push([m*m*cx+2*m*t*a[0]+t*t*e[0],m*m*cy+2*m*t*a[1]+t*t*e[1]])}cx=e[0];cy=e[1]}
    else if(k==='Z'){for(let i=1;i<=6;i++)out.push([lerp(cx,sx,i/6),lerp(cy,sy,i/6)]);cx=sx;cy=sy}}
  return out}
/* boustrophedon hatch of a polygon: chains of spans that follow each other line to line */
export function hatchChains(poly,ang,sp,inset){
  const ca=Math.cos(-ang),sa=Math.sin(-ang),R=p=>[p[0]*ca-p[1]*sa,p[0]*sa+p[1]*ca],B=p=>[p[0]*ca+p[1]*sa,-p[0]*sa+p[1]*ca];
  const q=poly.map(R);let y0=1e9,y1=-1e9;q.forEach(p=>{y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1])});
  const lines=[];for(let y=y0+sp*.5;y<y1;y+=sp){const xs=[];for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];if((a[1]<=y)!==(b[1]<=y)){xs.push(a[0]+(y-a[1])/(b[1]-a[1])*(b[0]-a[0]))}}
    xs.sort((a,b)=>a-b);const sps=[];for(let i=0;i+1<xs.length;i+=2){const a=xs[i]+inset,b=xs[i+1]-inset;if(b>a)sps.push({a,b,y,u:false})}lines.push(sps)}
  const chains=[];
  for(;;){let li=lines.findIndex(l=>l.some(s=>!s.u));if(li<0)break;let cur=lines[li].find(s=>!s.u);const ch=[];
    while(cur){cur.u=true;ch.push(cur);li++;if(li>=lines.length)break;const nx=lines[li].filter(s=>!s.u&&s.a<cur.b&&s.b>cur.a);cur=nx.length?nx.reduce((m,s)=>Math.abs(s.a+s.b-cur.a-cur.b)<Math.abs(m.a+m.b-cur.a-cur.b)?s:m):null}
    chains.push(ch)}
  return chains.map(ch=>{let prev=null;return ch.map((s,k)=>{const a=B([k%2?s.b:s.a,s.y]),b=B([k%2?s.a:s.b,s.y]);const pts=prev?[prev,a,b]:[a,b];prev=b;return plPiece(pts)})})}
export function outroGeom(){
  const W=view.W,H=view.H,txt=OUT.text||'SUBSCRIBE',key=[W,H,txt,OUT.color,OUT.dur,OUT.style,OUTF?1:0].join('|');
  if(OG&&OG.key===key)return OG;
  const land=W>H*1.2,S0=land?H*.28:Math.min(W*.38,H*.22),gap=S0*.2;
  const tf=mk(W,H),tx=tf.getContext('2d');
  let fs=S0*.3;tx.font=fs+'px '+OUT_FONT;let tw=tx.measureText(txt).width;const maxW=W*(land?.46:.6);if(tw>maxW){fs*=maxW/tw}
  tx.font=fs+'px '+OUT_FONT;tw=tx.measureText(txt).width;const mS=tx.measureText('S'),capH=mS.actualBoundingBoxAscent||fs*.72;
  const hand=OUT.style!=='print'&&handOK(txt);let HS=null;
  if(hand){const hs=handStrokes(txt,OUT.style);let y0=1e9,y1=-1e9;hs.strokes.forEach(p=>p.forEach(q=>{y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1])}));const k=Math.min(W*(land?.46:.6)/hs.w,S0*.34/Math.max(8,y1-y0));HS={hs,y0,y1,k,h:(y1-y0)*k}}
  const groupH=S0+gap*1.1+(hand?HS.h:capH),top=H*.5-groupH/2-H*.01,icx=W/2,icy=top+S0/2,base=top+S0+gap+capH;
  const sc=S0/421,T=(x,y)=>[icx+(x-370)*sc,icy+(y-366)*sc];
  const HAND=[['M',265,568],['L',265,395],['C',300,388,330,340,345,300],['C',360,262,388,232,398,200],['C',403,176,406,160,426,158],['C',449,156,463,186,455,226],['C',450,262,432,296,422,326],
    ['L',528,328],['C',560,330,573,350,565,376],['C',573,392,572,412,559,426],['C',568,442,566,461,552,471],['C',562,486,560,506,545,516],['C',552,536,545,561,520,570],['C',470,575,380,573,300,569],['Z']];
  const CUFF=[['M',176,385],['L',237,385],['Q',245,385,245,393],['L',245,567],['Q',245,575,237,575],['L',176,575],['Q',168,575,168,567],['L',168,393],['Q',168,385,176,385],['Z']];
  const handP=sampleCmds(HAND,T),cuff=sampleCmds(CUFF,T),lw=S0*.034;
  const mv=[];
  mv.push(mkMove('ink',[plPiece(handP)],{alpha:.96,lw,spd:S0*1.15,pause:.12}));
  mv.push(mkMove('ink',[plPiece(cuff)],{alpha:.96,lw,spd:S0*1.0,pause:.1}));
  const fw=lw*1.45,fsp=fw*.4;
  hatchChains(handP,-.62,fsp,lw*.2).forEach(ch=>mv.push(mkMove('ink',ch,{alpha:.6,lw:fw,spd:S0*4.4,pause:.06})));
  hatchChains(cuff,-.62,fsp,lw*.2).forEach(ch=>mv.push(mkMove('ink',ch,{alpha:.6,lw:fw,spd:S0*4.4,pause:.06})));
  if(OUT.style!=='print'&&handOK(txt)){
    // the marker writes the word itself, stroke by stroke, in a connected script
    const{hs,y0,k}=HS,hw=hs.w*k,ox=W/2-hw/2,oy=top+S0+gap*1.1-y0*k;
    const hlw=Math.max(2.5,k*3.4);
    hs.strokes.forEach(p=>mv.push(mkMove('ink',[plPiece(p.map(q=>[ox+q[0]*k,oy+q[1]*k]))],{alpha:.97,lw:hlw,spd:k*95,pause:.05})));
  }else{
  // text: full glyphs, revealed by marker zigzags that stay on the ink of each letter
    tx.fillStyle=OUT.color;tx.textBaseline='alphabetic';const x0=W/2-tw/2;tx.fillText(txt,x0,base);
    const ty0=Math.max(0,Math.floor(base-capH-fs*.35)),ty1=Math.min(H,Math.ceil(base+fs*.35)),id=tx.getImageData(0,ty0,W,ty1-ty0).data,rw=W;
    const st=Math.max(2,fs*.07),mw=st*2.3;
    for(let i=0;i<txt.length;i++){const ch=txt[i];if(ch===' ')continue;const a=x0+tx.measureText(txt.slice(0,i)).width,b=a+tx.measureText(ch).width,pcs=[];let prev=null,k=0;
      for(let bx=Math.floor(a-st);bx<b+st;bx+=st){let mn=1e9,mx=-1e9;for(let x=Math.max(0,bx|0);x<Math.min(W,bx+st);x++)for(let y=0;y<ty1-ty0;y++)if(id[(y*rw+x)*4+3]>40){if(y<mn)mn=y;if(y>mx)mx=y}
        if(mx<mn)continue;const top2=[bx+st*.2,ty0+mn+mw*.15],bot=[bx+st*.8,ty0+mx-mw*.15];const p0=k%2?bot:top2,p1=k%2?top2:bot;pcs.push(plPiece(prev?[prev,p0,p1]:[p0,p1]));prev=p1;k++}
      if(pcs.length)mv.push(mkMove('mask',pcs,{alpha:.74,lw:mw,spd:fs*7,pause:.05}))}
  }
  // timing
  const moves=[],enter=[W*1.08,H*1.04],exit=[W*1.16,H*1.12];let pos=enter,t=0;
  const air=(a,b,dur)=>({type:'air',a,b,t0:0,t1:0,raw:dur});
  mv.forEach((m,i)=>{const f=moveAt(m,0);moves.push(air(pos,f,(i===0?.35:.12)+Math.hypot(f[0]-pos[0],f[1]-pos[1])/(S0*(i===0?3:6))));m.raw=m.pause+m.len/m.spd;moves.push(m);pos=moveAt(m,m.len)});
  moves.push(air(pos,exit,.45));
  const Dw=Math.max(1.4,OUT.dur-OUTRO_TR-1.15),raw=moves.reduce((s,m)=>s+m.raw,0),f=Dw/raw;
  moves.forEach(m=>{m.t0=t;t+=m.raw*f;m.t1=t;if(m.pause!=null)m.ps=m.pause*f});
  return OG={key,W,H,S0,icx,icy,moves,txtFull:tf,Dw,fs,lw,tEnd:moves[moves.length-2].t1};
}
export function outroPen(G,tl){const ms=G.moves;if(tl<=0)return{x:ms[0].a[0],y:ms[0].a[1],h:1,down:false,mi:-1,L:0,vis:false};
  for(let i=0;i<ms.length;i++){const m=ms[i];if(tl>m.t1)continue;const u=clamp((tl-m.t0)/((m.t1-m.t0)||1),0,1);
    if(m.type==='air'){const e=smooth(u),first=i===0,last=i===ms.length-1;return{x:lerp(m.a[0],m.b[0],e),y:lerp(m.a[1],m.b[1],e),h:first?1-e:last?e:Math.sin(Math.PI*u)*.7,down:false,mi:i,L:0,vis:true}}
    const dl=tl-m.t0;if(dl<m.ps){const p=moveAt(m,0);return{x:p[0],y:p[1],h:.35*(1-dl/m.ps),down:false,mi:i,L:0,vis:true}}
    const L=(dl-m.ps)/((m.t1-m.t0-m.ps)||1)*m.len,p=moveAt(m,L);return{x:p[0],y:p[1],h:0,down:true,mi:i,L,vis:true}}
  const e=ms[ms.length-1].b;return{x:e[0],y:e[1],h:1,down:false,mi:ms.length,L:0,vis:false}}
export function outroSnd(t){const G=outroGeom(),p=outroPen(G,t-OUTRO_TR),k=seg.W/view.W*.5;return{x:seg.W*.25+p.x*k,y:seg.H*.25+p.y*k,kind:p.down?'run':'pause',h:p.down?0:1,lid:900000+p.mi,tool:'marker',color:OUT.color}}
export function outroBuild(G){
  const W=view.W,H=view.H;if(OC&&OC.W===W&&OC.H===H)return OC;
  if(OC){OC.c.destroy({children:true});OC.inkTex.destroy(true);OC.txtTex.destroy(true)}
  const c=new PIXI.Container(),dim=new PIXI.Graphics();dim.beginFill(0x120c16,1);dim.drawRect(-10,-10,W+20,H+20);dim.endFill();c.addChild(dim);
  const sheet=new PIXI.Container();sheet.pivot.set(W/2,H/2);c.addChild(sheet);
  const r=[-W*.08,-H*.06,W*1.16,H*1.12],shadow=new PIXI.Graphics();shadow.beginFill(0x000000,.55);shadow.drawRect(r[0]-6,r[1]-18,r[2]+12,r[3]+24);shadow.endFill();shadow.filters=[new PIXI.BlurFilter(Math.max(20,W*.03),2)];sheet.addChild(shadow);
  const paper=new PIXI.Graphics();paper.beginFill(0xFDFCF8);paper.drawRect(...r);paper.endFill();paper.beginFill(0xffffff,.85);paper.drawRect(r[0],r[1],r[2],3);paper.endFill();sheet.addChild(paper);
  const grain=new PIXI.TilingSprite(patTex,r[2],r[3]);grain.position.set(r[0],r[1]);grain.tileScale.set(1.25*W/1080);grain.alpha=.06;grain.blendMode=PIXI.BLEND_MODES.MULTIPLY;sheet.addChild(grain);
  const art=new PIXI.Container();art.pivot.set(W/2,H/2);art.position.set(W/2,H/2);sheet.addChild(art);
  const inkCv=mk(W,H),txtCv=mk(W,H),inkTex=PIXI.Texture.from(inkCv),txtTex=PIXI.Texture.from(txtCv);
  const inkS=new PIXI.Sprite(inkTex),txtS=new PIXI.Sprite(txtTex);inkS.blendMode=txtS.blendMode=PIXI.BLEND_MODES.MULTIPLY;art.addChild(inkS);art.addChild(txtS);
  const spk=[];for(let i=0;i<5;i++){const g=makeSparkle();g.tint=[0xFFC83D,0xFF7A90,0xFFD966,0xFF9AAE,0xFFC83D][i];g.scale.set(0);art.addChild(g);spk.push(g)}
  const B=buildTool('marker'),pen=B.c,psh=B.sh,ptn=B.tint;sheet.addChild(psh);sheet.addChild(pen);
  OC={c,W,H,dim,sheet,shadow,grain,art,inkCv,txtCv,inkTex,txtTex,inkC:mk(W,H),maskC:mk(W,H),pen,psh,ptn,spk,cm:0,gkey:null,lastInk:'',lastTxt:''};
  return OC}
export function strokeTo(ctx,m,Lmax){ctx.strokeStyle=OUT.color;ctx.lineWidth=m.lw;ctx.globalAlpha=m.alpha;
  for(const p of m.pieces){if(p.s0>=Lmax)break;const lim=Lmax-p.s0;ctx.beginPath();ctx.moveTo(p.pts[0][0],p.pts[0][1]);
    for(let i=1;i<p.pts.length;i++){if(p.cum[i]<=lim)ctx.lineTo(p.pts[i][0],p.pts[i][1]);else{const q=plAt(p,lim);ctx.lineTo(q[0],q[1]);break}}ctx.stroke()}ctx.globalAlpha=1}
export function outroPaint(O,G,tl){
  const ms=G.moves,p=outroPen(G,tl),mi=p.mi<0?0:p.mi,L=p.L;
  const prep=x=>{x.lineCap='round';x.lineJoin='round'};
  if(O.gkey!==G.key||mi<O.cm){O.gkey=G.key;O.cm=0;[O.inkC,O.maskC].forEach(cv=>cv.getContext('2d').clearRect(0,0,cv.width,cv.height));O.lastInk=O.lastTxt='x'}
  const ic=O.inkC.getContext('2d'),mc=O.maskC.getContext('2d');prep(ic);prep(mc);
  while(O.cm<mi){const m=ms[O.cm];if(m.type==='ink')strokeTo(ic,m,1e9);else if(m.type==='mask')strokeTo(mc,m,1e9);O.cm++}
  const cur=ms[mi],kI=O.cm+'|'+(cur&&cur.type==='ink'?L.toFixed(1):'-'),kT=O.cm+'|'+(cur&&cur.type==='mask'?L.toFixed(1):'-')+'|'+OUT.color;
  if(kI!==O.lastInk){O.lastInk=kI;const x=O.inkCv.getContext('2d');x.clearRect(0,0,G.W,G.H);x.drawImage(O.inkC,0,0);if(cur&&cur.type==='ink'&&L>0){prep(x);strokeTo(x,cur,L)}O.inkTex.baseTexture.update()}
  if(kT!==O.lastTxt){O.lastTxt=kT;const x=O.txtCv.getContext('2d');x.globalCompositeOperation='source-over';x.clearRect(0,0,G.W,G.H);x.drawImage(O.maskC,0,0);if(cur&&cur.type==='mask'&&L>0){prep(x);strokeTo(x,cur,L)}
    x.globalCompositeOperation='source-in';x.drawImage(G.txtFull,0,0);x.globalCompositeOperation='source-over';O.txtTex.baseTexture.update()}
  return p}
export function outroAt(v){
  const on=OUT.on&&plan&&plan.mainTotal!=null&&v>plan.mainTotal&&!ed.on;
  if(!on){if(OC)OC.c.visible=false;return}
  const G=outroGeom(),O=outroBuild(G),W=view.W,H=view.H,t=v-plan.mainTotal,u=clamp(t/OUTRO_TR,0,1),e=1-Math.pow(1-u,3),tl=t-OUTRO_TR;O.c.visible=true;
  O.dim.alpha=.3*smooth(u);O.grain.texture=patTex;
  const push=1+.06*smooth(clamp(tl/(G.Dw+1),0,1));
  O.sheet.position.set(W/2+W*.12*(1-e),H/2+H*1.15*(1-e));O.sheet.rotation=-.09*(1-e)*(1-e);O.sheet.scale.set(push);O.shadow.visible=u<1;
  const p=outroPaint(O,G,tl);
  // marker
  const k=.5*W/(560*SS)*(land0(W,H)?1.15:1),h=p.h,col=hex(OUT.color);O.ptn.forEach(g=>g.tint=col);
  O.pen.visible=O.psh.visible=p.vis;O.pen.position.set(p.x,p.y);const ang=.64+.04*Math.sin(v*1.6)+.02*Math.sin(v*4.7)-.05*h;
  O.pen.rotation=O.psh.rotation=ang;O.pen.scale.set(k*(1+.06*h));O.psh.scale.set(k*(1+.03*h));O.psh.position.set(p.x+(8+40*h)*SS*k,p.y+(12+55*h)*SS*k);shadowHover(O.psh,h);
  // finish: a soft pop of the drawing and a few sparkles
  const fe=tl-G.tEnd,pop=fe>0?Math.sin(Math.PI*clamp(fe/.55,0,1))*.045:0;O.art.scale.set(1+pop);
  O.spk.forEach((g,i)=>{const a=-2.4+i*1.2,rr=G.S0*(.8+.1*(i%2)),q=(fe-.15-i*.09)/.8,s=q>0&&q<1?Math.sin(Math.PI*q):0;g.position.set(G.icx+Math.cos(a)*rr,G.icy+Math.sin(a)*rr*.9);g.scale.set(s*G.S0/(30*SS)*(.11+.04*(i%3)));g.rotation=q*1.2});
  const U2=postShader.uniforms,kk=smooth(u);U2.uTilt*=1-kk;U2.uLeak*=1-kk;U2.uBlurG*=1-kk;if(kk>.4)U2.uVel=[0,0];U2.uFocusY=lerp(U2.uFocusY,.5,kk);U2.uPersp=[U2.uPersp[0]*(1-kk),U2.uPersp[1]*(1-kk),U2.uPersp[2]];U2.uDof*=1-kk;if(O.pen)O.pen.filters=null;
}
export function land0(W,H){return W>H*1.2}
export function setOutroFont(v){OUTF=v}
