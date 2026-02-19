# CTO 검토: 그래프 선택과 사이드패널 연계 로직

그래프 DB·프론트 아키텍처 관점에서 **노드 선택 → 사이드패널 상세** 연동을 검토한다.  
확장성·유지보수성·협업 코드를 고려한다.

---

## 1. 현재 데이터 흐름 (선택의 단일 소스)

| 구간 | 설명 |
|------|------|
| **선택의 소스** | `stateManager.state.selectedNode` (단일 소스). `null` = 미선택. |
| **선택을 쓰는 주체** | GraphManager(vis 선택/하이라이트), PanelManager(상세 렌더·이고/챗 컨텍스트). |
| **선택을 바꾸는 경로** | (1) 그래프 노드 클릭 → `GraphManager.onNodeClick` → `focusNode` → `setState('selectedNode', node._raw)` (2) 캔버스 클릭 → `onCanvasClick` → `setState('selectedNode', null)` (3) 검색 결과 선택 → `App.selectSearchResult` → `focusNode(nodeId)` (4) 패널 "관련 노드" 클릭 → `focusNode(c.id)` (5) `loadData` 후: 선택 노드가 새 `rawNodes`에 없으면 `setState('selectedNode', null)`. |

협업·확장 측면에서 **선택 상태를 state 한 곳에서만 관리**하는 구조는 적절하다.  
새 기능(URL 동기화, 분석 툴 등)은 `selectedNode` 구독만 하면 된다.

---

## 2. 이슈 정리

### 2.1 그래프 재빌드 후 선택·패널 불일치 (버그)

- **원인**: `GraphManager.buildGraph()`가 기존 네트워크에 대해 `setData`만 하고, **선택(vis selection)과 하이라이트**는 초기화된 DataSet 때문에 사라진다. 반면 **state의 `selectedNode`는 갱신하지 않음**.
- **결과**:  
  - 필터 변경·이고 복귀·데이터 재로드 등으로 `buildGraph`가 호출되면, **그래프에는 선택/하이라이트가 없는데 패널에는 이전 노드 상세가 그대로** 남을 수 있음.  
  - 또는 선택 노드가 **현재 필터에 의해 제거된 경우**에도 state는 그대로라, **그래프에는 해당 노드가 없는데 패널만 그 노드를 표시**하는 상태가 됨.
- **영향**: 그래프 DB 뷰와 상세 패널이 서로 다른 “현재 노드”를 가리키는 것처럼 보여, 협업·QA 시 혼란과 버그 리포트로 이어질 수 있음.

### 2.2 상세 API 비동기 경쟁 (race)

- **원인**: `PanelManager.renderNodeDetail(node)`가 비동기(`getNodeDetail` 호출). 사용자가 A → B를 빠르게 클릭하면 **A·B에 대한 요청이 동시에 진행**되고, **완료 순서에 따라** 최종 선택은 B인데 패널에는 A 상세가 나올 수 있음.
- **완화**: 요청 취소(AbortController) 또는 “마지막 요청만 반영”하는 generation/token 패턴이 없음.

### 2.3 선택 갱신 경로 분산

- **쓰기**: GraphManager(클릭/캔버스), App(loadData 시 선택 해제).  
- **읽기**: PanelManager(구독 + loadEgoGraph/openChatWithContext에서 getState).  
- **협업**: “선택은 state만 보라”는 규칙이 문서화되어 있지 않으면, 새로 합류한 개발자가 그래프/패널에서 직접 참조를 넘기려 할 수 있음.

### 2.4 buildGraph 호출 중복 가능성

- 필터 변경 시 `loadData()` 내부에서 이미 `buildGraph`를 호출하는데, 필터 칩 핸들러에서 다시 `loadData()` 후 한 번 더 `buildGraph`를 호출하는 코드가 있으면, **같은 데이터로 buildGraph가 두 번** 돌 수 있음. (호출 경로 확인 후 불필요한 중복 제거 권장.)

---

## 3. 권장 사항 (확장성·유지보수·협업)

### 3.1 선택 동기화 규칙 (단일 소스 유지)

