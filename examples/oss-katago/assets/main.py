import pathlib,sys,json,hashlib,urllib.request,os,tempfile,subprocess,shutil,math
from PIL import Image,ImageDraw
config=json.loads(pathlib.Path(sys.argv[1]).read_text());out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);program=shutil.which('katago')
if not program:raise RuntimeError('Install KataGo 1.18.2 and put katago on PATH (macOS: brew install katago).')
version=subprocess.check_output([program,'version'],text=True)
if 'v1.18.2' not in version:raise RuntimeError('This recipe was verified with KataGo 1.18.2.')
entry=config['model'];cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'katago';cache.mkdir(parents=True,exist_ok=True);model=cache/(entry['sha256']+'.bin.gz')
if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest()!=entry['sha256']:
 raw=urllib.request.urlopen(entry['url'],timeout=180).read();assert hashlib.sha256(raw).hexdigest()==entry['sha256']
 with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(raw);pending=pathlib.Path(f.name)
 pending.replace(model)
moves=[['B','C3'],['W','G7'],['B','C7'],['W','G3'],['B','E5'],['W','F5'],['B','E4'],['W','F4']];queries=[dict(id=str(n),boardXSize=9,boardYSize=9,rules='chinese',komi=7.5,moves=moves[:n],maxVisits=16,includePolicy=True,includeOwnership=True) for n in [0,4,8]];p=subprocess.run([program,'analysis','-config','in/analysis.cfg','-model',str(model)],input='\n'.join(json.dumps(q) for q in queries)+'\n',capture_output=True,text=True,timeout=300);assert p.returncode==0,p.stderr;answers={r['id']:r for line in p.stdout.splitlines() if (r:=json.loads(line)).get('isDuringSearch') is False};assert len(answers)==3;frames=[]
for i,q in enumerate(queries):
 r=answers[q['id']];policy=r['policy'];assert len(policy)==82 and abs(sum(x for x in policy if x>=0)-1)<1e-5;assert len(r['ownership'])==81 and all(math.isfinite(x) and -1.001<=x<=1.001 for x in r['ownership']);assert r['rootInfo']['visits']==16
 im=Image.new('RGB',(512,512),'#14202c');d=ImageDraw.Draw(im);d.rectangle((48,45,464,461),fill='#d6b77f');pos=lambda x,y:(64+x*48,61+y*48)
 for a in range(9):d.line((*pos(0,a),*pos(8,a)),fill='#6e5837');d.line((*pos(a,0),*pos(a,8)),fill='#6e5837')
 maximum=max(policy[:81])
 for a,value in enumerate(policy[:81]):
  if value<=0:continue
  x,y=pos(a%9,a//9);radius=3+14*math.sqrt(value/maximum);d.ellipse((x-radius,y-radius,x+radius,y+radius),fill='#278c83')
 for color,vertex in q['moves']:
  x='ABCDEFGHJ'.index(vertex[0]);y=9-int(vertex[1:]);px,py=pos(x,y);d.ellipse((px-18,py-18,px+18,py+18),fill='#10151c' if color=='B' else '#f5f3ed',outline='#57534c',width=2)
 d.text((35,482),f"{len(q['moves'])} moves / native NN policy / 16 visits",fill='white');im.save(out/f'render-{i}.png');frames.append(dict(moves=q['moves'],policy=policy,ownership=r['ownership'],winrateBlack=r['rootInfo']['winrate'],scoreLeadBlack=r['rootInfo']['scoreLead'],visits=r['rootInfo']['visits']));print(q['id'],frames[-1]['winrateBlack'],flush=True)
(out/'result.json').write_text(json.dumps(dict(engine=version.strip(),frames=frames),allow_nan=False))
