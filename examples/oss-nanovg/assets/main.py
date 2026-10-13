import pathlib,subprocess,sys,json
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);subprocess.run([sys.argv[1],str(out)],check=True);frames=[]
for i in range(3):
 file=out/f'render-{i}.ppm';image=Image.open(file).convert('RGB');assert image.size==(512,512);colors=image.getcolors(512*512);assert colors and len(colors)>100;image.save(out/f'render-{i}.png');file.unlink();frames.append({'strokeWidth':2+i*2,'curveVariant':i,'colors':len(colors)})
(out/'result.json').write_text(json.dumps({'frames':frames}))