- **원칙**: “선택의 진실은 state뿐” — 그래프/패널은 state를 구독하거나, 갱신 시 state에만 쓴다.
- **buildGraph 직후**:  
  - 현재 **표시 중인 노드 ID 집합**(필터 적용 후 `fNodes`/`fIds`)에 `selectedNode.id`가 **있으면** → vis에 선택·하이라이트만 다시 적용(`selectNodes` + `highlightNeighbors`).  
  - **없으면** → `setState('selectedNode', null)`로 선택 해제.  
- 이렇게 하면 “그래프에 보이는 노드”와 “선택된 노드”가 항상 일치하고, 패널도 같은 state를 구독하므로 일치한다.

### 3.2 패널 상세 API race 완화 (선택 사항)

- `renderNodeDetail` 호출 시 **현재 요청용 토큰**을 두고, 응답 도착 시 **그 토큰이 “최신 선택”용인지** 검사한 뒤에만 DOM 갱신.  
- 또는 `getNodeDetail`에 AbortController를 넘겨, 새 선택이 생기면 이전 요청을 취소.  
- 우선순위는 **3.1 선택 동기화**가 높고, race는 부가적으로 적용해도 됨.

### 3.3 협업을 위한 계약 문서화

- **선택 상태**  
  - 쓰기: GraphManager(노드/캔버스 클릭), App(데이터 로드 후 선택 해제).  
  - 읽기: PanelManager, (향후) URL/공유 등.  
- **패널 액션**  
  - “이고 그래프”·“챗 컨텍스트”는 `stateManager.getState('selectedNode')`로만 노드를 가져오기.  
  - `window.app`/`window.graphManager`는 편의용 전역 노출일 뿐, **선택 변경은 반드시 state 경유**로 통일하면 예측 가능성이 높아진다.

### 3.4 그래프 DB 관점

- 노드 선택은 “현재 보고 있는 노드(상세·관계·이고 확장의 기준)”라는 **쿼리 컨텍스트**에 해당한다.  
- 이 컨텍스트를 state 한 곳에 두고, 재빌드 시 “현재 그래프에 존재하는지”로 유효성만 검사하면,  
  - 확장: 같은 state로 URL/북마크/공유 연동 가능  
  - 유지보수: 선택 관련 버그는 “state 갱신 vs 그래프/패널 반영” 두 축만 추적하면 됨  

---

## 4. 구현 체크리스트 (반영 시)

- [x] **GraphManager.buildGraph**  
  - 기존 네트워크 갱신 분기 마지막에 선택 동기화 추가: `fIds`에 선택 노드가 있으면 `selectNodes`+`highlightNeighbors` 재적용, 없으면 `setState('selectedNode', null)`.  
- [ ] (선택) **PanelManager.renderNodeDetail**  
  - 요청 시점의 `selectedNode.id`와 응답 처리 시점의 `stateManager.getState('selectedNode')?.id` 비교 후 불일치 시 렌더 스킵 또는 AbortController 도입.  
- [ ] (선택) 필터 변경 시 `buildGraph` 이중 호출 제거.  
- [ ] 이 문서를 “그래프 선택·사이드패널 연동” 계약 참고용으로 팀에 공유.

---

## 5. 요약

| 항목 | 평가 | 비고 |
|------|------|------|
| 단일 소스 (state) | ✅ 적절 | 선택은 state만 사용하면 됨. |
| buildGraph 후 동기화 | ✅ 반영됨 | 재빌드 시 선택·하이라이트 복원 또는 선택 해제. |
| 패널 비동기 race | ⚠️ 개선 여지 | 빠른 연속 클릭 시 잘못된 상세 노출 가능. |
| 협업·계약 | ⚠️ 문서화 권장 | 쓰기/읽기 경로와 “state 경유” 규칙 명시. |

**우선 조치**: buildGraph 직후 **선택 노드가 현재 표시 노드 집합에 있으면 vis 선택·하이라이트 재적용, 없으면 selectedNode null로 초기화**하는 동기화 로직을 넣는 것을 권장한다.
