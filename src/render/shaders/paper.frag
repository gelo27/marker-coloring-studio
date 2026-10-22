precision highp float;varying vec2 vUv;varying vec2 vPos;
uniform sampler2D uColor;uniform sampler2D uLine;uniform sampler2D uPattern;uniform sampler2D uSel;uniform sampler2D uMat;uniform sampler2D uParams;uniform sampler2D uGlit;uniform sampler2D uHeight;
uniform sampler2D uWet0;uniform sampler2D uWet1;uniform vec4 uWetRect0;uniform vec4 uWetRect1;uniform float uWetStr;
uniform float uPatStr;uniform float uPatScale;uniform float uGrain;uniform float uShine;uniform float uSS;uniform float uSelOn;uniform float uTime;uniform vec2 uTexel;
uniform float uCamV;uniform float uRelief;uniform float uCamPhase;uniform float uNS;uniform float uGloss;uniform float uDefMat;uniform float uFlat;uniform float uPxS;uniform float uDuoShift;uniform float uGlitDens;
#include noise
float worley(vec2 p){vec2 i=floor(p),f=fract(p);float d=1.5;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hash(i+g),hash(i+g+19.31));d=min(d,length(g+o-f));}return d;}
vec3 paintify(vec3 c){float l=dot(c,vec3(.299,.587,.114));c=clamp(mix(vec3(l),c,1.45),0.,1.);return mix(c,smoothstep(0.,1.,c),.5);}
vec3 hueRot(vec3 c,float a){vec3 k=vec3(.57735);float cs=cos(a);return c*cs+cross(k,c)*sin(a)+k*dot(k,c)*(1.-cs);}
float relief(vec2 p){return (1.-worley(p/6.5))*.55+vn(p*.42)*.3+vn(p*1.25)*.15;}
/* scattered hexagonal flakes: jittered cells, random presence/size/rotation, 3x3 search so no cell edges show */
float flk(vec2 p,float sz,float ang,float seed,float dens,out float br,out float hj){
  float cs=cos(ang),sn=sin(ang);vec2 q=mat2(cs,-sn,sn,cs)*p/sz+seed;vec2 i=floor(q),f=fract(q);
  float best=0.;br=0.;hj=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y)),c=i+g;float h=hash(c);if(h>dens)continue;
    vec2 o=vec2(hash(c+7.1),hash(c+3.3));float r=.2+.32*hash(c+5.7),a=hash(c+9.1)*6.283;
    vec2 d=g+o-f;d=mat2(cos(a),-sin(a),sin(a),cos(a))*d;
    float shp=max(abs(d.x)*.866+abs(d.y)*.5,abs(d.y));
    float m=1.-smoothstep(r*.72,r,shp);
    if(m>best){best=m;br=hash(c+11.3);hj=hash(c+2.9);}}
  return best;}
vec3 glitterOn(vec2 px,vec3 base,vec3 viv,float dens,float amt){
  float aa=clamp((2.2*uPxS-1.)/1.6,0.,1.);
  vec3 avg=mix(base,viv*1.05,clamp(dens*.85,0.,1.)*amt);
  float gc=hash(floor(px/7.)+.5),gl=step(.965,gc)*pow(max(0.,sin(gc*90.+uCamPhase*1.7)),18.);
  vec3 far=avg+vec3(1.)*gl*amt*1.4;
  if(aa<=0.)return far;
  vec3 col=base;float b,h,f;
  for(int k=0;k<3;k++){float fk=float(k);
    f=flk(px,k==0?2.7:k==1?1.9:3.5,.37+fk*1.17,1.3+fk*3.7,dens*(1.-fk*.18),b,h);
    if(f<=0.)continue;
    vec3 irid=.5+.5*cos(6.283*(h+vec3(0.,.33,.67)));
    vec3 fc=clamp(viv*(.5+.95*b)+(irid-.5)*.28,0.,1.3);
    col=mix(col,fc,f*amt);
    float s=pow(max(0.,sin(b*61.+uCamPhase*(.5+h*2.4)+h*6.)),24.);
    col+=mix(vec3(1.),clamp(viv+.45,0.,1.),.35)*s*f*amt*(1.5+step(.85,b)*2.2);}
  return mix(far,col,aa);}
