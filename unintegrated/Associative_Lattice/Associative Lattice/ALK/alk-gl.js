/**
 * @module       alk-gl
 * @uuid         f9e8d7c6-b5a4-4321-9876-543210fedcba
 * @version      1.0.0
 *
 * ALK-GL — Custom WebGL2 Particle Field Engine
 *
 * Architecture: ping-pong RGBA32F textures. No transform feedback.
 * Each texel = one particle. Texture sampling enables spatial coherence —
 * particles can read their neighbors' state, enabling field dynamics
 * impossible with buffer-based systems.
 *
 * Pass 1 COMPUTE: full-screen quad GLSL integrates curl noise + attractor
 *   gravity + blendshape potential deformation + spatial coherence + entropy.
 *   Writes to output ping-pong textures.
 *
 * Pass 2 RENDER: instanced points, each reads position from state texture
 *   via gl_VertexID. Additive blending. Color = f(entropy, structure, speed).
 *
 * Blendshape deformer: 29 MediaPipe blendshapes → GLSL uniforms →
 *   per-particle potential offset. Eye blink fires collapse+shockwave at iris.
 *   Jaw open expands mouth well. Smile deepens corner wells. Nose sneer
 *   injects rotational turbulence. Cheek puff radial expansion. Gaze direction
 *   biases particles near iris along look vector.
 */
'use strict';

export const ALKGL_UUID    = 'f9e8d7c6-b5a4-4321-9876-543210fedcba';
export const ALKGL_VERSION = '1.0.0';

const MAX_ATT = 64;
const MAX_STR = 8;

// ── GLSL common ────────────────────────────────────────────────────────────────
const GLSL_COMMON = `
precision highp float;
precision highp sampler2D;
float hash21(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+19.19);return fract(p.x*p.y);}
float valueNoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
vec2 curlNoise2D(vec2 p,float z,float t){float e=0.06,px=p.x+z*.18+t*.04,py=p.y+z*.22+t*.05;return vec2((valueNoise(vec2(px,py+e))-valueNoise(vec2(px,py-e)))/(2.0*e),-(valueNoise(vec2(px+e,py))-valueNoise(vec2(px-e,py)))/(2.0*e));}
`;

// ── Compute shaders ────────────────────────────────────────────────────────────
const COMP_VERT = `#version 300 es
in vec2 a_quad; out vec2 v_uv;
void main(){v_uv=a_quad*.5+.5;gl_Position=vec4(a_quad,0,1);}`;

