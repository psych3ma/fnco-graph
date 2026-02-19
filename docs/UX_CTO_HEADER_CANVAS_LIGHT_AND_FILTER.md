# UX/디자이너/프론트엔드/CTO: 헤더·캔버스 색상 통일 및 필터 반응 개선

확장성·유지보수성·호환성·협업 코드를 고려한 검토 및 적용 요약.

---

## (1) 헤더·캔버스 밝은 배경으로 통일

### 요구
- 헤더와 캔버스 영역을 사이드패널과 동일한 밝은 배경으로 맞춰 전체 UI 색상 일관성 확보.

### 적용 내용
- **디자인 토큰** (`frontend/webapp/css/styles.css` `:root`):
  - `--canvas-bg`, `--canvas-surf`, `--canvas-surf2`, `--canvas-border` → 패널과 동일한 웜 라이트 톤 (`#faf8f5`, `#f5f1ec`, `#f0ebe3`, `#e2dbd0`).
  - `--canvas-text`, `--canvas-dim` → 밝은 배경용 진한 텍스트 (`#1c1a17`, `#5a5349`).
- **로딩 오버레이**: 어두운 반투명 대신 밝은 배경(`rgba(250,248,245,.95)`)으로 변경.
- **그래프 영역**: `var(--canvas-bg)` 사용, 그라데이션 강도만 약하게 유지.
- **그래프 내부 (vis.js)**  
  - 노드 라벨·엣지 라벨·엣지 색을 밝은 배경에 맞게 조정 (`graph-manager.js`: `#1c1a17`, `#5a5349`, `#8a8580`).

### 확장·유지보수
- 캔버스/헤더 색은 모두 `:root`의 `--canvas-*`에 의존하므로, 테마 전환 시 변수만 바꾸면 됨.
- 노드/엣지 색은 상수 또는 향후 테마 객체로 분리하면 협업·다크모드 대비에 유리함.

---

## (2) 헤더 필터 반응 속도 및 “뭉친 화면” 완화

### 요구
- 필터는 적용되나 반응이 느림.
- 적용되는 동안 그래프가 바깥쪽으로 일시적으로 뭉쳐 보이는 현상 완화.

### 원인
- 필터 클릭 시 **매번 `loadData()`로 API 재요청** → 네트워크 지연으로 체감 반응 느림.
- 기존 네트워크 업데이트 시 **데이터 반영 직후 바로 `fit()`** → physics 안정화 전의 중간 레이아웃(뭉친 상태)에 맞춰 뷰가 잡혀, 잠깐 바깥으로 뭉쳐 보임.

### 적용 내용
- **필터는 클라이언트 전용**  
  - 필터 클릭 시 `loadData()` 호출 제거.  
  - 초기 로드에서 이미 선택된 모든 타입(회사/개인주주/최대주주/기관) 데이터를 받아 두므로, 필터 변경 시 **기존 `rawNodes`/`rawLinks`로 `buildGraph()`만 호출**.
- **안정화 후 fit**  
  - `buildGraph(container, { fitAfterStabilization: true })` 옵션 추가.  
  - 필터 적용 경로에서는 이 옵션으로 호출.  
  - 기존 네트워크가 있을 때: `setData()` 후 즉시 `fit()` 하지 않고, **`stabilizationIterationsDone`에서 한 번만 `fit()`** 호출해, 레이아웃이 잡힌 뒤에 뷰가 맞춰지도록 함.

### 확장·호환
- 초기 로드 시점의 “전체 타입” 정의는 `DEFAULT_FILTERS`/`TYPE_TO_LABEL_MAP` 등 기존 상수와 동일.  
- 서버 필터 파라미터를 쓰는 다른 플로우(예: 검색·더 보기)는 기존대로 `loadData()` + `buildGraph()` 유지.

---

## 체크리스트

| 항목 | 적용 |
|------|------|
| 헤더/캔버스 밝은 배경 (토큰) | ✅ `--canvas-*` 패널 계열로 통일 |
| 로딩 오버레이 밝은 배경 | ✅ |
| 노드/엣지 텍스트·선 색 (밝은 배경 대비) | ✅ graph-manager.js |
| 필터 클릭 시 API 재호출 제거 | ✅ 클라이언트 필터만 적용 |
| 필터 적용 시 fit 타이밍 | ✅ 안정화 완료 후 fit (`fitAfterStabilization`) |

---

## 관련 파일

- `frontend/webapp/css/styles.css`: `:root` 토큰, 로딩·그래프 영역 배경.
- `frontend/webapp/js/core/graph-manager.js`: `buildGraph(container, options)`, `setupStabilizationAndResize` 내 fit 호출, 노드/엣지 색.
- `frontend/webapp/js/app.js`: 필터 클릭 시 `buildGraph(..., { fitAfterStabilization: true })`만 호출.
