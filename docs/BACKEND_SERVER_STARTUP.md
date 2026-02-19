# 백엔드 전문가 출신 CTO 관점: 서버 시작 문제 해결 가이드

## 🔴 Critical Issue: 서버가 실행되지 않음

### 문제 상황
```
curl: (28) Failed to connect to localhost port 8000 after 75000 ms: Couldn't connect to server
```

**원인**: 백엔드 서버가 실행되지 않았습니다.

## ✅ 해결 방법

### 방법 1: 자동화 스크립트 사용 (권장)

#### 1단계: 사전 체크 실행
```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph
./scripts/verify-backend-setup.sh
```

**기능**:
- ✅ Python 설치 확인
- ✅ 필수 파일 확인
- ✅ 의존성 설치 확인
- ✅ 환경 변수 확인
- ✅ 포트 사용 확인
- ✅ Neo4j 연결 테스트 (선택사항)

#### 2단계: 서버 시작
```bash
./scripts/start-backend.sh
```

**기능**:
- ✅ 포트 충돌 자동 감지 및 해결
- ✅ 가상 환경 자동 감지 및 활성화
- ✅ 상세한 에러 메시지
- ✅ 문제 해결 방법 제시

### 방법 2: 수동 시작

#### 1단계: 사전 확인
```bash
# 1. Python 설치 확인
python3 --version  # 3.8 이상 필요

# 2. 의존성 설치 확인
pip list | grep -E "fastapi|uvicorn|neo4j"

# 3. 환경 변수 확인
cat .env | grep NEO4J

# 4. 포트 확인
lsof -i :8000
```

#### 2단계: 의존성 설치 (필요시)
```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph

# 방법 A: 자동화 스크립트 사용 (권장)
./scripts/install-dependencies.sh

# 방법 B: 수동 설치
pip install -r requirements.txt
```

#### 3단계: 서버 시작
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## 🔍 문제 진단 체크리스트

### 즉시 확인 사항
- [ ] Python 설치 확인 (`python3 --version`)
- [ ] 의존성 설치 확인 (`pip list`)
- [ ] 환경 변수 확인 (`.env` 파일)
- [ ] 포트 사용 확인 (`lsof -i :8000`)
- [ ] 백엔드 디렉토리 확인 (`backend/main.py`)

### 상세 진단
```bash
# 사전 체크 스크립트 실행
./scripts/verify-backend-setup.sh

# 서버 상태 확인
./scripts/check-backend.sh

# Neo4j 연결 테스트
python3 scripts/test-neo4j-connection.py
```

## 🎯 백엔드 전문가 CTO 관점 권장사항

### 1. 시작 전 체크리스트

#### 필수 사항
1. **Python 환경**
   - Python 3.8 이상 설치
   - 가상 환경 권장 (선택사항)

2. **의존성**
   - `requirements.txt`의 모든 패키지 설치
   - 주요 패키지: fastapi, uvicorn, neo4j, pydantic

3. **환경 변수**
   - `.env` 파일 존재
   - `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` 설정

4. **포트**
   - 포트 8000 사용 가능
   - 충돌 시 자동 해결 (스크립트 사용 시)

### 2. 시작 프로세스 개선

#### 자동화 스크립트 활용
```bash
# 1. 사전 체크
./scripts/verify-backend-setup.sh

# 2. 서버 시작
./scripts/start-backend.sh

# 3. 상태 확인
./scripts/check-backend.sh
```

#### 수동 시작 (고급)
```bash
# 가상 환경 사용 (권장)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 서버 시작
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 에러 처리 개선

#### 시작 실패 시
1. **의존성 오류**: `pip install -r requirements.txt`
2. **포트 충돌**: `./scripts/start-backend.sh` (자동 해결)
3. **환경 변수 오류**: `.env` 파일 확인
4. **Neo4j 연결 오류**: `python3 scripts/test-neo4j-connection.py`

### 4. 모니터링 및 로깅

#### 서버 시작 확인
```bash
# 헬스 체크
curl http://localhost:8000/health

# 연결 상태
curl http://localhost:8000/api/connection/status

# API 문서
# 브라우저에서 http://localhost:8000/docs 접속
```

#### 로그 확인
- 서버 시작 시 콘솔에 로그 출력
- 에러 발생 시 상세 메시지 표시
- Neo4j 연결 상태 로깅

## 🚀 빠른 시작 (One-liner)

```bash
# 모든 체크 및 시작을 한 번에
cd /Users/coruscatio/Desktop/demo/fnco-graph && \
./scripts/verify-backend-setup.sh && \
./scripts/start-backend.sh
```

## 📝 협업을 위한 권장사항

### 1. 표준화된 프로세스
- ✅ 모든 개발자가 동일한 스크립트 사용
- ✅ 사전 체크로 문제 사전 방지
- ✅ 명확한 에러 메시지

### 2. 문서화
- ✅ 시작 가이드 제공
- ✅ 문제 해결 방법 문서화
- ✅ 체크리스트 제공

### 3. 자동화
- ✅ 사전 체크 스크립트
- ✅ 자동 시작 스크립트
- ✅ 상태 확인 스크립트

## ✅ 체크리스트

### 시작 전
- [ ] Python 3.8 이상 설치 확인
- [ ] 의존성 설치 (`pip install -r requirements.txt`)
- [ ] 환경 변수 설정 (`.env` 파일)
- [ ] 포트 8000 사용 가능 확인
- [ ] Neo4j 연결 테스트 (선택사항)

### 시작 후
- [ ] 서버 실행 확인 (`curl http://localhost:8000/health`)
- [ ] API 문서 확인 (`http://localhost:8000/docs`)
- [ ] 연결 상태 확인 (`curl http://localhost:8000/api/connection/status`)
- [ ] 프론트엔드 연결 테스트

## 🎉 결론

백엔드 전문가 CTO 관점에서 서버 시작 문제를 체계적으로 해결했습니다:

1. **사전 체크**: 시작 전 문제 사전 방지
2. **자동화**: 스크립트로 간편한 시작
3. **에러 처리**: 상세한 메시지 및 해결 방법
4. **문서화**: 명확한 가이드 제공

이제 서버를 안전하고 확실하게 시작할 수 있습니다!
