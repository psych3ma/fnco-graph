# Graph DB 전문가 관점: 노드상세 섹션 데이터 미표출/늦게 표출 검토

확장성·유지보수성·협업 코드를 고려한 원인 분석 및 권장 조치.

---

## 1. 데이터 흐름 (Neo4j → API → 프론트)

```
Neo4j (Cypher RETURN n, labels(n), id(n))
    → database.execute_query() → record.data() → { "n": Node, "node_labels": [], "internal_id": id }
    → service.get_node_detail() → node_data = get_node_by_id(), get_node_relationships()
    → API 응답: { "node": node_data, "relationships": [...], "maxStockRatioFromRels": number, "connected_node_ids": [...] }
    → 프론트 apiClient.getNodeDetail() → renderNodeDetail() → nodeProps(병합) → buildDetailHTML() → DOM
```

- **노드 한 건**: `get_node_by_id()`는 `RETURN n, labels(n) as node_labels, id(n) as internal_id` 한 행을 반환.  
  Neo4j Python 드라이버의 `record.data()`는 키 `n`, `node_labels`, `internal_id`를 가지며, **`n`은 Node 객체**.
- **직렬화**: FastAPI가 해당 dict를 JSON으로 반환할 때, 드라이버/환경에 따라 **Node가 `{ id, labels, properties }` 형태로 직렬화**될 수 있고, 실제 필드(최대주주 지분율, 주주 수 등)는 **`n.properties`** 에만 있는 경우가 많음.
- **프론트 단일 진입점**: 상세 표시는 `renderNodeDetail(node)` 한 곳에서만 이루어지며, **API 응답 도착 전까지**는 이전 상세 또는 빈 영역이 노출될 수 있음.

---

## 2. 미표출 원인 정리

| 원인 | 설명 | 대응 상태 |
|------|------|-----------|
| **경로 불일치** | 백엔드가 `node`를 `{ n: { id, labels, **properties** } }` 형태로 주는데, 프론트가 `nodeDetail.node` 또는 `nodeDetail.node.n`의 **최상위**만 참조해 `maxStockRatio`, `totalInvestmentCount` 등을 읽음 → `properties` 하위에 있어 undefined → `-` 표시 | ✅ `panel-manager.js`에서 `rawNode.properties`와 병합한 `nodeProps`로 읽도록 보강됨 |
| **직렬화 차이** | Neo4j/드라이버 버전·설정에 따라 Node 직렬화 결과가 다를 수 있음 (flat vs nested). 프론트만으로는 모든 케이스 커버 한계 | 권장: **백엔드에서 노드 상세 응답을 정규화**해 항상 동일 shape 보장 |
| **필드명 불일치** | DB/스키마는 `max_stock_ratio`, `total_investment_count` 등 snake_case인데 프론트는 camelCase 기대 | config/스키마 문서화; 필요 시 백엔드가 API 계약용 camelCase로 정규화 |
| **관계 기반 값** | 최대 지분율은 **관계(엣지)** 의 `stockRatio`/`pct`에서 계산. 노드 속성에 없으면 관계 기반 계산값(`maxStockRatioFromRels`) 사용 필요 | ✅ `maxStockRatioFromRels` fallback 적용됨 |

---

## 3. 늦게 표출 원인 정리

| 원인 | 설명 | 권장 |
|------|------|------|
| **API 지연** | `getNodeDetail()`이 완료될 때까지 패널 내용을 갱신하지 않음. 네트워크/백엔드 쿼리 지연 시 그동안 **이전 노드 상세 또는 빈 영역**이 보임 | **로딩 표시**: 선택 직후 상세 영역에 스켈레톤 또는 "불러오는 중…" 표시 후, 응답 도착 시 실제 HTML로 교체 |
| **비동기 race** | 사용자가 A → B를 빠르게 클릭하면 A·B에 대한 `getNodeDetail`이 동시에 나가고, **완료 순서에 따라** 최종 선택(B)인데 패널에 A 상세가 나올 수 있음 | **세대/토큰 검사**: 응답 처리 전 `selectedNode.id === 요청한 node.id` 확인 후 불일치 시 DOM 갱신 스킵 (또는 AbortController로 이전 요청 취소) |
| **로딩/플레이스홀더 부재** | 로딩 중임을 사용자에게 알리지 않아 "데이터가 안 나온다"로 인지될 수 있음 | 위 로딩 UI로 인지 개선 |

