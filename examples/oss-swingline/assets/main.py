import pathlib,sys,subprocess,json,math,xml.etree.ElementTree as ET
out=pathlib.Path('out');out.mkdir(exist_ok=True);frames=[]
for i,steps in enumerate([10,30,60]):
 target=out/f'stipples-{i}.svg';subprocess.run([sys.argv[1],'-n','300','-i',str(steps),'-o',str(target),'in/input.png'],check=True,timeout=60)
 root=ET.parse(target).getroot();circles=root.findall('{http://www.w3.org/2000/svg}circle');assert len(circles)==300
 data=[[float(c.attrib[k]) for k in ['cx','cy','r']] for c in circles]
 assert all(math.isfinite(v) for row in data for v in row) and all(0<=x<=768 and 0<=y<=768 and 0<r<10 for x,y,r in data)
 frames.append({'label':f'{steps} GPU iterations','iterations':steps,'points':[[x/384-1,1-y/384] for x,y,r in data],'radii':[r/384 for x,y,r in data]});print('PASS original GPU stippling',steps,len(data))
assert len({json.dumps(f['points']) for f in frames})==3
(out/'result.json').write_text(json.dumps({'frames':frames}))
