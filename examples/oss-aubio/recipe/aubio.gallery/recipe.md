---
id: aubio.gallery
version: 1
title: Native pitch estimation
capability: aubio graphics
tier: C
kind: python
packages: []
source:
  name: "aubio"
  repo: https://github.com/aubio/aubio
  license: "GPL-3.0-or-later"
io:
  inputs:
  - name: main.c
    media: file
  - name: source.json
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

# Native pitch estimation

Original aubio C YIN detects the pitch of three synthetic harmonic tones, with frequency and confidence saved.

aubio 원본 C YIN으로 세 합성 배음 신호의 주파수와 신뢰도를 직접 계산했어요.

## Setup

Requires Python 3.11 or newer and a C compiler on PATH (tested with Apple clang 17). Map the listed inputs into in/. Downloaded sources or OCR weights are SHA-256 verified and cached under (XDG_CACHE_HOME or ~/.cache)/siljangnim. Computation runs on every invocation. Viewing downloads only the prepared results.

Python과 위 실행 환경을 준비하고 입력 파일을 연결하세요. 필요한 소스·모델만 검증 후 캐시하며 계산은 매번 실행해요. 보기에는 준비된 결과만 받아요.

## Run

```python
import pathlib,json,hashlib,os,urllib.request,tempfile,tarfile,subprocess,shutil
config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'aubio';cache.mkdir(parents=True,exist_ok=True);archive=cache/(config['sha256']+'.tar.gz')
if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
 raw=urllib.request.urlopen(config['url'],timeout=120).read();assert hashlib.sha256(raw).hexdigest()==config['sha256']
 with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(raw);pending=pathlib.Path(f.name)
 pending.replace(archive)
with tempfile.TemporaryDirectory(prefix='siljangnim-aubio-') as tmp:
 root=pathlib.Path(tmp)
 with tarfile.open(archive) as t:t.extractall(root,filter='data')
 src=root/'aubio-0.4.9'/'src';compiler=shutil.which('cc')
 if not compiler:raise RuntimeError('Install a C compiler on PATH (tested with Apple clang 17).')
 flags=['-D'+x+'=1' for x in ['HAVE_STDLIB_H','HAVE_STDIO_H','HAVE_MATH_H','HAVE_STRING_H','HAVE_ERRNO_H','HAVE_C99_VARARGS_MACROS','HAVE_LIMITS_H','HAVE_STDARG_H','HAVE_MEMCPY_HACKS']]
 binary=root/'run';subprocess.run([compiler,'-O2','-UNDEBUG',*flags,'-I'+str(src),'in/main.c',*[str(p) for p in sorted(src.rglob('*.c'))],'-lm','-o',str(binary)],check=True)
 pathlib.Path('out').mkdir(exist_ok=True);subprocess.run([str(binary),'out'],check=True)
data=json.loads(pathlib.Path('out/result.json').read_text());assert len(data['frames'])==3;print([(f['targetHz'],f['detectedHz'],f['confidence']) for f in data['frames']])
```

## Verify

Executed twice using fresh and cached resources; outputs matched byte for byte. Driver assertions check finite geometry, classification loss and accuracy, LIC contrast or pitch error and confidence, as applicable.

## Scope

This compiles the unmodified aubio C library and calls YIN directly. Original harmonic inputs are 220, 440 and 660 Hz. Frequency errors must be below 1% and confidence above 0.95. The viewer selects prepared outputs; rerun the recipe to change computation.

