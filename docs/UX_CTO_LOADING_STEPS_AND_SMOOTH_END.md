# UX CTO: 로딩 단계 전용 + 완료 후 스무스 전환

유지보수성·확장성·협업 코드를 고려한 로딩 UX 정리.

---

## 요구사항

- **프로그레스바 제거**: 퍼센트 바(주황 선) 제거.
- **아래 단계가 실제 진행에 맞춤**: 서버 연결 → 데이터 조회 → 그래프 구성 → 완료가 실제 처리 단계와 동기화.
- **끝나고 그래프 나오기까지 스무스**: 로딩 숨김 시 빈 화면이 보이지 않고, 그래프가 자연스럽게 전환되도록.

---

## 조치

### 1. 프로그레스바 제거 (unified 변형)

- **위치**: `frontend/webapp/css/loading-variants.css`
- **내용**: `.loading-overlay.variant-unified .loading-progress { display: none !important; }`  
  → unified 사용 시 프로그레스바 영역 비표시. 스피너 + 단계 인디케이터만 사용.
- **협업**: 다른 variant(progress, steps 등)는 기존대로 유지. unified만 “단계만” 표시하도록 제한.

### 2. 단계가 실제 진행에 맞도록 (app.js loadData)

| 단계 (setSteps) | 시점 | 메시지 |
|-----------------|------|--------|
| 0 | 로드 시작 | 서버 연결 확인 중… |
| 1 | 헬스 체크 성공 직후 | 그래프 데이터 불러오는 중… (안내: 데이터가 많으면 1분까지…) |
| 2 | graphData 수신·rawNodes/rawLinks 설정 직후 | 그래프 구성 중… |
| 3 | buildGraph 완료 직후 | 마무리 중… (통계 등) |
| 4 | 통계 처리 직후 | 완료 → 320ms 후 hideAfterPaint() |

- **제거**: `updateProgress`, `setProgressIndeterminate` 호출 제거. 진행 피드백은 단계(setSteps)와 메시지(updateMessage)만 사용.
- **확장**: 새 단계가 필요하면 `setSteps` 순서와 메시지만 추가하면 됨. 단계 라벨은 `loading-manager.js`의 steps 배열에서 일원 관리.

### 3. 완료 후 스무스 전환

- **위치**: `frontend/webapp/js/app.js` — loadData() 마지막
- **내용**:  
  - `setSteps(4, 4)`, `updateMessage('완료')` 후 **320ms** 뒤 `loadingManager.hideAfterPaint()` 호출.  
  - `hideAfterPaint()`는 이중 `requestAnimationFrame` 후 `hide()`를 호출해, 브라우저가 그래프 캔버스를 그린 뒤 오버레이를 제거하므로 “로딩 사라짐 → 빈 화면 → 그래프” 깜빡임을 방지.
- **참고**: 기존 `UX_CTO_LOADING_BLANK_FLASH.md`의 hideAfterPaint 활용과 동일 원리.

---

## 관련 파일

| 구분 | 파일 | 변경 |
|------|------|------|
| CSS | `loading-variants.css` | variant-unified에서 .loading-progress 숨김, 스피너만 표시 |
| 로직 | `app.js` | loadData 내 updateProgress/setProgressIndeterminate 제거, 단계별 setSteps·updateMessage, 완료 후 setTimeout(..., 320) → hideAfterPaint() |

---

## 협업·유지보수

- **단계 추가**: `loading-manager.js`의 steps 배열과 app.js의 setSteps 호출 위치만 맞추면 됨.
- **다른 variant**: progress/steps 변형은 그대로 두었으므로, 필요 시 variant만 바꿔 프로그레스바를 다시 쓸 수 있음.
- **타이밍**: 완료 후 320ms는 “완료” 단계가 잠깐 보이도록 하는 최소 시간. 필요 시 상수로 분리해 조정 가능.
