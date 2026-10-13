import pathlib,sys,json,wave
import numpy as np
from PIL import Image,ImageDraw
import essentia.standard as e
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);sr=44100;n=4096;frames=[];win=e.Windowing(type='hann');spectrum=e.Spectrum(size=n);mel=e.MelBands(inputSize=n//2+1,numberBands=40,sampleRate=sr,lowFrequencyBound=50,highFrequencyBound=8000);mfcc=e.MFCC(inputSize=n//2+1,sampleRate=sr,numberCoefficients=13);pitch=e.PitchYinFFT(frameSize=n,sampleRate=sr,minFrequency=100,maxFrequency=1500)
for k,harmonics in enumerate([[(1,1)],[(h,1/h) for h in range(1,9)],[(h,1/h) for h in range(1,10,2)]]):
 notes=[220.,277.1826,329.6276,440.];parts=[];detected=[]
 for hz in notes:
  t=np.arange(sr//3)/sr;signal=sum(gain*np.sin(2*np.pi*hz*h*t) for h,gain in harmonics);signal=signal/(sum(g for _,g in harmonics)+.01)*.8;parts.append(signal);spec=spectrum(win(signal[4000:4000+n].astype('float32')));p,confidence=pitch(spec);assert abs(p-hz)/hz<.025 and confidence>.8;detected.append(dict(expected=hz,detected=float(p),confidence=float(confidence)))
 signal=np.concatenate(parts).astype('float32');bands=[];coeff=[]
 for frame in e.FrameGenerator(signal,frameSize=n,hopSize=512,startFromZero=True):
  spec=spectrum(win(frame));bands.append(mel(spec));coeff.append(mfcc(spec)[1].tolist())
 values=np.log10(np.maximum(np.array(bands).T,1e-10));v=np.clip((values+8)/7,0,1);rgb=np.stack([20+235*v,25+150*np.sqrt(v),45+120*(1-v)],axis=-1).astype('uint8');im=Image.fromarray(rgb[::-1]).resize((512,440));canvas=Image.new('RGB',(512,512),'#09131f');canvas.paste(im,(0,30));ImageDraw.Draw(canvas).text((12,482),['Pure tones','Full harmonics','Odd harmonics'][k]+' / 40 native Mel bands',fill='white');canvas.save(out/f'render-{k}.png')
 with wave.open(str(out/f'audio-{k}.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes((signal*32767).astype('<i2').tobytes())
 frames.append(dict(harmonics=harmonics,pitches=detected,melBands=np.array(bands).tolist(),mfcc=coeff));print(k,detected)
(out/'result.json').write_text(json.dumps(dict(engine='Essentia 2.1b6.dev1389',frames=frames),allow_nan=False))
