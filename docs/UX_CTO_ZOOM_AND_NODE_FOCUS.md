# UX CTO 검토: 줌·노드 포커스

## 검토 관점
- 줌 아웃 기능
- 노드 클릭 시 화면에 맞게 자동 확대되지 않음 이슈

---

## 1. 줌 아웃 기능

### 현황
- **UI**: 좌하단 줌 컨트롤 (확대 `+` / 축소 `-` / 전체보기 `⊡`) 존재.
- **구현**: `GraphManager.zoomIn()`, `zoomOut()`, `zoomFit()` — vis-network `moveTo`/`fit` 사용.
- **이슈**: 줌 범위 제한이 없어 과도하게 축소/확대될 수 있음.

### 조치
- `getNetworkOptions()`의 `interaction`에 **zoomMin: 0.1**, **zoomMax: 4** 추가.
  - 과도한 줌 아웃으로 노드가 너무 작아지거나, 줌 인으로 한 노드가 화면을 꽉 채우는 것을 방지.

---

## 2. 노드 클릭 시 화면에 맞게 자동 확대

### 원인(1차)
- 그래프 클릭 시 `focusNode()`가 호출되지 않아 카메라 이동/줌이 없음 → **onNodeClick에서 focusNode 호출로 통일** (이전 수정).

### 원인(2차, 미해결 지속)
- **vis 4.21** 사용 시 `network.fit({ nodes: [...] })`가 동작하지 않거나 무시되는 경우가 있음(구버전 API 차이).
- 노드 ID 타입 불일치(문자열/숫자)로 `visNodes.get(nodeId)` 실패 시 포커스 자체가 스킵됨.

### 조치(2차, 확장성·유지보수·협업 반영)
- **ID 정규화**: `focusNode` 진입 시 `String(nodeId)` 및 `get(id) || get(nodeId)`로 조회해, 백엔드/프론트 ID 타입 차이 흡수.
- **주 경로를 moveTo로 변경**: `getPosition(nodeId)`로 클릭한 노드 좌표를 구한 뒤 **moveTo({ position, scale: FOCUS_ZOOM_SCALE, animation })** 로 해당 노드를 화면 중앙에 맞춰 확대. (vis 4.x에서 항상 동작.)
- **상수화**: `GraphManager.FOCUS_ZOOM_SCALE = 1.25` — 협업·튜닝 시 한 곳만 변경.
- **호출 타이밍**: `requestAnimationFrame` 안에서 포커스 실행해, 클릭 처리 직후 뷰 상태가 안정된 뒤 줌 적용.
- **fit 보조**: `getPosition`을 쓸 수 없을 때만 `fit({ nodes: fitNodeIds })` 시도(라이브러리가 지원하면 클러스터까지 맞춤).

결과: 노드 클릭 시 **해당 노드가 화면 중앙으로 이동·확대**되어, 줌아웃 상태에서도 클릭한 노드가 명확히 보인다.

---

## 3. 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 줌 인/아웃/전체보기 | 구현됨 | zoomMin/zoomMax로 범위 제한 추가 |
| 노드 클릭 → 자동 확대 | 수정됨(2차) | `focusNode`: getPosition + moveTo 주 경로, ID 정규화, rAF, FOCUS_ZOOM_SCALE 상수 |

### 검증 포인트
- 그래프에서 아무 노드 클릭 → 해당 노드가 화면 중앙으로 이동하고 약 1.25배 확대되는지 확인.
- 검색으로 노드 선택 시에도 동일하게 확대·중심 이동하는지 확인.
- 줌아웃 상태에서 작은 노드 클릭 시 확대가 눈에 띄는지 확인.

### 관련 코드
- `frontend/webapp/js/core/graph-manager.js`
  - `onNodeClick` → `focusNode`
  - `focusNode`: ID 정규화, `getPosition` + `moveTo(scale: FOCUS_ZOOM_SCALE)`, rAF, fit 보조
  - `GraphManager.FOCUS_ZOOM_SCALE`
  - `getNetworkOptions().interaction`: zoomMin, zoomMax, zoomView, dragView
