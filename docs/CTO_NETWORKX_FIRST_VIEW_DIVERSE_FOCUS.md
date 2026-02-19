# NetworkX CTO: 첫 화면 "다양한 연결" 포커스 (회사-회사-개인 등)

첫 화면에 **단순히 연결 수가 많은 회사**가 아니라, **회사·개인·기관 등이 섞인 다양한 연결**을 한눈에 보여주는 방안을 NetworkX 전문가 CTO 관점에서 검토한다.

---

## 1. 목표 정리

- **현재**: 첫 화면 추천 노드 = degree_centrality 또는 pagerank 최대 → 대부분 "연결 많은 회사" 한 점에 수렴.
- **원하는 것**: "회사–회사–개인"처럼 **노드 타입이 섞인 구조**가 보이도록, 그런 구조에 가까운 노드(또는 경로)를 시작점으로 제안.

---

## 2. 전제 (스키마·데이터)

- **노드 라벨**: `Company`, `Person`, `Stockholder` (표시 타입: company, person, major, institution).
- **엣지**: `HOLDS_SHARES`, `HAS_COMPENSATION` 등. NetworkX 변환 시 `G.add_node(node.id, label=node.label, **node.properties)` 로 **label**이 노드 속성에 있음.
- **분석 입력**: `/api/graph/analysis` 응답의 `graph`(GraphData)로 이미 `run_analysis()`를 타므로, 동일 그래프에 **추가 지표**만 넣거나 **별도 추천 전용 API**를 두면 됨.

---

## 3. 방안 검토

### 방안 A: 이웃 라벨 다양도 점수 (Neighbor Label Diversity)

**아이디어**: 노드별로 "이웃에 등장하는 **서로 다른 라벨 수**"를 구해, 다양도가 높은 노드를 추천 후보로 사용.

- **정의**:  
  - `labels(u) = { G.nodes[v]["label"] for v in G.neighbors(u) }`  
  - `diversity(u) = len(labels(u))` (또는 `displayType` 등으로 그룹을 묶어서 세도 됨)
- **추천 노드**:  
  - 제약: `degree(u) >= k` (너무 연결 적은 노드 제외, 예: k=2).  
  - `score(u) = diversity(u) * f(degree(u))` 로 스코어링 후 argmax.  
  - 또는 `diversity(u)` 우선, 동점이면 degree_centrality/pagerank로 타이브레이크.

**장점**: 구현 단순, NetworkX만으로 가능, 기존 analysis 파이프라인에 지표 하나 추가하면 됨.  
**단점**: "경로" 구조(회사→회사→개인 순서)는 반영하지 않음. "이웃에 회사도 있고 개인도 있다" 수준.

**구현 부담**: 낮음. `run_analysis()` 확장 또는 `suggested_focus_node_id` 전용 함수 추가.

---

### 방안 B: 경로 기반 샘플링 (Path: Company–Company–Person)

**아이디어**: 길이 2~3의 경로 중 "라벨 시퀀스가 다양한 것"(예: Company→Company→Person, Company→Person→Company)을 찾아, 그 경로의 한 노드(예: 중간 노드)를 첫 화면 포커스로 사용.

- **정의**:  
  - `paths = []`  
  - BFS 또는 제한된 개수의 random walk로 경로 수집.  
  - 각 경로 `(u, v, w)`에 대해 `labels = (G.nodes[u]["label"], G.nodes[v]["label"], G.nodes[w]["label"])`.  
  - "다양한" 조건: 예) 서로 다른 라벨 2개 이상 포함, 또는 `("Company","Company","Person")` 등 원하는 패턴 포함.
- **추천**: 조건 만족하는 경로가 있으면 그 경로의 **중간 노드**(또는 시작 노드)를 반환. 없으면 fallback으로 degree/pagerank.

**장점**: "회사–회사–개인" 같은 **구조**를 직접 반영.  
**단점**: 경로 수가 많을 수 있어 샘플링/상한 필요. 구현·튜닝 부담이 A보다 큼.

