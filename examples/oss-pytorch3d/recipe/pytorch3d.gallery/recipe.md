---
id: pytorch3d.gallery
version: 1
title: Differentiable native mesh rendering
capability: pytorch3d graphics
tier: C
kind: python
packages: ["torch==2.9.1", "numpy==2.2.6", "Pillow==11.3.0", "setuptools==80.9.0", "filelock==4.0.6", "typing-extensions==4.16.0", "sympy==1.14.0", "networkx==3.7", "jinja2==3.1.6", "fsspec==2026.9.0", "MarkupSafe==3.0.3", "mpmath==1.3.0", "iopath==0.1.10", "portalocker==4.4.0", "tqdm==4.70.1", "ninja==1.13.0"]
source:
  name: "PyTorch3D"
  repo: https://github.com/facebookresearch/pytorch3d
  license: "BSD-3-Clause"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
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

# Differentiable native mesh rendering

PyTorch3D directly rasterizes three meshes on CPU and backpropagates image intensity to their vertices using its native extension.

PyTorch3D 원본 C++ 확장으로 CPU에서 메시를 래스터화하고 이미지 밝기를 정점까지 역전파했어요.

## Setup

Requires Python 3.12 (tested with 3.12.7), the pinned packages above and a C++17 compiler. Original PyTorch3D source is downloaded with SHA-256 verification and compiled for CPU. The compiled extension is reused only for the same source, Python ABI, platform and PyTorch version. Map the listed inputs into in/. Opening the gallery downloads only prepared outputs. Source/runtime caches live under (XDG_CACHE_HOME or ~/.cache)/siljangnim.

Python과 위의 고정 패키지 및 원본 실행 프로그램을 준비하고 입력 파일을 연결하세요. 원본 소스와 고정 실행 환경은 필요할 때 검증해 캐시합니다. 갤러리를 볼 때는 준비된 결과만 받아요.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,subprocess,sys,tarfile,tempfile,urllib.request
import torch
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'pytorch3d';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256((config['sha256']+platform.platform()+sys.version+torch.__version__).encode()).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
  with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('PyTorch3D source checksum mismatch')
  with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
  pending.replace(archive)
 root.mkdir(exist_ok=True);source=root/('pytorch3d-'+config['commit'])
 if not (root/'ready').is_file():
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  subprocess.run([sys.executable,'setup.py','build_ext','--inplace'],cwd=source,check=True,env={**os.environ,'MAX_JOBS':'2','PYTORCH3D_FORCE_NO_CUDA':'1','FORCE_CUDA':'0'})
  if not list((source/'pytorch3d').glob('_C*.so')):raise RuntimeError('Native extension missing after build')
  (root/'ready').write_text(key)
 subprocess.run([sys.executable,'in/main.py'],check=True,env={**os.environ,'PYTHONPATH':str(source)})
result=json.loads(pathlib.Path('out/result.json').read_text());assert len(result['frames'])==3
assert all(f['nativeVertexGradientNorm']>1e-6 for f in result['frames'])
```

## Verify

Executed twice with the original engine. Prepared images and geometry matched; see Scope for FITS metadata and parallel gradient comparison details.

원본 엔진으로 두 번 실행해 결과를 대조했습니다. FITS 메타데이터와 병렬 미분 계산의 비교 조건은 Scope에 명시했습니다.

## Scope

Original native CPU rasterization renders a 162-vertex, 320-face colored mesh at three scales. Backpropagation computes vertex derivatives of mean image intensity. All pixels and gradients must be finite and gradient norm must be nonzero. The pinned original C++ source is compiled without algorithm changes and cached by source checksum, Python ABI, platform and PyTorch version. This is a small CPU example, not a neural reconstruction model.

The viewer selects prepared results. Change input code and rerun the recipe to recompute.
