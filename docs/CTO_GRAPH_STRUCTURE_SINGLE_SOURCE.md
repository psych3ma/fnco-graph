# CTO: 그래프 구조 단일 소스 규칙 (유지보수성/호환성/확장성/협업코드)

## 원칙

**"그래프 구조(어떤 노드/엣지를 그릴지)"는 한 곳에서만 정해져야 한다.**

- 여러 소스(App·state·GraphManager)가 서로 다른 데이터를 보면, 지배구조 맵 보기처럼 **동작하지 않는** 버그가 발생한다.
- 그래프를 바꾸는 **모든 경로**는 반드시 **단일 진입점**을 거치도록 한다.

## 단일 진입점: `App.setGraphData(nodes, links)`

- **역할**: 현재 그래프(노드·엣지)를 설정할 때 **항상** 이 메서드만 사용한다.
- **동작**:
  1. `App.rawNodes` / `App.rawLinks` 갱신
  2. `stateManager.setState('graph.rawNodes', …)` / `setState('graph.rawLinks', …)`
  3. `graphManager`가 있으면 `graphManager.rawNodes` / `graphManager.rawLinks` 동기화
- **호출처**:
  - `loadData()` 성공 시: 전체 그래프 반영
  - `loadData()` 실패/폴백 시: 빈 배열로 초기화 (에러 경로에서도 캔버스/state 일치)
  - `loadEgoGraph()` 성공 시: ego 서브그래프 반영

## 데이터 소스 정리

| 소스 | 역할 | 갱신 시점 |
|------|------|------------|
| **App.rawNodes / rawLinks** | 작성 주체·진입점 보유 | `setGraphData()` 내부에서만 |
| **stateManager graph.rawNodes / rawLinks** | 구독·조회용 (패널 fallback, 추천 노드 등) | `setGraphData()` 내부에서만 |
| **GraphManager.rawNodes / rawLinks** | vis 빌드 시 사용 (필터 적용 후 렌더) | `setGraphData()` 내부에서만 |

그래프 구조를 **읽는** 쪽은 다음만 사용한다.

- **캔버스**: `GraphManager.buildGraph()` → `this.rawNodes` / `this.rawLinks` (setGraphData로 이미 동기화됨)
- **패널/추천**: `stateManager.getState('graph.rawNodes'|'graph.rawLinks')`

## 금지 패턴 (협업 시 규칙)

- **금지**: `this.rawNodes = …` / `stateManager.setState('graph.rawNodes', …)` / `graphManager.rawNodes = …` 를 **각각 따로** 호출.
- **권장**: 그래프를 바꿀 때는 **항상** `this.setGraphData(nodes, links)` 한 번만 호출.

이렇게 하면 새 기능(예: 검색 서브그래프, 2홉 ego)을 추가할 때도 한 경로만 수정하면 되고, App·state·GraphManager 불일치가 생기지 않는다.

## 관련 문서

- `CTO_EGO_MAP_FIX_NETWORKX.md`: 지배구조 맵 보기 정상동작 수정 (원인은 그래프 구조 이중 소스였음).
