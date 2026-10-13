---
id: flam3.gallery
version: 1
title: Fractal flames from native transforms
capability: flam3 graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "flam3"
  repo: https://github.com/scottdraves/flam3
  license: "GPL-3.0"
io:
  inputs:
  - name: main.py
    media: file
  - name: source.json
    media: file
  outputs:
  - name: genome-0.flam3
    media: file
  - name: genome-1.flam3
    media: file
  - name: genome-2.flam3
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
  expect_outputs: ["genome-0.flam3", "genome-1.flam3", "genome-2.flam3", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Fractal flames from native transforms

Original FLAM3 renders three fractal flames with a fixed seed, changing the balance between linear and swirl transformations.

FLAM3 원본 렌더러에서 시드를 고정하고 선형·소용돌이 변환 비율에 따른 세 프랙털을 렌더링했어요.

## Setup

Requires macOS, Python 3.12+, Pillow 11.3.0, Xcode command line tools and Homebrew libpng/jpeg-turbo development libraries (tested with 1.6.59 and 3.2.0). Map main.py and source.json into in/. The original source is checksum verified and the native build is cached. Other platforms may build upstream flam3-render and pass its path to main.py.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,re,shutil,subprocess,sys,tarfile,tempfile,urllib.request
if platform.system()!='Darwin':raise RuntimeError('This build recipe is verified for macOS. Other platforms can build upstream flam3-render and pass its path to main.py.')
compiler=shutil.which('cc');brew=shutil.which('brew')
if not compiler or not brew:raise RuntimeError('Install Xcode command line tools and Homebrew libpng and jpeg-turbo development libraries.')
png=pathlib.Path(subprocess.check_output([brew,'--prefix','libpng'],text=True).strip());jpeg=pathlib.Path(subprocess.check_output([brew,'--prefix','jpeg-turbo'],text=True).strip());sdk=subprocess.check_output(['xcrun','--show-sdk-path'],text=True).strip();config=json.loads(pathlib.Path('in/source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'flam3';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256((config['sha256']+platform.platform()+str(png.resolve())+str(jpeg.resolve())+sdk).encode()+subprocess.check_output([compiler,'--version'])).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz');binary=root/'flam3-render'
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not binary.is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('FLAM3 source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:
   for member in tar:
    # Upstream includes machine-specific absolute autotools helper links.
    # Direct compilation does not need those helpers.
    if member.issym() or member.islnk():continue
    tar.extract(member,root,filter='data')
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'flam3.c').is_file());header=(source/'config.h.in').read_text();header=re.sub(r'#undef (HAVE_\w+|STDC_HEADERS)',r'#define \1 1',header);header+='\n#define VERSION "3.1.1"\n#define PACKAGE_DATA_DIR "."\n';(source/'config.h').write_text(header)
  files=['flam3','filters','parser','variations','interpolation','palettes','jpeg','png','isaac','flam3-render','docstring']
  subprocess.run([compiler,'-O2','-std=gnu99','-Wno-deprecated-declarations','-DGIT_REV="'+config['commit']+'"','-I'+str(png/'include'),'-I'+str(jpeg/'include'),'-I'+sdk+'/usr/include/libxml2','-L'+str(png/'lib'),'-L'+str(jpeg/'lib'),*[str(source/(f+'.c')) for f in files],'-lxml2','-ljpeg','-lpng','-lz','-lpthread','-lm','-o',str(binary)],check=True)
 subprocess.run([sys.executable,'in/main.py',str(binary)],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Unmodified FLAM3 3.1.1 C sources render original affine transforms and an original inline palette. Linear/swirl mixtures use quality 25, one rendering thread and fixed random seeds. Native PPM pixels are converted to PNG to omit variable image comments. The build generates config.h for the tested macOS SDK and links libpng 1.6.59, jpeg-turbo 3.2.0 and system libxml2/zlib. Machine-specific autotools symlinks in the source archive are skipped; rendering algorithms are unchanged.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
