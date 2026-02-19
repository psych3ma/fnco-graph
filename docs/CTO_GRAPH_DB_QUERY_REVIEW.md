# 그래프 DB 조회 로직 전반 검토 (NetworkX CTO 관점)

확장성·유지보수성·협업 코드를 고려한 구조 정리 및 NetworkX 적용 방향.

---

## 1. 현재 그래프 DB 조회 흐름

### 1.1 진입점 (API)

| 엔드포인트 | 용도 | 서비스 함수 | DB 함수 |
|------------|------|-------------|---------|
| `GET /api/graph` | 전체/필터 그래프 조회 | `get_graph_data()` | `db.get_graph_data()` |
| `GET /api/graph/search` | 검색어 기반 서브그래프 | `search_graph()` | `db.search_nodes()` + `db.get_node_relationships()` |
| `GET /api/node/{id}` | 노드 상세 | `get_node_detail()` | `db.get_node_by_id()` + `db.get_node_relationships()` |
| `GET /api/node/{id}/ego` | Ego 그래프 | `get_ego_graph()` | `db.get_ego_graph()` |
| `GET /api/statistics` | 통계 | `get_statistics()` | `db.get_statistics()` |

### 1.2 데이터 계층

```
[Client]
    ↓
[main.py]  엔드포인트 (파라미터 검증, 예외 → HTTP)
    ↓
[service.py]  비즈니스 로직 (format_graph_data, 정규화, id_property 감지)
    ↓
[database.py]  Neo4j 드라이버 (execute_query, Cypher)
    ↓
[Neo4j]
```

- **단일 소스**: 실제 쿼리는 `database.py`에만 존재. `service.py`는 레코드 → `GraphData` 변환 및 보조 계산.
- **GraphData**: `models.GraphData` (nodes: List[GraphNode], edges: List[GraphEdge]). 모든 그래프 응답의 공통 형식.

### 1.3 주요 쿼리 요약

| DB 메서드 | Cypher 요지 | limit/skip | 비고 |
|-----------|-------------|------------|------|
| `get_graph_data` | `MATCH (n)-[r:타입]->(m)` + 라벨 필터 | ORDER BY id(r) SKIP/LIMIT | 관계 행 단위, 노드는 n/m에서 추출 |
| `get_node_relationships` | `(n)-[r]-(m)` n=노드 | LIMIT | direction은 service에서 start_node 기준 부여 |
| `get_ego_graph` | `(center)-[*1..depth]-(connected)` | LIMIT | format_graph_data에 n/r/m 형태로 정규화 |
| `search_nodes` | `MATCH (n) WHERE toLower(n.속성) CONTAINS 검색어` | LIMIT | |

### 1.4 확장·유지보수 포인트

- **Cypher 공통화**: 관계 타입·라벨은 `config.DEFAULT_RELATIONSHIP_TYPES`, `config.NODE_ID_PROPERTIES` 등 설정 기반.
- **id_property**: 화이트리스트(`_safe_id_property`)로 삽입 방지.
- **충돌 회피**: 분석용 로직은 **기존 쿼리 결과(GraphData)를 입력으로만 사용**하고, Neo4j 쿼리 자체는 수정하지 않음.

---

## 2. NetworkX 적용 원칙 (충돌 없이)

- **역할 분리**: Neo4j = 저장·조회, NetworkX = **조회된 서브그래프에 대한 인메모리 분석**.
- **추가 전용**: 새 모듈·새 엔드포인트만 추가. 기존 `/api/graph`, `/api/node/{id}` 등은 변경 없음.
- **입력**: `GraphData` (이미 서비스 계층에서 Neo4j 결과로 채워진 객체).
- **출력**: 노드별 지표(연결중심성, PageRank 등), 연결요소 수 등. API는 `graph` + `analysis` 형태로 반환 가능.

### 2.1 적용 위치

- **모듈**: `backend/graph_analysis.py` (NetworkX 전용).
- **호출**: `get_graph_data()` 등으로 `GraphData`를 얻은 뒤, 같은 데이터로 `graph_analysis.run_analysis(graph_data)` 호출.
- **API**: `GET /api/graph/analysis` — 기존 그래프 파라미터(limit, skip, node_labels, relationship_types)를 그대로 받아, 동일 조건으로 `get_graph_data()` 실행 후 분석 결과를 붙여 반환.

### 2.2 확장 시 협업 규칙

- 새 NetworkX 알고리즘 추가 시 `graph_analysis.py` 내부에만 추가. Neo4j/서비스 계층 시그니처는 유지.
- 노드 수가 매우 클 때(예: limit 1000 이상) 분석 비용을 제한하려면 `graph_analysis`에서 노드/엣지 수 상한으로 early return 하거나, 별도 파라미터로 분석 여부를 끌 수 있게 두면 됨.

---

## 3. NetworkX 적용 내용 (충돌 없이 반영)

### 3.1 모듈: `backend/graph_analysis.py`

- **입력**: `GraphData` (Neo4j 조회 결과와 동일한 모델). Neo4j/DB 레이어 의존 없음.
- **변환**: `GraphData` → `networkx.DiGraph` (노드 id, 엣지 source/target, 옵션으로 `stockRatio`/`pct` → edge weight).
- **산출 지표** (JSON 직렬화 가능):
  - `degree_centrality`: 노드별 연결 중심성
  - `pagerank`: 노드별 PageRank (가중치 사용 시 지분 비율 반영)
  - `betweenness_centrality`: (옵션, 노드/엣지 상한 초과 시 스킵)
  - `n_weakly_connected_components`, `largest_component_size`: 약한 연결요소 개수·최대 크기
- **상한**: `MAX_NODES_FOR_HEAVY_ANALYSIS`, `MAX_EDGES_FOR_HEAVY_ANALYSIS` 로 betweenness 등 무거운 연산 제한.
- **의존성**: `networkx` 없으면 `available: false` 로 분석만 생략, 기존 그래프 API는 그대로 동작.

### 3.2 API: `GET /api/graph/analysis`

- **파라미터**: `limit`, `skip`, `node_labels`, `relationship_types` — `GET /api/graph` 와 동일.  
  추가: `include_betweenness` (기본 false, true 시 betweenness_centrality 포함).
- **응답**: `{ "graph": GraphData (dict), "analysis": run_analysis 결과 }`.
- **흐름**: `get_graph_data(...)` → 동일한 `GraphData` 로 `run_analysis(...)` 호출 → 그래프 + 분석 합쳐서 반환.
- **충돌 없음**: 기존 `GET /api/graph`, `GET /api/node/{id}`, ego 등은 전혀 변경 없음.

### 3.3 의존성

- `requirements.txt`: `networkx>=3.0` 추가.

---

## 4. 관련 파일

| 구분 | 파일 | 역할 |
|------|------|------|
| DB | `backend/database.py` | Neo4j 쿼리 (get_graph_data, get_node_*, get_ego_graph 등) |
| 서비스 | `backend/service.py` | format_graph_data, get_graph_data, get_node_detail, get_ego_graph |
| API | `backend/main.py` | 라우트, GraphData 반환, `/api/graph/analysis` (그래프+NetworkX 분석) |
| 모델 | `backend/models.py` | GraphData, GraphNode, GraphEdge |
| 분석 | `backend/graph_analysis.py` | GraphData → NetworkX DiGraph → degree/pagerank/연결요소 등 지표 |
