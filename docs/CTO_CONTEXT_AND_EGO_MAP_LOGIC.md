# CTO 로직 검토: 컨텍스트 섹션 닫기 · 노드 상세 지배구조 맵 보기

유지보수성·확장성·협업 코드 관점.

---

## 1. 컨텍스트 섹션 닫기 버튼

### 이슈
- HTML에서 `onclick="window.panelManager?.clearChatContext()"` 호출.
- `clearChatContext()`는 **ChatManager**에만 정의되어 있었고, **PanelManager**에는 없음** → 클릭 시 아무 동작 없음.

### 조치
- **PanelManager**에 `clearChatContext()` 추가 후 **ChatManager에 위임**.
  - `clearChatContext() { window.chatManager?.clearChatContext?.(); }`
- HTML은 그대로 `panelManager.clearChatContext()` 호출 (패널 내 버튼은 panelManager 경유로 통일).
- 실제 로직은 **ChatManager** 유지: `stateManager.setState('chat.context', null)` → 구독자 `updateContextBar(null)` → ctxBar에 `hidden` 적용.

### 상태·역할 정리
| 구분 | 담당 | 비고 |
|------|------|------|
| 컨텍스트 상태 | stateManager `chat.context` | 단일 소스 |
| UI 반영 | ChatManager (subscribe) | ctxBar 표시/숨김 |
| 패널 버튼 진입점 | PanelManager | 위임만 수행 |

---

## 2. 노드 상세 · 지배구조 맵 보기

### 로직
- 버튼: "이 노드 기준 지배구조 맵 보기" → `onclick="window.panelManager?.loadEgoGraph()"`.
- **PanelManager.loadEgoGraph()**: `stateManager.getState('selectedNode')`로 현재 선택 노드 조회 → 없으면 안내 후 return → **App.loadEgoGraph(node)** 호출 → ego API 호출 후 그래프 교체 → 배너 표시.

### 일관성
- **선택 노드**는 `stateManager.selectedNode` 한 곳에서 관리.
- "지배구조 맵 보기"와 "AI에게 질문하기" 모두 **같은 selectedNode** 사용 (노드 상세 패널에서 클릭한 노드 = 선택 노드).
- 지배구조 맵 진입 후 **"전체 그래프로 돌아가기"**는 `panelManager.exitEgoGraph()` → `app.exitEgoGraph()` → `loadData()`로 복원.

### 확장·유지보수
- ego 로드는 **App**이 담당 (데이터·그래프 교체), **PanelManager**는 진입/복귀 트리거만 담당. 역할 분리 유지.
- 선택 노드 추가/변경 시 두 버튼 모두 동일 상태를 참조하므로 한 곳만 수정하면 됨.

---

## 3. 협업용 패턴 정리

- **패널 내 버튼**: HTML에서 `window.panelManager?.메서드()` 호출. 패널 관련 진입점은 PanelManager에 두고, 필요 시 app/chatManager로 위임.
- **상태**: 채팅 컨텍스트는 `chat.context`, 선택 노드는 `selectedNode`. 변경은 setState로만 수행하고, 구독으로 UI 반영.
- **지배구조 맵**: 선택 노드 → App.loadEgoGraph → API → rawNodes/rawLinks 교체 → buildGraph. 복귀는 exitEgoGraph → loadData.

---

## 4. 수정 요약

| 항목 | 수정 내용 |
|------|-----------|
| 컨텍스트 닫기 | PanelManager에 `clearChatContext()` 추가, 내부에서 `chatManager.clearChatContext()` 호출 |
| 지배구조 맵 | 기존 로직 유지 (selectedNode → loadEgoGraph). 문서로 역할·상태 정리 |

관련 코드: `frontend/webapp/js/core/panel-manager.js` (clearChatContext 추가), `frontend/webapp/js/core/chat-manager.js` (clearChatContext·updateContextBar).
