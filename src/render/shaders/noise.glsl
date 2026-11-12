float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}


/* Animated refractive caustics: 3D simplex noise adapted from Shadertoy Ws23RD. */
vec4 mod289(vec4 x){return x-floor(x/289.0)*289.0;}
vec4 permute(vec4 x){return mod289((x*34.0+1.0)*x);}
vec4 snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  vec3 i=floor(v+dot(v,vec3(C.y)));
  vec3 x0=v-i+dot(i,vec3(C.x));
  vec3 g=step(x0.yzx,x0.xyz),l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy),i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.x,x2=x0-i2+C.y,x3=x0-0.5;
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  vec4 j=p-49.0*floor(p/49.0),x_=floor(j/7.0),y_=floor(j-7.0*x_);
  vec4 x=(x_*2.0+0.5)/7.0-1.0,y=(y_*2.0+0.5)/7.0-1.0,h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy),b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0,s1=floor(b1)*2.0+1.0,sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy,a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 g0=vec3(a0.xy,h.x),g1=vec3(a0.zw,h.y),g2=vec3(a1.xy,h.z),g3=vec3(a1.zw,h.w);
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  vec4 m2=m*m,m3=m2*m,m4=m2*m2;
  vec3 grad=-6.0*m3.x*x0*dot(x0,g0)+m4.x*g0
    -6.0*m3.y*x1*dot(x1,g1)+m4.y*g1
    -6.0*m3.z*x2*dot(x2,g2)+m4.z*g2
    -6.0*m3.w*x3*dot(x3,g3)+m4.w*g3;
  vec4 px=vec4(dot(x0,g0),dot(x1,g1),dot(x2,g2),dot(x3,g3));
  return 42.0*vec4(grad,dot(m4,px));
}
float causticField(vec3 p,out vec2 gradient){
  vec4 n=snoise(p);p-=0.07*n.xyz;
  n=snoise(p);p-=0.07*n.xyz;
  n=snoise(p);gradient=n.xz;
  return exp(n.w*3.0-1.5);
}
vec3 applyCaustics(vec3 base,vec2 pixelPos,float time,float strength,float scale,float speed,float chromatic){
  vec2 q=pixelPos*(0.003*scale),gradient;
  float raw=causticField(vec3(q.x,time*speed,q.y),gradient);
  float light=smoothstep(0.62,1.55,raw);
  // A first-order R/B channel offset along the noise gradient gives a spectral fringe
  // without two extra simplex evaluations for every fragment.
  float split=clamp(length(gradient)*0.11*chromatic,0.0,0.22);
  vec3 spectral=clamp(vec3(light+split,light,light-split),0.0,1.0);
  vec3 gain=vec3(0.80+0.22*light+0.10*spectral.r,
                 0.84+0.20*light+0.10*spectral.g,
                 0.88+0.17*light+0.12*spectral.b);
  base*=mix(vec3(1.0),gain,strength*0.42);
  base+=vec3(spectral.r*0.018,spectral.g*0.045,spectral.b*0.075)*strength;
  return clamp(base,0.0,1.0);
}
