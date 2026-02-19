# CTO 관점 타임아웃 근본 원인 분석 및 해결 방안

확장성·유지보수성·협업코드 관점에서 지속적인 타임아웃 문제의 근본 원인 분석 및 체계적 해결 방안.

---

## 현재 상황

### 적용한 즉시 대응 조치
- `INITIAL_GRAPH_EDGE_LIMIT`: 500 → 200
- `INITIAL_GRAPH_NODE_CAP`: 500 → 200
- `GRAPH_FALLBACK_TIMEOUT`: 30초 → 20초
- 폴백 요청: 최대 100개 엣지/노드

### 여전히 발생하는 문제
- 60초 타임아웃 발생
- 폴백 요청도 실패
- 데이터를 불러올 수 없는 상태

---

## 근본 원인 분석 (CTO 관점)

### 1. 백엔드 응답 부재 가능성 ⚠️ **가장 가능성 높음**

**증상**:
- 헬스 체크는 성공하지만 `/api/graph/analysis`는 타임아웃
- 폴백 요청(`/api/graph`)도 타임아웃

**가능한 원인**:
1. **Neo4j 쿼리가 실제로 매우 느림**
   - 인덱스 부재
   - 대량 데이터 스캔
   - 복잡한 WHERE 절

2. **백엔드 프로세스가 블로킹됨**
   - 동기 처리로 인한 블로킹
   - GIL 경합 (Python)
   - 메모리 부족

3. **NetworkX 분석이 여전히 느림**
   - pagerank가 여전히 실행됨 (200 노드라도)
   - 메모리 부족

**확인 필요**:
- 백엔드 로그 확인
- Neo4j 쿼리 실행 시간 확인
- 서버 리소스 사용량 확인

---

### 2. 프론트엔드 타임아웃 설정 문제

**현재 설정**:
- `GRAPH_REQUEST_TIMEOUT`: 60초
- `GRAPH_FALLBACK_TIMEOUT`: 20초

**문제점**:
- 백엔드가 실제로 응답하지 않으면 타임아웃만 발생
- 타임아웃 후 재시도 없음
- 사용자에게 명확한 피드백 부족

---

### 3. 진단 및 모니터링 부족

**현재 상태**:
- 백엔드 로깅은 있지만 성능 메트릭 부족
- 쿼리 실행 시간 로깅 없음
- 단계별 소요 시간 추적 없음

**필요 사항**:
- 각 단계별 소요 시간 로깅
- 쿼리 실행 시간 측정
- 에러 발생 시점 추적

---

## 체계적 해결 방안

### 즉시 적용 가능 (High Priority)

#### 1. 백엔드 성능 로깅 강화 ✅

**목적**: 각 단계별 소요 시간 측정 및 로깅

**구현**:
```python
# backend/main.py
import time

@app.get("/api/graph/analysis")
async def get_graph_with_analysis(...):
    start_time = time.time()
    try:
        # Neo4j 쿼리 시간 측정
        query_start = time.time()
        graph_data = get_graph_data(...)
        query_time = time.time() - query_start
        logger.info(f"[Performance] Neo4j 쿼리 시간: {query_time:.2f}초")
        
        # NetworkX 분석 시간 측정
        analysis_start = time.time()
        analysis = run_analysis(...)
        analysis_time = time.time() - analysis_start
        logger.info(f"[Performance] NetworkX 분석 시간: {analysis_time:.2f}초")
        
        total_time = time.time() - start_time
        logger.info(f"[Performance] 총 처리 시간: {total_time:.2f}초")
        
        return {"graph": graph_data.model_dump(), "analysis": analysis}
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[Performance] 실패 (소요 시간: {elapsed:.2f}초): {e}")
        raise
```

**효과**:
- 각 단계별 병목 지점 파악
- 성능 개선 방향 제시
- 디버깅 시간 단축

---

#### 2. 더 작은 초기값으로 시작하는 옵션 추가 ✅

**목적**: 타임아웃 방지를 위한 최소한의 데이터라도 표시

**구현**:
```javascript
// frontend/webapp/js/config/constants.js
export const INITIAL_GRAPH_EDGE_LIMIT = 50;   // 200 → 50 (타임아웃 방지)
export const INITIAL_GRAPH_NODE_CAP = 50;     // 200 → 50 (타임아웃 방지)
```

**효과**:
- 최소한의 데이터라도 빠르게 표시
- 타임아웃 발생 가능성 최소화

---

#### 3. 단계별 타임아웃 및 재시도 전략 ✅

**목적**: 각 단계별로 적절한 타임아웃 및 재시도

