# 그래프 노드 선택 → 노드상세 → AI 질문: 기능 QA 및 사이드이펙트 분석

CTO 관점 (확장성/유지보수성/협업 코드 고려).

---

## 1. 사용자 플로우 및 데이터 흐름

```
[그래프 노드 클릭]
       │
       ▼
  GraphManager.onNodeClick(nodeId, rawNode)
       │
       ├─► focusNode(nodeId)  ──► selectNodes, highlightNeighbors, moveTo, setState('selectedNode', node._raw)
       │
       ▼
  StateManager.setState('selectedNode', rawNode)
       │
       ▼
  PanelManager (subscribe 'selectedNode')  ──► renderNodeDetail(node)
       │
       ├─► getNodeDetail(node.id, idProp)  [API]
       ├─► buildDetailHTML(...)  [로컬 rawLinks fallback 시 graph.rawLinks 의존]
       └─► bindDetailEvents(node.id)
       │
[사용자: 노드상세에서 "AI에게 질문하기" 클릭]
       │
       ▼
  PanelManager.openChatWithContext()
       │
       ├─► setState('ui.activeTab', 'chat')
       ├─► setState('chat.context', { node_id: node.id, ...node })
       ├─► switchTab('chat'), focus(chatInput)
       ▼
  ChatManager (subscribe 'chat.context')  ──► updateContextBar(context)
       │
[사용자: 메시지 입력 후 전송]
       │
       ▼
  ChatManager.sendChat()  ──► simulateAIReply(question)
       │
       └─► getState('chat.context')  ──► apiClient.sendChatMessage(question, { node_id: context.id })
```

---

## 2. 상태 의존성 요약

| 상태 키 | 설정 위치 | 구독/사용 위치 | 비고 |
|--------|-----------|----------------|------|
| `selectedNode` | graph-manager (onNodeClick/focusNode, onCanvasClick), panel 연결노드 클릭 시 focusNode | panel-manager (renderNodeDetail), openChatWithContext, loadEgoGraph | null이면 빈 패널 |
| `graph.rawNodes` / `graph.rawLinks` | app.loadData, app.loadEgoGraph | panel-manager (로컬 fallback, 연결노드 displayName), graph-manager buildGraph | 필터/로드 후 갱신됨 |
| `ui.activeTab` | panel-manager openChatWithContext, app switchPanelTab | panel-manager switchTab | 'detail' \| 'chat' |
| `chat.context` | panel-manager openChatWithContext, chat-manager resetChat/clearChatContext | chat-manager updateContextBar, simulateAIReply | { node_id, id, ...node } |
| `filters` | app (필터 칩 클릭) | app loadData, graph-manager buildGraph | selectedNode는 필터 변경 시 미갱신 |

---

## 3. 기능 QA 체크리스트 (사용자 시나리오)

### 3.1 노드 선택

- [ ] **그래프에서 노드 클릭** → 해당 노드가 확대·중앙 이동하고, 이웃 하이라이트, 노드상세 패널에 상세 표시.
- [ ] **같은 노드 재클릭** → 상세 유지, 뷰만 다시 포커스.
- [ ] **다른 노드 클릭** → 상세가 새 노드로 교체, 뷰 포커스 이동.
- [ ] **캔버스(빈 공간) 클릭** → 선택 해제, 하이라이트 리셋, 노드상세 빈 상태 문구 표시.
- [ ] **검색 결과에서 노드 선택** → focusNode 호출로 그래프 포커스 + 노드상세 표시.

### 3.2 노드상세

- [ ] **API 성공** → 최대주주 지분율·주주 수·연결 노드 등 API 기반 표시.
- [ ] **API 실패(네트워크/404)** → 로컬 fallback: `graph.rawLinks`/`graph.rawNodes` 기반 연결 노드·지분율·주주 수.
- [ ] **연결 노드 "더보기"** → 접기/펼치기, 스크린리더·aria-expanded 일치.
- [ ] **연결 노드 항목 클릭** → focusNode(해당 id) 호출 → 그래프 포커스 + **selectedNode가 해당 노드로 변경** → 노드상세가 클릭한 연결 노드로 전환.
- [ ] **"지배구조 맵 보기"** → 선택 노드 없으면 "노드를 먼저 선택해주세요" 안내; 있으면 ego API 호출 후 그래프만 해당 노드 중심으로 교체, 배너 표시.
- [ ] **"전체 그래프로 돌아가기"** → loadData()로 전체 복원, 배너 숨김.

### 3.3 AI 질문

- [ ] **"AI에게 질문하기" 클릭** → AI 질문 탭으로 전환, 컨텍스트 바에 노드 ID 표시, 채팅 입력창 포커스.
- [ ] **메시지 전송** → `chat.context`의 `node_id`가 API에 전달되는지 확인 (백엔드 로그/응답으로 검증).
- [ ] **컨텍스트 있는 상태에서 채팅** → 제안 질문/직접 입력 모두 동일 동작.
- [ ] **채팅 초기화/컨텍스트 제거** → ctxBar 숨김, context null.

### 3.4 엣지 케이스

