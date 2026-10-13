import pathlib,os,sys,array,fcntl,json,re
import twophase.defs as defs
key='1.1.1-'+sys.byteorder+'-'+str(array.array('L').itemsize)
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'rubiktwophase'/key;cache.mkdir(parents=True,exist_ok=True)
defs.FOLDER=str(cache)
with (cache/'compute.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 import twophase.solver as solver
 from twophase.cubie import CubieCube,moveCube
 cube=CubieCube();scramble='R1 U1 F2 L3 D1 B2 R2 U3 F1 D2 L1 B3'
 def apply(move):
  cube.multiply(moveCube['URFDLB'.index(move[0])*3+int(move[1])-1])
 for move in scramble.split():apply(move)
 start=cube.to_facelet_cube().to_string();solution=solver.solve(start,12,10);moves=re.findall(r'[URFDLB][123]',solution)
 assert moves and 'Error' not in solution
 states=[start]
 for move in moves:apply(move);states.append(cube.to_facelet_cube().to_string())
 assert states[-1]=='U'*9+'R'*9+'F'*9+'D'*9+'L'*9+'B'*9
 colors={'U':'#f6f2df','R':'#f0744f','F':'#58c6a1','D':'#ffdc63','L':'#b093f0','B':'#5b9cec'}
 offsets=[(3,0),(6,3),(3,3),(3,6),(0,3),(9,3)];frames=[]
 for i,state in enumerate(states):
  paths=[]
  for face,(ox,oy) in enumerate(offsets):
   for cell in range(9):
    x=(ox+cell%3)*.15-.9;y=.675-(oy+cell//3)*.15
    paths.append({'points':[[x+.006,y-.006],[x+.144,y-.006],[x+.144,y-.144],[x+.006,y-.144]],'closed':True,'fill':colors[state[face*9+cell]],'color':'#142333'})
  frames.append({'label':'Scrambled' if i==0 else 'Solved' if i==len(moves) else f'Step {i}: {moves[i-1]}','step':i,'moves':len(moves),'paths':paths,'state':state})
 out=pathlib.Path('out');out.mkdir(exist_ok=True);(out/'result.json').write_text(json.dumps({'frames':frames,'scramble':scramble,'solution':solution}));print('PASS native solution replay:',solution,flush=True)
