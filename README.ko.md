<p align="center">
  <img src="frontend/public/logo.svg" alt="실장님" width="112" height="112" />
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

> **실장님 v2를 만들고 있습니다.** 데스크톱 앱, 로컬 런타임, MCP 연결을
> 단계별로 만드는 중입니다([계획](docs/architecture.md#11-단계별-계획)).
> **지금 되는 것**에 있는 기능은 바로 쓸 수 있고, 나머지는 앞으로의 방향입니다.

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

- **실시간 셰이더 씬** — WebGL2/WebGPU, 멀티패스 버퍼, 3D, 후처리. 에이전트가 작성하고 디버깅합니다.
- **자동 생성 컨트롤** — 슬라이더, 컬러 피커, 2D 패드, 카메라 오빗. 유니폼에 연결되고 undo/redo를 지원합니다.
- **입력** — 오디오 분석, 마이크, MIDI, OSC, 웹캠 손·포즈·얼굴 추적(MediaPipe).
- **에셋** — 이미지, 비디오, 폰트, SVG, 오디오, 3D 모델(OBJ, FBX, glTF 스켈레탈 애니메이션 포함).
- **타임라인** — 모든 유니폼에 이징 키프레임. MP4, WebM, PNG 시퀀스로 녹화.
- **프로젝트** — 브랜치와 비교가 되는 버전 트리, 멀티탭 채팅, GitHub 저장/불러오기.
- **데스크톱 앱** — macOS(Apple Silicon)와 Windows. 앱이 직접 관리하는 Python 런타임 포함.
- **AI 프로바이더** — Anthropic, OpenAI, Gemini, GLM, 또는 OpenAI 호환 서버(vLLM, Ollama 등).

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

`./run.sh`(macOS/Linux)나 `run.bat`(Windows)을 실행해도 같습니다.

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 데스크톱 앱 (코드 수정 시 바로 반영) |
| `npm run web` | 브라우저 전용 버전, http://localhost:5173 |
| `npm test` | 프론트엔드와 허브 테스트 |
| `npm run smoke` | 빌드 → 실행 → 스크린샷 → 동작 확인 |
| `npm run dist` | 현재 플랫폼용 설치 파일을 `desktop/release/`에 빌드 |

`v*` 태그를 푸시하면 GitHub Actions가 두 플랫폼의 설치 파일을 빌드합니다.

## 구조

```
내 에이전트 (MCP)      내장 에이전트
        \                 /
         ▼               ▼
 ┌────────── 실장님 데스크톱 (Electron) ──────────────┐
 │ Renderer   노드 캔버스 · 뷰포트 · 패널              │
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
desktop/    Electron 셸: 창, app:// 프로토콜, 허브 프로세스, 설치 파일
hub/        앱이 실행하는 Python 사이드카 (uv로 관리)
frontend/   렌더러: React, 노드 캔버스, GL 엔진, 내장 에이전트 (웹 빌드와 공용)
backend/    v1의 FastAPI 서버. 2단계에서 hub/로 대체
docs/       아키텍처와 가이드
```

## 웹 버전

[siljangnim.vercel.app](https://siljangnim.vercel.app/)은 렌더러와 내장 에이전트를 브라우저에서
실행합니다. 셰이더, 패널, 녹화, 브라우저용 ML까지 됩니다. 로컬 런타임이 필요한 도구(Python
패키지, CLI 앱, GPU 모델)는 데스크톱 앱에서 쓸 수 있습니다.

## 비용과 보안

- **비용** — 클라우드 프로바이더는 토큰 단위로 과금합니다. 복잡한 씬은 도구 호출을 여러 번 하므로
  대화 하나에 몇 달러가 들 수 있습니다. 셀프 호스팅 모델은 토큰 비용이 없습니다.
- **보안** — 에이전트는 내 컴퓨터에서 코드를 작성하고 실행하며, 이후 단계에서는 오픈소스 도구도
  설치합니다. 그런 작업은 먼저 확인을 받게 됩니다. 허브는 127.0.0.1에서만 열리고 실행마다 새로
  발급되는 토큰이 있어야 접근할 수 있습니다. 앱을 네트워크에 노출하지 마세요.

## 라이선스

[GPL-3.0](LICENSE). 에이전트가 받아 오는 오픈소스는 각자의 라이선스를 따르며, 프로젝트마다
무엇을 썼는지 기록됩니다.
