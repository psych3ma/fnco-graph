# 빠른 연결 문제 해결

## 🚀 즉시 실행

```bash
cd /Users/coruscatio/Desktop/demo/fnco-graph

# 1. 기존 프로세스 정리
./scripts/stop-backend.sh

# 2. 백엔드 서버 시작
./scripts/start-backend.sh
```

## ✅ 확인

서버가 시작되면 다음을 확인하세요:

1. **터미널에서 확인**:
   ```
   ✅ 포트 8000 사용 가능
   🌐 서버 시작: http://localhost:8000
   📚 API 문서: http://localhost:8000/docs
   ```

2. **브라우저에서 확인**:
   - http://localhost:8000/docs 접속
   - http://localhost:8000/health 접속

3. **프론트엔드에서 확인**:
   - 웹앱 새로고침
   - 개발자 도구(F12) > Network 탭에서 API 요청 확인

## 🔍 문제가 계속되면

### Neo4j 연결 문제
```bash
# Neo4j 연결 테스트
python3 scripts/test-neo4j-connection.py
```

### 포트 충돌
```bash
# 포트 사용 확인
lsof -i :8000

# 강제 종료
./scripts/stop-backend.sh
```

### 의존성 문제
```bash
# 의존성 재설치
./scripts/install-dependencies.sh
```

## 📝 로그 확인

서버 시작 시 다음 로그가 보여야 합니다:

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Neo4j 연결 성공
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

만약 `Neo4j 연결 실패`가 보이면:
1. `.env` 파일 확인
2. Neo4j 서버 상태 확인
3. 네트워크 연결 확인
