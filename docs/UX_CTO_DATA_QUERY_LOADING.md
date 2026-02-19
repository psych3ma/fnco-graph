# UX: 데이터 조회 단계에서 "화면 멈춤"처럼 보이는 현상

## 현상
"데이터 조회" 단계에서 실제로는 API 응답을 기다리는 중인데, 진행률이 30~50%에서 멈춰 있어 **화면이 멈춘 것처럼** 보임.

## 원인
- **진행률 고정**: `updateProgress(50)` 직후 `await getGraphData()` 호출. 응답이 올 때까지(최대 약 60초) 진행률·메시지가 전혀 갱신되지 않음.
- **시각적 피드백 부재**: 프로그레스바가 정적인 숫자에 머물러 있어 "작업이 진행 중"이라는 인식이 약함.

## 조치 (UX 전문가 관점)

### 1. 데이터 조회 구간에서 indeterminate 진행률
- **API 호출 직전**에 `loadingManager.setProgressIndeterminate()` 호출.
- 프로그레스바가 **애니메이션(indeterminate)** 으로 전환되어, "아직 진행 중"임이 분명히 보이도록 함.
- **응답 수신 후** 기존대로 `updateProgress(70)` 호출 → determinate로 복귀.

### 2. 기대 시간 안내 문구
- **메인 메시지**: `그래프 데이터 불러오는 중…`
- **안내 문구**: `데이터가 많으면 1분까지 걸릴 수 있습니다`  
  → 괄호 문구는 **별도 줄·비볼드·회색계열**로 표시해 "안내"로 인지되도록 함.
- `LoadingManager.updateMessage(message, guidance)` 로 메시지와 안내를 분리 전달.  
  안내만 있을 때 `#loadingGuidance`에 표시하고, 없으면 숨김.

### 3. 협업·유지보수
- `LoadingManager.setProgressIndeterminate()`를 public으로 두어, 다른 장시간 대기 구간(예: ego 그래프 로드, 검색 등)에서도 재사용 가능.

## 관련 코드
- `frontend/webapp/js/core/loading-manager.js`: `setProgressIndeterminate()`, `updateMessage(message, guidance)`
- `frontend/webapp/index.html`: `#loadingText`, `#loadingGuidance` (`.loading-message-wrap` 내)
- `frontend/webapp/css/loading-variants.css`: `.loading-guidance` (줄바꿈, 비볼드, 회색)
- `frontend/webapp/js/app.js`: `loadData()` 내 getGraphData 호출 직전 `setProgressIndeterminate()` 및 `updateMessage('그래프 데이터 불러오는 중…', '데이터가 많으면 1분까지 걸릴 수 있습니다')`

## 참고
- 단계 인디케이터("서버 연결" → "데이터 조회" → …)는 그대로 두고, **진행률 바만** indeterminate로 바꿔 "멈춤" 인상을 줄임.
- 실제 완료 시점은 API 응답 후이므로, 응답 후 즉시 70% → 이후 그래프 구성 등으로 진행률을 이어감.

## CTO: 로딩 안내 문구 규칙 (유지보수·협업)
- **메인 메시지**: 한 줄, 강조 가능. `updateMessage(message)` 또는 `updateMessage(message, null)`.
- **괄호/안내 문구**: 줄바꿈, 비볼드, 회색계열(`.loading-guidance`). `updateMessage(message, guidance)`.
- 새 로딩 단계에서 "~할 수 있습니다" 등 보조 설명이 필요하면 두 번째 인자로만 전달하고, 메인 문구에 괄호로 넣지 않음 → 시각적 계층이 유지됨.
