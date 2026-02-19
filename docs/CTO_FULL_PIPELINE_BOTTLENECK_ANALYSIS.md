# CTO 관점 전체 파이프라인 병목 분석: Neo4j → NetworkX → 백엔드 → 프론트엔드

확장성·일관성·유지보수성·호환성·협력코드 관점에서 전체 데이터 흐름의 병목 지점 분석.

---

## 1. 전체 파이프라인 개요

```
[프론트엔드] loadData()
  ↓ HTTP 요청 (60초 타임아웃)
[백엔드] GET /api/graph/analysis
  ↓
[백엔드] get_graph_data()
  ↓ Neo4j 쿼리
[Neo4j] MATCH (n)-[r]-(m) WHERE ... ORDER BY id(r) LIMIT 500
  ↓ 결과 반환 (records)
[백엔드] format_graph_data(records)
  ↓ GraphData 변환
[백엔드] run_analysis(GraphData)
  ↓ NetworkX 분석
[백엔드] JSON 응답 반환
  ↓ HTTP 응답
[프론트엔드] 데이터 수신
  ↓ 데이터 변환 (map/filter)
[프론트엔드] buildGraph()
  ↓ vis.js 초기화
[vis.js] 물리 엔진 안정화 (300 iterations)
  ↓ 완료
[프론트엔드] 그래프 표시
```

**현재 예상 총 소요 시간**: 22-77초 (일반 케이스: 52초)

---

## 2. 단계별 병목 분석

### 2.1 Neo4j 쿼리 단계 ⚠️ 중간 병목

**위치**: `backend/database.py:get_graph_data()`

**쿼리**:
```cypher
MATCH (n)-[r:HOLDS_SHARES|HAS_COMPENSATION]->(m)
WHERE 'Company' IN labels(n) OR 'Company' IN labels(m) OR ...
WITH n, r, m
ORDER BY id(r) SKIP $skip LIMIT $limit
RETURN n, r, m, labels(n), labels(m), type(r)
```

**병목 지점**:

1. **WHERE 절 복잡도**
   - `node_labels`가 많을수록 OR 조건 증가
   - 예: `['Company', 'Person', 'Stockholder', 'Stockholder']` → 8개 OR 조건
   - **영향**: 인덱스 활용 어려움, 전체 스캔 가능성

2. **ORDER BY id(r)**
   - 관계 ID 기준 정렬은 인덱스 없으면 느림
   - **영향**: 대량 데이터에서 정렬 비용 증가

3. **인덱스 부재 가능성**
   - 노드 라벨 인덱스: Neo4j 자동 생성 (일반적으로 있음)
   - 관계 타입 인덱스: 없을 수 있음
   - **영향**: 스캔 범위 증가

**예상 소요 시간**: 5-15초 (데이터 크기·인덱스에 따라)

**개선 방안**:
- ✅ `node_labels` 중복 제거 (이미 적용됨)
- 🔄 인덱스 확인 및 추가 (관계 타입, 노드 라벨)
- 🔄 WHERE 절 최적화 (라벨 필터를 MATCH 절로 이동)

---

### 2.2 백엔드 데이터 변환 단계 ⚠️ 낮은 병목

**위치**: `backend/service.py:format_graph_data()`

**처리**:
- 각 레코드마다 노드 추출 (n, m)
- 중복 체크 (`node_ids` set)
- 속성 변환 (extract_node_properties, extract_node_label 등)
- 엣지 생성

**병목 지점**:

1. **중복 체크 오버헤드**
   - `node_id not in node_ids` 체크: O(1)이지만 레코드마다 실행
   - **영향**: 500 레코드 × 2 노드 = 1000회 체크 (낮은 병목)

2. **속성 변환 복잡도**
   - `extract_node_properties`, `extract_node_label` 등 함수 호출
   - **영향**: 레코드마다 여러 함수 호출

**예상 소요 시간**: 1-3초

**개선 방안**:
- 🔄 속성 변환 최적화 (불필요한 함수 호출 제거)
- ✅ 현재 수준으로 충분 (낮은 병목)

---

### 2.3 NetworkX 분석 단계 ⚠️ 주요 병목 (최적화 완료)

**위치**: `backend/graph_analysis.py:run_analysis()`

**처리**:
- GraphData → NetworkX DiGraph 변환
- degree_centrality
- **pagerank** (주요 병목)
- weakly_connected_components
- 다양도 계산

**병목 지점**:

