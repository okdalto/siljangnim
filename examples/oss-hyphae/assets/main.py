import pathlib,sys,types,json,math
from lib2to3.refactor import RefactoringTool,get_fixers_from_package
import numpy as np
import cairocffi
sys.modules['cairo']=cairocffi
source=pathlib.Path(sys.argv[1])/'hyphae.py'
# Syntax-only Python 2 conversion; restore the removed numpy.int alias used by the original import.
converted=str(RefactoringTool(get_fixers_from_package('lib2to3.fixes')).refactor_string(source.read_text(),str(source)))
np.int=int
m=types.ModuleType('original_hyphae');exec(compile(converted,str(source),'exec'),m.__dict__)
# Original configuration constants, bounded for this demonstration.
m.NMAX=20000;m.SIZE=1000;m.ONE=1/1000;m.RAD=.006;m.ZONEWIDTH=2*(m.RAD/m.ONE);m.ZONES=int(m.SIZE/m.ZONEWIDTH);m.SOURCE_NUM=5;m.DRAW_SKIP=100000
np.random.seed(17);out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[];segments=[];original=m.Render.circles

def capture(self,x1,y1,x2,y2,r):
 original(self,x1,y1,x2,y2,r)
 segments.append([float(x1),float(y1),float(x2),float(y2),float(r)])
 if len(segments) in [500,1500,3000]:
  i=len(frames);self.sur.write_to_png(str(out/f'render-{i}.png'));frames.append({'segments':len(segments),'label':str(len(segments))+' growing branches'});print('Captured native Hyphae',len(segments),flush=True)
 if len(segments)>=3000:raise KeyboardInterrupt
m.Render.circles=capture;m.main()
assert len(frames)==3 and all(math.isfinite(v) for e in segments for v in e)
assert all(math.hypot(e[2]-.5,e[3]-.5)<=m.CIRCLE_RADIUS+1e-9 for e in segments)
(out/'result.json').write_text(json.dumps({'frames':frames}));(out/'branches.json').write_text(json.dumps(segments));print('PASS original Hyphae growth and Cairo rendering')
