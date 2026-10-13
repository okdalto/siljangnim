import pathlib,subprocess,sys,json,math
out=pathlib.Path('out');out.mkdir(exist_ok=True);java,jar=sys.argv[1:3];frames=[]
patterns=[('Diagonal fold',[(2,-200,-200,200,200)]),('Corner fold',[(2,-200,0,0,200)]),('Accordion fold',[(2,-100,-200,-100,200),(3,0,-200,0,200),(2,100,-200,100,200)])]
for i,(label,creases) in enumerate(patterns):
 edges=[(1,-200,-200,200,-200),(1,200,-200,200,200),(1,200,200,-200,200),(1,-200,200,-200,-200)]+creases;points=[(e[j],e[j+1]) for e in edges for j in [1,3]];split=[]
 for t,x,y,a,b in edges:
  dx,dy=a-x,b-y;cuts=sorted(set(((px-x)*dx+(py-y)*dy)/(dx*dx+dy*dy) for px,py in points if abs((px-x)*dy-(py-y)*dx)<1e-8 and 0<=((px-x)*dx+(py-y)*dy)/(dx*dx+dy*dy)<=1))
  for low,high in zip(cuts,cuts[1:]):split.append((t,x+dx*low,y+dy*low,x+dx*high,y+dy*high))
 edges=split;cp=out/f'pattern-{i}.cp';cp.write_text('\n'.join(' '.join(map(str,e)) for e in edges)+'\n');fold=out/f'folded-{i}.fold';base=[java,'-Djava.awt.headless=true','-jar',jar]
 fold.unlink(missing_ok=True);subprocess.run(base+[str(cp),'--fold',str(fold),'--any'],check=True);assert fold.is_file(), 'Native folding failed'
 subprocess.run(base+[str(fold),'--image',str(out/f'folded-{i}.svg'),'--index','0'],check=True)
 subprocess.run(base+[str(fold),'--image',str(out/f'render-{i}.png'),'--index','0'],check=True)
 data=json.loads(fold.read_text());vertices=data['vertices_coords'];faces=data['faces_vertices'];assert len(faces)==len(creases)+1;assert len(data['file_frames'])>=1;assert all(math.isfinite(c) for v in vertices for c in v);area=0
 for face in faces:
  points=[vertices[v] for v in face];area+=abs(sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(points,points[1:]+points[:1])))/2
 assert abs(area-160000)<.01;frames.append({'label':label,'creases':len(creases),'faces':len(faces),'foldedModels':len(data['file_frames']),'totalFaceArea':area})
(out/'result.json').write_text(json.dumps({'frames':frames}))
