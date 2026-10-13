import pathlib,sys,json,math
import numpy as np
import pygplates as g
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
times=[g.GpmlTimeSample(g.GpmlFiniteRotation(g.FiniteRotation((40,25),math.radians(angle))),time) for time,angle in [(0,0),(50,35),(100,80)]];rotation_feature=g.Feature.create_total_reconstruction_sequence(0,1,g.GpmlIrregularSampling(times));model=g.RotationModel([rotation_feature]);feature=g.Feature();feature.set_reconstruction_plate_id(1);feature.set_geometry(g.PolygonOnSphere([(-15,-30),(-5,-5),(20,5),(35,-20),(10,-40)]));frames=[]
def xyz(points):return [[p.to_xyz()[0],p.to_xyz()[2],p.to_xyz()[1]] for p in points]
for time in [0,50,100]:
 result=[];g.reconstruct([feature],model,result,time);assert len(result)==1;polygon=result[0].get_reconstructed_geometry();pts=list(polygon.to_tessellated(math.radians(3)).get_exterior_ring_points());coords=xyz(pts);assert np.allclose(np.linalg.norm(coords,axis=1),1);assert abs(polygon.get_area()-feature.get_geometry().get_area())<1e-10
 paths=[dict(points=coords+[coords[0]],color='#ffbc78')]
 for lon in range(-180,180,30):paths.append(dict(points=xyz([g.PointOnSphere(lat,lon) for lat in range(-89,90,3)]),color='#26495c'))
 for lat in range(-60,61,30):paths.append(dict(points=xyz([g.PointOnSphere(lat,lon) for lon in range(-180,181,3)]),color='#26495c'))
 frames.append(dict(timeMa=time,paths=paths,points=xyz(list(polygon.get_exterior_ring_points())),radius=.018,sphericalArea=polygon.get_area()));print(time,polygon.get_area())
(out/'result.json').write_text(json.dumps(dict(engine='pyGPlates 1.0.0 native reconstruction',input='Synthetic Euler pole and polygon; not a geological reconstruction dataset',frames=frames),allow_nan=False))
