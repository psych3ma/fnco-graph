# CTO 검토: 노드 상세·버튼·선택 동작 이슈 (원인 분석 및 로직)

유지보수성·확장성·협업 코드를 고려한 원인 분석 및 권장 수정 방향.

---

## (1) 노드 선택 시 화면이 잠깐 멈추는 증상

### 원인
- **동기 부하**: 노드 클릭 → `focusNode()` → `selectNodes` + **`highlightNeighbors()`** + `setState('selectedNode')` + `requestAnimationFrame(runFocus)`.
- `highlightNeighbors()`가 **vis 노드/엣지 전체**에 대해 `visNodes.get().forEach` / `visEdges.get().forEach`로 한 번에 여러 번 `update()` 호출. 노드·엣지 수가 많을수록 메인 스레드가 길게 블로킹됨.
- 그 직후 `setState`로 패널 구독이 실행되며 `renderNodeDetail()`이 호출되고, API 요청 전까지의 동기 작업까지 같은 틱에서 처리됨.

### 권장
- **하이라이트를 다음 프레임으로 분리**: `setState`로 선택만 먼저 반영한 뒤, `requestAnimationFrame`(또는 `setTimeout(0)`) 안에서 `highlightNeighbors()` 및 `runFocus()` 실행. 사용자에게는 “선택 반영”이 먼저 보이고, 무거운 vis 업데이트는 다음 프레임으로 밀려 멈춤이 완화됨.
- 확장 시: 노드 수가 매우 많을 때는 하이라이트 대상을 배치로 나누거나, “연결된 노드만” 업데이트하도록 최적화 가능.

---

## (2) 노드 상세에 그래프 DB 조회값이 안 나오는 이슈 (최대주주 지분율·주주 수 `-`)

### 원인
- 백엔드 `/api/node/{id}`는 Neo4j 조회 결과를 그대로 반환. Neo4j 드라이버가 노드를 직렬화하면 **`node`가 `{ id, labels, properties }` 형태**가 되어, 실제 필드는 `node.properties.maxStockRatio`, `node.properties.totalInvestmentCount` 등에 있음.
- 프론트는 `nodeDetail.node?.n || nodeDetail.node`만 쓰고, **`n.properties`를 보지 않음**. 그래서 `nodeProps.maxStockRatio`, `nodeProps.totalInvestmentCount`가 항상 undefined → `-`로 표시됨.
- 백엔드는 관계 기반으로 `maxStockRatioFromRels`를 계산해 주지만, 노드 자체 속성은 `n.properties` 경로에 있으므로 프론트에서 두 소스 모두 사용할 수 있도록 읽는 경로를 맞춰야 함.

### 권장
- **노드 속성 읽기 단일화**: `nodeProps = nodeDetail.node?.n || nodeDetail.node || {}` 후, `maxStockRatio` / `totalInvestmentCount` 등은 **`nodeProps.properties?.maxStockRatio ?? nodeProps.maxStockRatio`** 처럼 `properties` 하위를 우선 조회. (다른 필드도 동일 패턴 적용.)
- 최대주주 지분율은 기존대로 `maxStockRatioFromRels` fallback 유지. 이렇게 하면 DB에 있는 노드 속성과 관계 기반 계산값이 모두 상세 패널에 표시됨.

---

## (3) 연결 노드에 같은 이름이 중복되어 나오는 이슈

### 원인
- `connectedNodes`를 **관계(relationship) 단위**로만 구성: `outLinks.map(r => ({ id, pct, displayName }))` + `inLinks.map(...)` 후 self만 제거. 같은 노드(예: 동일 인물)에 대한 관계가 여러 개면 **동일 id·displayName이 여러 행**으로 들어감.
- API는 “관계 목록”을 주므로, 노드 기준으로 합치지 않으면 화면에 중복 표시됨.

### 권장
- **노드 id 기준 디듀프**: `connectedNodes` 배열을 만든 뒤, **id 기준으로 한 번만 남기기** (예: 첫 번째만 유지하거나, 같은 id면 지분율은 max로 합치기). 그 다음 정렬·자르기·렌더. 이렇게 하면 “연결 노드 (49)”처럼 관계 수는 그대로 두고, **표시되는 행은 노드 단위로만** 나와 중복 이름이 사라짐.
- 협업/확장: “연결 노드 수”를 관계 수로 둘지 노드 수로 둘지 정책을 문서에 한 줄로 적어 두면 유지보수에 유리함.

---

## (4) ‘맵 보기’ 버튼이 동작하지 않는 이슈

