# CTO 검토: 타임아웃 원인 분석 및 하드코딩 검토

유지보수성·호환성·확장성·협업 코드 관점에서 검토.

---

## 1. 하드코딩 검토

### 현재 수정사항의 문제점

**위치**: `frontend/webapp/js/app.js:233`
```javascript
{ timeout: API_CONFIG.TIMEOUT }  // 30초 (일반 타임아웃, GRAPH_TIMEOUT 60초 대신)
```

**문제**:
1. **의미 불명확**: `API_CONFIG.TIMEOUT`은 "일반 요청"용인데, 폴백 요청에 사용하는 이유가 주석에만 있음.
2. **주석 하드코딩**: 주석에 "30초"를 직접 적어서, 상수 값이 바뀌면 주석과 불일치 발생.
3. **확장성 부족**: 나중에 폴백 전용 타임아웃을 조정하려면 코드 수정 필요.

### 권장 수정

**옵션 A: 폴백 전용 타임아웃 상수 추가 (권장)**
```javascript
// constants.js
export const API_CONFIG = {
  TIMEOUT: 30000,
  GRAPH_REQUEST_TIMEOUT: 60000,
  GRAPH_FALLBACK_TIMEOUT: 30000,  // 폴백 요청용 (분석 없으므로 더 빠름)
  ...
};

// app.js
{ timeout: API_CONFIG.GRAPH_FALLBACK_TIMEOUT }
```

**장점**:
- 의미 명확: "폴백 요청용"이라는 의도가 상수 이름에 드러남.
- 확장성: 상수만 변경하면 타임아웃 조정 가능.
- 협업: 다른 개발자가 "폴백 타임아웃은 왜 30초인가?"를 상수 이름으로 이해 가능.

**옵션 B: 주석 제거 + 상수 사용만 (최소 변경)**
```javascript
{ timeout: API_CONFIG.TIMEOUT }
```
- 주석의 "30초" 하드코딩만 제거. 의미는 여전히 불명확하지만, 최소 변경.

---

## 2. 타임아웃 원인 분석

### 요청 파라미터 (프론트 → 백엔드)

```
GET /api/graph/analysis?
  limit=500
  node_cap=1000
  node_labels=Company&node_labels=Person&node_labels=Stockholder&node_labels=Stockholder
  relationship_types=HOLDS_SHARES&relationship_types=HAS_COMPENSATION
```

**문제점**:
- `node_labels`에 `Stockholder`가 **중복** (2회) → 백엔드에서 중복 처리 필요.
- `node_cap=1000`: 최대 1000개 노드 조회.
- `limit=500`: 최대 500개 관계 조회.

### 백엔드 처리 단계별 소요 시간 추정

#### 단계 1: Neo4j 쿼리 (`get_graph_data`)
- **쿼리**: `MATCH (n)-[r]-(m) WHERE ... RETURN n, r, m LIMIT 500`
- **필터**: `node_labels` OR 조건 (Company OR Person OR Stockholder OR Stockholder)
- **예상 시간**: 5-15초 (인덱스 유무, 데이터 분포에 따라)
- **병목 가능성**: 중간

#### 단계 2: 노드 캡 적용 (`node_cap=1000`)
- **처리**: Python 리스트 슬라이싱 `nodes[:1000]`, 엣지 필터링
- **예상 시간**: <1초
- **병목 가능성**: 낮음

#### 단계 3: NetworkX 그래프 변환 (`_graph_data_to_nx`)
- **처리**: 1000개 노드, 500개 엣지를 NetworkX DiGraph로 변환
- **예상 시간**: 1-3초
- **병목 가능성**: 낮음

#### 단계 4: NetworkX 분석 (`run_analysis`)

**4-1. degree_centrality**
- **복잡도**: O(n) where n=노드 수
- **예상 시간**: <1초 (1000 노드 기준)
- **병목 가능성**: 낮음

**4-2. pagerank**
- **복잡도**: O(n²) 또는 O(n×m) where m=엣지 수, 반복 수렴
- **예상 시간**: 10-40초 (1000 노드, 500 엣지 기준, weight 사용 시 더 느림)
- **병목 가능성**: 높음

**4-3. weakly_connected_components**
- **복잡도**: O(n+m)
- **예상 시간**: 1-3초
- **병목 가능성**: 낮음

**4-4. suggested_focus_node_id (다양도 계산)**
- **처리**: 각 노드의 이웃 라벨 집합 계산, 다양도 점수 산출
- **예상 시간**: 5-15초 (1000 노드 기준)
- **병목 가능성**: 중간

### 총 예상 시간

