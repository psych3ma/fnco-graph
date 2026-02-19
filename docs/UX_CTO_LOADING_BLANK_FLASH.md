# UX: 로딩 끝난 뒤 빈 화면 → 그래프 (깜빡임) 방지

## 현상
로딩이 끝나고 오버레이가 사라지면, 잠깐 빈 화면이 보였다가 그다음에 그래프가 나타남.

## 원인
- **타이밍**: `loadingManager.hide()`를 그래프 빌드(`buildGraph`/`initialize`) 직후 동기적으로 호출.
- **브라우저 렌더링**: 캔버스(vis.js)는 그려졌지만, 그 프레임이 아직 화면에 합성(composite)되기 전에 오버레이만 사라져서, 한 프레임 정도는 그래프 영역이 비어 보임.

## 조치 (확장성/유지보수)
- **LoadingManager**: `hideAfterPaint(immediate?)` 추가.  
  - `immediate === true`: 기존처럼 즉시 `hide()`.  
  - 기본: `requestAnimationFrame` 2회 후 `hide()` 호출. (첫 rAF: 레이아웃/페인트 예약, 둘째 rAF: 그 다음 프레임에서 실행 → 그때쯤 캔버스가 그려진 상태에서 오버레이 제거.)
- **App 초기화**: `init()` 마지막에서 `loadingManager.hide()` 대신 `loadingManager.hideAfterPaint()` 호출.

## 관련 코드
- `frontend/webapp/js/core/loading-manager.js`: `hideAfterPaint()`
- `frontend/webapp/js/app.js`: `init()` → `loadingManager.hideAfterPaint()`

## 참고
- `loadData()` 내부의 “완료 후 500ms 뒤 hide” 경로(필터 변경 등)는 이미 지연이 있어 동일 현상이 덜했을 수 있음. 초기 로드 경로만 `hideAfterPaint`로 변경함.
- vis.js 물리 엔진이 안정화되기 전까지 노드가 움직이는 것은 별도 이슈. 여기서 해결하는 것은 “로딩 오버레이를 없앤 직후 빈 화면이 보이지 않게” 하는 것임.
