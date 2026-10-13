import sys,subprocess,pathlib,json,math,collections
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,target in enumerate([150,300,600]):
 p=out/f'remesh-{i}.obj';subprocess.run([sys.argv[1],'-d','-t','1','-f',str(target),'-o',str(p),'in/input.obj'],check=True)
 vertices=[];quads=[]
 for l in p.read_text().splitlines():
  if l.startswith('v '):vertices.append(list(map(float,l.split()[1:4])))
  elif l.startswith('f '):quads.append([int(x.split('/')[0])-1 for x in l.split()[1:]])
 assert len(quads)>100 and all(len(q)==4 and len(set(q))==4 and min(q)>=0 and max(q)<len(vertices) for q in quads)
 assert all(math.isfinite(x) for v in vertices for x in v)
 edges=collections.Counter(tuple(sorted((a,b))) for f in quads for a,b in zip(f,f[1:]+f[:1]));assert all(x==2 for x in edges.values())
 # Preserve quadrilateral faces in the preview and the native OBJ.
 frames.append({'label':f'Target {target} · {len(quads)} quads','mesh':{'vertices':vertices,'faces':quads},'target':target,'quadCount':len(quads),'closed':True})
 print('PASS original Instant Meshes',target,len(vertices),len(quads))
assert len({f['quadCount'] for f in frames})==3
(out/'result.json').write_text(json.dumps({'frames':frames}))
