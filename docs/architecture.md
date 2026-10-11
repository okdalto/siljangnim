# 실장님 v2 아키텍처 (초안)

> 상태: 설계 초안 · 2026-10
> 범위: 데스크톱 앱 전환, MCP 연동, 온디맨드 오픈소스 통합, 레시피, md 기반 공유

## 1. 목표

실장님은 "셰이더를 만들어 주는 웹앱"에서 **에이전트가 오픈소스를 그때그때 골라 붙여 결과물을 만드는 데스크톱 제작 환경**으로 바뀐다.

- 사용자는 원하는 결과를 말한다. 에이전트가 어떤 오픈소스가 필요한지 판단하고, 받아서 붙이고, 실행하고, 뷰포트에서 확인한다.
- 앱은 오픈소스 코드를 **번들하지 않는다**. 사용자의 컴퓨터에서 필요할 때 받는다.
- 한 번 성공한 통합은 **레시피(md)** 로 남아 다음 작업과 다른 에이전트가 재사용한다.
- 결과물은 코드 묶음이 아니라 **구조를 담은 md 문서**로 공유한다. 받은 쪽 에이전트가 레시피를 따라 재구성한다.
- 내장 에이전트뿐 아니라 사용자의 에이전트(Claude Code, Codex, Cursor 등)를 **MCP**로 붙여 쓸 수 있다.

지원 환경(1차): **macOS Apple Silicon**, **Windows x64 (NVIDIA CUDA / CPU)**.

## 2. 전체 구조

```
┌─────────────── 외부 에이전트 (MCP 클라이언트) ───────────────┐
│  Claude Code · Codex · Cursor · 사용자 정의 에이전트          │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP (stdio 런처 / localhost HTTP + 토큰)
┌──────────────── 실장님 데스크톱 (Electron) ──────────────────┐
│                                                              │
│  Renderer (기존 frontend)                                    │
│   - 노드 캔버스, 뷰포트(GLEngine / WebGPU), UI 패널, 타임라인 │
│   - 내장 에이전트 (agentEngine.js) = Hub의 MCP 클라이언트     │
│            ▲ WebSocket (기존 /ws 확장)                        │
│            ▼                                                 │
│  Hub (Python 사이드카, hub/)                                   │
│   - MCP 서버: 씬/에셋/카탈로그/레시피/런타임/프로젝트 도구    │
│   - Runtime: 격리 환경(uv venv), 설치, 실행, 작업 큐          │
│   - Recipe store · Provenance(lock) · Permission gate         │
│            │                                                 │
│            ▼                                                 │
│  워크스페이스 (~/Siljangnim)                                   │
│   projects/  recipes/  envs/  cache/  models/                 │
└──────────────────────────────────────────────────────────────┘
```

### 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 데스크톱 셸 | **Electron** | 맥/윈도우 모두 동일한 Chromium이어서 WebGPU·WebGL·MediaPipe·녹화가 똑같이 동작한다. Tauri는 맥에서 WKWebView를 써서 그래픽 동작이 OS마다 갈린다. |
| 허브 위치 | **Python 사이드카 (`hub/`, 새로 작성)** | 뷰포트(렌더러)와 런타임(Python/네이티브)을 모두 중계해야 한다. 나중의 "웹 + 로컬 허브" 모드도 같은 허브로 처리한다. v1 `backend/`에서 쓸 만한 부분(에셋 프로세서 등)만 옮기고, `backend/`는 2단계에서 제거한다. |
| Python 관리 | **uv** | 앱이 Python 런타임과 환경별 venv를 직접 관리한다. 사용자 PC의 Python에 의존하지 않는다. |
| 에이전트 일원화 | JS 에이전트를 유지하고 **Python 에이전트(`backend/agents/`)는 은퇴** | 웹 Lite 모드에도 JS 에이전트가 필요하다. 도구 구현은 허브의 MCP 도구로 일원화하고, 두 벌로 있는 도구 정의를 하나로 합친다. |

## 3. 온디맨드 통합 흐름

```
사용자 요청
   ↓
에이전트 판단 ── 카탈로그 검색 (메타데이터만: 용도, 실행 등급, OS/GPU, 라이선스)
   ↓
① 레시피 검색 ─ 맞는 verified 레시피가 있으면 → 바로 실행
   ↓ 없으면
② 받기 + 붙이기 (권한 확인)
   ↓
③ 실행 + 검증 (뷰포트 캡처, 출력 파일 확인)
   ↓ 성공
④ 레시피로 저장 (draft → verified)
   ↓
결과 = 에셋/씬 → 출처는 project.lock에 기록
```

