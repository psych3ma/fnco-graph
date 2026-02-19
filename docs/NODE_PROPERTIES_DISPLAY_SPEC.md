# 노드 유형별 속성 표출 현황 (정리용)

협업·직접 정하기 위해 **현재 표시 규칙**과 **유형별 예상 속성**을 정리했습니다.  
표출/미표출을 정한 뒤, 구현은 `frontend/webapp/js/core/panel-manager.js` 또는 `frontend/webapp/js/config/constants.js`에서 적용하면 됩니다.

---

## 1. 현재 구현 요약

- **적용 위치**: `panel-manager.js` → `buildDetailHTML()` 내 속성 렌더링
- **규칙**: **모든 노드 유형 공통**
  - `node.properties`를 순회
  - 아래 **제외 키**에 해당하면 **미표출**
  - 나머지는 **전부 표출**

### 현재 제외 키 (미표출)

| 키 | 사유 |
|----|------|
| `created` | 레퍼런스 요청(created 계열 미표출) |
| `createdAt` | 위와 동일 |
| `created_at` | 위와 동일 |
| `displayName` | 상단 이름으로 이미 표시 |
| `labels` | Neo4j 라벨 배열, UI용 아님 |
| `nodeType` | 상단 뱃지(회사/개인주주 등)로 이미 표시 |

### 현재 표출 (위 제외 키 외)

- **표출**: `node.properties`에 있는 **그 외 모든 키**
- **유형 구분 없음**: 회사/개인주주/최대주주/기관 동일 규칙 적용

---

## 2. 노드 유형 정의 (프론트 기준)

| UI 표시명 | 식별 | 비고 |
|-----------|------|------|
| 회사 | `label: Company` 또는 `type: 'company'` | Neo4j 라벨 Company |
| 개인주주 | `label: Person` 또는 `type: 'person'` | Neo4j 라벨 Person |
| 최대주주 | `label: Stockholder` + `displayType: 'major'` | 주주 중 기관 아님 |
| 기관 | `label: Stockholder` + `displayType: 'institution'` | `shareholderType === 'INSTITUTION'` |

---

## 3. 유형별 예상 속성 (스키마·백엔드 기준)

Neo4j·백엔드에서 올 수 있는 속성만 정리했습니다. 실제 DB에 따라 있을 수도/없을 수도 있습니다.

### 3.1 회사 (Company)

| 속성 키 | 설명 | 현재 표출 |
|---------|------|------------|
| `bizno` | 사업자등록번호 | ✅ (제외 키 아님) |
| `companyName` | 회사명 | ✅ |
| `companyNameNormalized` | 정규화 회사명 | ✅ |
| 기타 DB 필드 | taxNo, taxType, status, statusCode, dataSource, isActive, biznoOriginal 등 | ✅ (있으면 표출) |
| `displayName` | 표시명 (헤더용) | ❌ 제외 |
| `labels` | 라벨 배열 | ❌ 제외 |
| `created` / `createdAt` / `created_at` | 생성 시각 | ❌ 제외 |

### 3.2 개인주주 (Person)

| 속성 키 | 설명 | 현재 표출 |
|---------|------|------------|
| `personId` | 개인 식별자 | ✅ |
| `stockName` | 주주명 | ✅ |
| `stockNameNormalized` | 정규화 주주명 | ✅ |
| 기타 DB 필드 | 실제 스키마에 있는 모든 필드 | ✅ (있으면 표출) |
| `displayName` | 표시명 | ❌ 제외 |
| `labels` | 라벨 배열 | ❌ 제외 |
| `created*` | 생성 시각 | ❌ 제외 |

### 3.3 최대주주 (Stockholder, major)

- Company 또는 Person 노드에 **Stockholder** 라벨이 붙은 경우.
- 속성은 **회사와 동일** 또는 **개인과 동일** (실제 노드가 Company인지 Person인지에 따름).
- 추가로 있을 수 있는 키:
  - `shareholderType`: `'PERSON'` / `'CORPORATION'` 등 (기관이면 `'INSTITUTION'`)

