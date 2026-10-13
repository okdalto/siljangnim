<p align="center">
  <img src="studio/public/logo.svg" alt="실장님" width="112" height="112" />
</p>

<h1 align="center">실장님</h1>

<p align="center">
  에이전트가 운영하는 크리에이티브 코딩 스튜디오.<br/>
  말로 라이브 비주얼을 만들고, 대화하며 다듬고, 작업끼리 섞고,<br/>
  MIDI·OSC·소리로 연주하고, 영상으로 뽑습니다.
</p>

<p align="center">
  <a href="#시작하기">시작하기</a> ·
  <a href="https://siljangnim.vercel.app/">웹에서 써 보기</a> ·
  <a href="docs/creative.md">가이드</a> ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/okdalto/siljangnim@df9822e1e6/media/siljangnim-short.mp4"><img src="media/siljangnim-short-preview.gif" alt="실장님 소개 영상" width="270" /></a><br/>
  <a href="https://cdn.jsdelivr.net/gh/okdalto/siljangnim@df9822e1e6/media/siljangnim-short.mp4">▶ 소리와 함께 보기 (39초, 영어 내레이션, 한/영 자막)</a>
</p>

---

## 시작하기

> **로컬에서 에이전트를 붙여 쓰는 방법(A)을 강력히 추천합니다.** 웹에서도 돌아가고 예제를 구경하기엔 충분하지만,
> 실장님은 에이전트가 내 컴퓨터에서 오픈소스 도구(Python 패키지, ffmpeg, ML 모델, OSC 등)를 설치하고 실행하도록
> 만든 도구입니다. 웹에서는 이런 일을 할 수 없습니다. 로컬에서는 에이전트가 내 파일과 기억을 그대로 쓰고,
> Claude Code로 쓰면 API 키를 따로 넣지 않고 Claude 요금제 안에서 돌아갑니다.

셋 중 하나를 고르세요. 1분이면 됩니다.

### A. Claude Code나 Codex로 쓰기 — 추천

**Claude Code**에 이렇게 붙여 넣으세요:

```text
실장님 MCP 서버를 설치해 줘. 이 명령을 실행하면 돼:
claude mcp add siljangnim -- npx -y siljangnim-mcp@latest
끝나면 Claude Code를 다시 시작하라고 알려 줘.
```

**Codex**는 일반 터미널에서 아래 한 줄을 실행하세요(에이전트 안이 아닌 Mac 터미널 등):

```bash
npx -y siljangnim-mcp@latest setup codex
```

Node.js와 Codex CLI를 확인하고, 서버 등록·MCP 연결 검사·테스트 뷰어 열기까지 처리합니다.
설정 파일을 직접 수정할 필요가 없습니다. 검사가 끝나면 임시 연결은 종료됩니다. 테스트 탭을 닫고
Codex를 완전히 종료했다가 다시 실행하세요. Codex가 MCP 서버를 시작하면 새 뷰어가 자동으로 열립니다.
이미 설치했다면 같은 명령을 다시 실행해 등록을 갱신할 수 있습니다. 설치 검사 성공은 현재 Codex 대화의 연결 확인과는 다릅니다.

다시 시작하고, 만들고 싶은 것을 말하세요:

```text
siljangnim으로 어두운 바다를 떠다니는 빛나는 해파리를 만들어 줘. 해파리 개수는 슬라이더로 바꿀 수 있게.
```

브라우저에 뷰어가 열리고 거기에 결과가 나옵니다. 고치고 싶으면 에이전트에게 계속 말하면 됩니다.