---

## 4. 확장성·유지보수성·협업 관점

### 4.1 확장성

- **노드/관계 스키마 변경 시**: 상세에 새 필드(예: 새 지표)를 넣을 때  
  - **백엔드**: `get_node_detail` 반환 구조에 필드 추가 후, **API 스펙(또는 OpenAPI 설명)** 에 필드 의미·타입 명시.  
  - **프론트**: `nodeProps`에서 읽는 키를 한 곳(예: 상수/설정)으로 모아 두면, 새 필드 추가 시 해당 맵만 수정하면 됨.
- **다중 라벨/타입**: Company / Person 등 타입별로 표시 필드가 다를 경우, `typeMeta`처럼 **타입별 표시 필드 목록**을 정의해 두고, `buildDetailHTML`에서는 그 목록 기반으로만 렌더하면 확장 시 혼선을 줄일 수 있음.

### 4.2 유지보수성

- **데이터 읽기 경로 단일화**:  
  - **선택지 A**: 백엔드가 노드 상세 응답 시 항상 `node: { id, labels, properties: { ... } }` 형태로 **정규화**해 반환. 프론트는 `node.properties`만 사용.  
  - **선택지 B**: 현재처럼 프론트에서 `rawNode.properties`와 `rawNode`를 병합해 `nodeProps` 생성.  
  - **권장**: 장기적으로는 **A**로 통일하고, API 문서에 "노드상세 데이터는 `node.properties` 단일 경로"라고 명시하면, 드라이버 직렬화 차이에 덜 흔들림.
- **에러/fallback**: API 실패 시 로컬(그래프) 데이터 fallback은 유지하되, "일부 값은 서버 조회 실패로 표시되지 않음" 같은 짧은 안내를 넣으면 디버깅/협업 시 유리함.

### 4.3 협업 코드

- **계약 문서화**:  
  - "노드상세 API 응답 구조"를 한 페이지(또는 OpenAPI)에 정리.  
  - `node`, `relationships`, `maxStockRatioFromRels`, `connected_node_ids` 의미와 타입, 그리고 **노드 속성은 `node.n.properties` 또는 정규화 시 `node.properties`에서 조회**라고 명시.
- **테스트**:  
  - 백엔드: `get_node_detail` 반환값에 `node`(및 내부 `properties`), `maxStockRatioFromRels` 포함 여부 단위 테스트.  
  - 프론트: mock API로 `node.n.properties`만 있는 응답, `node.properties`만 있는 응답 두 경우 모두 상세 값이 표시되는지 확인하면, 직렬화 형태 변경에 강해짐.

---

## 5. 권장 조치 요약

| 구분 | 조치 | 우선순위 |
|------|------|----------|
| **미표출** | (이미 적용) 프론트에서 `nodeDetail.node?.n` / `node` 에 대해 `properties` 병합 후 `nodeProps`로 표시 필드 읽기 | ✅ 적용됨 |
| **미표출** | 백엔드에서 노드 상세 응답 시 `node`를 `{ id, labels, properties: {...} }` 형태로 정규화해 반환하고, API 문서에 명시 | 권장 |
| **늦게 표출** | 노드 선택 직후 상세 영역에 **로딩 표시**(스켈레톤 또는 "불러오는 중…")를 넣고, API 응답 도착 시 실제 HTML로 교체 | ✅ 적용됨 (`panel-manager.js`: 로딩 HTML + `node-detail-loading`) |
| **늦게 표출 / race** | `renderNodeDetail`에서 API 응답 처리 전 **현재 선택 노드 id와 요청 노드 id 일치** 여부 확인, 불일치 시 DOM 갱신 스킵 (필요 시 AbortController 도입) | ✅ 적용됨 (`requestedNodeId` vs `selectedNode.id` 검사) |
| **협업** | 노드상세 API 응답 구조 및 `properties` 경로를 팀 문서/OpenAPI에 명시 | 권장 |

---

## 6. 관련 문서

- `CTO_NODE_DETAIL_AND_ACTIONS_ISSUES.md`: (2) DB 값 미표시, (6) renderNodeDetail 비동기 race 등 상세 이슈
- `CTO_GRAPH_SELECTION_SIDE_PANEL.md`: 패널 선택 동기화 및 상세 API race
- `QA_CHANGE_VERIFICATION_AND_ISSUES.md`: 이슈 #6 상세 API race 미해결 언급
