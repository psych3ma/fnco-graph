# CTO 이슈 검토 (우선순위 높은 순)

확장성·유지보수성·협업 코드 관점. 우선순위: P0(즉시) > P1(단기) > P2(중기) > P3(개선).

---

## P0 — 보안·안정성 (즉시 검토)

### 1. Cypher 쿼리에서 `id_property` 사용자 입력 직접 삽입 ✅ 조치됨

- **위치**: `backend/database.py` — `get_node_by_id`, `get_node_relationships`, `get_ego_graph`에서 `WHERE n.{id_property} = $node_id` 형태로 사용.
- **문제**: API 쿼리 파라미터 `id_property`가 그대로 f-string에 들어가면 Cypher 삽입 가능.
- **조치**: `_ALLOWED_ID_PROPERTIES = frozenset(config.NODE_ID_PROPERTIES.values()) | {"id"}`, `_safe_id_property(id_property)` 도입. 세 메서드 진입 시 화이트리스트 검사 후 쿼리 생성. 비허용 값은 `"id"`로 치환.

---

### 2. `.env` 및 비밀값 관리

- **현황**: `.env`는 `.gitignore`에 포함되어 있어 커밋에는 올라가지 않음. 다만 저장소에 올라온 `.env` 예시나 문서에 실제 비밀값이 있으면 안 됨.
- **권장**: `.env.example` 추가(키만 있고 값은 빈칸 또는 placeholder). README/QUICK_START에 "`.env`는 로컬만 사용, 공유 금지" 명시. CI/배포에서는 환경 변수만 사용하고 `.env` 파일은 사용하지 않도록 정책 유지.

---

## P1 — 유지보수성·협업 (단기)

### 3. 백엔드·프론트엔드 스키마 상수 이중 정의

- **위치**: `backend/config.py` (NodeLabel, NodeProperty, RELATIONSHIP_TYPES 등) vs `frontend/webapp/js/config/constants.js` (NODE_LABELS, RELATIONSHIP_TYPES 등).
- **문제**: 라벨/속성 추가·변경 시 두 곳을 동시에 수정해야 하며, 불일치 시 버그 가능.
- **권장**: (1) API에서 노드/관계 타입·속성 목록을 한 번 내려주고 프론트는 그걸 우선 사용하거나, (2) 공유 스키마를 JSON/단일 소스로 두고 빌드 시 양쪽에 주입. 당장은 두 곳 변경 시 체크리스트에 "상수 동기화" 항목 추가.

---

### 4. 전역 `window.app` / `window.graphManager` 등에 의한 결합

- **위치**: `app.js`에서 `window.app`, `window.graphManager`, `window.panelManager`, `window.chatManager` 할당. HTML/다른 JS에서 `onclick="window.panelManager?.loadEgoGraph()"` 등으로 참조.
- **문제**: 테스트 시 모킹 필요, SSR/다른 엔트리와 공존 시 충돌 가능, 타입/리팩터 시 추적 어려움.
- **권장**: 단기에는 유지하되, 이벤트 바인딩을 가능한 한 JS 쪽 `addEventListener`로 옮기고, 필요한 최소만 `window`에 노출. 중기에는 이벤트 버스나 작은 컨텍스트로 교체 검토.

---

### 5. API 에러 시 응답 본문 이중 소비

- **위치**: `frontend/webapp/js/api-client.js` — `!response.ok`일 때 `await response.json()`로 Neo4j 오류 파싱 후 `await handleNetworkError(response)` 호출. `handleNetworkError` 내부에서 `response.text()` 호출.
- **문제**: 본문을 이미 `json()`으로 읽은 뒤 `text()`를 호출하면 빈 문자열 등이 나올 수 있음. 사용자에게 보여주는 에러 메시지가 불완전할 수 있음.
- **권장**: 본문은 한 번만 읽고, 그 결과를 Neo4j 처리와 일반 HTTP 에러 메시지 생성에 함께 사용. `handleNetworkError`는 `Response` 대신 이미 읽은 본문 문자열 또는 파싱된 객체를 받도록 변경 검토.

---

## P2 — 확장성·운영 (중기)

### 6. API 버전·호환 정책 부재

- **현황**: `/api/graph`, `/api/node/{id}` 등 경로만 있고 버전 접두사 없음.
- **권장**: 배포·다수 클라이언트 대응 시 `/api/v1/...` 도입 검토. 기존 클라이언트는 v1 유지, 신규 변경은 v2 또는 쿼리 파라미터로 옵션 부여.

---

### 7. 로깅·관찰성

- **현황**: `console.log`/`console.error` 및 Python `logging` 사용. 구조화 로그·요청 ID·지표 수집은 없음.
- **권장**: 백엔드에서는 요청별 correlation id, 에러 시 스택·컨텍스트 로그. 프론트에서는 개발 시에만 상세 로그, 프로덕션은 요약만. 필요 시 APM/에러 수집 도구 연동.

---

### 8. E2E/통합 테스트 안정성

- **현황**: `tests/e2e/`, Playwright 등 존재. 문서에 E2E 실패 이력(`CTO_REVIEW_E2E_TEST_FAILURES.md`) 있음.
- **권장**: 실패 원인(타이밍, 환경, 플레이크) 정리 후 재현 가능한 스위트로 정리. CI에서 안정적으로 돌리기 위해 대기·재시도 정책 명확히.

---

## P3 — 코드 품질·정리 (개선)

### 9. Deprecated 메서드 정리

- **위치**: `app.js` — `hideLoading()`에 `@deprecated` 표시.
- **권장**: 내부 호출을 `loadingManager.hide()`로 모두 교체한 뒤 `hideLoading` 제거.

---

### 10. escapeHtml 중복

- **위치**: `app.js`, `panel-manager.js`, `graph-manager.js`, `chat-manager.js`, `error-handler.js` 각각 `escapeHtml` 유사 구현.
- **권장**: `utils/escape.js` 또는 `error-handler.js`의 `escapeHtml` 하나로 통일하고 나머지는 import해서 사용. XSS 방지 일관성 확보.

---

## 조치 요약

| 우선순위 | 이슈 | 권장 조치 |
|----------|------|-----------|
| P0 | id_property Cypher 삽입 | DB/서비스 레이어에서 화이트리스트 검증 |
| P0 | .env/비밀값 | .env.example 추가, 문서에 정책 명시 |
| P1 | 스키마 이중 정의 | 동기화 체크리스트 또는 단일 소스 도입 |
| P1 | window 전역 결합 | 이벤트는 JS로, 최소만 window 노출 |
| P1 | 에러 본문 이중 소비 | 본문 1회 읽어서 공통 처리 |
| P2 | API 버전 | v1 접두사·호환 정책 검토 |
| P2 | 로깅/관찰성 | correlation id, 프로덕션 로그 정책 |
| P2 | E2E 안정성 | 플레이크 제거, CI 정리 |
| P3 | deprecated 제거 | hideLoading 제거 |
| P3 | escapeHtml 통일 | 단일 모듈로 통일 |

이 문서는 이슈 추적·스프린트 계획 시 우선순위 참고용으로 사용할 수 있다.
