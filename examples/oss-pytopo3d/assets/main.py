import pathlib,sys,json
import numpy as np
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);sys.path.insert(0,str(source))
from pytopo3d.core.optimizer import top3d
frames=[]
for fraction in [.25,.4,.6]:
 density,history=top3d(12,6,3,fraction,3,1.5,.5,maxloop=60,tolx=.001,save_history=True,history_frequency=10,use_gpu=False)
 assert np.isfinite(density).all() and density.std()>.04
 assert abs(float(density.mean())-fraction)<.03
 mask=density>.3;vertices=[];faces=[]
 # Display only exposed voxel faces; density values are the original optimizer output.
 for y,x,z in zip(*np.where(mask)):
  for axis,sign in [(0,-1),(0,1),(1,-1),(1,1),(2,-1),(2,1)]:
   q=[y,x,z];q[axis]+=sign
   if all(0<=q[i]<mask.shape[i] for i in range(3)) and mask[tuple(q)]:continue
   coords=[x,y,z];a={0:1,1:0,2:2}[axis];other=[i for i in range(3) if i!=a];start=len(vertices)
   for u,v in [(0,0),(1,0),(1,1),(0,1)]:
    p=coords.copy();p[a]+=int(sign>0);p[other[0]]+=u;p[other[1]]+=v;vertices.append([(p[0]-6)/7,(p[1]-3)/7,(p[2]-1.5)/7])
   faces.extend([[start,start+1,start+2],[start,start+2,start+3]] if sign==(1 if a!=1 else -1) else [[start,start+2,start+1],[start,start+3,start+2]])
 assert len(faces)>30
 frames.append(dict(mesh=dict(vertices=vertices,faces=faces),volumeFraction=fraction,actualMean=float(density.mean()),density=density.tolist(),iterations=history['iteration_history'][-1],compliance=history['compliance_history'][-1]))
(out/'result.json').write_text(json.dumps(dict(frames=frames),allow_nan=False))
