import pathlib,subprocess,json,os
from PIL import Image,ImageDraw,ImageFont
out=pathlib.Path('out');out.mkdir(exist_ok=True);
for n in range(3):subprocess.run(['fontforge','-lang=py','-script','in/font.py',str(out),str(n)],check=True,env={**os.environ,'SOURCE_DATE_EPOCH':'1700000000'})
for i in range(3):
 image=Image.new('RGB',(600,600),'#12202c');draw=ImageDraw.Draw(image);font=ImageFont.truetype(str(out/f'font-{i}.ttf'),480);draw.text((300,300),'A',font=font,anchor='mm',fill='#57d8c6');image.save(out/f'render-{i}.png')

(out/'result.json').write_text(json.dumps({'frames':[json.loads((out/f'result-{i}.json').read_text())['frames'][0] for i in range(3)]}))
