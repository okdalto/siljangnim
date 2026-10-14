from pathlib import Path
import json,sys,os
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
import torch,laya,math,textwrap
from PIL import Image,ImageDraw,ImageFont
root=Path(sys.argv[1]);torch.set_num_threads(2);torch.manual_seed(17)
agent=laya.load(str(root),device='cpu')
questions={'department':{'type':'choice','instructions':'Which support team should handle this request?','criteria':{'billing':'payments, charges, invoices and refunds','technical':'bugs, outages and application errors','shipping':'delivery, tracking and missing packages'}}}
texts=['My card was charged twice for the same order. Please refund the duplicate charge.','The app crashes every time I open settings. I cannot use it.','My package has not arrived and the tracking number has stopped updating.']
frames=[]
for index,text in enumerate(texts):
 r=agent.predict(text,questions);a=r['answers']['department'];probs=a['probabilities']
 assert set(probs)=={'billing','technical','shipping'} and all(math.isfinite(x) and 0<=x<=1 for x in probs.values()) and abs(sum(probs.values())-1)<.001
 assert a['choice'] in probs
 im=Image.new('RGB',(512,384),'#101c2a');d=ImageDraw.Draw(im);font=ImageFont.load_default(size=18);small=ImageFont.load_default(size=15);large=ImageFont.load_default(size=24)
 d.text((24,20),'Laya / original model',font=large,fill='#edf2f8')
 for row,line in enumerate(textwrap.wrap(text,52)):d.text((24,62+row*20),line,font=small,fill='#bdc9da')
 for k,(label,prob) in enumerate(probs.items()):
  y=154+k*58;d.text((24,y),label,font=font,fill='#edf2f8');d.rounded_rectangle((142,y,474,y+25),radius=5,fill='#233449');d.rounded_rectangle((142,y,142+332*prob,y+25),radius=5,fill='#57d8c6' if label==a['choice'] else '#7486ae');d.text((380,y+29),f'{prob:.2%}',font=small,fill='#bdc9da')
 d.text((24,346),'Selected: '+a['choice'],font=font,fill='#57d8c6');im.save(Path('out')/f'render-{index}.png')
 frames.append({'input':text,'label':a['choice'],'probabilities':probs,'result':r})
Path('out/result.json').write_text(json.dumps({'frames':frames,'model':'Laya 0.3.21 / English checkpoint','device':'cpu'},indent=2))
print('PASS original Laya inference', [f['label'] for f in frames],flush=True)
