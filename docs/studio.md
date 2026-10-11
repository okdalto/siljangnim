# Studio: 새 렌더러 설계

> 상태: M1 구현 완료 · 2026-10
> 기존 `frontend/`를 대체하는 새 앱 화면. 전체 구조는 [architecture.md](architecture.md) 참고.

## 왜 새로 쓰는가

기존 `frontend/`를 조사해서 확인한 구조적 문제는 이렇다.

- **씬 코드가 격리되지 않는다.** 에이전트가 쓴 씬 스크립트가 앱 메인 창에서 `new Function`으로 실행된다. 그래서 가져온 프로젝트 하나가 sessionStorage의 API 키와 GitHub 토큰을 읽어 외부로 보낼 수 있다. safe mode는 배너만 띄우고 실제로 막지 않는다.
- **에러가 전역으로 수집된다.** 에이전트가 뷰포트 에러를 받는 경로가 `console.error` 몽키패치, `window` 이벤트, 응답을 한 슬롯에만 담는 promise를 거친다. 그래서 요청이 동시에 들어오면 서로 덮어쓴다.
- **큰 파일 몇 개가 모든 걸 맡는다.** `GLEngine.js`(2,900줄)의 40%가 컨텍스트 손실 복구 휴리스틱이다. `agentExecutor.js`(1,800줄)는 같은 루프를 세 벌 갖고 있다. `App.jsx`의 상태를 30개 훅이 서로 엮어 쓴다.
- **LLM 호출 경로가 흩어져 있다.** 키를 직접 읽는 "작은 모델" 호출이 다섯 군데에 복사돼 있고, 일부는 선택한 프로바이더를 무시하고 Anthropic을 직접 부른다.

## 원칙

1. **씬은 다른 출처(origin)에서 돈다.** 앱과 씬 런타임은 postMessage RPC로만 통신하고, 비밀값(API 키, 허브 토큰)은 씬 쪽으로 넘어가지 않는다.
2. **요청과 응답이 1:1로 대응한다.** 에이전트 도구가 씬을 바꾸면 그 호출이 곧바로 결과(로드 성공 여부, 구조화된 에러)를 돌려받는다. 전역 수집기는 두지 않는다.
3. **도구는 한 번만 정의한다.** 내장 에이전트가 쓰는 도구 정의를 그대로 MCP 서버(2단계)에도 노출한다.
4. **LLM 호출은 게이트웨이 하나로만 한다.** 프로바이더별 차이는 어댑터 안에서 처리한다.
5. **TypeScript strict.** 씬 `ctx` API와 RPC 프로토콜은 타입으로 고정한다.

## 구조

```
studio/
  index.html            앱 (app://siljangnim/)
  scene.html            씬 런타임 문서 (app://scene/ — 다른 출처)
  src/
    app/                React UI: 레이아웃, 채팅, 뷰포트, 컨트롤, 설정
    agent/              LLM 게이트웨이, 도구 레지스트리, 에이전트 루프, 프롬프트
    project/            프로젝트·파일 저장 (IndexedDB)
    scene/
      schema.ts         씬 형식 v2 타입 + 검증 + v1 변환
      protocol.ts       앱 ↔ 런타임 RPC 메시지 타입
      host.ts           앱 쪽: iframe 관리, RPC 클라이언트
      runtime/          iframe 안: 루프, ctx 빌더, 에러 수집, 캡처
      gl/               WebGL2 유틸 (기존 모듈을 TS로 옮김)
```

## 씬 격리

| 환경 | 앱 출처 | 씬 출처 |
|---|---|---|
| 데스크톱 | `app://siljangnim` | `app://scene` (같은 프로토콜 핸들러, 다른 host) |
| 개발 서버 | `http://localhost:5173` | `http://127.0.0.1:5173` |
| 웹 (이후) | 배포 도메인 | 별도 서브도메인 |

- iframe에는 `sandbox="allow-scripts allow-same-origin"`을 건다. 이때 same-origin은 *씬 자신의* 출처이므로 앱의 저장소는 보이지 않는다. 카메라, 마이크, MIDI는 `allow` 속성으로 위임한다.
- 씬 문서에는 CSP를 건다. 스크립트는 자기 출처와 지정된 ESM CDN(esm.sh, jsdelivr, unpkg)에서만 받는다. B등급 JS 라이브러리를 온디맨드로 가져오는 경로가 여기다.
- 에셋은 앱이 Blob으로 넘기고, 런타임이 blob URL로 연다. 런타임은 앱의 IndexedDB에 직접 접근하지 않는다.

## 씬 형식 v2

에이전트가 이미 잘 쓰는 "스크립트 씬" 모델을 유지한다. 대신 형식을 타입으로 고정하고 쓰이지 않는 필드는 정리한다.

