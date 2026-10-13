import pathlib,subprocess,shutil,os,shlex,json
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);cc=shutil.which('cc')
if not cc:raise RuntimeError('Install a C compiler and libmypaint 1.6.1 development files.')
if shutil.which('pkg-config'):flags=shlex.split(subprocess.check_output(['pkg-config','--cflags','--libs','libmypaint'],text=True))
else:
 prefix=pathlib.Path(os.environ.get('MYPAINT_PREFIX','/opt/homebrew' if pathlib.Path('/opt/homebrew/include/libmypaint').exists() else '/usr/local'));flags=['-I'+str(prefix/'include/libmypaint'),'-L'+str(prefix/'lib'),'-lmypaint']
subprocess.run([cc,'-O2','in/main.c',*flags,'-lm','-o',str(out/'brush')],check=True);subprocess.run([str((out/'brush').absolute()),str(out)],check=True)
frames=[]
for n,hardness in enumerate([.95,.65,.35]):
 image=Image.open(out/f'render-{n}.ppm');assert image.size==(512,512);image.save(out/f'render-{n}.png');frames.append({'hardness':hardness})
(out/'result.json').write_text(json.dumps({'frames':frames}))