### 원인 (가능성)
- 버튼은 `onclick="window.panelManager?.loadEgoGraph()"` 로만 호출. `loadEgoGraph()` 내부에서 `stateManager.getState('selectedNode')`로 노드를 가져옴.
- 가능 원인: (a) **초기화 순서**로 인해 클릭 시점에 `window.panelManager`가 아직 없음, (b) **선택이 풀린 상태**에서 버튼을 눌러 `selectedNode`가 null, (c) **API 실패** 시 `console.warn`만 하고 사용자 피드백이 없어 “동작 안 함”으로 보임.

### 권장
- **방어 코드**: `loadEgoGraph()` 진입 시 `selectedNode`가 없으면 스크린 리더 안내 + 짧은 토스트로 “노드를 먼저 선택해 주세요” 표시 (이미 있을 수 있음 → 유지).
- **실패 시 피드백**: `app.loadEgoGraph(node)`가 throw하거나 실패하면 catch에서 **사용자용 토스트/메시지**로 “지배구조 맵을 불러오지 못했습니다” 등 표시. `console.warn`만 있으면 협업/QA에서 원인 파악이 어려움.
- **전역 참조**: `window.app` / `window.panelManager`는 `app.init()` 끝에서 할당되는지 확인. 스크립트 로드 순서나 초기화 실패 시 할당이 스킵되지 않도록 보장.

---

## (5) ‘AI에게 질문하기’ 버튼이 동작하지 않는 이슈

### 원인 (가능성)
- `onclick="window.panelManager?.openChatWithContext()"` 로 호출. 내부에서 `selectedNode`로 컨텍스트 설정 후 `stateManager.setState('ui.activeTab', 'chat')` + `switchTab('chat')` 호출.
- 가능 원인: (a) **탭 전환 미반영**: `switchTab('chat')`에서 `chatTabBody`에 `active` 클래스를 넣고, CSS `.chat-section.active { display: flex }`로 보이게 하는데, 부모/형제 스타일이나 `display` 덮어쓰기로 인해 실제로는 숨겨져 있을 수 있음, (b) **selectedNode가 null**, (c) **panelManager 미할당**.

### 권장
- **탭 표시 보장**: `switchTab('chat')` 시 `chatBody.style.display = 'flex'`(또는 `''`)를 명시하고, `detailBody.style.display = 'none'`으로 상세 탭 숨김. 클래스만으로 제어할 경우 다른 CSS가 덮어쓸 수 있으므로, 중요한 전환 시에는 `display`를 직접 설정해 두면 안정적.
- **방어 코드**: `openChatWithContext()`에서 `selectedNode`가 없으면 안내 메시지 또는 토스트.
- **전역 참조**: (4)와 동일하게 `window.panelManager` / `window.chatManager` 초기화 시점과 실패 시 할당 여부 확인.

---

## 구현 체크리스트 (반영 시)

| # | 항목 | 조치 | 상태 |
|---|------|------|------|
| 1 | 선택 시 멈춤 | `focusNode`에서 `setState` 후 `requestAnimationFrame` 안에서 `highlightNeighbors` + `runFocus` 실행. | 반영됨 |
| 2 | DB 값 미표시 | 노드 속성 읽기 시 `nodeProps.properties` 병합 및 `extractNodeIdFromRecord`/표시명에서 `properties` 경로 지원. | 반영됨 |
| 3 | 연결 노드 중복 | `dedupeConnectedNodes()`로 id 기준 디듀프, 지분율은 max 유지. `getDisplayNameFromRecord()`로 API 표시명 추출. | 반영됨 |
| 4 | 맵 보기 | `loadEgoGraph` 실패 시 `showErrorToast`; 선택 없을 때 스크린 리더 안내. | 반영됨 |
| 5 | AI 질문 | `switchTab('chat')` 시 `chatBody.style.display = 'flex'` 명시; 선택 없을 때 `announceToScreenReader` 안내. | 반영됨 |

---

## 요약

| 이슈 | 원인 요약 | 방향 |
|------|-----------|------|
| (1) 선택 시 멈춤 | 하이라이트가 동기로 전체 노드/엣지 업데이트 | 하이라이트를 rAF로 분리 |
| (2) DB 값 미표시 | 노드가 `n.properties` 하위에 있는데 프론트가 최상위만 참조 | `properties` 경로 보강 |
| (3) 연결 노드 중복 | 관계 단위로만 리스트 구성 | id 기준 디듀프 |
| (4) 맵 보기 | 실패 시 피드백 없음·전역 참조/선택 상태 | 토스트·초기화·방어 코드 |
| (5) AI 질문 | 탭 표시·선택 상태·전역 참조 | display 명시·방어 코드 |