**구현 부담**: 중간. 백엔드에 경로 샘플링 + 라벨 시퀀스 필터 함수 추가.

---

### 방안 C: Betweenness + 다양도 (다리 노드 중에서 고르기)

**아이디어**: betweenness_centrality가 높은 노드는 보통 "다리" 역할. 그 중에서 **이웃 라벨 다양도**가 높은 노드를 추천.

- **정의**:  
  - `bc = betweenness_centrality(G)` (노드/엣지 많으면 이미 상한 있음).  
  - 각 노드에 `diversity(u)` 계산 (방안 A와 동일).  
  - 후보: `bc[u]` 상위 K개.  
  - 추천: 후보 중 `diversity(u)` 최대인 노드. (또는 `bc[u] * diversity(u)` 등)
- **fallback**: betweenness 스킵된 그래프(너무 큼)면 기존 degree/pagerank 또는 방안 A만 사용.

**장점**: "연결하는" 노드이면서 이웃이 다양한 점을 동시에 만족.  
**단점**: betweenness 비용이 큼. 이미 `MAX_NODES_FOR_HEAVY_ANALYSIS` 등으로 제한돼 있음.

**구현 부담**: 중간. 기존 betweenness 옵션 활용 + diversity 결합.

---

### 방안 D: 2단계 필터 (다양도 있는 노드만 → 그중에서 centrality)

**아이디어**: "이웃에 서로 다른 라벨이 2개 이상인 노드"만 남긴 뒤, 그 집합 안에서 degree_centrality 또는 pagerank로 1등을 추천.

- **정의**:  
  - `diverse_candidates = [ u for u in G if diversity(u) >= 2 ]`  
  - `suggested = argmax_{u in diverse_candidates} degree_centrality(u)` (또는 pagerank).
- **fallback**: `diverse_candidates`가 비면 기존처럼 전체에서 degree/pagerank argmax.

**장점**: 구현이 단순하고, "최소한 2종류 이상 연결이 있는 노드"를 보장.  
**단점**: "회사–회사–개인" 같은 순서/경로는 반영 안 함.

**구현 부담**: 낮음. 방안 A와 거의 동일한 비용.

---

### 방안 E: 백엔드 전용 API `suggested_focus` (단일 소스)

**아이디어**: 첫 화면용 추천 노드를 **백엔드 한 곳**에서만 결정. 응답에 `suggested_focus_node_id`(및 선택적으로 `reason`)를 넣어, 프론트는 그 노드로만 뷰를 맞춤.

- **엔드포인트**: 예) `GET /api/graph/analysis` 확장으로 `analysis.suggested_focus_node_id` 추가.  
  또는 `GET /api/graph/suggested-focus?limit=...&node_cap=...` 별도.
- **백엔드 로직**: 위 A/B/C/D 중 선택한 정책으로 노드 1개(또는 상위 1개) 계산 후 반환.
- **프론트**: `getSuggestedFocusNode()`에서 `initialAnalysis.suggested_focus_node_id` 우선 사용, 없으면 기존 degree_centrality/pagerank/클라이언트 degree fallback.

**장점**: 정책 변경·A/B 테스트·다양도→경로 전환 시 백엔드만 수정하면 됨. 단일 소스.  
**단점**: API 스펙/버전 하나 더 관리.

**구현 부담**: 백엔드에 지표/정책 한 번 넣고, 프론트는 키 하나 읽는 수준.

---

## 4. 권장 조합 (단계별)

