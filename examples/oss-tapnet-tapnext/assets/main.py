from pathlib import Path
import sys,json,numpy as np,torch
from PIL import Image,ImageDraw,ImageFilter
root=Path(sys.argv[1]).absolute();sys.path.insert(0,str(root));from tapnet.torch.tapir_model import TAPIR
output=Path('out');output.mkdir(exist_ok=True);torch.set_num_threads(2);torch.manual_seed(17)
rng=np.random.default_rng(17);pixels=np.clip(rng.normal(110,35,(256,256,3)),0,255).astype('uint8');base=Image.fromarray(pixels).filter(ImageFilter.GaussianBlur(.65));draw=ImageDraw.Draw(base)
for box,color in [((45,45,105,105),(55,175,160)),((140,45,205,105),(220,145,75)),((80,135,160,205),(130,100,205))]:
 draw.rounded_rectangle(box,radius=9,outline=color,width=9)
 for k in range(6):
  x=box[0]+14+k*6;draw.line((x,box[1]+14,x,box[3]-14),fill=color,width=2)
initial=np.array([[75,75],[172,75],[120,168]],dtype=np.float32)
frames=np.stack([np.roll(np.roll(np.array(base),i*3,axis=0),i*6,axis=1) for i in range(8)])
query=np.column_stack((np.zeros(3,dtype=np.float32),initial[:,1],initial[:,0]))
model=TAPIR(pyramid_level=0,extra_convs=False);model.load_state_dict(torch.load(root/'tapir_checkpoint_panning.pt',map_location='cpu',weights_only=True));model.eval()
with torch.inference_mode():
 prediction=model(torch.from_numpy(frames.astype('float32')/255*2-1)[None],torch.from_numpy(query)[None])
tracks=prediction['tracks'][0].numpy();visibility=((1-torch.sigmoid(prediction['occlusion'][0]))*(1-torch.sigmoid(prediction['expected_dist'][0]))).numpy();truth=initial[:,None,:]+np.arange(8)[None,:,None]*np.array([6,3])[None,None,:];error=np.linalg.norm(tracks-truth,axis=-1)
assert tracks.shape==(3,8,2) and np.isfinite(tracks).all();print('Native tracking errors',float(error.mean()),float(error.max()),'visibility',float(visibility.min()),flush=True)
assert error.mean()<3 and error.max()<8
colors=['#64ffe0','#ffbd75','#d7b5ff'];out=[]
for i,frame in enumerate([0,3,7]):
 im=Image.fromarray(frames[frame]);draw=ImageDraw.Draw(im)
 for k in range(3):
  path=[tuple(map(float,p)) for p in tracks[k,:frame+1]]
  if len(path)>1:draw.line(path,fill=colors[k],width=2)
  x,y=path[-1];draw.ellipse((x-5,y-5,x+5,y+5),outline='white',width=2);draw.ellipse((x-2,y-2,x+2,y+2),fill=colors[k])
 im.save(output/f'render-{i}.png');out.append(dict(frame=frame,meanError=float(error[:,frame].mean()),tracks=tracks[:,frame].tolist(),visibleConfidence=visibility[:,frame].tolist()))
(output/'result.json').write_text(json.dumps(dict(frames=out,tracks=tracks.tolist(),visibility=visibility.tolist(),groundTruth=truth.tolist(),meanError=float(error.mean()),maxError=float(error.max()))))
Image.fromarray(frames[0]).save(output/'input-0.png');Image.fromarray(frames[-1]).save(output/'input-7.png')
print('PASS original pretrained TAPIR inference on eight own translated frames')
