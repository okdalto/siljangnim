---
id: geometry3sharp.gallery
version: 1
title: Cutting and repairing a mesh cap
capability: geometry3sharp graphics
tier: C
kind: python
packages: []
source:
  name: "geometry3Sharp"
  repo: https://github.com/gradientspace/geometry3sharp
  license: "BSL-1.0"
io:
  inputs:
  - name: Main.cs
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

# Cutting and repairing a mesh cap

geometry3Sharp generates a sphere, removes a cap and fills the boundary loop; native topology checks validate each result.

geometry3Sharp 원본 엔진으로 구를 만들고 윗부분을 제거한 뒤 경계 루프를 채워 메시 위상을 검사했어요.

## Setup

Requires Python 3.12+ and .NET SDK 8.0.413 on PATH, or set DOTNET to its executable. Map Main.cs and source.json into in/. The recipe downloads SHA-256-verified original source and caches the assembly by source, driver, platform and SDK version. No NuGet dependency is needed.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,tarfile,tempfile,urllib.request
from xml.sax.saxutils import escape
sdk=os.environ.get('DOTNET') or shutil.which('dotnet')
if not sdk:raise RuntimeError('Install .NET SDK 8.0.413 or set DOTNET to its executable path.')
version=subprocess.check_output([sdk,'--version'],text=True).strip()
if version!='8.0.413':raise RuntimeError('This recipe requires .NET SDK 8.0.413, got '+version)
config=json.loads(pathlib.Path('in/source.json').read_text());driver=pathlib.Path('in/Main.cs').read_bytes();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'geometry3sharp';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+driver+version.encode()+platform.platform().encode()).hexdigest();root=cache/key;archive=cache/(config['sha256']+'.tar.gz');env={**os.environ,'DOTNET_CLI_TELEMETRY_OPTOUT':'1','DOTNET_CLI_HOME':str(cache/'dotnet-home')}
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 dll=root/'bin/Release/net8.0/Driver.dll'
 if not dll.is_file():
  if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('geometry3Sharp source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(archive)
  root.mkdir(exist_ok=True)
  with tarfile.open(archive) as tar:tar.extractall(root,filter='data')
  source=next(p for p in root.iterdir() if p.is_dir() and (p/'mesh/DMesh3.cs').is_file())
  (root/'Main.cs').write_bytes(driver)
  rel=escape(source.name)
  (root/'Driver.csproj').write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><EnableDefaultCompileItems>false</EnableDefaultCompileItems><AllowUnsafeBlocks>true</AllowUnsafeBlocks><StartupObject>Runner</StartupObject></PropertyGroup><ItemGroup><Compile Include="'+rel+'/**/*.cs" Exclude="'+rel+'/Properties/AssemblyInfo.cs;'+rel+'/obj/**;'+rel+'/bin/**"/><Compile Include="Main.cs"/></ItemGroup></Project>')
  (root/'global.json').write_text(json.dumps({'sdk':{'version':'8.0.413','rollForward':'disable'}}))
  subprocess.run([sdk,'build','Driver.csproj','-c','Release'],cwd=root,env=env,check=True)
 subprocess.run([sdk,str(dll),str(pathlib.Path('out').absolute())],env=env,check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Unmodified original C# source generates a normalized-cube sphere, removes triangles above y=0.45, finds its single MeshBoundaryLoops boundary and fills it with SimpleHoleFiller. Original CheckValidity and IsClosed checks verify closed, open and repaired states. The wrapper targets .NET 8 and excludes only the old assembly metadata file. This is simple hole filling, not arbitrary mesh reconstruction.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
