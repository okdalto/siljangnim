# project.md: 프로젝트 공유 (5단계)

> 상태: 구현·검증됨 · 2026-10-11. 설계는 [architecture.md](architecture.md#5-공유-프로젝트-md)에 있다.

프로젝트를 **문서 하나**로 공유한다. 사람이 읽을 수 있고, 다른 컴퓨터의 다른 에이전트가 그것만 보고 다시 만들 수 있어야 한다.

## 형식

```markdown
---
title: "Knot"
siljangnim: 2
exported: "2026-10-11"
backend: "webgl2"
recipes: ["trimesh.torus-knot@1"]
assets: [{"name":"torus_knot.json","kind":"text","bytes":1473512,"sha256":"…","source":"step 1","included":false}]
pipeline: [{"kind":"python","recipe":"trimesh.torus-knot@1","packages":[…],"resolved":[…],"inputs":[],"params":{…},"outputs":[…]}]
preview: "preview.png"
---
# Knot
## Intent            사람이 요청한 내용(내장 에이전트 대화에서; 외부 에이전트면 기록 없음)
## Usage conditions  가중치 라이선스가 있는 레시피를 썼을 때만
## Assets            이름, 종류, 크기, 출처(user-provided 또는 step N), 번들에 포함됐는지
## Pipeline          단계마다 패키지(설치된 정확한 버전), 입력, params, 출력, 코드
## Scene             백엔드, 입력, 컨트롤 요약 + 씬 JSON 전체
## Rebuilding        에이전트가 따라 할 순서
```

- 프런트 매터는 한 줄에 `키: <JSON>` 하나씩이다. 이 형식은 그대로 YAML이고, 별도 파서 없이 읽힌다.
- **코드:** 씬과 각 단계의 코드는 이 프로젝트에서 에이전트나 사람이 쓴 것이라 담는다. 레시피 단계도 레시피의 실행 코드(에이전트가 쓴 연결 코드)를 담는다. 그래서 레시피가 없는 컴퓨터에서도 같은 단계를 실행할 수 있다. 서드파티 코드는 담지 않는다. 패키지는 이름과 버전으로만 참조한다.
- 코드 블록 안에 ```가 있어도 깨지지 않게 펜스 길이를 늘린다.

## 파이프라인 기록

- 런타임 작업이 끝나면 `pipeline.json`에 단계를 남긴다(`session.ts`의 `recordPipeline`). 기록하는 것은 종류, 레시피 id@version, 패키지와 설치된 버전, 입력, params, 출력 에셋 이름, 레시피가 아닐 때의 코드다.
- **재실행:** 같은 파일을 다시 만드는 작업(다른 params, `recipe_verify` 뒤의 실제 실행)은 이전 단계 자리를 대신한다. 그래야 그 파일을 읽는 다음 단계보다 앞에 남는다. 그 출력은 이전 작업이 만든 에셋을 **덮어쓴다**(예전에는 `-2`가 붙은 사본이 쌓였다). 사람이 올린 파일과 이름이 겹치면 새 이름을 쓴다. 도구 결과에 무엇을 덮어썼는지와 씬을 다시 로드해야 새 내용이 보인다는 것을 알린다.
- `python_run`에 `params`가 생겼다(`in/params.json`). md의 단계를 레시피 없이 같은 params로 실행할 수 있게 하려는 것이다.

## 내보내기·가져오기

- **에이전트:** `project_export_md`는 md 텍스트를 돌려준다(번들 없이 md만). `project_import_md({ markdown })`는 새 프로젝트를 만들어 열고, 빠진 에셋과 다시 만드는 방법을 알려 준다.
- **사람:** 프로젝트 메뉴에서 쓴다.
  - **Export project (.zip):** `project.md`, `preview.png`(뷰포트 캡처), `code/`, `scene.json`, `assets/`, `recipes/<id>/recipe.md`를 담는다.
    `code/`는 사람이 읽고 편집기로 열어 보라고 넣는 사본이다: `setup.js`·`render.js`·`cleanup.js`, 그 안에서 찾은 셰이더(`code/shaders/<변수 이름>.glsl|wgsl`), 커스텀 패널(`panel.html`). 가져오기는 `project.md`만 보므로 이 파일들을 고쳐도 반영되지 않는다.
- **에셋 탭:** 위쪽 *Scene code*에 같은 파일 목록이 보이고, 누르면 줄 번호와 복사 버튼이 있는 읽기 전용 뷰어가 열린다(텍스트·SVG 에셋도 마찬가지, 텍스트로만 보여 주고 렌더링하지 않는다).
  아래 버튼은 데스크톱에서 **Show in Finder/Explorer**다. 번들과 같은 파일을 `~/Siljangnim/projects/<이름>-<id 앞 6자>/`(`SILJANGNIM_PROJECTS_DIR`)에 쓰고 폴더를 연다. 쓸 때마다 이전에 쓴 파일 목록(`.siljangnim-files.json`)으로 사라진 파일만 지우고, 사람이 넣은 파일은 남긴다. 경로 검사(`..`·절대 경로·역슬래시 거부)는 메인 프로세스(`desktop/src/projectFolder.js`)가 한다. 브라우저에서는 같은 버튼이 zip을 내려받는다(*Download folder*).
  - **Import project (project.md or .zip)…:** md만 받거나 번들을 받는다.
- **번들의 레시피**는 허브의 `POST /recipes/import`로 들어간다. 다른 컴퓨터에서 온 것이므로 `origin: imported`, 이 플랫폼은 `draft`로 저장하고, 실행할 때 사람에게 묻는다. 다른 플랫폼의 검증 기록은 정보로 남긴다. 같은 id의 로컬 레시피가 같거나 높은 버전이면 그대로 둔다.
- **가져온 뒤:** 내장 에이전트는 다음 요청에 `[Studio note]`로 빠진 에셋, 들어온 레시피, 가중치 라이선스를 듣는다. 외부 에이전트는 도구 결과로 같은 내용을 받는다. 알림은 채팅과 Activity 패널 양쪽에 보인다. 예전에는 채팅에만 있어서 MCP 모드에서 보이지 않았다.

## 검증

- **단위 테스트(studio):** 문서 왕복(씬, 에셋, 단계, 코드 안의 ```), 손으로 쓴 최소 문서, 가져오기 안내, 재실행 단계의 위치
- **hub pytest:** 다른 기계(win-x64)에서 verified였던 레시피를 mac에서 가져오면 imported/draft가 되고 원래 기록은 남는지, 로컬 레시피가 우선하는지
- **MCP smoke:** `project_export_md` 형식을 확인한다. 뷰어에서 사람이 하듯 메뉴로 번들을 내려받는다. 레시피 파일을 지워 "다른 컴퓨터"를 흉내 낸 뒤 번들을 가져와, 에셋과 레시피(imported, draft)가 들어오는지 본다. md만 가져왔을 때는 빠진 생성 에셋을 단계 번호와 함께 안내하는지 확인한다.
- **실제 에이전트(완료 기준):**
  - 기계 A(스크립트): trimesh 레시피 저장 → 검증 → (3,5) 매듭 params로 실행 → 씬 작성 → md 내보내기
  - 기계 B: 빈 레시피 폴더, 새 뷰어 프로필에서 **Claude Code에 md 텍스트만** 줬다.
  - B의 순서: `project_import_md` → `recipe_search`(없음) → md의 코드를 같은 패키지와 params로 `python_run` → `scene_write` → 캡처
  - 같은 매듭과 컨트롤이 나왔다. 94초, 10턴, $0.40이 들었다.
