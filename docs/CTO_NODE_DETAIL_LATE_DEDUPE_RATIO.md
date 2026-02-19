# CTO 검토: 노드 상세 늦게 뜸 / 연결노드 중복 / 보유비율 미표시

백엔드·프론트엔드·NetworkX 관점 원인 및 조치 요약.

---

## (1) 노드 클릭하고 한참 후에 뜨는 이슈

### 원인
- **백엔드**: `get_node_detail()` → `get_node_by_id()` + `get_node_relationships(limit=50)`. Neo4j 왕복 및 관계 수에 따라 지연 발생.
- **프론트엔드**: `renderNodeDetail()`이 `await apiClient.getNodeDetail()` 후에만 DOM 갱신. 그 전에는 "노드 정보를 불러오는 중…" 표시(이미 적용됨). 네트워크/서버 지연이 그대로 체감 지연으로 이어짐.
- **Race**: 빠르게 A→B 클릭 시 B 선택인데 A 응답이 나중에 오면 패널에 A가 뜨는 문제는 `requestedNodeId` 검사로 차단됨(이미 적용).

### 조치(적용·권장)
| 구분 | 내용 |
|------|------|
| 적용됨 | 로딩 문구("노드 정보를 불러오는 중…") 표시, race 시 DOM 갱신 스킵 |
| 권장 | 백엔드: `get_node_relationships` limit 50 유지, 필요 시 Neo4j 인덱스(bizno/personId, 관계 타입) 점검 |
| 권장 | 프론트: 노드 호버 시 해당 노드 상세 prefetch(선택)로 체감 속도 개선 |

**NetworkX**: 노드 상세/연결 목록은 Neo4j 직결 API에서 제공. NetworkX는 분석(추천 노드 등)용으로만 사용되며, 이 이슈와는 무관.

---

## (2) 연결노드 중복건 발생하는 이슈

### 원인
- **백엔드**: `get_node_relationships`는 관계(엣지) 단위로 행을 반환. 같은 주주(동일 인물)가 여러 관계로 나오면 **동일 노드가 여러 행**으로 전달됨.
- **프론트엔드**: 디듀프가 **id 기준**만 있었음. Neo4j/직렬화 차이로 같은 인물이 `personId` 한 번, `stockName`만 한 번 등 **서로 다른 id**로 넘어오면 id 기준 디듀프만으로는 합쳐지지 않아 **같은 이름이 여러 행**으로 보임.

### 조치(적용)
- **프론트 `dedupeConnectedNodes()`**  
  - 1차: id 우선, id 없거나 `'unknown'`이면 `displayName`으로 키 생성해 병합.  
  - 2차: **동일 displayName**인 행은 id가 달라도 **한 행으로 병합**, 지분율은 max 유지.  
- **백엔드**: 관계 레코드의 `n`/`m`에 일관된 식별자(bizno/personId) 포함되도록 유지(이미 `extract_node_id` 등에서 처리). 스키마에 맞게 ID 필드 채워지면 프론트 1차 디듀프만으로도 대부분 해소.

---

## (3) 연결노드 주주 이름 옆에 보유비율 표출안됨 이슈

### 원인
- **백엔드**: Neo4j 관계 속성이 **snake_case**(`stock_ratio`)일 수 있는데, API는 **camelCase**(`stockRatio`, `pct`)만 세팅하고 있어 프론트에서 값을 못 읽는 경우 발생.
- **프론트엔드**: `relPct(rec)`에서 `r.properties.stockRatio` / `r.properties.pct` 위주로 읽고, `stock_ratio` 또는 숫자 검사 누락 시 `null`이 되어 `c.pct == null`이라 **ri-val(보유비율)이 렌더되지 않음**.

### 조치(적용)
- **백엔드 `_relationship_to_serializable()`**  
  - `rel_props`에 `stock_ratio`가 있으면 `stockRatio`에 매핑.  
  - 기존대로 `stockRatio` → `pct` 별칭 유지.  
- **프론트 `relPct()`**  
  - `r.properties.stock_ratio` 숫자 처리 추가.  
  - `stockRatio` / `pct` / `stock_ratio`를 명시적으로 순서대로 읽고, 숫자만 반환하도록 정리.

**NetworkX**: 엣지 weight는 `graph_analysis` 등에서 `stockRatio`/`pct` 사용. 상세 패널의 “연결 노드 + 보유비율”은 Neo4j 관계 속성만 사용하므로, 위 백/프론트 수정으로 해결 대상.

---

## 관련 파일

| 구분 | 파일 | 변경 요약 |
|------|------|-----------|
| 백엔드 | `backend/service.py` | `_relationship_to_serializable`: `stock_ratio` → `stockRatio` 매핑 |
| 프론트 | `frontend/webapp/js/core/panel-manager.js` | `relPct`: snake_case·숫자 검사 보강; `dedupeConnectedNodes`: displayName 2차 병합, key 보정 |

---

## 요약

| 이슈 | 원인 요약 | 조치 |
|------|-----------|------|
| (1) 한참 후에 뜸 | API 지연 + 단일 요청 후 DOM 갱신 | 로딩 문구·race 스킵 적용; 백엔드/인덱스·prefetch 권장 |
| (2) 연결노드 중복 | 관계 단위 행 + id 불일치로 id 디듀프만으로 미병합 | displayName 2차 병합 및 id/name 키 정리 |
| (3) 보유비율 미표시 | 관계 속성 snake_case 미반영 + relPct 경로 한정 | 백엔드 stock_ratio→stockRatio, 프론트 relPct 경로·숫자 처리 보강 |
