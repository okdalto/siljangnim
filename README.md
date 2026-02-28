# PromptGL

AI로 실시간 그래픽을 만드는 도구. 자연어로 원하는 비주얼을 설명하면 Claude가 WebGL2 셰이더를 생성하고, 브라우저에서 바로 렌더링합니다.

![WebGL2](https://img.shields.io/badge/WebGL2-ES_3.0-blue)
![License](https://img.shields.io/badge/license-GPLv3-green)

## 주요 기능

- **자연어 셰이더 생성** — 채팅으로 원하는 비주얼을 설명하면 GLSL 셰이더 자동 생성
- **멀티패스 렌더링** — BufferA/B/C/D 체이닝, 핑퐁 더블 버퍼, 피드백 루프 지원
- **2D & 3D** — 풀스크린 셰이더 아트부터 3D 지오메트리(box, sphere, plane)까지
- **인터랙티브 UI** — 슬라이더, 2D 패드, 3D 카메라 컨트롤, 컬러 피커 자동 생성
- **이미지 텍스처** — 이미지를 업로드해서 셰이더 텍스처로 활용
- **타임라인** — 재생/일시정지, 시간 스크럽, 루프/1회 재생 토글
- **프로젝트 관리** — 씬, 채팅 이력, 업로드 파일을 프로젝트 단위로 저장/불러오기

## 빠른 시작

### 필수 조건

- Python 3.10+
- Node.js 18+
- [Anthropic API 키](https://console.anthropic.com/)

### 실행

```bash
git clone https://github.com/your-username/siljangnim.git
cd siljangnim
./run.sh
```

`run.sh`가 자동으로:
1. Python 가상환경 생성 및 백엔드 의존성 설치
2. 프론트엔드 npm 패키지 설치
3. 백엔드(`localhost:8000`) + 프론트엔드(`localhost:5173`) 동시 시작

브라우저에서 `http://localhost:5173`을 열면 API 키 입력 모달이 나타납니다.

### 수동 설치

```bash
# 백엔드
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# .env에 API 키 저장 (선택 — UI에서도 입력 가능)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn main:app --host 0.0.0.0 --port 8000

# 프론트엔드 (새 터미널)
cd frontend
npm install
npm run dev
```

## 사용법

1. **채팅에 원하는 비주얼을 설명합니다**
   > "파란색 물결이 천천히 움직이는 셰이더 만들어줘"

2. **뷰포트에서 결과를 바로 확인합니다** — 셰이더가 자동으로 컴파일되고 렌더링됩니다

3. **Inspector에서 파라미터를 조정합니다** — 슬라이더, 컬러 피커 등이 자동 생성됩니다

4. **타임라인에서 애니메이션을 제어합니다** — 스크럽, 루프, 재생 속도 조정

5. **프로젝트를 저장하고 나중에 불러옵니다**

### 키보드 단축키

| 키 | 동작 |
|---|---|
| `Space` | 재생 / 일시정지 토글 |
| 뷰포트 클릭 후 키보드 | 셰이더에 키 입력 전달 |

## 프로젝트 구조

```
siljangnim/
├── backend/
│   ├── main.py           # FastAPI 서버 + WebSocket
│   ├── agents.py         # Claude 에이전트 (셰이더 생성 + UI 제어)
│   ├── workspace.py      # 샌드박스 파일 I/O
│   ├── projects.py       # 프로젝트 저장/불러오기
│   └── config.py         # API 키 관리
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # 메인 앱 + 상태 관리
│   │   ├── engine/       # GLEngine (WebGL2 렌더러)
│   │   ├── nodes/        # ReactFlow 노드 (채팅, 뷰포트, 인스펙터 등)
│   │   └── components/   # Toolbar, Timeline, SnapGuides
│   └── package.json
├── .workspace/           # 런타임 데이터 (씬, 업로드, 프로젝트)
└── run.sh                # 원클릭 실행 스크립트
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19, Vite, TailwindCSS v4, @xyflow/react |
| 렌더링 | WebGL2 (ES 3.0), 커스텀 GLEngine |
| 백엔드 | FastAPI, WebSocket, Uvicorn |
| AI | Anthropic Claude API (tool calling) |

## 라이선스

[GPLv3](LICENSE)
