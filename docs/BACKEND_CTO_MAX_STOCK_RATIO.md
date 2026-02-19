# 백엔드 CTO 검토: 최대주주 지분율 로직

## 현상
노드 상세에서 "최대주주 지분율"이 연결 노드는 많은데도 `-`로 표시됨.

## 원인 (백엔드 관점)

1. **관계 직렬화**
   - 노드 상세 API가 `get_node_relationships()` 결과를 그대로 반환. Neo4j 드라이버의 `Relationship` 객체가 JSON 직렬화될 때 `properties`(예: `stockRatio`)가 빠지거나 클라이언트가 읽기 어려운 형태로 나갈 수 있음.

2. **계산 위치**
   - 최대 지분율을 프론트에서만 관계 배열을 순회해 계산하고 있었고, API가 관계를 직렬화할 때 속성이 누락되면 프론트에서 `maxFromRels`가 항상 null이 되어 `-`로 표시됨.

3. **스키마**
   - Neo4j에서 해당 관계 타입(예: `HOLDS_SHARES`)에 `stockRatio`(또는 `pct`) 속성이 없으면, 아무리 로직을 고쳐도 값이 없어 `-`가 나옴.

## 조치 (확장성·유지보수·협업)

### 1. 관계(r) 정규화 및 직렬화
- **위치**: `backend/service.py`
- **추가**: `_relationship_to_serializable(record)`  
  - 각 관계 레코드의 `r`을 `{ type, properties }` 형태의 dict로 변환.  
  - `properties`에 `stockRatio`가 있으면 `pct`도 동일 값으로 넣어 프론트 호환 유지.  
  - `_serializable_dict`로 JSON 직렬화 가능하게 처리.
- **효과**: API 응답의 `relationships[].r`이 항상 `r.properties.stockRatio` / `r.stockRatio`로 읽을 수 있는 구조가 됨.

### 2. 백엔드에서 최대 지분율 계산
- **위치**: `get_node_detail()`
- **추가**: 정규화된 관계 목록을 순회하며 `r.properties`의 `stockRatio`/`pct` 중 숫자인 값만 모아 **최댓값** 계산.  
  - 응답에 `maxStockRatioFromRels` (숫자 또는 없음) 필드로 포함.
- **효과**:  
  - 직렬화 형태가 바뀌어도 백엔드가 한 번만 계산해 주므로, 프론트는 이 값을 우선 사용하면 됨.  
  - "관계 기반 최대 지분율"의 정의를 백엔드 한 곳에서만 관리 가능.

### 3. 프론트 fallback
- **위치**: `frontend/webapp/js/core/panel-manager.js`
- **추가**: API 데이터 사용 시, 기존 로직으로 `maxPct`가 `-`인 경우 `nodeDetail.maxStockRatioFromRels`가 숫자이면 그 값으로 표시.
- **효과**: 백엔드가 계산해 준 값을 우선 쓰고, 없을 때만 기존 관계 기반/로컬 fallback 유지.

## 데이터 요구사항
- **Neo4j 관계 속성**: 해당 관계 타입(예: `HOLDS_SHARES`)에 지분율을 나타내는 속성(`stockRatio` 또는 `pct`)이 있어야 함.  
- 속성이 없으면 `maxStockRatioFromRels`도 null이고, UI는 계속 `-`로 표시됨.  
- 스키마/데이터 적재 시 관계에 `stockRatio`(또는 `pct`)를 넣는지 확인 필요.

## 관련 코드
- `backend/service.py`: `_relationship_to_serializable()`, `get_node_detail()` (관계 정규화 + `maxStockRatioFromRels` 계산)
- `frontend/webapp/js/core/panel-manager.js`: `nodeDetail.maxStockRatioFromRels` fallback

## 요약
| 구분 | 내용 |
|------|------|
| 원인 | 관계 직렬화 시 properties 누락 가능성, 계산이 프론트에만 의존 |
| 조치 | 관계를 type+properties로 정규화 반환, 백엔드에서 max 지분율 계산해 `maxStockRatioFromRels`로 제공, 프론트에서 해당 값 우선 사용 |
| 전제 | Neo4j 관계에 `stockRatio`(또는 `pct`) 속성 존재 |
