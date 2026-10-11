# 런타임: 오픈소스를 이 컴퓨터에서 실행하기 (3단계)

> 상태: 첫 구현 · 2026-10
> 배경: [architecture.md](architecture.md#실행-등급)의 C/D 등급

씬 코드는 브라우저에서 돈다. 브라우저가 잘 못하는 일은 에이전트가 허브(`hub/`, Python 사이드카)를 통해 이 컴퓨터에서 실행한다. 메시 처리(trimesh), 이미지·오디오 분석, 플로터 경로(vpype), 영상 변환(ffmpeg) 같은 일이다.

## 도구

| 도구 | 하는 일 |
|---|---|
| `runtime_status` | 플랫폼과 GPU, 이미 만든 Python 환경, 설치된 CLI(ffmpeg, blender, openscad, magick, inkscape, vpype, potrace) |
| `python_run` | pip 패키지와 함께 Python 코드를 실행한다(C 등급) |
| `command_run` | 설치된 CLI를 셸 없이 실행한다(D 등급, `argv` 배열) |
| `job_status` | 오래 걸리는 작업을 기다린다 |

- 작업마다 폴더가 따로 있다. 입력 에셋은 `in/`에 복사하고, 프로그램이 `out/`에 쓴 파일은 **프로젝트 에셋으로 자동 저장**한다. 씬은 그 파일을 이름으로 쓴다(`ctx.assets[name]`). 이름이 겹치면 `-2`처럼 바꾼다.
- 결과에는 stdout+stderr 끝부분(최대 4,000자)과 종료 코드가 들어간다. 실패하면 traceback이 그대로 간다. 실제 검증 중 trimesh의 `fix_normals`가 scipy 없이 실패했을 때도 에이전트가 이 메시지를 보고 우회했다.
- `wait_s`(기본 90초, 최대 110초) 안에 끝나지 않으면 "아직 실행 중"으로 돌아온다. 그다음 `job_status`로 기다린다. MCP 클라이언트의 도구 타임아웃(Codex 기본 60초 등)에 걸리지 않게 하려는 것이다.

## 격리와 권한

- **환경:** 패키지 묶음(정렬한 spec의 해시)마다 uv로 venv를 하나 만들고 재사용한다. Python은 uv가 받은 managed Python만 쓴다(`UV_PYTHON_PREFERENCE=only-managed`). 사용자의 Python은 건드리지 않는다.
  - 위치: 데스크톱은 `userData/runtime/tools`, MCP 모드는 `~/.siljangnim/runtime/tools`(`SILJANGNIM_RUNTIME_ROOT`로 바꿀 수 있음)
- **패키지 spec 검증:** 이름, extras, 버전 조건만 받는다. URL, 경로, `-` 옵션, `@` 직접 참조는 거부한다. 설치 경로를 바꾸거나 플래그를 넣지 못하게 하려는 것이다.
- **실행:** `python -I main.py`(격리 모드)를 작업 폴더에서 돌린다. 환경 변수는 최소한(PATH, HOME, 임시 폴더, 로캘)만 넘긴다. 허브 토큰과 앱 비밀값은 작업에 보이지 않는다(테스트로 확인). 시간 제한(기본 120초, 최대 1,800초)을 넘기면 종료하고, 작업은 한 번에 하나씩 실행한다.
- **이것은 OS 샌드박스가 아니다.** 실행된 코드는 사용자가 직접 돌린 프로그램처럼 파일에 접근할 수 있다. 그래서 사람에게 먼저 묻는다.
  - 프로젝트에서 Python 코드를 처음 실행할 때
  - 새 패키지(버전 포함)를 설치할 때
  - 새 CLI 프로그램을 실행할 때
  - 답은 "이 프로젝트에 허용 / 한 번만 / 거부"이다. 허용한 내용은 프로젝트 파일 `runtime/permissions.json`에 남는다. 거부하면 도구가 "허용하지 않았다"를 에러로 돌려준다.
  - 권한 카드는 내장 에이전트면 채팅에, 외부 에이전트(MCP)면 Activity 탭에 뜬다.
  - OS 수준 샌드박스(macOS sandbox-exec, Windows AppContainer)는 이후에 검토한다.
- **기록:** 성공한 실행은 `project.lock.json`에 남는다(패키지 spec과 실제 설치 버전 `resolved`, 사용한 프로그램). 4단계 레시피와 5단계 project.md가 이 기록을 쓴다.

## 허브 연결

- **데스크톱:** 앱이 시작될 때 허브를 띄운다. 렌더러는 preload 브리지로 URL과 토큰을 받는다.
- **MCP 모드:** 브리지가 런타임 도구가 처음 필요할 때 허브를 띄운다(`uv sync`, 첫 실행 때 Python 설치). 그리고 인증된 뷰어에만 URL과 토큰을 WebSocket으로 넘긴다. 허브의 CORS는 뷰어 origin을 `SILJANGNIM_HUB_ORIGINS`로 받는다.
  - uv 찾는 순서: `SILJANGNIM_UV` → 저장소의 `desktop/vendor/bin/uv` → PATH
- **웹 모드(`npm run web`):** 허브가 없다. 도구가 그 이유를 에러로 돌려준다.
- 토큰은 앱 origin의 메모리에만 있다. 씬 iframe은 허브에 접근할 수 없다.

## 허브 API

모든 요청에 `Authorization: Bearer <token>`이 필요하다.

| | |
|---|---|
| `GET /runtime` | 환경 목록과 CLI 위치 |
| `POST /jobs` | `{kind: "python"\|"command", packages, code, argv, timeout_s}`로 작업을 만든다 |
| `PUT /jobs/{id}/inputs/{name}` | 입력 파일(본문 그대로) |
| `POST /jobs/{id}/start` | 대기열에 넣는다 |
| `GET /jobs/{id}?wait=s` | 상태(최대 60초까지 기다림) |
| `GET /jobs` | 최근 작업 50개, 최신순(로그는 끝 2000자) |
| `POST /jobs/{id}/cancel` | 취소 |
| `GET /jobs/{id}/outputs/{name}` | 출력 파일 |
| `GET /osc`, `POST /osc/listen {port}`, `POST /osc/stop` | OSC UDP 리스너 상태·시작·중지([m3.md](m3.md#2-입력)) |
| `GET /osc/stream` | 받은 OSC를 server-sent events로 보낸다(`data: [[주소, 인자들], …]`) |

## 작업 큐 UI (6단계)

- 에이전트가 이 컴퓨터에서 무언가를 실행하면 사이드바에 **Jobs** 탭이 생긴다. 내장 에이전트와 외부 에이전트 모두 해당한다. 오래 걸리는 E 등급(GPU·큰 모델) 작업을 위한 것이다.
- 탭에서 보이는 것:
  - 작업마다 라벨(`recipe <id>`, `python: 패키지들`, 프로그램 이름), 상태(설치 중·실행 중 등), 경과 시간
  - 펼치면 로그 끝부분과 출력, 에러
  - 대기 중이거나 실행 중인 작업은 **Cancel**로 멈출 수 있다. 에이전트는 `job_status`에서 cancelled를 받는다.
- 1.5초마다 갱신한다. 작업은 한 번에 하나씩 실행된다.
- 검증(MCP smoke): 60초짜리 작업을 `wait_s: 1`로 시작해 "still running"을 받는다. 뷰어의 Jobs 탭에서 사람이 하듯 Cancel을 누르고, 행 상태와 `job_status`가 cancelled인지 확인한다. hub pytest는 목록 순서, 라벨, 로그 길이를 확인한다.

## 검증

- **hub pytest(15개):** 실제 uv로 venv를 만들어 입출력, traceback, 시간 제한, 토큰 비노출, spec과 파일 이름 검증, CLI 작업을 확인한다.
- **studio vitest:** 권한 규칙, 도구 보고 형식, 가짜 허브를 상대로 한 컨트롤러 흐름(권한 카드 → 저장 → 업로드 → 출력 에셋화 → lock, 거부, 입력 확인)
- **smoke:**
  - 데스크톱: 목 에이전트가 업로드된 JSON을 입력으로 `python_run`을 하고, smoke가 권한 카드를 누른다.
  - MCP: `python_run`, `command_run`(node), `runtime_status`를 실제 허브로 실행한다.
- **실제 에이전트 (2026-10-11):** Claude Code가 PyPI에서 `trimesh==4.5.3`을 설치하고 토러스 매듭 OBJ를 만들었다(정점 19,200개, 삼각형 38,400개). 이 OBJ를 에셋으로 씬에서 회전·셰이딩하고 캡처로 확인했다(10턴, $0.43).
