# 사이드 패널 레퍼런스 서식 검토 (프론트엔드 CTO, 협업 코드 고려)

## 원칙
- **서식·구조만** 레퍼런스에 맞춤. 동작은 기존 `window.panelManager` / `window.app` 연동 유지.
- 레퍼런스에 있던 **오류 가능 요소**는 채택하지 않음: 인라인 `selectNodeById('n3661')`, `loadEgoGraph('n102')`, `openChatWithContext('n102', '주식회사 서남', 'company')` 등 **하드코딩 ID/인자** 없음. 모두 현재 노드 컨텍스트 기반으로 호출.

---

## 1. 레퍼런스 대비 적용한 서식/구조

| 항목 | 레퍼런스 | 적용 내용 |
|------|----------|-----------|
| **nd-header** | 이름 + 타입 부제(nd-sub) | `nd-name` 아래에 `nd-sub` 추가, `meta.label` 표시. `nd-name`에는 `displayName` 사용. |
| **더보기 버튼** | `related-more-text` / `related-more-count` / `related-more-icon` | 텍스트·개수·아이콘에 클래스 부여. `id="relMoreCount"` 유지(JS 연동). |
| **액션 버튼** | ego-map-btn, ask-context-btn | BEM 보조 클래스 `nd-action--ego`, `nd-action--chat` 추가. 기존 `action-btn secondary/primary` 유지. |
| **패널 토글** | panel-toggle-btn | 버튼 구조·SVG 추가. `onclick="window.app?.togglePanel?.()"`로 연동. `togglePanel()`에서 `#sidePanel`에 `.collapsed` 토글. |
| **ego 배너** | role="region" aria-label="지배구조 맵" | `aria-label="지배구조 맵"` 추가. `role="region"` 사용, `aria-live="polite"` 유지. |
| **SVG** | — | 장식용 SVG에 `aria-hidden="true"` 추가. |

---

## 2. 의도적으로 레퍼런스와 다르게 둔 부분

| 레퍼런스 | 현재 구현 | 이유 |
|----------|-----------|------|
| `onclick="selectNodeById('n3661')"` | `onclick="window.graphManager?.focusNode('${c.id}')"` | 노드 ID를 템플릿에서 동적 주입. 하드코딩 ID 제거. |
| `onclick="loadEgoGraph('n102')"` 등 | `onclick="window.panelManager?.loadEgoGraph()"` | 선택된 노드는 `stateManager`/패널 컨텍스트에서 취득. 인자 없음. |
| `onclick="switchTab(this)"` | `onclick="window.app?.switchPanelTab('detail')"` | 탭은 `role="tab"` + `aria-controls`로 접근성 유지. |
| `related-item-more`에 class `hidden` | `.related-item-more` + `.open` (max-height 토글) | 접기/펼치기 동작은 기존 방식 유지. |
| `id="detailTab"` / `id="chatTab"` | `id="detailTabBody"` / `id="chatTabBody"` | 탭 **패널** 영역이라 Body 구분 유지. |

---

## 3. 협업 관점

- **클래스 네이밍**: `nd-sub`, `related-more-text`, `related-more-count`, `related-more-icon`, `nd-action--ego`, `nd-action--chat`, `panel-toggle-btn`로 고정. 스타일/테스트 시 동일 이름 사용.
- **이벤트**: 인라인 `onclick`은 `window.app`, `window.panelManager`, `window.graphManager`만 호출. 새 동작은 해당 객체 메서드로 추가 후 `onclick`에서 호출.
- **접근성**: 탭은 `role="tab"`/`tabpanel`, 버튼은 `aria-label`, 토글은 `aria-expanded`/`aria-controls` 등 기존 패턴 유지.

---

## 4. 수정된 파일

- `frontend/webapp/js/core/panel-manager.js`: nd-sub, displayName, related-more 클래스, nd-action--ego/--chat.
- `frontend/webapp/js/app.js`: `togglePanel()` 추가.
- `frontend/webapp/index.html`: panel-toggle-btn, ego-banner aria-label.
- `frontend/webapp/css/styles.css`: `.nd-sub`, `.panel-toggle-btn`, `.side-panel.collapsed`, `.related-more-icon`.

---

## 5. 요약

레퍼런스의 **마크업 구조·클래스 이름·보조 기술**만 가져오고, **동작은 기존 서비스 로직**을 그대로 사용했습니다. 노드 ID·선택 컨텍스트는 모두 런타임/상태에서만 사용하므로, 레퍼런스에 있던 하드코딩 ID/인자로 인한 오류는 발생하지 않습니다.
