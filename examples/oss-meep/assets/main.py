import meep as mp
import numpy as np
from PIL import Image
import pathlib,json,sys
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
frames=[]
for idx,gap in enumerate([0.8,1.6,2.4]):
 cell=mp.Vector3(12,12,0)
 geometry=[mp.Block(mp.Vector3(0.6,(12-gap)/2,mp.inf),center=mp.Vector3(0,sign*(3+gap/4)),material=mp.Medium(epsilon=9)) for sign in [-1,1]]
 sim=mp.Simulation(cell_size=cell,boundary_layers=[mp.PML(1)],geometry=geometry,sources=[mp.Source(mp.ContinuousSource(frequency=.6,width=3),component=mp.Ez,center=mp.Vector3(-3.8,0),size=mp.Vector3(0,8))],resolution=16)
 sim.run(until=30)
 field=sim.get_array(center=mp.Vector3(),size=mp.Vector3(10,10),component=mp.Ez).T
 epsilon=sim.get_array(center=mp.Vector3(),size=mp.Vector3(10,10),component=mp.Dielectric).T
 assert np.isfinite(field).all() and np.max(np.abs(field))>.01
 assert np.mean(np.abs(field[:,field.shape[1]//2+15:]))>1e-4
 scale=float(np.quantile(np.abs(field),.99));v=np.clip(field/scale,-1,1)[...,None]
 zero=np.array([11,22,37]);pos=np.array([255,188,120]);neg=np.array([87,216,198]);rgb=zero+np.abs(v)*(np.where(v>=0,pos,neg)-zero);rgb[epsilon>5]=[115,127,145]
 Image.fromarray(rgb.astype(np.uint8)).resize((512,512)).save(out/f'render-{idx}.png')
 frames.append(dict(gap=gap,fieldMin=float(field.min()),fieldMax=float(field.max()),scale=scale,shape=list(field.shape)))
 sim.reset_meep()
(out/'result.json').write_text(json.dumps(dict(engine=mp.__version__,resolution=16,until=30,frames=frames),indent=2))
