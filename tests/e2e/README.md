# E2E 테스트 가이드

## 🚀 빠른 시작

### 1. 사전 요구사항
- Node.js >= 18.0.0
- 백엔드 서버 실행 중 (`http://localhost:8000`)
- 프론트엔드 서버 실행 중 (`http://localhost:8080`)

### 2. 설치
```bash
cd tests/e2e
npm install
npx playwright install --with-deps
```

### 3. 테스트 실행
```bash
# 전체 테스트 실행
npm test

# Chromium만 실행 (빠른 테스트)
npm test -- --project=chromium

# UI 모드로 실행
npm run test:ui
```

## 🔧 문제 해결

### 브라우저가 설치되지 않음
**에러 메시지**:
```
Error: browserType.launch: Executable doesn't exist
```

**해결 방법**:
```bash
npx playwright install --with-deps
```

### 백엔드 서버가 실행되지 않음
**해결 방법**:
```bash
cd ../../..
./scripts/start-backend.sh
```

### 프론트엔드 서버가 실행되지 않음
**해결 방법**:
```bash
cd ../../frontend/webapp
python3 -m http.server 8080
```

## 📊 테스트 구성

### 브라우저별 테스트
- **Chromium**: 기본 브라우저 (필수)
- **Firefox**: 크로스 브라우저 호환성 검증
- **WebKit**: Safari 호환성 검증
- **Mobile Chrome**: 모바일 반응형 검증
- **Mobile Safari**: iOS 호환성 검증

### CI 환경
CI 환경에서는 Chromium만 실행하여 빠른 피드백을 제공합니다.

## 📝 테스트 시나리오

1. 페이지 로드 및 초기화
2. 로딩 상태 표시 및 완료
3. 그래프 데이터 로드
4. 검색 기능
5. 필터 기능
6. 노드 클릭 및 패널 표시
7. 챗봇 기능
8. 에러 처리
9. 접근성 검증
10. 콘솔 에러 확인
11. 반응형 디자인

## 🎯 자동화 스크립트 사용

프로젝트 루트에서 실행:
```bash
./scripts/run-e2e-tests.sh
```

이 스크립트는 다음을 자동으로 수행합니다:
1. 백엔드 서버 상태 확인
2. 프론트엔드 서버 상태 확인
3. Node.js 및 의존성 확인
4. Playwright 브라우저 설치 확인 및 자동 설치
5. 테스트 실행
