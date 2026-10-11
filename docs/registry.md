# 레시피 공유 레지스트리 (6단계)

> 상태: 구현됨 · 2026-10-11. 레시피 형식은 [recipes.md](recipes.md)에 있다.

다른 사람이 검증한 레시피를 받아 쓰는 곳이다. GitHub 저장소의 정적 파일이고, 기여는 PR로 한다.

```
registry/index.json                       id, version, 제목, capability, kind, 라이선스,
                                          verified_on(검증된 플랫폼), 경로, sha256
registry/recipes/<id>/recipe.md           레시피 파일 그대로
```

- **주소:** 기본값은 `https://raw.githubusercontent.com/okdalto/siljangnim/main/registry`이다. 이 브랜치가 main에 합쳐지면 열린다. `SILJANGNIM_REGISTRY_URL`로 바꿀 수 있고, 로컬 폴더 경로도 받는다. http는 거부하고 https만 받는다.
- **에이전트:**
  - `recipe_search`가 이 컴퓨터의 레시피 뒤에 "shared registry, not on this machine"으로 레지스트리 결과를 붙인다. 이 컴퓨터에 없거나 더 새 버전인 것만 보여 준다.
  - 레지스트리에 닿지 않으면 그 사실만 한 줄로 알리고 로컬 결과는 그대로 준다.
  - `recipe_install(id)`로 받는다.
- **신뢰 모델:**
  - 받은 파일의 sha256이 인덱스 항목과 다르면 설치하지 않는다.
  - 설치한 레시피는 `origin: imported`, 이 플랫폼에서 `draft`다(project.md 번들로 들어온 레시피와 같다). `recipe_verify`로 이 컴퓨터에서 검증하고, 코드가 처음 실행될 때 사람에게 묻는다. 기여자가 검증한 플랫폼은 정보로만 남는다.
  - 같은 id의 로컬 레시피가 같거나 높은 버전이면 그대로 둔다.
  - 서명은 아직 없다. GitHub 저장소의 리뷰(PR)와 HTTPS, 그리고 위의 로컬 검증·승인에 기댄다. 서명과 검증 결과 집계는 열린 질문으로 남긴다.
- **기여:** 레시피 파일 `~/Siljangnim/recipes/<id>/recipe.md`를 `registry/recipes/<id>/`에 복사하고 `python -m siljangnim_hub.registry build ../registry`를 `hub/`에서 실행해 index를 다시 만든 뒤 PR을 보낸다. hub 테스트가 index가 최신인지 확인한다.
  - 레시피에는 에이전트가 쓴 연결 코드만 들어간다. 서드파티 코드는 패키지 이름과 버전으로만 참조한다.
- **처음 항목:** `trimesh.torus-knot`(mac-arm64에서 검증, 예제 torus-knot이 쓰는 것)
- **검증:**
  - hub pytest: index 생성(verified_on, sha256), 검색, 설치(imported·draft), 변조된 파일 거부, http 거부, 엔드포인트, 저장소 index 최신 여부
  - studio 테스트: 검색에 레지스트리 결과 추가(로컬에 있는 같은 버전은 제외), 설치, 레지스트리에 닿지 않을 때
  - MCP smoke: 저장소의 `registry/`를 레지스트리로 써서 `recipe_search`, `recipe_install`, 파일 확인
