import pathlib,json,sys,random,math
from CGAL.CGAL_Kernel import Point_2
from CGAL.CGAL_Triangulation_2 import Constrained_Delaunay_triangulation_2
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True);frames=[]
for count in [25,70,160]:
 random.seed(12);tri=Constrained_Delaunay_triangulation_2();ring=[Point_2(.8*math.cos(i*math.pi/4),.8*math.sin(i*math.pi/4)) for i in range(8)]
 for i in range(8):tri.insert_constraint(ring[i],ring[(i+1)%8])
 for i in range(count):
  a=random.random()*2*math.pi;r=.7*math.sqrt(random.random());tri.insert(Point_2(r*math.cos(a),r*math.sin(a)))
 assert tri.is_valid();paths=[];area=0
 for face in tri.finite_faces():
  pts=[[face.vertex(i).point().x(),face.vertex(i).point().y()] for i in range(3)];a,b,c=pts;area+=abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2;paths.append(dict(points=pts+[pts[0]],color='#57d8c6'))
 expected=4*.8**2*math.sin(math.pi/4);assert abs(area-expected)<1e-8
 for i in range(8):paths.append(dict(points=[[ring[i].x(),ring[i].y()],[ring[(i+1)%8].x(),ring[(i+1)%8].y()]],color='#ffbc78'))
 frames.append(dict(paths=paths,vertices=tri.number_of_vertices(),faces=len(paths)-8,area=area));print(count,len(paths)-8,area)
(out/'result.json').write_text(json.dumps(dict(engine='CGAL 6.0.1 constrained Delaunay',frames=frames),allow_nan=False))
