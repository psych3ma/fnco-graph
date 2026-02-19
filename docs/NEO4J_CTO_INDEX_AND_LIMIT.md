# Neo4j CTO 검토: 인덱스 · limit · 더 보기 (확장성/유지보수/협업)

## 1. 인덱스

### 1.1 왜 필요한가

- **그래프 조회**: `MATCH (n)-[r:HOLDS_SHARES|HAS_COMPENSATION]->(m) WHERE ...` 에서 노드 라벨·관계 타입으로 시작점을 좁히고, **노드 ID 조회**(bizno, personId)가 자주 쓰이므로 해당 속성에 인덱스가 있으면 플래너가 활용한다.
- **검색**: `CONTAINS` 조건은 **TEXT 인덱스**가 있으면 성능이 좋다 (Neo4j 5.x). 없으면 풀스캔에 가깝게 동작한다.
- **노드 상세/관계**: `get_node_by_id`, `get_node_relationships` 는 `n.bizno`, `n.personId` 로 조회하므로 이 속성에 인덱스가 있으면 필수적이다.

### 1.2 권장 인덱스 (스키마와 일치)

| 용도 | 라벨 | 속성 | 비고 |
|------|------|------|------|
| 노드 ID 조회 | Company | bizno | get_node_by_id, 관계 조회 |
| 노드 ID 조회 | Person | personId | 동일 |
| 검색(CONTAINS) | Company | companyName, companyNameNormalized | search_nodes |
| 검색(CONTAINS) | Person | stockName, stockNameNormalized | search_nodes |

관계 타입은 Cypher 패턴 `[r:HOLDS_SHARES|HAS_COMPENSATION]` 에서 이미 지정되므로, 별도 “관계 타입 인덱스”는 없다. 노드 라벨+속성 인덱스로 충분하다.

### 1.3 적용 방법

- **스크립트**: `scripts/neo4j-indexes.cypher` 에 위 인덱스를 `IF NOT EXISTS` 로 정의해 두었다.
- **실행**: Neo4j Browser 또는 `cypher-shell` 로 해당 스크립트 실행.
- **유지보수**: `backend/config.py` 의 `NodeLabel`, `NodeProperty` 와 맞춰 두었으므로, 스키마가 바뀌면 이 스크립트만 같이 수정하면 된다.

### 1.4 확인

```cypher
SHOW INDEXES;
```

인덱스가 생성된 뒤 그래프 조회·검색 쿼리 실행 계획으로 사용 여부 확인 권장:

```cypher
EXPLAIN
MATCH (n)-[r:HOLDS_SHARES|HAS_COMPENSATION]->(m)
WHERE 'Company' IN labels(n) OR 'Person' IN labels(n) OR 'Company' IN labels(m) OR 'Person' IN labels(m)
WITH n, r, m LIMIT 500
RETURN n, r, m, labels(n), labels(m), type(r);
```

---

## 2. Limit 조정 (첫 로드 500)

### 2.1 목적

- 첫 화면을 **빨리** 보여주기 위해, 초기 그래프는 **관계(엣지) 500건**만 요청한다.
- 1000건이면 Neo4j·네트워크 부하가 커져 타임아웃 가능성이 늘어난다.

### 2.2 적용

- **프론트**: `INITIAL_GRAPH_EDGE_LIMIT = 500` 으로 변경 (기존 1000).
- **백엔드**: `MAX_QUERY_LIMIT`(1000) 은 그대로 두고, 클라이언트가 500만 요청하므로 추가 변경 없음.

---

## 3. “더 보기” (추가 로드)

### 3.1 설계

- **1차**: `GET /api/graph?limit=500&skip=0` → 첫 500건.
- **더 보기**: `GET /api/graph?limit=500&skip=500` → 다음 500건. 프론트는 기존 노드·엣지에 **merge**.
- **안정적 페이지네이션**: Cypher 에 `ORDER BY id(r)` 를 넣어 같은 skip/limit 에 항상 같은 구간이 오도록 한다.

### 3.2 백엔드

- `get_graph_data(limit, node_labels, relationship_types, skip=0)` 추가.
- 쿼리: `WITH n, r, m` 뒤에 `ORDER BY id(r) SKIP $skip LIMIT $limit` 적용 (기존 `LIMIT $limit` 대체).

### 3.3 프론트

- **초기**: `getGraphData(500, nodeLabels, relationshipTypes, 0)` (skip=0). 이미 적용됨.
- **“그래프 더 불러오기”** (UI는 추후 구현): `getGraphData(500, nodeLabels, relationshipTypes, 500)` 등으로 호출하고, 응답 노드·엣지를 기존 `rawNodes`/`rawLinks`에 merge한 뒤 `buildGraph` 재호출.

백엔드·api-client에는 `skip` 파라미터가 반영되어 있어, 더 보기 버튼만 붙이면 된다.

위와 같이 구현하면 확장성·유지보수·협업(스키마와 인덱스 일치, 상수만 조정)을 만족한다.
