from pathlib import Path
import os,sys,json,tempfile,time
import numpy as np,torch,soundfile as sf
sys.path.insert(0,sys.argv[1]);os.environ['ACESTEP_DISABLE_TQDM']='1'
from acestep.handler import AceStepHandler
from acestep.inference import GenerationParams,GenerationConfig,generate_music
assert torch.backends.mps.is_available(),'This verified recipe requires Apple Silicon MPS.'
torch.set_num_threads(2)
h=AceStepHandler();h.device='mps';h.dtype=torch.float16
# Use original component loaders to select float16 within 16 GB unified memory.
# The convenience initializer forces float32 on MPS; no model code is patched.
model=Path(sys.argv[2]);checkpoint=model/'acestep-v15-turbo'
h._sync_model_code_if_needed('acestep-v15-turbo',model)
h._load_main_model_from_checkpoint(model_checkpoint_path=str(checkpoint),device='mps',use_flash_attention=False,compile_model=False,quantization=None)
h._load_vae_model(checkpoint_dir=str(model),device='mps',compile_model=False)
h._load_text_encoder_and_tokenizer(checkpoint_dir=str(model),device='mps')
out=Path('out');out.mkdir(exist_ok=True);frames=[]
items=[('Gentle piano','A gentle instrumental piano melody with warm sustained chords, spacious and calm, no vocals.',80),('Percussion groove','An instrumental percussion groove with crisp hand drums, shakers and a steady relaxed beat, no vocals.',100),('Warm synthesizer','A slow instrumental electronic piece with warm sustained synthesizer chords and a simple soft bass pulse, no vocals.',80)]
for i,(label,caption,bpm) in enumerate(items):
 p=GenerationParams(caption=caption,lyrics='[Instrumental]',instrumental=True,bpm=bpm,keyscale='C Major',timesignature='4',duration=10,inference_steps=8,seed=17,thinking=False,use_cot_metas=False,use_cot_caption=False,use_cot_language=False)
 c=GenerationConfig(batch_size=1,use_random_seed=False,seeds=[17],audio_format='wav')
 with tempfile.TemporaryDirectory(prefix='ace-step-') as temporary:
  start=time.monotonic();r=generate_music(h,None,p,c,save_dir=temporary);assert r.success,r.error
  audio,rate=sf.read(r.audios[0]['path'],dtype='float32',always_2d=True)
 assert rate==48000 and audio.shape==(480000,2) and np.isfinite(audio).all()
 rms=float(np.sqrt(np.mean(audio**2)));peak=float(np.abs(audio).max());assert .001<rms<.8 and peak<=1
 sf.write(out/f'audio-{i}.wav',audio,rate,subtype='PCM_16');mono=audio.mean(axis=1)
 frames.append(dict(label=label,caption=caption,seed=17,bpm=bpm,steps=8,sampleRate=rate,samples=len(audio),duration=len(audio)/rate,rms=rms,peak=peak,waveform=[[float(a.min()),float(a.max())] for a in np.array_split(mono,240)]))
 print('Generated',label,'RMS',rms,'seconds',time.monotonic()-start,flush=True)
 del r;torch.mps.empty_cache()
(out/'result.json').write_text(json.dumps(dict(engine='ACE-Step 1.5 original text-to-music',device='Apple Silicon MPS float16',model='acestep-v15-turbo',frames=frames),indent=2)+'\n')
