# 빠른 해결 가이드: 연결 문제 및 로딩 멈춤

## 🔍 즉시 확인 사항

### 1. 브라우저 개발자 도구 확인 (가장 중요!)

**F12 키를 누르고 다음을 확인하세요:**

#### Console 탭
다음과 같은 로그가 보여야 합니다:
```
[App] 초기화 시작
[App] API Base URL: http://localhost:8000
[App] 하이브리드 디자인 적용됨
[APIClient] 헬스 체크 요청 시작
[APIClient] Base URL: http://localhost:8000
[APIClient] 요청 시작: http://localhost:8000/health
```

**에러가 있다면**:
- `Failed to fetch` → 백엔드 서버가 실행되지 않음
- `CORS error` → CORS 설정 문제
- `Timeout` → 백엔드 응답이 너무 느림

#### Network 탭
1. `/health` 요청 확인
   - 상태 코드: 200 (성공) 또는 다른 코드
   - 응답 시간: 얼마나 걸리는지
   - 요청 URL: `http://localhost:8000/health`인지 확인

2. `/api/graph` 요청 확인
   - 요청이 있는지 확인
   - 실패했다면 상태 코드 확인

### 2. 백엔드 서버 확인

터미널에서 확인:
```bash
# 백엔드 서버 상태 확인
./scripts/check-backend.sh

# 또는 직접 확인
curl http://localhost:8000/health
```

**예상 응답**:
```json
{
  "status": "healthy",
  "neo4j": "connected",
  "connection_info": {
    "status": "connected",
    "uri": "neo4j+s://..."
  }
}
```

### 3. 프론트엔드 서버 확인

포트 8080이 실행 중인지 확인:
```bash
lsof -ti :8080
```

## 🚨 일반적인 문제 및 해결

### 문제 1: 백엔드 서버가 실행되지 않음

**증상**: Console에 `Failed to fetch` 에러

**해결**:
```bash
./scripts/start-backend.sh
```

### 문제 2: CORS 에러

**증상**: Console에 `CORS policy` 에러

**확인**: 백엔드 `main.py`에서 CORS 설정 확인
```python
allow_origins=["*"]  # 이미 설정되어 있음
```

**해결**: 백엔드 서버 재시작

### 문제 3: API Base URL이 잘못됨

**증상**: Network 탭에서 잘못된 URL로 요청

**확인**: Console에서 `[APIClient] Base URL:` 확인

**해결**: 브라우저 콘솔에서 확인:
```javascript
window.API_BASE_URL  // undefined여야 함 (기본값 사용)
```

### 문제 4: 타임아웃

**증상**: 30초 후 타임아웃 에러

**해결**: 
- 백엔드 성능 확인
- Neo4j 쿼리 최적화
- 타임아웃 시간 증가 (필요시)

### 문제 5: 하이브리드 디자인이 보이지 않음

**증상**: 단계 인디케이터가 표시되지 않음

**확인**: Console에서 다음 로그 확인:
```
[App] 하이브리드 디자인 적용됨
[LoadingManager] 단계 인디케이터 업데이트: { variant: 'unified', ... }
```

**원인**: 로딩이 첫 단계에서 멈춰있어 다음 단계로 진행되지 않음

**해결**: 백엔드 연결 문제 해결 후 자동으로 해결됨

## 📋 체크리스트

### 즉시 확인
- [ ] 브라우저 개발자 도구 열기 (F12)
- [ ] Console 탭에서 에러 확인
- [ ] Network 탭에서 요청 상태 확인
- [ ] 백엔드 서버 실행 확인
- [ ] 프론트엔드 서버 실행 확인

### 문제 해결
- [ ] 백엔드 서버 재시작
- [ ] 프론트엔드 새로고침 (Ctrl+Shift+R)
- [ ] 브라우저 캐시 클리어
- [ ] 에러 메시지 공유 (해결되지 않는 경우)

## 🎯 다음 단계

1. **브라우저 개발자 도구 확인** (필수)
2. **에러 메시지 공유** (문제가 계속되면)
3. **백엔드 로그 확인** (서버 측 문제 확인)

디버깅 로그가 추가되었으므로, 브라우저 콘솔에서 정확한 문제를 확인할 수 있습니다.
