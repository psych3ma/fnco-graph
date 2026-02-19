# 연결 문제 해결 가이드

## 🔍 현재 상태

백엔드 서버가 실행되지 않고 있습니다. 다음 단계를 따라 해결하세요.

## ✅ 해결 단계

### 1단계: 백엔드 서버 시작

```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph

# 방법 1: 자동 스크립트 사용 (권장)
./scripts/start-backend.sh

# 방법 2: 수동 시작
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2단계: 서버 상태 확인

```bash
# 서버 상태 확인
./scripts/check-backend.sh

# 또는 직접 확인
curl http://localhost:8000/health
```

### 3단계: Neo4j 연결 확인

```bash
# Neo4j 연결 테스트
python3 scripts/test-neo4j-connection.py
```

### 4단계: 환경 변수 확인

`.env` 파일이 올바른지 확인:

```bash
# .env 파일 확인
cat .env

# 필수 변수 확인
echo $NEO4J_URI
echo $NEO4J_USER
echo $NEO4J_PASSWORD
```

## 🚨 일반적인 문제 및 해결

### 문제 1: 포트 충돌

**증상**: `ERROR: [Errno 48] Address already in use`

**해결**:
```bash
# 기존 프로세스 종료
./scripts/stop-backend.sh

# 또는 수동 종료
lsof -ti :8000 | xargs kill -9
```

### 문제 2: Neo4j 연결 실패

**증상**: `Neo4j 연결이 되지 않았습니다`

**해결**:
1. `.env` 파일 확인
2. Neo4j 서버 상태 확인
3. 네트워크 연결 확인

```bash
# Neo4j 연결 테스트
python3 scripts/test-neo4j-connection.py
```

### 문제 3: 의존성 누락

**증상**: `ModuleNotFoundError` 또는 `ImportError`

**해결**:
```bash
# 의존성 설치
./scripts/install-dependencies.sh

# 또는
pip install -r requirements.txt
```

### 문제 4: 환경 변수 누락

**증상**: `KeyError` 또는 `None` 값

**해결**:
```bash
# .env 파일 확인
cat .env

# .env.example 복사 (없는 경우)
cp .env.example .env

# 환경 변수 수정
nano .env  # 또는 원하는 에디터 사용
```

## 📋 체크리스트

### 백엔드 서버
- [ ] 서버 실행 중 (`./scripts/check-backend.sh`)
- [ ] 포트 8000 사용 가능
- [ ] `/health` 엔드포인트 응답 확인
- [ ] `/api/connection/status` 엔드포인트 응답 확인

### Neo4j 연결
- [ ] `.env` 파일에 Neo4j 설정 존재
- [ ] Neo4j 서버 접근 가능
- [ ] 인증 정보 올바름
- [ ] 연결 테스트 성공

### 프론트엔드 연결
- [ ] 백엔드 서버 실행 중
- [ ] CORS 설정 확인
- [ ] API Base URL 올바름 (`http://localhost:8000`)

## 🔧 상세 진단

### 1. 백엔드 서버 로그 확인

서버를 시작하면 다음과 같은 로그가 표시되어야 합니다:

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Neo4j 연결 성공
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2. Neo4j 연결 상태 확인

```bash
# 백엔드 서버 실행 후
curl http://localhost:8000/api/connection/status
```

예상 응답:
```json
{
  "status": "connected",
  "neo4j_version": "5.x.x",
  "database": "neo4j"
}
```

### 3. 프론트엔드에서 확인

브라우저 개발자 도구(F12)에서:
- Network 탭에서 API 요청 확인
- Console 탭에서 에러 메시지 확인

## 🎯 빠른 해결 명령어

```bash
# 전체 재시작
cd /Users/coruscatio/Desktop/demo/fnco-graph
./scripts/stop-backend.sh
./scripts/start-backend.sh

# 상태 확인
./scripts/check-backend.sh
```

## 📞 추가 도움

문제가 계속되면 다음 정보를 확인하세요:

1. **서버 로그**: 백엔드 서버 시작 시 출력되는 에러 메시지
2. **브라우저 콘솔**: F12 > Console 탭의 에러 메시지
3. **네트워크 탭**: F12 > Network 탭의 실패한 요청

## ✅ 성공 확인

다음 명령어들이 모두 성공하면 연결이 정상입니다:

```bash
# 1. 서버 상태
curl http://localhost:8000/health
# 응답: {"status":"healthy","neo4j":"connected"}

# 2. 연결 상태
curl http://localhost:8000/api/connection/status
# 응답: {"status":"connected",...}

# 3. 그래프 데이터
curl http://localhost:8000/api/graph?limit=10
# 응답: {"nodes":[...],"edges":[...]}
```
