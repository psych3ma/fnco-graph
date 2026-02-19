/**
 * E2E 테스트 설정
 * 프론트엔드 전문가 CTO 관점에서 작성
 */

export const TEST_CONFIG = {
  // 백엔드 API 설정
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8080',
  
  // 타임아웃 설정
  TIMEOUT: {
    NAVIGATION: 30000,      // 페이지 네비게이션 (30초)
    API_RESPONSE: 15000,    // API 응답 (15초)
    ELEMENT_VISIBLE: 10000, // 요소 표시 대기 (10초)
    LOADING: 30000,         // 로딩 완료 대기 (30초)
  },
  
  // 재시도 설정
  RETRY: {
    COUNT: 3,
    DELAY: 1000,            // 1초 대기 후 재시도
  },
  
  // 테스트 데이터
  TEST_DATA: {
    SEARCH_TERM: '삼성',
    NODE_LIMIT: 50,
    FILTER_TYPES: ['company', 'person'],
  },
  
  // 선택자 (협업 코드: 명확한 선택자 사용)
  SELECTORS: {
    // 헤더
    LOGO: '[class*="logo"]',
    SEARCH_INPUT: '#searchInput',
    FILTERS: '#filters',
    FILTER_BUTTON: (type) => `button[data-type="${type}"]`,
    
    // 그래프 영역
    GRAPH_AREA: '#graphArea',
    VIS_NETWORK: '#visNetwork',
    LOADING_OVERLAY: '#loadingOverlay',
    LOADING_TEXT: '#loadingText',
    
    // 패널
    NODE_PANEL: '#nodePanel',
    CHAT_PANEL: '#chatPanel',
    
    // 통계
    GRAPH_STATS: '#graphStats',
    
    // 에러 토스트
    ERROR_TOAST: '[class*="error-toast"]',
  },
  
  // 기대값
  EXPECTATIONS: {
    MIN_NODES: 1,
    MIN_EDGES: 0,
    LOADING_TIMEOUT: 30000,
  },
};
