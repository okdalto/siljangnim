from pathlib import Path
import json,math
from PIL import Image,ImageDraw,ImageFont
out=Path('out');result=json.loads((out/'result.json').read_text());corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]]
def rotate(v,q):
 x,y,z=v;a,b,c,w=q;tx=2*(b*z-c*y);ty=2*(c*x-a*z);tz=2*(a*y-b*x);return [x+w*tx+b*tz-c*ty,y+w*ty+c*tx-a*tz,z+w*tz+a*ty-b*tx]
project=lambda p:(320+58*(.85*p[0]-.52*p[2]),410-58*(-.22*p[0]+.91*p[1]-.36*p[2]))
depth=lambda p:.5*p[0]+.35*p[1]+.8*p[2]
for index,frame in enumerate(result['frames']):
 im=Image.new('RGB',(640,480),'#0c1927');draw=ImageDraw.Draw(im)
 for v in range(-4,5):
  draw.line([project([v,0,-4]),project([v,0,4])],fill='#23384a');draw.line([project([-4,0,v]),project([4,0,v])],fill='#23384a')
 polygons=[];min_corner=100
 for body in frame['bodies']:
  p=body['position'];vertices=[[p[k]+v[k] for k in range(3)] for v in [rotate([x*body['halfSize'] for x in c],body['quaternion']) for c in corners]];min_corner=min(min_corner,min(v[1] for v in vertices));base=[(76,196,179),(113,159,231),(229,167,107)][body['index']%3]
  for fi,face in enumerate(faces):
   verts=[vertices[i] for i in face];shade=[.62,.95,.55,1,.72,.85][fi];polygons.append((sum(depth(v) for v in verts)/4,[project(v) for v in verts],tuple(round(v*shade) for v in base)))
 for _,poly,color in sorted(polygons):draw.polygon(poly,fill=color,outline='#101c28',width=1)
 if index==2:assert min_corner>-.04,('Ground penetration',min_corner)
 draw.text((22,18),'PhysX 5.11 / original rigid-body simulation',font=ImageFont.load_default(size=21),fill='#edf2f8');draw.text((22,441),f'{frame["time"]:.2f} s | 36 boxes | mean height {frame["meanHeight"]:.3f} m',font=ImageFont.load_default(size=17),fill='#bbcfe0');im.save(out/f'render-{index}.png')
print('PASS native transformed box corners remain above the ground')
