import * as PIXI from 'pixi.js';
import {SS,clamp,lerp,mk} from '../core/utils.js';
/* ================= TOOL SPRITES =================
   Every tool is a photo-like 2D render of a lathe profile: radius along the length, shaded per pixel like a
   cylinder of its material. Three layers: 'tint' is grey shading multiplied by the ink colour (coloured plastic,
   ink, pigment), 'plain' carries untinted materials in their own colour (wood, metal, white plastic, glass),
   'over' holds speculars and occlusion. The tip is at x=0, the body runs along +x. */
export const CYL_PROF={
  marker:{L:560,R:26,seg:[[0,30,0,8.2,'felt','bull'],[30,38,8.6,8.6,'grip','cyl'],[38,50,9.4,11.6,'grip','cone'],[50,55,13.4,13.4,'grip','cyl'],[55,59,11.8,11.8,'grip','cyl'],
    [59,94,12.8,22,'grip','cone'],[94,102,23.6,23.6,'grip','cyl'],[102,106,22.4,22.4,'grip','cyl'],[106,388,26,26,'body','cyl'],[388,391,25,25,'body','groove'],[391,532,26.6,26.6,'body','cyl'],[532,560,26.6,26.6,'body','end']]},
  shaker:{L:310,R:44,seg:[[0,7,40,40,'cap','cyl'],[7,30,44.5,44.5,'cap','cyl'],[30,33,42,42,'cap','groove'],[33,40,40.5,40.5,'glit','cyl'],[40,118,43,43,'glit','cyl'],
    [118,214,43.6,43.6,'label','cyl'],[214,296,43,43,'glit','cyl'],[296,310,43,43,'glit','end']]},
  copic:{L:600,R:31,seg:[[0,46,0,6.2,'felt','brush'],[46,58,8.6,9.6,'white','cone'],[58,62,11.5,11.5,'white','cyl'],[62,88,12.5,21,'white','cone'],[88,96,23,23,'white','cyl'],
    [96,240,29,29,'white','cyl'],[240,318,29.2,29.2,'paint','cyl'],[318,470,29,29,'white','cyl'],[470,474,28,28,'white','groove'],[474,574,31,31,'body','cyl'],[574,600,31,31,'body','end']]},
  // coloured pencil: pigment core, shaved wood cone, lacquered hexagonal body
  pencil:{L:560,R:15,seg:[[0,7,0,2.3,'lead','bull'],[7,24,2.5,4.4,'lead','cone'],[24,84,4.6,13.8,'wood','cone'],[84,548,14.2,14.2,'hex','cyl'],[548,560,14.2,14.2,'hex','end']]},
  // round brush loaded with paint, crimped metal ferrule, tapered lacquered handle
  brush:{L:640,R:14,seg:[[0,60,0,9.6,'bristle','belly'],[60,96,10,11.8,'metal','cone'],[96,99,11.4,11.4,'metal','groove'],[99,104,12,12,'metal','cyl'],[104,107,11.6,11.6,'metal','groove'],[107,126,12.1,12.4,'metal','cone'],
    [126,134,12.3,12.3,'lacq','cyl'],[134,612,12.7,8.4,'lacq','cone'],[612,640,8.4,8.4,'lacq','end']]},
  // soft pastel stick with a worn tip and a paper wrapper with a colour band
  pastel:{L:262,R:21,seg:[[0,12,0,15.5,'chalk','bull'],[12,90,16.5,18.6,'chalk','cone'],[90,150,19.8,19.8,'paper','cyl'],[150,166,19.9,19.9,'pband','cyl'],[166,232,19.8,19.8,'paper','cyl'],[232,248,18.6,18.6,'chalk','cyl'],[248,262,18.6,18.6,'chalk','end']]},
  // gel pen: metal tip, clear section, rubber grip, clear barrel showing the ink tube, coloured end plug
  gel:{L:540,R:16,seg:[[0,3,0,1.3,'metal','bull'],[3,22,1.5,5,'metal','cone'],[22,34,5.6,9.6,'clear','cone'],[34,150,12.6,12.6,'rubber','cyl'],[150,154,13.4,13.4,'clear','groove'],[154,462,14,14,'clear','cyl'],
    [462,466,14.4,14.4,'capT','groove'],[466,530,15,15,'capT','cyl'],[530,540,15,15,'capT','end']]},
  // squeeze bottle of puffy paint: white nozzle and cap, paint showing through the plastic, paper label
  puffy:{L:430,R:35,seg:[[0,5,0,2.6,'nozzle','bull'],[5,66,2.8,8.5,'nozzle','cone'],[66,72,10,10,'nozzle','cyl'],[72,112,18,18,'cap','cyl'],[112,124,20,33,'bottle','cone'],[124,190,34,34,'bottle','cyl'],
    [190,340,34.6,34.6,'label','cyl'],[340,418,34,34,'bottle','cyl'],[418,430,34,34,'bottle','end']]},
  // glue bottle: clear-white plastic, coloured cap
  glue:{L:430,R:35,seg:[[0,5,0,2.6,'nozzle','bull'],[5,66,2.8,8.5,'nozzle','cone'],[66,72,10,10,'nozzle','cyl'],[72,112,18,18,'capT','cyl'],[112,124,20,33,'bottleW','cone'],[124,190,34,34,'bottleW','cyl'],
    [190,340,34.6,34.6,'label','cyl'],[340,418,34,34,'bottleW','cyl'],[418,430,34,34,'bottleW','end']]},
  // glass dropper full of ink, plastic collar, rubber bulb
  dropper:{L:430,R:22,seg:[[0,4,0,2,'glass','bull'],[4,64,2.2,7.5,'glass','cone'],[64,250,9,9,'glass','cyl'],[250,272,15,15,'white','cyl'],[272,430,20.5,20.5,'rubber','dome']]}};
