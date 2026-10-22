import * as WebMMuxer from 'webm-muxer';
import * as Mp4Muxer from 'mp4-muxer';
import {SND,audioCtx,ensureAudio,pickAudio,stopAudio} from '../audio/audio.js';
import {SR} from '../audio/synth.js';
import {plan,planDirty} from '../core/plan.js';
import {FLQ,FORMATS,OUT,PREV,isMobileUI,view} from '../core/settings.js';
import {$,clamp,sleep} from '../core/utils.js';
import {ed,renderEditor} from '../editor/editor.js';
import {camInit,camStep} from '../render/camera.js';
import {OUTF,setOutroFont} from '../render/outro.js';
import {resetPaint} from '../render/paint.js';
import {renderAt} from '../render/renderer.js';
import {app,applyFormat} from '../render/scene.js';
import {T,busy,playing,rebuild,seek,setBusy,setMode,setPlayIcon,setPlaying,setT,updateUI} from './playback.js';
/* ================= EXPORT ================= */
export let lastBlob=null,lastName='',lastAudio='off';
export async function pickCodec(w,h,fps,bitrate,webm){
  for(const codec of(webm?['vp09.00.40.08','vp09.00.10.08','vp8']:['avc1.640033','avc1.64002A','avc1.640028','avc1.4D0033','avc1.42E033','avc1.42E028'])){try{const s=await VideoEncoder.isConfigSupported({codec,width:w,height:h,bitrate,framerate:fps});if(s.supported)return codec}catch(e){}}
  return null;
}
export const REN={cancel:false};
/* Phones & tablets: while the video renders, the picture fills the screen with only the progress and a cancel button
   on top (a cover that swallows every other tap); the page skips its own UI work (timeline, scrub bar, labels). */
const HUD={on:false,wasFs:false};
function hudStart(){if(!isMobileUI())return;const st=document.querySelector('.stage');HUD.on=true;HUD.wasFs=st.classList.contains('pfs');
  st.classList.add('pfs','rendering');document.body.classList.add('fs','rendering');$('renderHud').hidden=false;hud(0,'Готую рендер…');
  const el=document.documentElement,rq=el.requestFullscreen||el.webkitRequestFullscreen;if(rq&&!(document.fullscreenElement||document.webkitFullscreenElement)){try{const p=rq.call(el,{navigationUI:'hide'});if(p&&p.catch)p.catch(()=>{})}catch(e){}}}
function hud(p,txt){if(!HUD.on)return;$('rhProg').style.width=(p*100).toFixed(1)+'%';$('rhPct').textContent=Math.floor(p*100)+'%';if(txt!=null)$('rhInfo').textContent=txt}
function hudEnd(){if(!HUD.on)return;HUD.on=false;const st=document.querySelector('.stage');st.classList.remove('rendering');document.body.classList.remove('rendering');$('renderHud').hidden=true;
  if(!HUD.wasFs){st.classList.remove('pfs');document.body.classList.remove('fs');if(document.fullscreenElement||document.webkitFullscreenElement){const x=document.exitFullscreen||document.webkitExitFullscreen;try{const p=x.call(document);if(p&&p.catch)p.catch(()=>{})}catch(e){}}}}
/* bitrate for a frame size: 22 Mb/s at 1080p60 (15 at 30 fps), scaled by pixel count and the chosen quality */
export const VQ={high:1.5,std:1,small:.55};
export function videoBitrate(W,H,fps){return Math.round((fps===60?22e6:15e6)*Math.max(.45,W*H/(1080*1920))*(VQ[$('vq')&&$('vq').value]||1))}
/* expected file size for the current settings (video + 192 kb/s audio) */
export function estimateExport(){if(!plan)return null;const res=+$('res').value,fps=+$('fps').value,[w,h]=FORMATS[view.fmt].map(v=>Math.round(v*res/1080/2)*2);
  const br=videoBitrate(w,h,fps)+(SND.on?192000:0);return{mb:br*plan.total/8/1048576,w,h,frames:Math.ceil(plan.total*fps)}}
