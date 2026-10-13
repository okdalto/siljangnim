import pathlib,sys,subprocess,json,hashlib,tempfile
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,phase in enumerate([0.,1.,2.]):
 target=(out/f'render-{i}.png').absolute()
 with tempfile.TemporaryDirectory(prefix='siljangnim-glslviewer-') as work:
  (pathlib.Path(work)/'lygia').symlink_to(pathlib.Path(sys.argv[2])/'lygia',target_is_directory=True)
  completed=subprocess.run([sys.argv[1],str(pathlib.Path('in/pattern.frag').absolute()),'-I'+sys.argv[2],'--headless','--noncurses','-s','256','-e',f'u_phase,{phase}','-E','screenshot,'+str(target)],check=True,timeout=60,capture_output=True,text=True,cwd=work)
 log=completed.stdout+completed.stderr
 if 'error while compiling' in log.lower() or 'Error:' in log:raise RuntimeError(log)
 im=Image.open(target);assert im.width==im.height and im.width>=256 and len(im.getcolors(im.width*im.height))>1000
 frames.append({'label':f'Phase {phase}','phase':phase,'pixels':im.width,'engine':'glslViewer 3.5.2'});print('PASS native OpenGL shader screenshot',phase,im.size)
assert len({hashlib.sha256((out/f'render-{i}.png').read_bytes()).digest() for i in range(3)})==3
(out/'result.json').write_text(json.dumps({'frames':frames}))