function buildCompFrag(maxAtt, maxStr) {
return `#version 300 es
${GLSL_COMMON}
uniform sampler2D u_sXY,u_sZ;
uniform float u_t,u_dt,u_ent,u_str,u_curl,u_damp,u_vmax,u_bound,u_boundZ;
uniform vec4 u_att[${maxAtt}]; uniform int u_attN;
uniform vec4 u_spPos[${maxStr}],u_spPow[${maxStr}]; uniform int u_strN;
uniform vec2 u_irisL,u_irisR,u_nose,u_mouth,u_lcheek,u_rcheek,u_fore,u_chin;
uniform vec2 u_gazeL,u_gazeR; uniform float u_gazeStr;
uniform float u_bsBlinkL,u_bsBlinkR,u_bsWideL,u_bsWideR,u_bsSquintL,u_bsSquintR;
uniform float u_bsBrowDL,u_bsBrowDR,u_bsBrowIU,u_bsBrowOUL,u_bsBrowOUR;
uniform float u_bsJawOpen,u_bsJawL,u_bsJawR;
uniform float u_bsSmileL,u_bsSmileR,u_bsFrownL,u_bsFrownR,u_bsPucker;
uniform float u_bsStretchL,u_bsStretchR,u_bsDimpleL,u_bsDimpleR;
uniform float u_bsSneerL,u_bsSneerR,u_bsCheekPuff,u_bsCheekSqL,u_bsCheekSqR;
uniform float u_bsTongue;
in vec2 v_uv;
layout(location=0) out vec4 oXY; layout(location=1) out vec4 oZ;

vec2 worldToUV(vec2 wp){return clamp(wp/(u_bound*2.0)+.5,0.01,0.99);}

float localDensity(vec2 pos){
  float d=0.0;
  vec2 uv=worldToUV(pos);
  d+=1.0/(length(texture(u_sXY,uv+vec2(.018,0)).xy-pos)+.4);
  d+=1.0/(length(texture(u_sXY,uv-vec2(.018,0)).xy-pos)+.4);
  d+=1.0/(length(texture(u_sXY,uv+vec2(0,.018)).xy-pos)+.4);
  d+=1.0/(length(texture(u_sXY,uv-vec2(0,.018)).xy-pos)+.4);
  return d*.055;
}

vec2 blendForce(vec2 pos){
  vec2 f=vec2(0);
  // Eye blink: collapse+shockwave
  if(u_bsBlinkL>.25){vec2 d=u_irisL-pos;float dl=length(d);f+=normalize(d)*u_bsBlinkL*.04/(dl+.4);float ring=abs(dl-1.2);if(ring<.9)f-=normalize(d)*u_bsBlinkL*(.9-ring)*.07;}
  if(u_bsBlinkR>.25){vec2 d=u_irisR-pos;float dl=length(d);f+=normalize(d)*u_bsBlinkR*.04/(dl+.4);float ring=abs(dl-1.2);if(ring<.9)f-=normalize(d)*u_bsBlinkR*(.9-ring)*.07;}
  // Jaw open
  if(u_bsJawOpen>.08){vec2 d=u_mouth-pos;float dl=length(d)+.1;f+=normalize(d)*u_bsJawOpen*.05/dl;float vb=pos.y-u_mouth.y;if(vb<0.0)f.y+=u_bsJawOpen*.02;}
  // Brow inner up
  if(u_bsBrowIU>.04){vec2 d=u_fore-pos;float dl=length(d)+.1;f+=normalize(d)*u_bsBrowIU*.035/dl;}
  // Brow down furrow
  float bd=(u_bsBrowDL+u_bsBrowDR)*.5;
  if(bd>.08){vec2 bm=(u_fore+u_nose)*.5;vec2 fb=pos-bm;float dl=length(fb)+.1;if(dl<3.0)f+=normalize(fb)*bd*.03*(3.0-dl)/3.0;}
  // Smile
  float sm=(u_bsSmileL+u_bsSmileR)*.5;
  if(sm>.08){vec2 sL=u_mouth+vec2(-1.2,.3),sR=u_mouth+vec2(1.2,.3);float dL=length(sL-pos)+.1,dR=length(sR-pos)+.1;f+=normalize(sL-pos)*sm*.025/dL+normalize(sR-pos)*sm*.025/dR;}
  // Nose sneer rotation
  float sn=(u_bsSneerL+u_bsSneerR)*.5;
  if(sn>.08){vec2 fn=pos-u_nose;float dl=length(fn)+.1;if(dl<2.5)f+=normalize(vec2(-fn.y,fn.x))*sn*.04*(2.5-dl)/2.5;}
  // Cheek puff
  if(u_bsCheekPuff>.08){vec2 fL=pos-u_lcheek,fR=pos-u_rcheek;float dL=length(fL)+.1,dR=length(fR)+.1;if(dL<3.0)f+=normalize(fL)*u_bsCheekPuff*.04*(3.0-dL)/3.0;if(dR<3.0)f+=normalize(fR)*u_bsCheekPuff*.04*(3.0-dR)/3.0;}
  // Pucker
  if(u_bsPucker>.08){vec2 d=u_mouth-pos;float dl=length(d)+.1;if(dl<2.0)f+=normalize(d)*u_bsPucker*.04/dl;}
  // Tongue out
  if(u_bsTongue>.08){vec2 fm=pos-u_mouth;float dl=length(fm)+.1;if(dl<2.0)f+=normalize(fm)*u_bsTongue*.05*(2.0-dl)/2.0;}
  // Gaze: bias particles near iris along gaze vector
  if(u_gazeStr>.04){float dL=length(pos-u_irisL),dR=length(pos-u_irisR);if(dL<2.5)f+=u_gazeL*u_gazeStr*.04*(2.5-dL)/2.5;if(dR<2.5)f+=u_gazeR*u_gazeStr*.04*(2.5-dR)/2.5;}
  // Eye wide: expand from iris
  float ew=(u_bsWideL+u_bsWideR)*.5;
  if(ew>.15){vec2 fL=pos-u_irisL,fR=pos-u_irisR;float dL=length(fL)+.1,dR=length(fR)+.1;if(dL<2.0)f+=normalize(fL)*ew*.05*(2.0-dL)/2.0;if(dR<2.0)f+=normalize(fR)*ew*.05*(2.0-dR)/2.0;}
  return f;
}

void main(){
  vec4 xy=texture(u_sXY,v_uv),zs=texture(u_sZ,v_uv);
  vec2 pos=xy.rg,vel=xy.ba; float pz=zs.r,vz=zs.g;
  if(any(isnan(pos))||any(isinf(pos))){pos=vel=vec2(0);pz=vz=0.0;}
  float dt=u_dt;
  // Curl
  vec2 cn=curlNoise2D(pos*.32,pz*.18,u_t);
  vel+=cn*u_curl*.011*dt*60.0;
  vz+=(valueNoise(vec2(pos.x*.2,u_t*.03))-.5)*u_curl*.005*dt*60.0;
  // Spatial coherence
  float ld=localDensity(pos);
  if(ld>.8){vec2 uv=worldToUV(pos);vec2 nb=texture(u_sXY,uv+vec2(.01,0)).xy;vec2 away=pos-nb;float dn=length(away)+.01;vel+=normalize(away)*(ld-.8)*.012*dt*60.0;}
  // Attractors
  for(int i=0;i<${maxAtt};i++){if(i>=u_attN)break;vec4 at=u_att[i];vec2 d=at.xy-pos;float d2=dot(d,d)+.15;float dist=sqrt(d2);float mag=at.w*u_str*.08/d2;vel+=normalize(d)*mag*min(dist,3.5)*dt*60.0;float dz2=at.z-pz;vz+=at.w*u_str*.02*dz2/(d2+.1)*dt*60.0;}
  // Blendshape deformer
  vel+=blendForce(pos)*dt*60.0;
  // Entropy
  vec2 seed=v_uv*13.7+vec2(u_t*.017,u_t*.023);
  vel+=vec2(hash21(seed)*2.0-1.0,hash21(seed+vec2(.5,.3))*2.0-1.0)*u_ent*.016*dt*60.0;
  vz+=(hash21(seed+vec2(.7,.1))*2.0-1.0)*u_ent*.005*dt*60.0;
  // Stresses
  for(int i=0;i<${maxStr};i++){if(i>=u_strN)break;vec3 sp=u_spPos[i].xyz;float life=u_spPos[i].w,str2=u_spPow[i].x,rad=u_spPow[i].y;vec2 fw=pos-sp.xy;float d2=dot(fw,fw)+.01,d=sqrt(d2);if(d<rad*3.0){float f2=str2*life/(d2*14.0);vel+=normalize(fw)*f2*dt*60.0;vz+=(pz-sp.z)/(d+.1)*f2*.25*dt*60.0;}}
  // Walls
  float bxy=u_bound*u_str,bz=u_boundZ,wk=.11,wz=1.4;
  vec2 dw=bxy-abs(pos);
  if(dw.x<wz)vel.x+=sign(-pos.x)*wk*(wz-dw.x)*dt*60.0;
  if(dw.y<wz)vel.y+=sign(-pos.y)*wk*(wz-dw.y)*dt*60.0;
  if(bz-abs(pz)<1.0)vz+=sign(-pz)*wk*(1.0-(bz-abs(pz)))*dt*60.0;
  // Damping + clamp
  float dk=1.0-u_damp*.8; vel*=dk; vz*=dk;
  float vm=length(vel); if(vm>u_vmax)vel*=u_vmax/vm;
  vz=clamp(vz,-u_vmax*.5,u_vmax*.5);
  // Integrate
  pos+=vel*dt*60.0; pz+=vz*dt*20.0;
  float hb=bxy+.4,hbz=bz+.4;
  if(pos.x>hb){pos.x=hb;vel.x*=-.3;} if(pos.x<-hb){pos.x=-hb;vel.x*=-.3;}
  if(pos.y>hb){pos.y=hb;vel.y*=-.3;} if(pos.y<-hb){pos.y=-hb;vel.y*=-.3;}
  if(pz>hbz){pz=hbz;vz*=-.3;} if(pz<-hbz){pz=-hbz;vz*=-.3;}
  float spd=min(1.0,length(vel)*5.5);
  oXY=vec4(pos,vel); oZ=vec4(pz,vz,spd,1.0);
}`;
}

