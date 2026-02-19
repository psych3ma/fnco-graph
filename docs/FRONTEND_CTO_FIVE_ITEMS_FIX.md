# 프론트엔드 CTO 검토 5건 조치 요약

## (1) Zoom 버튼 동작 시 화면 버벅거림
- **조치**: 줌 버튼 클릭에 **280ms 스로틀** 적용 (`app.js`).
- **위치**: `bindEvents()` 내 zoomIn/zoomOut/zoomFit 핸들러.
- **확장성**: `ZOOM_THROTTLE_MS` 상수만 조정하면 됨.

---

## (2) 노드상세 > '지배구조 맵 보기' 동작하지 않음
- **원인**: `loadEgoGraph()`가 배너만 띄우고 그래프를 교체하지 않음.
- **조치**  
  - **프론트**: `PanelManager.loadEgoGraph()`에서 `window.app.loadEgoGraph(selectedNode)` 호출. `App.loadEgoGraph(node)`에서 ego API 호출 후 `rawNodes`/`rawLinks` 교체 및 `buildGraph()` 호출. `exitEgoGraph()`는 배너 숨김 후 `loadData()`로 전체 그래프 복원.  
  - **API**: `api-client.getEgoGraph(nodeId, depth, limit, idProperty)`에 `id_property`(bizno/personId) 파라미터 추가.  
  - **백엔드**: `get_ego_graph`가 반환하는 레코드(center, r, connected)를 `format_graph_data`가 기대하는 형식(n, r, m)으로 정규화 후 `format_graph_data` 호출. 엔드포인트에 `id_property` 전달 추가.

---

## (3) 노드상세 > 'AI에게 질문하기' 동작하지 않음
- **조치**: `openChatWithContext()`에서  
  - `chat.context`에 `node_id` 포함해 설정 (`{ node_id, ...node }`).  
  - `switchTab('chat')`를 직접 호출해 탭 전환 보장.  
  - `requestAnimationFrame` 안에서 `chatInput.focus()`로 입력 포커스.

---

## (4) 그래프 상 관계는 있는데 최대주주 지분율/주주 수 '-' 표출
- **조치**  
  - **API 응답**: 관계 레코드에서 지분율 추출 시 `r.r` 뿐 아니라 `r.relationship`, `r.properties?.stockRatio`, `r.stock_ratio` 등 여러 형태 허용하는 `relPct(rec)` 도입.  
  - **주주 수**: 노드 속성 `totalInvestmentCount`가 없을 때 **outLinks.length**(나가진 관계 수)로 fallback. 로컬 fallback도 `outLinks.length` / `node.shareholders?.length` 우선 사용.

---

## (5) vis 4.21 업그레이드 검토 의견
- **문서**: `docs/FRONTEND_CTO_VIS_UPGRADE_REVIEW.md`에 정리.
- **요지**: 당장 업그레이드 필수는 없음. 노드 포커스는 `getPosition`+`moveTo`로 보완 완료. 장기적으로 빌드/번들 정리나 vis-network 전용 API 필요 시 `vis-network` 이전 검토 권장.

---

## 변경 파일 목록
- `frontend/webapp/js/app.js` — 줌 스로틀, loadEgoGraph, exitEgoGraph
- `frontend/webapp/js/core/panel-manager.js` — loadEgoGraph(API 연동), exitEgoGraph, openChatWithContext(탭+포커스), maxPct/shCount fallback
- `frontend/webapp/js/api-client.js` — getEgoGraph id_property
- `backend/service.py` — get_ego_graph 레코드 정규화(n,r,m), id_property 전달
- `backend/main.py` — ego 엔드포인트 id_property 전달
- `docs/FRONTEND_CTO_VIS_UPGRADE_REVIEW.md` — 신규
- `docs/FRONTEND_CTO_FIVE_ITEMS_FIX.md` — 신규 (본 요약)
