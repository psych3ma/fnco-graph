# 레퍼런스 기반 개선사항 적용 (프론트엔드 CTO, 협업 코드 고려)

## 적용한 개선사항

### (1) 연결 노드 초기 표시: 3개 → 2개

**변경 내용**
- `SHOW_INIT`: 3 → 2
- `connectedNodes.slice(0, 3)` → `slice(0, 2)`

**파일**: `frontend/webapp/js/core/panel-manager.js`

**효과**: 레퍼런스와 동일하게 처음 2개만 표시, 나머지는 "더보기"로 접근.

---

### (2) 맵 보기/질문하기 버튼 sticky 레이어 분리

**변경 내용**
- `.nd-actions`에 `position: sticky`, `bottom: 0` 적용
- 배경색(`var(--panel-bg)`) + 상단 보더로 스크롤 시 구분
- `.node-detail`을 `display: flex` + `flex-direction: column`으로 변경해 `nd-actions`가 `margin-top: auto`로 하단 고정

**파일**: `frontend/webapp/css/styles.css`

**효과**: 노드 상세 스크롤/더보기/접기와 무관하게 버튼이 항상 하단에 고정 표시.

**협업**: `.nd-actions`는 패널 하단 고정 영역으로 명확히 구분됨. 다른 sticky 요소 추가 시 z-index 충돌 주의.

---

### (3) 속성: created/createdAt 제외하고 모두 표시, 접기 버튼 제거

**변경 내용**
- 하드코딩된 속성 제거, `node.properties` 동적 순회로 변경
- 제외 키: `created`, `createdAt`, `created_at`, `displayName`, `labels`, `nodeType`
- `propsExtra` 접기/펼치기 제거, 모든 속성 항상 표시
- `props-toggle` 버튼 제거

**파일**: `frontend/webapp/js/core/panel-manager.js`

**효과**: 레퍼런스와 동일하게 속성 전체 표시(created 계열 제외). 접기/펼치기 없이 일관된 UX.

**협업**: 
- 제외 키 목록(`excludeKeys`)은 상수로 분리 가능. 필요 시 `config/constants.js`로 이동.
- `togglePropsSection()` 메서드는 유지(미사용, 향후 확장 가능).

---

## 수정된 파일

1. **`frontend/webapp/js/core/panel-manager.js`**
   - `SHOW_INIT = 2`
   - `connectedNodes.slice(0, 2)`
   - 속성 동적 렌더링(created 계열 제외)
   - `props-toggle` 버튼 제거

2. **`frontend/webapp/css/styles.css`**
   - `.nd-actions`: `position: sticky`, `bottom: 0`, 배경/보더 추가
   - `.node-detail`: `display: flex` (visible 시), `flex-direction: column`

---

## 레퍼런스 대비 정리

| 항목 | 레퍼런스 | 적용 결과 |
|------|----------|-----------|
| 연결 노드 초기 표시 | 2개 | ✅ 2개 |
| 맵 보기/질문하기 위치 | 하단 고정 | ✅ sticky bottom |
| 속성 표시 | created 제외, 모두 표시 | ✅ 동적 렌더링, created 계열 제외 |
| 속성 접기 버튼 | 없음 | ✅ 제거 |

---

## 협업 관점

- **연결 노드 개수**: `SHOW_INIT` 상수로 관리. 필요 시 2→3 등 변경 용이.
- **Sticky 레이어**: `.nd-actions`는 독립 레이어로 명확히 구분. 다른 sticky 요소 추가 시 z-index 조정 필요.
- **속성 필터링**: `excludeKeys` Set으로 관리. 향후 제외 키 추가/제거 용이.
