import pathlib,json,sys
import numpy as np
import pycolmap as c
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);rng=np.random.default_rng(82);a=np.arange(220)*2.399963229728653;z=np.linspace(-.8,.8,len(a));r=np.sqrt(1-z*z);points=np.stack([r*np.cos(a),z,r*np.sin(a)+4],axis=1);cam1=np.c_[np.eye(3),np.zeros(3)];cam2=np.c_[np.eye(3),np.array([-.8,0,0])];p1=points[:,:2]/points[:,2:];q=points+cam2[:,3];p2=q[:,:2]/q[:,2:];frames=[]
for noise in [0,.0005,.002]:
 obs1=p1+rng.normal(0,noise,p1.shape);obs2=p2+rng.normal(0,noise,p2.shape);recovered=np.array([c.triangulate_point(cam1,cam2,u,v) for u,v in zip(obs1,obs2)]);assert recovered.shape==points.shape and np.isfinite(recovered).all();error=np.linalg.norm(recovered-points,axis=1);assert float(error.mean())<.2
 frames.append(dict(points=(recovered-[0,0,4]).tolist(),values=np.minimum(error*5,1).tolist(),radius=.018,noise=noise,meanError=float(error.mean()),maximumError=float(error.max())));print(noise,float(error.mean()))
assert frames[0]['maximumError']<1e-10
(out/'result.json').write_text(json.dumps(dict(engine='COLMAP 4.2.0 native two-view triangulation',frames=frames),allow_nan=False))
