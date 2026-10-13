import pathlib,subprocess,sys,json,re,math
from PIL import Image
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[];binary=sys.argv[1]
for i,steps in enumerate([1000,5000,15000]):
 target=out/f'state-{i}.vti';subprocess.run([binary,'-i','in/seed.vti','-n',str(steps),'-o',str(target)],check=True)
 data=subprocess.check_output([binary,'-i',str(target),'-m'],text=True);arrays=re.findall(r'RD data for reagent (\d+): \[ (.*?) \]',data)
 assert len(arrays)==2;values=[list(map(float,s.split(','))) for _,s in arrays];assert all(len(v)==8192 and all(math.isfinite(x) for x in v) for v in values)
 v=values[1];assert max(v)>.1 and min(v)>=-1e-6 and max(v)<1
 im=Image.new('L',(128,64));im.putdata([round(max(0,min(1,x/.5))*255) for x in v]);im.resize((768,384),Image.Resampling.NEAREST).save(out/f'render-{i}.png')
 (out/f'concentrations-{i}.json').write_text(json.dumps(values))
 frames.append({'label':f'{steps} steps','steps':steps,'peak':max(v),'mass':sum(v)});print('PASS original Ready OpenCL',steps,max(v),sum(v))
assert len({round(f['mass'],3) for f in frames})==3
(out/'result.json').write_text(json.dumps({'frames':frames}))
