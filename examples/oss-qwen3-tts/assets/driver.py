from pathlib import Path
import json,os,sys,time
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
out=Path('out');out.mkdir(exist_ok=True)
torch.set_num_threads(2);torch.set_num_interop_threads(1)
torch.manual_seed(17)
print('Loading original Qwen3-TTS 0.6B CustomVoice on CPU',flush=True)
model=Qwen3TTSModel.from_pretrained(sys.argv[1],device_map='cpu',dtype=torch.float32,attn_implementation='eager',local_files_only=True)
print('Loaded voices',model.get_supported_speakers(),flush=True)
frames=[]
for i,voice in enumerate(['Ryan','Aiden','Serena']):
 torch.manual_seed(17)
 text='Welcome to the studio.';started=time.monotonic()
 wavs,sr=model.generate_custom_voice(text=text,language='English',speaker=voice,do_sample=False,subtalker_dosample=False,max_new_tokens=128)
 audio=np.asarray(wavs[0],dtype=np.float32).reshape(-1)
 assert sr==24000 and np.isfinite(audio).all() and sr*.5<len(audio)<sr*11
 rms=float(np.sqrt(np.mean(audio**2)));assert .001<rms<.5
 peak=float(np.abs(audio).max());assert peak<=1
 sf.write(out/f'audio-{i}.wav',audio,sr,subtype='PCM_16')
 # Min/max pairs preserve short transients in the displayed waveform.
 chunks=np.array_split(audio,240);waveform=[[float(x.min()),float(x.max())] for x in chunks]
 frames.append(dict(label=voice,text=text,sampleRate=sr,samples=len(audio),duration=len(audio)/sr,rms=rms,peak=peak,waveform=waveform,file=f'audio-{i}.wav'))
 print(voice,len(audio)/sr,'seconds; generation',time.monotonic()-started,flush=True)
(out/'result.json').write_text(json.dumps(dict(engine='Qwen3-TTS 0.6B CustomVoice',device='CPU',seed=17,frames=frames),indent=2)+'\n')
