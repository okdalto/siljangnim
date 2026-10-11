# 외부 에이전트 연결 (MCP)

> 상태: 2단계 첫 구현 · 2026-10
> 설계 배경: [architecture.md](architecture.md#2단계-메모-외부-에이전트-연결-2026-10-11)

Claude Code, Codex 같은 에이전트에 MCP 서버로 붙이면 에이전트가 Siljangnim 뷰어에서 씬을 만들고 고치고 캡처로 확인한다. 대화는 그 에이전트의 채팅에서 하고, 뷰어는 결과와 작업 기록을 보여 준다.

## 붙이는 법

먼저 studio를 빌드한다(`npm install` 후 `npm --prefix studio run build`). 그다음:

```bash
# Claude Code
claude mcp add siljangnim -- node /절대경로/siljangnim/mcp/bin/siljangnim-mcp.js

# Codex (~/.codex/config.toml)
[mcp_servers.siljangnim]
command = "node"
args = ["/절대경로/siljangnim/mcp/bin/siljangnim-mcp.js"]
tool_timeout_sec = 120
```

npm에 배포하면 `npx -y siljangnim-mcp` 한 줄이 된다. 배포는 아직 하지 않았다(`mcp/studio/`에 빌드를 넣어 패키징한다).

첫 도구 호출에서 기본 브라우저로 뷰어(`http://localhost:47823`)가 열린다. 에이전트를 켤 때마다 탭이 열리지 않도록, 시작할 때가 아니라 첫 호출 때 연다.

환경 변수:

| 변수 | 뜻 |
|---|---|
| `SILJANGNIM_PORT` | 뷰어 포트(기본 47823). 프로젝트는 브라우저 저장소(origin별)에 있으므로 고정 포트를 쓴다. 사용 중이면 임의 포트로 열고, 그때는 기존 프로젝트가 보이지 않는다. |
| `SILJANGNIM_OPEN=0` | 브라우저를 열지 않고 URL만 stderr에 남긴다. |
| `SILJANGNIM_OPEN_COMMAND` | 뷰어를 이 프로그램으로 연다(URL을 인자로 받음). 특정 브라우저나 테스트에 쓴다. |
| `SILJANGNIM_STUDIO_DIR` | 서빙할 studio 빌드 위치. |

## 구조

```
에이전트 ──MCP(stdio)──▶ mcp/bin/siljangnim-mcp.js ──WebSocket──▶ 뷰어(브라우저의 studio) ──▶ 씬 iframe
                          └ studio 정적 파일을 localhost에서 서빙
```

- **도구는 한 번만 정의한다.** 브리지는 도구를 직접 구현하지 않는다. `mcp/src/spec.json`은 studio의 `agent/external.ts`에서 만든다(`npm --prefix studio run export-mcp`). studio 테스트가 둘이 같은지 검사한다. 호출은 뷰어로 넘어가 내장 에이전트와 같은 `runTool`로 실행된다.
- 외부 에이전트에게는 `ask_user`를 빼고 준다. 대신 브리지 전용 `viewer_open`(뷰어 열기·다시 열기)이 있다.
- MCP `instructions`는 내장 에이전트 프롬프트와 같은 레퍼런스(`SCENE_REFERENCE`)로 만든다. 내장 에이전트의 시스템 프롬프트는 분리 전과 바이트 단위로 같다(캐시 유지).
- 뷰어 모드에서는 채팅 탭 대신 Activity 탭(외부 에이전트가 한 일), History, Assets를 보여 준다. API 키가 필요 없다.
- 외부 에이전트의 변경은 컨트롤 변경처럼 1.5초 동안 조용하면 버전이 된다(예: "Claude Code: scene write; Claude Code: scene edit").

## 보안

- HTTP는 `127.0.0.1`에만 바인딩한다. `Host`가 `localhost`, `127.0.0.1`, `[::1]` 중 하나가 아니면 403을 돌려준다(DNS 리바인딩 방지).
- 뷰어는 실행마다 바뀌는 토큰으로 인증한다. 토큰은 브리지가 연 URL의 fragment(`#bridge=…`)로만 전달된다. fragment는 서버 요청이나 Referer에 실리지 않는다. 앱은 토큰을 app origin의 sessionStorage로 옮기고 주소창에서 지운다.
- WebSocket은 `Origin`이 app origin(`http://localhost:포트`)일 때만 받는다. 씬 iframe(`127.0.0.1`)과 다른 사이트는 접속할 수 없다.
- 새 탭이 붙으면 이전 탭은 "다른 탭에서 열림"이 되고, 그 탭에 보낸 호출은 에러로 끝난다.

## 검증

- `npm --prefix mcp test`: 브리지 단위 테스트. 중계, 토큰, Origin, Host, 경로 탈출, 탭 교체를 확인한다.
- `npm --prefix mcp run smoke`: 실제 stdio로 브리지를 띄우고 Electron 창을 뷰어로 열어 도구를 호출한다. 캡처 PNG의 평균색, 버전 기록, 뷰어 화면(Activity, 위젯, 키 마크)을 확인한다. 루트 `npm run smoke`에 포함돼 있다.
- **실제 에이전트로 확인 (2026-10-11):**
  - Claude Code 2.1.292(`claude -p`): 보라색 나선과 회전 속도 노브를 만들고 캡처 두 장으로 회전을 확인했다(5턴, $0.18).
  - Codex 0.155.1(`codex exec -m gpt-5.5`): 주황 동심원과 컨트롤 그룹을 만들었다.

## 알려진 점

- Codex의 비대화형 실행(`codex exec`)은 MCP 도구 호출에 승인이 필요하다. `mcp_servers.siljangnim.default_tools_approval_mode = "approve"`로 이 서버만 허용할 수 있다.
- `@modelcontextprotocol/sdk`는 1.30.1로 고정했다. 이 버전에 OAuth 클라이언트 관련 권고(high)가 있지만 브리지는 서버와 stdio만 써서 해당하지 않는다. 수정 버전(1.32.1)이 2주 기준을 넘기는 2026-10-19 이후 올린다.
- 데스크톱 앱이 켜져 있어도 지금은 브라우저 뷰어를 연다. 데스크톱 앱에 붙는 경로와 Python 허브 런타임(C/D 등급)은 3단계에서 다룬다.
