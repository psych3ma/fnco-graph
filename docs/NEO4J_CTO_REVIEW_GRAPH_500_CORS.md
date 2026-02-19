# Neo4j CTO 관점 검토: /api/graph 500 및 CORS (협업 코드 고려)

## 현상
- 프론트에서 `GET /api/graph` 호출 시 **500 Internal Server Error**
- 브라우저: `No 'Access-Control-Allow-Origin' header` → CORS로 차단되어 실제 오류 확인 어려움
- `/health`는 200, Neo4j `connected` → 500 원인은 **그래프 쿼리/가공 단**으로 추정

## 원인 정리
1. **500 응답에 CORS 헤더 미포함**  
   예외 발생 시 FastAPI/Starlette에서 만든 에러 응답에 CORS 미들웨어가 헤더를 붙이지 않는 경우가 있어, 브라우저가 CORS 에러만 표시함.
2. **그래프 포맷팅/직렬화에서 예외**  
   Neo4j 결과(`record.data()`)의 Node/Relationship 타입, `labels` 등이 그대로 전달되면 Pydantic/JSON 직렬화 단계에서 예외 가능.

## 적용한 수정 (협업 코드 고려)

### 1. 에러 응답에도 CORS 헤더 보장 (`backend/main.py`)
- **`CORSOnErrorMiddleware`** 추가: 응답에 `Access-Control-Allow-Origin`이 없으면, `Origin` 요청 헤더가 `config.CORS_ORIGINS`에 있을 때만 해당 origin으로 헤더 설정.
- 500/예외 응답에서도 CORS가 붙어, 브라우저에서 “CORS blocked”가 아닌 **실제 500 본문**을 볼 수 있음.

### 2. 그래프 데이터 방어 코드 (`backend/service.py`)
- **`_serializable_dict` / `_serializable_value`**  
  Neo4j 타입이 섞인 dict/값을 JSON 직렬화 가능한 타입으로 변환 (문자열/숫자/리스트/딕셔너리만 허용, 그 외는 `str()`).
- **`_normalize_labels`**  
  `labels(n)` 결과를 `List[str]`로 통일해 Pydantic/직렬화 오류 방지.
- **`extract_node_properties`**  
  Node가 `_properties` 없거나 다른 드라이버 버전이어도 동작하도록 분기 추가, 예외 시 `{}` 반환.
- **`format_graph_data`**  
  - 레코드 단위 `try/except`: 한 레코드 오류가 전체를 실패시키지 않도록 함.  
  - `node_id`/`source_id`/`target_id` 없으면 해당 엣지 스킵.  
  - `rel_type`·`rel_props`를 항상 직렬화 가능하도록 처리.
- **`get_graph_data`**  
  `Neo4jConnectionError`는 그대로 전파, 그 외 예외는 로그(`logger.exception`) 후 빈 `GraphData` 반환해 500 대신 빈 그래프로 응답.

### 3. 협업/운영
- CORS origin은 기존처럼 `config.CORS_ORIGINS`(env `CORS_ORIGINS`)로 관리.
- 예외 시 `logger.exception`으로 스택 트레이스 확보 가능.

## 확인 방법
1. 백엔드 재시작 후 `http://localhost:8080`에서 앱 새로고침.
2. 여전히 실패 시: 브라우저 개발자 도구 → Network에서 `/api/graph` 요청 선택 → Response 본문에서 500 상세 메시지 확인 (CORS로 막히지 않아야 함).
3. 서버 터미널에서 `그래프 데이터 조회 실패` / `format_graph_data skip record` 로그로 원인 추적.

## 추가 권장 (선택)
- `/api/graph`에 요청 로깅(파라미터, 소요 시간) 추가 시 운영 디버깅에 유리.
- Neo4j 쿼리 타임아웃·최대 결과 수는 `config`/env로 두어 팀 협업 시 조정 용이.
