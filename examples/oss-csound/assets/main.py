import pathlib,sys,subprocess,wave,json,numpy as np
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,index in enumerate([.5,2,5]):
 csd=f'''<CsoundSynthesizer>
<CsOptions>
-d -m0 -W -s -o {out/f'audio-{i}.wav'}
</CsOptions>
<CsInstruments>
sr = 48000
ksmps = 32
nchnls = 1
0dbfs = 1
instr 1
 aenv linseg 0, 0.02, 0.5, p3-0.22, 0.5, 0.2, 0
 asig foscil aenv, 220, 1, 2, p4, 1
 out asig
endin
</CsInstruments>
<CsScore>
f 1 0 16384 10 1
i 1 0 2 {index}
e
</CsScore>
</CsoundSynthesizer>
''';source=out/f'patch-{i}.csd';source.write_text(csd);audio=out/f'audio-{i}.wav';audio.unlink(missing_ok=True);subprocess.run([sys.argv[1],str(source)],check=True)
 with wave.open(str(audio),'rb') as w:
  assert w.getframerate()==48000 and w.getnchannels()==1 and w.getsampwidth()==2;samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
 assert len(samples)==96000 and np.isfinite(samples).all() and .01<np.max(np.abs(samples))<.99
 spectrum=np.abs(np.fft.rfft(samples[24000:24000+16384]*np.hanning(16384)));freq=np.fft.rfftfreq(16384,1/48000);spectrum/=spectrum.max();keep=freq<=3000
 paths=[{'points':np.column_stack([np.linspace(-.9,.9,1200),samples[24000:25200]*.7+.48]).tolist(),'color':'#57d8c6'},{'points':np.column_stack([-.9+freq[keep]/3000*1.8,-.7+spectrum[keep]*.65]).tolist(),'color':'#ffbc78'}];frames.append({'index':index,'samples':len(samples),'sampleRate':48000,'rms':float(np.sqrt(np.mean(samples*samples))),'paths':paths})
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original Csound FM synthesis; 2 seconds per result')
