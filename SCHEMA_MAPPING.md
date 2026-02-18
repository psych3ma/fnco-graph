# 스키마 매핑 가이드

## 실제 Neo4j 스키마

### 노드 라벨
- `Company`: 법인 (고유 ID: `bizno`)
- `Person`: 개인 (고유 ID: `personId`)
- `Stockholder`: 주주 (Company 또는 Person에 추가되는 라벨)
- `LegalEntity`: 법인 엔티티
- `Active`: 활성 회사
- `Closed`: 폐업 회사
- `MajorShareholder`: 주요 주주 (지분율 5% 이상)

### 관계 타입
- `HOLDS_SHARES`: 주주 보유 관계 (Stockholder -> Company)
  - 속성: `stockRatio`, `baseDate`, `stockCount`, `votingPower` 등
- `HAS_COMPENSATION`: 임원보수 관계 (Company -> Company, 자기 참조)
  - 속성: `baseDate`, `registeredExecTotalComp`, `registeredExecAvgComp` 등

### 주요 속성

#### Company 노드
- `bizno`: 사업자등록번호 (고유 ID)
- `companyName`: 회사명
- `companyNameNormalized`: 정규화된 회사명 (소문자)
- `taxNo`: 세무서 번호
- `status`: 상태
- `statusCode`: 상태 코드
- `isActive`: 활성 여부
- `closedDate`: 폐업일

#### Person 노드
- `personId`: 개인 식별자 (고유 ID)
- `stockName`: 주주명
- `stockNameNormalized`: 정규화된 주주명
- `stockSerialNo`: 주주 일련번호
- `shareholderType`: 주주 타입 ('PERSON', 'CORPORATION', 'INSTITUTION')
- `totalInvestmentCount`: 총 투자 수
- `totalStockRatio`: 총 지분율
- `maxStockRatio`: 최대 지분율
- `isInfluential`: 영향력 있는 주주 여부

## 백엔드 매핑

### 노드 ID 추출 우선순위

1. **Company 노드**:
   - `bizno` (우선)
   - `companyName` (fallback)

2. **Person 노드**:
   - `personId` (우선)
   - `stockName` (fallback)

3. **일반 노드**:
   - `id`, `bizno`, `personId`, `name`, `companyName`, `stockName`, `title` 순서

### 라벨 매핑

- `Company` → "Company"
- `Person` → "Person"
- `Stockholder` → "Stockholder" (또는 상위 라벨)
- 기타 → 첫 번째 라벨

### 관계 속성 매핑

- `stockRatio` → `pct` (호환성을 위해)
- `baseDate` → 날짜 정보
- 기타 속성 그대로 전달

## 프론트엔드 매핑

### 노드 타입 매핑 (필터용)

```javascript
const typeMap = {
  'Company': 'company',
  'Person': 'person',
  'Stockholder': 'major',  // 또는 'institution'
  'MajorShareholder': 'major'
};
```

### 검색 속성

- Company: `companyName`, `companyNameNormalized`, `bizno`
- Person: `stockName`, `stockNameNormalized`, `personId`

## 쿼리 예시

### 전체 그래프 조회
```cypher
MATCH (n)-[r:HOLDS_SHARES|HAS_COMPENSATION]->(m)
RETURN n, r, m, labels(n) as n_labels, labels(m) as m_labels, type(r) as rel_type
LIMIT 100
```

### Company 노드 검색
```cypher
MATCH (n:Company)
WHERE toLower(n.companyName) CONTAINS toLower('삼성')
   OR toLower(n.companyNameNormalized) CONTAINS toLower('삼성')
   OR n.bizno CONTAINS '삼성'
RETURN n, labels(n) as node_labels
LIMIT 50
```

### 특정 노드의 관계 조회
```cypher
MATCH (n {bizno: '123-45-67890'})-[r:HOLDS_SHARES]-(m)
RETURN n, r, m, labels(n) as n_labels, labels(m) as m_labels, type(r) as rel_type
LIMIT 100
```

## 호환성 고려사항

1. **하위 호환성**: 일반적인 `id`, `name` 속성도 지원
2. **자동 감지**: 라벨에 따라 적절한 ID 속성 자동 선택
3. **Fallback**: 여러 속성을 순차적으로 시도
