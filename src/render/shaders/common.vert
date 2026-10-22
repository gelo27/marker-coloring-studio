precision highp float;attribute vec2 aVertexPosition;attribute vec2 aUvs;uniform mat3 translationMatrix;uniform mat3 projectionMatrix;varying vec2 vUv;varying vec2 vPos;
void main(){vUv=aUvs;vPos=aVertexPosition;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0)).xy,0.0,1.0);}
