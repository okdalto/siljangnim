from pathlib import Path
import json
import torch,numpy as np,soundfile as sf,onnxruntime as ort
ort.set_seed(17);np.random.seed(17);torch.manual_seed(17)
from services.tts_backend import KittenTTSBackend
# This is the original app backend, including its original text cleanup,
# chunking and ONNX token-budget preflight. Fixed English preset voices need
# no OmniVoice language-selection model, reference recording or app account.
torch.set_num_threads(2);m=KittenTTSBackend();text='Welcome to the studio. Let us make something together.';out=Path('out');out.mkdir(exist_ok=True);frames=[]
for i,voice in enumerate(['expr-voice-2-f','expr-voice-3-m','expr-voice-5-f']):
 audio=m.generate(text,voice=voice,speed=1).numpy().reshape(-1);assert np.isfinite(audio).all();rms=float(np.sqrt(np.mean(audio**2)));assert .001<rms<.9
 sf.write(out/f'audio-{i}.wav',audio,m.sample_rate,subtype='PCM_16')
 frames.append(dict(label=voice,text=text,samples=len(audio),sampleRate=m.sample_rate,duration=len(audio)/m.sample_rate,rms=rms,peak=float(np.abs(audio).max()),waveform=[[float(a.min()),float(a.max())] for a in np.array_split(audio,240)]));print('Generated',voice,'samples',len(audio),'RMS',rms,flush=True)
(out/'result.json').write_text(json.dumps(dict(engine='Original VoiceStudio KittenTTSBackend',model='KittenML/kitten-tts-mini-0.8',device='CPU',frames=frames),indent=2)+'\n')
