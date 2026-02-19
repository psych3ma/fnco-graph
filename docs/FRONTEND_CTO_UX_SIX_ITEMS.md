# 프론트엔드 CTO 검토: 6가지 UX 반영 (협업 코드 고려)

## 적용 요약

| # | 요구사항 | 적용 내용 | 파일 |
|---|----------|-----------|------|
| (1) | 최대주주 지분율·주주 수 2가지만 표시 | nd-stats에서 "연결 노드" 칸 제거, grid 2열 | panel-manager.js, styles.css |
| (2) | 이름 앞 2글자 표시하지 않기 | 그래프 노드 라벨을 전체 이름만 표시 (shortName 제거) | graph-manager.js |
| (3) | 직접 검색 시 자동검색어가 뒤에 뜨지 않기 | 인라인 자동완성 없음(드롭다운만 사용), `autocomplete="off"` 유지 | — (기존 충족) |
| (4) | 직접 검색 시 창 테두리 강조 안 함 | 검색 input focus 시 border-color를 accent 대신 canvas-border 유지 | styles.css |
| (5) | 자동검색어에서 숫자(bizno 등) 미표출 | 제안 항목 표시 시 id가 숫자면 displayName/companyName/stockName 사용 | app.js |
| (6) | 주주수 0 또는 '-' → 검색에서만 표출, 그래프 미표시 | 초기 그래프 로드 시 totalInvestmentCount 0/'-' 노드·엣지 제외 | app.js |

---

## (1) 최대주주 지분율, 주주 수 2가지만 표시

- **panel-manager.js**: `nd-stats` 내 "연결 노드" stat 블록 제거. "최대주주 지분율", "주주 수"만 유지.
- **styles.css**: `.nd-stats`를 `grid-template-columns: repeat(2,1fr)` 로 변경.

---

## (2) 이름 앞 2글자 표시하지 않기

- **graph-manager.js**: 노드 라벨을 2단(짧은 이름 + 전체 이름)에서 **전체 이름만** 표시하도록 변경. `shortName` 사용 제거, `label = fullName`만 사용. `font.multi: 'html'` 제거.

---

## (3) 직접 검색 시 자동검색어가 뒤에 뜨지 않기

- 입력창 **안**에 자동완성 문구가 이어져 나오는(ghost) UI는 구현되어 있지 않음. 제안은 `#suggestions` 드롭다운에만 표시됨.
- `autocomplete="off"` 유지로 브라우저 기본 자동완성도 비활성화.

---

## (4) 직접 검색 시 창 테두리 강조 안 함

- **styles.css**: `.search-wrap input:focus` 에서 `border-color: var(--accent)` 제거, `border-color: var(--canvas-border)` 로 통일, `outline: none` 유지.

---

## (5) 자동검색어에서 숫자(bizno 등) 표출하지 않기

- **app.js** `handleSearch`: 제안 목록 렌더 시, `node.id`가 숫자만 있으면(bizno 등) **표시 텍스트**로 `node.id` 대신 `displayName` 또는 `companyName`/`stockName` 사용.
- `displayLabel = node.properties?.displayName || node.properties?.companyName || node.properties?.stockName || node.id`
- `isNumericId = /^\d+$/.test(String(node.id))` → 숫자 id면 `suggestionText = displayLabel`, 아니면 기존처럼 `node.id` 사용. (클릭/포커스 시 사용하는 `data-id` 등은 계속 `node.id` 유지.)

---

## (6) 주주수 0 또는 '-' 인 경우

- **그래프(단독 노드 디스플레이)**: 표시하지 않음.
- **직접 검색**: 검색 결과(제안 목록)에는 그대로 표출.

**구현 (app.js)**  
- 초기 그래프 로드 시 `graphData.nodes`에서 `totalInvestmentCount`가 `0`, `'0'`, `'-'`(문자열 포함)인 노드 제외한 배열로 `rawNodes` 생성.
- `graphData.edges`는 양끝 노드가 위 필터 통과한 노드에 한해 포함되도록 필터링 후 `rawLinks` 생성.

```js
const shCountExcluded = (n) => {
  const v = n.properties?.totalInvestmentCount;
  if (v === undefined || v === null) return false;
  return v === 0 || v === '0' || String(v).trim() === '-';
};
const graphNodes = graphData.nodes.filter(n => !shCountExcluded(n));
// rawNodes = graphNodes.map(...)
// rawLinks = graphData.edges.filter(edge => 양끝이 graphNodes에 있는 경우).map(...)
```

- 검색 API 결과(`searchGraph`)로 그리는 제안 목록은 변경 없음 → 주주수 0/'-' 노드도 검색 시에는 표시됨.

---

## 협업·유지보수

- **통계 칸 개수**: `nd-stats` 내 stat 블록과 CSS `repeat(2,1fr)`만 보면 됨.
- **노드 라벨**: 그래프 노드 라벨 규칙은 `graph-manager.js` `toVisNode` 한 곳.
- **검색 제안 표시**: `app.js` `handleSearch` 내 `displayLabel`/`isNumericId`/`suggestionText` 로직. 표시할 속성 추가 시 여기와 백엔드 `properties`만 맞추면 됨.
- **주주수 필터**: `shCountExcluded`와 `graphNodes` 필터. 속성 키(`totalInvestmentCount`) 또는 조건 변경 시 이 블록만 수정.

---

## 수정된 파일

- `frontend/webapp/js/core/panel-manager.js` — (1)
- `frontend/webapp/css/styles.css` — (1) nd-stats 2열, (4) 검색 focus 테두리
- `frontend/webapp/js/core/graph-manager.js` — (2)
- `frontend/webapp/js/app.js` — (5) 제안 표시 텍스트, (6) 주주수 필터 및 엣지 필터
