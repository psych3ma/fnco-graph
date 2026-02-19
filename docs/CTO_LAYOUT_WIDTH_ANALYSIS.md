# CTO 관점: 화면 너비 변화 시 레이아웃 이슈 원인 분석 (코드 수정 없음)

**현상**: 개발자도구를 닫으면(또는 열면) 화면 너비가 바뀌면서  
- 우측 패널 안내 문구가 잘림: "상세 정보를 확인할 수 있", "노드를 드래그하여 그래프를 탐"  
- 좌측에 "건"만 보이는 세로 나열(노드 유형 범례 일부만 보임)

---

## 1. 원인 요약 (샤프)

| 현상 | 추정 원인 (우선순위) |
|------|----------------------|
| 우측 패널 텍스트 잘림 | **768px 미디어쿼리 + 패널 전환**으로 뷰포트가 768 전후에서 바뀔 때, 패널이 fixed ↔ in-flow 전환되며 **폭/리플로우가 일시적으로 어긋나거나**, **flex 자식의 min-width: auto**로 인해 내용이 줄지 않고 가로만 잘림(overflow-x: hidden). |
| 좌측 "건"만 보임 | **그래프 영역(.graph-area) 폭**이 잠깐 잘못 계산되거나, **로딩 오버레이(inset:0, z-index:50)** 아래에 있는 **범례(.graph-legend)**가 리플로우 시 왼쪽이 잘려서, 숫자/라벨은 안 보이고 "건"만 보이는 상태. |

즉, **뷰포트 리사이즈(특히 768px 구간) → 레이아웃 전환 + flex/overflow 처리**가 겹치면서 발생하는 **반응형/리플로우 이슈**로 보는 것이 타당함.

---

## 2. 구조적 원인 (코드 기준)

### 2.1 768px 구간에서의 레이아웃 전환

- `styles.css` **@media (max-width: 768px)**:
  - `.side-panel`: `position: fixed; right: -100%; width: 100%; max-width: 400px` → **기본 상태에서 화면 밖**.
  - `.side-panel.open`: `right: 0` → 패널만 등장.
- **개발자도구 열기/닫기** = 뷰포트 폭이 768 전후로 바뀜 → **같은 페이지에서 데스크톱 레이아웃 ↔ 모바일 레이아웃**이 바뀜.
- 이때 **패널이 flow 참여 여부·위치·폭**이 바뀌므로, **한 프레임/한 시점에 패널 폭이 0이거나 잘못된 값**이 되기 쉽고, 그 상태에서 **overflow-x: hidden**이 적용되면 문구가 잘려 보일 수 있음.

### 2.2 우측 패널 쪽 (텍스트 잘림)

- `.side-panel`: `width: 340px`, `flex-shrink: 0` → 정상일 때는 340px 고정.
- `.panel-body`: `flex: 1`, `overflow-x: hidden` → **가로 초과분은 무조건 잘림**.
- `.panel-empty`: `display: flex`, `flex-direction: column`, 자식 `<p>`, `<span>`에는 **word-break/overflow 명시 없음**.
- **Flex 기본값**: 자식은 `min-width: auto` → **내용 최소 폭만큼 안 줄어듦**.  
  그래서 “폭이 340px보다 작게 잡히는 순간”이 있으면, **줄바꿈보다 먼저 가로로 넘치고**, 그 넘친 부분이 `overflow-x: hidden`으로 잘려 “상세 정보를 확인할 수 있”, “그래프를 탐”처럼 끝만 잘린 형태로 보일 수 있음.

### 2.3 좌측 “건”만 보이는 현상

- `.graph-legend`: `position: absolute; left: 16px; bottom: ...` (graph-area 내부).
- `.graph-area`: `flex: 1`, `overflow: hidden`, `position: relative`.
- **로딩 오버레이**: `position: absolute; inset: 0`, `z-index: 50` → 범례보다 위에 있음.
- 뷰포트가 바뀌는 순간:
  - **graph-area**의 계산된 폭이 0이거나 매우 작아지거나,
  - 또는 **범례 박스**가 리플로우되며 **왼쪽이 뷰포트/그래프 영역 밖**으로 나가면,
  - `overflow: hidden` 때문에 **숫자·라벨은 잘리고 “건”만** 보일 수 있음.
- “세로로 건만 나열”은 **범례 행(.legend-row)**들이 세로로 쌓여 있는데, **각 행의 왼쪽(숫자·라벨)이 잘린 상태**로 해석 가능.

---

## 3. 정리 (CTO용)

- **직접 원인**:  
  - **768px 브레이크포인트**에서 side-panel의 **fixed ↔ in-flow 전환**과  
  - **패널/그래프 영역의 flex·overflow·min-width** 조합이,  
  **리사이즈 시점의 한두 프레임**에서 “패널이 좁아진 상태” 또는 “그래프 영역/범례가 잘못 잘린 상태”를 만들고 있음.
- **근본 요인**:
  1. **고정 브레이크포인트(768px)** 하나로 데스크톱/모바일을 나누어, “개발자도구로 인한 작은 폭 변화”만으로도 레이아웃 모드가 바뀜.
  2. **패널 본문/empty state**에 **가로 줄바꿈·최소폭 방어(min-width: 0 등)** 가 없어, flex 시 **넘침 → 잘림**이 발생.
  3. **그래프 영역/범례**는 **리사이즈 시 폭이 0이거나 순간적으로 틀어지는 경우**를 가정한 방어가 없음.

수정 시에는 **768px 전후 리플로우**, **패널/panel-body/panel-empty의 flex·overflow·word-break**, **graph-area/legend의 폭·위치**를 동시에 점검하는 것이 좋음.

---

## 4. 적용된 수정 요약 (프론트엔드 CTO · 확장성/유지보수/협업)

| 우선순위 | 내용 | 파일 |
|----------|------|------|
| **1** | 패널 텍스트 잘림 방지: `.panel-body`에 `min-width: 0`, `.panel-empty` 및 `p`/`span`에 `min-width: 0`, `word-break: break-word`, `overflow-wrap: break-word`, `max-width: 100%` | `styles.css` |
| **2** | 브레이크포인트 조정: 패널 모바일 전환을 **768px → 640px**으로 변경. `:root`에 `--bp-panel-mobile: 640px` 주석으로 협업용 기준 명시. 개발자도구 열기(768 전후) 시 데스크톱 유지해 전환 깜빡임/잘림 완화 | `styles.css` |
| **3** | 그래프 영역/범례 방어: `.graph-area`에 `min-width: 0`, `.graph-legend`에 `max-width: calc(100% - 32px)`, `.legend-label`에 `min-width: 0` + `overflow: hidden` + `text-overflow: ellipsis`, `.legend-count`에 `flex-shrink: 0` | `styles.css` |

브레이크포인트 변경 시 `:root` 주석과 `@media (max-width: 640px)` 한 곳만 맞추면 되도록 유지.
