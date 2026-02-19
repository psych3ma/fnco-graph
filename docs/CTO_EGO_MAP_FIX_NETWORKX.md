# 지배구조 맵 보기 정상동작 수정 (NetworkX/CTO 관점)

## 문제: "지배구조 맵 보기"가 동작하지 않음

- **증상**: 노드 선택 후 "이 노드 기준 지배구조 맵 보기" 클릭 시 배너는 뜨지만 그래프가 ego 서브그래프로 바뀌지 않음.
- **원인**: **데이터 소스 불일치**. App만 `rawNodes`/`rawLinks`를 ego API 응답으로 갱신하고, **GraphManager는 초기화 시점에 받은 데이터만** 보유. `buildGraph()`는 `this.rawNodes`/`this.rawLinks`(GraphManager 소유)를 사용하므로, 갱신된 ego 데이터가 반영되지 않음.

## 수정 사항 (프론트)

1. **`app.js` – 그래프 구조 단일 진입점 `setGraphData(nodes, links)`**
   - "그래프 구조" 변경 시 **항상** `setGraphData()`만 사용. App·state·GraphManager를 한 번에 동기화.
   - `loadEgoGraph()` 성공 시: `setGraphData(this.rawNodes, egoLinks)` 호출 후 `buildGraph()`.
   - `loadData()` 성공/폴백 시: `setGraphData(...)` 호출로 동기화 후 필요 시 `buildGraph()`.
   - 상세 규칙은 `CTO_GRAPH_STRUCTURE_SINGLE_SOURCE.md` 참고.

## 역할 분리 (NetworkX/백엔드 관점)

- **Neo4j + service**: ego 쿼리(`get_ego_graph`), `format_graph_data`로 `GraphData(nodes, edges)` 반환.
- **NetworkX**: 지배구조 맵 **데이터 생성**에는 미사용. ego는 Neo4j 관계만으로 1홉 서브그래프 조회. (향후 2홉·중심성 기반 이웃 등은 NetworkX로 확장 가능.)
- **프론트 (vis)**: 전달받은 `GraphData`를 **그대로** `rawNodes`/`rawLinks`로 두고, **반드시 GraphManager에 넣은 뒤** `buildGraph()`로 렌더링.

## 백엔드 ego 쿼리 참고

- **depth=1**: `(center)-[r]-(connected)` 한 홉만 조회. `format_graph_data`의 (n=center, r, m=connected) 매핑이 올바르게 엣지(center–connected) 생성. **현재 프론트는 depth=1만 사용** (`getEgoGraph(node.id, 1, 250, idProp)`).
- **depth>1**: 현재 쿼리는 path 전체의 `relationships(path)`를 UNWIND하여 각 row가 (center, r, connected)로 넘어가는데, `r`이 path 중간 엣지일 수 있어 (n,m)과 불일치할 수 있음. 2홉 이상 지원 시 쿼리/정규화 로직 수정 필요.
- **id_property**: 프론트는 Company면 `bizno`, Person이면 `personId` 전달. 백엔드는 `_safe_id_property`로 화이트리스트(bizno, personId, id 등)만 허용.

## 검증 체크리스트

- [ ] 노드 선택 후 "이 노드 기준 지배구조 맵 보기" 클릭 → 그래프가 해당 노드와 직접 연결된 노드만 보이도록 변경됨.
- [ ] "전체 그래프로 돌아가기" 클릭 → 전체 그래프로 복원됨.
- [ ] API 실패 시 "지배구조 맵을 불러오지 못했습니다…" 토스트 노출.