- **최적 케이스**: 5(Neo4j) + 1(캡) + 1(변환) + 1(degree) + 10(pagerank) + 2(components) + 5(다양도) = **25초**
- **일반 케이스**: 10(Neo4j) + 1(캡) + 2(변환) + 1(degree) + 25(pagerank) + 3(components) + 10(다양도) = **52초**
- **최악 케이스**: 15(Neo4j) + 1(캡) + 3(변환) + 1(degree) + 40(pagerank) + 3(components) + 15(다양도) = **78초**

**결론**: 일반 케이스에서도 60초 타임아웃에 근접하거나 초과 가능.

---

## 3. 근본 원인 (CTO 관점)

### 문제 1: pagerank 알고리즘 복잡도

- **NetworkX `pagerank`**: 반복 알고리즘으로 수렴까지 시간 소요.
- **weight 사용**: `use_edge_weight=True`로 `stockRatio`/`pct`를 weight로 사용하면 계산이 더 복잡해짐.
- **해결 방안**:
  - `node_cap`이 클 때(예: >500) pagerank 생략 또는 샘플링.
  - 또는 pagerank 반복 횟수 제한 (`max_iter` 파라미터).

### 문제 2: node_cap=1000이 너무 큼

- **현재**: `INITIAL_GRAPH_NODE_CAP = 1000`
- **NetworkX 분석 상한**: `MAX_NODES_FOR_HEAVY_ANALYSIS = 500` (betweenness만, pagerank는 제한 없음)
- **불일치**: 초기 로드는 1000개 노드로 분석하지만, betweenness는 500개에서만 실행.
- **해결 방안**: 초기 로드 `node_cap`을 500으로 낮추거나, pagerank도 상한 적용.

### 문제 3: 중복 node_labels

- **현재**: `node_labels=Stockholder&node_labels=Stockholder` (중복)
- **영향**: 백엔드에서 중복 필터링 처리 필요 (미미하지만 불필요한 오버헤드).
- **해결 방안**: 프론트에서 `Set`으로 중복 제거 후 전송.

### 문제 4: 동기 처리

- **현재**: Neo4j 쿼리 → NetworkX 분석을 **순차 실행**.
- **영향**: 각 단계가 끝나야 다음 단계 시작.
- **해결 방안**: 분석을 비동기/백그라운드로 처리하거나, 그래프만 먼저 반환 후 분석은 스트리밍/폴링.

---

## 4. 권장 수정사항 (확장성·유지보수성·협업)

### 즉시 적용 가능 (Low-hanging fruit)

1. **폴백 타임아웃 상수 추가**
   ```javascript
   // constants.js
   GRAPH_FALLBACK_TIMEOUT: 30000,  // 폴백 요청용 (분석 없으므로 더 빠름)
   ```

2. **node_labels 중복 제거**
   ```javascript
   // app.js loadData()
   const uniqueNodeLabels = Array.from(new Set(nodeLabels));
   ```

3. **초기 node_cap 조정**
   ```javascript
   // constants.js
   INITIAL_GRAPH_NODE_CAP: 500,  // 1000 → 500 (NetworkX 분석 상한과 일치)
   ```

### 중기 개선 (백엔드)

4. **pagerank 조건부 실행**
   ```python
   # backend/graph_analysis.py run_analysis()
   if include_pagerank and len(graph_data.nodes) <= MAX_NODES_FOR_PAGERANK:
       pr = nx.pagerank(G, weight=weight_key, max_iter=50)  # 반복 제한
   ```

5. **분석 비동기화** (선택)
   - 그래프만 먼저 반환 (`/api/graph`).
   - 분석은 별도 엔드포인트(`/api/graph/analysis`)로 폴링 또는 WebSocket.

### 장기 개선 (확장성)

6. **캐싱 전략**
   - 자주 조회되는 그래프(예: 전체 그래프)의 분석 결과 캐싱.
   - TTL 설정으로 데이터 신선도 유지.

7. **점진적 로딩**
   - 초기: 작은 `node_cap`(예: 200)로 빠르게 첫 화면 표시.
   - 백그라운드: 더 큰 `node_cap`으로 추가 로드.

---

## 5. 검증 체크리스트

- [ ] 폴백 타임아웃 상수 추가 (`GRAPH_FALLBACK_TIMEOUT`)
- [ ] `node_labels` 중복 제거 로직 추가
- [ ] `INITIAL_GRAPH_NODE_CAP` 1000 → 500 조정 검토
- [ ] 백엔드 pagerank 상한/반복 제한 추가 검토
- [ ] 타임아웃 발생 빈도 모니터링 (로깅)

---

## 관련 문서

- `CTO_BACKEND_NODE_DETAIL_PERFORMANCE.md`: 노드 상세 성능 이슈
- `CTO_GRAPH_TIMEOUT_REVIEW.md`: 그래프 타임아웃 이슈
- `CTO_NETWORKX_FIRST_VIEW_DIVERSE_FOCUS.md`: NetworkX 분석 활용
