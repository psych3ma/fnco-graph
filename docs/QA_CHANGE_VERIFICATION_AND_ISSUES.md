# QA: 최근 변경점 검증 및 이슈 리스트

QA 전문가 관점에서 **변경 범위 파악 → 검증 체크리스트 → 이슈 리스트** 순으로 정리.

---

## 1. 변경점 요약

| 영역 | 파일 | 변경 요지 |
|------|------|-----------|
| **초기 로드·추천 노드** | app.js, api-client.js | `getGraphWithAnalysis()`로 graph+analysis 한 번에 수신; `getSuggestedFocusNode()`는 analysis.degree_centrality/pagerank 우선, 없으면 클라이언트 degree |
| **그래프 선택 동기화** | graph-manager.js | `buildGraph()` 후 현재 표시 노드 집합에 선택이 있으면 vis 선택·하이라이트 재적용, 없으면 `selectedNode` null |
| **로딩 레이아웃** | loading-variants.css | variant-unified에서 메시지 영역 min/max height, 단계 영역 min-height·flex-shrink:0으로 위/아래 섹션 고정 |
| **노드 상세·연결 노드** | panel-manager.js | node 속성 `rawNode.properties` 병합, `getDisplayNameFromRecord`/`extractNodeIdFromRecord`에서 properties 경로 지원, `dedupeConnectedNodes()`로 id 기준 디듀프 |
| **버튼·탭** | panel-manager.js | `loadEgoGraph` 실패 시 토스트, `openChatWithContext` 선택 없을 때 안내, `switchTab`에서 chat/detail `display` 명시 |
| **선택 시 멈춤 완화** | graph-manager.js | `focusNode`에서 `setState` 후 `requestAnimationFrame` 안에서 `highlightNeighbors`·줌 실행 |

---

## 2. QA 체크리스트 (검증 항목)