const TOOL_PROF={marker:'marker',chameleon:'marker',copic:'copic',pencil:'pencil',watercolor:'brush',pastel:'pastel',gel:'gel',puffy:'puffy',glue:'glue',liquid:'dropper'};
export const TOOL_LEN=Object.fromEntries(Object.entries(TOOL_PROF).map(([t,p])=>[t,CYL_PROF[p].L]));
/* untinted materials and their colour; glass and clear plastic have tinted content inside (a fraction of the radius) */
const PLAIN={white:[.97,.97,.97],metal:[.8,.82,.86],cap:[.96,.96,.96],label:[.99,.99,.99],wood:[.95,.8,.6],paper:[.97,.95,.9],nozzle:[.97,.97,.98],lacq:[.4,.15,.18],glass:[.84,.9,.97],bottleW:[.97,.96,.92],clear:[.88,.92,.97]};
const INNER={glass:.72,clear:.28};
const segAt=(P,x)=>{for(const sg of P.seg)if(x>=sg[0]&&x<sg[1])return sg;return null};
function rOf(sg,x){const u=clamp((x-sg[0])/(sg[1]-sg[0]),0,1);
  switch(sg[5]){case 'bull':return sg[3]*(u<.42?.84*Math.sqrt(Math.max(0,1-(1-u/.42)*(1-u/.42)))*(.35+.65*Math.sqrt(u/.42)):.84+.16*(u-.42)/.58);case 'brush':return sg[3]*Math.pow(u,.9)*(1-.15*Math.sin(u*Math.PI))+.6;case 'cone':return lerp(sg[2],sg[3],u);
    case 'belly':return sg[3]*(u<.62?Math.pow(Math.sin(Math.PI/2*u/.62),.75):1-.12*Math.pow((u-.62)/.38,2))+.35;
    case 'dome':return sg[2]*(.8+.2*Math.sin(Math.PI/2*Math.min(1,u/.35)))*Math.sqrt(Math.max(0,1-Math.pow(Math.max(0,(u-.6)/.4),2)));
    case 'end':return sg[2]*Math.sqrt(Math.max(0,1-Math.pow(u,5)));default:return sg[2]}}
