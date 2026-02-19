# CTO 검토: 노드 상세 단일 쿼리 개선안 (개선사항 1번)

유지보수성·호환성·확장성·협업 코드를 고려한 검토.

---

## 개선안 요약

**현재**: 노드 상세 조회 시 `get_node_by_id()` + `get_node_relationships()` 2회 쿼리.  
**개선안**: 노드 + 관계를 한 번에 반환하는 단일 Cypher 쿼리로 통합.

---

## CTO 관점 검토

### 유지보수성

| 항목 | 평가 |
|------|------|
| 단일 쿼리 | 로직이 한 곳(쿼리)에 모여 조회 조건 변경 시 수정 지점이 명확함. |
| 기존 코드 | `format_graph_data`·`_relationship_to_serializable`·`extract_node_id` 등 기존 함수와의 호환 유지 필요. 파이프라인 입력 형태만 “한 레코드(노드+관계 리스트)”로 바꾸면 됨. |
| 테스트 | 기존 노드 상세 API 응답 스펙(노드, relationships, maxStockRatioFromRels, shareholderCount, connected_node_ids)을 유지하면 E2E/스냅샷 테스트 재사용 가능. |

→ **유지보수성**: 단일 쿼리로 유리. 적용 시 기존 응답 스펙을 유지하는 전제로 진행 권장.

### 호환성

| 항목 | 평가 |
|------|------|
| API 계약 | 응답 JSON 구조(`node`, `relationships`, `maxStockRatioFromRels`, `shareholderCount`, `connected_node_ids`) 변경 없이 구현 가능. |
| 프론트 | 수정 불필요. |
| Neo4j 버전 | `OPTIONAL MATCH`, `collect`, `startNode(r)` 등 표준 Cypher로 작성 시 호환성 이슈 적음. |

→ **호환성**: 기존 API 계약을 지키면 호환성 유지 가능.

### 확장성

| 항목 | 평가 |
|------|------|
| 관계 limit | 단일 쿼리에서도 `LIMIT $limit` 유지 가능. 50 → 100 등 조정 시 파라미터만 변경하면 됨. |
| 방향 필터 | 나중에 “in만”/“out만” 필요 시 쿼리 패턴만 `(n)-[r]->(m)` / `(m)-[r]->(n)` 등으로 바꾸면 됨. |
| 추가 속성 | 노드/관계에 속성 추가돼도 `RETURN n, r, m, …` 확장으로 대응 가능. |

→ **확장성**: 단일 쿼리로 불리하지 않음.

### 협업 코드

| 항목 | 평가 |
|------|------|
| 리뷰 | “노드 상세는 한 번의 Cypher로 조회”라고 문서화하면 리뷰어가 의도 파악하기 쉬움. |
| 역할 분리 | DB 계층(database.py)에 `get_node_with_relationships()` 추가, service 계층은 “한 번에 노드+관계 받아서 가공”만 담당하도록 두면 역할이 명확해짐. |

→ **협업**: 문서화 + 계층 분리로 협업에 유리.

---

## 구현 시 권장 사항

1. **응답 스펙 유지**  
   `get_node_detail()`의 반환 형태를 현재와 동일하게 유지. (노드, relationships, maxStockRatioFromRels, shareholderCount, connected_node_ids)

2. **DB 계층에 단일 쿼리 메서드 추가**  
   예: `get_node_with_relationships(node_id, id_property, direction, limit)`  
   - 반환: `{ "node_record": {...}, "relationship_records": [...] }`  
   - 기존 `get_node_by_id` + `get_node_relationships` 호출을 이 메서드 한 번으로 대체.

3. **방향 계산**  
   Cypher에서 `startNode(r) = n` 등으로 방향을 구해 `direction` 필드로 넘기면, 서비스 계층의 `hasattr(rel, "start_node")` 의존을 제거할 수 있어 호환·성능 모두 유리.

4. **롤백 가능성**  
   기능 플래그나 설정으로 “단일 쿼리 / 기존 2회 쿼리”를 선택하게 두면, 문제 시 롤백이 쉬움.

---

## 결론

- **도입 권장**: 유지보수성·호환성·확장성·협업 모두에서 이점이 있고, 노드 상세 지연 완화에도 기여할 수 있음.
- **우선순위**: 타임아웃/폴백·vis 옵션 등 당장 이슈 해결 후, 백엔드 여유 있을 때 적용해도 됨.
- **문서**: 적용 시 이 문서에 “적용 일자, 사용 쿼리 요약, 기존 2회 쿼리 제거 여부”를 추가해 두면 이후 유지보수에 도움이 됨.
