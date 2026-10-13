import pathlib,subprocess,sys,json,math,tempfile
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,radius in enumerate([2,4,6]):
 # Own voxel input. Original Goxel stores it and exports the surface mesh.
 script=f'''let v=goxel.image.activeLayer.volume;
 for(let z=-10;z<=10;z++)for(let y=-10;y<=10;y++)for(let x=-10;x<=10;x++){{
  if(x*x+y*y+z*z<110 && x*x+z*z>{radius}*{radius})v.setAt([x,y,z],[80+x*5,160+y*4,190+z*3,255]);
 }}
 v.save({json.dumps(str((out/f'surface-{i}.ply').absolute()))});
 v.save({json.dumps(str((out/f'volume-{i}.vox').absolute()))});'''
 with tempfile.NamedTemporaryFile(suffix='.js',mode='w') as f:
  f.write(script);f.flush();subprocess.run([sys.argv[1],'--script',f.name],check=True)
 lines=(out/f'surface-{i}.ply').read_text().splitlines();assert 'Generated from Goxel 0.15.1' in '\n'.join(lines[:5]);n=int(next(s.split()[-1] for s in lines if s.startswith('element vertex')));m=int(next(s.split()[-1] for s in lines if s.startswith('element face')));start=lines.index('end_header')+1
 vertices=[[float(x)/12 for x in l.split()[:3]] for l in lines[start:start+n]];faces=[]
 for l in lines[start+n:start+n+m]:
  f=list(map(int,l.split()));assert len(f)==f[0]+1 and f[0] in [3,4]
  faces.extend([[f[1],f[j],f[j+1]] for j in range(2,f[0])])
 assert len(faces)>100 and all(math.isfinite(x) for v in vertices for x in v) and all(min(f)>=0 and max(f)<n for f in faces)
 assert (out/f'volume-{i}.vox').read_bytes().startswith(b'VOX ')
 frames.append({'label':f'Voxel bore {radius}','mesh':{'vertices':vertices,'faces':faces},'voxelBore':radius,'nativeFaces':m});print('PASS native Goxel export',radius,n,m)
assert len({f['nativeFaces'] for f in frames})==3
(out/'result.json').write_text(json.dumps({'frames':frames}))
