// Neo4j 인덱스 권장 스크립트 (Neo4j 4.4+ / 5.x)
// 협업: 스키마(backend/config.py NodeLabel, NodeProperty)와 맞춰 유지보수
// 실행: neo4j-shell 또는 Browser에서 블록 단위 실행

// -----------------------------------------------------------------------------
// 1. 노드 ID 조회 가속 (get_node_by_id, get_node_relationships, 그래프 조회 시 조인)
// -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS FOR (n:Company) ON (n.bizno);
CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.personId);

// Stockholder는 Company/Person과 겹칠 수 있음. 라벨이 둘 다면 위 인덱스로 커버
// CREATE INDEX IF NOT EXISTS FOR (n:Stockholder) ON (n.bizno);
// CREATE INDEX IF NOT EXISTS FOR (n:Stockholder) ON (n.personId);

// -----------------------------------------------------------------------------
// 2. 검색( CONTAINS ) 가속 — 검색 속성 (search_nodes)
// -----------------------------------------------------------------------------
// Neo4j 5.x: TEXT 인덱스 권장. 4.x: 아래는 RANGE로 실행 (CONTAINS는 풀스캔 가능성 있음)
CREATE INDEX IF NOT EXISTS FOR (n:Company) ON (n.companyName);
CREATE INDEX IF NOT EXISTS FOR (n:Company) ON (n.companyNameNormalized);
CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.stockName);
CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.stockNameNormalized);
// 5.x 전용 TEXT 인덱스(선택): CREATE TEXT INDEX ... ON (n.companyName) 등

// -----------------------------------------------------------------------------
// 3. 통계/필터 (shareholderType 등) — 필요 시 추가
// -----------------------------------------------------------------------------
// CREATE INDEX IF NOT EXISTS FOR (n:Stockholder) ON (n.shareholderType);

// 확인 (선택)
// SHOW INDEXES;
