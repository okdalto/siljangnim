---
id: comfyui.gallery
version: 1
title: Images from an original local diffusion workflow
capability: comfyui graphics
tier: C
kind: python
packages: ["comfyui-frontend-package==1.17.11", "comfyui-workflow-templates==0.1.3", "torch==2.7.1", "torchsde==0.2.6", "torchvision==0.22.1", "torchaudio==2.7.1", "numpy==2.2.6", "einops==0.8.2", "transformers==4.51.3", "tokenizers==0.21.1", "sentencepiece==0.2.2", "safetensors==0.8.0", "aiohttp==3.14.3", "yarl==1.25.1", "pyyaml==6.0.3", "Pillow==12.3.0", "scipy==1.18.1", "tqdm==4.70.1", "psutil==7.2.2", "kornia==0.8.3", "spandrel==0.4.2", "soundfile==0.14.0", "av==18.1.0", "pydantic==2.13.5"]
source:
  name: "ComfyUI"
  repo: https://github.com/comfy-org/comfyui
  license: "GPL-3.0"
io:
  inputs:
  - name: driver.py
    media: file
  - name: source.json
    media: file
  - name: workflow.json
    media: file
  outputs:
  - name: render-0.png
    media: file
  - name: render-1.png
    media: file
  - name: render-2.png
    media: file
  - name: result.json
    media: file
  - name: workflow-0.json
    media: file
  - name: workflow-1.json
    media: file
  - name: workflow-2.json
    media: file
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json", "workflow-0.json", "workflow-1.json", "workflow-2.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Images from an original local diffusion workflow

ComfyUI 0.3.30 runs a nine-node Stable Diffusion 1.5 workflow on Apple MPS and generates three original images from fixed seeds.

ComfyUI 0.3.30 원본의 9개 노드 워크플로를 Apple MPS에서 실행해 세 시드의 이미지를 직접 생성했어요.

## Setup

Requires Apple Silicon macOS, Python 3.12 and at least 16 GB unified memory. Tested with Torch 2.7.1 and MPS. Original ComfyUI revision a97f2f850abd7dd330e6363c8d8074bb243eb413 (0.3.30) and Stable Diffusion 1.5 revision 451f4fe16113bff5a5d2269ed5ad43b0592e9a14 are SHA-256 verified and cached. The first recipe run downloads about 2.13 GB of model weights plus Python dependencies. The gallery downloads only the prepared images. Model weights use CreativeML Open RAIL-M, separately from the ComfyUI GPL-3.0 engine.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

Apple Silicon macOS, Python 3.12, 통합 메모리 16GB 이상에서 검증했습니다. 레시피 최초 실행 시 모델 약 2.13GB와 의존성을 내려받고 이후 재사용합니다. 갤러리는 생성 결과 이미지만 받습니다. 원본 ComfyUI 노드로 MPS 추론과 CPU VAE 디코딩을 실행했습니다. 모델에는 ComfyUI의 GPL-3.0과 별개인 CreativeML Open RAIL-M 조건이 적용됩니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tarfile,tempfile,urllib.request
from PIL import Image,ImageStat
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This verified recipe targets Apple Silicon macOS with at least 16 GB unified memory.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True);config=json.loads((inputs/'source.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'comfyui';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((inputs/'source.json').read_bytes()).hexdigest();root=cache/key

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def fetch(item,suffix):
 target=cache/(item['sha256']+suffix)
 if target.is_file() and digest(target)==item['sha256']:return target
 with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:
  pending=pathlib.Path(f.name);h=hashlib.sha256()
  try:
   with urllib.request.urlopen(item['url'],timeout=180) as response:
    while chunk:=response.read(1024*1024):f.write(chunk);h.update(chunk)
   if h.hexdigest()!=item['sha256']:raise RuntimeError('Model/source checksum mismatch')
  except BaseException:pending.unlink(missing_ok=True);raise
 pending.replace(target);return target
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 source=config['source'];archive=fetch(source,'.tar.gz');engine=cache/source['sha256']
 if not (engine/'ready').is_file():
  engine.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(engine,filter='data')
  (engine/'ready').write_text(source['sha256'])
 root.mkdir(exist_ok=True);models=root/'models';models.mkdir(exist_ok=True)
 for item in config['models']:
  file=fetch(item,'.safetensors');link=models/item['target'];link.parent.mkdir(parents=True,exist_ok=True)
  if not link.exists():link.symlink_to(file)
 source_dir=next(p for p in engine.iterdir() if p.is_dir() and (p/'main.py').is_file())
 subprocess.run([str(pathlib.Path(sys.executable).absolute()),str(inputs/'driver.py'),str(source_dir),str(models)],check=True)
 frames=json.loads((output/'result.json').read_text())['frames'];assert [f['seed'] for f in frames]==[17,23,41]
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(384,384) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS native ComfyUI workflow, Stable Diffusion 1.5 inference and three distinct nonblank images')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied nine-node workflow uses original UNETLoader, CLIPLoader, VAELoader, text encoders, EmptyLatentImage, KSampler, VAEDecode and SaveImage. It renders the supplied ceramic-house prompt at 384 by 384, 16 Euler steps and CFG 7 for seeds 17, 23 and 41. The local server binds only loopback, disables custom nodes and runs with offline tokenizers; the UNet uses MPS and VAE uses CPU. Native history success, dimensions, image variation and workflow metadata are checked. No upstream rendered sample is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
