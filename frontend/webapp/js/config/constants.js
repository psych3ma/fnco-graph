/**
 * 애플리케이션 상수 정의
 * CTO 관점에서 작성된 중앙화된 상수 관리
 * @module config/constants
 */

/**
 * Neo4j 노드 라벨 상수
 */
export const NODE_LABELS = {
  COMPANY: 'Company',
  PERSON: 'Person',
  STOCKHOLDER: 'Stockholder',
  LEGAL_ENTITY: 'LegalEntity',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  MAJOR_SHAREHOLDER: 'MajorShareholder'
};

/**
 * Neo4j 관계 타입 상수
 */
export const RELATIONSHIP_TYPES = {
  HOLDS_SHARES: 'HOLDS_SHARES',
  HAS_COMPENSATION: 'HAS_COMPENSATION'
};

/**
 * 기본 관계 타입 목록
 */
export const DEFAULT_RELATIONSHIP_TYPES = [
  RELATIONSHIP_TYPES.HOLDS_SHARES,
  RELATIONSHIP_TYPES.HAS_COMPENSATION
];

/**
 * 초기 그래프 로드 시 API에 요청하는 관계(엣지) 행 수.
 * 첫 화면을 빨리 보여주기 위해 500 권장. "더 보기"로 추가 로드 가능 (협업: docs/NEO4J_CTO_INDEX_AND_LIMIT.md)
 * 백엔드 MAX_QUERY_LIMIT(1000) 이하로 설정.
 * CTO: 타임아웃 발생 시 더 작은 값(200)으로 시작 권장.
 */
export const INITIAL_GRAPH_EDGE_LIMIT = 50;   // 200 → 50 (타임아웃 방지, 즉시 대응)

/**
 * 초기 그래프에 표시할 노드 수 상한 (클라이언트 캡). 필터 비활성화 시 사용.
 * 확장 시 상수만 변경하면 됨.
 * CTO: 백엔드 NetworkX 분석 상한(MAX_NODES_FOR_PAGERANK=500)과 일치하여 일관성 확보.
 * CTO: 타임아웃 발생 시 더 작은 값(200)으로 시작 권장.
 */
export const INITIAL_GRAPH_NODE_CAP = 50;   // 200 → 50 (타임아웃 방지, 즉시 대응)

/**
 * 노드 속성 이름 상수
 */
export const NODE_PROPERTIES = {
  // Company 속성
  BIZNO: 'bizno',
  COMPANY_NAME: 'companyName',
  COMPANY_NAME_NORMALIZED: 'companyNameNormalized',
  
  // Person 속성
  PERSON_ID: 'personId',
  STOCK_NAME: 'stockName',
  STOCK_NAME_NORMALIZED: 'stockNameNormalized',
  
  // 공통 속성
  DISPLAY_NAME: 'displayName',
  LABELS: 'labels'
};

/**
 * 관계 속성 이름 상수
 */
export const RELATIONSHIP_PROPERTIES = {
  STOCK_RATIO: 'stockRatio',
  BASE_DATE: 'baseDate',
  STOCK_COUNT: 'stockCount',
  VOTING_POWER: 'votingPower',
  PCT: 'pct'  // 호환성을 위한 별칭
};

/**
 * 노드 타입 매핑 (필터용)
 * Neo4j 라벨 -> 프론트엔드 타입
 */
export const LABEL_TO_TYPE_MAP = {
  [NODE_LABELS.COMPANY]: 'company',
  [NODE_LABELS.PERSON]: 'person',
  [NODE_LABELS.STOCKHOLDER]: 'major',
  [NODE_LABELS.MAJOR_SHAREHOLDER]: 'major',
  [NODE_LABELS.LEGAL_ENTITY]: 'company',
  'Institution': 'institution'
};

/**
 * 타입 -> 라벨 역매핑 (API 요청용)
 */
export const TYPE_TO_LABEL_MAP = {
  'company': NODE_LABELS.COMPANY,
  'person': NODE_LABELS.PERSON,
  'major': NODE_LABELS.STOCKHOLDER,
  'institution': NODE_LABELS.STOCKHOLDER
};

/**
 * PwC 브랜드색 (회계법인·클래식 톤, CSS 변수와 단일 소스 유지)
 * 하이라이트/노드 타입에 사용. 협업: 색상 변경 시 여기와 styles.css :root 동기화.
 */
export const PWC_BRAND_COLORS = {
  black: '#000000',
  darkRed: '#ad1b02',
  orange: '#d85604',
  goldenrod: '#e88d14',
  gold: '#f3be26',
  pink: '#e669a2'
};

