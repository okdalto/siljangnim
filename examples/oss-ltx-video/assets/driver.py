from pathlib import Path
import sys,os,json,importlib.util
source_root=Path(sys.argv[1]);model_path=Path(sys.argv[2]);sys.path.insert(0,str(source_root));os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
import torch,numpy as np,imageio.v2 as imageio
from PIL import Image,ImageDraw
from ltx_video.models.autoencoders.causal_video_autoencoder import CausalVideoAutoencoder
from ltx_video.models.autoencoders.vae_encode import vae_encode,vae_decode
torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.manual_seed(17);np.random.seed(17);out=Path('out');out.mkdir(exist_ok=True);size=128;input_frames=[]
for i in range(17):
 y,x=np.mgrid[:size,:size]/(size-1);frame=np.stack([.1+.3*x,.12+.3*y,.2+.1*x],axis=-1);cx=.22+.56*i/16;cy=.5+.15*np.sin(i/16*np.pi*2);mask=(x-cx)**2+(y-cy)**2<.16**2;frame[mask]=[.94,.52,.18];frame[(abs(x-.5)<.035)&(abs(y-.5)<.32)]=[.15,.85,.75];input_frames.append((frame*255).round().astype('uint8'))
with imageio.get_writer(out/'input.mkv',fps=8,codec='ffv1',pixelformat='bgr0',macro_block_size=1,output_params=['-fflags','+bitexact']) as writer:
 for frame in input_frames:writer.append_data(frame)
reader=imageio.get_reader(out/'input.mkv','ffmpeg');actual=np.stack([frame for frame in reader]);reader.close();assert np.array_equal(actual,np.stack(input_frames))
model=CausalVideoAutoencoder.from_pretrained(model_path,torch_dtype=torch.float32).eval();video=torch.from_numpy(actual.copy()).permute(3,0,1,2)[None].float()/127.5-1
with torch.inference_mode():
 latent=vae_encode(video,model,vae_per_channel_normalize=True);assert torch.isfinite(latent).all();np.save(out/'encoded.npy',latent.detach().cpu().numpy());print('Original encoded',list(latent.shape),flush=True)
 decoded=vae_decode(latent,model,is_video=True,vae_per_channel_normalize=True,timestep=torch.zeros((1,)))
assert torch.isfinite(decoded).all();images=((decoded[0].permute(1,2,3,0).float().cpu().clamp(-1,1).numpy()+1)*127.5).round().astype('uint8');assert images.shape==actual.shape;frames=[];atlas=Image.new('RGB',(640*3,360*6))
for k,i in enumerate(range(17)):
 im=Image.new('RGB',(640,360),'#0b1625');draw=ImageDraw.Draw(im);draw.text((32,24),f'Input frame {i+1}',fill='#a9bdd0');draw.text((344,24),'Original VAE reconstruction',fill='#a9bdd0')
 for x,frame in [(32,actual[i]),(344,images[i])]:im.paste(Image.fromarray(frame).resize((264,264),Image.Resampling.NEAREST),(x,55))
 loss=float(np.mean((images[i].astype(float)/255-actual[i]/255)**2));im.save(out/f'render-{k}.png');atlas.paste(im,((i%3)*640,(i//3)*360));frames.append(dict(image=f'render-{k}.png',frame=i,loss=loss))
mse=float(np.mean((images.astype(float)/255-actual/255)**2));assert mse<.02,'Unexpected reconstruction error'
assert float(images.std())>5
atlas.save(out/'frames.png')
(out/'result.json').write_text(json.dumps(dict(engine='Original LTX-Video causal VAE',device='CPU',dtype='float32',seed=17,resolution=size,inputFrames=17,reconstructionMSE=mse,latentShape=list(latent.shape),frames=frames),indent=2)+'\n');print('Original decoded',list(decoded.shape),'MSE',float(np.mean((images.astype(float)/255-actual/255)**2)),flush=True)
