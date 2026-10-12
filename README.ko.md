<p align="center">
  <img src="studio/public/logo.svg" alt="실장님" width="112" height="112" />
</p>

<h1 align="center">실장님</h1>

<p align="center">
  에이전트가 운영하는 크리에이티브 스튜디오.<br/>
  만들고 싶은 것을 말하면, 에이전트가 맞는 오픈소스를 골라<br/>
  내 컴퓨터에서 엮고, 결과를 실시간으로 보여 줍니다.
</p>

<p align="center">
  <a href="https://github.com/okdalto/siljangnim/releases">다운로드</a> ·
  <a href="https://siljangnim.vercel.app/">웹에서 써 보기</a> ·
  <a href="docs/architecture.md">아키텍처</a> ·
  <a href="README.md">English</a>
</p>

---

> **실장님 v2를 만들고 있습니다.** 앱을 데스크톱 스튜디오로 처음부터 다시 만드는 중입니다
> ([계획](docs/architecture.md#11-단계별-계획), [스튜디오 설계](docs/studio.md)).
> **지금 되는 것**은 새 스튜디오 기준입니다. 기능이 더 많은 v1 웹 앱은 새 스튜디오가
> 따라잡을 때까지 [siljangnim.vercel.app](https://siljangnim.vercel.app/)에 그대로 있습니다.

## 어떤 앱인가요

디자인 스튜디오의 실장님은 "이런 걸 하고 싶다"는 말을 들으면 누구를 부르고 어떤 도구를
쓸지 압니다. 이 앱은 크리에이티브 코딩에서 그 역할을 합니다.

- **결과를 말하면** — "이 사진으로 깊이에 따라 밀도가 달라지는 해칭 드로잉, A3 플로터용으로".
- **방법은 에이전트가 정합니다** — 셰이더, 기하 라이브러리, ML 모델, CLI 도구 중 무엇이 맞는지
  판단하고, 내 컴퓨터에 받아서 연결합니다.
- **성공한 방법은 레시피가 됩니다** — 도구를 어떻게 설치하고 호출했는지 적은 짧은 md 파일입니다.
  다음에는 바로 실행되고, 다른 에이전트도 참고할 수 있습니다.
- **코드가 아니라 구조를 공유합니다** — 프로젝트는 파이프라인과 레시피를 담은 md 문서로 내보냅니다.
  받은 사람의 에이전트가 그 문서로 다시 만들어 냅니다.
- **내 에이전트를 붙일 수 있습니다** — Claude Code, Codex, Cursor 또는 직접 만든 에이전트가 MCP로
  앱을 조종합니다. 내장 에이전트와 함께 쓸 수 있습니다.

앱은 오픈소스 코드를 번들하지 않습니다. 프로젝트에 필요할 때 사용자의 컴퓨터에서 받고,
프로젝트마다 무엇을 썼는지 정확히 기록합니다.

## 지금 되는 것

새 스튜디오(데스크톱 앱, `npm run web`) 기준:

- **에이전트가 만드는 실시간 씬** — 원하는 비주얼을 말하면 에이전트가 WebGL2나 WebGPU 씬을 쓰고, 줄 번호가 붙은
  컴파일 에러를 받아 고치고, 결과 화면을 캡처해 확인한 뒤 답합니다.
- **격리된 씬 런타임** — 씬 코드는 별도 출처에서 자체 보안 정책 아래 실행되어 프로젝트나 API 키에 접근할 수 없습니다.
- **실시간 컨트롤** — 에이전트가 노출한 파라미터를 바꾸면 바로 반영됩니다. 슬라이더, 노브, 2D 패드, 선택 목록,
  한 프레임 버튼, 색, 그룹 패널, 씬이 내보내는 값을 보여 주는 모니터가 있습니다.
- **Live / Timeline** — 씬은 기본적으로 상호작용형이고, Timeline으로 바꾸면 정해진 길이 동안 컨트롤에 키프레임을
  줄 수 있습니다. Cmd+Z로 되돌립니다.
- **버전 히스토리** — 에이전트의 변경과 컨트롤 조정이 썸네일과 함께 버전으로 남고, 언제든 되돌릴 수 있습니다.
- **에셋** — 이미지, 영상, 오디오, 폰트, 3D 모델, 데이터 파일을 끌어다 놓으면 에이전트가 보고 씁니다.
- **이 컴퓨터에서 오픈소스 실행** — 승인하면 에이전트가 Python 패키지(trimesh, librosa 등)를 격리된 환경에서,
  설치된 CLI(ffmpeg 등)를 실행하고 결과를 에셋으로 가져옵니다. 성공한 방법은 레시피로 남아 다음 요청 때 바로 실행됩니다.
- **내 에이전트 연결** — Claude Code, Codex 같은 MCP 클라이언트가 스튜디오를 조작합니다([docs/mcp.md](docs/mcp.md)).
  대화는 그 에이전트와 하고, 결과는 뷰어에서 봅니다. 데스크톱 앱이 켜져 있으면 그 창에서 작업합니다.
- **녹화** — MP4, WebM, PNG 프레임. 프레임 단위로 정확하게 렌더하거나 실시간으로 담습니다.
- **입력** — 마이크·오디오 파일(스펙트럼, 대역), 카메라, MIDI, 컨트롤러의 OSC, MediaPipe 손 추적 같은 브라우저 ML.
- **공유** — 프로젝트를 `project.md`(씬, 에셋, 에셋을 만든 방법)나 번들로 내보내면 다른 에이전트가 문서만 보고
  다시 만듭니다([docs/project-md.md](docs/project-md.md)). 레시피는 레지스트리([registry/](registry/))로 나누고,
  카탈로그가 에이전트의 오픈소스 선택을 돕습니다.
- **v1 프로젝트** — *프로젝트 메뉴 → Import v1 project*로 예전 내보내기를 가져옵니다.
- **예제** — 오른쪽 위 *Examples* 탭에서 모든 예제를 검색하고 분류별로 봅니다. 누르면 프로젝트로 열리고, *Link*로 바로
  여는 주소(예: `siljangnim.vercel.app/#example=oss-three`)를 공유할 수 있습니다. 아직 예제가 없는 참고 목록의 도구는
  에이전트에게 만들어 달라고 맡길 수 있습니다([examples/](examples/)).
- **프로젝트** — 여러 프로젝트와 각각의 씬·채팅을 로컬에 저장합니다.
- **AI 프로바이더** — Anthropic(기본 Claude Opus 5.5) 또는 OpenAI 호환 서버(OpenAI, vLLM, Ollama 등).
- **데스크톱 앱** — macOS(Apple Silicon)와 Windows. API 키는 OS 키체인으로 암호화되고 앱 화면에는
  전달되지 않습니다. Python 런타임은 앱이 직접 관리합니다.

웹 버전 [siljangnim.vercel.app](https://siljangnim.vercel.app/)도 이 스튜디오입니다([docs/m3.md](docs/m3.md#4-웹-배포-전환과-v1-은퇴)).

## 다운로드

| 플랫폼 | 파일 |
|---|---|
| macOS (Apple Silicon) | `Siljangnim-<버전>-mac-arm64.dmg` |
| Windows (x64) | `Siljangnim-<버전>-win-x64.exe` |

[Releases](https://github.com/okdalto/siljangnim/releases)에서 받으세요. 아직 코드 서명이 되어
있지 않습니다.

- **macOS** — 처음 한 번 앱을 연 뒤 *시스템 설정 → 개인정보 보호 및 보안*에서 **그래도 열기**를 누르세요.
- **Windows** — SmartScreen 창에서 **추가 정보 → 실행**을 누르세요.

처음 실행할 때 앱 전용 Python 런타임(디스크 약 120 MB)을 앱 데이터 폴더에 받습니다.
시스템에는 아무것도 설치하지 않습니다.

## 소스에서 실행

**Node.js 22 이상**만 있으면 됩니다. Python은 앱이 알아서 받고 관리합니다.

```bash
git clone https://github.com/okdalto/siljangnim.git
cd siljangnim
npm install
npm run dev
```

`./run.sh`(macOS/Linux)나 `run.bat`(Windows)을 실행해도 같습니다. 실행한 뒤
*프로젝트 메뉴 → Examples…*를 열면 예제를 바로 볼 수 있습니다.

### Claude Code, Codex 같은 MCP 클라이언트로

```bash
npm install && npm --prefix studio run build
claude mcp add siljangnim -- node "$PWD/mcp/bin/siljangnim-mcp.js"
```

에이전트에게 원하는 비주얼을 말하면 첫 도구 호출 때 브라우저에 뷰어가 열립니다. Codex 등은
[docs/mcp.md](docs/mcp.md)를 보세요.

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 데스크톱 앱 (코드 수정 시 바로 반영) |
| `npm run web` | 브라우저에서 스튜디오 실행, http://localhost:5173 |
| `npm run check` | 타입 검사와 린트 |
| `npm test` | 스튜디오, MCP 브리지, 허브 테스트 |
| `npm run smoke` | 데스크톱 앱 빌드·실행, 목 API로 에이전트 실행, 모든 예제 열기. 이어서 MCP 브리지로 뷰어 조작 확인 |
| `npm run mcp` | 외부 에이전트가 실행하는 MCP 서버 |
| `npm run dist` | 현재 플랫폼용 설치 파일을 `desktop/release/`에 빌드 |

`v*` 태그를 푸시하면 GitHub Actions가 두 플랫폼의 설치 파일을 빌드합니다.

## 구조

```
내 에이전트 (MCP)      내장 에이전트
        \                 /
         ▼               ▼
 ┌────────── 실장님 데스크톱 (Electron) ──────────────┐
 │ Studio     채팅 · 뷰포트 · 컨트롤                   │
 │            씬은 격리된 출처에서 실행                 │
 │ Hub        로컬 Python 사이드카: MCP, 런타임,       │
 │            레시피, 출처 기록, 권한                   │
 └────────────────────────────────────────────────────┘
         │ 필요할 때 받아서, 도구별로 격리해 실행
         ▼
 오픈소스: GLSL · JS/WASM · Python · CLI 앱 · ML 모델
```

레시피와 프로젝트 형식, 단계별 계획은 [docs/architecture.md](docs/architecture.md)에 있습니다.

## 저장소 구성

```
studio/     앱: React + TypeScript UI, 내장 에이전트, 격리된 씬 런타임
desktop/    Electron 셸: 창, app:// 프로토콜, 키 보관, 허브 프로세스, 설치 파일
hub/        앱이 실행하는 Python 사이드카 (uv로 관리): 런타임 작업과 레시피
mcp/        외부 에이전트용 MCP 서버 (스튜디오를 띄우고 도구 호출을 중계)
examples/   앱 갤러리에 나오는 예제 프로젝트
registry/   공유 레시피(index.json + 레시피 파일), PR로 기여
docs/       아키텍처와 가이드
```

## 웹 버전

[siljangnim.vercel.app](https://siljangnim.vercel.app/)에서 스튜디오를 브라우저로 씁니다. API 키는 직접 넣고,
탭의 세션 저장소에만 두며 사이트의 전달 함수를 거쳐 모델 제공사로만 갑니다. 씬은 별도 도메인에서 돕니다.
로컬 런타임이 필요한 도구(Python 패키지, CLI 앱, GPU 모델, OSC)는 데스크톱 앱이나 MCP 클라이언트에서 씁니다.
v1 웹 앱은 은퇴했고, v1에서 내보낸 프로젝트는 *Import v1 project*로 엽니다.

## 비용과 보안

- **비용** — 클라우드 프로바이더는 토큰 단위로 과금합니다. 복잡한 씬은 도구 호출을 여러 번 하므로
  대화 하나에 몇 달러가 들 수 있습니다. 셀프 호스팅 모델은 토큰 비용이 없습니다.
- **보안** — 에이전트는 내 컴퓨터에서 코드를 작성하고 실행하며, 이후 단계에서는 오픈소스 도구도
  설치합니다. 그런 작업은 먼저 확인을 받게 됩니다. 허브는 127.0.0.1에서만 열리고 실행마다 새로
  발급되는 토큰이 있어야 접근할 수 있습니다. 앱을 네트워크에 노출하지 마세요.

## 라이선스

[GPL-3.0](LICENSE). 에이전트가 받아 오는 오픈소스는 각자의 라이선스를 따르며, 프로젝트마다
무엇을 썼는지 기록됩니다.