export async function exportVideo(){
  if(busy)return;
  if(ed.on)setMode('anim');if(planDirty)rebuild(false);
  setBusy(true);setPlaying(false);stopAudio();setPlayIcon();REN.cancel=false;hudStart();
  if(OUT.on&&document.fonts&&!OUTF){try{const f=await document.fonts.load('100px "Permanent Marker"');if(f&&f.length)setOutroFont(true)}catch(e){}}
  const btn=$('render');btn.disabled=true;$('cancelRender').hidden=false;$('progBox').hidden=false;$('result').hidden=true;$('save').hidden=true;$('prog').style.width='0';
  FLQ.res=FLQ.render;let wl=null;try{if(navigator.wakeLock)wl=await navigator.wakeLock.request('screen')}catch(e){}
  const res=+$('res').value,fmt=view.fmt,keepT=T,webm=$('vfmt').value==='webm',ext=webm?'webm':'mp4';PREV.exporting=true;applyFormat(fmt,res/1080);
  const fps=+$('fps').value,W=view.W,H=view.H,frames=Math.ceil(plan.total*fps),bitrate=videoBitrate(W,H,fps);
  let enc=null,aenc=null,ok=false;
  try{
    const MX=webm?WebMMuxer:Mp4Muxer;
    if(typeof VideoEncoder==='undefined'||!MX)throw new Error('nocodec');
    const codec=await pickCodec(W,H,fps,bitrate,webm);if(!codec)throw new Error('nocodec');
    let A=null,ac=null,aerr=null,aPos=0;
    if(SND.on){$('renderInfo').textContent='Генерую звук…';hud(0,'Генерую звук…');A=await ensureAudio(true);ac=A?await pickAudio(webm):null}
    if(REN.cancel)throw new Error('cancel');
    const mo=webm?{target:new MX.ArrayBufferTarget(),video:{codec:codec==='vp8'?'V_VP8':'V_VP9',width:W,height:H,frameRate:fps}}:{target:new MX.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:fps},fastStart:'in-memory'};
    if(ac)mo.audio={codec:ac.mux,numberOfChannels:2,sampleRate:SR};
    const muxer=new MX.Muxer(mo);
    if(ac){aenc=new AudioEncoder({output:(ch,meta)=>muxer.addAudioChunk(ch,meta),error:e=>{aerr=e}});aenc.configure({codec:ac.codec,sampleRate:SR,numberOfChannels:2,bitrate:192000})}
    const pushAudio=until=>{while(aPos<until){const n=Math.min(4800,until-aPos),b=new Float32Array(n*2);for(let k=0;k<n;k++){const q=aPos+k;b[k]=q<A.N?clamp(A.L[q]*SND.vol,-1,1):0;b[n+k]=q<A.N?clamp(A.R[q]*SND.vol,-1,1):0}
      const ad=new AudioData({format:'f32-planar',sampleRate:SR,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(aPos/SR*1e6),data:b});aenc.encode(ad);ad.close();aPos+=n}};
    lastAudio=ac?ac.name:(SND.on?'none':'off');
    let err=null;enc=new VideoEncoder({output:(ch,meta)=>muxer.addVideoChunk(ch,meta),error:e=>{err=e}});
    const vc={codec,width:W,height:H,bitrate,framerate:fps};if(!webm)vc.avc={format:'avc'};enc.configure(vc);
    resetPaint();camInit();const t0=performance.now();
    for(let i=0;i<frames;i++){
      if(REN.cancel)throw new Error('cancel');
      if(err)throw err;const v=i/fps;if(i>0)camStep(v,1/fps);renderAt(v);setT(v);
      const vf=new VideoFrame(app.view,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
      enc.encode(vf,{keyFrame:i%(fps*2)===0});vf.close();
      if(aenc){if(aerr)throw aerr;pushAudio(Math.round((i+1)/fps*SR))}
      while(enc.encodeQueueSize>4)await sleep(2);
      if(i%4===0){const p=(i+1)/frames;$('prog').style.width=(p*100)+'%';const el=(performance.now()-t0)/1000;$('renderInfo').textContent='Кадр '+(i+1)+' з '+frames+' · залишилось ≈ '+Math.max(0,Math.round(el/p-el))+' с';document.title=Math.round(p*100)+'% · Marker Coloring Studio';if(HUD.on)hud(p,'Кадр '+(i+1)+' з '+frames+' · ≈ '+Math.max(0,Math.round(el/p-el))+' с');else updateUI();await sleep(0)}
    }
    await enc.flush();if(aenc)await aenc.flush();muxer.finalize();
    lastBlob=new Blob([muxer.target.buffer],{type:'video/'+ext});lastName='marker-coloring-'+fmt+'-'+Math.round(plan.total)+'s-'+res+'p-'+fps+'fps.'+ext;ok=true;
  }catch(e){
    const m=String(e&&e.message);
    if(m==='nocodec'){$('renderInfo').textContent='Браузер не має '+(webm?'VP9/VP8':'H.264')+'-кодера, записую WebM у реальному часі…';try{await recordRealtime(fps,res);ok=!REN.cancel}catch(e2){}}
    else if(m!=='cancel')$('renderInfo').textContent='Рендер зупинився: '+(e&&e.message||e)+'. Спробуйте 30 fps, 720p або інший формат.';
  }finally{
    try{if(enc&&enc.state!=='closed')enc.close()}catch(e){}try{if(aenc&&aenc.state!=='closed')aenc.close()}catch(e){}
    hudEnd();PREV.exporting=false;applyFormat(fmt);FLQ.res=FLQ.prev;document.title='Marker Coloring Studio';try{if(wl)wl.release()}catch(e){}setBusy(false);btn.disabled=false;$('cancelRender').hidden=true;
  }
  if(REN.cancel){$('renderInfo').textContent='Рендер скасовано.';$('progBox').hidden=true;seek(keepT);return}
  if(!ok){seek(keepT);return}
  $('prog').style.width='100%';
  $('renderInfo').textContent='Готово: '+lastName+' · '+(lastBlob.size/1048576).toFixed(1)+' МБ'+(lastAudio==='off'?'':lastAudio==='none'?' · без звуку: браузер не вміє кодувати аудіо':' · звук '+lastAudio);
  const vd=$('result');vd.src=URL.createObjectURL(lastBlob);vd.hidden=false;$('save').hidden=false;
  seek(keepT);
}
export async function recordRealtime(fps,res){
  const stream=app.view.captureStream(fps);let asrc=null;
  if(SND.on){const A=await ensureAudio(true),ctx=audioCtx();if(A&&ctx){if(ctx.state==='suspended')await ctx.resume();const dest=ctx.createMediaStreamDestination(),b=ctx.createBuffer(2,A.N,SR);b.copyToChannel(A.L,0);b.copyToChannel(A.R,1);
    asrc=ctx.createBufferSource();asrc.buffer=b;const g=ctx.createGain();g.gain.value=SND.vol;asrc.connect(g);g.connect(dest);dest.stream.getAudioTracks().forEach(tk=>stream.addTrack(tk));lastAudio='Opus'}}
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm;codecs=vp9','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:16e6});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
  resetPaint();camInit();setT(0);rec.start();if(asrc)asrc.start();
  await new Promise(res=>{let last=performance.now();const step=now=>{const dt=Math.min(.05,(now-last)/1000);last=now;setT(T+dt);camStep(T,dt);renderAt(T);if(HUD.on)hud(T/plan.total,'Запис у реальному часі…');else updateUI();$('prog').style.width=(T/plan.total*100)+'%';if(T<plan.total&&!REN.cancel)requestAnimationFrame(step);else res()};requestAnimationFrame(step)});
  if(asrc)try{asrc.stop()}catch(e){}
  rec.stop();await new Promise(r=>rec.onstop=r);
  lastBlob=new Blob(chunks,{type:'video/webm'});lastName='marker-coloring-'+view.fmt+'-'+(res||1080)+'p.webm';
}
export async function saveBlob(blob,name,info){
  let dl=null;try{dl=window.claude&&await window.claude.use('downloads')}catch(e){}
  if(dl){try{await dl.save({filename:name,data:blob});info('Файл збережено: '+name)}catch(e){info(e&&e.code==='declined'?'Збереження скасовано.':'Не вдалося зберегти файл тут.')}return}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();info('Файл збережено: '+name);
}
export async function saveFrame(){
  if(busy)return;if(ed.on)renderEditor(performance.now()/1000);else if(!playing)renderAt(T);
  const blob=await new Promise(r=>app.view.toBlob(r,'image/png'));if(!blob)return;
  const name='frame-'+view.fmt+'-'+T.toFixed(2).replace('.','_')+'s.png';
  await saveBlob(blob,name,m=>{$('renderInfo').textContent=m});
}
export async function saveVideo(){
  if(!lastBlob)return;let dl=null;try{dl=window.claude&&await window.claude.use('downloads')}catch(e){}
  if(dl){try{await dl.save({filename:lastName,data:lastBlob});$('renderInfo').textContent='Файл збережено: '+lastName}catch(e){$('renderInfo').textContent=e&&e.code==='declined'?'Збереження скасовано.':'Не вдалося зберегти файл тут. Відкрийте відео в плеєрі й збережіть через його меню.'}return}
  const a=document.createElement('a');a.href=URL.createObjectURL(lastBlob);a.download=lastName;document.body.appendChild(a);a.click();a.remove();
}