1. **pagerank** (최적화 완료 ✅)
   - **이전**: 순수 Python, 기본 파라미터 → 10-40초
   - **현재**: `pagerank_scipy` 사용, 파라미터 최적화, 500 노드 초과 시 생략
   - **예상**: 2-5초 (500 노드 이하) 또는 생략 (500 노드 초과)

2. **다양도 계산** (최적화 완료 ✅)
   - **이전**: 모든 노드에 대해 이웃 라벨 집합 계산 → 5-15초
   - **현재**: 500 노드 초과 시 상위 centrality 노드만 후보로 → 1-3초

**예상 소요 시간**: 5-15초 (500 노드 이하), 2-5초 (500 노드 초과, pagerank 생략)

**개선 방안**:
- ✅ `pagerank_scipy` 사용 (적용 완료)
- ✅ 파라미터 최적화 (적용 완료)
- ✅ 조건부 실행 (적용 완료)

---

### 2.4 프론트엔드 데이터 처리 단계 ✅ 낮은 병목

**위치**: `frontend/webapp/js/app.js:loadData()`

**처리**:
- `graphNodes.map(...)` 노드 변환
- `graphData.edges.filter(...)` 엣지 필터링
- `setGraphData()` 동기화

**병목 지점**:
- 없음 (단순 변환, O(n))

**예상 소요 시간**: <1초

**개선 방안**:
- ✅ 현재 수준으로 충분

---

### 2.5 vis.js 렌더링 단계 ⚠️ 주요 병목

**위치**: `frontend/webapp/js/core/graph-manager.js:buildGraph()`

**처리**:
- vis.js Network 초기화
- 물리 엔진 안정화 (`stabilization.iterations: 300`)
- forceAtlas2Based 레이아웃 계산

**병목 지점**:

1. **물리 엔진 안정화**
   - `stabilization.iterations: 300` → 300회 반복
   - **영향**: 노드 수에 비례하여 시간 증가
   - **예상**: 1000 노드 기준 5-15초

2. **forceAtlas2Based 계산**
   - 각 반복마다 노드 간 힘 계산
   - **복잡도**: O(n²) per iteration
   - **영향**: 노드 수가 많을수록 급격히 느려짐

**예상 소요 시간**: 5-15초 (1000 노드 기준)

**개선 방안**:
- 🔄 `stabilization.iterations` 감소 (300 → 100-150)
- 🔄 `stabilization.updateInterval` 증가 (25 → 50ms)
- 🔄 초기 로드 시 물리 엔진 비활성화 후 수동 fit

---

## 3. 종합 병목 분석

### 현재 예상 소요 시간 (1000 노드 기준)

| 단계 | 예상 시간 | 병목 수준 | 최적화 상태 |
|------|----------|----------|------------|
| **Neo4j 쿼리** | 5-15초 | 중간 | 🔄 개선 가능 |
| **데이터 변환** | 1-3초 | 낮음 | ✅ 충분 |
| **NetworkX 분석** | 2-5초 (500 노드 초과 시 생략) | 낮음 | ✅ 최적화 완료 |
| **프론트엔드 처리** | <1초 | 낮음 | ✅ 충분 |
| **vis.js 렌더링** | 5-15초 | **높음** | 🔄 개선 필요 |
| **총계** | **13-39초** | - | - |

**주요 병목**: vis.js 렌더링 (5-15초)

---

## 4. 즉시 적용 가능한 개선 방안

### 4.1 vis.js 안정화 최적화 ✅ 적용 완료

**위치**: `frontend/webapp/js/core/graph-manager.js:getNetworkOptions()`

**현재**:
```javascript
stabilization: {
  enabled: true,
  iterations: 300,  // 너무 많음
  updateInterval: 25,
  fit: true
}
```

**개선**:
```javascript
stabilization: {
  enabled: true,
  iterations: 100,  // 300 → 100 (CTO: 성능·UX 균형)
  updateInterval: 50,  // 25 → 50ms (렌더링 부하 감소)
  fit: true
}
```

**효과**: 렌더링 시간 5-15초 → 2-5초로 단축 (3-5배 개선)

**확장성**: 노드 수가 많을수록 효과 증가

**호환성**: vis.js 표준 옵션, 기존 동작 유지

**적용 상태**: ✅ `frontend/webapp/js/core/graph-manager.js`에 반영됨.

---

### 4.2 Neo4j 쿼리 최적화 🔄 선택적

**위치**: `backend/database.py:get_graph_data()`

