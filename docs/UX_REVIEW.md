# UX/CTO 관점 코드 리뷰: NodeScope HTML

## 🎯 전반적 평가

**강점**: 디자인 시스템이 잘 정립되어 있고, 시각적 일관성이 뛰어남. 다크/라이트 테마 조합이 효과적.

**개선 필요**: 접근성, 성능 최적화, 코드 구조화, 에러 핸들링 부족

---

## ✅ 강점 (잘된 부분)

### 1. 디자인 시스템
- **Design Tokens**: CSS 변수로 일관된 색상/간격 관리 ✅
- **타이포그래피**: Noto Sans KR + IBM Plex Mono 조합이 가독성 좋음
- **컬러 팔레트**: 다크 캔버스 + 웜 라이트 패널의 대비가 명확

### 2. 사용자 경험
- **로딩 상태**: 프로그레스 바와 단계별 메시지로 피드백 제공
- **인터랙션 피드백**: 호버, 클릭 애니메이션이 자연스러움
- **빈 상태(Empty State)**: 명확한 안내 메시지

### 3. 시각화
- **그래프 레전드**: 노드 타입별 색상 구분이 직관적
- **툴팁**: 노드 호버 시 정보 제공
- **줌 컨트롤**: 명확한 아이콘과 기능

---

## ⚠️ 개선 필요 사항

### 🔴 Critical (즉시 수정 권장)

#### 1. 접근성 (Accessibility)
```html
<!-- 문제: 키보드 네비게이션 불가 -->
<button class="chip" data-type="company">회사</button>

<!-- 개선: ARIA 속성 추가 -->
<button class="chip" 
        data-type="company" 
        role="checkbox" 
        aria-checked="true"
        aria-label="회사 노드 필터">
  <span class="dot company"></span>회사
</button>
```

**문제점**:
- 키보드 포커스 인디케이터 없음
- 스크린 리더 지원 부족
- 포커스 트랩 없음

**권장사항**:
- 모든 인터랙티브 요소에 `tabindex` 및 `aria-*` 속성 추가
- 키보드 단축키 지원 (예: `/`로 검색 포커스)
- 포커스 스타일 명확히 정의

#### 2. 에러 핸들링 부재
```javascript
// 문제: 네트워크 오류, 데이터 없음 등 처리 없음
function buildGraph() {
  const fNodes = RAW_NODES.filter(n => activeFilters.has(n.type));
  // 에러 발생 시 사용자에게 알림 없음
}

// 개선: 에러 바운더리 추가
function buildGraph() {
  try {
    const fNodes = RAW_NODES.filter(n => activeFilters.has(n.type));
    // ...
  } catch (error) {
    showErrorToast('그래프 로딩 중 오류가 발생했습니다.');
    console.error(error);
  }
}
```

#### 3. 성능 최적화 부족
- **데이터 크기**: 하드코딩된 데이터가 많아지면 렌더링 지연
- **이벤트 리스너**: 중복 바인딩 가능성
- **메모리 누수**: 네트워크 인스턴스 정리 없음

**권장사항**:
```javascript
// Debounce 검색 입력
const debouncedSearch = debounce(() => {
  // 검색 로직
}, 300);

// 가상 스크롤 (연결 노드가 많을 때)
// Web Workers로 레이아웃 계산 분리
```

---

### 🟡 High Priority (우선 개선)

#### 4. 코드 구조화
```javascript
// 문제: 전역 변수 남용, 함수들이 한 파일에 모두 있음
let network = null, visNodes = null, visEdges = null;
let selectedRaw = null;
// ...

// 개선: 모듈화
// graph-manager.js
class GraphManager {
  constructor() {
    this.network = null;
    this.nodes = null;
    this.edges = null;
  }
  build() { /* ... */ }
  highlight(id) { /* ... */ }
}

// panel-manager.js
class PanelManager {
  renderDetail(node) { /* ... */ }
  showEmpty() { /* ... */ }
}
```

#### 5. 상태 관리
```javascript
// 문제: 상태가 여러 곳에 분산
const activeFilters = new Set(['company','person','major','institution']);
let selectedRaw = null;
let chatHistory = [];

// 개선: 중앙화된 상태 관리
const state = {
  filters: new Set(['company','person','major','institution']),
  selectedNode: null,
  chat: {
    history: [],
    context: null
  },
  graph: {
    network: null,
    nodes: null,
    edges: null
  }
};
```

