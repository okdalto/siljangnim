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
  <a href="#시작하기">시작하기</a> ·
  <a href="https://siljangnim.vercel.app/">웹에서 써 보기</a> ·
  <a href="docs/architecture.md">아키텍처</a> ·
  <a href="README.md">English</a>
</p>

---

## 시작하기

> **로컬에서 에이전트를 붙여 쓰는 방법(A)을 강력히 추천합니다.** 웹에서도 돌아가고 예제를 구경하기엔 충분하지만,
> 실장님은 에이전트가 내 컴퓨터에서 오픈소스 도구(Python 패키지, ffmpeg, ML 모델, OSC 등)를 설치하고 실행하도록
> 만든 도구입니다. 웹에서는 이런 일을 할 수 없습니다. 로컬에서는 에이전트가 내 파일과 기억을 그대로 쓰고,
> Claude Code로 쓰면 API 키를 따로 넣지 않고 Claude 요금제 안에서 돌아갑니다.

셋 중 하나를 고르세요. 1분이면 됩니다.

### A. Claude Code로 쓰기 — 추천

Claude Code에 이렇게 붙여 넣으세요:

```text
실장님 MCP 서버를 설치해 줘. 이 명령을 실행하면 돼:
claude mcp add siljangnim -- npx -y siljangnim-mcp@latest
끝나면 Claude Code를 다시 시작하라고 알려 줘.
```

Claude Code를 다시 시작하고, 만들고 싶은 것을 말하세요:

```text
siljangnim으로 어두운 바다를 떠다니는 빛나는 해파리를 만들어 줘. 해파리 개수는 슬라이더로 바꿀 수 있게.
```

브라우저에 뷰어가 열리고 거기에 결과가 나옵니다. 고치고 싶으면 Claude Code에서 계속 말하면 됩니다.

