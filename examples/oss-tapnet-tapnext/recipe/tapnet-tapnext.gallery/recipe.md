---
id: tapnet-tapnext.gallery
version: 1
title: TAPIR tracks points in a supplied moving image
capability: tapnet-tapnext graphics
tier: C
kind: python
packages: ["torch==2.7.1", "numpy==2.2.6", "dm-tree==0.1.9", "einshape==1.0", "Pillow==12.3.0"]
source:
  name: "TAPNet / TAPNext++"
  repo: https://github.com/google-deepmind/tapnet
  license: "Apache-2.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: input-0.png
    media: file
  - name: input-7.png
    media: file
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
  expect_outputs: ["input-0.png", "input-7.png", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# TAPIR tracks points in a supplied moving image

Original TAPIR weights track three points through eight supplied frames; predictions are compared with known motion and overlaid on the images.

원본 TAPIR 학습 모델로 직접 만든 8프레임의 점 세 개를 추적하고, 알려진 이동량과 비교한 예측 좌표를 화면에 표시했어요.

## Setup

Requires Python 3.12+; verified on Apple Silicon macOS with CPU inference. The recipe downloads and SHA-256 verifies original TAPNet revision 730cda1c730877cfedbe01bf87fb1cadb78a565d and the official tapir_checkpoint_panning.pt checkpoint (124 MB). Source and weights are cached. The original TAPIR implementation uses pyramid_level=0 and extra_convs=False as required by this checkpoint.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

TAPNet/TAPNext 저장소에 포함된 TAPIR 모델을 실행한 예제입니다. TAPNext 추론은 아닙니다. 직접 만든 무늬 영상이 프레임마다 가로 6·세로 3픽셀 이동하며, 원본 모델이 예측한 경로를 실제 이동량과 비교합니다. 평균 오차는 약 0.592픽셀, 최대 오차는 약 1.119픽셀이었습니다. 표시용 선만 예측 좌표 위에 덧그렸고 엔진·가중치는 수정하지 않았습니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile,urllib.request
from PIL import Image,ImageStat
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text())
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'tapnet-tapnext';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();root=cache/key;root.mkdir(exist_ok=True)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for item in sources:
  target=root/item['path'];target.parent.mkdir(parents=True,exist_ok=True)
  if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=item['sha256']:
   with urllib.request.urlopen(item['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('TAPNet source/model checksum mismatch: '+item['path'])
   with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(target)
 subprocess.run([str(pathlib.Path(sys.executable).absolute()),str(inputs/'main.py'),str(root)],check=True,timeout=180)
 data=json.loads((output/'result.json').read_text());assert len(data['frames'])==3 and data['meanError']<3 and data['maxError']<8
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(256,256) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original TAPIR weights and source, tracked coordinates and bounded ground-truth errors')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

This example exercises the TAPIR model within the TAPNet/TAPNext repository, not the TAPNext architecture. A supplied seeded 256 by 256 textured image moves by six horizontal and three vertical pixels per frame for eight frames. The original model predicts tracks and visibility for three query points. Known translation provides ground truth: observed mean error 0.592 pixels and maximum error 1.119 pixels, below the three/eight pixel checks. Pillow draws the native predicted tracks on supplied input frames for viewing. Model source and weights are unchanged; no upstream demo video or gallery result is used.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
