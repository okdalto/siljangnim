from pathlib import Path
from array import array
import json,math,time
import pyluxcore
from PIL import Image
pyluxcore.Init()
output=Path('out');output.mkdir(exist_ok=True)
frames=[]
for index,roughness in enumerate([.025,.15,.45]):
 scene=pyluxcore.Scene();props=pyluxcore.Properties()
 props.SetFromString('''
scene.camera.lookat.orig = 5 -8 5
scene.camera.lookat.target = 0 0 0.7
scene.camera.fieldofview = 42
scene.materials.ground.type = matte
scene.materials.ground.kd = 0.32 0.38 0.45
scene.objects.ground.material = ground
scene.objects.ground.vertices = -200 -200 0 200 -200 0 200 200 0 -200 200 0
scene.objects.ground.faces = 0 1 2 0 2 3
scene.lights.sky.type = constantinfinite
scene.lights.sky.color = 0.35 0.5 0.8
scene.lights.sky.gain = 0.4 0.4 0.4
scene.lights.key.type = sharpdistant
scene.lights.key.color = 1 0.88 0.7
scene.lights.key.gain = 3 3 3
scene.lights.key.direction = 1 1 -2
''')
 for i,(x,y,r,color) in enumerate([(-1.5,0,.9,(.05,.45,.4)),(.55,0,1.1,(.55,.18,.07)),(0,1.9,.65,(.3,.2,.6))]):
  vertices=[];normals=[];faces=[];n=48;m=24
  for j in range(m+1):
   phi=math.pi*j/m
   for k in range(n):
    a=2*math.pi*k/n;nx=math.sin(phi)*math.cos(a);ny=math.sin(phi)*math.sin(a);nz=math.cos(phi)
    vertices.append((x+r*nx,y+r*ny,r+r*nz));normals.append((nx,ny,nz))
  for j in range(m):
   for k in range(n):
    a=j*n+k;b=j*n+(k+1)%n;c=(j+1)*n+k;d=(j+1)*n+(k+1)%n
    if j>0:faces.append((a,c,b))
    if j<m-1:faces.append((b,c,d))
  scene.DefineMesh('sphere'+str(i),vertices,faces,normals,None,None,None)
  props.SetFromString(f'''
scene.materials.ball{i}.type = glossy2
scene.materials.ball{i}.kd = {' '.join(map(str,color))}
scene.materials.ball{i}.ks = 0.6 0.6 0.6
scene.materials.ball{i}.uroughness = {roughness}
scene.materials.ball{i}.vroughness = {roughness}
scene.objects.ball{i}.shape = sphere{i}
scene.objects.ball{i}.material = ball{i}
''')
 scene.Parse(props)
 cfg=pyluxcore.Properties();cfg.SetFromString('''
renderengine.type = TILEPATHCPU
native.threads.count = 1
sampler.type = TILEPATHSAMPLER
tilepath.sampling.aa.size = 8
tile.multipass.enable = 0
renderengine.seed = 17
film.width = 384
film.height = 384
film.imagepipeline.0.type = TONEMAP_LINEAR
film.imagepipeline.0.scale = 1
film.imagepipeline.1.type = GAMMA_CORRECTION
film.imagepipeline.1.value = 2.2
''')
 session=pyluxcore.RenderSession(pyluxcore.RenderConfig(cfg,scene));session.Start();start=time.monotonic()
 while not session.HasDone():
  time.sleep(.05);session.UpdateStats()
  if time.monotonic()-start>180:raise RuntimeError('Native render timeout')
 session.Stop();film=session.GetFilm();buf=array('f',[0.]*(384*384*3));film.GetOutputFloat(pyluxcore.FilmOutputType.RGB_IMAGEPIPELINE,buf)
 assert all(math.isfinite(v) for v in buf)
 image=Image.frombytes('RGB',(384,384),bytes(round(max(0,min(1,v))*255) for v in buf)).transpose(Image.Transpose.FLIP_TOP_BOTTOM);image.save(output/f'render-{index}.png')
 frames.append(dict(roughness=roughness,triangles=3*48*46+2,engine='TILEPATHCPU',aaSamples=64));print('PASS original LuxCore',roughness,flush=True)
 del session,film,scene
(output/'result.json').write_text(json.dumps(dict(frames=frames)))
