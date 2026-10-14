from pathlib import Path
import json,os
os.environ['OMP_NUM_THREADS']='2'
import torch,numpy as np,pyredner
from PIL import Image,ImageDraw
pyredner.set_use_gpu(False);torch.set_num_threads(2);torch.manual_seed(17)
out=Path('out');out.mkdir(exist_ok=True)
cam=pyredner.Camera(position=torch.tensor([0.,0.,-5.]),look_at=torch.zeros(3),up=torch.tensor([0.,1.,0.]),fov=torch.tensor([45.]),clip_near=.01,resolution=(160,160),fisheye=False)
material=pyredner.Material(diffuse_reflectance=torch.tensor([.25,.65,.8]))
target_vertices=torch.tensor([[-1.4,1.1,0.],[1.2,.8,0.],[.1,-1.2,0.]])
triangle=pyredner.Shape(vertices=target_vertices.clone(),indices=torch.tensor([[0,1,2]],dtype=torch.int32),uvs=None,normals=None,material_id=0)
light_shape=pyredner.Shape(vertices=torch.tensor([[-1.,-1.,-7.],[1.,-1.,-7.],[-1.,1.,-7.],[1.,1.,-7.]]),indices=torch.tensor([[0,1,2],[1,3,2]],dtype=torch.int32),uvs=None,normals=None,material_id=0)
light=pyredner.AreaLight(shape_id=1,intensity=torch.tensor([24.,24.,24.]))
scene=pyredner.Scene(cam,[triangle,light_shape],[material],[light])
def render(seed,samples):
 args=pyredner.RenderFunction.serialize_scene(scene=scene,num_samples=samples,max_bounces=1)
 return pyredner.RenderFunction.apply(seed,*args)
with torch.no_grad():target=render(17,64)
vertices=torch.tensor([[-1.8,1.4,.2],[.8,1.2,-.2],[-.3,-1.5,.1]],requires_grad=True);triangle.vertices=vertices
optimizer=torch.optim.Adam([vertices],lr=.04);frames=[];losses=[]
def snapshot(iteration):
 with torch.no_grad():im=render(801,64);error=float((im-target).pow(2).mean())
 pictures=[target,im,torch.abs(target-im)*3]
 canvas=Image.new('RGB',(504,205),'#101c2a');draw=ImageDraw.Draw(canvas)
 for j,tensor in enumerate(pictures):
  pixels=(tensor.detach().clamp(0,1).pow(1/2.2).numpy()*255).round().astype(np.uint8)
  canvas.paste(Image.fromarray(pixels),(j*168+4,30));draw.text((j*168+5,9),['Native target','Iteration '+str(iteration),'Difference x3'][j],fill='white')
 canvas.save(out/f'render-{len(frames)}.png');frames.append({'iteration':iteration,'mse':error,'vertices':vertices.detach().tolist()})
snapshot(0)
for iteration in range(60):
 optimizer.zero_grad();im=render(iteration+31,8);loss=(im-target).pow(2).mean();loss.backward()
 assert torch.isfinite(vertices.grad).all() and torch.isfinite(loss)
 losses.append(float(loss.detach()));optimizer.step()
 if iteration+1 in [30,60]:snapshot(iteration+1)
 print('iteration',iteration+1,'loss',float(loss.detach()),flush=True)
assert frames[-1]['mse']<frames[0]['mse']*.3
(out/'result.json').write_text(json.dumps({'engine':'redner 0.4.28 CPU','frames':frames,'losses':losses,'targetVertices':target_vertices.tolist(),'trainingSamples':8,'displaySamples':64}))
print('PASS original differentiable renderer',frames[0]['mse'],frames[-1]['mse'],flush=True)