export function profRadius(P,x){const sg=segAt(P,x);return sg?rOf(sg,x):0}
export const CYL_CACHE={};
export function cylTex(name){
  if(CYL_CACHE[name])return CYL_CACHE[name];
  const P=CYL_PROF[name],K=1.5*SS,pad=3,Rm=P.R+4,W=Math.ceil((P.L+pad*2)*K),H=Math.ceil(Rm*2*K),cy=Rm;
  const mkL=()=>{const c=mk(W,H);return{c,x:c.getContext('2d'),d:null}};
  const Lt=mkL(),Lp=mkL(),Lo=mkL();[Lt,Lp,Lo].forEach(l=>l.d=l.x.createImageData(W,H));
  const hs=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v)};
  const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),w=fy*fy*(3-2*fy);
    return lerp(lerp(hs(xi,yi),hs(xi+1,yi),u),lerp(hs(xi,yi+1),hs(xi+1,yi+1),u),w)};
  const G=(v,c,w)=>Math.exp(-((v-c)/w)*((v-c)/w));
  // boundaries: steps facing the tip catch light, steps facing away are in shade
  const bnd=[];for(let i=1;i<P.seg.length;i++){const p=P.seg[i-1],q=P.seg[i],ra=rOf(p,p[1]-1e-3),rb=rOf(q,q[0]);if(Math.abs(rb-ra)>.4)bnd.push([q[0],rb-ra])}
  const put=(L,i,g,a)=>{L.d.data[i]=g[0]*255;L.d.data[i+1]=g[1]*255;L.d.data[i+2]=g[2]*255;L.d.data[i+3]=clamp(a,0,1)*255};
  for(let px=0;px<W;px++){
    const x=(px+.5)/K-pad,sg=segAt(P,x);if(!sg)continue;
    const r=rOf(sg,x),r2=rOf(sg,x+.5),sl=(r2-r)/.5,tilt=sl/Math.sqrt(1+sl*sl);
    let face=0,ao=0;for(const[bx,dr]of bnd){const dx=x-bx;if(dr>0){if(dx>=0&&dx<.9)face=Math.max(face,.55);if(dx<0&&dx>-2.2)ao=Math.max(ao,.35*(1+dx/2.2))}
      else{if(dx<0&&dx>-1)ao=Math.max(ao,.45)}}
    const m=sg[4],groove=sg[5]==='groove';
    for(let py=0;py<H;py++){
      const yy=(py+.5)/K-cy,cov=clamp((r-Math.abs(yy))*K+.5,0,1);if(cov<=0||r<=0)continue;
      const n=clamp(yy/r,-1,1),nz=Math.sqrt(1-n*n),i=(py*W+px)*4;
      const lam=clamp(-n*.55+nz*.82,0,1),tf=1+.45*tilt,fres=.72+.28*Math.sqrt(nz),bounce=.1*G(n,.88,.14);
      let v,hl=0,dk=0,al=1;
      if(m==='felt'){
        const fib=vn(x*.9,yy*4.2)*.6+vn(x*2.3,yy*9)*.4,sp=hs(px,py);
        v=Math.min(1,(.36+.58*lam*tf)*(.82+.3*fib)*(sp>.93?.85:1)*fres);
        const tipWet=1-clamp(x/(sg[1]*.45),0,1);v*=1-.18*tipWet;hl=.07*G(n,-.45,.25)*fib;
      }else if(m==='glit'){ // glitter seen through clear plastic: dark-ish body, sparkling flakes, clear wall at the rims
        const fx=Math.floor(px/2),fy=Math.floor(py/2),f1=hs(fx,fy),f2=hs(fx+31,fy*1.7),spk=f1>.86?1:f1>.7?.55:.18+.3*vn(x*.6,yy*.6);
        v=Math.min(1,(.24+.5*lam*tf)*(.45+.75*spk)+bounce*.6);
        hl=.9*G(n,-.5,.07)*nz+.25*G(n,-.3,.22)+.35*G(Math.abs(n),.93,.05)+(f2>.94?.55*lam:0);hl*=.9+.1*vn(x*.08,n*3);
      }else if(m==='cap'||m==='capT'||m==='label'){ // plastic cap with knurled grip / matte paper label
        v=Math.min(1,(.52+.55*lam*tf)*(.82+.18*Math.sqrt(nz))+bounce);
        if(m!=='label')v*=.88+.12*Math.cos(n*Math.PI*16);
        hl=(m==='label'?.25:.8)*(.9*G(n,-.5,.08)*nz+.3*G(n,-.3,.25))+(m==='label'?.05:0);if(groove){dk=Math.max(dk,.5);hl*=.2}
      }else if(m==='wood'){ // shaved cedar: soft grain running along the cone
        const gr=vn(x*.06,yy*1.1)*.5+vn(x*.025,yy*3.4)*.5;v=Math.min(1,(.56+.5*lam*tf)*(.82+.24*gr)+bounce*.5);hl=.06*G(n,-.45,.3);
      }else if(m==='lead'){v=(.34+.52*lam*tf)*.92;hl=.32*G(n,-.45,.12)*nz;
      }else if(m==='hex'){ // hexagonal lacquered barrel: flat facets, bright edges between them
        const th=Math.asin(n),fc=clamp(Math.round(th/(Math.PI/3)),-1,1),ph=fc*Math.PI/3,ln=clamp(-Math.sin(ph)*.55+Math.cos(ph)*.82,0,1);
        v=Math.min(1,.4+.6*ln+bounce*.5);const ed=Math.min(Math.abs(th-Math.PI/6),Math.abs(th+Math.PI/6));
        hl=.4*Math.exp(-Math.pow(ed/.05,2))+(fc===-1?.3*G(th,-Math.PI/3,.14):0)+.08*vn(x*.05,th*4);if(sg[5]==='end')hl*=.5;
      }else if(m==='metal'){ // polished metal reflects the room: high-contrast bands, sharp highlight, crimp grooves
        const env=.5+.5*Math.cos(n*3.4+.7);v=Math.min(1,.26+.66*env*(.55+.45*lam)+bounce);hl=.95*G(n,-.42,.07)*nz+.35*G(n,.62,.05);if(groove){dk=Math.max(dk,.55);hl*=.2}
      }else if(m==='bristle'){ // hairs along the brush, wetter and darker at the tip, a little sheen
        const fib=vn(x*.12,yy*2.6)*.6+vn(x*.5,yy*7)*.4,wet=1-clamp(x/(sg[1]*.55),0,1);
        v=Math.min(1,(.38+.56*lam*tf)*(.72+.42*fib))*(1-.2*wet);hl=(.18+.3*wet)*G(n,-.4,.16)*fib;al=x<3?clamp(x/3,0,1):1;
      }else if(m==='chalk'){v=(.54+.46*lam*tf)*(.84+.24*vn(x*.6,yy*.6))*(hs(px,py)>.95?.82:1);
      }else if(m==='paper'||m==='pband'){v=Math.min(1,.6+.42*lam*tf+bounce*.5)*(.94+.06*vn(x*.3,yy*.3));hl=.05*G(n,-.4,.3);
      }else if(m==='rubber'){ // matte rubber with ribs
        const rib=sg[5]==='dome'?1:.84+.16*Math.pow(Math.cos(x*1.15),2);v=(.36+.52*lam*tf)*rib*(.92+.08*vn(x*.4,yy*.4));hl=.2*G(n,-.38,.28)*rib;
      }else if(m==='bottle'||m==='bottleW'||m==='nozzle'){ // soft squeezable plastic
        v=Math.min(1,.56+.5*lam*tf+bounce);hl=(m==='nozzle'?.7:.55)*G(n,-.5,.09)*nz+.18*G(n,.8,.07)+.1*G(n,-.2,.35);
      }else if(m==='lacq'){v=.3+.7*lam*tf;hl=G(n,-.48,.06)*nz+.25*G(n,.8,.05)+.06*vn(x*.04,n*2);
      }else if(m==='glass'||m==='clear'){ // a thin transparent wall: mostly see-through, denser at the rims, crisp reflections
        v=.78+.2*lam;al=.3+.55*Math.pow(1-nz,2);hl=.95*G(n,-.55,.05)*nz+.5*G(n,.72,.04)+.3*G(Math.abs(n),.96,.03);
        const ri=r*INNER[m];if(Math.abs(yy)<ri){const ni=yy/ri,nzi=Math.sqrt(1-ni*ni),li=clamp(-ni*.55+nzi*.82,0,1),ci=clamp((ri-Math.abs(yy))*K+.5,0,1),g=(.42+.55*li)*(m==='clear'?.95:.88);put(Lt,i,[g,g,g],ci*cov)}
      }else{
        v=Math.min(1,(.5+.6*lam*tf)*(.8+.2*Math.sqrt(nz))+bounce);
        const gl=m==='grip'?1.1:m==='paint'?.75:m==='white'?.85:1;
        hl=gl*(.95*G(n,-.5+.12*tilt,.075+.03*Math.abs(tilt))*nz+.32*G(n,-.32,.24)+.22*G(n,.84,.06));
        hl*=.86+.14*vn(x*.08,n*3);
        if(groove){dk=Math.max(dk,.5);hl*=.2}
      }
      hl=Math.max(hl,face*(.5+.5*lam));dk=Math.max(dk,ao*(.6+.4*nz));
      const pc=PLAIN[m],g=clamp(v,0,1);
      if(pc)put(Lp,i,[g*pc[0],g*pc[1],g*pc[2]],cov*al);else put(Lt,i,[g,g,g],cov*al);
      const s2=hl+dk;if(s2>.002){const o=Lo.d.data,c8=hl/s2*255;o[i]=o[i+1]=o[i+2]=c8;o[i+3]=clamp(s2,0,1)*cov*255}
    }
  }
  const out={K,pad,cy};
  [['tint',Lt],['plain',Lp],['over',Lo]].forEach(([k,l])=>{l.x.putImageData(l.d,0,0);let any=false;for(let j=3;j<l.d.data.length;j+=16)if(l.d.data[j]){any=true;break}
    if(any){const t=PIXI.Texture.from(l.c);t.baseTexture.mipmap=PIXI.MIPMAP_MODES.ON;out[k]=t}});
  return CYL_CACHE[name]=out;
}
/* ================= CONTACT SHADOW =================
   The tool rests on its tip and rises towards the hand, so its shadow is sharp and dark where it touches the paper
   and grows wider, softer and paler along the length. Three pre-blurred layers built from the tool's own silhouette:
   'contact' (ambient occlusion right under the tip), 'cast' (the shadow while drawing) and 'soft' (lifted tool). */
