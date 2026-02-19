# UX CTO: 그래프와 마우스/클릭/스크롤 싱크

그래프와 포인터(마우스·터치)·클릭·스크롤이 어긋나거나 “헛돌아” 보이는 현상 정리 및 조치.

---

## 원인 (CTO 관점)

1. **Physics 지속 가동**  
   vis.js Network에서 `physics.enabled: true`인 채로 두면, 안정화 후에도 시뮬레이션이 계속되거나 주기적으로 갱신될 수 있음. 노드가 미세하게 움직이면서 **클릭/호버 좌표와 실제 노드 위치가 어긋남**.

2. **리사이즈 후 캔버스 불일치**  
   패널 토글 등으로 그래프 컨테이너 크기가 바뀌었을 때, 캔버스 크기나 뷰 좌표가 갱신되지 않으면 **마우스 위치와 그려진 그래프가 어긋남**.

3. **휠/터치 이벤트 경쟁**  
   그래프 영역에서 휠을 돌렸을 때 상위 요소가 스크롤로 처리하거나, 터치 시 브라우저가 스크롤/제스처로 가로채면 **그래프 줌/팬과 입력이 싱크되지 않음**.

---

## 조치 (유지보수·확장·협업)

### 1. 안정화 후 physics 비활성화

- **위치**: `frontend/webapp/js/core/graph-manager.js`
- **내용**:  
  - `stabilizationIterationsDone` 이벤트에서 `network.setOptions({ physics: false })` 호출.  
  - 레이아웃은 안정화 단계에서만 계산하고, 이후에는 노드를 고정해 **클릭/호버와 위치를 일치**시킴.
- **데이터 갱신 시**: `setData`로 노드/엣지를 바꿀 때는 잠시 `physics: true`로 두어 다시 안정화를 돌린 뒤, 동일 이벤트에서 다시 `physics: false` 적용.

### 2. 리사이즈 시 캔버스 동기화

- **위치**: 동일 `graph-manager.js`, `setupStabilizationAndResize()`
- **내용**: 그래프 컨테이너에 `ResizeObserver` 등록 → 크기 변경 시 `network.redraw()` 호출.  
  패널 열기/닫기 등으로 영역 크기가 바뀌어도 **캔버스와 뷰포트가 맞도록** 유지.
- **정리**: `destroy()` 시 `ResizeObserver.disconnect()` 호출.

### 3. 그래프 영역 터치/휠 정리

- **CSS** (`frontend/webapp/css/styles.css`):  
  - `.graph-area`, `#visNetwork`에 `touch-action: none` → 터치 시 문서 스크롤/브라우저 제스처가 개입하지 않도록 하고, **그래프 팬/줌만** 동작하도록 유도.  
  - `.graph-area`에 `user-select: none` → 드래그 시 텍스트 선택 방지로, **팬과 선택 동작이 혼동되지 않도록** 함.
- **JS**: `.graph-area`에 `wheel` 리스너 추가, `stopPropagation()`만 수행(passive) → 휠은 vis가 처리하고, 상위로 휠이 전달되지 않아 **스크롤과 그래프 줌이 겹치지 않음**.

---

## 적용 요약

| 항목 | 파일 | 변경 |
|------|------|------|
| 안정화 후 physics off | graph-manager.js | `stabilizationIterationsDone` → `setOptions({ physics: false })` |
| 데이터 갱신 시 재안정화 | graph-manager.js | `setData` 전 `setOptions({ physics: true })` |
| 리사이즈 동기화 | graph-manager.js | ResizeObserver → `redraw()`, destroy 시 disconnect |
| 휠 버블링 차단 | graph-manager.js | `.graph-area` wheel → `stopPropagation()` |
| 터치/선택 제어 | styles.css | `.graph-area`, `#visNetwork` → touch-action, user-select |
| 드래그 기본 동작 차단 | graph-manager.js | `#visNetwork` mousedown/touchstart capture → preventDefault (CTO_CRITICAL_GRAPH_DRAG_SYNC) |

---

## 협업 시 참고

- **physics**: “초기 레이아웃 계산용”으로만 사용하고, 상시 시뮬레이션은 끄는 패턴을 유지.  
- **리사이즈**: 그래프 컨테이너를 바꾸는 모든 UI(패널, 반응형 등)는 동일 ResizeObserver로 처리되므로, 레이아웃 변경 시 추가 호출 없이 동기화됨.  
- **이벤트**: 휠/터치는 그래프 영역에서 “그래프 전용”으로 두고, 상위 스크롤과 분리해 두어 동작을 예측 가능하게 유지.
