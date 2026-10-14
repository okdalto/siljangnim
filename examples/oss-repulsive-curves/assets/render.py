from pathlib import Path
import json,math,colorsys
from PIL import Image,ImageDraw,ImageFont
out=Path('out');result=json.loads((out/'result.json').read_text())
for index,frame in enumerate(result['frames']):
 im=Image.new('RGB',(640,480),'#0c1927');draw=ImageDraw.Draw(im);points=frame['points']
 project=lambda p:(320+(p[0]*.85-p[2]*.52)*80,245-(p[1]*.87+p[0]*.22+p[2]*.36)*67)
 depth=lambda p:p[0]*.5-p[1]*.35+p[2]*.8
 segments=[(points[i],points[(i+1)%len(points)],i) for i in range(len(points))];segments.sort(key=lambda s:(depth(s[0])+depth(s[1]))/2)
 for a,b,i in segments:
  xy=[project(a),project(b)];color=tuple(round(v*255) for v in colorsys.hsv_to_rgb(.45+.22*i/len(points),.64,.94));draw.line(xy,fill='#071018',width=10);draw.line(xy,fill=color,width=6)
 draw.text((22,18),'Repulsive Curves / original energy gradients',font=ImageFont.load_default(size=21),fill='#edf2f8');draw.text((22,438),f'Step {frame["step"]} | energy {frame["energy"]:.3f} | fixed length {frame["length"]:.3f}',font=ImageFont.load_default(size=17),fill='#bbcfe0');im.save(out/f'render-{index}.png')