**현재**:
```cypher
MATCH (n)-[r:HOLDS_SHARES|HAS_COMPENSATION]->(m)
WHERE 'Company' IN labels(n) OR 'Company' IN labels(m) OR ...
```

**개선** (라벨 필터를 MATCH 절로 이동):
```cypher
MATCH (n:Company|Person|Stockholder)-[r:HOLDS_SHARES|HAS_COMPENSATION]->(m:Company|Person|Stockholder)
WHERE true  // 또는 제거
```

**효과**: 인덱스 활용 개선, 쿼리 시간 5-15초 → 3-10초로 단축

**주의**: `node_labels`가 동적일 경우 복잡도 증가

---

### 4.3 초기 로드 node_cap 조정 🔄 검토 필요

**위치**: `frontend/webapp/js/config/constants.js`

**현재**:
```javascript
export const INITIAL_GRAPH_NODE_CAP = 1000;
```

**개선**:
```javascript
export const INITIAL_GRAPH_NODE_CAP = 500;  // 1000 → 500 (NetworkX 분석 상한과 일치)
```

**효과**:
- NetworkX 분석 시간 단축 (pagerank 생략)
- vis.js 렌더링 시간 단축 (노드 수 감소)
- 총 로딩 시간 13-39초 → 8-25초로 단축

**단점**: 초기 화면에 표시되는 노드 수 감소

**권장**: 사용자 요구사항에 따라 결정 (확장성 고려)

---

## 5. 중기 개선 방안

### 5.1 점진적 로딩 (Progressive Loading)

**개념**: 작은 데이터로 먼저 표시, 백그라운드에서 추가 로드

**구현**:
1. 초기: `node_cap=200`으로 빠르게 첫 화면 표시 (5-10초)
2. 백그라운드: `node_cap=500`으로 추가 로드 (10-20초)
3. 사용자 요청 시: `node_cap=1000`으로 전체 로드

**효과**: 첫 화면 표시 시간 13-39초 → 5-10초로 단축

**확장성**: 사용자 경험 개선, 서버 부하 분산

---

### 5.2 캐싱 전략

**위치**: 백엔드 (Redis 또는 인메모리)

**구현**:
- 동일한 파라미터(`limit`, `node_labels`, `relationship_types`, `node_cap`) 요청 시 캐시 반환
- TTL: 5-10분

**효과**: 동일 그래프 재요청 시 분석 시간 0초

**확장성**: 서버 부하 감소, 응답 시간 단축

---

### 5.3 비동기 분석 처리

**위치**: 백엔드 (ThreadPoolExecutor)

**구현**:
- NetworkX 분석을 별도 스레드에서 실행
- 그래프 데이터는 즉시 반환, 분석은 백그라운드 처리

**효과**: 첫 응답 시간 단축, 동시 요청 처리 능력 향상

**확장성**: GIL 경합 완화, CPU 코어 활용도 개선

---

## 6. 검증 체크리스트

### 즉시 적용 가능
- [x] vis.js `stabilization.iterations` 300 → 100 조정 ✅
- [x] vis.js `stabilization.updateInterval` 25 → 50ms 조정 ✅
- [ ] `INITIAL_GRAPH_NODE_CAP` 1000 → 500 조정 검토 (사용자 요구사항에 따라 결정)

### 중기 개선
- [ ] Neo4j 쿼리 최적화 (라벨 필터 MATCH 절 이동)
- [ ] 점진적 로딩 구현
- [ ] 캐싱 전략 추가
- [ ] 비동기 분석 처리

---

## 7. 성능 개선 예상 효과

| 개선 사항 | 현재 | 개선 후 | 개선율 |
|----------|------|---------|--------|
| **vis.js 안정화** | 5-15초 | 2-5초 | 3-5배 |
| **node_cap 조정** | 13-39초 | 8-25초 | 1.5-2배 |
| **종합 (안정화 + node_cap)** | 13-39초 | **5-12초** | **3-4배** |

**목표**: 첫 화면 표시 시간 **10초 이하** 달성

---

## 관련 문서

- `CTO_NETWORKX_PAGERANK_AND_SERVICE_CONFLICT.md`: NetworkX 분석 최적화
- `CTO_TIMEOUT_ANALYSIS_AND_HARDCODING_REVIEW.md`: 타임아웃 원인 분석
- `CTO_GRAPH_STRUCTURE_SINGLE_SOURCE.md`: 그래프 구조 단일 소스 원칙
