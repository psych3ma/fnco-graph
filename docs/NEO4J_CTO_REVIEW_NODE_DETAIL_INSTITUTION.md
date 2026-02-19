# Neo4j CTO 검토: 노드 정보 로드 실패 / 기관 0건 (협업 코드 고려)

## (1) 노드 정보를 불러올 수 없습니다: 1101110042492

### 원인
- 프론트: 노드 클릭 시 `GET /api/node/{node_id}` 호출, `id_property` 미전달.
- 백엔드: `id_property` 기본값이 `"id"`라 `WHERE n.id = $node_id` 실행.
- 실제 스키마는 **Company → bizno**, **Person → personId**만 사용하므로 `id` 속성으로는 조회 불가 → 404 → "노드 정보를 불러올 수 없습니다" 표시.

### 수정 사항
- **backend/main.py**  
  - `id_property`를 `Optional[str] = Query(None)`으로 변경.  
  - 미지정 시 서비스 레이어에서 **bizno → personId** 순으로 자동 감지하도록 유지.
- **frontend/webapp/js/core/panel-manager.js**  
  - 노드 상세 요청 시 `node.label`/`labels`에 따라 `id_property` 전달:  
    Company → `bizno`, Person → `personId`, 그 외 → 미전달(자동 감지).

이제 1101110042492 같은 **bizno** 값으로 요청하면 자동으로 `bizno`로 조회되어 노드 상세가 로드됩니다.

---

## (2) 기관 0건

### 원인
- Neo4j에는 **Institution** 라벨이 없고, **Stockholder** 라벨 + 속성 `shareholderType = 'INSTITUTION'`으로 구분.
- 통계는 `labels(n)` 기준만 집계해 **Institution** 건수가 나오지 않음.
- UI "기관" 필터는 `node_labels=Stockholder`만 요청해, 기관/일반 주주 구분 없이 모두 노출·집계됨.

### 수정 사항
- **backend/database.py – get_statistics**  
  - `shareholderType = 'INSTITUTION'`인 노드 수를 별도 집계해 `label_counts`에 `{ label: "Institution", count: N }` 추가.  
  - 기관이 0건이어도 항목을 넣어 레전드에 "기관 0 건"이 정확히 표시되도록 함.
- **backend/service.py – format_graph_data**  
  - `_display_type_for_filter()` 도입: Stockholder 노드에 대해  
    - `shareholderType == 'INSTITUTION'` → `displayType: 'institution'`  
    - 그 외 → `displayType: 'major'`  
  - 각 노드 `properties`에 `displayType` 설정해 프론트 필터/표시와 일치시킴.
- **frontend**  
  - **constants.js**: `LABEL_TO_TYPE_MAP['Institution'] = 'institution'` 추가.  
  - **app.js**: `rawNodes`의 `type`을 `node.properties?.displayType || mapLabelToType(node.label)`로 설정해 기관 노드가 "기관" 필터에만 반응하도록 함.  
  - **graph-manager.js** / **panel-manager.js**: 표시용 메타(색상, 라벨)를 `node.type`(displayType) 우선으로 사용해 기관 노드가 보라색/기관 라벨로 표시되도록 함.

### 데이터 측 참고
- 실제로 **기관 0건**이면, Neo4j에 `shareholderType = 'INSTITUTION'`인 노드가 없는 상태입니다.  
- 데이터 적재 시 기관 주주는 해당 속성으로 넣어두면 통계·필터·표시가 자동으로 반영됩니다.

---

## 협업/운영
- ID 속성 자동 감지는 서비스 레이어에 두어, 다른 진입점(챗봇, 배치 등)에서도 동일하게 사용 가능.
- 기관 집계/표시는 `shareholderType` 기준으로만 동작하므로, 속성명/값 규칙이 바뀌면 `database.get_statistics`와 `_display_type_for_filter`만 정리하면 됨.
