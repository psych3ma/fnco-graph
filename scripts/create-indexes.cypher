// Neo4j 인덱스 생성 스크립트
// Neo4j 전문가 CTO 관점에서 작성된 최적화 인덱스

// ============================================
// 필수 인덱스 (성능 최적화)
// ============================================

// Company 노드의 bizno 인덱스 (고유 ID)
CREATE INDEX company_bizno IF NOT EXISTS
FOR (n:Company) ON (n.bizno);

// Person 노드의 personId 인덱스 (고유 ID)
CREATE INDEX person_personId IF NOT EXISTS
FOR (n:Person) ON (n.personId);

// Stockholder 노드의 ID 인덱스
CREATE INDEX stockholder_id IF NOT EXISTS
FOR (n:Stockholder) ON (n.id);

// ============================================
// 검색 최적화 인덱스 (Full-text)
// ============================================

// Company 이름 검색 최적화
CREATE FULLTEXT INDEX company_name_fulltext IF NOT EXISTS
FOR (n:Company) ON EACH [n.companyName, n.companyNameNormalized];

// Person 이름 검색 최적화
CREATE FULLTEXT INDEX person_name_fulltext IF NOT EXISTS
FOR (n:Person) ON EACH [n.stockName, n.stockNameNormalized];

// ============================================
// 관계 쿼리 최적화 인덱스
// ============================================

// HOLDS_SHARES 관계의 pct 속성 인덱스 (필요시)
// CREATE INDEX holds_shares_pct IF NOT EXISTS
// FOR ()-[r:HOLDS_SHARES]-() ON (r.pct);

// ============================================
// 복합 인덱스 (필요시)
// ============================================

// Company의 상태와 이름 복합 인덱스 (필요시)
// CREATE INDEX company_status_name IF NOT EXISTS
// FOR (n:Company) ON (n.status, n.companyName);

// ============================================
// 인덱스 확인 쿼리
// ============================================

// 생성된 인덱스 확인
SHOW INDEXES;

// 인덱스 사용 통계 확인
CALL db.indexes() YIELD name, state, type, properties
RETURN name, state, type, properties
ORDER BY name;