### 실행 등급

에이전트는 오픈소스마다 붙이는 방식을 고른다. 등급은 카탈로그와 레시피에 기록된다.

| 등급 | 예 | 붙이는 방식 | 웹 Lite |
|---|---|---|---|
| A. GLSL 조각 | glsl-sdf-primitives, glsl-dither | 셰이더 소스에 직접 삽입 | ✅ |
| B. JS / WASM | d3-*, Clipper2, Rapier, Tone.js | 씬 스크립트에서 ESM import (CDN 또는 로컬 캐시) | ✅ |
| C. Python 패키지 | Shapely, trimesh, librosa, vpype | 허브의 격리 venv에 설치하고 함수 호출 | ❌ |
| D. 네이티브 CLI / 앱 | FFmpeg, Blender, OpenSCAD, Mitsuba | 설치 확인 → subprocess / 앱 API (또는 앱의 MCP 서버) | ❌ |
| E. GPU 모델 | SAM 2, Depth Anything, Whisper, TRELLIS | 모델 다운로드 → 작업 큐에서 장시간 실행, 진행률 표시 | ❌ |

### 플랫폼 처리

- 레시피와 카탈로그 항목은 `platforms` 필드로 지원 여부를 표시한다. 예: `mac-arm64: mps`, `win-x64: cuda`.
- 허브는 시작할 때 환경(OS, GPU, CUDA 버전, VRAM, 메모리)을 감지한다. 현재 환경에서 쓸 수 없는 항목은 에이전트에게 후보로 보이지 않는다.
- CUDA 전용 모델은 맥에서 "사용 불가"로 표시하고, 에이전트가 대체 오픈소스를 찾게 한다. 원격 GPU는 이후 단계에서 다룬다.
- 설치는 빌드된 wheel이나 바이너리를 우선 쓴다. Windows에서 네이티브 빌드가 필요한 경로는 마지막 수단이다.

## 4. 레시피

**레시피 = "이 오픈소스를 이 환경에서 이렇게 붙였더니 작동했다"는 기록.** 코드가 아니라 설치 방법과 호출 방법이다. 사람도 읽을 수 있고 에이전트도 따라 할 수 있는 md 파일 하나로 쓴다.

### 위치

```
~/Siljangnim/recipes/
  depth-anything-v2.image-to-depth/
    recipe.md          # 본문 (필수)
    fixture/           # 검증용 작은 입력 (선택)
```

### 형식

```markdown
---
id: depth-anything-v2.image-to-depth
version: 3
title: 이미지 → 깊이맵 (Depth Anything V2)
capability: image-to-depth          # 에이전트가 검색하는 기능 키
tier: E
source:
  name: Depth-Anything-V2
  repo: https://github.com/DepthAnything/Depth-Anything-V2
  ref: <commit sha>
  license: Apache-2.0
  weights_license: Apache-2.0 (Small) / CC-BY-NC-4.0 (Base·Large)
io:
  inputs:  [{ name: image, media: image }]
  outputs: [{ name: depth, media: image, format: png16 }]
platforms:
  mac-arm64: { accel: mps, status: verified, tested: 2026-10-11 }
  win-x64:   { accel: cuda, status: untested }
status: verified                    # draft | verified | broken
---

## 설치
1. `uv venv envs/depth-anything-v2 --python 3.11`
2. `uv pip install torch torchvision opencv-python` (win-x64: CUDA wheel index 사용)
3. 저장소를 `ref`로 체크아웃하고, 가중치 `depth_anything_v2_vits.pth`를 cache/models에 받기

## 호출
(허브 `run_in_env`에 넘길 호출 코드: 입력 경로 → 출력 경로)

## 검증
fixture/room.jpg → 출력 크기가 입력과 같고, 값 범위가 비어 있지 않음

## 주의
- Base/Large 가중치는 비상업 라이선스다. 상업 용도면 Small만 쓴다.
- MPS에서 입력이 1024px를 넘으면 메모리가 부족해진다. 먼저 줄인다.
```

### 생명주기

