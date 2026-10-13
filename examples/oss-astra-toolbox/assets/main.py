import pathlib,json,numpy as np,astra
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True)
y,x=np.mgrid[-1:1:96j,-1:1:96j];phantom=np.zeros((96,96),dtype=np.float32)
phantom[(x/.75)**2+(y/.9)**2<1]=.65;phantom[((x+.2)/.24)**2+((y-.1)/.4)**2<1]=1;phantom[((x-.3)/.15)**2+((y+.25)/.2)**2<1]=.15
vg=astra.create_vol_geom(96,96);pg=astra.create_proj_geom('parallel',1.,128,np.linspace(0,np.pi,90,endpoint=False));pid=astra.create_projector('linear',pg,vg);sid,sino=astra.create_sino(phantom,pid);rid=astra.data2d.create('-vol',vg)
cfg=astra.astra_dict('SIRT');cfg.update(ProjectorId=pid,ProjectionDataId=sid,ReconstructionDataId=rid);aid=astra.algorithm.create(cfg);frames=[];previous=0
try:
 assert sino.shape==(90,128) and np.isfinite(sino).all() and sino.max()>1
 np.save(out/'phantom.npy',phantom);np.save(out/'sinogram.npy',sino)
 for i,total in enumerate([5,25,100]):
  astra.algorithm.run(aid,total-previous);previous=total;rec=astra.data2d.get(rid);assert np.isfinite(rec).all();rmse=float(np.sqrt(np.mean((rec-phantom)**2)))
  if frames:assert rmse<frames[-1]['rmse']
  np.save(out/f'reconstruction-{i}.npy',rec)
  image=Image.fromarray(np.round(np.clip(rec,0,1)*255).astype('uint8')).resize((576,576),Image.Resampling.NEAREST);image.save(out/f'render-{i}.png')
  frames.append({'iterations':total,'rmse':rmse,'label':f'{total} SIRT iterations','engine':astra.__version__});print('Native ASTRA',total,rmse)
finally:astra.algorithm.delete(aid);astra.data2d.delete([sid,rid]);astra.projector.delete(pid)
assert frames[-1]['rmse']<.06
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original CPU tomography improves with SIRT iterations')
