# Neo4j CTO 검토: 지분율 · 주주 수 · 연결 노드 로직

유지보수성·확장성·협업 코드 관점에서 백엔드/프론트엔드 로직 정리.

---

## 1. 최대주주 지분율 (지분율)

### 정의
- **의미**: 해당 노드(회사)와 연결된 관계 중 지분율 속성(`stockRatio` / `pct`)의 **최댓값**.
- **데이터 소스**: Neo4j 관계 속성. 해당 관계 타입에 `stockRatio`(또는 `pct`)가 있어야 함.

### 백엔드
- **위치**: `backend/service.py` — `get_node_detail()`, `_relationship_to_serializable()`
- **역할**:
  - 관계 `r`을 `{ type, properties }` 형태로 정규화해 JSON 직렬화 시 `properties` 누락 방지.
  - 정규화된 관계 목록을 순회해 **max(stockRatio/pct)** 계산 → `maxStockRatioFromRels` 로 반환.
- **협업**: 지분율 정의는 백엔드 한 곳에서만 관리. 프론트는 이 값을 우선 사용.

### 프론트엔드
- **위치**: `frontend/webapp/js/core/panel-manager.js`
- **역할**:
  - **relPct(rec)**: `r.properties.stockRatio` / `r.properties.pct` 우선 (백엔드 정규화 형태), 없으면 `r.stockRatio` 등 fallback.
  - **maxPct**: 관계 배열에서 계산한 max → 없으면 `nodeDetail.maxStockRatioFromRels` → 없으면 노드 속성/기타 fallback → 최종 없으면 `-`.

### 이슈·조치
| 항목 | 내용 |
|------|------|
| 직렬화 | 관계를 type+properties로 정규화해 프론트가 항상 `r.properties`로 읽도록 함 (기존 문서화됨). |
| 계산 위치 | 백엔드에서 `maxStockRatioFromRels` 제공, 프론트는 fallback만 담당. |

---

## 2. 주주 수

### 정의
- **의미**: “이 노드(회사)를 **지분 보유한** 쪽”의 수 = **incoming 관계** 수 (회사 기준: (주주)-[보유]->(회사)).
- **데이터 소스**: 노드 속성 `totalInvestmentCount`가 있으면 **우선**, 없으면 관계 기반 집계.

### 백엔드
- **위치**: `backend/service.py` — `get_node_detail()`
- **역할**:
  - 관계 조회 시 **방향 정보** 추가: Neo4j `rel.start_node` 기준으로 `direction = "out" | "in"` 부여.
  - `direction === "in"` = 상대가 우리를 가리킴 = “우리를 보유한 쪽” = 주주.
- **협업**: 방향을 API에서 내려주어, 프론트가 “주주 수 = in 개수”로 일관되게 해석 가능.

### 프론트엔드
- **위치**: `panel-manager.js` — 노드 상세 렌더 시
- **역할**:
  - **inLinks**: `direction === 'in'`인 관계 (백엔드 제공 시). 미제공 시 기존처럼 `targetId === node.id`로 추론.
  - **shCount**: `nodeProps.totalInvestmentCount` 있으면 사용, 없으면 **inLinks.length** (기존 outLinks.length 사용 버그 수정).

### 이슈·조치
| 항목 | 내용 |
|------|------|
| 시맨틱 | “주주 수” = 이 회사를 보유한 쪽 = **incoming** 관계 수. out(투자처) 수가 아님. |
| 방향 | 백엔드가 `direction` 반환 → 프론트는 in/out 분리만 하면 됨. |
| 노드 속성 | `totalInvestmentCount`가 있으면 권위 있는 값으로 사용. |

---

## 3. 연결 노드

### 정의
- **의미**: 해당 노드와 **한 홉**으로 연결된 **다른** 노드들 (자기 자신 제외). 관계당 한 행(동일 노드가 여러 관계로 연결되면 여러 행 가능).

### 백엔드
- **위치**: `backend/database.py` — `get_node_relationships()`, `backend/service.py` — `get_node_detail()`
- **역할**:
  - `(n)-[r]-(m)` 패턴, `limit=50`. 정규화 시 `direction` 추가.
  - **self-loop**: 백엔드는 제거하지 않음(관계 수·지분율 계산에 포함). 목록에서의 제거는 프론트 담당.

### 프론트엔드
- **위치**: `panel-manager.js`
- **역할**:
  - **connectedNodes**: outLinks + inLinks 매핑 후 **`.filter(c => c.id !== node.id)`** 로 **자기 자신 제외** (자기 노드가 “연결 노드” 목록에 나오는 현상 제거).
  - **totalConn**: 위 필터 후 `connectedNodes.length`로 통일해, 표시되는 “연결 노드” 수와 숫자 일치.
  - **더보기**: 처음 2개만 노출, 나머지는 `relatedMore` 토글로 표시 (기존 동작 유지).

### 이슈·조치
| 항목 | 내용 |
|------|------|
| self 노출 | 연결 노드 목록에서 **self 제외** (동일 노드가 연결 노드에 나오지 않도록). |
| 수 일치 | totalConn = 필터 후 연결 노드 수로 통일 (QA 이슈 방지). |
| limit=50 | 백엔드 관계 조회 상한 50. 50 초과 시 “더보기”로 전부 로드는 불가 → 필요 시 페이지네이션/별도 API 검토. |

---

## 4. 협업·유지보수 규칙

- **지분율**: 백엔드가 `maxStockRatioFromRels` + 관계 정규화 제공. 프론트는 `r.properties` 우선 읽고, 없을 때만 로컬/fallback 계산.
- **주주 수**: 정의는 “incoming 관계 수”(또는 노드 속성). 백엔드가 `direction` 제공해 in/out 분리 일원화.
- **연결 노드**: “다른 노드만” 보여주기 위해 프론트에서 self 제외; totalConn은 이 목록 길이와 일치.
- **확장**: “주주 수”를 다른 지표(예: 실질주주 수, 5% 이상만 등)로 바꿀 경우, 백엔드에 전용 집계/필터 추가 후 API로 내려주고 프론트는 표시만 담당하는 구조 권장.

---

## 5. 관련 코드 요약

| 구분 | 파일 | 내용 |
|------|------|------|
| 백엔드 | `service.py` | `_relationship_to_serializable`, `get_node_detail` (정규화, direction, maxStockRatioFromRels) |
| 백엔드 | `database.py` | `get_node_relationships` (n, r, m, limit=50) |
| 프론트 | `panel-manager.js` | inLinks/outLinks(direction 우선), relPct(r.properties 우선), shCount=inCount, connectedNodes self 제외, totalConn=connectedNodes.length |

기존 문서: `docs/BACKEND_CTO_MAX_STOCK_RATIO.md` (지분율 직렬화·계산).
