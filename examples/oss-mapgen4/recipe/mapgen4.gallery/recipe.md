---
id: mapgen4.gallery
version: 1
title: Rainfall and river networks on an island
capability: mapgen4 graphics
tier: C
kind: python
packages: []
source:
  name: "mapgen4"
  repo: https://github.com/redblobgames/mapgen4
  license: "Apache-2.0"
io:
  inputs:
  - name: main.ts
    media: file
  - name: source.json
    media: file
  - name: package.json
    media: file
  - name: package-lock.json
    media: file
  outputs:
  - name: result.json
    media: file
verify:
  params: {}
  expect_outputs: ["result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Rainfall and river networks on an island

Original mapgen4 computes terrain, rainfall and drainage on a seeded island; three rain levels produce different river networks.

mapgen4 원본 알고리즘으로 섬의 지형·강수·배수를 계산하고 강수량에 따른 하천망 변화를 비교했어요.

## Setup

Requires Python 3.12+, Node.js and npm (tested with Node 25.6.1). Map main.ts, source.json, package.json and package-lock.json into in/. The original source archive is SHA-256 verified. npm ci installs the exact integrity-locked dependencies only on rerun and esbuild compiles the original TypeScript code for Node. Both source and built engine are cached.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,tarfile,tempfile,urllib.request
node=shutil.which('node');npm=shutil.which('npm')
if not node or not npm:raise RuntimeError('Install Node.js and npm. Tested with Node 25.6.1.')
config=json.loads(pathlib.Path('in/source.json').read_text());lockdata=pathlib.Path('in/package-lock.json').read_bytes();driver=pathlib.Path('in/main.ts').read_bytes();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'mapgen4';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+lockdata+driver+platform.platform().encode()+subprocess.check_output([node,'--version'])).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz')
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('mapgen4 source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'map.ts').is_file())
  shutil.copyfile('in/package.json',source/'package.json');(source/'package-lock.json').write_bytes(lockdata);(source/'gallery-main.ts').write_bytes(driver)
  subprocess.run([npm,'ci','--ignore-scripts','--no-audit','--no-fund','--cache',str(cache/'npm')],cwd=source,check=True)
  (source/'build.mjs').write_text("import {build} from 'esbuild';await build({entryPoints:['gallery-main.ts'],bundle:true,platform:'node',format:'esm',outfile:'gallery-main.mjs'});\n")
  subprocess.run([node,'build.mjs'],cwd=source,check=True)
  (root/'ready').write_text(key)
 source=next(p for p in root.iterdir() if p.is_dir() and (p/'map.ts').is_file())
 subprocess.run([node,str(source/'gallery-main.mjs'),str(pathlib.Path('out').absolute())],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Original choosePoints, point serialization, makeMesh, assignElevation, assignRainfall and assignRivers APIs execute on a 2794-solid-triangle island. The input driver supplies an original elevation constraint grid and adapts the original mesh loader to receive the generated packed point file. Raininess 0.35, 0.9 and 1.6 produces 113, 370 and 652 displayed river segments using the same flow threshold. Assertions require finite elevation, rainfall and flow arrays, and nonempty land and rivers. The viewer colors and projects the computed geometry; no terrain or drainage algorithms are reimplemented.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