/** 하이라이트용 메인 액센트 (CTA·활성 탭·호버) */
export const ACCENT_HIGHLIGHT = PWC_BRAND_COLORS.orange;
/** 강조용 (선택 노드·포커스 등) */
export const ACCENT_STRONG = PWC_BRAND_COLORS.darkRed;

/**
 * 노드 타입 메타데이터 (PwC 팔레트 매핑, 클래식 톤)
 */
export const NODE_TYPE_META = {
  [NODE_LABELS.COMPANY]: {
    label: '회사',
    color: PWC_BRAND_COLORS.orange,
    type: 'company'
  },
  [NODE_LABELS.PERSON]: {
    label: '개인주주',
    color: PWC_BRAND_COLORS.darkRed,
    type: 'person'
  },
  [NODE_LABELS.STOCKHOLDER]: {
    label: '주주',
    color: PWC_BRAND_COLORS.goldenrod,
    type: 'major'
  },
  [NODE_LABELS.MAJOR_SHAREHOLDER]: {
    label: '주요주주',
    color: PWC_BRAND_COLORS.goldenrod,
    type: 'major'
  },
  [NODE_LABELS.LEGAL_ENTITY]: {
    label: '법인',
    color: PWC_BRAND_COLORS.orange,
    type: 'company'
  },
  company: {
    label: '회사',
    color: PWC_BRAND_COLORS.orange,
    type: 'company'
  },
  person: {
    label: '개인주주',
    color: PWC_BRAND_COLORS.darkRed,
    type: 'person'
  },
  major: {
    label: '주주',
    color: PWC_BRAND_COLORS.goldenrod,
    type: 'major'
  },
  institution: {
    label: '기관',
    color: '#5a5349',
    type: 'institution'
  }
};

/**
 * 기본 검색 속성 목록
 */
export const DEFAULT_SEARCH_PROPERTIES = [
  NODE_PROPERTIES.COMPANY_NAME,
  NODE_PROPERTIES.COMPANY_NAME_NORMALIZED,
  NODE_PROPERTIES.STOCK_NAME,
  NODE_PROPERTIES.STOCK_NAME_NORMALIZED,
  NODE_PROPERTIES.BIZNO,
  NODE_PROPERTIES.PERSON_ID
];

/**
 * 노드 ID 속성 매핑 (라벨별)
 */
export const NODE_ID_PROPERTIES = {
  [NODE_LABELS.COMPANY]: NODE_PROPERTIES.BIZNO,
  [NODE_LABELS.PERSON]: NODE_PROPERTIES.PERSON_ID,
  [NODE_LABELS.STOCKHOLDER]: NODE_PROPERTIES.BIZNO  // Company 또는 Person
};

/**
 * 노드 표시 이름 속성 매핑 (라벨별)
 */
export const NODE_DISPLAY_NAME_PROPERTIES = {
  [NODE_LABELS.COMPANY]: [NODE_PROPERTIES.COMPANY_NAME, NODE_PROPERTIES.BIZNO],
  [NODE_LABELS.PERSON]: [NODE_PROPERTIES.STOCK_NAME, NODE_PROPERTIES.PERSON_ID]
};

/**
 * API 설정
 */
export const API_CONFIG = {
  BASE_URL: window.API_BASE_URL || 
            import.meta.env?.VITE_API_BASE_URL || 
            'http://localhost:8000',
  TIMEOUT: 30000,  // 30초 (일반 요청)
  /** 그래프 초기 로드용: 엣지 1000건 등 무거운 쿼리 시 백엔드/Neo4j 응답 대기 (협업: 필요 시 상수만 변경) */
  GRAPH_REQUEST_TIMEOUT: 60000,  // 60초
  /** 그래프 폴백 요청용: 분석 없이 그래프만 조회하므로 더 빠름 (CTO: 확장성·의미 명확화) */
  GRAPH_FALLBACK_TIMEOUT: 20000,  // 30초 → 20초 (타임아웃 방지, 즉시 대응)
  /** 최소 요청용: 빠른 응답 보장을 위한 작은 데이터 요청 (CTO: 확장성·의미 명확화) */
  MINIMAL_REQUEST_TIMEOUT: 15000,  // 15초 (최소 요청)
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000  // 1초
};

/**
 * 쿼리 제한값
 */
export const QUERY_LIMITS = {
  MAX: 1000,
  DEFAULT: 100,
  MAX_SEARCH: 200,
  DEFAULT_SEARCH: 50
};

/**
 * 기본 필터 설정
 */
export const DEFAULT_FILTERS = new Set(['company', 'person', 'major', 'institution']);
