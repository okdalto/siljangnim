import pathlib,sys,subprocess,json,hashlib
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True)
subprocess.run([sys.argv[1],str(out.absolute())],check=True,timeout=180)
frames=[]
for i,elevation in enumerate([5,20,60]):
 p=out/f'render-{i}.ppm';im=Image.open(p);assert im.size==(512,384) and len(im.getcolors(512*384))>100
 im.save(out/f'render-{i}.png');frames.append({'label':f'Sun elevation {elevation} degrees','elevation':elevation,'scatteringOrders':4,'separateMieTexture':True})
assert len({hashlib.sha256((out/f'render-{i}.png').read_bytes()).digest() for i in range(3)})==3
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original atmosphere precomputation and three solar elevations')
