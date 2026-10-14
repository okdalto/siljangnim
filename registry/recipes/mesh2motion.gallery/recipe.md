---
id: mesh2motion.gallery
version: 1
title: Automatic skin weights bend a supplied mesh
capability: mesh2motion graphics
tier: C
kind: python
packages: ["Pillow==12.3.0"]
source:
  name: "Mesh2Motion"
  repo: https://github.com/mesh2motion/mesh2motion-app
  license: "MIT (code) / CC0 (default artwork)"
io:
  inputs:
  - name: build.cjs
    media: file
  - name: capture.html
    media: file
  - name: entry.ts
    media: file
  - name: package-lock.json
    media: file
  - name: package.json
    media: file
  - name: runner.cjs
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

# Automatic skin weights bend a supplied mesh

Mesh2Motion computes original skin weights for 763 supplied vertices; Three.js renders three poses, including 204 smoothly blended vertices.

Mesh2Motion 원본 알고리즘으로 직접 만든 정점 763개의 스킨 가중치를 계산하고 Three.js로 세 자세를 렌더했어요. 204개 정점은 경계에서 부드럽게 섞여요.

## Setup

Requires Python 3.12+, Node.js, npm and Electron on PATH or through ELECTRON; verified with Electron 44.4.4. Fourteen original TypeScript implementation files from Mesh2Motion revision 79f3f61a9852ef70234a5a4a7c13ed87f7a71833 are SHA-256 verified and cached. npm ci uses the supplied lockfile for Three.js 0.185.0 and esbuild 0.25.12, with install scripts disabled. The original solver is bundled without source changes. No pretrained model or upstream mesh is downloaded.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

직접 만든 원통 메시와 다섯 뼈대를 입력으로 사용합니다. 원본 가중치 배정·경계 평활화·정규화 과정을 실행하며 정점별 가중치 합이 1인지 확인합니다. 경계 정점 204개에 여러 뼈대의 영향이 섞입니다. 뼈대 위치는 입력으로 제공하므로 자동 관절 배치나 모션 캡처가 아닌 자동 스킨 가중치 예제입니다.

## Run

```python
from pathlib import Path
import fcntl,hashlib,json,os,shutil,subprocess,tempfile,urllib.request
from PIL import Image,ImageStat
inputs=Path('in').absolute();out=Path('out').absolute();out.mkdir(exist_ok=True)
key=hashlib.sha256((inputs/'sources.json').read_bytes()+(inputs/'package-lock.json').read_bytes()).hexdigest();cache=Path(os.environ.get('XDG_CACHE_HOME',Path.home()/'.cache'))/'siljangnim/mesh2motion';cache.mkdir(parents=True,exist_ok=True);root=cache/key;root.mkdir(exist_ok=True)
node=shutil.which('node');npm=shutil.which('npm');electron=os.environ.get('ELECTRON') or shutil.which('electron')
if not node or not npm or not electron:raise RuntimeError('Node.js, npm and Electron must be available on PATH, or set ELECTRON')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for s in json.loads((inputs/'sources.json').read_text()):
  p=root/s['path'];p.parent.mkdir(parents=True,exist_ok=True)
  if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=s['sha256']:
   with urllib.request.urlopen(s['url'],timeout=120) as r:data=r.read()
   if hashlib.sha256(data).hexdigest()!=s['sha256']:raise RuntimeError('Mesh2Motion source checksum mismatch')
   p.write_bytes(data)
 runtime=root/'runtime';runtime.mkdir(exist_ok=True)
 if not (runtime/'.ready').exists():
  for name in ['package.json','package-lock.json']:shutil.copy(inputs/name,runtime/name)
  subprocess.run([npm,'ci','--ignore-scripts','--no-audit','--no-fund'],cwd=runtime,check=True,timeout=180);(runtime/'.ready').touch()
 with tempfile.TemporaryDirectory() as temporary:
  work=Path(temporary);web=work/'web';web.mkdir();shutil.copy(inputs/'capture.html',web/'capture.html')
  subprocess.run([node,str(inputs/'build.cjs'),str(inputs/'entry.ts'),str(root),str(web)],check=True,timeout=60)
  subprocess.run([electron,str(inputs/'runner.cjs'),str(web),str(out)],env=dict(os.environ,MESH_PROFILE=str(work/'profile')),check=True,timeout=180)
 data=json.loads((out/'result.json').read_text());assert len(data['frames'])==3
 assert all(f['vertices']==763 and f['mixedVertices']==204 and f['maxWeightError']<1e-6 for f in data['frames'])
 images=[Image.open(out/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(512,512) and min(ImageStat.Stat(im).stddev)>10 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original Mesh2Motion skin weights and native Three.js deformation/rendering')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A supplied capped cylinder has 763 vertices and a five-bone chain. The original SkinningAlgorithm runs midpoint assignment, extremity correction, boundary smoothing and normalization. Exactly 204 vertices blend multiple weights; each vertex weight sum is one within 1e-6. Original Three.js SkinnedMesh deformation and WebGL rendering show rest and two opposite bends; native deformed coordinates are also saved. Colors visualize the calculated weight mixture. Skeleton placement and geometry are supplied inputs, so this example demonstrates automatic skin weighting, not automatic joint placement or motion capture.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