| 단계 | 내용 | 목적 |
|------|------|------|
| **1단계** | **방안 A 또는 D**를 백엔드에 추가하고, **방안 E** 형태로 `analysis.suggested_focus_node_id` (또는 `suggested_focus`) 제공. | 단순히 "연결 많은 회사" 대신 "이웃이 다양한 노드"를 첫 화면에 제시. |
| **2단계** | 필요 시 **방안 B**를 추가: 경로 샘플링으로 "회사–회사–개인" 등 패턴이 있는 경로를 찾고, 그 경로의 노드 하나를 `suggested_focus` 후보로 사용(또는 diversity 후보와 조합). | "다양한 연결 구조"를 더 명시적으로 보여줌. |
| **3단계** | 그래프가 크지 않을 때만 **방안 C** (betweenness + 다양도) 옵션을 켜서, "다리이면서 이웃이 다양한" 노드를 우선할 수 있게 함. | 고급 옵션. |

**즉시 적용 권장**: **방안 D(2단계 필터) + 방안 E(API로 suggested_focus 반환)**.  
- `diversity(u) >= 2` 인 노드만 후보로 두고, 그중 degree_centrality(또는 pagerank) 최대인 노드를 `suggested_focus_node_id`로 반환.  
- 구현이 가볍고, "회사만 많이 연결된 한 점"보다 "회사·개인 등이 섞인 구역"이 먼저 보일 가능성이 높음.

---

## 5. 구현 시 유의사항 (NetworkX·확장성)

- **label 키**: `GraphNode`에 `label`이 있으므로 `_graph_data_to_nx`에서 `G.nodes[n]["label"]`로 접근 가능. `displayType`을 쓰려면 `node.properties`에 있으므로 `G.nodes[n].get("displayType") or G.nodes[n]["label"]` 등으로 통일.
- **방향**: `G`가 DiGraph이므로 `G.neighbors(u)`는 나가는 이웃. "이웃"을 양방향으로 보려면 `G.predecessors(u)` ∪ `G.successors(u)` 또는 `G.to_undirected().neighbors(u)` 사용.
- **성능**: diversity는 노드당 이웃 수만큼만 보면 되므로 O(E) 수준. 경로 샘플링은 경로 개수 상한을 두어 상수에 가깝게 제한.
- **fallback**: suggested_focus를 계산할 수 없거나(그래프 비어 있음, diverse 후보 없음) 분석 실패 시, 기존처럼 degree_centrality/pagerank argmax 또는 클라이언트 degree를 쓰도록 명시.

---

## 6. 요약

| 방안 | 요약 | 구현 난이도 | "다양한 연결" 반영 |
|------|------|-------------|---------------------|
| A. 이웃 라벨 다양도 | diversity(u)로 스코어, argmax | 낮음 | 이웃에 여러 타입 있음 |
| B. 경로 샘플링 | Company–Company–Person 등 경로 찾아 그 노드 사용 | 중간 | 경로 구조까지 반영 |
| C. Betweenness + 다양도 | 다리 노드 중 diversity 높은 쪽 | 중간 | 다리 + 다양 |
| D. 2단계 필터 | diversity>=2 후보만 두고 그중 centrality 1등 | 낮음 | 최소 2종 이웃 보장 |
| E. suggested_focus API | 백엔드가 추천 노드 1개 반환, 프론트는 그대로 사용 | 낮음(연동만) | 정책에 따라 A/B/C/D 조합 |

**권장**: 1단계로 **D + E** 적용(다양도 2 이상인 노드 중 centrality 1등을 `suggested_focus_node_id`로 반환). 필요 시 2단계에서 **B**를 넣어 "회사–회사–개인" 같은 경로를 명시적으로 활용.

---

## 7. 구현 반영 (1단계 D+E) — 코드 위치

