import jpype,json,pathlib,math,sys
jpype.startJVM(classpath=sys.argv[1:],convertStrings=True)
C=jpype.JClass('micycle.pgs.PGS_Conversion');P=jpype.JClass('micycle.pgs.PGS_CirclePacking')
# Own concave polygon, in native Processing coordinates.
xy=[[0,0],[400,0],[400,140],[270,140],[270,300],[400,300],[400,400],[0,400],[0,0]]
shape=C.fromArray(jpype.JArray(jpype.JDouble,2)(xy),True)
geometry=C.fromPShape(shape);GF=jpype.JClass('org.locationtech.jts.geom.GeometryFactory')();Coordinate=jpype.JClass('org.locationtech.jts.geom.Coordinate')
frames=[]
for count in [20,60,120]:
 circles=[[float(c.x),float(c.y),float(c.z)] for c in P.maximumInscribedPack(shape,jpype.JInt(count),.15)]
 assert len(circles)==count and all(math.isfinite(v) for c in circles for v in c)
 for i,(x,y,r) in enumerate(circles):
  point=GF.createPoint(Coordinate(x,y));assert geometry.covers(point) and geometry.getBoundary().distance(point)>=r-.002
  assert r>0
  for a,b,s in circles[:i]:assert math.hypot(x-a,y-b)>=r+s-.002
 paths=[{'points':[[x/200-1,y/200-1] for x,y in xy],'color':'#a7c5df','closed':True}]
 for x,y,r in circles:
  pts=[[(x+r*math.cos(a*math.tau/64))/200-1,(y+r*math.sin(a*math.tau/64))/200-1] for a in range(64)]
  paths.append({'points':pts,'color':'#67dfcb','closed':True})
 frames.append({'label':str(count)+' maximum inscribed circles','circles':circles,'paths':paths,'count':count,'points':[],'values':[]})
 print('PASS native PGS',count,'nonoverlap and boundary checks')
pathlib.Path('out/result.json').write_text(json.dumps({'frames':frames}))
jpype.shutdownJVM()
