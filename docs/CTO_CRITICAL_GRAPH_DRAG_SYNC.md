# CTO 크리티컬: 마우스 드래그와 그래프가 따로 노는 이슈

**현상**: 그래프 영역에서 마우스로 드래그(팬)할 때, 그래프 뷰와 드래그 동작이 어긋나거나(드래그해도 그래프가 덜 움직임), 문서/상위 요소가 스크롤되면서 그래프와 입력이 “따로 논다”고 느껴짐.

---

## 원인 (확장성·유지보수·협업)

1. **드래그의 이중 반응**  
   - vis.js는 `dragView: true`로 캔버스 드래그 시 팬(pan)을 처리함.  
   - 동시에 **브라우저 기본 동작**(드래그로 스크롤, 텍스트/이미지 선택 등)이 같이 일어나면, 사용자 입장에선 “드래그한 만큼 그래프만 움직여야 하는데, 화면 전체가 스크롤되거나 움직임이 나뉜다”고 느낌.

2. **이벤트 전파**  
   - `wheel`은 이미 `.graph-area`에서 `stopPropagation()`으로 상위 전달을 막아 줌.  
   - **mousedown / touchstart**는 막지 않아서, 드래그가 시작될 때 문서나 상위 스크롤 영역이 “드래그로 스크롤”을 시작할 수 있음.  
   - 특히 터치 기기·트랙패드에서는 `touch-action: none`만으로는 부족한 경우가 있어, `preventDefault()`가 필요할 수 있음.

3. **그래프 컨테이너만의 책임**  
   - 팬/줌은 “그래프 영역 전용”으로 두고, 상위(workspace, body)는 드래그에 반응하지 않도록 하는 것이 유지보수·협업 시 동작 예측에 유리함.

---

## 조치

### 1. 그래프 컨테이너에서 드래그 시작 시 기본 동작 차단

- **위치**: `frontend/webapp/js/core/graph-manager.js`, `setupStabilizationAndResize(container)` (또는 네트워크 생성 직후 한 번만 바인딩).
- **내용**:  
  - `container`(#visNetwork)에 **capture phase**로 `mousedown`, `touchstart` 리스너 등록.  
  - **그래프 캔버스 위에서 시작된 드래그**일 때만 `preventDefault()` 호출 → 문서 스크롤/기본 드래그가 시작되지 않음, vis.js 팬만 동작.  
  - 버튼/입력 등은 `#visNetwork` 밖(줌 버튼은 형제 요소)에 있으므로, 그래프 영역 내부에서만 적용되면 됨.
- **중복 바인딩 방지**: `container.dataset.dragBound = '1'` 등으로 한 번만 등록 (기존 `wheelBound` 패턴과 동일).

### 2. CSS 유지

- `.graph-area`, `#visNetwork`의 `touch-action: none`, `user-select: none`은 그대로 유지해, 터치·선택과 팬이 겹치지 않도록 함.

### 3. 호환성

- 기존 `dragView: true`, 휠 `stopPropagation` 동작은 유지.  
- 추가하는 것은 “그래프 컨테이너 위에서의 mousedown/touchstart에 대한 기본 동작 차단”뿐이므로, 다른 터치/마우스 시나리오와의 호환성을 해치지 않음.

---

## 적용 요약

| 항목 | 파일 | 내용 |
|------|------|------|
| 드래그 시 기본 동작 차단 | graph-manager.js | `#visNetwork`에 mousedown/touchstart capture → preventDefault, 한 번만 바인딩 |
| CSS | styles.css | touch-action, user-select 유지 (이미 적용됨) |

---

## 협업 시 참고

- “그래프 영역에서 드래그 = 팬만”이라는 계약을 유지. 상위에 스크롤 영역을 추가할 경우, 그래프 영역은 이벤트 차단으로 팬 전용으로 두면 됨.  
- 확장 시: 그래프 위에 버튼/오버레이를 넣으면, 해당 요소는 `#visNetwork` 밖에 두거나, 클릭만 받고 드래그는 막으려면 target 검사로 버튼일 때는 preventDefault 생략하도록 할 수 있음.
