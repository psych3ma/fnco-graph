# 🔧 포트 충돌 해결 가이드 (CTO 관점)

## 문제 상황

```
ERROR: [Errno 48] Address already in use
```

포트 8000이 이미 사용 중일 때 발생하는 오류입니다.

## 원인 분석

### 1. 프로세스 관리 부재
- 이전 서버 인스턴스가 종료되지 않음
- 백그라운드 프로세스가 남아있음
- 다른 애플리케이션이 동일 포트 사용

### 2. 협업 환경 문제
- 여러 개발자가 동일 포트 사용
- 서버 재시작 프로세스 불명확
- 포트 충돌 감지 및 해결 자동화 부재

## 해결 방법

### 방법 1: 자동화 스크립트 사용 (권장)

#### 서버 시작
```bash
./scripts/start-backend.sh
```

**기능**:
- 포트 충돌 자동 감지
- 프로세스 정보 표시
- 사용자 확인 후 자동 종료
- 안전한 서버 시작

#### 서버 종료
```bash
./scripts/stop-backend.sh
```

**기능**:
- 실행 중인 서버 안전 종료
- 프로세스 확인 및 종료
- 종료 상태 확인

#### 서버 상태 확인
```bash
./scripts/check-backend.sh
```

**기능**:
- 포트 사용 상태 확인
- 헬스 체크
- 연결 상태 확인

### 방법 2: 수동 해결

#### 1. 포트 사용 확인
```bash
# 포트 8000을 사용하는 프로세스 확인
lsof -i :8000

# 또는
lsof -ti :8000
```

#### 2. 프로세스 종료
```bash
# 프로세스 ID 확인
PID=$(lsof -ti :8000)

# 프로세스 종료 (SIGTERM)
kill $PID

# 강제 종료 (SIGKILL) - 위 방법이 작동하지 않을 때만
kill -9 $PID
```

#### 3. uvicorn 프로세스 종료
```bash
# uvicorn 프로세스만 종료
pkill -f "uvicorn.*main:app"

# 또는 특정 포트의 uvicorn만 종료
lsof -ti :8000 | xargs kill
```

### 방법 3: 다른 포트 사용

```bash
# 포트 8001 사용
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

**주의**: 프론트엔드의 API URL도 변경해야 합니다.

## 협업을 위한 권장사항

### 1. 표준화된 서버 관리
- ✅ `scripts/start-backend.sh` 사용
- ✅ `scripts/stop-backend.sh` 사용
- ✅ 포트 충돌 자동 감지 및 해결

### 2. 개발 환경 분리
- 각 개발자는 다른 포트 사용 고려
- 환경 변수로 포트 설정 가능하도록 구성
- `.env` 파일에 포트 설정 추가

### 3. 문서화
- 서버 시작/종료 프로세스 명확히 문서화
- 포트 충돌 해결 방법 가이드 제공
- 문제 발생 시 빠른 해결 가능하도록

### 4. 모니터링
- 서버 상태 확인 스크립트 제공
- 헬스 체크 엔드포인트 활용
- 로그 확인 방법 문서화

## 환경 변수 기반 포트 설정 (향후 개선)

### `.env` 파일에 추가
```bash
BACKEND_PORT=8000
FRONTEND_PORT=8080
```

### `backend/main.py` 수정
```python
import os
from dotenv import load_dotenv

load_dotenv()
PORT = int(os.getenv("BACKEND_PORT", 8000))
```

### 실행 시
```bash
uvicorn main:app --reload --host 0.0.0.0 --port $BACKEND_PORT
```

## 프로덕션 환경 고려사항

### 1. 프로세스 관리자 사용
- **systemd** (Linux)
- **supervisor**
- **PM2** (Node.js 기반이지만 Python도 지원)

### 2. 포트 바인딩
- 특정 인터페이스에만 바인딩
- 방화벽 규칙 설정
- 로드 밸런서와 통합

### 3. 무중단 배포
- Blue-Green 배포
- Rolling 배포
- 헬스 체크 기반 트래픽 전환

## 체크리스트

서버 시작 전:
- [ ] 이전 서버 인스턴스 종료 확인
- [ ] 포트 사용 상태 확인
- [ ] 환경 변수 설정 확인
- [ ] 의존성 설치 확인

서버 시작 후:
- [ ] 헬스 체크 응답 확인
- [ ] 연결 상태 확인
- [ ] 로그 확인
- [ ] 프론트엔드 연결 테스트

## 문제 해결 순서

1. **포트 충돌 감지**: `lsof -i :8000`
2. **프로세스 확인**: `ps aux | grep uvicorn`
3. **안전 종료 시도**: `kill $PID`
4. **강제 종료 (필요시)**: `kill -9 $PID`
5. **재시작**: `./scripts/start-backend.sh`

## 추가 리소스

- [Uvicorn 문서](https://www.uvicorn.org/)
- [FastAPI 배포 가이드](https://fastapi.tiangolo.com/deployment/)
- [프로세스 관리 모범 사례](https://12factor.net/processes)
