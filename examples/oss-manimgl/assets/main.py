from pathlib import Path
import json,hashlib
import numpy as np
from manimlib import Scene, ParametricSurface, SurfaceMesh, BLUE_D, TEAL_C, DEGREES
out=Path('out');out.mkdir(exist_ok=True)
scene=Scene(camera_config={'resolution':(512,384),'background_color':'#101827'},file_writer_config={'write_to_movie':False})
scene.camera.frame.set_euler_angles(theta=-30*DEGREES,phi=65*DEGREES)
scene.camera.frame.set_height(7)
frames=[]
for i,amplitude in enumerate([0.25,0.65,1.05]):
 surface=ParametricSurface(lambda u,v:np.array([u,v,amplitude*np.sin(u*2)*np.cos(v*2)]),u_range=(-2,2),v_range=(-2,2),resolution=(41,41),color=BLUE_D)
 mesh=SurfaceMesh(surface,resolution=(17,17),stroke_color=TEAL_C,stroke_width=1)
 scene.clear();scene.add(surface,mesh);scene.update_frame(force_draw=True)
 scene.get_image().save(out/f'render-{i}.png')
 points=surface.get_points();assert np.isfinite(points).all()
 frames.append({'label':f'Amplitude {amplitude}','amplitude':amplitude,'surfaceSamples':41*41})
(out/'result.json').write_text(json.dumps({'frames':frames}))
print('PASS original ManimGL surface renderer')