```jsonc
{
  "version": 2,
  "backend": "webgl2",            // "webgl2" | "webgpu"
  "script": { "setup": "...", "render": "...", "cleanup": "..." },
  "uniforms": { "u_speed": { "type": "float", "value": 1, "min": 0, "max": 4 } },
  "inputs": ["mouse"]             // "camera" | "microphone" | "midi" … 명시해야 권한 요청
}
```

- v1 씬(`render_mode: "script"`)은 불러올 때 v2로 변환한다.
- **백엔드는 원래 API 그대로 쓴다.** 스크립트는 `ctx.gl`(WebGL2)을, `webgpu`일 때는 `ctx.device`와 `ctx.context`(WebGPU)를 직접 받는다. 기존의 자체 추상화(RendererInterface), 정규식 GLSL→WGSL 변환기, hybrid 모드는 버린다. LLM이 학습한 건 표준 API이고, 자체 래퍼는 유지 비용만 든다.
- `ctx`는 기존 API 중 실제로 쓰이는 부분을 유지한다: `time, dt, frame, mouse, resolution, uniforms, state, keys, utils.*`. TS 인터페이스(`scene/runtime/ctx.ts`)가 기준이다.

## 에이전트

- **게이트웨이:** 메시지 형식은 Anthropic식 content block 하나로 통일한다. 어댑터는 `anthropic`, `openai-compatible`(OpenAI, GLM, vLLM, Ollama)부터 만들고 Gemini는 다음에 붙인다.
- **도구:** `{ name, description, inputSchema, readOnly, run(input, env) }` 형태다. M1 도구는 `scene_read`, `scene_write`, `scene_edit`, `viewport_capture`, `viewport_status`다. M2에서 `history_list`, `history_restore`, `asset_list`, `asset_read`를 더했다.
- **루프:** 함수 하나로 만들고 서브에이전트에도 같은 함수를 쓴다. 최대 턴 수, 도구 부분집합, 중단 신호를 인자로 받는다.

## 키 보관

- **데스크톱:** API 키를 메인 프로세스에서 OS 키체인(Electron `safeStorage`)으로 암호화해 둔다. `app://siljangnim/api/llm/*` 요청에는 메인 프로세스가 키를 붙인다. **렌더러는 키를 보지 못한다.**
- Electron은 커스텀 프로토콜 요청에서 `Origin`을 지우므로, 포워더는 실행마다 새로 만드는 토큰(`x-siljangnim-token`)으로 앱 화면을 확인한다. 토큰은 IPC로 앱의 최상위 프레임에만 전달된다. 씬 문서는 CSP가 `app://`로의 연결 자체를 막는다.
- **웹:** 브라우저 저장소에 둔다. 웹 버전 이전 시 다시 검토한다.

## 레이아웃

- 노드 캔버스 대신 **도킹 레이아웃**을 쓴다: 가운데 뷰포트, 오른쪽 채팅, 아래에 컨트롤과 타임라인.
- 노드 그래프는 2단계 이후 *파이프라인*(에셋 → 도구 → 에셋)을 보여 주는 용도로 다시 도입한다. UI 창을 노드로 배치하는 방식은 쓰지 않는다.

## 기존 코드에서 가져오는 것

| 가져옴 (TS로 이식) | 버림 |
|---|---|
| shaderUtils, geometries, pingPong, textureUtils, uniformSetters, mat4/quat, orbitCamera, noise/glslSnippets, KeyframeManager, VideoFrameExtractor | GLEngine 본체, RendererInterface 계열, glslToWgsl, hybrid 모드 |
| 녹화 인코딩 로직(recorderStrategies), 에셋 분석(assetProcessor) | WebSocket/Python 백엔드 경로, JSZip, 사용되지 않는 컴포넌트 |
| 루프·에러 감지기, 메시지 정리·압축, 프롬프트 내용, 기법 지식 | agentEngine/agentExecutor, errorCollector, App.jsx 상태 구조 |
| 컨트롤 컴포넌트(슬라이더 등), jsonPatch | storage.js 구조 (저장소를 다시 설계) |

## 마일스톤

| | 내용 | 완료 기준 |
|---|---|---|
| **M1** ✅ | 격리된 씬 런타임(WebGL2), RPC, 에이전트 루프 + 씬 도구, 채팅, 유니폼 컨트롤, 프로젝트 저장, 데스크톱 키 보관 | 데스크톱에서 "파도 셰이더 만들어줘" → 에이전트가 씬을 쓰고 에러를 고치고 캡처로 확인. `npm run smoke`가 목 API로 이 흐름 전체를 매번 검증한다(실제 모델로는 아직 미검증). |
| M2 | WebGPU 백엔드, 에이전트 생성 패널, 에셋 업로드, 타임라인·키프레임, 버전 히스토리 ([m2.md](m2.md)) | 기존 주요 기능 대부분 |
| M3 | 녹화(MP4/WebM/PNG), 입력 매니저(오디오, 카메라, MIDI, MediaPipe), v1 프로젝트 가져오기 | 기존 기능 동등 → `frontend/` 은퇴, 웹 배포 전환 |
