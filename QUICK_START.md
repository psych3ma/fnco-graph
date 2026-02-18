# 🚀 빠른 시작 가이드

## 실행 전 확인사항

1. ✅ Neo4j가 실행 중인지 확인
2. ✅ `.env` 파일에 Neo4j 연결 정보가 올바른지 확인
3. ✅ Python 의존성 설치 (`pip install -r requirements.txt`)

## 실행 단계

### 1단계: 백엔드 서버 실행 (필수)

터미널 1에서 실행:
```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**확인**: `http://localhost:8000/health` 접속 시 `{"status": "healthy", "neo4j": "connected"}` 응답 확인

### 2단계: 프론트엔드 웹앱 실행 (필수)

터미널 2에서 실행:
```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph/frontend/webapp
python -m http.server 8080
```

**확인**: 브라우저에서 `http://localhost:8080` 접속

### 3단계: Neo4j 데이터 준비 (선택사항)

**이미 데이터가 있다면**: 건너뛰어도 됩니다.

**데이터가 없다면**: Neo4j Browser에서 다음 쿼리 실행:

```cypher
// 샘플 데이터 생성
CREATE (c1:Company {id: '삼성전자', name: '삼성전자', type: 'company'})
CREATE (c2:Company {id: '우리금융지주', name: '우리금융지주', type: 'company'})
CREATE (p1:Person {id: '이재용', name: '이재용', type: 'person'})
CREATE (i1:Institution {id: '국민연금', name: '국민연금', type: 'institution'})

CREATE (p1)-[:HOLDS_SHARE {pct: 1.63}]->(c1)
CREATE (i1)-[:HOLDS_SHARE {pct: 6.73}]->(c1)
CREATE (i1)-[:HOLDS_SHARE {pct: 6.4}]->(c2)
```

## 한 번에 실행하기 (선택사항)

`start.sh` 스크립트를 만들어서 한 번에 실행할 수도 있습니다:

```bash
#!/bin/bash
# 백엔드 실행 (백그라운드)
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# 프론트엔드 실행
cd ../frontend/webapp && python -m http.server 8080

# 종료 시 백엔드도 함께 종료
trap "kill $BACKEND_PID" EXIT
```

## 문제 해결

### 백엔드가 시작되지 않음
- Neo4j 연결 확인: `.env` 파일의 `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` 확인
- 포트 8000이 이미 사용 중인지 확인: `lsof -i :8000`

### 프론트엔드가 데이터를 불러오지 않음
- 백엔드가 실행 중인지 확인: `curl http://localhost:8000/health`
- 브라우저 콘솔에서 에러 확인 (F12)
- CORS 문제일 수 있음 (백엔드 CORS 설정 확인)

### Neo4j 연결 실패
- Neo4j가 실행 중인지 확인
- URI 형식 확인 (`bolt://` 또는 `neo4j+s://`)
- 인증 정보 확인

## 현재 실행 중인 서비스 확인

```bash
# 백엔드 확인
curl http://localhost:8000/health

# 프론트엔드 확인
curl http://localhost:8080
```