| 속성 키 | 설명 | 현재 표출 |
|---------|------|------------|
| Company와 동일 또는 Person과 동일 | 위 3.1/3.2 참고 | ✅ |
| `shareholderType` | PERSON / CORPORATION 등 | ✅ |
| `displayType` | 프론트 필터용 `'major'` | ✅ (제외 키 아님) |
| `displayName`, `labels`, `created*` | 동일 | ❌ 제외 |

### 3.4 기관 (Stockholder + shareholderType INSTITUTION)

- 최대주주와 동일 스키마, **`shareholderType === 'INSTITUTION'`** 인 경우.
- 속성 집합은 최대주주와 동일, 값만 다름.

| 속성 키 | 설명 | 현재 표출 |
|---------|------|------------|
| 최대주주와 동일 | 위 3.3 참고 | ✅ |
| `displayType` | `'institution'` | ✅ |
| `displayName`, `labels`, `created*` | 동일 | ❌ 제외 |

---

## 4. 직접 정하기 위한 체크리스트

아래는 **표출/미표출을 정할 때** 참고하면 되는 포맷입니다.  
원하면 “표출”/“미표출” 열만 채워서 팀과 합의 후, 코드에 반영하면 됩니다.

### 4.1 공통 (모든 유형)

| 속성 키 | 표출 여부 (직접 정하기) | 비고 |
|---------|-------------------------|------|
| `displayName` | ❌ 미표출 (현재) | 상단 이름으로 사용 |
| `labels` | ❌ 미표출 (현재) | 라벨 배열 |
| `nodeType` | ❌ 미표출 (현재) | 상단 뱃지로 사용 |
| `created` / `createdAt` / `created_at` | ❌ 미표출 (현재) | 생성 시각 |
| `displayType` | (선택) | major / institution 구분용, 보통 미표출 가능 |

### 4.2 회사 (Company)

| 속성 키 | 표출 여부 (직접 정하기) | 비고 |
|---------|-------------------------|------|
| `bizno` | | |
| `companyName` | | |
| `companyNameNormalized` | | |
| `taxNo` | | |
| `taxType` | | |
| `status` | | |
| `statusCode` | | |
| `dataSource` | | |
| `isActive` | | |
| `biznoOriginal` | | |
| 기타 | | DB에 추가된 필드 |

### 4.3 개인주주 (Person)

| 속성 키 | 표출 여부 (직접 정하기) | 비고 |
|---------|-------------------------|------|
| `personId` | | |
| `stockName` | | |
| `stockNameNormalized` | | |
| 기타 | | DB에 추가된 필드 |

### 4.4 최대주주 (major)

| 속성 키 | 표출 여부 (직접 정하기) | 비고 |
|---------|-------------------------|------|
| 회사/개인과 동일 + `shareholderType` | | Company 또는 Person 기반 |

### 4.5 기관 (institution)

| 속성 키 | 표출 여부 (직접 정하기) | 비고 |
|---------|-------------------------|------|
| 최대주주와 동일 | | shareholderType = INSTITUTION |

---

## 5. 구현 시 적용 방법 (협업용)

- **유형별로 다르게 하려면**
  - `panel-manager.js`의 속성 렌더링에서 `node.type` 또는 `node.label`로 분기
  - 또는 `frontend/webapp/js/config/constants.js`에 **유형별 표출/미표출 목록** 정의 후, 패널에서 해당 목록만 사용해 렌더링

예시 (상수로 관리할 경우):

```js
// constants.js 예시
export const NODE_PROPERTIES_DISPLAY = {
  company:   { show: ['bizno', 'companyName', 'taxNo', ...], hide: ['created', 'createdAt', ...] },
  person:    { show: ['personId', 'stockName', ...], hide: [...] },
  major:     { show: ['shareholderType', ...], hide: [...] },
  institution: { show: ['shareholderType', ...], hide: [...] },
};
```

- **현재처럼 “제외만” 하려면**
  - 지금처럼 `excludeKeys` Set만 유지하고, 필요 시 여기에 키 추가 (예: `displayType` 등)

이 문서에 표출/미표출을 채워 두면, 그에 맞춰 `excludeKeys` 또는 `NODE_PROPERTIES_DISPLAY`를 수정하면 됩니다.
