import pathlib,sys,subprocess,tempfile,shutil,json,math
from PIL import Image
out=pathlib.Path('out').absolute();out.mkdir(exist_ok=True);inputs=pathlib.Path('in').absolute();binary=pathlib.Path(sys.argv[1]);frames=[]
with tempfile.TemporaryDirectory(prefix='siljangnim-specfem-') as tmp:
 work=pathlib.Path(tmp);(work/'DATA').mkdir();(work/'OUTPUT_FILES').mkdir()
 for name in ['Par_file','SOURCE','interfaces_elastic_analytic.dat']:shutil.copy(inputs/name,work/'DATA'/name)
 for name in ['xmeshfem2D','xspecfem2D']:
  with (work/(name+'.log')).open('w') as log:subprocess.run([str(binary/name)],cwd=work,stdout=log,stderr=subprocess.STDOUT,check=True)
 results=work/'OUTPUT_FILES';assert '1200' in (work/'xspecfem2D.log').read_text()
 for i,step in enumerate([400,800,1200]):
  original=results/f'forward_image{step:09d}.jpg';shutil.copy(original,out/f'wavefield-{i}.jpg')
  with Image.open(original) as im:
   assert im.width>100 and im.height>100 and len(im.convert('RGB').getcolors(2000000) or [])>100
   im.save(out/f'render-{i}.png')
  frames.append({'step':step,'time':(step-1)*.0008,'label':f'Step {step}'})
 for name in ['energy.dat','AA.S0001.BXX.semd','AA.S0001.BXZ.semd']:
  vals=[[float(s.replace('D','E')) for s in line.split()] for line in (results/name).read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')];assert vals and all(math.isfinite(v) for row in vals for v in row);assert max(abs(row[-1]) for row in vals)>0;shutil.copy(results/name,out/name)
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS native SPECFEM2D wavefields, finite energy and nonzero receiver traces')
