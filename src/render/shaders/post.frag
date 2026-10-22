precision highp float;varying vec2 vUv;
uniform sampler2D uScene;uniform vec2 uRes;uniform float uTilt;uniform float uFocusY;uniform float uBlurG;uniform vec2 uVel;
uniform float uCA;uniform float uVig;uniform float uBloom;uniform float uLeak;uniform vec2 uLeakPos;uniform float uLeakHue;
uniform float uOvs;uniform vec3 uPersp;uniform float uDof;uniform float uBreath;uniform float uTime;uniform float uGrain;uniform float uDust;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
// output pixel -> point on the page plane seen by a tilted camera (+ a touch of barrel distortion and focus breathing)
vec2 warpN(vec2 o,out float w){vec2 n=(o-.5)*2.;float r2=dot(n*vec2(uRes.x/uRes.y,1.),n*vec2(uRes.x/uRes.y,1.))*.25;n*=(1.+uPersp.z*r2)/uBreath;
  w=1./(1.+uPersp.x*n.y+uPersp.y*n.x);return n*w;}
vec3 tap(vec2 uv,vec2 ca){return vec3(texture2D(uScene,uv+ca).r,texture2D(uScene,uv).g,texture2D(uScene,uv-ca).b);}
void main(){
  vec2 o=vUv;float w;vec2 pl=warpN(o,w);vec2 uv=.5+pl*.5/uOvs;
  vec2 px=1./(uRes*uOvs);vec2 dc=o-.5;
  vec2 ca=dc*dot(dc,dc)*uCA*.03/uOvs*w;
  float dy=abs(o.y-uFocusY);
  float r=uTilt*smoothstep(.1,.42,dy)*12.+uBlurG;
  // depth of field from the tilted page: the further a point is from the focus depth, the softer it gets
  if(uDof>0.){float wf=1./(1.+uPersp.x*(uFocusY-.5)*2.);r+=uDof*smoothstep(.02,.22,abs(w-wf))*9.;}
  float vl=length(uVel);
  vec3 col;
  if(r<.6&&vl<1.){col=tap(uv,ca);}
  else{vec3 acc=vec3(0.);for(int i=0;i<28;i++){float fi=float(i);float a=fi*2.39996;float rr=sqrt((fi+.5)/28.)*r;vec2 of=vec2(cos(a),sin(a))*rr+uVel*((fi+.5)/28.-.5);acc+=tap(uv+of*px*w,ca);}col=acc/28.;}
  if(uBloom>0.){vec3 b=vec3(0.);for(int i=0;i<12;i++){float fi=float(i);float a=fi*.5236+.3;vec2 of=vec2(cos(a),sin(a))*uRes.y*.016*(1.+mod(fi,3.));vec3 s=texture2D(uScene,uv+of*px).rgb;b+=max(s-.86,0.);}col+=b/12.*uBloom*2.2*vec3(1.,.95,.88);}
  float lum=dot(col,vec3(.299,.587,.114));
  // dust on the lens: only shows up where the image is bright
  if(uDust>0.){vec2 q=o*vec2(uRes.x/uRes.y,1.)*5.;float d=smoothstep(.74,.9,vn(q+3.7))*.6+smoothstep(.8,.95,vn(q*2.3+11.))*.4;col+=d*uDust*smoothstep(.7,1.,lum)*.07*vec3(1.,.97,.92);}
  if(uLeak>0.){vec2 q=o-uLeakPos;q.x*=uRes.x/uRes.y;float d=length(q);vec3 lc=mix(vec3(1.,.58,.32),vec3(1.,.42,.62),uLeakHue);col=1.-(1.-col)*(1.-lc*exp(-d*d*2.6)*uLeak*.6);}
  if(uVig>0.){vec2 v=dc*vec2(uRes.x/uRes.y,1.);float vd=length(v)/length(vec2(.5*uRes.x/uRes.y,.5));col*=1.-uVig*.75*smoothstep(.35,1.05,vd);}
  // sensor grain: fine, alive every frame, a bit stronger in the shadows, slightly coloured
  if(uGrain>0.){vec2 g=o*uRes+vec2(fract(uTime*7.31)*913.,fract(uTime*3.17)*471.);float n=h21(g)+h21(g+17.3)-1.;vec3 cn=vec3(h21(g+3.1),h21(g+5.7),h21(g+9.3))-.5;
    col+=(n*.85+cn*.3)*uGrain*.055*(1.15-.75*lum);}
  gl_FragColor=vec4(col,1.);
}
