# CTO: 참조 서비스(타 서비스) vs 현재 노드상세·AI질문 현황 및 차이

참조 코드: Neo4j + Vector Index + GraphCypherQAChain + ask_graph 통합.  
현재 fnco-graph: 노드상세(노드 상세 패널), AI질문(채팅 탭 + /api/chat).

---

## 1. 노드상세 (Node Detail) 현황

| 항목 | 참조 서비스 | 현재 fnco-graph |
|------|-------------|------------------|
| 노드 클릭 시 상세 | (참조 코드에 노드상세 패널 미포함) | ✅ get_node_detail → 패널에 표시 |
| 로딩 표시 | - | ✅ "노드 정보를 불러오는 중…" |
| 연결 노드 중복 | - | ✅ dedupeConnectedNodes (id + displayName) |
| 연결 노드 보유비율 | - | ✅ relPct + 백엔드 stock_ratio→stockRatio |

노드상세는 참조 코드와 직접 대응되는 부분이 없으며, 현재 구현이 기준으로 유지됨.

---

## 2. AI질문 (채팅) 현황 및 차이

### 2.1 참조 서비스 (정상 동작)

- **스택**: LangChain (`GraphCypherQAChain`, `Neo4jGraph`, `ChatOpenAI`), Vector Index(회사명 유사 검색).
- **ask_graph(question)**:
  1. `find_similar_companies(question)` → 유사 회사명 힌트로 질문 보강.
  2. `GraphCypherQAChain.invoke({ query, chat_history })` → 스키마+질문으로 Cypher 생성 → **Neo4j에서 실행** → 결과를 컨텍스트로 LLM에 전달해 답변 생성.
  3. **서버 측 대화 이력** 유지 (`_chat_history`, 최근 3턴), chain에 전달.
  4. 반환: `answer`, `cypher`, `raw`, `hints`, `source`, `confidence`, `elapsed`.
- **reset_chat()**: `_chat_history` 초기화.

### 2.2 현재 fnco-graph

- **스택**: OpenAI 클라이언트 직접 사용, LangChain/Vector Index 없음.
- **chat_with_graph(message, context)**:
  1. 컨텍스트 노드가 있으면 `get_node_detail`로 연결 수 등만 요약해 문자열로 추가.
  2. **Cypher 생성·실행 없음**. 스키마 설명 + 통계 + 사용자 질문을 프롬프트에 넣고 LLM이 **추론만** 해 답변 생성.
  3. **서버 측 대화 이력 없음**. 매 요청 독립.
  4. 반환: `response`, `graph_data`(항상 None).

### 2.3 차이 리스트업

| 구분 | 참조 서비스 | 현재 fnco-graph |
|------|-------------|------------------|
| Cypher 실행 | ✅ chain이 Cypher 생성 후 Neo4j 실행 | ❌ 실행 없음, LLM 추론만 |
| 답변 근거 | DB 조회 결과를 컨텍스트로 전달 | 스키마·통계 텍스트만 전달 |
| Vector Index | ✅ 회사명 유사 검색으로 질문 보강 | ❌ 없음 |
| 서버 대화 이력 | ✅ 최근 3턴 유지, chain에 전달 | ❌ 없음 |
| reset_chat | ✅ 서버 이력 초기화 | ❌ (프론트만 초기화) |
| 응답 형식 | answer, cypher, raw, hints, source, confidence, elapsed | response, graph_data |
| 에러 처리 | context_length/token 구분, 대화 이력 미추가 | 일반 예외 시 에러 메시지 반환 |

---

## 3. 참고 반영 방향 (정상 동작)

- **백엔드**
  - Cypher 생성(프롬프트) → **read_only로 Neo4j 실행** → 실행 결과를 컨텍스트로 LLM에 넘겨 답변 생성 (참조의 ask_graph 흐름과 동일 개념).
  - 서버 측 **채팅 이력** 유지(최근 N턴), 답변 생성 시 전달.
  - 필요 시 **reset_chat** 엔드포인트 추가.
  - 응답에 `cypher`, `raw`(선택), `source` 등 확장해 프론트에서 활용 가능하게.
- **프론트**
  - 기존처럼 `response`로 답변 표시 유지.
  - 옵션: cypher/raw가 오면 접이식 영역 등으로 표시.
- **NetworkX**
  - AI질문/채팅은 Neo4j + LLM 경로만 사용. NetworkX는 분석(추천 노드 등)용으로 유지.

---

## 4. 적용 내용 (참조 반영 후)

- **백엔드**
  - `chat_with_graph` → 내부에서 `_ask_graph_flow` 호출.
  - `_ask_graph_flow`: (1) 스키마 문자열 생성 (`_get_schema_for_cypher`) (2) LLM으로 Cypher 생성 (3) `db.execute_query(cypher, read_only=True)` 실행 (4) DB 결과를 컨텍스트로 LLM에 전달해 답변 생성 (5) `_chat_history` 유지(최근 6턴), 성공 시에만 추가.
  - `reset_chat()` 추가, `POST /api/chat/reset` 노출.
  - `ChatResponse`에 `cypher`, `raw`, `source`, `elapsed` 선택 필드 추가.
- **프론트**
  - `resetChat()` 시 `apiClient.resetChat()` 호출로 서버 이력도 초기화.
  - 기존 `response` 필드로 답변 표시 유지(호환).

**미적용(선택)**  
- LangChain / Vector Index: 의존성 없이 동일 흐름만 구현. 추후 회사명 유사 검색 등 필요 시 `find_similar_companies` 스타일 추가 가능.

---

## 5. 관련 파일

| 구분 | 파일 |
|------|------|
| 참조 | (제공된 GraphService 코드) |
| 백엔드 | backend/service.py (_ask_graph_flow, reset_chat, chat_with_graph), backend/main.py (/api/chat, /api/chat/reset), backend/models.py (ChatResponse) |
| 프론트 | frontend/webapp/js/core/chat-manager.js, api-client.js (sendChatMessage, resetChat) |
| 문서 | 본 문서 |