- [ ] **노드 선택 후 필터 변경** (예: 개인주주 해제) → 그래프에서 해당 노드 사라질 수 있음. **현재: 노드상세는 그대로 표시, selectedNode 유지.** (아래 사이드이펙트 참고)
- [ ] **노드 선택 후 "지배구조 맵" 로드** → 그래프만 ego로 교체, selectedNode는 그대로. 상세 패널은 기존 노드 유지.
- [ ] **채팅 탭에서 다른 탭으로 이동 후 다시 AI 질문** → 컨텍스트 유지 여부: 유지됨(상태만 사용).
- [ ] **빠르게 여러 노드 연속 클릭** → 마지막 클릭 노드로 selectedNode 및 상세 갱신, focusNode 애니메이션은 마지막만 적용되는 것이 기대 동작.

---

## 4. 사이드이펙트 분석

### 4.1 필터/전체 그래프 재로드 시

- **현상**: `loadData()` 또는 필터 변경으로 `rawNodes`/`rawLinks`가 바뀌어도 `selectedNode`는 갱신되지 않음.
- **영향**: 선택한 노드가 새 그래프에 없을 수 있음(필터로 제외된 경우). 이때 노드상세는 이전 노드 그대로 표시되나, 그래프에는 해당 노드가 없어 **선택 노드와 시각적 불일치** 가능.
- **권장**: `loadData()` 또는 `buildGraph()` 후, `selectedNode`가 현재 `rawNodes`에 존재하는지 검사하고 없으면 `setState('selectedNode', null)` 호출. (협업: app.js 또는 graph-manager에서 한 곳만 처리하면 됨.)

### 4.2 이고 그래프 진입/복귀 시

- **진입**: `loadEgoGraph()`는 `selectedNode`로 API 호출 후 그래프만 교체. `selectedNode`는 그대로이므로 노드상세는 유지. 기대 동작.
- **복귀**: `exitEgoGraph()` → `loadData()` 호출. 위 4.1과 동일하게, 복귀 후 그래프에 선택 노드가 없을 수 있음. 동일 권장 적용.

### 4.3 노드상세 로컬 fallback

- **의존**: `renderNodeDetail`의 로컬 경로가 `stateManager.getState('graph.rawLinks')`에 의존.
- **영향**: ego 모드에서 그래프를 ego로 바꾼 직후, 같은 노드를 다시 클릭하지 않고 상세만 보는 경우 이미 ego 기반 `rawLinks`가 반영됨. 전체 복원 후에는 전체 `rawLinks` 기준. 의도된 동작.

### 4.4 채팅 컨텍스트와 선택 노드

- **관계**: `openChatWithContext()`는 `selectedNode`를 읽어 `chat.context`에 `node_id` 포함해 설정. 이후 전송 시 `context.id`로 API에 전달.
- **영향**: 채팅 중에 다른 노드를 선택해도 `chat.context`는 그대로. **의도**: "이 노드에 대해 질문하기" 시점의 노드가 유지됨. 컨텍스트 초기화는 사용자가 별도 동작으로 수행.

### 4.5 탭 전환과 UI 동기화

- **openChatWithContext**에서 `setState('ui.activeTab', 'chat')`와 `switchTab('chat')`를 둘 다 호출. 구독자도 `switchTab`을 호출하므로 중복이지만 결과는 동일. 유지보수: 한 경로(상태 구독)로만 전환 처리해도 됨.

---

## 5. 코드 변경 시 주의점 (협업용)

- **selectedNode를 바꾸는 곳**: `graph-manager` (focusNode, onCanvasClick). 여기만 바꾸면 패널·AI 질문 진입 동작이 연동됨.
- **노드상세 표시**: `panel-manager.renderNodeDetail`. API 실패 시 `graph.rawLinks`/`graph.rawNodes` 사용하므로, 이 상태를 바꾸는 `loadData`/`loadEgoGraph` 변경 시 상세 fallback 결과에 영향.
- **AI 질문 컨텍스트**: `chat.context` 구조(`node_id`, `id` 등)를 바꾸면 `chat-manager.simulateAIReply`의 `context.id` 및 백엔드 전달 형식과 맞출 것.
- **새 상태 키 추가 시**: `state-manager.js` 초기값 및 `reset()`에 동일 키 반영해 일관성 유지.

---

## 6. 요약

| 구간 | 정상 시나리오 | 주의할 사이드이펙트 |
|------|----------------|----------------------|
| 노드 선택 → 상세 | 클릭 시 포커스 + 상세 표시, 캔버스 클릭 시 해제 | 필터/로드 후 선택 노드가 그래프에 없을 수 있음 → 선택 해제 권장 |
| 상세 → AI 질문 | 탭 전환 + 컨텍스트 설정 + 포커스, 전송 시 node_id 전달 | 컨텍스트는 "질문하기" 클릭 시점 노드 유지 |
| 지배구조 맵 | 선택 노드 기준 ego 로드/복귀 | 복귀 후 selectedNode가 새 그래프에 없을 수 있음 |

기능 QA는 위 체크리스트 기준으로 진행한다.

**구현 반영**: `app.loadData()` 내에서 `graph.rawNodes`/`rawLinks` 갱신 직후, `selectedNode`가 새 `rawNodes`에 없으면 `setState('selectedNode', null)` 호출하도록 적용됨. 필터 변경·전체 복원(exitEgoGraph) 시 선택/상세 불일치가 방지된다.
