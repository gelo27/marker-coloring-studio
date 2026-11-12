precision highp float;varying vec2 vUv;varying vec2 vPos;uniform sampler2D uPattern;uniform sampler2D uDesk;uniform vec3 uTint;uniform float uSS;
uniform float uMode;uniform vec2 uTexSize;uniform float uScale;uniform vec4 uRect;uniform float uBright;uniform float uBlur;
uniform float uTime;uniform float uCausticsOn;uniform float uCausticsStrength;uniform float uCausticsScale;uniform float uCausticsSpeed;uniform float uCausticsChromatic;
#include noise
void main(){vec2 px=vPos/uSS;vec3 c;
  if(uMode<.5){float p=texture2D(uPattern,px/310.).r;float g=fbm(px*.004);c=uTint*(.93+.1*(p-.5)+.08*(g-.5));}
  else if(uMode<1.5){c=texture2D(uDesk,px/(uTexSize*uScale),uBlur).rgb;}
  else{c=texture2D(uDesk,(vPos-uRect.xy)/uRect.zw,uBlur).rgb;}
  c*=uBright;
  if(uCausticsOn>.5)c=applyCaustics(c,px,uTime,uCausticsStrength,uCausticsScale,uCausticsSpeed,uCausticsChromatic);
  gl_FragColor=vec4(c,1.);}