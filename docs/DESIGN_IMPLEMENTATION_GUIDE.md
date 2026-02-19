# 디자인 구현 가이드: 로딩 화면 변형

## 🎨 사용 가능한 디자인 변형

### 1. 미니멀 스피너 (기본값, 권장)

#### 특징
- 스피너만 표시
- 프로그레스바 숨김
- 단계별 메시지 업데이트

#### 사용법
```javascript
import { loadingManager } from './core/loading-manager.js';

// 기본 사용 (미니멀 모드)
loadingManager.setVariant('minimal');
loadingManager.show('서버 연결 확인 중...');
loadingManager.updateMessage('데이터 불러오는 중...');
```

#### 장점
- ✅ 단순하고 명확
- ✅ 시각적 혼란 최소화
- ✅ 빠른 인식

---

### 2. 프로그레스바 중심

#### 특징
- 프로그레스바만 표시
- 스피너 숨김
- 실제 진행률 표시

#### 사용법
```javascript
loadingManager.setVariant('progress');
loadingManager.show('데이터 불러오는 중...');
loadingManager.updateProgress(30);
loadingManager.updateProgress(60);
loadingManager.updateProgress(100);
```

#### 장점
- ✅ 실제 진행률 표시
- ✅ 사용자 기대치 관리
- ✅ 정보 제공 명확

---

### 3. 단계별 진행

#### 특징
- 스피너 + 단계 인디케이터
- 단계별 진행 상황 표시
- 시각적 피드백 강화

#### 사용법
```javascript
loadingManager.setVariant('steps');
loadingManager.setSteps(0, 4); // 현재: 0, 전체: 4
loadingManager.show('서버 연결 확인 중...');

// 단계 진행
loadingManager.setSteps(1, 4);
loadingManager.updateMessage('데이터 조회 중...');

loadingManager.setSteps(2, 4);
loadingManager.updateMessage('그래프 구성 중...');

loadingManager.setSteps(3, 4);
loadingManager.updateMessage('완료');
```

#### 장점
- ✅ 명확한 진행 상황
- ✅ 단계별 피드백
- ✅ 사용자 안심

---

### 4. 통합 인디케이터 (하이브리드)

#### 특징
- 진행률이 있으면 프로그레스바
- 진행률이 없으면 스피너
- 자동 전환

#### 사용법
```javascript
loadingManager.setVariant('unified');

// 진행률 없을 때: 스피너 표시
loadingManager.show('서버 연결 확인 중...');

// 진행률 있을 때: 프로그레스바로 자동 전환
loadingManager.updateProgress(50);
```

#### 장점
- ✅ 상황에 맞는 인디케이터
- ✅ 중복 제거
- ✅ 유연한 디자인

---

### 5. 스켈레톤 UI (고급)

#### 특징
- 실제 콘텐츠 구조 미리보기
- 펄스 애니메이션
- 인지된 성능 향상

#### 사용법
```javascript
loadingManager.setVariant('skeleton');
loadingManager.show('콘텐츠 로딩 중...');
```

#### 장점
- ✅ 인지된 성능 향상
- ✅ 콘텐츠 구조 미리보기
- ✅ 현대적인 UX

#### 단점
- ⚠️ 구현 복잡도 높음
- ⚠️ 초기 로딩에는 부적합

---

## 🎯 권장 사용 시나리오

### 시나리오 1: 빠른 로딩 (< 1초)
**권장**: 미니멀 스피너
```javascript
loadingManager.setVariant('minimal');
loadingManager.show('로딩 중...');
```

### 시나리오 2: 중간 로딩 (1-3초)
**권장**: 단계별 진행
```javascript
loadingManager.setVariant('steps');
loadingManager.setSteps(0, 3);
loadingManager.show('데이터 불러오는 중...');
```

### 시나리오 3: 긴 로딩 (> 3초)
**권장**: 프로그레스바 중심
```javascript
loadingManager.setVariant('progress');
loadingManager.show('대용량 데이터 처리 중...');
loadingManager.updateProgress(25);
loadingManager.updateProgress(50);
loadingManager.updateProgress(75);
```

### 시나리오 4: 불확실한 로딩 시간
**권장**: 통합 인디케이터
```javascript
loadingManager.setVariant('unified');
loadingManager.show('처리 중...');
// 진행률이 생기면 자동으로 프로그레스바로 전환
```

---

## 📐 디자인 토큰

### 색상
```css
--loading-primary: #d85604;    /* 기본 로딩 */
--loading-success: #10b981;    /* 성공 */
--loading-error: #ef4444;      /* 에러 */
--loading-warning: #f59e0b;     /* 경고 */
```

### 애니메이션
```css
--animation-fast: 150ms;
--animation-normal: 300ms;
--animation-slow: 500ms;
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### 크기
```css
--spinner-size: 48px;
--progress-height: 4px;
--text-size: 14px;
```

---

## 🔧 구현 예시

### 기본 사용 (미니멀)
```javascript
// app.js에서
import { loadingManager } from './core/loading-manager.js';

// 기본 미니멀 모드
loadingManager.show('애플리케이션 초기화 중...');
// ... 작업 수행
loadingManager.hide();
```

### 진행률 표시 (프로그레스바)
```javascript
loadingManager.setVariant('progress');
loadingManager.show('데이터 불러오는 중...');

loadingManager.updateProgress(10);  // 10%
// ... 작업 1
loadingManager.updateProgress(50);  // 50%
// ... 작업 2
loadingManager.updateProgress(100); // 100%
loadingManager.hide();
```

### 단계별 진행
```javascript
loadingManager.setVariant('steps');
loadingManager.setSteps(0, 4);
loadingManager.show('서버 연결 확인 중...');

loadingManager.setSteps(1, 4);
loadingManager.updateMessage('데이터 조회 중...');

loadingManager.setSteps(2, 4);
loadingManager.updateMessage('그래프 구성 중...');

loadingManager.setSteps(3, 4);
loadingManager.updateMessage('완료');
loadingManager.hide();
```

---

## ✅ 체크리스트

### 디자인 선택
- [ ] 로딩 시간 예상
- [ ] 진행률 정보 가용성 확인
- [ ] 사용자 경험 목표 설정
- [ ] 디자인 변형 선택

### 구현
- [ ] CSS 변형 파일 포함
- [ ] JavaScript 변형 설정
- [ ] 테스트 및 검증
- [ ] 문서화 완료

---

## 🎉 결론

다양한 디자인 변형을 제공하여 상황에 맞는 최적의 로딩 경험을 제공할 수 있습니다:

1. **미니멀**: 빠른 로딩, 단순한 피드백
2. **프로그레스바**: 실제 진행률 표시
3. **단계별**: 명확한 진행 상황
4. **통합**: 상황에 맞는 자동 전환
5. **스켈레톤**: 인지된 성능 향상

각 변형은 독립적으로 사용 가능하며, 필요에 따라 전환할 수 있습니다.
