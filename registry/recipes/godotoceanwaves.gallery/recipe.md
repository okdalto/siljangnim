---
id: godotoceanwaves.gallery
version: 1
title: Ocean waves from native GPU FFT
capability: godotoceanwaves graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "GodotOceanWaves"
  repo: https://github.com/2retr0/godotoceanwaves
  license: "MIT"
io:
  inputs:
  - name: capture.gd
    media: file
  - name: capture.tscn
    media: file
  - name: project.godot
    media: file
  - name: source.json
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

# Ocean waves from native GPU FFT

GodotOceanWaves executes original spectral wave and FFT shaders on Metal, then renders two wave cascades at three simulation frames.

GodotOceanWaves 원본 스펙트럼·FFT 셰이더를 Metal GPU에서 실행해 두 파도 계층의 세 시점을 직접 렌더했어요.

## Setup

Requires Apple Silicon macOS with a Metal GPU, graphical desktop and Python 3.12+. The recipe verifies and caches Godot 4.5.1 and GodotOceanWaves revision a171446f8174348895aaafc426576c26261058b9. The first download is about 190 MB. The original compute and spatial shaders are imported once and cached. The only source compatibility change creates a read-only descriptor set for the modulation shader, as required by Godot 4.5 binding validation.

위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 엔진은 레시피 실행 때만 받아 캐시하며, 갤러리는 직접 계산해 둔 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,tarfile,tempfile,urllib.request,zipfile
from PIL import Image
if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('This recipe targets Apple Silicon macOS with a Metal GPU and graphical desktop.')
inputs=pathlib.Path('in').absolute();output=pathlib.Path('out').absolute();output.mkdir(exist_ok=True)
config=json.loads((inputs/'source.json').read_text());cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'godotoceanwaves';cache.mkdir(parents=True,exist_ok=True)
key=hashlib.sha256(b'godot-4.5-readonly-binding-v1'+b''.join(p.read_bytes() for p in sorted(inputs.iterdir()) if p.is_file())).hexdigest();root=cache/key
with (cache/'prepare.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 for name,suffix in [('godot','.zip'),('source','.tar.gz')]:
  item=config[name];archive=cache/(item['sha256']+suffix)
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:
   with urllib.request.urlopen(item['url'],timeout=180) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Godot dependency checksum mismatch: '+name)
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
 engine=cache/config['godot']['sha256'];binary=engine/'Godot.app/Contents/MacOS/Godot'
 if not (engine/'ready').is_file():
  engine.mkdir(exist_ok=True)
  with zipfile.ZipFile(cache/(config['godot']['sha256']+'.zip')) as z:z.extractall(engine)
  binary.chmod(0o755);(engine/'ready').write_text(config['godot']['sha256'])
 if not (root/'ready').is_file():
  root.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='siljangnim-ocean-source-') as tmp:
   with tarfile.open(cache/(config['source']['sha256']+'.tar.gz')) as tar:
    members=[m for m in tar.getmembers() if '/assets/water/' in m.name or '/assets/shaders/' in m.name or m.name.endswith('/assets/render_context.gd')]
    tar.extractall(tmp,members=members,filter='data')
   source=next(pathlib.Path(tmp).iterdir());shutil.copytree(source/'assets',root/'assets',dirs_exist_ok=True)
  # Godot 4.5 validates read/write binding access. Use a descriptor set made for the original read-only modulation shader.
  shader=root/'assets/water/wave_generator.gd';s=shader.read_text();s=s.replace("var spectrum_set := context.create_descriptor_set([descriptors[&'spectrum']], spectrum_compute_shader, 0)","var spectrum_set := context.create_descriptor_set([descriptors[&'spectrum']], spectrum_compute_shader, 0)\n\tvar spectrum_read_set := context.create_descriptor_set([descriptors[&'spectrum']], spectrum_modulate_shader, 0)").replace('[spectrum_set, fft_buffer_set], spectrum_modulate_shader','[spectrum_read_set, fft_buffer_set], spectrum_modulate_shader');shader.write_text(s)
  for name in ['capture.gd','capture.tscn','project.godot']:shutil.copy(inputs/name,root/name)
  result=subprocess.run([str(binary),'--headless','--path',str(root),'--editor','--import'],text=True,capture_output=True,timeout=180)
  if result.returncode or 'ERROR:' in result.stdout+result.stderr:raise RuntimeError('Godot import failed: '+result.stdout+result.stderr)
  (root/'ready').write_text(key)
 env={**os.environ,'OCEAN_OUTPUT':str(output)}
 result=subprocess.run([str(binary),'--path',str(root),'--rendering-driver','metal','--fixed-fps','60','--audio-driver','Dummy'],env=env,text=True,capture_output=True,timeout=180)
 log=result.stdout+result.stderr
 if result.returncode or 'ERROR:' in log or 'PASS original GodotOceanWaves' not in log:raise RuntimeError('Native ocean render failed: '+log)
 frames=json.loads((output/'result.json').read_text())['frames'];assert [f['frame'] for f in frames]==[30,90,180]
 images=[Image.open(output/f'render-{i}.png').convert('RGB') for i in range(3)]
 assert all(im.size==(512,384) and len(im.getcolors(512*384))>1000 for im in images)
 assert len({hashlib.sha256(im.tobytes()).hexdigest() for im in images})==3
 print('PASS original Metal FFT wave simulation, native frames and no engine errors')
```

## Verify

The original engine was executed twice using downloaded and cached dependencies. Outputs matched byte for byte. The driver contains native result checks where applicable.

원본 엔진을 두 번 실행하고 캐시 재사용을 확인했으며, 결과 파일이 동일함을 검증했습니다.

## Scope

A supplied scene sets two wave cascades, a 128 by 128 FFT grid, fixed 60 fps steps, camera and lighting. The original spectrum generation, FFT, displacement and water shading execute on the GPU. Frames 30, 90 and 180 are captured from the original viewport. Godot procedural sky supplies the environment; no upstream gallery image, panorama or audio sample is used. The wrapper rejects engine and shader errors and checks image dimensions, content, distinct frames and checkpoint metadata.

The gallery selects prepared results. Edit the supplied inputs and rerun to recompute.
