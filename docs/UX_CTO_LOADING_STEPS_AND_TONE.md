# UX: 로딩 단계표시 유지 + 색깔 톤 통일

## (1) 로딩 중 단계표시 사라짐

### 현상
로딩 중에 "서버 연결 → 데이터 조회 → 그래프 구성 → 완료" 단계 인디케이터가 보이지 않거나 사라짐.

### 조치
- **LoadingManager.show()**: 오버레이 표시 시 현재 `variant` 클래스가 없으면 강제 적용 (`variant-unified` 등). 스크립트 로드 순서나 다른 진입점에서도 단계 UI가 동작하도록 함.
- **단계 초기화**: `variant === 'unified'`일 때 `totalSteps`/`currentStep` 기본값 설정 후 `updateStepIndicator()` 호출, `#loadingSteps`에 `display: flex` 명시.
- **updateStepIndicator()**: 단계 갱신 후 `stepsContainer.style.display = 'flex'` 유지 및 `aria-hidden="false"` 설정.

### 관련 파일
- `frontend/webapp/js/core/loading-manager.js`: `show()`, `updateStepIndicator()`

---

## (2) 색깔 톤 안맞음 (로딩·필터)

### 현상
로딩 스피너·단계 영역과 헤더 필터 칩의 색이 PwC/클래식 톤과 어긋나 보임 (흰색 텍스트, 어두운 배경 등).

### 조치
- **로딩(unified)**  
  - 단계 컨테이너 배경: `rgba(255,255,255,0.03)` → `rgba(226,219,208,0.35)` + `border: var(--canvas-border)` (밝은 배경과 톤 맞춤).  
  - 완료/활성 단계: `background: var(--accent-dim)`, 점·라인: `var(--accent)`, `var(--accent-dim)` 사용 (PwC 오렌지 계열).  
  - 메인 텍스트: `var(--canvas-text)`, 안내 문구: `var(--canvas-dim)`, `text-shadow` 완화.
- **헤더 필터 칩(활성)**  
  - 기존 `.chip.active { color: #fff }` 제거.  
  - 활성 칩: 밝은 배경(rgba 투명도 낮춤) + 테두리/텍스트에 PwC 색 적용.  
  - 회사/개인주주/최대주주/기관 각각 `--pwc-orange`, `--pwc-dark-red`, `--pwc-goldenrod`, `--canvas-dim`로 통일.

### 관련 파일
- `frontend/webapp/css/styles.css`: `.chip.active`, `.chip.active.company/person/major/institution`
- `frontend/webapp/css/loading-variants.css`: `.variant-unified .loading-steps`, `.step-item`, `.step-dot`, `.step-line`, `.loading-text`, `.loading-guidance`
