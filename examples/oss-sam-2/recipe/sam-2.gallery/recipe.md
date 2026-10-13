---
id: sam-2.gallery
version: 1
title: Point-guided image regions
capability: segmentation point prompt image
tier: C
kind: python
packages:
- torch==2.9.1
- torchvision==0.24.1
- hydra-core==1.3.2
- omegaconf==2.3.0
- iopath==0.1.10
- numpy==2.2.6
- Pillow==11.3.0
source:
  name: SAM 2
  repo: https://github.com/facebookresearch/sam2
  license: Apache-2.0
io:
  inputs:
  - name: input.png
    media: image
  - name: MODEL_SOURCE.json
    media: file
  outputs:
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: mask-0.png
    media: file
  - name: mask-1.png
    media: file
  - name: mask-2.png
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png","render-1.png","render-2.png","mask-0.png","mask-1.png","mask-2.png","result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Point-guided image regions

SAM 2.1 Tiny predicts masks from three point prompts on an original image. Compare actual CPU predictions; displayed scores are model estimates, not measured accuracy.

SAM 2.1 Tiny를 CPU에서 직접 실행해 원본 그림의 세 점에 대한 마스크를 구했어요. 점수는 측정 정확도가 아닌 모델 추정치예요.

## Setup

Install the pinned packages and map input.png and MODEL_SOURCE.json into in/. No GPU, login or API key is needed. The first run downloads the 156 MB SAM 2.1 Tiny checkpoint and about 55 MB of pinned source. Both are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim/sam2. Repeated runs verify and reuse the files. Opening the gallery only downloads the small prepared images and recipe assets.

처음 재실행할 때 모델 약 156 MB와 원본 소스 약 55 MB를 받아 검증·캐시해요. 갤러리를 열 때 모델을 설치하지 않아요.

## Run

```python
import hashlib,json,os,pathlib,sys,tarfile,tempfile,urllib.request
import torch,numpy as np
from PIL import Image,ImageDraw
meta=json.loads(pathlib.Path('in/MODEL_SOURCE.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'sam2'
cache.mkdir(parents=True,exist_ok=True)
def cached(item,suffix):
 path=cache/(item['sha256']+suffix)
 if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
  with urllib.request.urlopen(item['url'],timeout=180) as response,tempfile.NamedTemporaryFile(dir=cache,delete=False) as file:
   digest=hashlib.sha256()
   while chunk:=response.read(1024*1024):file.write(chunk);digest.update(chunk)
   pending=pathlib.Path(file.name)
  if digest.hexdigest()!=item['sha256']:
   pending.unlink();raise RuntimeError('Downloaded asset checksum mismatch')
  pending.replace(path)
 return path
archive=cached(meta['source'],'.tar.gz');checkpoint=cached(meta['weights'],'.pt')
with tempfile.TemporaryDirectory(prefix='siljangnim-sam2-') as temporary:
 with tarfile.open(archive) as file:file.extractall(temporary,filter='data')
 sys.path.insert(0,str(next(pathlib.Path(temporary).iterdir())))
 from sam2.build_sam import build_sam2
 from sam2.sam2_image_predictor import SAM2ImagePredictor
 torch.set_num_threads(2)
 predictor=SAM2ImagePredictor(build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml',str(checkpoint),device='cpu',apply_postprocessing=False))
 image=Image.open('in/input.png').convert('RGB');pixels=np.array(image);out=pathlib.Path('out');out.mkdir(exist_ok=True);results=[]
 with torch.inference_mode():
  predictor.set_image(pixels)
  for i,point in enumerate([[200,120],[200,300],[227,204]]):
   masks,scores,logits=predictor.predict(point_coords=np.array([point]),point_labels=np.array([1]),multimask_output=True)
   at=int(np.argmax(scores));mask=masks[at]>0
   assert mask.shape==pixels.shape[:2] and mask.any() and not mask.all() and np.all(np.isfinite(scores))
   Image.fromarray((mask*255).astype(np.uint8)).save(out/f'mask-{i}.png')
   overlay=pixels.astype(float);overlay[mask]=overlay[mask]*.45+np.array([80,230,190])*.55
   preview=Image.fromarray(overlay.astype(np.uint8));draw=ImageDraw.Draw(preview);x,y=point;draw.ellipse([x-5,y-5,x+5,y+5],fill='white',outline='black',width=2);preview.save(out/f'render-{i}.png')
   results.append({'point':point,'predicted_iou_score':float(scores[at]),'area_pixels':int(mask.sum())})
 (out/'result.json').write_text(json.dumps({'model':'SAM 2.1 Hiera Tiny','device':'cpu','results':results},indent=2,allow_nan=False))
```

## Verify

Actual CPU inference with two Torch threads. Masks must be finite, nonempty, non-full and match the input dimensions. Each prompt selects the candidate with the highest model-predicted IoU score. Scores are estimates, not independently measured accuracy. Optional CUDA postprocessing is disabled.

## Notes

Original 400×400 procedural flower-and-vase image. Edit the three pixel-coordinate prompts when using another image. The gallery switches between prepared predictions; it does not infer interactively.
