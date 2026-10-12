# 에이전트 연결하기 (Claude Code, Codex 등)

Claude Code나 Codex 같은 에이전트에 실장님을 붙이면, 에이전트와 대화하면서 결과를 실장님 뷰어에서 바로 볼 수 있습니다.
에이전트는 씬을 만들고 고치고, 화면을 캡처해 직접 확인합니다.

## 설치

[Node.js 22 이상](https://nodejs.org)이 필요합니다.

**Claude Code** — 터미널에서:

```bash
claude mcp add siljangnim -- npx -y siljangnim-mcp@latest
```

또는 Claude Code에 "실장님 MCP 서버를 설치해 줘: `claude mcp add siljangnim -- npx -y siljangnim-mcp@latest`"라고
붙여 넣으세요. 설치한 뒤에는 Claude Code를 다시 시작해야 합니다.

**Codex** — `~/.codex/config.toml`:

```toml
[mcp_servers.siljangnim]
command = "npx"
args = ["-y", "siljangnim-mcp@latest"]
tool_timeout_sec = 120
```

**Cursor, Claude 데스크톱 앱, Windsurf 등** — 클라이언트의 MCP 설정 파일에:

```json
{
  "mcpServers": {
    "siljangnim": { "command": "npx", "args": ["-y", "siljangnim-mcp@latest"] }
  }
}
```

지우려면 `claude mcp remove siljangnim`(Codex 등은 설정에서 해당 항목 삭제).

## 쓰는 법

- 에이전트에게 "siljangnim으로 …를 만들어 줘"라고 하세요. 처음 도구를 쓸 때 브라우저에 뷰어(`http://localhost:47823`)가 열립니다.
- 대화는 에이전트 쪽에서 하고, 뷰어의 **Activity** 탭에서 에이전트가 한 일을 볼 수 있습니다. 컨트롤, 히스토리, 에셋, 녹화는 평소처럼 씁니다.
- **실장님 데스크톱 앱이 켜져 있으면** 브라우저 대신 그 앱 창이 뷰어가 됩니다. 앱의 프로젝트와 레시피를 그대로 씁니다.
- Python 패키지나 프로그램을 실행해야 할 때는 뷰어에 허락을 묻는 카드가 뜹니다. 자세한 건 [내 컴퓨터에서 도구 실행하기](local-tools.md).
- 프로젝트는 브라우저 저장소에 저장됩니다. 같은 포트로 열어야 이전 프로젝트가 보입니다.

## 옵션

환경 변수로 바꿀 수 있습니다(MCP 설정의 `env`에 넣으세요).

| 변수 | 뜻 |
|---|---|
| `SILJANGNIM_PORT` | 뷰어 포트. 기본 47823. 이미 쓰는 중이면 다른 포트로 열리고, 그때는 이전 프로젝트가 보이지 않습니다. |
| `SILJANGNIM_OPEN=0` | 브라우저를 자동으로 열지 않습니다(주소는 로그에 남습니다). |
| `SILJANGNIM_OPEN_COMMAND` | 뷰어를 열 프로그램(주소를 인자로 받음). 특정 브라우저로 열 때. |
| `SILJANGNIM_VIEWER=browser` | 데스크톱 앱이 켜져 있어도 브라우저를 씁니다. |

## 문제 해결

- **뷰어가 안 열려요** — 에이전트에게 "siljangnim 뷰어 열어 줘"라고 하세요. 그래도 안 되면 로그에 찍힌 주소를 직접 여세요.
- **이전 프로젝트가 안 보여요** — 다른 포트로 열렸을 수 있습니다. 47823을 쓰는 다른 프로그램을 끄고 다시 시작하세요.
- **처음 Python 도구를 쓸 때 오래 걸려요** — 처음 한 번 uv와 Python을 `~/.siljangnim/runtime/`에 받습니다.
- **새 버전이 반영되지 않아요** — 설정에 `siljangnim-mcp@latest`로 적혀 있는지 확인하세요.

## 보안

뷰어 서버는 이 컴퓨터(127.0.0.1)에서만 열리고, 실행할 때마다 바뀌는 토큰이 있어야 접속됩니다. 씬 코드는 별도 출처에서
돌아서 프로젝트나 키에 접근하지 못합니다. 네트워크에 노출하지 마세요.