**구현**:
```javascript
// frontend/webapp/js/app.js
async loadData() {
  // 1단계: 매우 작은 데이터로 시작 (10초 타임아웃)
  try {
    const minimalResult = await apiClient.getGraphData(
      50,  // 최소한의 엣지
      nodeLabels,
      relationshipTypes,
      0,
      50,  // 최소한의 노드
      { timeout: 10000 }  // 10초 타임아웃
    );
    // 최소한의 데이터라도 표시
    this.setGraphData(minimalResult.nodes, minimalResult.edges);
  } catch (error) {
    // 최소 요청도 실패하면 백엔드 문제
    loadingManager.showError('백엔드 서버가 응답하지 않습니다. 서버 상태를 확인하세요.');
    return;
  }
  
  // 2단계: 백그라운드에서 추가 데이터 로드
  // ...
}
```

**효과**:
- 최소한의 데이터라도 빠르게 표시
- 사용자 경험 개선

---

### 중기 개선 (Medium Priority)

#### 4. 백엔드 비동기 처리 개선

**목적**: 동기 블로킹 문제 해결

**구현**:
```python
# backend/main.py
from concurrent.futures import ThreadPoolExecutor
import asyncio

executor = ThreadPoolExecutor(max_workers=2)

@app.get("/api/graph/analysis")
async def get_graph_with_analysis(...):
    # NetworkX 분석을 별도 스레드에서 실행
    loop = asyncio.get_event_loop()
    analysis = await loop.run_in_executor(
        executor,
        run_analysis,
        graph_data,
        True, True, False, True, True
    )
    return {"graph": graph_data.model_dump(), "analysis": analysis}
```

**효과**:
- 동시 요청 처리 능력 향상
- GIL 경합 완화

---

#### 5. Neo4j 쿼리 최적화

**목적**: 쿼리 실행 시간 단축

**구현**:
- 인덱스 추가
- 쿼리 최적화
- EXPLAIN 쿼리로 계획 확인

**효과**:
- 쿼리 실행 시간 단축
- 타임아웃 발생 가능성 감소

---

### 장기 개선 (Long-term)

#### 6. 점진적 로딩 구현

**목적**: 작은 데이터로 먼저 표시, 백그라운드에서 추가 로드

**효과**:
- 첫 화면 표시 시간 단축
- 사용자 경험 개선

---

#### 7. 캐싱 전략

**목적**: 동일한 요청에 대한 빠른 응답

**효과**:
- 응답 시간 단축
- 서버 부하 감소

---

## 즉시 적용 가능한 수정 사항

### 1. 백엔드 성능 로깅 추가 ✅

**파일**: `backend/main.py`

**변경 내용**:
- 각 단계별 소요 시간 로깅
- 쿼리 실행 시간 측정
- 에러 발생 시점 추적

### 2. 더 작은 초기값 설정 ✅

**파일**: `frontend/webapp/js/config/constants.js`

**변경 내용**:
- `INITIAL_GRAPH_EDGE_LIMIT`: 200 → 50
- `INITIAL_GRAPH_NODE_CAP`: 200 → 50

### 3. 단계별 타임아웃 전략 ✅

**파일**: `frontend/webapp/js/app.js`

**변경 내용**:
- 최소 요청 (50개, 10초 타임아웃) 먼저 시도
- 성공 시 추가 데이터 로드

---

## 진단 체크리스트

### 백엔드 확인 필요
- [ ] 백엔드 서버가 실행 중인지 확인
- [ ] 백엔드 로그 확인 (에러 메시지)
- [ ] Neo4j 연결 상태 확인
- [ ] 서버 리소스 사용량 확인 (CPU, 메모리)

### 쿼리 성능 확인
- [ ] Neo4j 쿼리 실행 시간 확인
- [ ] 인덱스 활용 여부 확인
- [ ] EXPLAIN 쿼리로 계획 확인

### 네트워크 확인
- [ ] 프론트엔드-백엔드 연결 확인
- [ ] 백엔드-Neo4j 연결 확인
- [ ] 방화벽 설정 확인

---

## 권장 사항

### 즉시 적용
1. ✅ 백엔드 성능 로깅 추가
2. ✅ 더 작은 초기값 설정 (50개)
3. ✅ 단계별 타임아웃 전략

### 중기 개선
1. 백엔드 비동기 처리 개선
2. Neo4j 쿼리 최적화
3. 점진적 로딩 구현

### 장기 개선
1. 캐싱 전략
2. 모니터링 시스템 구축
3. 자동 스케일링

---

## 관련 문서

- `CTO_IMMEDIATE_TIMEOUT_FIX.md`: 즉시 대응 조치
- `CTO_FULL_PIPELINE_BOTTLENECK_ANALYSIS.md`: 전체 파이프라인 병목 분석
- `CTO_NETWORKX_PAGERANK_AND_SERVICE_CONFLICT.md`: NetworkX 분석 최적화
