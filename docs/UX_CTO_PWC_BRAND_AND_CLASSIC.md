# UX 디자이너 출신 CTO 검토: 클래식 톤 + PwC 브랜드색 적용

회계법인 사용자 대상 서비스에 맞춘 클래식한 톤과 PwC 브랜드색 하이라이트 적용. 확장성·유지보수성·호환성·협업 코드 고려.

---

## 1. 검토 관점 요약

| 관점 | 적용 방향 |
|------|------------|
| **클래식** | 과하지 않은 대비, 웜 라이트 배경 유지, 노드 타입 색을 PwC 팔레트로 통일해 전문적 인상 |
| **PwC 브랜드색** | 하이라이트·활성 상태·CTA·연결 엣지에 PwC 팔레트 사용 (단일 소스로 유지보수) |
| **확장성** | 색상은 CSS 변수 + constants.js 한 곳에서 정의, 브랜드 변경 시 토큰만 수정 |
| **호환성** | 기존 `--accent`·노드 타입 키 동일 유지, 시각만 PwC로 교체 |

---

## 2. PwC 브랜드 팔레트 (적용 기준)

| 이름 | Hex | 용도 |
|------|-----|------|
| Black | `#000000` | (예비) 텍스트·강조 |
| Dark Red | `#ad1b02` | 개인주주 노드, 강조(accent-strong) |
| Orange | `#d85604` | 메인 액센트: CTA·활성 탭·로고·엣지/노드 하이라이트 |
| Goldenrod | `#e88d14` | 최대주주·주요주주 노드 |
| Gold | `#f3be26` | (예비) 보조 강조 |
| Pink | `#e669a2` | (예비) 특수 강조 |

---

## 3. 적용 내용

### 3.1 CSS 디자인 토큰 (`styles.css` :root)

- **PwC 변수 추가**: `--pwc-black`, `--pwc-dark-red`, `--pwc-orange`, `--pwc-goldenrod`, `--pwc-gold`, `--pwc-pink`
- **액센트**: `--accent` = `var(--pwc-orange)`, `--accent-strong` = `var(--pwc-dark-red)`
- **노드 팔레트**:  
  `--c-company` = PwC 오렌지, `--c-person` = PwC 다크레드, `--c-major` = PwC 골든로드,  
  `--c-institution` = 중성 그레이 `#5a5349` (클래식·보수적 톤)
- 칩/범례의 활성·배경 rgba를 PwC 색상 기준으로 조정 (회사/개인/주주/기관)

### 3.2 상수 단일 소스 (`config/constants.js`)

- **PWC_BRAND_COLORS**: 위 팔레트 hex 정의
- **ACCENT_HIGHLIGHT**: `PWC_BRAND_COLORS.orange` (그래프 엣지/노드 하이라이트·호버)
- **ACCENT_STRONG**: `PWC_BRAND_COLORS.darkRed` (필요 시 강한 강조용)
- **NODE_TYPE_META**: 모든 노드 타입 색상을 PwC 팔레트(또는 기관용 중성색)로 매핑

### 3.3 그래프 하이라이트 (`graph-manager.js`)

- 엣지: `highlight`/`hover` 색 → `ACCENT_HIGHLIGHT`
- 연결 엣지 강조(highlightNeighbors): 연결된 엣지 색 → `ACCENT_HIGHLIGHT`
- 노드 호버 하이라이트 테두리: `ACCENT_HIGHLIGHT`
- 엣지 호버 시 라벨 색: `ACCENT_HIGHLIGHT`

---

## 4. 클래식 톤 유지

- **기관**: 보라 대신 중성 그레이(`#5a5349`)로 구분감 유지·과한 색 억제
- **배경**: 기존 웜 라이트(`#faf8f5` 계열) 유지
- **타이포/레이아웃**: 기존 Noto Sans KR·여백 유지, 색상만 PwC·클래식으로 정리

---

## 5. 협업·유지보수

- **색상 변경 시**:  
  - CSS만 바꿀 때: `styles.css`의 `:root` PwC 변수 및 `--c-*` 수정  
  - JS(그래프·노드 색)까지 같이 바꿀 때: `constants.js`의 `PWC_BRAND_COLORS`·`NODE_TYPE_META`와 CSS 변수 동기화
- **새 노드 타입**: `NODE_TYPE_META`와 `--c-*`에 PwC 팔레트 중 하나 또는 중성색 추가
- **다크 모드 등**: `:root` / `[data-theme="dark"]`에서 `--pwc-*`·`--accent` 오버라이드로 확장 가능

---

## 6. 관련 파일

| 파일 | 역할 |
|------|------|
| `frontend/webapp/css/styles.css` | PwC 변수, accent, 노드 팔레트, 칩/범례 배경 |
| `frontend/webapp/js/config/constants.js` | PWC_BRAND_COLORS, ACCENT_HIGHLIGHT/STRONG, NODE_TYPE_META |
| `frontend/webapp/js/core/graph-manager.js` | 엣지/노드 하이라이트·호버에 PwC 액센트 사용 |