| 상태 | 의미 | 에이전트 동작 |
|---|---|---|
| `draft` | 에이전트가 방금 붙였다. 검증 전이다. | 재사용 전에 검증한다. |
| `verified` | 이 PC에서 검증 단계를 통과했다(플랫폼별로 기록). | 바로 실행한다. |
| `broken` | 다시 실행했는데 실패했다. 실패 로그를 덧붙인다. | 고치거나 대체를 찾고, 고치면 `version`을 올린다. |
| 가져온 레시피 | 다른 사람이나 다른 에이전트가 만든 레시피 | **이 PC에서는 `draft`로 취급한다.** 설치 명령을 사용자에게 보여 준 뒤 실행한다. |

- 같은 `capability`에 레시피가 여러 개면, 현재 플랫폼에서 verified인 것 → 최근 성공 → 라이선스 제약이 적은 것 순으로 고른다.
- 레시피 공유는 GitHub 저장소 기반 레지스트리로 한다([registry.md](registry.md)). PR로 기여한다. 레시피에는 코드가 들어가지 않으므로 라이선스 부담이 거의 없다.

## 5. 공유: 프로젝트 md

결과물은 **구조 문서(`project.md`)** 로 공유한다. 서드파티 코드는 담지 않고 레시피 참조만 담는다. 받은 쪽 에이전트가 레시피를 해석하고 설치한 뒤 재구성한다.

```markdown
---
title: 방 사진으로 만든 플로터 드로잉
siljangnim: 2
recipes:
  - depth-anything-v2.image-to-depth@3
  - vpype.svg-optimize@1
assets:
  - { id: room, media: image, source: user-provided, sha256: ... }
preview: preview.png          # 참고 이미지 (결과 비교용)
---

## 의도
방 사진의 깊이에 따라 선 밀도가 달라지는 해칭 드로잉. A3 플로터 출력.

## 파이프라인
1. room → [image-to-depth] → depth
2. depth → [씬: hatching shader] → hatching.svg
   - 파라미터: density=0.7, angle=35°, layers=3
3. hatching.svg → [svg-optimize] → plot.svg (A3, 선 병합)

## 씬
(이 프로젝트에서 에이전트나 사용자가 직접 쓴 셰이더·스크립트. 서드파티 코드가 아니므로 포함할 수 있다.)
```

원칙:
- **서드파티 코드는 담지 않는다.** 레시피 id@version으로만 참조한다.
- **직접 쓴 코드는 담을 수 있다.** 에이전트나 사용자가 만든 셰이더와 씬 스크립트가 여기에 해당한다.
- 사용자 에셋은 해시와 함께 `user-provided`로 표시한다. 포함 여부는 사용자가 정한다.
- 생성 과정에는 비결정성이 있으므로, `preview`로 재구성 결과를 비교할 수 있게 한다.
- 기존 zip 내보내기와 GitHub 저장은 이 형식으로 대체하거나, 옵션으로 남긴다.

## 6. 출처 기록과 라이선스

앱이 코드를 배포하지 않으므로 대부분의 라이선스 의무는 앱에 생기지 않는다. 다만 다음 경우는 남으므로 출처를 기록해서 대응한다.

- 프로젝트마다 `project.lock`을 둔다. 실제로 사용한 레시피 id@version, 저장소와 커밋, 코드 라이선스, 가중치 라이선스를 기록한다.
- **가중치 라이선스**(비상업, 출력물 제한 등)는 결과 사용 조건에 영향을 준다. 이런 레시피를 쓰면 에이전트가 사용자에게 알리고, `project.md`에도 표시한다.
- 사용자가 받아 온 코드를 직접 포함해서 내보내려 하면, 해당 LICENSE와 고지를 함께 넣고 GPL/AGPL은 경고한다.
- 웹 모드에서 우리 서버가 서드파티 코드를 대신 받아서 전달하지 않는다. 받기는 항상 사용자 브라우저나 사용자 PC가 직접 한다.

(일반적인 해석 기준이며 법률 자문이 아니다.)

## 7. 권한과 보안

에이전트가 처음 보는 코드를 받아서 실행하는 구조이므로, 보안 경계는 허브에 둔다.

| 동작 | 기본 정책 |
|---|---|
| 읽기 (씬, 에셋, 카탈로그, 레시피) | 자동 |
| 씬 편집, 셰이더 컴파일, 뷰포트 캡처 | 자동 |
| 패키지 설치, 저장소 받기, 모델 다운로드 | **확인**: 명령, 출처, 라이선스, 용량을 보여 준다 |
| 격리 환경에서 코드 실행 | verified 레시피는 자동, 그 밖에는 확인 |
| 워크스페이스 밖 파일 접근, 임의 네트워크 접근 | 거부 (설정에서 허용 가능) |