필요한 것은 [Node.js 22 이상](https://nodejs.org)뿐입니다. Python이 필요한 도구를 처음 쓸 때 알아서
`~/.siljangnim/runtime/`에 받아 둡니다.

<details>
<summary>Codex, Cursor, Claude 데스크톱 앱 등 다른 MCP 클라이언트</summary>

**Codex** — `~/.codex/config.toml`에 추가:

```toml
[mcp_servers.siljangnim]
command = "npx"
args = ["-y", "siljangnim-mcp@latest"]
tool_timeout_sec = 120
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

1. 오른쪽 위 **Examples**를 누르고 아무 예제나 여세요. 바로 돌아갑니다.
2. 직접 만들려면 **Settings**(톱니바퀴)에 Anthropic이나 OpenAI API 키를 넣으세요.
   키는 그 브라우저 탭에만 있고, 모델 회사로만 전달됩니다.
3. 채팅에 만들고 싶은 것을 적으세요.

웹에서는 내 컴퓨터에서 도는 도구(Python 패키지, ffmpeg, ML 모델, OSC)를 쓸 수 없어서, 에이전트가 할 수 있는 일
대부분은 A나 C가 필요합니다. 구경은 웹에서, 만들기는 A로 하세요.

### C. 데스크톱 앱

설치 파일은 아직 배포 전입니다. 그때까지는 소스에서 실행합니다. 터미널에 붙여 넣으세요:

```bash
git clone https://github.com/okdalto/siljangnim.git && cd siljangnim && npm install && npm run dev
```

다음부터는 그 폴더에서 `npm run dev`(또는 `./run.sh`, `run.bat`)만 하면 됩니다. API 키는 **Settings**에
넣으세요. OS 키체인으로 암호화되고 앱 화면에는 전달되지 않습니다. 앱이 켜져 있으면 Claude Code(A)가
브라우저 대신 이 앱 창을 뷰어로 씁니다.

내 컴퓨터용 설치 파일을 만들려면 `npm run dist`(결과는 `desktop/release/`). 코드 서명이 없어서 macOS에서
처음 열 때 한 번 *시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기*를 눌러야 합니다.

## 어떤 앱인가요

디자인 스튜디오의 실장님은 "이런 걸 하고 싶다"는 말을 들으면 누구를 부르고 어떤 도구를 쓸지 압니다.
이 앱은 크리에이티브 코딩에서 그 역할을 합니다.

- **결과를 말하면** — "이 사진으로 깊이에 따라 밀도가 달라지는 해칭 드로잉, A3 플로터용으로".
- **방법은 에이전트가 정합니다** — 셰이더, 기하 라이브러리, ML 모델, CLI 도구 중 무엇이 맞는지
  판단하고, 내 컴퓨터에 받아서 연결합니다.
- **성공한 방법은 레시피가 됩니다** — 도구를 어떻게 설치하고 호출했는지 적은 짧은 md 파일입니다.
  다음에는 바로 실행되고, 다른 에이전트도 참고할 수 있습니다.
- **코드가 아니라 구조를 공유합니다** — 프로젝트는 파이프라인과 레시피를 담은 md 문서로 내보냅니다.
  받은 사람의 에이전트가 그 문서로 다시 만들어 냅니다.
- **내 에이전트를 붙일 수 있습니다** — Claude Code, Codex, Cursor 또는 직접 만든 에이전트가 MCP로
  스튜디오를 조종합니다. 내장 에이전트와 함께 쓸 수 있습니다.

오픈소스 코드는 프로젝트에 필요할 때 내 컴퓨터로 받아 오고, 프로젝트마다 무엇을 썼는지 정확히 기록합니다.

## 할 수 있는 것

- **에이전트가 쓰는 라이브 씬** — WebGL2나 WebGPU. 컴파일 오류를 줄 번호와 함께 읽고 고치며,
  답하기 전에 결과 스크린샷을 직접 봅니다.
- **컨트롤** — 슬라이더, 노브, 2D 패드, 메뉴, 버튼, 색. 바꾸면 바로 반영됩니다. 3D 씬은 모두 같은
  카메라를 씁니다(드래그 회전, 오른쪽 드래그 이동, 스크롤 줌, 더블클릭 초기화).
- **Live와 Timeline** — 기본은 상호작용, 필요하면 정해진 길이에 키프레임을 찍습니다.
- **버전 기록** — 모든 변경이 썸네일과 함께 버전으로 남고, 언제든 되돌릴 수 있습니다.
- **에셋** — 이미지, 영상, 소리, 폰트, 3D 모델, 데이터를 끌어다 놓으세요. 에셋 탭에서 씬의 코드와
  셰이더도 볼 수 있고, *Show in Finder*로 프로젝트를 파일로 꺼낼 수 있습니다.
- **내 컴퓨터의 오픈소스 도구** — Python 패키지(trimesh, librosa 등)는 격리된 환경에서, 설치된
  CLI(ffmpeg 등)는 그대로, 매번 허락을 받고 실행합니다.
- **입력** — 마이크와 오디오 파일, 카메라, MIDI, OSC, 손 추적 같은 브라우저 ML.
- **녹화** — MP4, WebM, PNG 프레임.
- **공유** — 프로젝트를 `project.md`나 번들로 내보냅니다([docs/project-md.md](docs/project-md.md)).
  레시피는 [registry/](registry/)로 나눕니다.
- **예제** — 70개 넘는 프로젝트. 대부분 오픈소스 하나를 바탕으로 만들었고, 출처와 링크가 붙어
  있습니다(예: `siljangnim.vercel.app/#example=oss-three`).
- **모델** — Anthropic(기본 Claude Opus 5.5) 또는 OpenAI 호환 서버(OpenAI, vLLM, Ollama 등).

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
docs/       아키텍처와 가이드
```

전체 구조와 계획: [docs/architecture.md](docs/architecture.md).

## 비용과 보안

- **비용** — 클라우드 모델은 토큰 단위로 과금됩니다. 복잡한 씬은 여러 번 오가서, 대화 한 번에 몇 달러가
  들 수 있습니다. Claude Code로 쓰면 Claude 요금제 안에서 돌고, 직접 띄운 모델은 토큰 비용이 없습니다.
- **보안** — 씬 코드는 별도 origin에서 돌아서 프로젝트나 키에 접근하지 못합니다. 내 컴퓨터에서 코드를
  실행하거나 패키지를 설치할 때는 먼저 묻습니다. 파일과 의존성은 격리하지만 OS 샌드박스는 아닙니다.
  로컬 서버는 모두 127.0.0.1에서만 열리니 네트워크에 노출하지 마세요.

## 라이선스

[GPL-3.0](LICENSE). 쓰인 서드파티 코드, 도구, 자료와 라이선스, 출처 링크:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). 오픈소스 카탈로그는 현(@hyun2xyz)의
[index.opensource](https://indexopensource.com/index)에서 시작했습니다. 에이전트가 받아 오는 프로젝트는 각자의
라이선스를 따릅니다.