#### 6. 반응형 디자인
```css
/* 문제: 모바일 대응 없음 */
.side-panel {
  width: var(--panel-w); /* 340px 고정 */
}

/* 개선: 반응형 추가 */
@media (max-width: 768px) {
  .side-panel {
    position: fixed;
    right: -100%;
    transition: right 0.3s;
  }
  .side-panel.open {
    right: 0;
  }
}
```

---

### 🟢 Medium Priority (점진적 개선)

#### 7. 국제화 (i18n)
```javascript
// 문제: 하드코딩된 한국어
const TYPE_META = {
  company: { label: '회사', color: '#f97316' },
  // ...
};

// 개선: 다국어 지원
const i18n = {
  ko: { company: '회사', person: '개인주주' },
  en: { company: 'Company', person: 'Individual Shareholder' }
};
```

#### 8. 테스트 가능성
- 단위 테스트 작성 어려움 (전역 변수 의존)
- E2E 테스트를 위한 데이터 속성 부족

**권장사항**:
```html
<!-- 테스트용 data 속성 추가 -->
<button class="chip" 
        data-testid="filter-company"
        data-type="company">
```

#### 9. 타입 안정성
```javascript
// 문제: 타입 체크 없음
function toVisNode(n) {
  return { id: n.id, label: n.id.slice(0,7) };
  // n이 undefined면 에러
}

// 개선: TypeScript 또는 JSDoc
/**
 * @param {Object} n - 노드 객체
 * @param {string} n.id - 노드 ID
 * @returns {Object} vis.js 노드 객체
 */
function toVisNode(n) {
  if (!n || !n.id) throw new Error('Invalid node');
  // ...
}
```

---

## 📋 구체적 개선 제안

### 1. 접근성 개선
```css
/* 포커스 스타일 추가 */
.chip:focus-visible,
.zoom-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 스크린 리더 전용 텍스트 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border-width: 0;
}
```

### 2. 성능 최적화
```javascript
// 가상화된 리스트 (연결 노드가 많을 때)
import { VirtualList } from 'react-virtualized';

// 메모이제이션
const memoizedNodeTransform = useMemo(() => {
  return RAW_NODES.map(toVisNode);
}, [RAW_NODES, activeFilters]);
```

### 3. 에러 바운더리
```javascript
// 에러 토스트 컴포넌트
function showErrorToast(message) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
```

### 4. 로딩 상태 개선
```javascript
// 실제 데이터 로딩 시뮬레이션
async function loadGraphData() {
  try {
    setLoading(true);
    const data = await fetch('/api/graph').then(r => r.json());
    buildGraph(data);
  } catch (error) {
    showErrorToast('데이터를 불러올 수 없습니다.');
  } finally {
    setLoading(false);
  }
}
```

---

## 🎨 UX 개선 제안

### 1. 검색 자동완성
- 현재: 단순 필터링
- 개선: 검색어 하이라이트, 최근 검색 기록

### 2. 그래프 네비게이션
- 현재: 드래그만 가능
- 개선: 미니맵 추가, 경로 하이라이트

### 3. 챗봇 개선
- 현재: 시뮬레이션 응답
- 개선: 실제 API 연동, 스트리밍 응답, 마크다운 렌더링

### 4. 데이터 내보내기
- PNG/SVG로 그래프 저장
- CSV/JSON으로 데이터 내보내기

---

## 🔧 기술 부채 정리

### 즉시 수정
1. ✅ 접근성 속성 추가
2. ✅ 에러 핸들링 추가
3. ✅ 키보드 네비게이션 지원

### 단기 (1-2주)
1. 코드 모듈화
2. 상태 관리 개선
3. 반응형 디자인

### 중기 (1-2개월)
1. TypeScript 마이그레이션
2. 테스트 코드 작성
3. 성능 프로파일링 및 최적화

---

## 📊 우선순위 매트릭스

| 항목 | 영향도 | 난이도 | 우선순위 |
|------|--------|--------|----------|
| 접근성 | 높음 | 중간 | 🔴 Critical |
| 에러 핸들링 | 높음 | 낮음 | 🔴 Critical |
| 코드 구조화 | 중간 | 높음 | 🟡 High |
| 성능 최적화 | 중간 | 중간 | 🟡 High |
| 반응형 디자인 | 높음 | 중간 | 🟡 High |
| 국제화 | 낮음 | 중간 | 🟢 Medium |

---

## 💡 최종 권장사항

1. **즉시**: 접근성과 에러 핸들링 추가 (법적 요구사항 충족)
2. **단기**: 코드 리팩토링으로 유지보수성 향상
3. **중기**: 성능 최적화 및 확장성 개선

**전체 평가**: 디자인과 기본 UX는 우수하나, 프로덕션 배포 전 기술적 완성도가 필요합니다.
