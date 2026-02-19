# CTO: vis.js 역할 불일치 → NetworkX/백엔드 마이그레이션

vis.js가 **역할에 맞지 않게** 들고 있는 그래프·조회 로직을 백엔드(Neo4j + NetworkX)로 이전하는 방안.  
확장성·유지보수성·협업 코드·충돌 없이 적용.

---

## 1. 역할 불일치 정리 (vis.js가 가져가면 안 되는 로직)

| 위치 | 현재 로직 | 문제 (역할 이탈) |
|------|-----------|------------------|
| **app.js** | `graphData.nodes.slice(0, INITIAL_GRAPH_NODE_CAP)` | **노드 수 상한**을 클라이언트에서 적용. “어떤 노드를 줄지”는 데이터 계층 결정이어야 함. |
| **app.js** | `graphData.edges.filter(e => graphNodes.some(n => n.id === e.source) && ...)` | **엣지 일관성**을 클라이언트에서 유지. 서버가 “캡된 노드 집합 + 그 안의 엣지만” 반환하면 불필요. |
| **app.js** | `loadEgoGraph` 내 동일한 엣지 필터 (source/target in graphNodes) | ego API가 이미 일관된 서브그래프를 주면 중복. |
| **graph-manager.js** | `this.network.getConnectedNodes(nodeId)` / `getConnectedEdges(nodeId)` | **이웃 집합**을 vis 내부 그래프에서 계산. “누가 연결되었는지”는 백엔드가 정의하고 내려줘야 함. |
| **panel-manager.js** | API 실패 시 `graph.rawLinks`로 in/out·연결노드·지분 계산 | **데이터 소스 이중화**. 연결/주주/지분은 단일 소스(API)로 일원화하는 게 유지보수에 유리. |

**원칙**: vis.js = **렌더링·상호작용만** (그리기, 클릭/호버, 줌, 하이라이트 적용).  
그래프 **구조 결정**(노드 캡, 엣지 포함 여부, “이 노드의 이웃”)·**집계**(주주 수, 지분) = **백엔드(Neo4j/NetworkX)**.

---

## 2. 마이그레이션 방안 (충돌 없이)

### 2.1 노드 캡 + 엣지 일관성

- **백엔드**: `get_graph_data(..., node_cap=None)` 추가.  
  - `node_cap`이 있으면: `format_graph_data` 결과에서 노드 수를 `node_cap`까지 자르고, **그 노드 ID 집합에 양끝이 모두 포함된 엣지만** 반환.  
  - 단일 소스: “몇 개 노드까지 보여줄지”와 “그에 맞는 엣지”를 서버에서만 결정.
- **프론트**:  
  - `getGraphData(..., nodeCap)` 호출.  
  - 응답을 **그대로** `rawNodes`/`rawLinks`로 사용. **`slice(0, INITIAL_GRAPH_NODE_CAP)` 및 엣지 `filter` 제거.**  
- **호환**: `node_cap` 미전달 시 기존과 동일(노드 캡 없음). 클라이언트는 필요 시 상수로 `node_cap`만 넘기면 됨.

### 2.2 이웃 집합 (연결된 노드 ID)

- **백엔드**: 노드 상세 API 응답에 **`connected_node_ids: string[]`** 추가.  
  - 기존 `relationships`에서 “다른 끝 노드 ID”만 모아 중복 제거·self 제외한 목록.  
  - NetworkX 불필요(Neo4j 관계만으로 계산 가능). 나중에 “2홉 이웃” 등 확장 시 NetworkX/서버에서 계산해 같은 필드로 내려주면 됨.
- **프론트**:  
  - **하이라이트**: 노드 클릭 시 노드 상세 API로 `connected_node_ids` 수신 후, **해당 ID 목록으로** 이웃 하이라이트.  
  - `highlightNeighbors(nodeId, optionalConnectedIds)`: `optionalConnectedIds`가 있으면 그대로 사용, 없으면 기존처럼 `network.getConnectedNodes(nodeId)` fallback.  
  - “연결됨”의 정의는 **항상 API 응답**이 기준. vis 내부 그래프는 보조만.

