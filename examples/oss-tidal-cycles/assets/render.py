from pathlib import Path
import json,math
from PIL import Image,ImageDraw
out=Path('out');data=json.loads((out/'result.json').read_text());colors={'bd':'#ffbd79','hh':'#57d8c6','sn':'#ad9bff','cp':'#fa7f9c'};labels={'bd':'Bass drum','hh':'Hi-hat','sn':'Snare','cp':'Clap'}
assert data['doubleReverseVerified'] and [len(f['events']) for f in data['frames']]==[12,24,12]
for index,frame in enumerate(data['frames']):
 im=Image.new('RGB',(640,400),'#0a1420');d=ImageDraw.Draw(im)
 d.text((24,20),'Tidal Cycles / original pattern parser and time operators',fill='#d4e4ef');d.text((24,45),data['pattern'],fill='#8ba4b9');d.text((24,72),frame['label'],fill='#f1f6fa')
 left,right,top=120,612,112
 for step in range(17):
  x=left+(right-left)*step/16;d.line((x,top-10,x,330),fill='#395065' if step%8==0 else '#1c2b3b',width=2 if step%8==0 else 1)
  if step%4==0:d.text((x-6,341),str(step/8),fill='#9cb3c7')
 for row,(key,color) in enumerate(colors.items()):
  y=top+row*53;d.text((24,y+12),labels[key],fill=color)
  for e in frame['events']:
   assert e['sound'] in colors and 0<=e['start']<e['end']<=2 and all(math.isfinite(e[k]) for k in ['start','end'])
   if e['sound']==key:
    x1=left+(right-left)*e['start']/2;x2=left+(right-left)*e['end']/2;d.rounded_rectangle((x1+2,y,x2-2,y+34),radius=3,fill=color)
 d.text((24,376),f"{len(frame['events'])} native events | two cycles | event timing only, no audio engine",fill='#9cb3c7');im.save(out/f'render-{index}.png')
