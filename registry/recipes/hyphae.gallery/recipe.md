---
id: hyphae.gallery
version: 1
title: Root networks from original growth rules
capability: hyphae graphics
tier: C
kind: python
packages: ["numpy==1.26.4", "cairocffi==1.7.1", "cffi==2.0.0", "pycparser==3.0"]
source:
  name: "Hyphae"
  repo: https://github.com/inconvergent/hyphae
  license: "MIT"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: branches.json
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
  expect_outputs: ["branches.json", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Root networks from original growth rules

Original Hyphae growth produces 500, 1,500 and 3,000 branches, rendered with its own Cairo drawing code.

Hyphae 원본 성장 코드로 500·1,500·3,000개 가지를 계산하고 원본 Cairo 그리기 코드로 렌더했어요.

## Setup

Requires Python 3.12 and a system Cairo library (on macOS, install cairo with Homebrew). The recipe downloads the pinned original archive, checks SHA-256 and caches it. Python 3.12 lib2to3 converts Python 2 syntax; numpy.int is restored as a compatibility alias. cairocffi exposes the Cairo API to the original renderer. No growth logic is changed.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,tarfile,tempfile,urllib.request
import sys
if sys.version_info[:2]!=(3,12):raise RuntimeError('This compatibility recipe requires Python 3.12, which includes lib2to3.')
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'hyphae';cache.mkdir(parents=True,exist_ok=True);root=cache/config['sha256'];archive=cache/(config['sha256']+'.tar.gz')
with (cache/(config['sha256']+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not (root/'ready').is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('Hyphae source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  (root/'ready').write_text(config['sha256'])
 source=next(p for p in root.iterdir() if p.is_dir() and (p/'hyphae.py').is_file())
 env=dict(os.environ)
 if sys.platform=='darwin' and pathlib.Path('/opt/homebrew/lib/libcairo.2.dylib').is_file():env.setdefault('DYLD_FALLBACK_LIBRARY_PATH','/opt/homebrew/lib')
 subprocess.run([sys.executable,'in/main.py',str(source)],env=env,check=True,timeout=120)
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

The original main loop and Render.circles execute with five seeds, a fixed NumPy seed and a bounded 1000-pixel configuration. A wrapper around the original drawing method records branch counts, saves the native Cairo surface and raises the original loop’s supported KeyboardInterrupt after 3000 branches. All exported coordinates are finite and remain within the original circular boundary. The first download is cached; repeated original-engine outputs match byte for byte.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
