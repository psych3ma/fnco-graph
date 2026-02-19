# CTO 백엔드 검토: 노드 상세 성능 및 데이터 표출 이슈 해결

## 문제 요약

1. **성능**: 노드 클릭 후 로딩이 오래 걸림 ("한참 지나서 로딩")
2. **데이터 미표출**: 최대주주 지분율 및 주주 수가 `-`로 표시됨

## 원인 분석 (백엔드/NetworkX 관점)

### 1. 최대주주 지분율 미표출

**문제점**:
- 백엔드는 `maxStockRatioFromRels`를 계산하지만, 프론트가 **프론트 계산값을 먼저** 확인하고 백엔드 값을 fallback으로만 사용
- 프론트 계산이 `outLinks`에서만 수행되어 `inLinks`의 지분율이 누락될 수 있음
- 관계 직렬화 시 `properties` 누락 가능성 (이미 `_relationship_to_serializable`로 해결됨)

**해결**:
- ✅ 백엔드에서 **모든 관계(in/out)의 stockRatio/pct 중 최댓값** 계산
- ✅ 프론트에서 **백엔드 계산값(`maxStockRatioFromRels`)을 우선** 사용하도록 수정

### 2. 주주 수 미표출

**문제점**:
- Neo4j 노드에 `totalInvestmentCount` 속성이 없을 수 있음 (스키마에 선택적)
- 프론트가 `inLinks.length`를 사용하지만, **같은 주주가 여러 관계로 나타날 수 있어** 중복 카운트됨
- 백엔드에서 주주 수를 계산하지 않음

**해결**:
- ✅ 백엔드에서 **incoming 관계의 고유 주주 ID 집합** 계산 (`shareholderCount` 필드 추가)
- ✅ 프론트에서 **백엔드 계산값(`shareholderCount`)을 우선** 사용하도록 수정

### 3. 성능 이슈 ("한참 지나서 로딩")

**현재 구조**:
```
get_node_detail()
  ├─ get_node_by_id()          # 쿼리 1: 노드 조회
  └─ get_node_relationships()  # 쿼리 2: 관계 조회 (limit=50)
      └─ 각 관계마다 방향 계산 (hasattr 체크)
```

**병목 지점**:
1. **별도 쿼리 2회**: 네트워크 왕복 2회
2. **관계 방향 계산**: 각 관계마다 `hasattr(rel, "start_node")` 체크
3. **limit=50**: 관계가 많으면 일부만 반환되어 데이터 불완전

**개선 방안** (확장성/유지보수성 고려):

#### 옵션 A: 단일 쿼리로 통합 (권장)
```cypher
MATCH (n)
WHERE n.{id_property} = $node_id
OPTIONAL MATCH (n)-[r]-(m)
RETURN n, collect({rel: r, other: m, direction: CASE 
  WHEN startNode(r) = n THEN 'out' ELSE 'in' END}) as rels
LIMIT 1
```
- **장점**: 네트워크 왕복 1회, Neo4j에서 방향 계산
- **단점**: 쿼리 복잡도 증가, 기존 코드 수정 필요

#### 옵션 B: 인덱스 최적화 (현재 구조 유지)
- `bizno`, `personId`에 인덱스 확인/생성
- 관계 타입(`HOLDS_SHARES` 등)에 인덱스 확인
- **장점**: 코드 변경 최소, 즉시 적용 가능
- **단점**: 쿼리 2회는 유지

#### 옵션 C: 관계 방향 계산 최적화 (즉시 적용 가능)
- `hasattr` 체크 대신 Neo4j 쿼리에서 `startNode(r) = n` 조건으로 방향 반환
- **장점**: Python 레벨 계산 제거, 즉시 적용 가능
- **단점**: 쿼리 수정 필요

## 적용된 수정 사항

### 백엔드 (`backend/service.py`)

