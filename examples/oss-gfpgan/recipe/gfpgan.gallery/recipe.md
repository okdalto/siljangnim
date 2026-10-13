---
id: gfpgan.gallery
version: 1
title: Restoring a degraded face
capability: gfpgan image restoration
tier: C
kind: python
packages: ["torch==2.9.1", "torchvision==0.24.1", "numpy==2.2.6", "Pillow==11.3.0", "setuptools==80.9.0"]
source:
  name: GFPGAN
  repo: https://github.com/TencentARC/GFPGAN
  license: Apache-2.0
io:
  inputs:
  - name: source.json
    media: file
  - name: input-0.png
    media: file
  - name: input-1.png
    media: file
  - name: input-2.png
    media: file
  outputs:
  - name: result.json
    media: file
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
verify:
  params: {}
  expect_outputs: ["result.json", "render-0.png", "render-1.png", "render-2.png"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Restoring a degraded face

GFPGAN v1.4 restores three degraded versions of a manually cropped NASA photograph on the CPU. Compare with the reference: the model can invent facial details.

GFPGAN v1.4를 CPU에서 직접 실행해 NASA 사진을 잘라 손상시킨 세 입력을 복원했어요. 모델이 얼굴 세부를 만들어낼 수 있으니 원본 크롭과 비교하세요.

## Setup

Map source.json and the three 512×512 RGB inputs into in/. The inputs are manually cropped faces; replace them with similarly prepared crops when rerunning. The wrapper downloads GFPGAN 1.3.8 and BasicSR 1.4.2 source packages plus the 348,632,874-byte GFPGAN v1.4 checkpoint, verifies their supplied SHA-256 digests, and caches them under (XDG_CACHE_HOME or ~/.cache)/siljangnim/gfpgan. Viewing downloads only prepared images and this recipe.

The clean architecture and its utility modules are loaded unchanged from published sources, using package namespaces to avoid unrelated trainer and detector initialization. The model runs on CPU with two PyTorch threads and fixed noise. Python 3.12.7 was used for the final recipe verification. GPU execution is not required.

512×512 RGB 얼굴 크롭 세 장과 source.json을 in/에 연결하세요. 재실행할 때만 약 349 MB 체크포인트와 소스 패키지를 받아 SHA-256을 확인하고 캐시해요. 원본의 clean 아키텍처와 유틸리티를 그대로 불러와 CPU로 계산해요.

## Run

```python
import hashlib, json, os, pathlib, tempfile, urllib.request, tarfile, zipfile
import types, sys, time
import torch, numpy as np
from PIL import Image
config=json.loads(pathlib.Path('in/source.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'gfpgan'
cache.mkdir(parents=True,exist_ok=True)
files={}
for item in config:
    dest=cache/(item['sha256']+'-'+item['filename'])
    if not dest.is_file() or hashlib.sha256(dest.read_bytes()).hexdigest()!=item['sha256']:
        with urllib.request.urlopen(item['url'],timeout=180) as response, tempfile.NamedTemporaryFile(dir=cache,delete=False) as pending:
            while chunk:=response.read(1024*1024):pending.write(chunk)
            pending_path=pathlib.Path(pending.name)
        if hashlib.sha256(pending_path.read_bytes()).hexdigest()!=item['sha256']:
            pending_path.unlink()
            raise RuntimeError('Downloaded source/model checksum mismatch')
        pending_path.replace(dest)
        print('Downloaded and verified '+item['name'])
    else:
        print('Using verified cache for '+item['name'])
    files[item['name']]=dest
with tempfile.TemporaryDirectory(prefix='siljangnim-gfpgan-') as temporary:
    work=pathlib.Path(temporary)
    for name in ['gfpgan','basicsr']:
        target=work/name;target.mkdir()
        if name=='gfpgan':
            with zipfile.ZipFile(files[name]) as archive:archive.extractall(target)
        else:
            with tarfile.open(files[name]) as archive:archive.extractall(target,filter='data')
    roots={'basicsr':next((work/'basicsr').iterdir())/'basicsr','gfpgan':work/'gfpgan/gfpgan'}
    os.environ['BASICSR_JIT']='False'
    # Load only the original architecture modules, avoiding optional trainer/detector imports.
    for name in ['basicsr','basicsr.utils','basicsr.archs','basicsr.ops','gfpgan','gfpgan.archs']:
     root,*parts=name.split('.');module=types.ModuleType(name);module.__path__=[str(roots[root].joinpath(*parts))];sys.modules[name]=module
     if '.' in name:
      parent,child=name.rsplit('.',1);setattr(sys.modules[parent],child,module)
    from basicsr.utils.logger import get_root_logger
    sys.modules['basicsr.utils'].get_root_logger=get_root_logger
    from gfpgan.archs.gfpganv1_clean_arch import GFPGANv1Clean
    torch.set_num_threads(2);torch.manual_seed(17)
    model=GFPGANv1Clean(out_size=512,num_style_feat=512,channel_multiplier=2,decoder_load_path=None,fix_decoder=False,num_mlp=8,input_is_latent=True,different_w=True,narrow=1,sft_half=True)
    state=torch.load(files['model'],map_location='cpu',weights_only=True);model.load_state_dict(state['params_ema'],strict=True);model.eval();out=pathlib.Path('out');out.mkdir(exist_ok=True);results=[]
    with torch.inference_mode():
     for i in range(3):
      image=np.asarray(Image.open(pathlib.Path('in')/('input-'+str(i)+'.png')).convert('RGB')).copy();x=torch.from_numpy(image).permute(2,0,1).float().unsqueeze(0)/127.5-1;t=time.monotonic();y=model(x,return_rgb=False,randomize_noise=False)[0];assert y.shape==(1,3,512,512) and torch.isfinite(y).all() and float(y.std())>.03
      result=((y[0].clamp(-1,1)+1)*127.5).permute(1,2,0).round().byte().numpy();Image.fromarray(result).save(out/('render-'+str(i)+'.png'));results.append({'inputSize':[32,64,128][i],'seconds':time.monotonic()-t,'outputMean':float(result.mean())});print(i,results[-1],flush=True)
    (out/'result.json').write_text(json.dumps({'model':'GFPGANv1.4','device':'CPU','results':results},indent=2))
```

## Verify

The exact recipe ran from a fresh source/model cache and again using cached files. All three outputs matched the directly computed reference PNGs byte for byte. Tensor shape, finiteness and nonempty pixel variation are checked. These checks verify execution, not restoration fidelity.

## Notes

Input photo: NASA, via scikit-image data.astronaut (public domain as documented by scikit-image). The supplied reference is a manual crop resized to 512 pixels; degraded inputs were reduced to 32, 64 or 128 pixels and enlarged back to 512. Model output can invent details. The viewer's reference toggle makes those differences visible.
