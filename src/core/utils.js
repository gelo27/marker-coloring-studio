export const SS=2,TAU=Math.PI*2;
export const $=id=>document.getElementById(id);
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>t*t*(3-2*t);
export const ease3=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
export function mk(w,h){const c=document.createElement('canvas');c.width=Math.max(1,w);c.height=Math.max(1,h);return c}
export function rngOf(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function hex(c){return parseInt(c.slice(1),16)}
export function hsl2hex(h,s,l){const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h*12)%12;const c=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(c*255).toString(16).padStart(2,'0')};return '#'+f(0)+f(8)+f(4)}
export function hex2hsl(c){const n=hex(c),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6}return[h,s,l]}
export function lighten(h,k){const n=hex(h);const r=(n>>16)&255,g=(n>>8)&255,b=n&255;const f=v=>Math.round(v+(255-v)*k).toString(16).padStart(2,'0');return '#'+f(r)+f(g)+f(b)}
export function noiseAt(x,y){const s=Math.sin(x*12.9898+y*78.233)*43758.5453;return s-Math.floor(s)}
export function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),fx=smooth(x-xi),fy=smooth(y-yi);return lerp(lerp(noiseAt(xi,yi),noiseAt(xi+1,yi),fx),lerp(noiseAt(xi,yi+1),noiseAt(xi+1,yi+1),fx),fy)}
export function rgbHex(r,g,b){return '#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('')}
export function colDist(a,b){const x=hex(a),y=hex(b);return Math.hypot(((x>>16)&255)-((y>>16)&255),((x>>8)&255)-((y>>8)&255),(x&255)-(y&255))}
export function smoothstep2(a,b,x){return smooth(clamp((x-a)/(b-a),0,1))}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const VNT=new Float32Array(4096);{const r=rngOf(99);for(let i=0;i<4096;i++)VNT[i]=r()}
export function vnA(x){const i=Math.floor(x),f=x-i,u=f*f*(3-2*f),a=VNT[i&4095],b=VNT[(i+1)&4095];return a+(b-a)*u}
