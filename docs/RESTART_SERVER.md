# 🔄 서버 재시작 가이드

## 문제: `/api/connection/status` 엔드포인트가 404를 반환함

### 원인
코드에 엔드포인트가 정의되어 있지만, 실행 중인 서버가 이전 버전의 코드를 사용하고 있습니다.

### 해결 방법

#### 1. 현재 실행 중인 서버 확인
```bash
# 포트 8000을 사용하는 프로세스 확인
lsof -i :8000

# 또는
ps aux | grep uvicorn
```

#### 2. 서버 재시작

**방법 A: 현재 터미널에서 재시작 (권장)**
```bash
# 1. 실행 중인 서버 종료 (Ctrl+C)
# 2. 재시작
cd /Users/coruscatio/Desktop/demo/fnco-graph/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**방법 B: 프로세스 종료 후 재시작**
```bash
# 1. 프로세스 종료
pkill -f "uvicorn.*main:app"

# 2. 재시작
cd /Users/coruscatio/Desktop/demo/fnco-graph/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**방법 C: 자동화 스크립트 사용 (권장)**
```bash
# 포트 충돌 자동 감지 및 해결
./scripts/start-backend.sh

# 서버 종료
./scripts/stop-backend.sh

# 서버 상태 확인
./scripts/check-backend.sh
```

#### 3. 엔드포인트 확인

서버 재시작 후:
```bash
# 헬스 체크
curl http://localhost:8000/health

# 연결 상태 엔드포인트 확인
curl http://localhost:8000/api/connection/status
```

**예상 응답**:
```json
{
  "status": "connected",
  "connected": true,
  "uri": "bolt://localhost:7687",
  "retry_count": 0
}
```

또는 연결 실패 시:
```json
{
  "status": "disconnected",
  "connected": false,
  "uri": "masked",
  "retry_count": 0,
  "error": {
    "message": "...",
    "type": "network_error"
  }
}
```

## 협업을 위한 권장사항

### 개발 환경
- `--reload` 플래그 사용: 코드 변경 시 자동 재시작
- 하지만 때로는 수동 재시작이 필요할 수 있음

### 프로덕션 환경
- 서버 재시작 시 무중단 배포 고려
- 헬스 체크 엔드포인트로 서버 상태 모니터링
- 로드 밸런서와 함께 사용 시 점진적 배포

### 코드 변경 후 체크리스트
1. ✅ 서버 재시작 확인
2. ✅ `/health` 엔드포인트 응답 확인
3. ✅ `/api/connection/status` 엔드포인트 응답 확인
4. ✅ 프론트엔드에서 API 호출 테스트