### 2.3 노드 상세 (연결/주주/지분)

- **현재**: API 우선, 실패 시 `graph.rawLinks`로 in/out·연결노드·주주 수·지분 계산.
- **방향**: “연결 노드/주주 수/지분”은 **API 단일 소스**로 유지.  
  - API 실패 시: fallback은 “빈 값 또는 에러 상태”로만 두고, **rawLinks 기반 재계산은 제거하거나 최소한(오프라인 대비)으로만 유지**하고 문서화.  
  - 협업 시 “숫자/목록은 노드 상세 API만 신뢰”하도록 규칙 정리.

### 2.4 타입 필터 (회사/개인 등)

- **현재**: `graph-manager`에서 `rawNodes.filter(n => filters.has(n.type))`, `rawLinks`를 그에 맞게 필터.
- **판단**: “어떤 타입을 **보여줄지**”는 UI 상태이므로 **프론트 유지**가 적절.  
  - 데이터는 백엔드가 라벨/타입 정보를 담아 주고, 클라이언트는 “표시할 타입”만 선택.  
  - 이 부분은 **마이그레이션 대상 아님**. 유지보수성만 명시.

---

## 3. 적용 후 역할 분리

| 담당 | 역할 |
|------|------|
| **Neo4j + service** | 그래프 조회, 노드 캡, 엣지 일관성, 노드 상세(관계·주주 수·지분·connected_node_ids). |
| **NetworkX** | (선택) 이웃 확장(2홉, centrality 기반 이웃 등). 현재는 노드 상세만으로도 1홉 이웃 제공 가능. |
| **vis.js** | 데이터 수신 → 렌더링, 클릭/호버, 줌, **전달받은 ID 목록으로** 하이라이트. |
| **프론트 상태** | 타입 필터(표시할 노드/엣지), 선택 노드, API 응답 캐시. |

---

## 4. 확장·유지보수·협업

- **확장**: 노드 캡·이웃 정의 변경은 백엔드만 수정. “2홉 이웃”, “지분 5% 이상만” 등은 API/NetworkX에서 처리 후 `connected_node_ids` 또는 관계 목록으로 전달.
- **유지보수**: “그래프 구조/집계”는 한 곳(백엔드)에서만 관리. 프론트는 표시·이벤트만 담당.
- **협업**: 백엔드–프론트 계약은 “노드 캡 파라미터”, “노드 상세에 connected_node_ids”, “그래프 응답은 이미 캡·엣지 일관 적용”으로 문서화.

---

## 5. 관련 파일 (변경 요약)

| 구분 | 파일 | 변경 |
|------|------|------|
| 백엔드 | `service.py` | `get_graph_data(..., node_cap)` 추가; 캡 적용·엣지 필터. `get_node_detail` 응답에 `connected_node_ids` 추가. |
| 백엔드 | `main.py` | `GET /api/graph`, `GET /api/graph/analysis`에 `node_cap` 쿼리 파라미터 추가. |
| 프론트 | `app.js` | 노드 캡을 서버에 위임: `getGraphData(..., 0, INITIAL_GRAPH_NODE_CAP)`. 클라이언트는 응답을 그대로 사용(방어적 엣지 필터만 유지). |
| 프론트 | `api-client.js` | `getGraphData(..., nodeCap)` 인자 추가. |
| 프론트 | `graph-manager.js` | `highlightNeighbors(nodeId, optionalConnectedIds)`, `focusNode(nodeId, optionalConnectedIds)`. API ID 목록 있으면 그대로 사용. |
| 프론트 | `panel-manager.js` | 노드 상세 렌더 후 `nodeDetail.connected_node_ids`로 `graphManager.highlightNeighbors(node.id, ids)` 호출해 하이라이트 단일 소스화. |
| 문서 | `CTO_VIS_TO_NETWORKX_MIGRATION.md` | 역할 불일치·마이그레이션 방안·적용 내용 정리. |

**참고**: API 실패 시 `panel-manager`의 rawLinks 기반 fallback(연결 노드/주주 수)은 유지. “연결됨” 정의는 API 성공 시 `connected_node_ids`로 일원화.
