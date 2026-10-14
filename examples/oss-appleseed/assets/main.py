from pathlib import Path
import sys,json,subprocess,xml.etree.ElementTree as E,tempfile,shutil
exe=Path(sys.argv[1]).absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);frames=[]
for i,(label,x,y,z,color) in enumerate([('Warm left',-3,4,3,'1 .55 .22'),('Cool right',3,4,3,'.22 .55 1'),('White overhead',0,6,0,'1 1 1')]):
 with tempfile.TemporaryDirectory() as work:
  work=Path(work);root=E.parse('in/scene.appleseed').getroot();root.find("./scene/assembly/color[@name='light_intensity']/values").text=color
  root.find("./scene/assembly/color[@name='light_intensity']/parameter[@name='multiplier']").set('value','110')
  root.find('./scene/assembly/light/transform/matrix').text=f'1 0 0 {x} 0 1 0 {y} 0 0 1 {z} 0 0 0 1'
  E.ElementTree(root).write(work/'scene.appleseed',encoding='utf-8',xml_declaration=True);shutil.copy('in/scene.obj',work/'scene.obj')
  subprocess.run([str(exe),'--threads','2','--samples','64','64','--noise-seed','17','--disable-autosave','--output',str(out/f'render-{i}.png'),str(work/'scene.appleseed')],check=True,timeout=240)
  frames.append({'label':label,'lightPosition':[x,y,z],'samples':64})
(out/'result.json').write_text(json.dumps({'frames':frames,'engine':'appleseed 2.1.0-beta'}))