// ── Render shaders ─────────────────────────────────────────────────────────────
const REND_VERT = `#version 300 es
${GLSL_COMMON}
uniform sampler2D u_sXY,u_sZ;
uniform vec2 u_texSz; uniform mat4 u_mvp; uniform float u_ptBase;
out float v_spd; out float v_depth;
void main(){
  int id=gl_VertexID;
  vec2 uv=vec2((float(id%int(u_texSz.x))+.5)/u_texSz.x,(float(id/int(u_texSz.x))+.5)/u_texSz.y);
  vec4 xy=texture(u_sXY,uv),zs=texture(u_sZ,uv);
  v_spd=zs.b; v_depth=(zs.r+15.0)/30.0;
  vec4 clip=u_mvp*vec4(xy.r,xy.g,zs.r,1.0);
  gl_Position=clip;
  float ds=clamp(1.0-clip.z/clip.w,.3,2.5);
  gl_PointSize=(u_ptBase+v_spd*1.2)*ds;
}`;

const REND_FRAG = `#version 300 es
precision highp float;
in float v_spd; in float v_depth;
uniform float u_ent,u_str;
out vec4 oCol;
void main(){
  vec2 c=gl_PointCoord-.5; float r=dot(c,c);
  if(r>.25)discard;
  float a=1.0-smoothstep(.15,.25,r);
  float cool=u_str*(1.0-u_ent),warm=u_ent,hot=v_spd;
  vec3 cc=vec3(0.0,.9+cool*.1,.7+cool*.3);
  vec3 wc=vec3(.9+warm*.1,.4+warm*.2,.05);
  vec3 hc=vec3(1.0,.95,.8);
  vec3 col=mix(mix(cc,wc,warm),hc,hot*hot);
  col=mix(col*vec3(.5,.6,.8),col,v_depth);
  float br=(.45+v_spd*.55)*a;
  oCol=vec4(col*br,br*.9);
}`;

