# 프론트엔드 QA 검토 (CTO 관점, 협업 코드 고려)

## 1. 데이터 정합성 (해결 완료)

### 연결 노드 수 불일치 (23 vs 24)
- **증상**: 상단 통계 "연결 노드" 값(23)과 섹션 제목 "연결 노드 (24)"가 다름.
- **원인**: `totalConn`은 API의 `relationships.length`로, 목록은 `inLinks`/`outLinks`로 구성된 `connectedNodes.length`로 계산되어, 필터/ID 추출 차이로 어긋날 수 있음.
- **조치**: **단일 소스** 적용. `connectedNodes` 구성 직후 `totalConn = connectedNodes.length`로 통일하여, 상단 통계·섹션 제목·속성의 connections 값이 항상 동일하게 표시되도록 수정함.
- **파일**: `frontend/webapp/js/core/panel-manager.js`

---

## 2. UX 개선 (적용 완료)

### 잘린 이름 툴팁
- **증상**: "에스케이에코플랜트 주식회사 (SK e..." 등 `text-overflow: ellipsis`로 잘린 텍스트만 보임.
- **조치**: 연결 노드 목록의 각 항목·이름 영역에 `title` 속성으로 전체 이름 부여. 호버 시 브라우저 기본 툴팁으로 전체 텍스트 노출.
- **파일**: `frontend/webapp/js/core/panel-manager.js` (`connItem`)

### 반복 표시(동일 회사명 여러 건)
- **현상**: 동일 회사(예: 에스케이증권주식회사)가 여러 번 나올 수 있음. 관계 단위로 행을 만들기 때문(예: HOLDS_SHARES, HAS_COMPENSATION 등 서로 다른 관계).
- **협업 관점**: 의도된 동작일 수 있음(관계별 행). 다만 사용자 관점에서는 "중복"으로 보일 수 있음.
- **권장**: 
  - 옵션 A: 백엔드에서 관계 타입(rel_type)을 내려주면, 각 행에 "(지분)", "(보상)" 등 관계 유형을 표시해 구분.
  - 옵션 B: “동일 노드당 한 행 + 관계 수”로 묶어서 표시하는 모드 추가 검토.

---

## 3. 에러 처리·로딩 (현재 구조 정리)

### 에러 처리
- **구조**: `utils/error-handler.js`에서 `ErrorType`(NETWORK, DATA, RENDER, VALIDATION, UNKNOWN)과 `showErrorToast()`로 통일.
- **사용처**: `api-client.js`에서 API 실패 시 타입별 메시지(그래프/검색/노드 상세/통계/챗봇 등) + 토스트; `app.js`에서 초기화/로드 실패 시 `loadingManager.showError()` + 토스트.
- **협업**: 새 API 호출 시 동일 패턴으로 `showErrorToast(메시지, ErrorType.XXX)` 사용 권장. 500/CORS 등은 NETWORK로 처리해 사용자에는 "서버 연결 문제" 등으로 안내 가능.

### 로딩
- **구조**: `loading-manager.js`의 단계별 진행(헬스 → 그래프 → 통계 → 완료), `loadingManager.show/hide/updateMessage/showError` 사용.
- **무한 로딩 방지**: `api-client`에서 AbortController + 타임아웃으로 실패 시 로딩 해제 및 에러 메시지 표시.

---

## 4. 접근성·일관성

- **탭**: "노드 상세" / "AI 질문" 구조와 활성 탭 표시(오렌지 언더라인) 유지.
- **연결 노드 항목**: `role="button"`, `tabindex="0"`, `aria-label="… 노드로 이동"` 및 `title`로 이름 툴팁 제공.
- **노드 타입 뱃지**: `aria-label="노드 타입: …"` 등으로 타입 명시.

---

## 5. 성능·확장 (권장)

- **연결 노드 목록**: 수십~수백 건일 때 가상 스크롤(virtualization) 도입 검토.
- **i18n**: 현재 한글 하드코딩. 추후 다국어 시 메시지 키/번들 구조(예: constants 또는 별도 i18n 모듈)로 분리 권장.

---

## 6. 협업 코드 관점 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 연결 노드 수 단일 소스 | ✅ 적용 | `totalConn = connectedNodes.length` |
| 잘린 이름 툴팁 | ✅ 적용 | `title` on related-item / ri-name |
| 에러 타입·토스트 | ✅ 정리 | ErrorType + showErrorToast 일관 사용 |
| 로딩 단계·타임아웃 | ✅ 정리 | loadingManager + AbortController |
| 관계 타입 표시(중복 구분) | 📋 권장 | 백엔드 rel_type 전달 시 UI에 표기 |
| 가상 스크롤·i18n | 📋 권장 | 목록 확장·다국어 시 검토 |

수정된 파일: `frontend/webapp/js/core/panel-manager.js` (연결 노드 수 통일, 툴팁 추가).