- 실행은 레시피별 venv와 작업 디렉터리 안으로 제한한다. OS 수준 샌드박스는 맥(sandbox-exec)과 윈도우(AppContainer/Job Object)에서 단계적으로 검토한다. 현재 문서의 보안 안내("공용 인터넷에 노출하지 말 것")는 그대로 유지한다.
- README, 이슈, 가져온 레시피처럼 **외부에서 온 텍스트는 데이터로 취급한다.** 그 안의 지시는 에이전트가 따르지 않는다.
- MCP HTTP는 localhost에만 바인딩하고, 앱이 발급한 토큰을 요구한다.
- 렌더러는 허브 토큰을 preload 브리지로 받는다. 씬 스크립트(에이전트가 작성한 코드)도 같은 렌더러에서 돌기 때문에, 허브가 실행 도구를 노출하기 전(3단계)에 씬 스크립트를 토큰에 접근할 수 없는 격리 컨텍스트(별도 iframe/워커)로 옮긴다.
- 카탈로그에 있는 저장소를 우선 후보로 쓴다. 카탈로그 밖의 저장소를 쓸 때는 출처를 명시하고 확인을 받는다.

## 8. MCP 도구 (초안)

허브가 노출하는 도구다. 내장 에이전트와 외부 에이전트가 같은 도구를 쓴다.

| 그룹 | 도구 |
|---|---|
| 씬 | `scene_read`, `scene_edit` (파일 단위, 낙관적 락), `shader_compile`, `uniform_set`, `panel_open`, `viewport_capture`, `viewport_errors`, `timeline_control` |
| 에셋 | `asset_list`, `asset_import`, `asset_read`, `asset_export` |
| 카탈로그 | `catalog_search(query, media?, tier?)`, `catalog_get(id)` |
| 레시피 | `recipe_search(capability)`, `recipe_read`, `recipe_save`, `recipe_verify`, `recipe_mark_broken` |
| 런타임 | `env_create`, `env_install`, `run_in_env`, `job_start`, `job_status`, `job_cancel`, `system_info` |
| 프로젝트 | `project_export_md`, `project_import_md`, `project_lock_read` |

- 허브는 MCP **클라이언트**도 된다. Blender나 ComfyUI처럼 자체 MCP 서버가 있는 도구는 레시피에서 "이 MCP 서버를 붙여라"로 기술할 수 있다.
- 기존 `frontend/src/engine/tools/*`와 `backend/agents/tools.py`의 도구 정의를 이 목록으로 옮긴다.

## 9. 카탈로그

