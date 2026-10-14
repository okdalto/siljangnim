from pathlib import Path
import sys,types,json,time
import numpy as np,torch,soundfile as sf
from diffusers import UNet1DModel
# Load the unchanged standalone sampler without importing optional model-registry
# constructors. This namespace has the original package's real source path;
# every sampler, schedule, data utility and vendored dependency runs unchanged.
root=Path(sys.argv[1])/'stable_audio_tools';pkg=types.ModuleType('stable_audio_tools');pkg.__path__=[str(root)];sys.modules['stable_audio_tools']=pkg
from stable_audio_tools.inference.sampling import sample_v
out=Path('out');out.mkdir(exist_ok=True);torch.set_num_threads(2);torch.set_num_interop_threads(1)
network=UNet1DModel.from_pretrained(str(Path(sys.argv[2])/'unet'),local_files_only=True,use_safetensors=False);network.eval();network.to('cpu');rate=int(network.config.sample_rate);length=int(network.config.sample_size);assert rate==48000 and length==65536
# The adapter only unwraps Diffusers' result object; the pretrained network
# predicts the same velocity used by the original Stable Audio Tools DDIM loop.
def velocity(x,t,**kwargs):return network(x,t).sample
frames=[]
for index,seed in enumerate([17,29,43]):
 torch.manual_seed(seed);noise=torch.randn(1,2,length);schedule=torch.linspace(1,0,49)[:-1];trace=[];start=time.monotonic()
 def callback(data):
  assert torch.isfinite(data['denoised']).all();trace.append(dict(step=int(data['i'])+1,rms=float(data['denoised'].square().mean().sqrt())))
 with torch.no_grad():generated=sample_v(velocity,noise,schedule,eta=0,callback=callback,disable_tqdm=True)
 audio=generated[0].cpu().numpy().T;assert audio.shape==(65536,2) and np.isfinite(audio).all();raw_peak=float(np.abs(audio).max());gain=.9/max(1e-6,raw_peak);audio=audio*gain;rms=float(np.sqrt(np.mean(audio**2)));assert .001<rms<.8
 sf.write(out/f'audio-{index}.wav',audio,rate,subtype='PCM_16');mono=audio.mean(axis=1);waveform=[[float(a.min()),float(a.max())] for a in np.array_split(mono,240)]
 frames.append(dict(label=f'Seed {seed}',seed=seed,steps=48,sampleRate=rate,samples=length,duration=length/rate,rms=rms,rawPeak=raw_peak,playbackGain=gain,waveform=waveform,trace=trace));print('Generated original sampler seed',seed,'RMS',rms,'seconds',time.monotonic()-start,flush=True)
(out/'result.json').write_text(json.dumps(dict(engine='Stable Audio Tools original sample_v DDIM',network='Harmonai jmann-small-190k Dance Diffusion',device='CPU',frames=frames),indent=2)+'\n')
