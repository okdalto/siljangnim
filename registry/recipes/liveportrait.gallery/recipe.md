---
id: liveportrait.gallery
version: 1
title: Changing a portrait’s head direction
capability: liveportrait graphics
tier: C
kind: python
packages: ["torch==2.7.1", "numpy==1.26.4", "opencv-python-headless==4.10.0.84", "scipy==1.16.3", "PyYAML==6.0.2", "rich==13.7.1", "Pillow==12.3.0"]
source:
  name: "LivePortrait"
  repo: https://github.com/klingairesearch/liveportrait
  license: "MIT code / dependent models separate"
io:
  inputs:
  - name: driver.py
    media: file
  - name: portrait.png
    media: file
  - name: sources.json
    media: file
  outputs:
  - name: native-0.png
    media: file
  - name: native-1.png
    media: file
  - name: native-2.png
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
  expect_outputs: ["native-0.png", "native-1.png", "native-2.png", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Changing a portrait’s head direction

Original LivePortrait predicts face features and keypoints, then synthesizes three head directions on the local CPU.

원본 LivePortrait가 얼굴 특징과 키포인트를 추론하고 CPU에서 세 방향의 얼굴 이미지를 직접 생성합니다.

## Setup

Requires Python 3.12 and memory for float32 CPU inference. Original LivePortrait code and its five official human-model checkpoints (about 522 MB) are SHA-256 verified, downloaded on demand and cached. Verified on an Apple Silicon Mac without a GPU service or API key. This pre-aligned-input path does not download InsightFace, landmark detection or animal models.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

공식 사람용 모델 다섯 개 약 522MB를 처음 실행할 때 받아 검증하고 캐시합니다. 입력은 공개 사용 가능한 NASA 사진을 미리 잘라 정렬한 것입니다. 원본 특징 추출·키포인트·스티칭·워핑·디코더로 좌우 12도와 기준 방향을 계산합니다. 결과는 실제 촬영 사진이 아닌 AI가 생성한 방향 변형입니다. 자동 얼굴 검출·구동 영상 분석·동물 모델·전체 화면 합성까지 실행하는 예제는 아닙니다.

## Run

```python
from pathlib import Path
import concurrent.futures,fcntl,hashlib,json,os,subprocess,sys,tarfile,time,urllib.request
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/liveportrait';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
def verified(path,item):
 if not path.exists() or path.stat().st_size!=item['size']:return False
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()==item['sha256']
def download(item,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if verified(path,item):return
 if item['size']<64*1024*1024:
  with urllib.request.urlopen(item['url'],timeout=180) as r:data=r.read()
  pending=path.with_name(path.name+'.tmp');pending.write_bytes(data)
 else:
  def piece(start):
   end=min(start+8*1024*1024,item['size']);p=path.with_name(path.name+f'.{start}.part')
   for attempt in range(6):
    offset=p.stat().st_size if p.exists() else 0
    if offset==end-start:return p
    if offset>end-start:p.unlink();offset=0
    try:
     req=urllib.request.Request(item['url']+f'?download=true&segment={start}',headers={'Range':f'bytes={start+offset}-{end-1}'})
     with urllib.request.urlopen(req,timeout=120) as r,p.open('ab') as f:
      if r.status!=206 or not r.headers.get('Content-Range','').startswith(f'bytes {start+offset}-{end-1}/'):raise RuntimeError('Unexpected model range response')
      while data:=r.read(256*1024):f.write(data)
     if p.stat().st_size!=end-start:raise RuntimeError('Incomplete model segment')
     return p
    except Exception:
     if attempt==5:raise
     time.sleep(1+attempt)
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:parts=list(pool.map(piece,range(0,item['size'],8*1024*1024)))
  pending=path.with_name(path.name+'.tmp')
  with pending.open('wb') as f:
   for p in parts:
    with p.open('rb') as r:
     while data:=r.read(1024*1024):f.write(data)
    p.unlink()
 if not verified(pending,item):pending.unlink();raise RuntimeError('Original LivePortrait file checksum mismatch')
 pending.replace(path)
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'.ready').exists():
  archive=root/'engine.tar.gz';download(sources['engine'],archive);dest=root/'engine';dest.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(dest,filter='data')
  for item in sources['model']['files']:download(item,root/'model'/item['path'])
  (root/'.ready').touch()
 engine=next((root/'engine').iterdir());env={**os.environ,'PYTHONPATH':str(engine),'OMP_NUM_THREADS':'2'}
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'driver.py'),str(engine),str(root/'model')],env=env,check=True,timeout=600)
 result=json.loads((out/'result.json').read_text());assert len(result['frames'])==3 and min(result['meanPixelChanges'])>1
 print('PASS original LivePortrait CPU keypoints, pose retargeting, stitching, warping and decoding')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A crop of NASA’s public-domain astronaut photograph is supplied as a pre-aligned input. Original appearance extraction, motion/keypoint prediction, keypoint pose transformation, learned stitching, warping and SPADE decoding run unchanged. The driver varies yaw by -12, 0 and +12 degrees, preserving the inferred expression. There are 21 native keypoints and 512×512 synthesized images. The displayed images are AI-generated pose variations, not documentary photographs of those poses. This example demonstrates the original portrait core with a manually aligned input; it does not perform automatic face detection, driving-video extraction, animal animation or full-frame paste-back.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