1. **주주 수 계산 추가**:
   ```python
   shareholder_ids = set()
   # incoming 관계의 고유 주주 ID 수집
   if normalized.get("direction") == "in":
       other_id = m_id if n_id == node_id else (n_id if m_id == node_id else None)
       if other_id and other_id != node_id:
           shareholder_ids.add(str(other_id))
   # 응답에 포함
   "shareholderCount": len(shareholder_ids) if shareholder_ids else None
   ```

2. **최대 지분율 계산 개선**:
   - 모든 관계(in/out)의 `stockRatio`/`pct` 중 최댓값 계산 (기존 로직 유지, 주석 명확화)

3. **관계 방향 계산 개선**:
   - `hasattr` 체크 전에 `n_id`/`m_id`로 방향 추론 (fallback 개선)

### 프론트엔드 (`frontend/webapp/js/core/panel-manager.js`)

1. **최대주주 지분율**: 백엔드 계산값 우선 사용
   ```javascript
   if (nodeDetail.maxStockRatioFromRels != null && typeof nodeDetail.maxStockRatioFromRels === 'number') {
     maxPct = nodeDetail.maxStockRatioFromRels;  // 백엔드 우선
   } else if (maxFromRels != null && maxFromRels >= 0) {
     maxPct = maxFromRels;  // 프론트 계산값
   } else {
     maxPct = (nodeProps.maxStockRatio ?? ... ?? '-');  // 노드 속성/fallback
   }
   ```

2. **주주 수**: 백엔드 계산값 우선 사용
   ```javascript
   if (nodeDetail.shareholderCount != null && typeof nodeDetail.shareholderCount === 'number' && nodeDetail.shareholderCount >= 0) {
     shCount = nodeDetail.shareholderCount;  // 백엔드 우선 (중복 제거된 고유 주주 수)
   } else if (nodeProps.totalInvestmentCount != null && nodeProps.totalInvestmentCount !== '') {
     shCount = nodeProps.totalInvestmentCount;  // 노드 속성
   } else {
     shCount = (inCount > 0 ? inCount : '-');  // incoming 관계 수
   }
   ```

## 향후 개선 사항 (확장성/유지보수성)

### 1. 쿼리 최적화 (옵션 A 권장)
- 단일 쿼리로 통합하여 네트워크 왕복 감소
- Neo4j에서 방향 계산하여 Python 레벨 처리 제거
- **CTO 검토**: `docs/CTO_NODE_DETAIL_SINGLE_QUERY_REVIEW.md` 참고 (유지보수성·호환성·확장성·협업 코드 검토 완료, 도입 권장)

### 2. 캐싱 전략
- 자주 조회되는 노드(예: 연결도 높은 회사)의 상세 정보 캐싱
- TTL 설정으로 데이터 신선도 유지

### 3. 페이지네이션
- 관계가 많은 노드(예: 대기업)의 경우 관계 목록 페이지네이션
- 초기 로드는 요약 정보만, 상세는 필요 시 추가 로드

### 4. 비동기 처리
- 관계 조회를 비동기로 처리하여 초기 응답 속도 개선
- 관계 데이터는 스트리밍 또는 폴링으로 점진적 로드

## 검증 체크리스트

- [ ] 노드 클릭 후 최대주주 지분율이 숫자로 표시됨 (백엔드 계산값 사용)
- [ ] 주주 수가 숫자로 표시됨 (중복 제거된 고유 주주 수)
- [ ] 로딩 시간이 개선됨 (쿼리 최적화 적용 시)
- [ ] 관계가 많은 노드(100개 이상)에서도 정상 동작

## 관련 문서

- `CTO_NEO4J_NODE_DETAIL_RATIO_SHAREHOLDERS.md`: 지분율·주주 수 로직 상세
- `BACKEND_CTO_MAX_STOCK_RATIO.md`: 최대주주 지분율 백엔드 조치
- `CTO_GRAPH_STRUCTURE_SINGLE_SOURCE.md`: 그래프 구조 단일 소스 규칙
