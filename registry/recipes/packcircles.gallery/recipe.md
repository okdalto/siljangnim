---
id: packcircles.gallery
version: 1
title: Native progressive circle packing
capability: packcircles graphics
tier: C
kind: python
packages: []
source:
  name: "packcircles"
  repo: https://github.com/mbedward/packcircles
  license: "MIT"
io:
  inputs:
  - name: main.R
    media: file
  - name: source.json
    media: file
  outputs:
  - name: circles-0.csv
    media: file
  - name: circles-1.csv
    media: file
  - name: circles-2.csv
    media: file
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["circles-0.csv", "circles-1.csv", "circles-2.csv", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Native progressive circle packing

packcircles 0.3.7 arranges 48 circles with ascending, descending and shuffled radii, checking every pair for overlap.

packcircles 0.3.7 원본 R 알고리즘으로 48개 원을 세 순서로 배치하고 모든 원 쌍의 겹침 여부를 검증했어요.

## Setup

This recipe targets Apple Silicon macOS with Python 3.12+. It verifies and caches the official R 4.5.3 runtime package and exact CRAN binaries: packcircles 0.3.7, Rcpp 1.1.2, checkmate 2.3.4 and backports 1.5.1. The runtime is extracted into the recipe cache without a system-wide installation or administrator privileges. The initial R runtime download is about 97 MB.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import csv,fcntl,hashlib,json,math,os,pathlib,platform,shutil,subprocess,tarfile,tempfile,urllib.request
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This pinned R runtime recipe targets Apple Silicon macOS.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());key=hashlib.sha256((inputs/'source.json').read_bytes()).hexdigest()
cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'packcircles';cache.mkdir(parents=True,exist_ok=True);root=cache/key
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True);(root/'library').mkdir(exist_ok=True)
  for item in config:
   is_r=item['name']=='R';archive=cache/(item['sha256']+('.pkg' if is_r else '.tgz'))
   if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
    with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
    if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('R dependency checksum mismatch: '+item['name'])
    with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
    pending.replace(archive)
   if is_r:
    with tempfile.TemporaryDirectory(prefix='siljangnim-r-extract-') as tmp:
     extracted=pathlib.Path(tmp)/'expanded'
     subprocess.run(['/usr/sbin/pkgutil','--expand-full',str(archive),str(extracted)],check=True)
     shutil.copytree(extracted/'R-fw.pkg/Payload/R.framework',root/'R.framework',dirs_exist_ok=True,symlinks=True)
   else:
    with tarfile.open(archive) as tar:tar.extractall(root/'library',filter='data')
  (root/'ready').write_text(key)
 r=root/'R.framework/Versions/4.5-arm64/Resources'
 env={**os.environ,'R_HOME':str(r),'DYLD_LIBRARY_PATH':str(r/'lib'),'R_LIBS_USER':str(root/'library')}
 subprocess.run([str(r/'bin/exec/R'),'--vanilla','--slave','-f',str(inputs/'main.R'),'--args',str(output)],env=env,check=True)
 frames=[]
 for i,label in enumerate(['Ascending radii','Descending radii','Shuffled radii']):
  rows=[{k:float(v) for k,v in row.items()} for row in csv.DictReader((output/f'circles-{i}.csv').open())]
  assert len(rows)==48 and all(math.isfinite(v) for row in rows for v in row.values())
  for a in range(48):
   for b in range(a):assert math.hypot(rows[a]['x']-rows[b]['x'],rows[a]['y']-rows[b]['y'])>=rows[a]['radius']+rows[b]['radius']-1e-7
  xmin=min(r['x']-r['radius'] for r in rows);xmax=max(r['x']+r['radius'] for r in rows);ymin=min(r['y']-r['radius'] for r in rows);ymax=max(r['y']+r['radius'] for r in rows);scale=max(xmax-xmin,ymax-ymin)/1.85
  frames.append(dict(label=label,points=[[(r['x']-(xmin+xmax)/2)/scale,(r['y']-(ymin+ymax)/2)/scale] for r in rows],radii=[r['radius']/scale for r in rows],nonoverlap=True))
 (output/'result.json').write_text(json.dumps(dict(frames=frames)))
 print('PASS original packcircles positions and radii; all circle pairs nonoverlapping')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The supplied R input defines 48 radii and calls the original circleProgressiveLayout three times with ascending, descending and seeded shuffled ordering. The original native algorithm places each circle tangent to earlier circles. All 1128 pairs per layout are checked for nonoverlap, with 1e-7 numerical tolerance. Native CSV coordinates and radii are saved, and the preview applies only centering and uniform scaling.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