필요한 것은 [Node.js 22 이상](https://nodejs.org)뿐입니다. Python이 필요한 도구를 처음 쓸 때 알아서
`~/.siljangnim/runtime/`에 받아 둡니다.

<details>
<summary>Cursor, Claude 데스크톱 앱 등 다른 MCP 클라이언트, Codex 직접 설정</summary>

**Codex**(`codex mcp add` 대신) — `~/.codex/config.toml`에 추가:

```toml
[mcp_servers.siljangnim]
command = "npx"
args = ["-y", "siljangnim-mcp@latest"]
```

**Cursor, Claude 데스크톱 앱, Windsurf 등** — 클라이언트의 MCP 설정
(`.cursor/mcp.json`, `claude_desktop_config.json` 등)에 추가:

```json
{
  "mcpServers": {
    "siljangnim": { "command": "npx", "args": ["-y", "siljangnim-mcp@latest"] }
  }
}
```

포트, 어떤 브라우저로 열지 같은 옵션은 [docs/mcp.md](docs/mcp.md)에 있습니다. 지우려면
`claude mcp remove siljangnim`.

</details>

### B. 브라우저에서 바로 — 설치 없음

**[siljangnim.vercel.app](https://siljangnim.vercel.app/)** 에 들어가서:

1. 오른쪽 위 **Examples**(예제)를 누르고 아무 예제나 여세요. 바로 돌아갑니다.
2. 직접 만들려면 **Settings**(설정, 톱니바퀴 아이콘)에 Anthropic이나 OpenAI API 키를 넣으세요.
   키는 그 브라우저 탭에만 있고, 모델 회사로만 전달됩니다.
3. 채팅에 만들고 싶은 것을 적으세요.

웹에서는 내 컴퓨터에서 도는 도구(Python 패키지, ffmpeg, ML 모델, OSC)를 쓸 수 없어서, 에이전트가 할 수 있는 일
대부분은 A나 C가 필요합니다. 구경은 웹에서, 만들기는 A로 하세요.

### C. 데스크톱 앱

설치 파일은 아직 배포 전입니다. 그때까지는 소스에서 실행합니다. 터미널에 붙여 넣으세요:

```bash
git clone https://github.com/okdalto/siljangnim.git && cd siljangnim && npm install && npm run dev
```

다음부터는 그 폴더에서 `npm run dev`(또는 `./run.sh`, `run.bat`)만 하면 됩니다. API 키는 **Settings**(설정)에
넣으세요. OS 키체인으로 암호화되고 앱 화면에는 전달되지 않습니다. 앱이 켜져 있으면 Claude Code(A)가
브라우저 대신 이 앱 창을 뷰어로 씁니다.

내 컴퓨터용 설치 파일을 만들려면 `npm run dist`(결과는 `desktop/release/`). 코드 서명이 없어서 macOS에서
처음 열 때 한 번 *시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기*를 눌러야 합니다.

## 할 수 있는 것

실장님은 받아서 돌려 보는 예제 모음이 아니라 작업실입니다. 방향은 내가 정하고, 코드는 에이전트가 쓰고,
대화를 이어 가는 동안 작업은 계속 바뀝니다.

- **말로 만들기** — "어두운 바다를 떠다니는 빛나는 해파리", "이 사진으로 가까울수록 촘촘한 해칭". 에이전트가 도구(셰이더,
  물리 엔진, 기하 라이브러리, Python 패키지, ML 모델)를 고르고, WebGL2나 WebGPU 씬을 쓰고, 스스로 오류를 고치고,
  결과를 직접 본 다음 답합니다.
- **Shadertoy 코드 가져오기** — 오픈소스 라이선스(MIT, CC0 등)가 적힌 셰이더를 붙여 넣으면 버퍼와 채널까지 그대로
  돌아갑니다. 에이전트가 출처를 남기고, 오픈소스가 아닌 셰이더는 옮기지 않습니다.
- **대화하며 다듬기** — "더 느리게, 노을 색으로", "입자를 두 배로", "그 값은 슬라이더로 빼 줘". 만지고 싶은 값은
  슬라이더, 노브, 2D 패드, 메뉴, 버튼, 색 컨트롤이 됩니다. 모든 변경은 버전으로 남아 언제든 돌아가 갈라질 수 있고,
  에이전트가 쓴 코드도 직접 읽을 수 있습니다.
- **섞기** — 예제 소개에서 **섞기(Mix in)**를 누르면 그 예제의 씬과 에셋이 지금 프로젝트로 들어오고, 에이전트가 둘을
  하나의 장면으로 섞습니다. 다른 사람이 보낸 작업을 붙여 넣고 매시업을 부탁해도 됩니다.
- **라이브로 연주하기** — 마우스, 키보드, 마이크와 오디오 파일, 카메라, MIDI 컨트롤러, OSC(TouchOSC, Ableton,
  TouchDesigner). "노브 1번으로 색을 바꾸게 해 줘"라고 말하면 에이전트가 연결합니다. **Perform**(공연)을 누르면 장면만 전체 화면으로
  띄워 프로젝터로 보낼 수 있습니다. **Timeline**(타임라인)으로 바꿔 컨트롤에 키프레임을 찍을 수도 있습니다.
- **화면 비율 고르기** — 프레임 메뉴에서 가로, 세로(9:16), 정사각형, 또는 1080×1920·4K 같은 정확한 해상도. 실행 중에
  크기가 바뀌어도 장면이 다시 맞춰집니다.
- **영상으로 뽑기** — MP4, WebM, PNG 연속 이미지. 원하는 크기(세로 1080×1920, 4K)로 프레임 단위 정확하게 렌더링하거나,
  연주한 그대로 실시간 녹화합니다. 위의 소개 영상도 예제들을 이렇게 녹화해서 만들었습니다.
- **넘겨주기** — 프로젝트는 `project.md`(무엇을 요청했고, 어떤 도구로 어떻게 만들었는지)로 내보냅니다. 받은 사람의
  에이전트가 그 문서로 다시 만들고, 또 리믹스합니다.

오픈소스 하나하나를 바탕으로 만든 **예제 80여 개**(Shan Shui Infinite, MarkovJunior, Growing NCA, Three.js, p5.js,
OpenCV, librosa 등, 출처와 라이선스 포함)에서 출발해 다른 곳으로 가져가 보세요.

[창작 흐름 자세히 보기](docs/creative.md)

## 속을 들여다보면

- 디자인 스튜디오의 *실장님*은 "이런 걸 하고 싶다"는 말을 들으면 누구를 부르고 어떤 도구를 쓸지 압니다. 이 앱이 그 역할을 합니다.
- **내 컴퓨터의 오픈소스 도구** — Python 패키지는 격리된 환경에서, 설치된 프로그램(ffmpeg, Blender 등)은 허락을 받고 실행합니다.
  성공한 방법은 레시피로 남아 다음엔 바로 실행되고, [registry/](registry/)로 나눕니다.
- **내 에이전트 붙이기** — Claude Code, Codex, Cursor 같은 MCP 클라이언트가 내장 에이전트와 같은 스튜디오를 조종합니다.
  내장 에이전트는 Anthropic(기본 Claude Opus 5.5)이나 OpenAI 호환 서버(OpenAI, vLLM, Ollama 등)로 돌아갑니다.
- **격리된 씬** — 씬 코드는 별도 출처에서 돌아서 프로젝트나 키에 접근하지 못합니다.

## 개발자용

```bash
npm install
npm run web      # 브라우저에서 스튜디오, http://localhost:5173
npm run dev      # 데스크톱 앱, 핫 리로드
```

| 명령 | 하는 일 |
|---|---|
| `npm run check` | 타입 검사와 린트 |
| `npm test` | 스튜디오, MCP 브리지, 허브 테스트 |
| `npm run smoke` | 데스크톱 앱을 띄워 가짜 API로 에이전트 세션을 돌리고 모든 예제를 열어 본 뒤, MCP 브리지로 뷰어를 조종해 봅니다 |
| `npm run mcp` | 이 저장소의 MCP 서버(`npm --prefix studio run build` 후 `claude mcp add siljangnim -- node "$PWD/mcp/bin/siljangnim-mcp.js"`) |
| `npm run dist` | 지금 플랫폼용 설치 파일을 `desktop/release/`에 만듭니다(`v*` 태그를 올리면 CI가 두 플랫폼을 빌드) |
| `npm run notices` | `THIRD_PARTY_NOTICES.md` 다시 만들기 |

```
studio/     앱: React + TypeScript UI, 내장 에이전트, 격리된 씬 런타임
desktop/    Electron 셸: 창, app:// 프로토콜, 키 저장, 허브 프로세스, 설치 파일
hub/        Python 사이드카(uv 관리): 런타임 작업과 레시피
mcp/        외부 에이전트용 MCP 서버(siljangnim-mcp로 배포)
examples/   앱에 나오는 예제 프로젝트
registry/   공유 레시피(PR로 기여)
docs/       사용자 가이드(한국어, 영어판은 docs/en/)
```

가이드: [창작 흐름](docs/creative.md), [에이전트 연결](docs/mcp.md), [내 컴퓨터에서 도구 실행](docs/local-tools.md), [공유](docs/sharing.md), [모델 연결](docs/models.md).

## 비용과 보안

- **비용** — 클라우드 모델은 토큰 단위로 과금됩니다. 복잡한 씬은 여러 번 오가서, 대화 한 번에 몇 달러가
  들 수 있습니다. Claude Code로 쓰면 Claude 요금제 안에서 돌고, 직접 띄운 모델은 토큰 비용이 없습니다.
- **보안** — 씬 코드는 별도 출처(origin)에서 돌아서 프로젝트나 키에 접근하지 못합니다. 내 컴퓨터에서 코드를
  실행하거나 패키지를 설치할 때는 먼저 묻습니다. 파일과 의존성은 격리하지만 OS 샌드박스는 아닙니다.
  로컬 서버는 모두 127.0.0.1에서만 열리니 네트워크에 노출하지 마세요.

## 고마운 분들

실장님의 오픈소스 도구 카탈로그는 현(@hyun2xyz)님의
[index.opensource](https://indexopensource.com/index)에서 시작했습니다. 감사합니다. 예제의 바탕이 된 오픈소스를 만든
모든 분께도 감사드립니다.

## 라이선스

[GPL-3.0](LICENSE). 쓰인 서드파티 코드, 도구, 자료와 라이선스, 출처 링크:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
