# UX CTO: 로딩 오버레이 레이아웃 고정 (위·아래 섹션)

## 요구
위 섹션(스피너 + 메시지)과 아래 섹션(단계 인디케이터)이 **메시지/단계 텍스트 길이에 따라 커졌다 작아졌다 하지 않고**, 각자 **고정된 위치·공간**을 유지해야 함.

## 문제
- `variant-unified` 로딩은 flex column으로 스피너 → 메시지 → 단계 순 배치.
- 메시지가 "마무리 중..." ↔ "그래프 데이터 불러오는 중…, 데이터가 많으면 1분까지 걸릴 수 있습니다" 등으로 바뀌면 **메시지 영역 높이가 변함**.
- 단계 라벨을 늘리거나 단계 수를 바꾸면 **단계 영역 높이가 변함**.
- 그 결과 전체 오버레이가 위아래로 **흔들리거나 점프**하여 산만한 인상과 레이아웃 시프트가 발생.

## 원칙 (확장성·유지보수·협업)
- **고정 레이아웃**: 위·아래 블록은 **최소 높이를 보장**하고, 내용이 짧아도 공간은 유지, 길어도 넘치지 않도록 제한.
- **단일 variant 적용**: `loading-variants.css`의 `variant-unified`에만 적용. 다른 variant는 기존 동작 유지.
- **협업**: 메시지/단계 문구를 바꿀 때도 레이아웃 규칙만 지키면 되도록, CSS에서 영역을 예약.

## 조치
`frontend/webapp/css/loading-variants.css` — `variant-unified` 블록:

1. **스피너**  
   - `flex-shrink: 0` → 줄어들지 않음.

2. **메시지 영역 (`.loading-message-wrap`)**  
   - `flex-shrink: 0`  
   - `min-height: 3.5em` → 짧은 문구여도 영역 유지  
   - `max-height: 4.5em` + `overflow: hidden` → 긴 문구는 잘림, 아래 단계 영역을 밀지 않음  
   - `display: flex; flex-direction: column; align-items: center; justify-content: center` → 메시지/안내 문구 세로 중앙 정렬

3. **단계 영역 (`.loading-steps`)**  
   - `flex-shrink: 0`  
   - `min-height: 48px` + `box-sizing: border-box` → 단계 수/라벨이 바뀌어도 최소 높이 유지, 패딩 포함 계산

## 확장 시
- 단계를 5개 이상으로 늘리거나 라벨이 길어지면: 필요 시 `min-height`만 조정 (예: 56px).
- 메시지를 2줄 이상으로 늘리면: `max-height`를 소폭 늘려도 됨. **위·아래 섹션 각각 최소/최대 높이로 고정**하는 원칙은 유지.

## 관련 코드
- `frontend/webapp/css/loading-variants.css`: `.loading-overlay.variant-unified` 내 `.loading-spinner`, `.loading-message-wrap`, `.loading-steps`