float wetS(sampler2D t,vec4 r,vec2 uv){vec2 q=(uv-r.xy)/max(r.zw,vec2(1e-5));if(r.z<=0.||q.x<0.||q.y<0.||q.x>1.||q.y>1.)return 0.;return texture2D(t,q).a;}
void main(){
  vec2 px=vPos/uSS;
  float g=fbm(px*.011);float fine=vn(px*.55)-.5;float fib=vn(vec2(px.x*.05+px.y*.012,px.y*.42))-.5;
  float tone=.97+uGrain*(.07*(g-.5)+.05*fine+.025*fib);
  vec3 paper=vec3(1.,.995,.985)*tone;
  float h=.5+fine*.5;
  if(uRelief>0.){h=relief(px);float hx=relief(px+vec2(.9,0.)),hy=relief(px+vec2(0.,.9));float sh=(h-hx)*1.5+(h-hy)*1.5;paper*=1.+sh*uRelief*.5-(.5-h)*uRelief*.07;}
  vec4 c=texture2D(uColor,vUv);
  vec3 ink=c.a>.002?c.rgb/c.a:vec3(1.);
  // material of this pixel (each zone can use its own tool)
  float mid=uDefMat;vec4 mt=texture2D(uMat,vUv);if(mt.a>.5&&uFlat<.5)mid=floor(mt.r/mt.a*255./20.+.5);
  float mx=(mid+.5)/16.;
  vec4 P0=texture2D(uParams,vec2(mx,.5/3.))*2.,P1=texture2D(uParams,vec2(mx,1.5/3.))*2.,P2=texture2D(uParams,vec2(mx,2.5/3.))*2.;
  float mPat=P0.x,mTooth=P0.y,mTS=P0.z*2.,mGran=P0.w,mRim=P1.x,mBeer=P1.y,mChalk=P1.z,mSpray=P1.w,mGlit=P2.x,mThick=P2.y,mGlue=P2.z,mDuo=P2.w;
  if(uFlat>.5){mThick=0.;mGlue=0.;mDuo=0.;mGlit=0.;}
  float pat=uPatStr*mPat;
  vec2 q=px/(256.*.75*uPatScale);
  float p1=texture2D(uPattern,q).r;float p2=texture2D(uPattern,mat2(.8,-.6,.6,.8)*q*.73+.37).r;
  float det=(p1*.62+p2*.38)-.5;
  float wet=clamp(wetS(uWet0,uWetRect0,vUv)+wetS(uWet1,uWetRect1,vUv),0.,1.)*uWetStr;
  float cov=c.a*(1.-pat*.55*max(det,0.)*2.2*(1.-wet*.8))*(1.-uGrain*.1*max(fine,0.));
  vec3 inkT=ink*(1.+det*pat*.9*(1.-wet*.6))*(1.-.04*pat);
  if(mTooth>0.){float tt=h*.55+vn(px*mTS)*.45;float thr=1.-cov*(1.05+mTooth*.3);float dep=smoothstep(thr-.1,thr+.1,tt)*min(1.,cov*1.5);cov=mix(cov,dep,clamp(mTooth,0.,1.));}
  if(mChalk>0.){inkT=mix(inkT,vec3(1.),mChalk*.13);inkT*=1.-mChalk*.1*(vn(px*.7)-.5);cov*=1.-mChalk*.25*step(.93,hash(floor(px*.8)));}
  if(mSpray>0.){float sp=hash(floor(px*1.3));cov=clamp(cov*.45+step(1.-cov*1.15,sp)*.6*min(1.,cov*2.2),0.,1.);}
  float duoSp=0.;vec3 duoF=vec3(0.);
  if(mDuo>0.){ // colour-shift (duochrome) pigment: mica flakes under a thin film. Which of the two colours you see
    // follows thin-film interference, cos(4*pi*n*d*cos(theta)/lambda): theta changes smoothly across the page
    // (perspective) and as the camera moves, so the flip sweeps over the paint as a soft band with an iridescent seam.
    float fh=vn(px*.55)*.6+vn(px*1.3+5.)*.4;vec2 ft=vec2(vn(px*.7+11.3),vn(px*.7+27.1))-.5;
    float va=dot(px,vec2(.0011,.0008))+uCamV+(vn(px*.0013)-.5)*1.3;
    float cosT=clamp(.6+.32*sin(va)+.02*(ft.x+ft.y),.1,1.);
    float dn=1.48*(300.+uDuoShift*60.);
    float t=.5-.5*cos(12.566*dn*cosT/560.);t=smoothstep(.12,.88,t);
    vec3 cA=paintify(inkT),cB=paintify(hueRot(inkT,uDuoShift));
    vec3 F=.5-.5*cos(12.566*dn*cosT/vec3(640.,535.,455.));
    float seam=4.*t*(1.-t);
    inkT=mix(cA,cB,t);inkT=mix(inkT,inkT*.6+F*.55,seam*.35);inkT*=.97+.06*fh;duoF=F;
    vec2 L=vec2(.32*sin(va*1.9+1.),.32*cos(va*1.4));duoSp=pow(max(0.,1.-length(ft-L)*3.),8.)*smoothstep(.45,.7,fh)*.8;}
  vec3 col;
  if(mBeer>0.){
    float dens=1.;
    if(mGran>0.)dens*=1.+mGran*.8*(.5-h)+mGran*.45*(fbm(px*.006+3.1)-.5);
    if(mRim>0.){float nl=0.;for(int i=0;i<8;i++){float a=float(i)*.7854;nl=max(nl,texture2D(uLine,vUv+vec2(cos(a),sin(a))*uTexel*uSS*7.).a);}
      float nl2=0.;for(int i=0;i<8;i++){float a=float(i)*.7854+.39;nl2=max(nl2,texture2D(uLine,vUv+vec2(cos(a),sin(a))*uTexel*uSS*12.).a);}
      dens*=1.+mRim*(.5*nl+.2*nl2);}
    float k=cov*mBeer*dens*(1.+wet*.4);
    col=paper*pow(clamp(inkT,.03,1.),vec3(k));
  }else col=paper*mix(vec3(1.),clamp(inkT,0.,1.),clamp(cov,0.,1.));
  if(mDuo>0.){col+=(duoF*.7+.3)*duoSp*.55*cov;col=mix(col,col*col*(3.-2.*col),.18*cov*mDuo);}
  if(mGlue>0.){ // glue (clear, glossy) that turns into dense glitter where it was sprinkled
    float gA=texture2D(uGlit,vUv).a,gl=smoothstep(.15,.6,c.a);
    vec3 glue=paper*.9+vec3(.07)+vec3(1.)*pow(vn(px*.06+vec2(uTime*.03,0.)),4.)*.35*(1.-gA);
    col=mix(paper,glue,gl*(1.-gA));
    if(gA>0.&&gl>0.){float lum=dot(ink,vec3(.3,.59,.11));vec3 viv=clamp(mix(vec3(lum),ink,1.6),0.,1.);
      vec3 base=mix(glue,viv*.42,min(1.,gA*1.6));
      col=mix(col,glitterOn(px,base,viv,uGlitDens*clamp(gA*1.25,0.,1.),1.),gl*min(1.,gA*3.));}
  }
  if(mThick>.5){
    vec2 o=uTexel*uSS*2.2,q1=uTexel*uSS*1.2;
    float hS=(c.a*2.+texture2D(uColor,vUv+vec2(q1.x,0.)).a+texture2D(uColor,vUv-vec2(q1.x,0.)).a+texture2D(uColor,vUv+vec2(0.,q1.y)).a+texture2D(uColor,vUv-vec2(0.,q1.y)).a)/6.;
    float mask=smoothstep(.34,.46,hS);
    float hb=texture2D(uHeight,vUv).a;
    float hL=texture2D(uHeight,vUv-vec2(o.x,0.)).a,hR=texture2D(uHeight,vUv+vec2(o.x,0.)).a,hD=texture2D(uHeight,vUv-vec2(0.,o.y)).a,hU=texture2D(uHeight,vUv+vec2(0.,o.y)).a;
    vec2 so=vec2(5.,8.)*uSS*uTexel;float sh=0.;
    for(int i=0;i<8;i++){float a=float(i)*.785;sh+=texture2D(uHeight,vUv-so+vec2(cos(a),sin(a))*5.*uSS*uTexel).a;}
    sh=smoothstep(.15,.85,sh/8.);
    vec3 pap=paper*(1.-.36*sh),lit=pap;
    if(mask>.001){
      vec2 grad=vec2(hR-hL,hU-hD)*.5;
      vec3 N=normalize(vec3(-grad*uNS,1.));
      vec3 Lg=normalize(vec3(-.5,-.62,.61)),V=vec3(0.,0.,1.),Hh=normalize(Lg+V);
      float df=max(dot(N,Lg),0.),wr=clamp((df+.35)/1.35,0.,1.);
      float ndh=max(dot(N,Hh),0.),gls=uGloss*(.8+.7*wet);
      float spec=pow(ndh,70.)*1.25*gls+pow(ndh,8.4)*.2*gls;
      float rim=pow(1.-max(dot(N,V),0.),3.5)*.24;
      vec3 base=paintify(ink);
      float depth=smoothstep(.3,.92,hb),edgeShade=mix(.55,1.,depth);
      lit=base*(.36+.82*wr)*edgeShade+vec3(spec)*(.55+.45*depth)+(base*.5+vec3(.06))*rim+vec3(.025)*wr;
      lit*=1.+.05*(vn(px*.6)-.5);
    }
    col=mix(pap,clamp(lit,0.,1.),mask);
  }
  float spec=smoothstep(.55,.95,(uRelief>.5?h:p1*.7)+vn(px*.08)*.4)*wet;
  col+=vec3(1.,.98,.95)*spec*.3+vec3(.06)*wet*smoothstep(.3,.9,vn(px*.012+uTime*.05));
  if(mGlit>0.&&cov>.04){ // glitter gel
    float cv=smoothstep(.12,.55,cov);
    float lum=dot(ink,vec3(.3,.59,.11));vec3 viv=clamp(mix(vec3(lum),ink,1.75),0.,1.);
    vec3 base=col*(1.-.25*cv);
    col=mix(col,glitterOn(px,base,viv,.62,mGlit),cv);
  }
  float l=texture2D(uLine,vUv).a;
  col=mix(col,vec3(.16,.12,.19)*(.92+.16*g),l*.97);
  float d=(px.x*.62+px.y*.78)/1500.-uShine;float band=exp(-d*d/.0035);
  col+=vec3(1.,.97,.93)*band*.28*clamp(c.a,0.,1.)*(.7+.6*p1);
  if(uSelOn>.5){float s=texture2D(uSel,vUv).a;if(s>.01){float st=step(.5,fract((px.x+px.y)/26.-uTime*.6));col=mix(col,mix(vec3(.89,.25,.44),vec3(1.),st*.55),s*.42);}}
  gl_FragColor=vec4(col,1.);
}