// ── Engine ─────────────────────────────────────────────────────────────────────
export class ALKGL {
  constructor(canvas, opts={}) {
    this._canvas = canvas;
    this._N      = opts.N     ?? 80000;
    this._bound  = opts.bound ?? 6;   // tighter: face fills more of world
    this._boundZ = opts.boundZ ?? 4;
    this._texW   = Math.ceil(Math.sqrt(this._N));
    this._texH   = Math.ceil(this._N / this._texW);
    this._texN   = this._texW * this._texH;

    const gl = canvas.getContext('webgl2',{antialias:false,alpha:true,premultipliedAlpha:false});
    if (!gl) throw new Error('[ALK-GL] WebGL2 not supported');
    this._gl = gl;

    if (!gl.getExtension('EXT_color_buffer_float'))
      throw new Error('[ALK-GL] EXT_color_buffer_float required');
    gl.getExtension('OES_texture_float_linear');

    this.field = { entropy:.18, structure:.85, curl:.50, damping:.12, vmax:.17 };
    this._attractors = [];
    this._stresses   = [];
    this._bs  = {};
    this._sk  = { irisL:[0,0],irisR:[0,0],nose:[0,0],mouth:[0,0],lcheek:[-3,0],rcheek:[3,0],fore:[0,4],chin:[0,-4] };
    this._gz  = { L:[0,0], R:[0,0], str:0 };
    this._t   = 0;
    this._mvp = new Float32Array(16);

    this._compProg  = this._prog(COMP_VERT, buildCompFrag(MAX_ATT, MAX_STR));
    this._rendProg  = this._prog(REND_VERT, REND_FRAG);
    this._setupQuadVAO();
    this._rendVAO   = gl.createVertexArray();
    this._ping      = this._mkPair();
    this._pong      = this._mkPair();
    this._upload();
    this._cu        = this._cacheCompUni();
    this._ru        = this._cacheRendUni();
    this._cam       = { fov:1.0, near:.5, far:50, tiltX:.05, camZ:13 };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    this._ro = new ResizeObserver(()=>this._resize());
    this._ro.observe(canvas);
    this._resize();
  }

