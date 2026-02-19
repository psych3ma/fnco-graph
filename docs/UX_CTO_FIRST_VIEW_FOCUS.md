# UX CTO: 첫 화면 "어디를 봐야 할지" 제시 (NetworkX 관점)

노드 크기는 키우지 않고, **시선/클릭 포인트**를 주어 "노드가 작아서 클릭하기 어렵다"·"어디를 봐야 할지 모르겠다"를 완화.

---

## 요구사항

- **노드가 클릭하기에 작다** → 노드 크기 자체는 유지. 대신 **해당 구역이 화면에서 커 보이도록** 줌/뷰 조정.
- **시각화에서 어디를 봐야 할지 모르겠다** → **연결이 많은 노드(degree 기준)** 를 "시작점"으로 잡고, 그 노드 + 이웃에 뷰를 맞춰 한 클러스터가 먼저 보이도록 함.

---

## 설계 (협업·유지보수·확장)

- **시작 노드 선택**: 연결도(degree) = 링크에서 해당 노드가 등장하는 횟수. 클라이언트에서 `rawLinks`만으로 계산. 추후 백엔드/NetworkX `degree_centrality`·`pagerank`로 교체 가능.
- **뷰 맞춤**: 선택한 노드 + 그 이웃 노드들에 `network.fit({ nodes })` 적용 → 해당 클러스터가 화면을 채우므로 노드가 상대적으로 커 보이고 클릭하기 수월.
- **적용 시점**: 그래프 안정화(stabilization) 완료 후 1회만 적용. 세션당 1회로 제한해, 사용자가 이미 화면을 움직인 뒤에는 덮어쓰지 않음.
- **안내**: 세션당 1회, "연결이 많은 노드로 이동했습니다. 노드를 클릭해 상세를 보세요." 토스트로 짧게 안내 (sessionStorage로 중복 방지).

---

## 구현 요약

| 구분 | 파일 | 내용 |
|------|------|------|
| GraphManager | `graph-manager.js` | `fitToNodeAndNeighbors(nodeId)`, `setOnStabilized(fn)`; 안정화 완료 시 콜백 호출 |
| App | `app.js` | `getSuggestedFocusNode()` (degree 최대 노드), `applyInitialFocus()` (세션 1회, fit + 토스트) |
| 초기화 | `app.js` | `initialize()` 직후 `setOnStabilized(() => this.applyInitialFocus())` |

---

## 확장

- **시작 노드 기준 변경**: `getSuggestedFocusNode()`에서 degree 대신 `pagerank`·`betweenness` 사용 시, `/api/graph/analysis` 응답의 `analysis.pagerank` 등으로 교체하면 됨.
- **여러 "시작점" 제안**: 상위 N개 노드를 골라 사용자에게 선택하게 하거나, 타입별(회사/기관 등)로 대표 노드를 정하는 로직을 같은 진입점에서 확장 가능.

---

## 관련

- vis 노드 크기·클릭 영역은 변경하지 않음. "해당 구역을 크게 보여주기"로 클릭 용이성 확보.
- `docs/CTO_VIS_TO_NETWORKX_MIGRATION.md`: 이웃/연결은 API 단일 소스; 여기서는 첫 뷰 포커스만 담당.
