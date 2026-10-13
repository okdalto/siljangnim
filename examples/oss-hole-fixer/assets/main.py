import pathlib,math,subprocess,sys,json,collections
out=pathlib.Path('out');out.mkdir(exist_ok=True);n=24;lat=16;start=4;verts=[];faces=[]
for j in range(start,lat):
 for i in range(n):
  theta=math.pi*j/lat;phi=2*math.pi*i/n;verts.append([math.sin(theta)*math.cos(phi),math.cos(theta),math.sin(theta)*math.sin(phi)])
rows=lat-start
for j in range(rows-1):
 for i in range(n):
  a=j*n+i;b=j*n+(i+1)%n;c=(j+1)*n+i;d=(j+1)*n+(i+1)%n;faces.extend([[a,c,b],[b,c,d]])
bottom=len(verts);verts.append([0,-1,0])
for i in range(n):faces.append([(rows-1)*n+i,bottom,(rows-1)*n+(i+1)%n])
source=out/'input.off';source.write_text('OFF\n'+f'{len(verts)} {len(faces)} 0\n'+'\n'.join(' '.join(map(str,v)) for v in verts)+'\n'+'\n'.join('3 '+' '.join(map(str,f)) for f in faces)+'\n')
def frame(v,f,label):
 assert all(math.isfinite(x) for p in v for x in p)
 edges=collections.Counter(tuple(sorted((a,b))) for tri in f for a,b in zip(tri,tri[1:]+tri[:1]));assert all(c in [1,2] for c in edges.values());boundary=sum(c==1 for c in edges.values());return {'label':label,'boundaryEdges':boundary,'mesh':{'vertices':v,'faces':f}}
frames=[frame(verts,faces,'Input with open cap')];assert frames[0]['boundaryEdges']==n
for k,upsample in enumerate([0,2]):
 file=out/f'repaired-{k}.off';subprocess.run([sys.argv[1],'-in',str(source),'-out',str(file),'-outfaces','900','-upsample',str(upsample)],check=True)
 parts=file.read_text().split();assert parts.pop(0)=='OFF';nv,nf,ne=map(int,parts[:3]);parts=parts[3:];v=[list(map(float,parts[i*3:i*3+3])) for i in range(nv)];parts=parts[3*nv:];f=[]
 for i in range(nf):assert parts[4*i]=='3';f.append(list(map(int,parts[4*i+1:4*i+4])))
 item=frame(v,f,'Fairing upsample '+str(upsample));assert item['boundaryEdges']==0;frames.append(item)
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS native surface fairing closes the input boundary')
