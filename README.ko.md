<p align="center">
  <img src="frontend/public/logo.svg" alt="실장님" width="128" height="128" />
</p>

<h1 align="center">실장님</h1>

<p align="center">
  AI 기반 실시간 그래픽 제작 도구.<br/>
  자연어로 비주얼을 묘사하면 — Claude가 WebGL2 셰이더를 생성해 브라우저에서 바로 렌더링합니다.
</p>

<p align="center">
  <a href="https://siljangnim.vercel.app/">🌐 온라인에서 사용하기</a> · <a href="README.md">English</a>
</p>

![WebGL2](https://img.shields.io/badge/WebGL2-ES_3.0-blue)
![License](https://img.shields.io/badge/license-GPLv3-green)

## 무엇을 할 수 있나요?

**상상하는 모든 것을 만들 수 있습니다.** 3D 모델 로딩이 될까 걱정되나요? 알아서 로더를 짭니다. 음악 파일을 읽을 수 있을까 걱정되나요? 파일을 분석하고, 스펙트럼을 뽑고, 셰이더에 연결하는 것까지 전부 알아서 합니다. 코드를 작성할 필요 없이 — 원하는 것을 설명하면 에이전트가 나머지를 해결합니다.

AI 에이전트에게 자연어로 채팅하세요 — WebGL2 셰이더를 작성하고, UI 패널을 만들고, 모든 것을 실시간으로 연결합니다.

### 비주얼 생성

보고 싶은 것을 말하세요:

> "파란 파도가 화면을 천천히 가로지르는 셰이더 만들어줘"
>
> "마우스 인터랙션이 있는 반응-확산 시뮬레이션 만들어줘"
>
> "무한 평면 위에 반사 구체가 있는 레이마칭 장면 만들어줘"

에이전트가 GLSL 셰이더를 작성하고, 컴파일하고, 실시간으로 렌더링합니다 — 멀티패스 버퍼, 3D 지오메트리, 후처리까지 모두 자동으로 처리됩니다.

### 자동 생성 UI 컨트롤

에이전트가 씬에 필요한 인터랙티브 컨트롤 패널을 자동으로 만듭니다:

> "색상이랑 속도 조절할 수 있게 컨트롤 패널 만들어줘"

슬라이더, 컬러 피커, 토글, 2D 패드, 드롭다운, 카메라 오빗 컨트롤, 버퍼 프리뷰 등을 생성합니다. 모든 컨트롤은 셰이더 유니폼에 연결되며 undo/redo 및 키프레임 애니메이션을 지원합니다.

```
┌─ Wave Controls ─────────────────┐
│ Speed       ●━━━━━━━━━━━  0.8   │
│ Amplitude   ━━━━●━━━━━━━  0.4   │
│ Color       [■ #3b82f6]        │
│ Wireframe   [  ○ OFF  ]        │
│ Shape       [ Sphere ▾ ]       │
└─────────────────────────────────┘
```

### 오디오 리액티브 비주얼

오디오 파일을 업로드하거나 URL을 사용하세요 — 에이전트가 베이스/미드/트레블, FFT, 웨이브폼 데이터를 실시간으로 분석합니다:

> "이 음악에 반응하는 비주얼 만들어줘. 베이스에 원이 커지고 하이에 색이 바뀌게"

### MediaPipe 손/포즈/얼굴 트래킹

MediaPipe Vision을 활용한 웹캠 기반 실시간 트래킹:

> "웹캠으로 손 인식해서 두 손으로 pinch하면 와이어프레임 박스가 나타나게 해줘"

33포인트 바디 포즈, 21포인트 손 랜드마크 (양손), 478포인트 페이스 메시를 지원하며 — 모두 셰이더에서 사용할 수 있는 GPU 텍스처로 제공됩니다.

### 3D 모델 및 스켈레탈 애니메이션

`.obj`, `.fbx`, `.gltf`, `.glb` 파일을 업로드하세요 — 에이전트가 지오메트리, 머티리얼, 텍스처, 스켈레탈 애니메이션 데이터를 자동으로 처리합니다:

> "캐릭터 모델을 업로드하고 림 라이팅과 아이들 애니메이션으로 렌더링해줘"

### 파일 처리 및 업로드

이미지, 폰트, SVG, 오디오, 비디오, 3D 모델을 업로드할 수 있습니다. 각 파일은 자동으로 WebGL에 적합한 형태(비트맵 아틀라스, 스펙트로그램, 지오메트리 JSON 등)로 변환됩니다.

### 녹화 및 내보내기

뷰포트를 MP4 (오프라인, 프레임 정확), WebM (실시간 또는 오프라인), 또는 PNG 시퀀스 (알파 투명도 지원)로 녹화할 수 있습니다. FPS, 화질, 해상도를 설정할 수 있습니다.

### 타임라인 및 키프레임 애니메이션

키프레임, 큐빅 에르미트 보간, 이징으로 모든 유니폼을 시간에 따라 애니메이션할 수 있습니다. 타임라인 바에서 스크럽, 루프, 길이 조절이 가능합니다.

## 지원 AI 프로바이더

다양한 AI 프로바이더를 지원합니다. 용도에 맞게 선택하세요:

| 프로바이더 | 모델 | 특징 |
|------------|------|------|
| **Anthropic (Claude)** | Claude Opus 4.6, Claude Sonnet 4.6 | 최고 품질, 복잡한 씬에 추천 |
| **OpenAI** | GPT-4.1 | 좋은 대안, 강력한 도구 호출 |
| **Google Gemini** | Gemini 2.5 Flash | 빠른 속도, 큰 컨텍스트 윈도우 |
| **Zhipu AI (GLM)** | GLM-4-Plus | 중국어 지원 |
| **커스텀 (OpenAI 호환)** | 모든 모델 | 셀프 호스팅 / 로컬 모델 |

### 커스텀 모델 연결 (vLLM, Ollama 등)

OpenAI 호환 API 서버라면 무엇이든 연결할 수 있습니다 — vLLM, Ollama, TGI, LM Studio 등.

**예시: vLLM으로 Qwen3.5-27B 실행**

```bash
# vLLM 서버 시작
vllm serve Qwen/Qwen3.5-27B \
  --max-model-len 131072 \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

앱의 API 설정 모달에서:
1. **Custom** 프로바이더 선택
2. **Base URL**에 서버 주소 입력 (예: `http://localhost:8000/v1/`)
3. **Model Name**에 모델명 입력 (예: `Qwen/Qwen3.5-27B`)
4. **Max Tokens** 설정 (예: `4096` — 이것은 최대 *출력* 길이이며, 컨텍스트 크기가 아닙니다)
5. API Key는 로컬 서버의 경우 비워도 됩니다

> **팁:** 커스텀 모델은 도구 호출(tool calling)을 지원하는 27B 이상 모델을 권장합니다. 작은 모델은 복잡한 셰이더 생성에 어려움을 겪을 수 있습니다.

> **팁:** `--max-model-len`은 vLLM이 할당하는 컨텍스트 윈도우 크기입니다. GPU 메모리가 허용하는 한 크게 설정하세요 — 앱 설정의 `max_tokens`와는 다릅니다.

## 주의사항

> **보안** — AI 에이전트는 호스트 머신에서 임의의 Python 코드를 실행할 수 있습니다. 컨테이너나 OS 수준의 샌드박스가 없습니다. **이 애플리케이션을 공용 인터넷에 노출하지 마세요.** 자세한 내용은 [보안 안내](#보안-안내)를 참조하세요.

> **비용** — 클라우드 API (Anthropic, OpenAI, Gemini, GLM) 사용 시 모든 채팅 메시지는 토큰을 소모합니다. 복잡한 씬은 프롬프트당 여러 차례의 도구 사용 라운드를 발생시킬 수 있습니다. 단일 대화로 쉽게 **$1–5+ 이상의 API 크레딧**을 사용할 수 있습니다. 프로바이더 대시보드에서 사용량을 모니터링하세요. 셀프 호스팅 커스텀 모델은 토큰당 비용이 없습니다.

## 빠른 시작

**필수 조건:** Python 3.10+, Node.js 18+, [지원 프로바이더](#지원-ai-프로바이더) 중 하나의 API 키

**macOS / Linux:**

```bash
git clone https://github.com/okdalto/siljangnim.git
cd siljangnim
chmod +x run.sh
./run.sh
```

**Windows:**

```powershell
git clone https://github.com/okdalto/siljangnim.git
cd siljangnim
run.bat
```

**http://localhost:5173** 을 열고, 프롬프트에 따라 API 키를 입력하세요 — `backend/.env`에 자동 저장됩니다.

<details>
<summary><strong>수동 설정</strong></summary>

**macOS / Linux:**

```bash
# 백엔드
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # 선택사항
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 프론트엔드 (새 터미널)
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

**Windows:**

```powershell
# 백엔드
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
echo ANTHROPIC_API_KEY=sk-ant-... > .env   # 선택사항
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 프론트엔드 (새 터미널)
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

</details>

## 사용법

1. **채팅에 원하는 비주얼을 설명하세요** — 어떤 언어든 가능합니다
2. **뷰포트에서 결과를 확인하세요** — 셰이더가 자동으로 컴파일되고 렌더링됩니다
3. **파라미터를 조정하세요** — 자동 생성된 컨트롤 패널을 통해
4. **타임라인으로 애니메이션하세요** — 키프레임, 스크럽, 루프
5. **녹화하거나 저장하세요** — 비디오 내보내기 또는 프로젝트 저장

| 단축키 | 동작 |
|--------|------|
| `Space` | 재생 / 일시정지 전환 |
| `Ctrl/Cmd + Z` | 실행 취소 (유니폼, 레이아웃, 키프레임) |
| `Ctrl/Cmd + S` | 프로젝트 저장 |

## 프로젝트 구조

```
siljangnim/
├── backend/
│   ├── main.py           # FastAPI 서버 + WebSocket
│   ├── agents.py         # Claude 에이전트 (셰이더 생성 + UI 컨트롤)
│   ├── workspace.py      # 샌드박스 파일 I/O
│   ├── projects.py       # 프로젝트 저장/불러오기
│   └── config.py         # API 키 관리
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # 메인 앱 + 상태 관리
│   │   ├── engine/       # GLEngine (WebGL2 렌더러)
│   │   ├── nodes/        # ReactFlow 노드 (채팅, 뷰포트, 인스펙터 등)
│   │   └── components/   # 툴바, 타임라인, 스냅 가이드
│   └── package.json
├── .workspace/           # 런타임 데이터 (씬, 업로드, 프로젝트)
├── run.sh                # 원클릭 실행 스크립트 (macOS/Linux)
└── run.bat               # 원클릭 실행 스크립트 (Windows)
```

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 19, Vite, TailwindCSS v4, @xyflow/react |
| 렌더링 | WebGL2 (ES 3.0), 커스텀 GLEngine |
| 백엔드 | FastAPI, WebSocket, Uvicorn |
| AI | Anthropic Claude API (도구 호출) |

## 보안 안내

AI 에이전트는 `run_python` 및 `run_command` 도구를 통해 호스트 머신에서 임의의 Python 코드와 허용된 셸 명령(`pip`, `ffmpeg`, `ffprobe`, `convert`, `magick`)을 실행할 수 있습니다. 실행은 `.workspace/` 작업 디렉토리로 제한되고 셸 명령은 화이트리스트로 제한되지만, **Python 코드는 백엔드 프로세스와 동일한 권한으로 실행됩니다** — 컨테이너나 OS 수준의 샌드박스가 없습니다.

이는 프롬프트 인젝션 공격(예: 악의적으로 조작된 업로드 파일)이 잠재적으로 다음을 수행할 수 있음을 의미합니다:
- 백엔드 프로세스가 접근할 수 있는 파일 읽기/쓰기
- `pip`을 통한 임의의 패키지 설치
- 설치된 패키지나 네트워크 호출을 통한 데이터 유출

**이 애플리케이션을 공용 인터넷에 노출하지 마세요.** 로컬 단일 사용자 전용으로 설계되었습니다. 공유 네트워크에서 실행해야 하는 경우 인증을 추가하고 백엔드를 컨테이너 내부에서 실행하는 것을 고려하세요.

## 라이선스

[GPLv3](LICENSE)
