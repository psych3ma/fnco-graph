# Neo4j 통합 가이드

## 개선 사항 요약

### ✅ 완료된 작업

1. **Neo4j 쿼리 최적화**
   - Connection pooling 활용
   - 트랜잭션 관리 개선
   - 인덱스 활용 쿼리
   - 배치 처리 지원

2. **노드 식별자 개선**
   - 내부 ID 대신 property 기반 ID 사용
   - `id`, `name`, `title` 속성 우선순위 지원
   - 안정적인 노드 참조

3. **백엔드 API 개선**
   - 에러 핸들링 강화
   - 로깅 추가
   - 헬스 체크 엔드포인트
   - 통계 API 추가
   - Ego 그래프 지원

4. **프론트엔드 연동**
   - 실제 API 호출로 전환
   - 에러 핸들링
   - 로딩 상태 관리
   - 폴백 처리

## 주요 변경사항

### 백엔드 (`backend/`)

#### `database.py`
- Connection pooling 설정
- 세션 컨텍스트 매니저
- 최적화된 쿼리 메서드
- Ego 그래프 지원
- 통계 조회 기능

#### `service.py`
- Property 기반 노드 ID 추출
- 안정적인 데이터 변환
- 에러 핸들링 강화

#### `main.py`
- RESTful API 엔드포인트
- 쿼리 파라미터 검증
- 상세한 에러 메시지

### 프론트엔드 (`frontend/webapp/`)

#### `api-client.js` (신규)
- 통합 API 클라이언트
- 에러 핸들링
- 타입 안전성

#### `app.js`
- 실제 API 호출로 전환
- 동적 데이터 로딩
- 필터 연동

## 사용 방법

### 1. Neo4j 데이터 준비

데이터는 다음 형식을 따라야 합니다:

```cypher
// 노드 생성 예시
CREATE (c1:Company {id: '삼성전자', name: '삼성전자', type: 'company'})
CREATE (p1:Person {id: '이재용', name: '이재용', type: 'person'})
CREATE (i1:Institution {id: '국민연금', name: '국민연금', type: 'institution'})

// 관계 생성 예시
CREATE (p1)-[:HOLDS_SHARE {pct: 1.63}]->(c1)
CREATE (i1)-[:HOLDS_SHARE {pct: 6.73}]->(c1)
```

### 2. 인덱스 생성 (성능 최적화)

```cypher
// 노드 ID 인덱스
CREATE INDEX node_id_index IF NOT EXISTS FOR (n:Node) ON (n.id)
CREATE INDEX company_id_index IF NOT EXISTS FOR (n:Company) ON (n.id)
CREATE INDEX person_id_index IF NOT EXISTS FOR (n:Person) ON (n.id)
CREATE INDEX institution_id_index IF NOT EXISTS FOR (n:Institution) ON (n.id)

// 검색 속성 인덱스
CREATE INDEX node_name_index IF NOT EXISTS FOR (n:Node) ON (n.name)
CREATE INDEX node_title_index IF NOT EXISTS FOR (n:Node) ON (n.title)
```

### 3. 백엔드 실행

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 프론트엔드 실행

```bash
cd frontend/webapp
python -m http.server 8080
# 또는
npx serve .
```

## API 엔드포인트

### 그래프 데이터 조회
```
GET /api/graph?limit=100&node_labels=Company&node_labels=Person
```

### 그래프 검색
```
GET /api/graph/search?search=삼성전자&limit=50
```

### 노드 상세 정보
```
GET /api/node/{node_id}?id_property=id
```

### Ego 그래프
```
GET /api/node/{node_id}/ego?depth=1&limit=100
```

### 통계
```
GET /api/statistics
```

### 챗봇
```
POST /api/chat
{
  "message": "지분율 50% 이상인 최대주주 목록을 보여줘",
  "context": {"node_id": "삼성전자"}
}
```

## 성능 최적화 팁

### 1. 인덱스 활용
- 자주 검색하는 속성에 인덱스 생성
- 복합 인덱스 고려

### 2. 쿼리 최적화
- `LIMIT` 절 필수 사용
- 불필요한 관계 탐색 방지
- 라벨 필터링 활용

### 3. 배치 처리
- 대량 데이터는 페이지네이션 사용
- 클라이언트 측 캐싱 고려

## 문제 해결

### 연결 오류
- `.env` 파일의 Neo4j URI 확인
- 네트워크 연결 확인
- 인증 정보 확인

### 데이터가 표시되지 않음
- Neo4j에 데이터가 있는지 확인
- 노드 ID property 이름 확인 (`id`, `name`, `title`)
- 브라우저 콘솔 에러 확인

### 성능 문제
- 인덱스 생성 확인
- `limit` 파라미터 조정
- 쿼리 최적화

## 다음 단계

1. **캐싱**: Redis를 통한 쿼리 결과 캐싱
2. **실시간 업데이트**: WebSocket을 통한 실시간 그래프 업데이트
3. **고급 쿼리**: 복잡한 그래프 분석 쿼리 추가
4. **권한 관리**: 사용자별 데이터 접근 제어
