import pathlib,subprocess,json,math,sqlite3
out=pathlib.Path('out');out.mkdir(exist_ok=True);features=[]
for i in range(19):
 coords=[[20+j/100*50,-35+i*2+.7*math.sin(j*.7+i)] for j in range(101)]
 features.append({'type':'Feature','properties':{'road':i},'geometry':{'type':'LineString','coordinates':coords}})
geo={'type':'FeatureCollection','features':features};(out/'input.geojson').write_text(json.dumps(geo));target=out/'roads.mbtiles'
subprocess.run(['tippecanoe','-f','-Z','1','-z','5','--no-feature-limit','--no-tile-size-limit','-l','roads','-o',str(target),str(out/'input.geojson')],check=True)
with sqlite3.connect(target) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
frames=[]
for zoom in [1,3,5]:
 raw=subprocess.check_output(['tippecanoe-decode','-Z',str(zoom),'-z',str(zoom),str(target)],text=True);(out/f'decoded-{zoom}.json').write_text(raw);data=json.loads(raw);paths=[]
 def collect(obj):
  if isinstance(obj,dict):
   if obj.get('type')=='LineString':paths.append({'points':[[(p[0]-45)/30,(p[1]+17)/30] for p in obj['coordinates']],'color':'#57d8c6'})
   elif obj.get('type')=='MultiLineString':
    for c in obj['coordinates']:collect({'type':'LineString','coordinates':c})
   else:
    for v in obj.values():collect(v)
  elif isinstance(obj,list):
   for v in obj:collect(v)
 collect(data);assert len(paths)>=19;frames.append({'zoom':zoom,'paths':paths,'vertices':sum(len(p['points']) for p in paths)})
assert frames[0]['vertices']<frames[-1]['vertices'];(out/'result.json').write_text(json.dumps({'frames':frames}));print([(f['zoom'],f['vertices']) for f in frames])
