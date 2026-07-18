/* MUSICVIZ — audio-core (shared). Pure, DOM-free, zero-dep.
   Same code proven in audio-core.test.js. Attaches makeAudioCore / makeFixture / AC_BANDS
   to window. Feed it byte FFT frames (AnalyserNode.getByteFrequencyData) + dt + now. */
(function(root){
  'use strict';
  var AC_BANDS = [['sub',20,60],['bass',60,250],['lowmid',250,500],['mid',500,2000],['highmid',2000,6000],['treble',6000,16000]];
  function clamp(x,a,b){ return x<a?a:(x>b?b:x); }
  function follow(prev,x,dt,atk,rel){ var tau=x>prev?atk:rel, k=1-Math.exp(-dt/Math.max(tau,1e-4)); return prev+(x-prev)*k; }
  function median(arr){ if(!arr.length) return 0; var a=arr.slice().sort(function(p,q){return p-q;}), m=a.length>>1; return a.length&1?a[m]:0.5*(a[m-1]+a[m]); }

  function makeAudioCore(opts){
    opts=opts||{};
    var sampleRate=opts.sampleRate||48000, fftSize=opts.fftSize||2048, binCount=fftSize>>1, binHz=sampleRate/fftSize;
    var bandBins=AC_BANDS.map(function(b){ var lo=Math.max(1,Math.round(b[1]/binHz)), hi=Math.min(binCount-1,Math.round(b[2]/binHz)); return [Math.min(lo,hi),Math.max(lo,hi)]; });
    var ENV_FS=200, ENV_LEN=ENV_FS*6;
    var prevMag=new Float32Array(binCount), envGrid=new Float32Array(ENV_LEN), envHead=0, envAcc=0, envFilled=0, noveltyEnv=0;
    var fluxRing=[], FLUX_N=90, agc=AC_BANDS.map(function(){return {lo:0,hi:0.01};});
    var lastOnset=-1, onsetEnv=0, prevFlux=0, dtEMA=1/60;
    var bpm=0, conf=0, phase=0, beatCount=0, bpmAcc=0, override=null, srcTap=false, taps=[], trim=0;
    var features={ rms:0,centroid:0,flux:0,onset:0,
      bands:{sub:0,bass:0,lowmid:0,mid:0,highmid:0,treble:0},
      env:{bassFast:0,bassSlow:0,midFast:0,midSlow:0,highFast:0,highSlow:0,rmsSlow:0},
      beat:{bpm:0,conf:0,phase:0,beatN:0,barN:0,phraseN:0,source:'auto',onBeat:false,onBar:false,onPhrase:false},
      _bandBins:bandBins,_binHz:binHz,_binCount:binCount };

    function estimateBPM(){
      if(envFilled<ENV_LEN*0.5) return;
      var i,j,N=ENV_LEN,raw=new Float32Array(N),mean=0;
      for(i=0;i<N;i++){ raw[i]=envGrid[(envHead+i)%N]; mean+=raw[i]; } mean/=N;
      for(i=0;i<N;i++) raw[i]-=mean;
      var R=Math.max(4,Math.min(16,Math.round(1.4*ENV_FS*dtEMA))), b=new Float32Array(N), e0=0;
      for(i=0;i<N;i++){ var a=0,c=0; for(j=-R;j<=R;j++){ var idx=i+j; if(idx>=0&&idx<N){a+=raw[idx];c++;} } b[i]=a/c; e0+=b[i]*b[i]; }
      if(e0<1e-9) return; var energyAvg=e0/N;
      var STEP=0.5,bpms=[],scores=[],best=0,cb;
      for(cb=60;cb<=200;cb+=STEP){ var lag=ENV_FS*60/cb,l0=Math.floor(lag),fr=lag-l0,s=0;
        for(i=l0+1;i<N;i++) s+=b[i]*(b[i-l0]*(1-fr)+b[i-l0-1]*fr);
        s=(s/(N-l0))/energyAvg; bpms.push(cb); scores.push(s); if(s>best)best=s; }
      if(best<=0) return; var thr=best*0.90, chosen=-1;
      for(i=scores.length-2;i>=1;i--){ if(scores[i]>=thr&&scores[i]>=scores[i-1]&&scores[i]>=scores[i+1]){ chosen=i; break; } }
      if(chosen<0){ for(i=0;i<scores.length;i++) if(scores[i]===best){chosen=i;break;} }
      var out=bpms[chosen];
      if(chosen>0&&chosen<scores.length-1){ var y0=scores[chosen-1],y1=scores[chosen],y2=scores[chosen+1],den=(y0-2*y1+y2); if(Math.abs(den)>1e-9) out=bpms[chosen]+0.5*STEP*(y0-y2)/den; }
      bpm=out; conf=clamp(scores[chosen],0,1);
    }
    function process(freq,time,dt,now){
      dt=dt||1/60; dtEMA=dtEMA*0.95+dt*0.05; var i,b,N=binCount;
      var flux=0,centNum=0,centDen=0;
      for(i=0;i<N;i++){ var m=freq[i]/255,d=m-prevMag[i]; if(d>0)flux+=d; centNum+=i*m; centDen+=m; prevMag[i]=m; }
      flux/=N; var centroid=centDen>1e-6?clamp((centNum/centDen)/N,0,1):0;
      var bandsRaw=new Array(6);
      for(b=0;b<6;b++){ var lo=bandBins[b][0],hi=bandBins[b][1],sum=0; for(i=lo;i<=hi;i++) sum+=freq[i]/255; bandsRaw[b]=sum/(hi-lo+1); }
      var kRelax=1-Math.exp(-dt/8);
      for(b=0;b<6;b++){ var g=agc[b],r=bandsRaw[b]; if(r>g.hi)g.hi=r; else g.hi+=(r-g.hi)*kRelax; if(r<g.lo)g.lo=r; else g.lo+=(r-g.lo)*kRelax;
        features.bands[AC_BANDS[b][0]]=clamp((r-g.lo)/Math.max(g.hi-g.lo,1e-3),0,1); }
      var rms; if(time){ var acc=0; for(i=0;i<time.length;i++){ var v=(time[i]-128)/128; acc+=v*v; } rms=Math.sqrt(acc/time.length); } else rms=(bandsRaw[1]+bandsRaw[3]+bandsRaw[4])/3;
      var med=median(fluxRing),devs=fluxRing.map(function(x){return Math.abs(x-med);}),mad=median(devs),thr=med+2.2*mad+1e-4,onsetNow=false;
      if(flux>thr&&flux>prevFlux&&(now-lastOnset)>0.11){ onsetEnv=clamp((flux-thr)/(mad*4+1e-4),0.25,1); lastOnset=now; onsetNow=true; } else onsetEnv*=Math.exp(-dt/0.12);
      prevFlux=flux; fluxRing.push(flux); if(fluxRing.length>FLUX_N) fluxRing.shift();
      noveltyEnv=Math.max(flux,noveltyEnv*Math.exp(-dt/0.06));
      envAcc+=dt; var stepT=1/ENV_FS,guard=0;
      while(envAcc>=stepT&&guard++<ENV_FS){ envGrid[envHead]=noveltyEnv; envHead=(envHead+1)%ENV_LEN; if(envFilled<ENV_LEN)envFilled++; envAcc-=stepT; }
      bpmAcc+=dt; if(bpmAcc>=0.1){ estimateBPM(); bpmAcc=0; }
      var e=features.env,bd=features.bands;
      e.bassFast=follow(e.bassFast,bd.bass,dt,0.01,0.15); e.bassSlow=follow(e.bassSlow,bd.bass,dt,0.30,2.0);
      e.midFast=follow(e.midFast,bd.mid,dt,0.01,0.15); e.midSlow=follow(e.midSlow,bd.mid,dt,0.30,2.0);
      e.highFast=follow(e.highFast,bd.treble,dt,0.01,0.15); e.highSlow=follow(e.highSlow,bd.treble,dt,0.30,2.0);
      e.rmsSlow=follow(e.rmsSlow,rms,dt,0.30,2.0);
      /* BRYK 2026-07-18: trim is added ON TOP of whatever the clock says and deliberately
         does NOT set `override`, so the PLL phase correction below keeps running. nudge()
         sets override and therefore freezes detection — that is the wrong tool for "add a
         little in real time". Use setTrim() for that and shift() to align the downbeat. */
      var beat=features.beat,useBpm=override!=null?override:bpm;
      if(useBpm>0&&trim) useBpm=clamp(useBpm+trim,20,300);
      beat.onBeat=beat.onBar=beat.onPhrase=false;
      if(useBpm>0){ var per=60/useBpm; phase+=dt/per; if(onsetNow&&override==null){ var err=phase-Math.round(phase); phase-=0.10*err; }
        while(phase>=1){ phase-=1; beatCount++; beat.onBeat=true; if(beatCount%4===0)beat.onBar=true; if(beatCount%16===0)beat.onPhrase=true; } }
      features.rms=rms; features.centroid=centroid; features.flux=flux; features.onset=onsetEnv;
      beat.bpm=useBpm; beat.conf=conf; beat.phase=phase; beat.beatN=beatCount; beat.barN=((beatCount%16)/4)|0; beat.phraseN=(beatCount/16)|0;
      beat.source=srcTap?'tap':(override!=null?'manual':'auto');
      return features;
    }
    function tap(now){ taps.push(now); taps=taps.filter(function(t){return now-t<3;}); if(taps.length>=4){ var gaps=[]; for(var i=1;i<taps.length;i++) gaps.push(taps[i]-taps[i-1]); var g=median(gaps); if(g>0.2&&g<1.2){ override=60/g; srcTap=true; phase=0; } } }
    function nudge(d){ if(override==null) override=bpm||120; override=clamp(override+d,40,220); srcTap=false; }
    function setBPM(v){ override=clamp(v,40,220); srcTap=false; }
    function resync(){ phase=0; } function auto(){ override=null; srcTap=false; trim=0; }
    /* BRYK additions — live trim and phase alignment, both non-destructive:
       setTrim  · ± offset on the effective tempo; detection and PLL keep running underneath.
       shift    · slide the beat phase by a fraction of a beat WITHOUT touching tempo.
                  resync() slams the phase to 0 (downbeat = now); shift() only leans on it,
                  which is what "nudge it into the groove" actually means. */
    function setTrim(v){ trim=clamp(+v||0,-30,30); }
    function getTrim(){ return trim; }
    function shift(d){ phase=(phase+d)%1; if(phase<0)phase+=1; }
    return { process:process,tap:tap,nudge:nudge,setBPM:setBPM,resync:resync,auto:auto,
             setTrim:setTrim,getTrim:getTrim,shift:shift,
             features:features,bandBins:bandBins,binHz:binHz,binCount:binCount,fftSize:fftSize,sampleRate:sampleRate };
  }
  function makeFixture(bpm,opts){ opts=opts||{}; var fftSize=opts.fftSize||2048,binCount=fftSize>>1,per=60/bpm,clickDur=0.045,buf=new Uint8Array(binCount);
    function frame(now){ var since=now-Math.floor(now/per)*per,hot=since<clickDur;
      for(var i=0;i<binCount;i++){ var n=Math.sin(i*12.9898+78.233)*43758.5453; n=n-Math.floor(n); var floor=14+n*10; buf[i]=hot?Math.min(255,200+(n*55)|0):(floor|0); } return buf; } return {frame:frame,bpm:bpm}; }

  root.makeAudioCore=makeAudioCore; root.makeFixture=makeFixture; root.AC_BANDS=AC_BANDS;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:this));
