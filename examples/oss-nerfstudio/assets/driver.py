from pathlib import Path
import sys,os,json,time,math
sys.path.insert(0,sys.argv[1]);os.environ['TORCH_HOME']=sys.argv[2]
import torch,numpy as np
from PIL import Image,ImageDraw
from nerfstudio.models.vanilla_nerf import VanillaModelConfig
from nerfstudio.data.scene_box import SceneBox
from nerfstudio.cameras.rays import RayBundle
torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.manual_seed(17);np.random.seed(17)
size=24;origins=[];directions=[];targets=[]
for angle in [-25,0,25]:
 a=math.radians(angle);origin=torch.tensor([2.5*math.sin(a),.25,2.5*math.cos(a)]);forward=-origin/torch.linalg.norm(origin);right=torch.linalg.cross(forward,torch.tensor([0.,1.,0.]));right/=torch.linalg.norm(right);up=torch.linalg.cross(right,forward)
 y,x=torch.meshgrid(torch.linspace(.55,-.55,size),torch.linspace(-.55,.55,size),indexing='ij');d=forward+x[...,None]*right+y[...,None]*up;d=d/torch.linalg.norm(d,dim=-1,keepdim=True);o=origin.expand_as(d);od=(o*d).sum(-1);disc=od**2-(o.square().sum(-1)-.75**2);hit=disc>0;t=-od-torch.sqrt(disc.clamp_min(0));normal=(o+t[...,None]*d)/.75;color=(normal*.5+.5)*(.35+.65*(normal*torch.tensor([.2,.8,.6])).sum(-1).clamp_min(0)[...,None]);color=torch.where(hit[...,None],color,torch.zeros_like(color)).clamp(0,1)
 origins.append(o.reshape(-1,3));directions.append(d.reshape(-1,3));targets.append(color.reshape(-1,3))
o=torch.cat(origins);d=torch.cat(directions);target=torch.cat(targets);rays=RayBundle(origins=o,directions=d,pixel_area=torch.full((len(o),1),(.55*2/size)**2),camera_indices=torch.arange(3).repeat_interleave(size*size)[:,None])
config=VanillaModelConfig(num_coarse_samples=16,num_importance_samples=16,background_color='black',collider_params={'near_plane':1.,'far_plane':4.})
m=config.setup(scene_box=SceneBox(aabb=torch.tensor([[-1.,-1.,-1.],[1.,1.,1.]])),num_train_data=3);optimizer=torch.optim.Adam(m.get_param_groups()['fields'],lr=.0005)
out=Path('out');out.mkdir(exist_ok=True);frames=[]
def snapshot(step):
 m.eval()
 with torch.no_grad():rgb=torch.cat([m(rays[i:i+96])['rgb_fine'] for i in range(0,len(o),96)]);loss=float((rgb-target).square().mean())
 assert torch.isfinite(rgb).all();
 if step:assert float(rgb.std())>.01,'Degenerate flat rendering'
 im=Image.new('RGB',(640,450),'#0b1625');draw=ImageDraw.Draw(im);draw.text((32,16),'Supplied synthetic views',fill='#a9bdd0');draw.text((32,226),f'Original NeRF render after {step} updates | MSE {loss:.5f}',fill='#a9bdd0')
 for view in range(3):
  for row,tensor in enumerate([target,rgb]):
   image=Image.fromarray((tensor[view*size*size:(view+1)*size*size].reshape(size,size,3).clamp(0,1).numpy()*255).round().astype('uint8'));image.save(out/f'{"target" if row==0 else "native"}-{step}-{view}.png');im.paste(image.resize((176,176),Image.Resampling.NEAREST),(32+200*view,40+210*row))
 im.save(out/f'render-{len(frames)}.png');frames.append(dict(image=f'render-{len(frames)}.png',iteration=step,loss=loss));print('Snapshot',step,loss,flush=True);m.train()
snapshot(0);start=time.monotonic()
for step in range(1,2001):
 fg=torch.nonzero(target.max(dim=1).values>.05).flatten();indexes=torch.cat([fg[torch.randint(len(fg),(32,))],torch.randint(len(o),(32,))]);prediction=m(rays[indexes]);loss=sum(m.get_loss_dict(prediction,{'image':target[indexes]}).values());optimizer.zero_grad();loss.backward();optimizer.step()
 if step in [500,2000]:snapshot(step)
print('Finished',time.monotonic()-start,flush=True);assert frames[-1]['loss']<frames[0]['loss']*.1
(out/'result.json').write_text(json.dumps(dict(engine='Original Nerfstudio Vanilla NeRF',device='CPU',trainingViews=3,viewAngles=[-25,0,25],resolution=size,steps=2000,frames=frames),indent=2)+'\n')
