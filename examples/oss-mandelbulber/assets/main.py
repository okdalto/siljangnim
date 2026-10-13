import pathlib,sys,subprocess,hashlib,json,tempfile
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,power in enumerate([6,8,10]):
 target=(out/f'render-{i}.png').absolute()
 with tempfile.TemporaryDirectory(prefix='siljangnim-mandelbulber-log-') as temp:
  subprocess.run([sys.argv[1],'-n','-C','-r','512x384','-f','png','-o',str(target),'--logfilepath',str(pathlib.Path(temp)/'render.log'),'-O',f'detail_level=1#ambient_occlusion_quality=3#fractal1_power={power}#opencl_enabled=0','in/scene.fract'],check=True,timeout=180)
 im=Image.open(target);assert im.size==(512,384) and len(im.getcolors(512*384))>1000
 frames.append({'label':f'Power {power}','power':power,'engine':'Mandelbulber 2.34','renderer':'native CPU'});print('PASS native Mandelbulber image',power)
assert len({hashlib.sha256((out/f'render-{i}.png').read_bytes()).digest() for i in range(3)})==3
(out/'result.json').write_text(json.dumps({'frames':frames}))
