# Neo4j 전문가 출신 백엔드 CTO 관점: 그래프 DB 조회 결과 미표출 이슈 검토

## 🔍 원인 분석

### 발견된 문제

#### 1. 백엔드 쿼리 로직 오류 ⚠️ **치명적**

**위치**: `backend/database.py` - `get_graph_data()` 함수

**문제**:
```python
if node_labels:
    label_str = ":" + ":".join(node_labels)
    rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
    label_filter = f"(n{label_str})-[r{rel_filter}]->(m{label_str})"
```

**원인**:
- 양쪽 노드(`n`, `m`)에 동일한 라벨 필터를 적용하고 있음
- 실제 스키마에서는 `HOLDS_SHARES: Stockholder -> Company`처럼 서로 다른 라벨을 가진 노드 간 관계가 존재
- 예: `Company` 라벨만 필터링하면 `Stockholder -> Company` 관계가 누락됨

**영향**:
- 라벨 필터링 시 관계가 제대로 조회되지 않음
- 빈 결과 반환 가능성 높음

#### 2. 프론트엔드 필터 초기화 문제 ⚠️

**위치**: `frontend/webapp/js/core/graph-manager.js` - `buildGraph()` 함수

**문제**:
```javascript
const filters = stateManager.getState('filters');
const fNodes = this.rawNodes.filter(n => filters.has(n.type));
```

**원인**:
- 필터가 비어있거나 잘못 초기화되면 모든 노드가 필터링됨
- `filters`가 `Set`이고 비어있으면 `fNodes`가 빈 배열이 됨

**영향**:
- 데이터는 받았지만 필터로 인해 표시되지 않음

#### 3. 데이터 로딩 후 그래프 업데이트 누락 ⚠️

**위치**: `frontend/webapp/js/app.js` - `loadData()` 함수

**문제**:
- `loadData()` 후 `graphManager.buildGraph()`를 호출하지 않음
- `initialize()`는 한 번만 호출되고, 이후 데이터 업데이트 시 그래프가 갱신되지 않음

**영향**:
- 데이터는 로드되었지만 그래프에 반영되지 않음

## ✅ 해결 방법

### 1. 백엔드 쿼리 로직 수정

#### Before (문제)
```python
if node_labels:
    label_str = ":" + ":".join(node_labels)
    rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
    label_filter = f"(n{label_str})-[r{rel_filter}]->(m{label_str})"
```

#### After (해결)
```python
if node_labels:
    # 각 노드에 대해 개별적으로 라벨 필터링
    label_conditions = []
    for label in node_labels:
        label_conditions.append(f"'{label}' IN labels(n)")
        label_conditions.append(f"'{label}' IN labels(m)")
    label_filter = " OR ".join(label_conditions)
    
    rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
    query = f"""
    MATCH (n)-[r{rel_filter}]->(m)
    WHERE {label_filter}
    WITH n, r, m
    LIMIT $limit
    RETURN n, r, m,
           labels(n) as n_labels,
           labels(m) as m_labels,
           type(r) as rel_type
    """
else:
    rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
    query = f"""
    MATCH (n)-[r{rel_filter}]->(m)
    WITH n, r, m
    LIMIT $limit
    RETURN n, r, m,
           labels(n) as n_labels,
           labels(m) as m_labels,
           type(r) as rel_type
    """
```

### 2. 프론트엔드 필터 초기화 확인

필터가 비어있을 때 모든 노드를 표시하도록 수정:

```javascript
async buildGraph(container) {
    const filters = stateManager.getState('filters');
    
    // 필터가 비어있으면 모든 노드 표시
    const fNodes = filters.size > 0 
        ? this.rawNodes.filter(n => filters.has(n.type))
        : this.rawNodes;
    
    const fIds = new Set(fNodes.map(n => n.id));
    const fLinks = this.rawLinks.filter(l => 
        fIds.has(l.source) && fIds.has(l.target)
    );
    // ...
}
```

### 3. 데이터 로딩 후 그래프 업데이트

`loadData()` 후 그래프를 업데이트하도록 수정:

