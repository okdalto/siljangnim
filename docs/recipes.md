# 레시피 (4단계)

> 상태: 첫 구현 · 2026-10
> 설계: [architecture.md](architecture.md#4-레시피). 실행은 [runtime.md](runtime.md)의 런타임을 쓴다.

레시피는 "이 오픈소스를 이렇게 붙였더니 이 컴퓨터에서 동작했다"는 기록이다. md 파일 하나로, 사람이 읽을 수 있고 에이전트가 그대로 실행할 수 있다. 한 번 성공한 통합을 저장해 두면 다음 요청은 설치와 시행착오 없이 바로 실행된다.

```
~/Siljangnim/recipes/<id>/recipe.md      (SILJANGNIM_RECIPES_DIR로 바꿀 수 있음)
```

## 형식

```markdown
---
id: trimesh.torus-knot              # 소문자, 숫자, 점, 대시
version: 1                          # 코드나 패키지가 바뀌면 올라간다
title: Torus knot tube mesh (trimesh)
capability: mesh-generate torus knot   # recipe_search가 찾는 단어
tier: C                             # C = python, D = command
kind: python
packages: [numpy==2.5.4, scipy==1.14.1, trimesh==4.5.3]   # command면 program: ffmpeg
source: { name: trimesh, repo: https://github.com/mikedh/trimesh, license: MIT }
io: { outputs: [{ name: torus_knot.json, media: json }] }
verify: { params: { segments: 64 }, expect_outputs: [torus_knot.json] }
platforms:
  mac-arm64: { status: verified, tested: '2026-10-11', version: 1 }
status: verified
origin: local                       # recipe_save로 이 컴퓨터에서 쓴 것
updated: '2026-10-11'
---

# Torus knot tube mesh (trimesh)

## Setup
## Run        ← ```python 블록 하나(또는 command면 argv ```json 배열)
## Verify
## Notes      ← 겪은 문제(메모리, 가중치 라이선스, 빠진 의존성)
## Failures   ← broken이 될 때 남는 로그(최근 3개)
```

- 레시피 코드는 입력을 `in/`에서, 파라미터를 `in/params.json`에서(없으면 기본값) 읽고, 결과를 `out/`에 쓴다. 출력은 프로젝트 에셋이 된다.
- 형식을 읽고 쓰는 곳은 허브의 `recipes.py` 한 곳뿐이다. YAML은 `safe_load`로만 읽는다.

## 도구와 흐름

| 도구 | 하는 일 |
|---|---|
| `recipe_search` | capability나 단어로 찾는다. 이 플랫폼에서 verified인 것 → 최근 검증 순 |
| `recipe_read` | md 전체 |
| `recipe_save` | 구조화된 필드로 저장한다. 항상 **draft**로 저장되고, 코드나 패키지가 바뀌면 version이 올라가고 모든 플랫폼 상태가 draft로 돌아간다 |
| `recipe_verify` | verify params로 실행해 기대 출력이 모두 나오면 이 플랫폼에서 verified, 아니면 broken(로그를 남김) |
| `recipe_run` | params와 입력 에셋으로 실행한다 |

에이전트 흐름(프롬프트의 Working 0번):
1. 브라우저 밖 도구가 필요하면 먼저 `recipe_search`. verified가 있으면 `recipe_run`.
2. 없으면 `python_run`/`command_run`으로 붙인다. 성공하면 도구 결과가 "레시피로 저장하라"고 안내한다.
3. 끝내기 전에 `recipe_save` → `recipe_verify`

## 신뢰

| 레시피 | 실행 |
|---|---|
| 이 컴퓨터에서 저장(`origin: local`)했고 이 플랫폼에서 verified | 권한 카드 없이 실행한다(사람이 검증 때 이미 허용한 코드와 패키지) |
| draft, broken, 손으로 넣었거나 가져온 파일(`origin`이 local이 아님) | 일반 `python_run`과 같은 권한 확인을 거친다 |

- 코드가 바뀌면 다시 draft가 되므로, verified 상태는 그 코드 그대로에만 적용된다.
- 실행한 레시피는 `project.lock.json`의 `recipes`에 `id@version`으로 남는다.
- 승인 카드는 `wait_s`(기본 90초) 안에 답이 없으면 내려간다. 그때 도구는 "뷰어에서 승인을 기다리는 중, 아무것도 실행하지 않았다"를 돌려준다. 도구 호출이 아무도 보지 않는 카드에 붙잡혀 있지 않게 하려는 것이다.

## 검증

- **hub pytest:** md 왕복, 버전·상태 규칙, 검색 순위, command 레시피, 입력 검증, 가져온 파일의 origin, 엔드포인트, 시작 시 폴더를 만들지 않는지(테스트 7개)
- **studio vitest:** 레시피 도구(검색 표시, 신뢰 판정, verify 판정, 실행 중 처리), 신뢰 레시피는 권한 카드 없이 실행되고 params가 전달되며 lock이 기록되는지, 승인 대기 시간 초과
- **MCP smoke:** `recipe_save → recipe_verify → recipe_search → recipe_run`(새 params)
- **실제 에이전트 (2026-10-11, Claude Code, 같은 요청 "trimesh로 토러스 매듭을 만들어 회전시켜 줘"를 두 세션에서):**

| | 흐름 | 턴 | 비용 | 시간 |
|---|---|---|---|---|
| 1회차 | recipe_search(없음) → python_run ×2 → 씬 → recipe_save → recipe_verify(verified) | 10 | $0.40 | 100초 |
| 2회차 | recipe_search → recipe_read → **recipe_run**(권한 카드 없음) → 씬 | 10 | $0.31 | 51초 |

- 실검증 중 고친 것:
  - 처음에는 에이전트가 레시피를 저장하지 않았다. Working 0번과 성공 결과의 저장 안내를 넣어 해결했다.
  - 승인 카드가 도구 호출을 무한히 붙잡던 문제를 고쳤다(대기 시간 제한).
  - 브라우저가 같은 탭에서 fragment만 바꿔 새 브리지로 열면 페이지가 다시 로드되지 않아 이전 브리지에 붙어 있던 문제를 고쳤다(`hashchange`에서 새로고침).

## 남은 것

- 레시피 공유 레지스트리(GitHub 기반)와 가져오기는 6단계다.
- 같은 capability의 여러 레시피 중 라이선스 제약이 적은 것을 우선하는 규칙은 아직 없다.
