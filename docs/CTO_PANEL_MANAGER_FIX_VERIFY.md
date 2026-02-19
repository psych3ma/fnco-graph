# panel-manager.js 구문 오류 해결 및 검증 (CTO / 협업 코드)

## 1. 원인

- **에러**: `Unexpected token ':' (at panel-manager.js:21:34)`
- **원인**: constructor 안에 **객체 리터럴 조각**만 남아 있음  
  (`major: { ... }`, `institution: { ... }`, `};` 가 `{` 없이 있어서 `:` 가 잘못된 위치로 해석됨)

## 2. 적용한 수정

- 해당 **잔여 조각 전부 삭제**
- `this.typeMeta = NODE_TYPE_META;` 만 유지 (constants 단일 소스)
- constructor 끝에 JSDoc 주석 추가 (협업/유지보수용)

**수정 후 constructor (16~21번째 줄 부근)**:

```javascript
  constructor() {
    this.detailContainer = null;
    this.chatContainer = null;
    /** @type {typeof NODE_TYPE_META} 타입 메타 (constants 기반, 협업 단일 소스) */
    this.typeMeta = NODE_TYPE_META;
  }
```

## 3. 반드시 할 일 (에러가 “아직도” 날 때)

### 3.1 파일 저장 확인

- **Cursor/VS Code**: `panel-manager.js` 탭에서 **Cmd+S (Mac) / Ctrl+S (Win)** 로 저장
- 탭 제목 옆에 ●(저장 안 됨) 표시가 없어야 함

### 3.2 브라우저 캐시 제거 후 재로드

- **강력 새로고침**: **Cmd+Shift+R (Mac)** 또는 **Ctrl+Shift+R (Win)**
- 또는 개발자 도구(F12) → Network 탭 → "Disable cache" 체크 후 새로고침

### 3.3 로드 경로 확인

- 웹앱은 **`frontend/webapp/`** 기준으로 서빙되는지 확인
- 사용 중인 URL이 `http://localhost:8080/` 등으로 이 경로를 가리키는지 확인

## 4. 여전히 21번째 줄 에러가 나는 경우

- 에디터에서 **`frontend/webapp/js/core/panel-manager.js`** 를 열고
- **16~22번째 줄**이 아래와 **완전히 동일한지** 확인하세요.

```text
 16|  constructor() {
 17|    this.detailContainer = null;
 18|    this.chatContainer = null;
 19|    /** @type {typeof NODE_TYPE_META} 타입 메타 (constants 기반, 협업 단일 소스) */
 20|    this.typeMeta = NODE_TYPE_META;
 21|  }
 22|
```

- **다르면**: 16~21번째 줄을 위 내용으로 **덮어쓰고 저장** 후 다시 **강력 새로고침**.

## 5. 협업 코드 관점 요약

- 타입 메타는 **`config/constants.js`의 `NODE_TYPE_META`만** 사용 (단일 소스).
- `panel-manager.js`에는 **객체 리터럴 조각/하드코딩 없음**.
- JSDoc으로 `typeMeta` 용도를 명시해 협업·리팩터링 시 실수 방지.

이 순서대로 저장 → 강력 새로고침 → 16~22줄 비교까지 하면, 동일 에러는 정리될 가능성이 높습니다.
