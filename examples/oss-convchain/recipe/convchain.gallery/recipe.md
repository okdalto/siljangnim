---
id: convchain.gallery
version: 1
title: Pattern synthesis at three temperatures
capability: convchain graphics
tier: C
kind: python
packages: ["Pillow==11.3.0"]
source:
  name: "ConvChain"
  repo: https://github.com/mxgmn/convchain
  license: "MIT"
io:
  inputs:
  - name: Main.cs
    media: file
  - name: main.py
    media: file
  - name: source.json
    media: file
  - name: packages.lock.json
    media: file
  outputs:
  - name: grid-0.json
    media: file
  - name: grid-1.json
    media: file
  - name: grid-2.json
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
  expect_outputs: ["grid-0.json", "grid-1.json", "grid-2.json", "render-0.png", "render-1.png", "render-2.png", "result.json"]
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-14'
    version: 1
status: verified
origin: local
updated: '2026-10-14'
---

# Pattern synthesis at three temperatures

Original ConvChainFast synthesizes three seeded patterns from a small grid, changing the MCMC temperature while retaining the same sample.

ConvChainFast 원본 MCMC 알고리즘으로 작은 격자에서 온도가 다른 세 패턴을 직접 합성했어요.

## Setup

Requires Python 3.12+, Pillow 11.3.0 and .NET SDK 8.0.413 on PATH, or set DOTNET to its executable. Map all inputs into in/. Original source is SHA-256 verified and NuGet packages use the supplied locked content hashes. Native .NET output and PNG conversion run only when rerunning the recipe.

Python과 위에 명시한 실행 환경을 준비하고 입력 파일을 in/에 연결하세요. 원본 소스와 의존성은 레시피 실행 때만 검증해 캐시합니다. 갤러리에서는 준비된 결과를 필요할 때 받아 재사용합니다.

## Run

```python
import fcntl,hashlib,json,os,pathlib,platform,shutil,subprocess,sys,tempfile,urllib.request
sdk=os.environ.get('DOTNET') or shutil.which('dotnet')
if not sdk:raise RuntimeError('Install .NET SDK 8.0.413 or set DOTNET to its executable path.')
version=subprocess.check_output([sdk,'--version'],text=True).strip()
if version!='8.0.413':raise RuntimeError('This recipe requires .NET SDK 8.0.413, got '+version)
config=json.loads(pathlib.Path('in/source.json').read_text());driver=pathlib.Path('in/Main.cs').read_bytes();deps=pathlib.Path('in/packages.lock.json').read_bytes();cache=pathlib.Path(os.environ.get('XDG_CACHE_HOME',pathlib.Path.home()/'.cache'))/'siljangnim'/'convchain';cache.mkdir(parents=True,exist_ok=True);key=hashlib.sha256(config['sha256'].encode()+driver+deps+version.encode()+platform.platform().encode()).hexdigest();root=cache/key;source=cache/(config['sha256']+'.cs');env={**os.environ,'DOTNET_CLI_TELEMETRY_OPTOUT':'1','DOTNET_CLI_HOME':str(cache/'dotnet-home'),'NUGET_PACKAGES':str(cache/'nuget')}
with (cache/(key+'.lock')).open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 dll=root/'bin/Release/net8.0/Driver.dll'
 if not dll.is_file():
  if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest()!=config['sha256']:
   with urllib.request.urlopen(config['url'],timeout=120) as response:data=response.read()
   if hashlib.sha256(data).hexdigest()!=config['sha256']:raise RuntimeError('ConvChain source checksum mismatch')
   with tempfile.NamedTemporaryFile(dir=cache,delete=False) as f:f.write(data);pending=pathlib.Path(f.name)
   pending.replace(source)
  root.mkdir(exist_ok=True);shutil.copyfile(source,root/'ConvChainFast.cs');(root/'Main.cs').write_bytes(driver);(root/'packages.lock.json').write_bytes(deps)
  (root/'Driver.csproj').write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><EnableDefaultCompileItems>false</EnableDefaultCompileItems><StartupObject>Runner</StartupObject><RestorePackagesWithLockFile>true</RestorePackagesWithLockFile></PropertyGroup><ItemGroup><Compile Include="ConvChainFast.cs"/><Compile Include="Main.cs"/><PackageReference Include="System.Drawing.Common" Version="6.0.0"/></ItemGroup></Project>')
  (root/'global.json').write_text(json.dumps({'sdk':{'version':'8.0.413','rollForward':'disable'}}))
  subprocess.run([sdk,'restore','--locked-mode'],cwd=root,env=env,check=True)
  subprocess.run([sdk,'build','Driver.csproj','-c','Release','--no-restore'],cwd=root,env=env,check=True)
 subprocess.run([sdk,str(dll),str(pathlib.Path('out').absolute())],env=env,check=True)
 subprocess.run([sys.executable,'in/main.py'],check=True)
```

## Verify

Executed with the original engine using both a fresh cache and the cached environment. Prepared output files matched byte for byte. Native assertions are described below.

원본 엔진을 새 캐시와 기존 캐시에서 각각 실행해 결과 파일이 동일함을 확인했습니다.

## Scope

Unmodified ConvChainFast.cs runs its original private ConvChain method through reflection with seed 17, receptor size 3, 64 iterations and output size 48. An original 8 by 8 grid is the sample. System.Drawing.Common 6.0.0 is a locked compile dependency for unused upstream image helpers; those Windows-specific helpers are never invoked. Python only converts the actual returned boolean grid to PNG. Assertions require nonempty, mixed binary output; no claim of exact distribution convergence is made.

The viewer selects prepared results. Edit the supplied inputs and rerun the recipe to recompute.
