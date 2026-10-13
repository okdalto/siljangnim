import pathlib,sys,json
import numpy as np
from vegtamr import lic
from PIL import Image
import matplotlib
out=pathlib.Path(sys.argv[1]);out.mkdir(exist_ok=True,parents=True)
n=256;y,x=np.mgrid[-1:1:complex(n),-1:1:complex(n)];field=np.array([-y+.25*np.sin(5*x),x+.25*np.sin(5*y)],dtype=np.float64);frames=[]
for i,length in enumerate([8,24,48]):
 result=lic.compute_lic_with_postprocessing(vfield=field,streamlength=length,num_lic_passes=3,use_filter=True,filter_sigma=5,use_equalize=True,seed_sfield=42,backend='rust')
 assert result.shape==(n,n) and np.isfinite(result).all() and result.std()>.01
 lo,hi=float(result.min()),float(result.max());rgb=(matplotlib.colormaps['magma']((result-lo)/(hi-lo))[:,:,:3]*255).astype('uint8');Image.fromarray(rgb).save(out/f'render-{i}.png');frames.append(dict(streamlength=length,minimum=lo,maximum=hi,standardDeviation=float(result.std())))
(out/'result.json').write_text(json.dumps(dict(engine='line-integral-convolutions 2.1.0 with rLIC 0.5.3',frames=frames),indent=2));print(frames)
