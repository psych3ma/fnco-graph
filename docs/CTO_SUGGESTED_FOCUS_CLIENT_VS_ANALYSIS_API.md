# CTO 검토: 첫 화면 추천 노드 — 클라이언트 전용 vs /api/graph/analysis

확장성·유지보수성 관점에서 "시작 노드"를 어디서 계산할지 정리.

---

## 1. 현재 방식 (클라이언트 전용)

- **위치**: `app.js` — `getSuggestedFocusNode()`  
- **로직**: `graph.rawLinks`만으로 노드별 **degree**(연결 수) 계산 → 최대 degree 노드 ID 반환.  
- **특징**: 추가 요청 없음, 이미 가진 데이터만 사용.

| 관점 | 내용 |
|------|------|
| **유지보수** | 한 곳(app.js)에서만 정의. 백엔드/NetworkX 의존 없음. |
| **확장** | 다른 지표(pagerank, betweenness)를 쓰려면 클라이언트에 로직 추가 또는 별도 API 필요. |
| **일관성** | "중요도" 정의가 클라이언트에만 있음. 백엔드 분석와 중복·불일치 가능. |
| **장점** | 단순, 지연 없음, 오프라인/캐시 친화. |
| **단점** | 지표 변경·고도화 시 프론트 수정 필요. 가중치·방향 등 반영하려면 로직이 비대해짐. |

---

## 2. 대안: /api/graph/analysis 활용

- **엔드포인트**: `GET /api/graph/analysis` — 동일 파라미터(limit, node_cap 등)로 **graph + analysis** 한 번에 반환.  
- **분석 필드**: `degree_centrality`, `pagerank`, (옵션) `betweenness_centrality` 등.  
- **사용**: 응답의 `analysis.degree_centrality` 또는 `analysis.pagerank`에서 **argmax** 노드 ID를 골라 첫 화면 포커스에 사용.

| 관점 | 내용 |
|------|------|
| **유지보수** | "중요도" 정의를 백엔드/NetworkX 한 곳에서만 관리. 지표 변경 시 API 응답만 바뀌면 됨. |
| **확장** | pagerank·betweenness·가중 centrality 등은 백엔드에서만 추가하면 되고, 프론트는 "어느 필드의 argmax를 쓸지"만 선택. |
| **일관성** | 다른 기능(랭킹, 추천 등)도 같은 analysis를 쓰면 정의 일원화. |
| **장점** | 단일 소스, 지표 교체·추가가 쉬움. |
| **단점** | 초기 로드 시 그래프를 `/api/graph/analysis`로 받아야 함(추가 호출이 아니라 **한 번에 graph+analysis**). analysis 실패 시 fallback 필요. |

---

## 3. 권장: 분석 API 우선 + 클라이언트 fallback

- **초기 로드**: `GET /api/graph/analysis` 한 번만 호출해 **graph + analysis** 수신. (기존 `GET /api/graph` 대신 사용해 요청 수 유지.)  
- **추천 노드**:  
  - `analysis.degree_centrality` 또는 `analysis.pagerank`가 있으면 그중 **argmax** 노드 ID를 사용.  
  - 없거나 오류면 **기존처럼 클라이언트 degree**로 계산해 사용.  
- **효과**:  
  - 확장·유지보수: 지표는 백엔드/NetworkX에서만 다루고, 프론트는 "필드 선택 + argmax"만 담당.  
  - 분석 API 장애/미제공 환경에서는 기존과 동일하게 동작.

---

## 4. 구현 요약 (반영 시)

| 구분 | 내용 |
|------|------|
| **api-client** | `getGraphWithAnalysis(limit, nodeLabels, relationshipTypes, skip, nodeCap)` 추가 → `GET /api/graph/analysis` 호출, `{ graph, analysis }` 반환. |
| **loadData** | 초기 그래프 로드 시 `getGraphWithAnalysis` 사용. `response.graph`로 nodes/edges 처리(기존과 동일). `response.analysis`는 `stateManager.setState('graph.initialAnalysis', analysis)` 저장. |
| **getSuggestedFocusNode** | 우선 `graph.initialAnalysis?.degree_centrality`(또는 `pagerank`)에서 argmax 노드 ID 반환; 없으면 기존대로 rawLinks 기반 degree 계산. |
| **지표 선택** | 상수 또는 설정으로 "degree_centrality" vs "pagerank" 선택 가능하게 두면, 나중에 백엔드에서 기본만 바꿔도 됨. |

---

## 5. 결론

- **클라이언트만 쓸 때**: 구현 단순·지연 없음이 장점이지만, 지표 확장·일관성은 한계가 있음.  
- **확장성·유지보수·단일 소스**를 중시하면 **/api/graph/analysis를 쓰고, 분석 우선·클라이언트 degree fallback** 조합이 적절함.  
- "지금은 단순하게 가고 싶다"면 클라이언트 전용 유지 후, **지표를 바꾸거나 다른 분석을 붙일 때** 위와 같이 analysis API로 전환하는 전략을 권장.
