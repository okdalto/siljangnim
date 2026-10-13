---
id: motion-canvas.gallery
version: 1
title: Animation frames from the original timeline
capability: motion-canvas graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "Motion Canvas"
  repo: https://github.com/motion-canvas/motion-canvas
  license: "MIT"
io:
  inputs:
  - name: capture.html
    media: file
  - name: capture.ts
    media: file
  - name: package-lock.json
    media: file
  - name: package.json
    media: file
  - name: project.ts
    media: file
  - name: runner.cjs
    media: file
  - name: scene.tsx
    media: file
  - name: vite.config.mjs
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

# Animation frames from the original timeline

Motion Canvas 3.17.2 animates seven circles through a wave into a ring and renders exact timeline positions with its original Renderer.

Motion Canvas 3.17.2 원본 타임라인에서 일곱 원이 물결과 고리로 바뀌는 장면을 0·2·4초에 렌더했어요.

## Setup

Requires Node.js 22+, npm, Python 3.12+ and Electron available on PATH or through the ELECTRON environment variable. Tested on macOS with Electron 44.4.4. Motion Canvas 3.17.2 and Vite 5.4.14 are installed on demand from the supplied npm lockfile into a reusable cache. npm verifies package integrity. No editor installation is added to the studio bundle.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tempfile
from PIL import Image
npm=shutil.which('npm');binary=os.environ.get('ELECTRON') or shutil.which('electron')
if not npm or not binary:raise RuntimeError('Install Node.js/npm and Electron or set ELECTRON to its executable. Tested with Node.js 22+ and Electron 44.4.4.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
key=hashlib.sha256((inputs/'package-lock.json').read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'motion-canvas';cache.mkdir(parents=True,exist_ok=True);root=cache/key
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True)
  for name in ['package.json','package-lock.json']:shutil.copy(inputs/name,root/name)
  subprocess.run([npm,'ci','--ignore-scripts','--no-audit','--no-fund'],cwd=root,check=True)
  # npm --ignore-scripts skips esbuild's binary probe; the platform optional package supplies the pinned binary.
  (root/'ready').write_text(key)
 with tempfile.TemporaryDirectory(prefix='siljangnim-motion-canvas-') as tmp:
  work=pathlib.Path(tmp);(work/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
  for name in ['package.json','vite.config.mjs','project.ts','scene.tsx','capture.ts','capture.html']:shutil.copy(inputs/name,work/name)
  subprocess.run([str(root/'node_modules/.bin/vite'),'build'],cwd=work,check=True)
  env={**os.environ,'MOTION_PROFILE':str(work/'electron-profile')};env.pop('ELECTRON_RUN_AS_NODE',None)
  subprocess.run([binary,str(inputs/'runner.cjs'),str(work/'dist'),str(output)],env=env,check=True)
  images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
  assert all(im.size==(512,384) and len(im.getcolors(512*384))>8 for im in images)
  assert all(sum(1 for r,g,b in im.getdata() if max(r,g,b)>100)>3000 for im in images)
  assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
  assert [f['time'] for f in json.loads((output/'result.json').read_text())['frames']]==[0,2,4]
  print('PASS three distinct native Motion Canvas frames at exact timeline positions')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied TypeScript scene uses original Circle and Line nodes, concurrent generator animation and easing. The official Vite plugin compiles the project, and the original Renderer.renderFrame evaluates times 0, 2 and 4 seconds at 30 fps. Its own Stage canvas supplies the PNGs. The driver checks exact dimensions, visible geometry, different frames and timeline metadata. There is no substitute canvas animation implementation.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
