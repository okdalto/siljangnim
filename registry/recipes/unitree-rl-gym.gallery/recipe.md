---
id: unitree-rl-gym.gallery
version: 1
title: A pretrained G1 walking policy in simulation
capability: unitree-rl-gym graphics
tier: C
kind: python
packages: ["torch==2.7.1", "numpy==2.2.6", "mujoco==3.3.6", "PyYAML==6.0.3", "Pillow==12.3.0"]
source:
  name: "Unitree RL Gym"
  repo: https://github.com/unitreerobotics/unitree_rl_gym
  license: "BSD-3-Clause"
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

# A pretrained G1 walking policy in simulation

Unitree RL Gym runs its original pretrained G1 policy for six seconds in MuJoCo, producing joint controls, walking positions and native frames.

Unitree RL Gym 원본 G1 학습 모델을 MuJoCo에서 6초간 직접 실행해 관절 제어값·이동 경로·화면을 얻었어요.

## Setup

Requires Python 3.12+ on Apple Silicon macOS. Original Unitree RL Gym revision 276801e46c5d433564f24658bac64f254b7d2d4b, its G1 TorchScript policy, robot model and mesh inputs are downloaded on first use, SHA-256 verified and cached (about 25 MB). PyTorch 2.7.1 and MuJoCo 3.3.6 execute locally without CUDA.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

원본 G1 모델·관측값 구성·정책 추론·PD 제어를 그대로 실행합니다. 화면 창 부분만 종료 시점과 결과 저장을 지원하는 캡처 문맥으로 연결했습니다. 6초 동안 3,000번의 물리 계산을 수행했고 약 2.706m 전진했습니다. 실제 로봇 제어나 새 정책 학습이 아닌 시뮬레이션 추론 예제입니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile,urllib.request
from PIL import Image,ImageStat
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'unitree-rl-gym';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();root=cache/key;root.mkdir(exist_ok=True)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for item in sources:
  target=root/item['path'];target.parent.mkdir(parents=True,exist_ok=True)
  if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
   with urllib.request.urlopen(item['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Unitree source/model checksum mismatch: '+item['path'])
   with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(target)
 subprocess.run([str(pathlib.Path(sys.executable).absolute()),str(inputs/'main.py'),str(root)],check=True,timeout=180)
 data=json.loads((output/'result.json').read_text());assert len(data['frames'])==3 and len(data['trajectory'])==150
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(512,384) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original Unitree policy, original MuJoCo scene, forward progress and distinct native frames')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original deploy_mujoco.py runs with the original G1 configuration, observation construction, pretrained policy and PD controller. Only its passive viewer context is replaced by a finite capture context so the original loop can stop and export native MuJoCo frames. It runs 3,000 physics steps at 0.002 seconds, controlling 12 actuators at 50 Hz. Native joint values must remain finite, root height above 0.5 m and forward progress above 0.5 m. Observed progress was 2.706 m in six seconds. This is pretrained inference in simulation, not robot hardware operation or policy training.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
