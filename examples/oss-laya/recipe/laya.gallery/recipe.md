---
id: laya.gallery
version: 1
title: Original model scores three support decisions
capability: laya graphics
tier: C
kind: python
packages: ["laya==0.3.21", "torch==2.7.1", "transformers==4.50.3", "numpy==2.2.6", "safetensors==0.5.3", "huggingface-hub==0.34.4", "Pillow==12.3.0"]
source:
  name: "Laya"
  repo: https://github.com/nandhakishorm/laya
  license: "Apache-2.0"
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

# Original model scores three support decisions

Laya 0.3.21 runs its original English checkpoint on the CPU and reports decision probabilities for three supplied support messages.

Laya 0.3.21의 원본 영어 학습 모델을 CPU에서 직접 실행해 세 문의 문장의 분류 확률을 계산했어요.

## Setup

Requires Python 3.12+; verified with CPU inference on Apple Silicon macOS. The official English Laya checkpoint at revision 55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851 is downloaded, SHA-256 verified and cached (843 MB weights plus tokenizer/configuration). The original Laya 0.3.21 package and pinned PyTorch/Transformers dependencies load it locally with networking disabled during inference. No API key or CUDA is needed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

약 843MB의 공식 영어 모델과 토크나이저를 받아 캐시합니다. 직접 작성한 세 문장과 세 선택지를 원본 CPU 모델에 넣고 실제 분류 결과·확률·입력 토큰 수를 저장합니다. 차트는 원본 확률을 표시한 것이며 규칙으로 예측을 대신하지 않습니다. 이 예제에는 API 키나 CUDA가 필요하지 않습니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,shutil,subprocess,sys,tempfile,urllib.request
from PIL import Image,ImageStat
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True);sources=json.loads((inputs/'sources.json').read_text());key=hashlib.sha256((inputs/'sources.json').read_bytes()).hexdigest()
cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/laya';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for s in sources:
  p=root/s['path'];p.parent.mkdir(parents=True,exist_ok=True)
  if not p.is_file() or digest(p)!=s['sha256']:
   with tempfile.NamedTemporaryFile(dir=p.parent,delete=False) as f:
    pending=Path(f.name)
    try:
     with urllib.request.urlopen(s['url'],timeout=180) as r:shutil.copyfileobj(r,f)
    except BaseException:pending.unlink(missing_ok=True);raise
   if digest(pending)!=s['sha256']:pending.unlink();raise RuntimeError('Laya model checksum mismatch')
   pending.replace(p)
 subprocess.run([str(Path(sys.executable).absolute()),str(inputs/'main.py'),str(root)],check=True,timeout=300,env=dict(os.environ,HF_HUB_OFFLINE='1',TOKENIZERS_PARALLELISM='false'))
 frames=json.loads((out/'result.json').read_text())['frames'];assert len(frames)==3
 images=[Image.open(out/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(512,384) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original Laya decision probabilities and native results displayed as charts')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

Three supplied English messages ask about a duplicate charge, application crash and missing package. The original decision model chooses among billing, technical and shipping, with native probabilities 0.9300, 0.8688 and 0.9238 for the selected categories. The driver preserves the complete original answers and token counts, checks finite probabilities summing to one and draws them as charts. It does not generate text or replace model predictions with rules. The original loader reports an unused 11-or-more-choice calibration entry; this example uses its unchanged three-choice calibration.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