| 구분 | 파일 | 내용 |
|------|------|------|
| **상수** | `backend/graph_analysis.py` | `MIN_DIVERSE_NEIGHBOR_LABELS = 2` (다양도 후보 최소 라벨 수, 확장 시 상수만 변경). |
| **헬퍼** | `backend/graph_analysis.py` | `_neighbor_label_diversity(G, u)` — 이웃(진입+진출)의 서로 다른 라벨 개수. `label` / `displayType` 지원. |
| **계산** | `backend/graph_analysis.py` | `compute_suggested_focus_node(G, degree_centrality, pagerank, ...)` — diverse 후보 중 `prefer_metric` argmax, 없으면 전체 fallback. 반환 `(node_id_str, "diverse"|"fallback")`. |
| **연동** | `backend/graph_analysis.py` | `run_analysis()` 마지막에 `compute_suggested_focus_node()` 호출 후 `result["suggested_focus_node_id"]`, `result["suggested_focus_reason"]` 설정. 실패 시 로그만, 기존 필드 유지. |
| **API** | `backend/main.py` | 변경 없음. `GET /api/graph/analysis` 응답 `analysis`에 위 필드가 포함됨. |
| **프론트** | `frontend/webapp/js/app.js` | `getSuggestedFocusNode()`: 1) `analysis.suggested_focus_node_id` 우선(현재 그래프에 있으면 사용), 2) 기존 degree_centrality/pagerank argmax, 3) 클라이언트 degree fallback. |

---

## 8. 그래프 DB CTO 관점: 유지보수성·확장성·호환성·협업코드

### 유지보수성
- **단일 모듈**: 추천 노드 정책은 `graph_analysis.py`에만 존재. `MIN_DIVERSE_NEIGHBOR_LABELS`, `prefer_metric` 등 상수/파라미터로 조정 가능.
- **실패 격리**: `compute_suggested_focus_node` 또는 suggested 필드 설정이 예외를 일으켜도 `run_analysis()`는 로그 후 기존 analysis 결과만 반환. 기존 동작 훼손 없음.
- **이웃 정의**: `_neighbor_label_diversity`에서 DiGraph 진입·진출 모두 사용. 라벨 소스는 `label` 우선, `displayType` fallback으로 한 곳에서만 정의.

### 확장성
- **정책 교체**: 2단계(경로 기반) 도입 시 `compute_suggested_focus_node` 내부에서 먼저 경로 샘플링 후보를 구하고, 없을 때만 현재 diversity 로직 호출하도록 분기 추가하면 됨. API·프론트 시그니처 변경 불필요.
- **지표 추가**: `prefer_metric`에 `"betweenness_centrality"` 등을 넣고, `run_analysis`에서 betweenness 계산 시점에 suggested만 다시 계산하면 됨.
- **라벨 확장**: 새 노드 타입(라벨)이 추가돼도 `G.nodes[v].get("label")`로 자동 반영. 필요 시 `displayType` 등 다른 속성을 diversity 집계에 포함하도록 `_neighbor_label_diversity`만 수정.

### 호환성
- **API 하위 호환**: `analysis`에 `suggested_focus_node_id`·`suggested_focus_reason`만 **추가**. 기존 클라이언트는 이 키를 무시해도 동작 유지.
- **프론트 fallback**: `suggested_focus_node_id`가 없거나 현재 그래프 노드 집합에 없으면 기존 순서(degree_centrality → pagerank → 클라이언트 degree)로 동작. 구버전 백엔드·분석 실패 시에도 첫 화면 포커스는 유지.
- **노드 ID 타입**: 백엔드 반환은 문자열. 프론트는 `String(id)` 비교로 숫자/문자열 혼합 환경에서도 매칭.

### 협업코드
- **계약 명시**: "첫 화면 추천 노드는 `analysis.suggested_focus_node_id` 우선, 없으면 기존 지표"를 문서(본 절) 및 주석으로 명시. 신규 개발자는 백엔드 정책만 바꾸면 됨.
- **디버깅**: `suggested_focus_reason`("diverse" | "fallback")으로 어떤 경로로 노드가 선정됐는지 로그/프론트 디버그에 활용 가능.
- **테스트**: `compute_suggested_focus_node`는 (G, dc, pr)만 주면 되므로, 작은 fixture 그래프로 단위 테스트 작성 용이.