- 카탈로그는 **메타데이터만** 담는다: 이름, 저장소, 용도, 입출력 매체, 실행 등급, 플랫폼, 라이선스. 코드는 담지 않는다.
- 첫 참고 목록은 [index.opensource](https://indexopensource.com/index)다(412개, 9개 그룹, 작성: 현 @hyun2xyz). 카탈로그와 앱 안에 출처를 표기한다. 사이트에 데이터 라이선스가 따로 적혀 있지 않으므로, 설명문을 그대로 옮기는 경우를 대비해 사용 조건을 한 번 확인해 둔다.
- 기존 `techniqueKnowledgeBase.js`는 카탈로그와 레시피 검색으로 대체한다.

## 10. 웹 버전

| 모드 | 환경 | 가능 범위 |
|---|---|---|
| Lite | 브라우저만 (현재 Vercel 배포) | A/B 등급, 셰이더, UI, 녹화, 브라우저용 ML |
| Connected | 브라우저 + 로컬 허브 | 데스크톱과 동일 (허브가 런타임 담당) |
| Desktop | Electron | 전부 |

허브가 없으면 C/D/E 등급 도구를 에이전트에게 노출하지 않는다. 같은 코드베이스로 세 모드를 지원한다.

## 11. 단계별 계획

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0 | 이 설계 문서 | 합의 |
| 1 | Electron 셸 + Python 사이드카 패키징(uv 내장) — 구현됨, 맥/윈도우 실기 검증 대기 | 맥/윈도우에서 설치 파일 실행 → 기존 기능 동작 |
| 1.5 | 렌더러 재작성: `studio/` ([studio.md](studio.md)) — M1 구현됨. M2 1~4번 뒤 2·3단계로 넘어가고, M3는 그 뒤에 한다([m2.md](m2.md#작업-순서)) | v1 기능 동등 후 `frontend/` 은퇴 |
| 2 | 허브 MCP 서버, 기존 도구 이전, Python 에이전트 은퇴. 외부 에이전트가 붙으면 대화는 그 에이전트의 앱에서 하고, 앱 채팅은 보기 전용으로 바뀌어 외부 에이전트의 작업 기록을 보여 준다 — **브라우저 뷰어와 데스크톱 앱 연결 구현·검증됨**([mcp.md](mcp.md)). Python 에이전트(`backend/`) 삭제는 v1 은퇴와 함께 사람이 결정 | Claude Code와 Codex를 MCP로 붙여 셰이더 씬 생성 + 뷰포트 캡처 |
| 3 | 런타임: 격리 환경, 설치, 작업 큐, 권한 게이트, project.lock — **구현·검증됨**([runtime.md](runtime.md)). OS 수준 샌드박스는 남음. E 등급 작업 큐 UI는 6단계에서 구현 | 에이전트가 C/D 등급 오픈소스를 받아 실행 |
| 4 | 레시피: 형식, 저장·검증·검색, 에이전트 프롬프트 — **구현·검증됨**([recipes.md](recipes.md)). 공유 레지스트리는 6단계 | 같은 요청을 두 번 하면 두 번째는 레시피로 즉시 실행 |
| 5 | project.md 내보내기·가져오기 — **구현·검증됨**([project-md.md](project-md.md)) | 다른 PC의 다른 에이전트가 md만 보고 재구성 |
| 6 | 카탈로그([catalog.md](catalog.md)), E 등급 작업 큐 UI([runtime.md](runtime.md#작업-큐-ui-6단계)), 레시피 공유 레지스트리([registry.md](registry.md)) — **구현됨** | — |

검증용 대표 시나리오 (1~5단계 내내 사용):
1. 셰이더만: "반응-확산 시뮬레이션 + 컨트롤 패널" (A, 기존 기능 회귀 확인)
2. JS 라이브러리: "Delaunay 삼각분할로 로우폴리 포트레이트" (B)
3. Python + CLI: "사진 → 깊이 → 해칭 SVG → vpype 플로터 출력" (C, E)
4. 네이티브 앱: "생성한 메시를 Blender로 렌더" (D)

### 2단계 메모: 외부 에이전트 연결 (2026-10-11)

- **연결은 stdio 브리지로 한다.** Claude Code가 채널을 쓰려면 stdio 서버여야 하고, stdio는 Codex, Cursor 등 모든 MCP 클라이언트가 지원한다. 브리지는 앱이 띄워 둔 localhost 엔드포인트에 실행마다 바뀌는 토큰으로 중계한다. 도구 정의는 지금처럼 studio(TS) 한 곳에 둔다.
- **대화는 외부 에이전트의 앱에서 한다.** 외부 에이전트가 붙어 있는 동안 앱 채팅은 입력을 막고, 그 에이전트의 도구 호출(씬 수정, 캡처 등)을 기록으로 보여 준다. 연결이 끊기면 내장 에이전트로 돌아간다. MCP 표준만으로 동작한다.
- `ask_user`는 내장 에이전트 전용이다. 외부 에이전트는 자기 채팅에서 묻는다.
- **선택 기능:** Claude Code 채널(`claude/channel`, 리서치 프리뷰)로 앱 채팅 메시지를 세션에 밀어 넣을 수 있다. 직접 만든 채널은 `--dangerously-load-development-channels`가 필요하다. 앱 토큰으로 인증된 발신만 넣어야 한다(프롬프트 인젝션). 필요해지면 브리지에 얹는다.

## 12. 열린 질문

- 허브를 Electron 메인 프로세스(Node)로 옮길지, Python 사이드카로 둘지 → 현재 결정은 사이드카. 1단계 측정(Linux): 첫 실행 시 Python 설치 포함 약 9초, 런타임 디스크 약 120 MB, 이후 실행은 1~2초. 맥/윈도우 수치를 보고 재검토한다.
- 레시피 공유 레지스트리의 신뢰 모델: 서명 여부, 검증 결과 집계 방식
- 원격 GPU(맥에서 CUDA 전용 모델 실행) 지원 시점과 방식
- 기존 zip/GitHub 저장 기능을 유지할지
- index.opensource 데이터의 라이선스 표기 확인 (출처 표기 방식 포함)
