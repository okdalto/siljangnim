import pathlib,subprocess,json,re,xml.etree.ElementTree as ET
from PIL import Image,ImageDraw
from svgpathtools import parse_path
out=pathlib.Path('out');out.mkdir(exist_ok=True);im=Image.new('RGB',(256,256),'white');d=ImageDraw.Draw(im);d.ellipse((30,30,180,180),fill='#e69355');d.polygon([(100,220),(220,80),(235,225)],fill='#57d8c6');im.save(out/'input.ppm');frames=[]
for i,error in enumerate([.2,2,10]):
 target=out/f'trace-{i}.svg';subprocess.run(['autotrace','--background-color','FFFFFF','--error-threshold',str(error),'--output-format','svg','--output-file',str(target),str(out/'input.ppm')],check=True);paths=[]
 for el in ET.parse(target).getroot().iter():
  if el.tag.endswith('path'):
   p=parse_path(el.attrib['d']);points=[]
   for segment in p:
    points.extend([[segment.point(t/20).real/128-1,1-segment.point(t/20).imag/128] for t in range(21)])
   assert points;paths.append({'points':points,'color':re.search(r'fill:([^;]+)',el.attrib.get('style','fill:#57d8c6;')).group(1)})
 assert paths;frames.append({'errorThreshold':error,'paths':paths})
(out/'result.json').write_text(json.dumps({'frames':frames}))
