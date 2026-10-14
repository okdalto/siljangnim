from pathlib import Path
import json,sys,time
import numpy as np,torch
from PIL import Image,ImageDraw
from tsr.system import TSR
out=Path('out');out.mkdir(exist_ok=True);torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.manual_seed(17)
print('Loading original TripoSR on CPU',flush=True);model=TSR.from_pretrained(sys.argv[1],config_name='config.yaml',weight_name='model.ckpt');model.to('cpu');model.eval();model.renderer.set_chunk_size(4096)
source=Image.open('in/chair.png').convert('RGBA')
from tsr.utils import resize_foreground
rgba=np.asarray(resize_foreground(source,.85)).astype(np.float32)/255
prepared=Image.fromarray(((rgba[:,:,:3]*rgba[:,:,3:4]+(1-rgba[:,:,3:4])*.5)*255).astype(np.uint8))
prepared.save(out/'preprocessed.png');source=source.convert('RGB');started=time.monotonic()
with torch.no_grad():codes=model([prepared],device='cpu')
assert torch.isfinite(codes).all();print('Native scene code',list(codes.shape),'seconds',time.monotonic()-started,flush=True)
# The original camera helper uses torch.cross without dim. With exactly
# three cameras PyTorch selects the camera axis, producing identical rays.
# A four-camera orbit uses the intended vector axis without changing upstream code.
from tsr.utils import get_spherical_cameras
_, directions=get_spherical_cameras(4,20,1.9,40,160,160)
assert all(float(d.std(dim=(0,1)).max())>.05 for d in directions)
images=model.render(codes,n_views=4,elevation_deg=20,height=160,width=160,return_type='pil')[0][:3];print('Rendered original radiance field',time.monotonic()-started,flush=True)
mesh=model.extract_mesh(codes,has_vertex_color=True,resolution=64)[0];assert len(mesh.vertices)>100 and len(mesh.faces)>100 and np.isfinite(mesh.vertices).all();mesh.export(out/'mesh.ply');print('Extracted native mesh',len(mesh.vertices),len(mesh.faces),flush=True)
frames=[]
for i,im in enumerate(images):
 a=np.asarray(im);assert a.shape==(160,160,3) and float(a.std(axis=(0,1)).max())>5
 im.save(out/f'native-{i}.png');canvas=Image.new('RGB',(640,400),'#0a1420');d=ImageDraw.Draw(canvas);d.text((24,22),'TripoSR / original single-image reconstruction on CPU',fill='#d4e4ef');canvas.paste(source.resize((224,224)),(24,100));canvas.paste(im.resize((288,288)),(320,70));d.text((24,75),'Original procedural input',fill='#9cb3c7');d.text((320,45),f'Reconstructed view: {i*90} degrees',fill='#9cb3c7');d.text((24,377),f'{len(mesh.vertices)} native vertices | {len(mesh.faces)} native triangles | 64^3 extraction grid',fill='#9cb3c7');canvas.save(out/f'render-{i}.png');frames.append(dict(azimuth=i*90,vertices=len(mesh.vertices),triangles=len(mesh.faces),nativeSize=[160,160]))
(out/'result.json').write_text(json.dumps(dict(engine='TripoSR',device='CPU',sceneCodeShape=list(codes.shape),sceneCodeMean=float(codes.mean()),frames=frames),indent=2)+'\n')
