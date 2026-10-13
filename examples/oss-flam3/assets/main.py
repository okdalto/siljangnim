import pathlib,subprocess,sys,json,os,math
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,swirl in enumerate([0,.25,.6]):
 transforms=[]
 for n in range(3):
  angle=n*2*math.pi/3;tx=.6*math.cos(angle);ty=.6*math.sin(angle);rotation=.2*(n-1);a=.5*math.cos(rotation);b=.5*math.sin(rotation);transforms.append(f'<xform weight="1" color="{n/2}" linear="{1-swirl}" swirl="{swirl}" coefs="{a} {b} {-b} {a} {tx} {ty}"/>')
 colors=''.join(f'<color index="{n}" rgb="{int(70+170*n/255)} {int(210-80*n/255)} {int(195-90*n/255)}"/>' for n in range(256));xml=f'<flames><flame time="0" size="512 512" center="0 0" scale="180" oversample="1" filter="0.5" quality="25" background="0.043 0.086 0.145" brightness="3" gamma="2.2" vibrancy="1">'+''.join(transforms)+colors+'</flame></flames>';source=out/f'genome-{i}.flam3';source.write_text(xml);ppm=out/f'render-{i}.ppm';env={**os.environ,'in':str(source),'out':str(ppm),'format':'ppm','seed':'17','isaac_seed':'siljangnim-17','nthreads':'1','verbose':'0'};subprocess.run([sys.argv[1]],env=env,check=True);im=Image.open(ppm).convert('RGB');assert im.size==(512,512);colors=im.getcolors(512*512);assert colors and len(colors)>100;im.save(out/f'render-{i}.png');ppm.unlink();frames.append({'swirl':swirl,'linear':1-swirl,'colors':len(colors),'quality':25,'seed':17})
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS native FLAM3 renders')
