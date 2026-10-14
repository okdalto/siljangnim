from pathlib import Path
import json,wave
import numpy as np
import tensorflow as tf
from ddsp.synths import Harmonic
out=Path('out');out.mkdir(exist_ok=True)
tf.random.set_seed(17);samples=32000;rate=16000;controls=200
synth=Harmonic(n_samples=samples,sample_rate=rate,scale_fn=None)
time=np.linspace(0,2,controls,dtype=np.float32)
f0=tf.constant((220+3*np.sin(time*2*np.pi*4))[None,:,None])
envelope=tf.constant((np.sin(np.pi*np.linspace(0,1,controls))**.8)[None,:,None],dtype=tf.float32)
partials=np.arange(1,17,dtype=np.float32)
frames=[]
for index,(label,weights) in enumerate([('Soft harmonics',np.exp(-partials*.55)),('Odd harmonics',(partials%2)/partials),('Bright harmonics',1/partials)]):
 distribution=tf.constant(np.tile(weights,(1,controls,1)),dtype=tf.float32);gain=tf.Variable(.3,dtype=tf.float32)
 with tf.GradientTape() as tape:
  audio=synth(envelope*gain,distribution,f0)
  energy=tf.reduce_mean(audio**2)
 gradient=float(tape.gradient(energy,gain));expected=2*float(energy)/float(gain)
 assert np.isfinite(gradient) and abs(gradient-expected)<1e-4
 signal=audio.numpy()[0];assert signal.shape==(samples,) and np.isfinite(signal).all() and .01<float(np.sqrt(np.mean(signal**2)))<.3
 pcm=(np.clip(signal,-1,1)*32767).round().astype('<i2')
 with wave.open(str(out/f'audio-{index}.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(pcm.tobytes())
 # Show 40 ms from the middle of the original native waveform.
 start=16000;view=signal[start:start+640];frames.append(dict(label=label,samples=samples,sampleRate=rate,rms=float(np.sqrt(np.mean(signal**2))),energyGradient=gradient,expectedGradient=expected,paths=[dict(points=[[-.95+i/639*1.9,float(-v*2)] for i,v in enumerate(view)],color='#57d8c6')]))
(out/'result.json').write_text(json.dumps(dict(frames=frames)))
print('PASS original DDSP harmonic synthesis and amplitude-energy automatic derivatives')
