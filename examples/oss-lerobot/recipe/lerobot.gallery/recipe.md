---
id: lerobot.gallery
version: 1
title: A pretrained policy pushes a block into place
capability: lerobot graphics
tier: C
kind: python
packages: ["torch==2.7.1", "torchvision==0.22.1", "numpy==2.2.6", "Pillow==12.3.0", "diffusers==0.33.1", "draccus==0.10.0", "gym-pusht==0.1.5", "gymnasium==0.29.1", "pygame==2.6.1", "pymunk==6.11.1", "shapely==2.1.2", "opencv-python==4.11.0.86", "datasets==3.6.0", "av==15.1.0", "jsonlines==4.0.0", "deepdiff==8.6.1", "pyserial==3.5", "huggingface-hub==0.34.4", "safetensors==0.5.3", "einops==0.8.1", "pandas==2.3.3", "pyarrow==21.0.0", "scipy==1.16.3", "scikit-image==0.25.2"]
source:
  name: "LeRobot"
  repo: https://github.com/huggingface/lerobot
  license: "Apache-2.0 / data MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: sources.json
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
verify:
  params: {}
  expect_outputs: ["render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# A pretrained policy pushes a block into place

LeRobot runs its original pretrained Diffusion Policy in PushT on Mac, reaching full target overlap after 104 simulated actions.

LeRobot 원본 Diffusion Policy를 Mac의 PushT 시뮬레이션에서 직접 실행해 104번의 동작으로 목표와 완전히 겹치는 결과를 얻었어요.

## Setup

Requires Apple Silicon macOS, Python 3.12+ and several GB of free memory and storage. The recipe downloads and SHA-256 verifies the official LeRobot 0.3.3 wheel and the official diffusion_pusht checkpoint at revision 84a7c23178445c6bbf7e1a884ff497017910f653 (1.05 GB). It extracts the unchanged source with the pinned inference dependencies rather than installing unused hardware and training integrations. Source and weights are cached. MPS inference uses the original 100-step DDPM sampler; no NVIDIA GPU, paid API or physical robot is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 LeRobot 소스와 약 1.05GB의 학습 모델을 필요할 때 받아 체크섬을 확인하고 캐시합니다. 사용하지 않는 로봇 하드웨어·학습 연동 대신 고정한 추론 의존성을 설치합니다. 원본 100단계 DDPM 추론과 PushT 물리를 실행해 104번의 동작 후 목표 겹침 1.0을 얻었습니다. Mac GPU를 사용하며 실제 로봇 제어나 새 학습은 하지 않습니다. 수 GB의 메모리와 저장 공간이 필요합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,urllib.request,zipfile
from PIL import Image,ImageStat
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'lerobot';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for item in sources:
  target=root/item['path'];target.parent.mkdir(parents=True,exist_ok=True)
  if not target.is_file() or digest(target)!=item['sha256']:
   with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:
    pending=pathlib.Path(f.name)
    try:
     with urllib.request.urlopen(item['url'],timeout=180) as r:shutil.copyfileobj(r,f)
    except BaseException:pending.unlink(missing_ok=True);raise
   if digest(pending)!=item['sha256']:pending.unlink();raise RuntimeError('LeRobot source/model checksum mismatch')
   pending.replace(target)
 source=root/'source'
 if not (source/'.ready').exists():
  with zipfile.ZipFile(root/'lerobot.whl') as z:z.extractall(source)
  (source/'.ready').touch()
 env=dict(os.environ,PYTHONPATH=str(source),HF_HUB_OFFLINE='1',PYGAME_HIDE_SUPPORT_PROMPT='1')
 subprocess.run([str(pathlib.Path(sys.executable).absolute()),str(inputs/'main.py'),str(root/'model')],env=env,check=True,timeout=900)
 data=json.loads((output/'result.json').read_text());assert len(data['frames'])==3 and data['maxReward']>0.1 and data['steps']>8
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original LeRobot pretrained policy, native PushT physics, finite actions and target overlap')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original DiffusionPolicy loads every checkpoint key strictly, receives native 96 by 96 PushT observations and agent positions, and predicts eight actions at a time using two observation frames and horizon 16. Gym PushT runs its original Pymunk physics and renderer. Seed 17 produces 104 finite actions and maximum target overlap 1.0. Three frames show initial, middle and terminal states. This is pretrained policy evaluation in simulation, not policy training or control of real hardware. Model architecture, weights, scheduler and engine source are unchanged; only the supported device option is set to mps.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
