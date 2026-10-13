import ast,json,pathlib,sys
import numpy as np
from PIL import Image
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(source))
from tutils import BaseStateSystem
book=json.loads((source/'turing-patterns.ipynb').read_text());scope=dict(np=np,BaseStateSystem=BaseStateSystem)
for idx,names in [(5,['laplacian2D']),(13,['random_initialiser']),(15,['TwoDimensionalRDEquations']),(35,['gs_initialiser'])]:
 tree=ast.parse(''.join(book['cells'][idx]['source']));nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names];assert len(nodes)==len(names);exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source/'turing-patterns.ipynb'), 'exec'),scope)
frames=[]
for idx,(da,db,f,k) in enumerate([(0.16,.08,.035,.065),(.16,.08,.06,.062),(.16,.08,.02,.055)]):
 np.random.seed(17)
 sim=scope['TwoDimensionalRDEquations'](da,db,lambda a,b:-a*b*b+f*(1-a),lambda a,b:a*b*b-(f+k)*b,initialiser=scope['gs_initialiser'],width=96,height=96,dx=1,dt=1,steps=200)
 sim.initialise()
 for _ in range(30):sim.update()
 assert np.isfinite(sim.b).all() and sim.b.std()>.005
 v=np.clip(sim.b/.4,0,1)[...,None];rgb=np.array([11,22,37])+v*(np.array([87,216,198])-np.array([11,22,37]));Image.fromarray(rgb.astype(np.uint8)).resize((512,512)).save(out/f'render-{idx}.png')
 frames.append(dict(feed=f,kill=k,steps=6000,minimum=float(sim.b.min()),maximum=float(sim.b.max())))
(out/'result.json').write_text(json.dumps(dict(frames=frames),indent=2))
