import pathlib,json,hashlib,os,sys,tempfile,urllib.request
from PIL import Image,ImageDraw,ImageFont,ImageFilter
import tesserocr
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);config=json.loads(source.read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'tesseract'/config['sha256'];cache.mkdir(parents=True,exist_ok=True);model=cache/'eng.traineddata'
if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest()!=config['sha256']:
 data=urllib.request.urlopen(config['url'],timeout=120).read();assert hashlib.sha256(data).hexdigest()==config['sha256']
 with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
 pending.replace(model)
font=ImageFont.load_default(size=44);small=ImageFont.load_default(size=15);base=Image.new('RGB',(640,300),'white');d=ImageDraw.Draw(base);expected=['SILJANGNIM','OPEN SOURCE LAB','NATIVE OCR 2026']
for i,line in enumerate(expected):d.text((36,45+i*72),line,font=font,fill='black')
frames=[]
for idx,img in enumerate([base,base.rotate(2,resample=Image.Resampling.BICUBIC,fillcolor='white'),base.filter(ImageFilter.GaussianBlur(1))]):
 img.save(out/f'input-{idx}.png')
 with tesserocr.PyTessBaseAPI(path=str(cache),lang='eng',psm=tesserocr.PSM.SINGLE_BLOCK) as api:
  api.SetImage(img);text=api.GetUTF8Text();api.Recognize();it=api.GetIterator();words=[]
  for item in tesserocr.iterate_level(it,tesserocr.RIL.WORD):
   word=item.GetUTF8Text(tesserocr.RIL.WORD);confidence=item.Confidence(tesserocr.RIL.WORD);box=item.BoundingBox(tesserocr.RIL.WORD)
   if word and box:words.append(dict(text=word.strip(),confidence=float(confidence),box=list(box)))
 normalized=' '.join(text.split());assert normalized==' '.join(expected),(idx,text);assert words
 result=img.copy();draw=ImageDraw.Draw(result)
 for word in words:
  x1,y1,x2,y2=word['box'];draw.rectangle((x1,y1,x2,y2),outline='#07846d',width=2);draw.text((x1,max(0,y1-20)),str(round(word['confidence']))+'%',font=small,fill='#075f52')
 result.save(out/f'render-{idx}.png');frames.append(dict(text=text,words=words))
(out/'result.json').write_text(json.dumps(dict(engine=tesserocr.tesseract_version(),binding=tesserocr.__version__,frames=frames),indent=2))