const SH_CACHE={};
function shadowTex(name){
  if(SH_CACHE[name])return SH_CACHE[name];
  const P=CYL_PROF[name],K=.5*SS,pad=60,Wd=Math.ceil((P.L+pad*2)*K),Hd=Math.ceil((P.R+pad)*2*K),cy=P.R+pad;
  const cdf=t=>1/(1+Math.exp(-1.702*t)),R=X=>profRadius(P,clamp(X,0,P.L-1e-3));
  const rad=new Float32Array(Wd);for(let px=0;px<Wd;px++)rad[px]=R((px+.5)/K-pad);
  const tex=fn=>{const cv=mk(Wd,Hd),x=cv.getContext('2d'),id=x.createImageData(Wd,Hd),D=id.data;
    for(let px=0;px<Wd;px++){const X=(px+.5)/K-pad;for(let py=0;py<Hd;py++){const a=fn(X,(py+.5)/K-cy,rad[px]);if(a<=.003)continue;const i=(py*Wd+px)*4;D[i]=26;D[i+1]=16;D[i+2]=32;D[i+3]=Math.min(1,a)*255}}
    x.putImageData(id,0,0);const t=PIXI.Texture.from(cv);t.baseTexture.mipmap=PIXI.MIPMAP_MODES.ON;return t};
  const cast=soft=>(X,Y,r)=>{const xc=clamp(X,0,P.L),s=(soft?7:1.4)+xc*(soft?.085:.04),I=(soft?.34:.44)/(1+xc*(soft?.0035:.0026)),ay=Math.abs(Y),w=Math.max(r,soft?4:1)*.92;
    return I*(cdf((w-ay)/s)-cdf((-w-ay)/s))*cdf((X+1)/(s*.7+1))*cdf((P.L-X)/s)};
  const contact=(X,Y,r)=>.72*Math.exp(-Math.pow(Math.max(0,X)/(P.R*.8+9),2))*Math.exp(-Math.pow(Math.max(0,-X)/2.4,2))*Math.exp(-Math.pow(Y/(r*.85+2.4),2));
  return SH_CACHE[name]={soft:tex(cast(true)),cast:tex(cast(false)),contact:tex(contact),K,pad,cy};
}
function buildShadow(name){const T=shadowTex(name),c=new PIXI.Container();
  ['soft','cast','contact'].forEach(k=>{const s=new PIXI.Sprite(T[k]);s.scale.set(SS/T.K);s.position.set(-T.pad*SS,-T.cy*SS);c.addChild(s)});return c}
/* h: 0 = tip on the paper, 1 = tool lifted (the contact fades, the shadow blurs and pales) */
export function shadowHover(sh,h){const[soft,cast,ct]=sh.children;if(!ct)return;sh.alpha=1;cast.alpha=1-h;soft.alpha=.2+.8*h;ct.alpha=Math.pow(1-h,3)}
export function buildTool(tool){
  const name=TOOL_PROF[tool]||'marker',T=cylTex(name),c=new PIXI.Container(),tint=[];
  [['plain',0],['tint',1],['over',0]].forEach(([k,ti])=>{if(!T[k])return;const sp=new PIXI.Sprite(T[k]);sp.scale.set(SS/T.K);sp.position.set(-T.pad*SS,-T.cy*SS);c.addChild(sp);if(ti)tint.push(sp)});
  return{c,sh:buildShadow(name),tint};
}
