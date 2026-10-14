from pathlib import Path
import sys,subprocess,tempfile,re,json
from PIL import Image,ImageDraw
out=Path('out');out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='opensplat-') as temporary:
 p=subprocess.run([sys.argv[1],'--cpu','--width','64','--height','64','--points','96','--iters','400','--render',temporary],check=True,capture_output=True,text=True,timeout=240)
 rows=re.findall(r'Iteration (\d+)/400 Loss: ([0-9.eE+-]+)',p.stdout);losses={int(i):float(v) for i,v in rows};assert len(losses)==400 and losses[400]<losses[1]*.1
 target=Image.new('RGB',(64,64),'white');d=ImageDraw.Draw(target);d.rectangle((0,0,31,31),fill='red');d.rectangle((32,32,63,63),fill='blue');frames=[]
 for i,iteration in enumerate([1,100,400]):
  native=Image.open(Path(temporary)/f'{iteration}.png').convert('RGB');native.save(out/f'native-{i}.png');im=Image.new('RGB',(640,400),'#0b1625');d=ImageDraw.Draw(im);im.paste(target.resize((256,256),Image.Resampling.NEAREST),(32,72));im.paste(native.resize((256,256),Image.Resampling.NEAREST),(352,72));d.text((32,40),'Original training target',fill='#a9bdd0');d.text((352,40),f'Original CPU render: iteration {iteration}',fill='#a9bdd0');d.text((32,356),f'96 Gaussian primitives | 64 x 64 pixels | MSE {losses[iteration]:.6f}',fill='#a9bdd0');im.save(out/f'render-{i}.png');frames.append(dict(image=f'render-{i}.png',iteration=iteration,loss=losses[iteration],gaussians=96))
 (out/'result.json').write_text(json.dumps(dict(engine='Original OpenSplat simple_trainer',device='CPU',lossRatio=losses[400]/losses[1],lossHistory=[losses[i] for i in range(1,401)],frames=frames),indent=2)+'\n');print('Native loss',losses[1],'=>',losses[400])
