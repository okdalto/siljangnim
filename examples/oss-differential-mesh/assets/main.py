import pathlib,json,numpy as np
from differentialMesh import DifferentialMesh
out=pathlib.Path('out');out.mkdir(exist_ok=True);rng=np.random.RandomState(17);limit=50000;h=.003;near=h*2/np.sqrt(3);far=h*20/np.sqrt(3);dm=DifferentialMesh(limit,2*far,near,far,1);dm.new_faces_in_ngon(.5,.5,h,6,0.0);frames=[]
for step in range(1,61):
 dm.optimize_position(.000015,.00015,.0000015,0.,.99,-1)
 surface=np.array([dm.is_surface_edge(e)>0 for e in range(dm.get_henum())],dtype=bool).nonzero()[0].astype(np.int64);random=rng.random_sample(len(surface)*2);theta=(1-2*random[::2])*np.pi;radius=random[1::2]*.5*h
 dm.new_triangles_from_surface_edges(surface,len(surface),h,np.cos(theta)*radius,np.sin(theta)*radius,h*.8,h*2,1);dm.optimize_edges(h*2,near*.5)
 assert dm.get_henum()<limit*.8
 if step in [10,30,60]:
  array=np.zeros((limit,6),dtype=float);count=dm.np_get_triangles_coordinates(array);assert 0<count<limit;assert np.isfinite(array[:count]).all();paths=[{'points':((row.reshape(3,2)-.5)*7).tolist(),'closed':True} for row in array[:count]];frames.append({'step':step,'triangles':count,'paths':paths})
assert frames[-1]['triangles']>frames[0]['triangles'];(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original native differential growth',[(f['step'],f['triangles']) for f in frames])