  _prog(vSrc, fSrc) {
    const gl=this._gl;
    const mk=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('[ALK-GL] '+gl.getShaderInfoLog(s));return s;};
    const p=gl.createProgram();
    gl.attachShader(p,mk(gl.VERTEX_SHADER,vSrc));
    gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fSrc));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('[ALK-GL] '+gl.getProgramInfoLog(p));
    return p;
  }

  _mkTex() {
    const gl=this._gl,t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,this._texW,this._texH,0,gl.RGBA,gl.FLOAT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }

  _mkPair() {
    const gl=this._gl;
    const tXY=this._mkTex(), tZ=this._mkTex();
    const fbo=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tXY,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,tZ,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    const st=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if(st!==gl.FRAMEBUFFER_COMPLETE)throw new Error(`[ALK-GL] FBO 0x${st.toString(16)}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {tXY,tZ,fbo};
  }

  _upload() {
    const gl=this._gl,N=this._texN,W=this._texW,H=this._texH;
    const BZ=this._boundZ*3*.9;
    const dXY=new Float32Array(N*4),dZ=new Float32Array(N*4);
    // Box-Muller for Gaussian initialization — particles spawn near face zone
    // sigma=2.5 so 95% within ±5 world units, centered at (0,0)
    const gauss = () => {
      const u=Math.random()||1e-10, v=Math.random();
      return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
    };
    for(let i=0;i<N;i++){
      dXY[i*4]  = gauss()*2.5;         // X: Gaussian σ=2.5
      dXY[i*4+1]= gauss()*3.0;         // Y: slightly taller range for forehead/chin
      dXY[i*4+2]=(Math.random()-.5)*.025;
      dXY[i*4+3]=(Math.random()-.5)*.025;
      dZ[i*4]   =(Math.random()-.5)*2*BZ;
      dZ[i*4+1] =(Math.random()-.5)*.012;
      dZ[i*4+2] =.15+Math.random()*.15;
      dZ[i*4+3] =1;
    }
    gl.bindTexture(gl.TEXTURE_2D,this._ping.tXY);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,W,H,0,gl.RGBA,gl.FLOAT,dXY);
    gl.bindTexture(gl.TEXTURE_2D,this._ping.tZ);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,W,H,0,gl.RGBA,gl.FLOAT,dZ);
  }

  _setupQuadVAO() {
    const gl=this._gl;
    this._quadVAO=gl.createVertexArray();
    gl.bindVertexArray(this._quadVAO);
    const b=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(this._compProg,'a_quad');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
  }

  _cacheCompUni() {
    const gl=this._gl,p=this._compProg;
    const u=(n)=>gl.getUniformLocation(p,n);
    return {
      sXY:u('u_sXY'),sZ:u('u_sZ'),t:u('u_t'),dt:u('u_dt'),
      ent:u('u_ent'),str:u('u_str'),curl:u('u_curl'),damp:u('u_damp'),
      vmax:u('u_vmax'),bound:u('u_bound'),boundZ:u('u_boundZ'),
      att:u('u_att'),attN:u('u_attN'),
      spPos:u('u_spPos'),spPow:u('u_spPow'),strN:u('u_strN'),
      irisL:u('u_irisL'),irisR:u('u_irisR'),nose:u('u_nose'),mouth:u('u_mouth'),
      lc:u('u_lcheek'),rc:u('u_rcheek'),fore:u('u_fore'),chin:u('u_chin'),
      gazeL:u('u_gazeL'),gazeR:u('u_gazeR'),gazeStr:u('u_gazeStr'),
      // blendshapes
      bsBlinkL:u('u_bsBlinkL'),bsBlinkR:u('u_bsBlinkR'),
      bsWideL:u('u_bsWideL'),bsWideR:u('u_bsWideR'),
      bsSquintL:u('u_bsSquintL'),bsSquintR:u('u_bsSquintR'),
      bsBrowDL:u('u_bsBrowDL'),bsBrowDR:u('u_bsBrowDR'),
      bsBrowIU:u('u_bsBrowIU'),bsBrowOUL:u('u_bsBrowOUL'),bsBrowOUR:u('u_bsBrowOUR'),
      bsJawOpen:u('u_bsJawOpen'),bsJawL:u('u_bsJawL'),bsJawR:u('u_bsJawR'),
      bsSmileL:u('u_bsSmileL'),bsSmileR:u('u_bsSmileR'),
      bsFrownL:u('u_bsFrownL'),bsFrownR:u('u_bsFrownR'),bsPucker:u('u_bsPucker'),
      bsStretchL:u('u_bsStretchL'),bsStretchR:u('u_bsStretchR'),
      bsDimpleL:u('u_bsDimpleL'),bsDimpleR:u('u_bsDimpleR'),
      bsSneerL:u('u_bsSneerL'),bsSneerR:u('u_bsSneerR'),
      bsCheekPuff:u('u_bsCheekPuff'),bsCheekSqL:u('u_bsCheekSqL'),bsCheekSqR:u('u_bsCheekSqR'),
      bsTongue:u('u_bsTongue'),
    };
  }

  _cacheRendUni() {
    const gl=this._gl,p=this._rendProg,u=(n)=>gl.getUniformLocation(p,n);
    return {sXY:u('u_sXY'),sZ:u('u_sZ'),texSz:u('u_texSz'),mvp:u('u_mvp'),ptBase:u('u_ptBase'),ent:u('u_ent'),str:u('u_str')};
  }

  _buildMVP(W,H) {
    const c=this._cam,asp=W/H,fov=c.fov,n=c.near,f=c.far;
    const t=1/Math.tan(fov/2),nf=1/(n-f);
    const P=new Float32Array([t/asp,0,0,0,0,t,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0]);
    const cs=Math.cos(c.tiltX),sn=Math.sin(c.tiltX);
    const V=new Float32Array([1,0,0,0,0,cs,sn,0,0,-sn,cs,0,0,0,-c.camZ,1]);
    const M=new Float32Array(16);
    for(let col=0;col<4;col++)for(let row=0;row<4;row++){let s=0;for(let k=0;k<4;k++)s+=P[k*4+row]*V[col*4+k];M[col*4+row]=s;}
    this._mvp=M;
  }

  step(dt) {
    const gl=this._gl;
    this._t+=dt;
    const strs=this._stresses.slice(0,MAX_STR);
    for(const s of this._stresses)s.life*=(1-dt*2.2);
    this._stresses=this._stresses.filter(s=>s.life>.015);
    const atts=this._attractors.slice(0,MAX_ATT);

    gl.useProgram(this._compProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this._pong.fbo);
    gl.viewport(0,0,this._texW,this._texH);
    gl.disable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this._ping.tXY); gl.uniform1i(this._cu.sXY,0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,this._ping.tZ);  gl.uniform1i(this._cu.sZ,1);

    const cu=this._cu,f=this.field,sk=this._sk,gz=this._gz,bs=this._bs;
    gl.uniform1f(cu.t,this._t); gl.uniform1f(cu.dt,Math.min(dt,.033));
    gl.uniform1f(cu.ent,f.entropy); gl.uniform1f(cu.str,f.structure);
    gl.uniform1f(cu.curl,f.curl); gl.uniform1f(cu.damp,f.damping);
    gl.uniform1f(cu.vmax,f.vmax); gl.uniform1f(cu.bound,this._bound);
    gl.uniform1f(cu.boundZ,this._boundZ);

    const aD=new Float32Array(MAX_ATT*4);
    for(let i=0;i<atts.length;i++){const a=atts[i];aD[i*4]=a.x;aD[i*4+1]=a.y;aD[i*4+2]=a.z??0;aD[i*4+3]=a.mass??1;}
    gl.uniform4fv(cu.att,aD); gl.uniform1i(cu.attN,atts.length);

    const spP=new Float32Array(MAX_STR*4),spW=new Float32Array(MAX_STR*4);
    for(let i=0;i<strs.length;i++){const s=strs[i];spP[i*4]=s.x;spP[i*4+1]=s.y;spP[i*4+2]=s.z??0;spP[i*4+3]=s.life;spW[i*4]=s.strength;spW[i*4+1]=s.radius;}
    gl.uniform4fv(cu.spPos,spP); gl.uniform4fv(cu.spPow,spW); gl.uniform1i(cu.strN,strs.length);

    gl.uniform2fv(cu.irisL,sk.irisL); gl.uniform2fv(cu.irisR,sk.irisR);
    gl.uniform2fv(cu.nose,sk.nose);   gl.uniform2fv(cu.mouth,sk.mouth);
    gl.uniform2fv(cu.lc,sk.lcheek);  gl.uniform2fv(cu.rc,sk.rcheek);
    gl.uniform2fv(cu.fore,sk.fore);   gl.uniform2fv(cu.chin,sk.chin);
    gl.uniform2fv(cu.gazeL,gz.L); gl.uniform2fv(cu.gazeR,gz.R); gl.uniform1f(cu.gazeStr,gz.str);

    // Blendshapes
    gl.uniform1f(cu.bsBlinkL, bs.eyeBlinkLeft??0);    gl.uniform1f(cu.bsBlinkR, bs.eyeBlinkRight??0);
    gl.uniform1f(cu.bsWideL,  bs.eyeWideLeft??0);     gl.uniform1f(cu.bsWideR,  bs.eyeWideRight??0);
    gl.uniform1f(cu.bsSquintL,bs.eyeSquintLeft??0);   gl.uniform1f(cu.bsSquintR,bs.eyeSquintRight??0);
    gl.uniform1f(cu.bsBrowDL, bs.browDownLeft??0);    gl.uniform1f(cu.bsBrowDR, bs.browDownRight??0);
    gl.uniform1f(cu.bsBrowIU, bs.browInnerUp??0);     gl.uniform1f(cu.bsBrowOUL,bs.browOuterUpLeft??0);
    gl.uniform1f(cu.bsBrowOUR,bs.browOuterUpRight??0);
    gl.uniform1f(cu.bsJawOpen,bs.jawOpen??0);         gl.uniform1f(cu.bsJawL,   bs.jawLeft??0);
    gl.uniform1f(cu.bsJawR,   bs.jawRight??0);
    gl.uniform1f(cu.bsSmileL, bs.mouthSmileLeft??0);  gl.uniform1f(cu.bsSmileR, bs.mouthSmileRight??0);
    gl.uniform1f(cu.bsFrownL, bs.mouthFrownLeft??0);  gl.uniform1f(cu.bsFrownR, bs.mouthFrownRight??0);
    gl.uniform1f(cu.bsPucker, bs.mouthPucker??0);
    gl.uniform1f(cu.bsStretchL,bs.mouthStretchLeft??0);gl.uniform1f(cu.bsStretchR,bs.mouthStretchRight??0);
    gl.uniform1f(cu.bsDimpleL,bs.mouthDimpleLeft??0); gl.uniform1f(cu.bsDimpleR,bs.mouthDimpleRight??0);
    gl.uniform1f(cu.bsSneerL, bs.noseSneerLeft??0);   gl.uniform1f(cu.bsSneerR, bs.noseSneerRight??0);
    gl.uniform1f(cu.bsCheekPuff,bs.cheekPuff??0);
    gl.uniform1f(cu.bsCheekSqL,bs.cheekSquintLeft??0);gl.uniform1f(cu.bsCheekSqR,bs.cheekSquintRight??0);
    gl.uniform1f(cu.bsTongue,  bs.tongueOut??0);

    gl.bindVertexArray(this._quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.bindVertexArray(null);

    const tmp=this._ping; this._ping=this._pong; this._pong=tmp;
    gl.enable(gl.BLEND);
  }

  render(W, H, pointSize=1.5) {
    const gl=this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,W,H);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    this._buildMVP(W,H);
    gl.useProgram(this._rendProg);
    const ru=this._ru;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this._ping.tXY); gl.uniform1i(ru.sXY,0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,this._ping.tZ);  gl.uniform1i(ru.sZ,1);
    gl.uniform2f(ru.texSz,this._texW,this._texH);
    gl.uniformMatrix4fv(ru.mvp,false,this._mvp);
    gl.uniform1f(ru.ptBase,pointSize);
    gl.uniform1f(ru.ent,this.field.entropy);
    gl.uniform1f(ru.str,this.field.structure);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.bindVertexArray(this._rendVAO);
    gl.drawArrays(gl.POINTS,0,this._texN);
    gl.bindVertexArray(null);
  }

  // Public API
  upsertAttractor(id,x,y,z=0,mass=1){const i=this._attractors.findIndex(a=>a.id===id);if(i>=0)this._attractors[i]={id,x,y,z,mass};else this._attractors.push({id,x,y,z,mass});}
  removeAttractor(id){this._attractors=this._attractors.filter(a=>a.id!==id);}
  injectStress(x,y,z=0,strength=500,radius=4){this._stresses.push({x,y,z,strength,radius,life:1});if(this._stresses.length>MAX_STR*3)this._stresses.splice(0,1);}
  setBlendshapes(bs){Object.assign(this._bs,bs);}
  setSkeleton(sk){Object.assign(this._sk,sk);}
  setGaze(L,R,str){this._gz.L=L;this._gz.R=R;this._gz.str=str;}
  get N(){return this._texN;}
  get texW(){return this._texW;}
  get texH(){return this._texH;}
  _resize(){const r=this._canvas.getBoundingClientRect(),dpr=devicePixelRatio??1;this._canvas.width=Math.round((r.width||640)*dpr);this._canvas.height=Math.round((r.height||480)*dpr);}
  destroy(){const gl=this._gl;this._ro?.disconnect();for(const p of[this._ping,this._pong]){gl.deleteTexture(p.tXY);gl.deleteTexture(p.tZ);gl.deleteFramebuffer(p.fbo);}gl.deleteProgram(this._compProg);gl.deleteProgram(this._rendProg);}
  health(){return{status:'OK',N:this._texN,texW:this._texW,texH:this._texH,attractors:this._attractors.length,stresses:this._stresses.length,field:{...this.field},t:this._t};}
}