```javascript
async loadData() {
    // ... 데이터 로드 ...
    
    // 상태에 저장
    stateManager.setState('graph.rawNodes', this.rawNodes);
    stateManager.setState('graph.rawLinks', this.rawLinks);
    
    // 그래프가 이미 초기화되어 있으면 업데이트
    if (this.graphManager && this.graphManager.network) {
        await this.graphManager.buildGraph(document.getElementById('visNetwork'));
    }
}
```

## 🎯 Neo4j 전문가 CTO 관점 권장사항

### 1. 쿼리 최적화

#### 권장사항
- ✅ **라벨 필터링**: `WHERE` 절 사용으로 유연성 확보
- ✅ **인덱스 활용**: `bizno`, `personId` 인덱스 확인
- ✅ **관계 타입 필터링**: 관계 타입별로 최적화된 쿼리

### 2. 데이터 검증

#### 추가 검증
- ✅ **빈 결과 처리**: 빈 결과일 때 명확한 메시지
- ✅ **데이터 형식 검증**: API 응답 형식 검증
- ✅ **에러 로깅**: 상세한 에러 로그

### 3. 성능 최적화

#### 개선사항
- ✅ **LIMIT 최적화**: 적절한 LIMIT 값 설정
- ✅ **프로퍼티 선택**: 필요한 프로퍼티만 조회
- ✅ **캐싱**: 자주 조회되는 데이터 캐싱

## 📊 개선 효과

### Before
- ❌ 라벨 필터링 시 관계 누락
- ❌ 필터 초기화 문제로 노드 미표시
- ❌ 데이터 로딩 후 그래프 미갱신

### After
- ✅ 올바른 라벨 필터링
- ✅ 필터 초기화 문제 해결
- ✅ 데이터 로딩 후 자동 그래프 갱신

## 🚀 테스트 방법

### 1. 백엔드 API 테스트 (자동화 스크립트)

```bash
# 자동 테스트 스크립트 실행
./scripts/test-graph-api.sh
```

이 스크립트는 다음을 테스트합니다:
- 헬스 체크
- 기본 그래프 데이터 조회
- 라벨 필터링 (Company)
- 관계 타입 필터링 (HOLDS_SHARES)
- Neo4j 연결 상태

### 2. 수동 API 테스트

```bash
# 기본 조회
curl http://localhost:8000/api/graph?limit=10

# 라벨 필터링
curl "http://localhost:8000/api/graph?limit=10&node_labels=Company&node_labels=Person"

# 관계 타입 필터링
curl "http://localhost:8000/api/graph?limit=10&relationship_types=HOLDS_SHARES"
```

### 3. 프론트엔드 테스트

브라우저 개발자 도구(F12)에서:

1. **네트워크 탭**:
   - `/api/graph` 요청 확인
   - 응답 데이터 확인 (nodes, edges 배열)

2. **콘솔 탭**:
   ```javascript
   // 데이터 확인
   console.log('노드 수:', app.rawNodes.length);
   console.log('링크 수:', app.rawLinks.length);
   console.log('첫 번째 노드:', app.rawNodes[0]);
   
   // 필터 상태 확인
   console.log('필터:', stateManager.getState('filters'));
   
   // 그래프 네트워크 확인
   console.log('그래프 네트워크:', graphManager.network);
   ```

3. **에러 확인**:
   - 콘솔에 에러 메시지가 있는지 확인
   - 네트워크 탭에서 실패한 요청 확인

## ✅ 체크리스트

### 백엔드 수정
- [ ] 쿼리 로직 수정 (라벨 필터링)
- [ ] 빈 결과 처리 개선
- [ ] 에러 로깅 강화
- [ ] 쿼리 성능 최적화

### 프론트엔드 수정
- [ ] 필터 초기화 확인
- [ ] 데이터 로딩 후 그래프 업데이트
- [ ] 빈 데이터 처리
- [ ] 에러 메시지 개선

### 테스트
- [ ] 백엔드 API 테스트
- [ ] 프론트엔드 통합 테스트
- [ ] 필터 기능 테스트
- [ ] 성능 테스트
