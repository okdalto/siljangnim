import pathlib,sys,json,hashlib,urllib.request,tempfile,os
from PIL import Image,ImageDraw,ImageFont,ImageFilter
config=json.loads(pathlib.Path(sys.argv[1]).read_text());out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'paddleocr';cache.mkdir(parents=True,exist_ok=True);models={}
for model in config['models']:
 folder=cache/model['name']/model['revision'];folder.mkdir(parents=True,exist_ok=True)
 for file in model['files']:
  target=folder/file['path']
  if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=file['sha256']:
   raw=urllib.request.urlopen(file['url'],timeout=120).read();assert hashlib.sha256(raw).hexdigest()==file['sha256']
   with tempfile.NamedTemporaryFile(dir=folder,delete=False) as f:f.write(raw);pending=pathlib.Path(f.name)
   pending.replace(target)
 models[model['name']]=str(folder)
os.environ['PADDLE_PDX_CACHE_HOME']=str(cache/'runtime');os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK']='True'
from paddleocr import PaddleOCR
model=PaddleOCR(text_detection_model_name='PP-OCRv5_mobile_det',text_detection_model_dir=models['PP-OCRv5_mobile_det'],text_recognition_model_name='PP-OCRv5_mobile_rec',text_recognition_model_dir=models['PP-OCRv5_mobile_rec'],use_doc_orientation_classify=False,use_doc_unwarping=False,use_textline_orientation=False,device='cpu',enable_mkldnn=False)
base=Image.new('RGB',(640,320),'white');d=ImageDraw.Draw(base);font=ImageFont.load_default(size=42);expected=['SILJANGNIM','OPEN SOURCE LAB','NATIVE OCR 2026']
for i,text in enumerate(expected):d.text((35,35+i*80),text,font=font,fill='black')
frames=[]
for i,im in enumerate([base,base.rotate(2,resample=Image.Resampling.BICUBIC,fillcolor='white'),base.filter(ImageFilter.GaussianBlur(1))]):
 input_path=out/f'input-{i}.png';im.save(input_path);result=list(model.predict(str(input_path)))[0];texts=result['rec_texts'];assert texts==expected,texts;boxes=result['rec_polys'];scores=[float(x) for x in result['rec_scores']];assert min(scores)>.8
 shown=im.copy();draw=ImageDraw.Draw(shown)
 for box,score in zip(boxes,scores):
  points=[tuple(int(v) for v in p) for p in box];draw.line(points+[points[0]],fill='#16887e',width=2);draw.text((points[0][0],max(0,points[0][1]-14)),f'{score:.3f}',fill='#12675e')
 shown.save(out/f'render-{i}.png');frames.append(dict(texts=texts,scores=scores,polygons=[x.tolist() for x in boxes]));print(i,texts,scores,flush=True)
(out/'result.json').write_text(json.dumps(dict(engine='PaddleOCR 3.7.0, PaddlePaddle 3.3.1 CPU, PP-OCRv5 mobile',frames=frames),allow_nan=False))
