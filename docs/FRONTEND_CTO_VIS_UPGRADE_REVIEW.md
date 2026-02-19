# vis 4.21 → vis-network 업그레이드 검토 (프론트엔드 CTO 관점)

## 현황
- **사용 중**: `vis 4.21.0` (cdnjs) — 구 vis.js 단일 번들.
- **대상**: `vis-network` (현재 9.x, npm/ESM) — 네트워크 전용 분리 버전.

## 검토 요약

| 항목 | vis 4.21 | vis-network 9.x | 비고 |
|------|----------|-----------------|------|
| API | `fit({ nodes })` 동작 불확실, `moveTo` 사용 | `fit(nodes)`, `focus(nodeId, options)` 명확 | 노드 포커스는 현재 moveTo로 우회 구현됨 |
| 번들 | 전역 `vis` (script 태그) | ESM import, tree-shake 가능 | 빌드 도입 시 유리 |
| 유지보수 | 구버전, 보안/버그 픽스 제한적 | 활발한 유지보수 | 장기 확장성 |
| 호환성 | 기존 코드 그대로 동작 | API/옵션 이름 일부 변경 | 마이그레이션 비용 |

## 권장 의견

1. **단기**: vis 4.21 유지
   - 줌/포커스는 이미 `getPosition` + `moveTo`로 보완됨.
   - 업그레이드는 기능 추가/리팩터와 별도 스프린트로 두는 편이 협업·리스크 관리에 유리.

2. **중기(업그레이드 시)**  
   - **의존성**: `vis-network`만 설치 (네트워크만 사용하므로).  
   - **로딩**: `index.html`의 script 제거 후, 앱 진입점에서 `import vis from 'vis-network'` (또는 번들러로 로드).  
   - **API 매핑**:  
     - `new vis.Network(...)` 유지.  
     - `network.fit({ nodes: ids, animation })` → 동일/유사.  
     - `network.getPosition(id)`, `network.moveTo(...)` → 동일.  
     - 옵션명 차이만 문서 기준으로 치환 (예: `interaction.zoomMin`/`zoomMax` 등).  
   - **테스트**: 줌 인/아웃/전체보기, 노드 클릭 포커스, 이고 그래프, 필터/검색.

3. **확장성/유지보수**
   - 그래프 관련 호출을 `graph-manager.js`에 한정해 두었으므로, 업그레이드 시 수정 범위는 해당 모듈과 네트워크 옵션 생성부로 제한 가능.
   - 상수(`FOCUS_ZOOM_SCALE`, throttle 280ms 등)는 그대로 두고, 새 라이브러리 기본값과만 맞추면 됨.

## 결론
- **지금 당장 업그레이드할 필수는 없음.**  
- **새 기능이 vis-network 전용 API에 의존하거나, 빌드/번들 정리 계획이 있을 때** vis-network 이전을 진행하는 것을 권장.