### 2.1 초기 로드·첫 화면 포커스
- [ ] 앱 최초 로드 시 `/api/graph/analysis` 호출로 graph+analysis 한 번에 수신되는지 (네트워크 탭)
- [ ] 분석 성공 시 “연결이 많은 노드로 이동했습니다” 토스트가 세션당 1회만 나오는지
- [ ] 분석 API 실패/미제공 시에도 그래프는 표시되고, 첫 화면 포커스는 (클라이언트 degree 기준) 동작하는지
- [ ] 분석 응답 시 노드 ID 타입(문자열/숫자) 혼합 환경에서도 추천 노드가 나오는지 (이슈 #1: 코드에서 `scores[id] ?? scores[String(id)]` 적용됨)

### 2.2 그래프 선택·패널 연동
- [ ] 노드 클릭 → 패널에 해당 노드 상세 표시, 그래프에 선택·하이라이트 적용
- [ ] 캔버스(빈 곳) 클릭 → 선택 해제, 패널 빈 상태
- [ ] 필터 변경 또는 “전체 그래프로 돌아가기” 후 `buildGraph` 호출 시: 선택 노드가 현재 그래프에 있으면 선택·하이라이트 유지, 없으면 선택 해제·패널 빈 상태
- [ ] 검색 결과 선택·패널 “연결 노드”에서 노드 클릭 시 해당 노드로 포커스·패널 갱신

### 2.3 로딩 UI
- [ ] 로딩 중 메시지가 짧은 문구(“마무리 중…”)와 긴 문구로 바뀌어도 위(스피너+메시지)·아래(단계) 영역이 줄었다 늘었다 하지 않는지
- [ ] 단계가 4개일 때 단계 영역이 잘리지 않고 고정 높이로 표시되는지

### 2.4 노드 상세
- [ ] **최대주주 지분율·주주 수**: 백엔드가 `node.properties` 또는 관계 기반 값을 주면 `-` 없이 숫자/값 표시되는지
- [ ] **연결 노드**: 동일 인물/회사가 여러 관계로 나와도 id 기준 1행만 표시되는지(중복 이름 사라짐)
- [ ] 연결 노드 “더보기” 펼침 시 개수와 목록이 일치하는지 (디듀프 후 개수 기준)
- [ ] API가 `n`/`m`을 Neo4j 직렬화 형태(`properties` 하위)로만 주는 경우 표시명·ID가 올바르게 나오는지

### 2.5 맵 보기·AI 질문
- [ ] 노드 선택 후 “이 노드 기준 지배구조 맵 보기” 클릭 → 이고 그래프 로드, 배너 표시
- [ ] 이고 API 실패 시 “지배구조 맵을 불러오지 못했습니다…” 토스트 표시
- [ ] 노드 선택 후 “이 노드에 대해 AI에게 질문하기” 클릭 → AI 질문 탭으로 전환, 채팅 영역이 보이고 컨텍스트 설정되는지
- [ ] 선택 없이 버튼 클릭 시 스크린 리더 안내(“노드를 먼저 선택해 주세요”) 또는 시각적 피드백

### 2.6 노드 선택 시 멈춤
- [ ] 노드 수가 많은 그래프에서 노드 클릭 시 이전보다 멈춤이 줄어들었는지 (선택 반영이 먼저, 하이라이트는 다음 프레임)

---

## 3. 이슈 리스트 (발견·잠재)

### 이슈 #1 (조치함) — 추천 노드: analysis 점수 키 타입 불일치
- **위치**: `app.js` `getSuggestedFocusNode()`
- **내용**: `analysis.degree_centrality` / `analysis.pagerank`의 키가 JSON 직렬화로 문자열인데, `nodeIds`에 숫자 등이 섞여 있으면 `scores[id]`가 undefined가 될 수 있음.
- **조치**: `scores[id] ?? scores[String(id)]`로 조회하도록 수정함.

### 이슈 #2 (잠재) — 연결 노드 수 라벨 의미 변경
- **위치**: 노드 상세 “연결 노드 (N)”
- **내용**: 디듀프 적용 후 N이 “관계 수”가 아니라 “고유 노드 수”로 바뀜. 기존에 “연결 노드 (49)”가 관계 49개 기준이었다면 이제는 49보다 작은 고유 노드 수가 표시될 수 있음.
- **영향**: 기대값이 “관계 수”인 사용자/문서와 불일치할 수 있음.
- **권장**: 기획/문서에서 “연결된 고유 노드 수”로 정의하고, 필요 시 툴팁 등으로 설명.

### 이슈 #3 (잠재) — nodeProps 병합 시 최상위와 properties 중복 키
- **위치**: `panel-manager.js` `nodeProps = { ...rawNode.properties, ...rawNode }`
- **내용**: `rawNode`에 `companyName`이 있고 `rawNode.properties`에도 있으면, spread 순서에 따라 한쪽만 적용됨. 현재는 properties를 먼저 펼치고 rawNode로 덮어쓰므로, **최상위 키가 우선**.
- **영향**: Neo4j가 노드 직렬화 시 `properties` 안에만 넣고 최상위에는 없으면 정상 동작. 반대로 최상위에만 있으면 정상. 둘 다 있으면 최상위 값 사용.
- **권장**: “노드 속성은 properties 우선”으로 통일하려면 `{ ...rawNode, ...rawNode.properties }` 등 순서 변경 검토. 현재는 의도된 동작으로 두어도 됨.

### 이슈 #4 (확인 권장) — switchTab 시 초기 chat 영역 display
- **위치**: `panel-manager.js` `switchTab('chat')`
- **내용**: `chatBody.style.display = 'flex'`를 명시했으나, 초기 HTML에서 `.chat-section`이 `display: none`일 때 JS가 로드되기 전에 한 번도 호출되지 않으면, 다른 CSS가 `display`를 덮어쓸 경우 탭 전환이 안 보일 수 있음.
- **권장**: 실제 환경에서 “AI 질문” 탭 클릭 시 채팅 영역이 항상 보이는지 확인. 이미 명시적 설정으로 해결되었을 가능성 높음.

### 이슈 #5 (잠재) — 로컬 fallback 연결 노드 displayName
- **위치**: `panel-manager.js` 로컬 fallback `displayName: null`
- **내용**: API 실패 시 `connectedNodes`에 `displayName: null`인 항목이 들어가고, `connItem`에서 `c.displayName || c.id`로 표시하므로 **id만 보임**. 그래프에선 displayName이 있는 rawNodes와 불일치할 수 있음.
- **영향**: API 실패 시 연결 노드 목록이 id 나열처럼 보일 수 있음. fallback 동작 범위 내.
- **권장**: 로컬에서 `rawNodes`로 displayName 보강 가능(선택).

### 이슈 #6 (문서/협업) — 상세 API race 미해결
- **내용**: 빠르게 A→B 노드를 연속 클릭 시, B가 선택됐는데 패널에 A 상세가 나올 수 있는 race는 그대로임(요청 취소/세대 토큰 미적용).
- **권장**: CTO 문서에 명시된 대로 추후 `renderNodeDetail`에 “마지막 요청만 반영” 또는 AbortController 도입 검토.

---

## 4. 실행한 검증

| 항목 | 결과 |
|------|------|
| 프론트 JS 린트 (app, api-client, graph-manager, panel-manager) | 에러 없음 |
| 백엔드 Python import | 환경에 따라 실패 가능(Neo4j 등 의존성). 로컬에서 서버 기동 후 수동 QA 권장. |

---

## 5. 권장 후속 조치

1. **이슈 #1**: `getSuggestedFocusNode()`에서 analysis 점수 조회 시 `String(id)` fallback 적용.
2. **이슈 #2**: “연결 노드 (N)”가 고유 노드 수임을 팀/문서에 공유.
3. **이슈 #4, #5**: 실제 브라우저·백엔드 연동 환경에서 한 번씩 회귀 테스트.
4. **이슈 #6**: 상세 API race는 별도 스프린트에서 처리 여부 결정.

위 체크리스트로 회귀 테스트 진행 후, 발견된 추가 이슈는 이 문서의 “이슈 리스트” 섹션에 번호 이어서 기입하면 됨.
