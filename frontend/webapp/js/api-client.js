/**
 * FastAPI 백엔드와 통신하는 클라이언트
 * 개선된 버전: 구체적인 에러 처리
 * @module api-client
 */

import { showErrorToast, ErrorType, handleNetworkError } from './utils/error-handler.js';
import { API_CONFIG, DEFAULT_RELATIONSHIP_TYPES, DEFAULT_SEARCH_PROPERTIES } from './config/constants.js';

const GRAPH_TIMEOUT = API_CONFIG.GRAPH_REQUEST_TIMEOUT ?? API_CONFIG.TIMEOUT;

const API_BASE_URL = API_CONFIG.BASE_URL;

/**
 * API 클라이언트 클래스
 */
export class APIClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  /**
   * 기본 요청 메서드 (타임아웃 및 에러 핸들링 강화 - 협업 코드 고려)
   * @private
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const timeout = options.timeout || API_CONFIG.TIMEOUT;
    
    // 디버깅: 요청 시작 로그
    console.log(`[APIClient] 요청 시작: ${url}`);
    console.log(`[APIClient] Base URL: ${this.baseURL}`);
    console.log(`[APIClient] 타임아웃: ${timeout}ms`);
    
    // AbortController를 사용한 타임아웃 구현 (무한 로딩 방지)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`[APIClient] 요청 타임아웃: ${url}`);
      controller.abort();
    }, timeout);
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      signal: controller.signal,
      ...options
    };

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);  // 성공 시 타임아웃 제거
      
      console.log(`[APIClient] 응답 받음: ${url}`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      // 네트워크 에러 처리
      if (!response.ok) {
        console.error(`[APIClient] 응답 실패: ${url}`, {
          status: response.status,
          statusText: response.statusText
        });
        const errorData = await response.json().catch(() => ({}));
        
        // Neo4j 연결 오류 특별 처리
        if (errorData.error === 'neo4j_connection_error') {
          throw new Neo4jConnectionError(
            errorData.message || 'Neo4j 연결 오류',
            errorData.status || 'unknown',
            errorData.detail
          );
        }
        
        await handleNetworkError(response);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);  // 에러 시에도 타임아웃 제거
      
      // 타임아웃 에러 특별 처리
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`요청 시간 초과 (${timeout}ms). 백엔드 서버가 응답하지 않습니다.`);
        timeoutError.name = 'TimeoutError';
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      
      // 네트워크 연결 실패 에러 처리
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.');
        networkError.name = 'NetworkError';
        networkError.isNetworkError = true;
        throw networkError;
      }
      
      if (error instanceof Neo4jConnectionError) {
        throw error;
      }
      
      console.error(`[APIClient] ${endpoint} 요청 실패:`, error);
      throw error;
    }
  }

  /**
   * 그래프 데이터 조회
   * @param {number} limit - 최대 반환 개수
   * @param {string[]} nodeLabels - 필터링할 노드 라벨
   * @param {string[]} relationshipTypes - 필터링할 관계 타입
   * @param {number} [skip=0] - 건너뛸 관계 행 수 (더 보기)
   * @param {number} [nodeCap=null] - 노드 수 상한. 지정 시 서버가 캡·엣지 일관 적용 (vis 마이그레이션)
   * @returns {Promise<Object>} 그래프 데이터
   */
  async getGraphData(limit = 100, nodeLabels = null, relationshipTypes = null, skip = 0, nodeCap = null, options = {}) {
    const params = new URLSearchParams({ limit: limit.toString(), skip: String(skip) });
    if (nodeCap != null && nodeCap > 0) {
      params.set('node_cap', String(nodeCap));
    }

    // 기본 관계 타입 설정 (설정 파일 기반)
    if (!relationshipTypes) {
      relationshipTypes = DEFAULT_RELATIONSHIP_TYPES;
    }
    
    if (nodeLabels && nodeLabels.length > 0) {
      nodeLabels.forEach(label => params.append('node_labels', label));
    }
    
    if (relationshipTypes && relationshipTypes.length > 0) {
      relationshipTypes.forEach(type => params.append('relationship_types', type));
    }

    try {
      // options.timeout이 있으면 사용, 없으면 GRAPH_TIMEOUT (폴백 요청 시 짧은 타임아웃 사용 가능)
      return await this.request(`/api/graph?${params.toString()}`, { timeout: options.timeout ?? GRAPH_TIMEOUT });
    } catch (error) {
      if (error && error.isTimeout) throw error;
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast('그래프 데이터를 불러올 수 없습니다.', ErrorType.NETWORK);
      return { nodes: [], edges: [] };
    }
  }

  /**
   * 그래프 + 분석 한 번에 조회 (첫 화면 추천 노드 등에 사용, CTO: 단일 소스·확장성)
   * @param {number} limit - 최대 반환 개수
   * @param {string[]} nodeLabels - 필터링할 노드 라벨
   * @param {string[]} relationshipTypes - 필터링할 관계 타입
   * @param {number} [skip=0] - 건너뛸 관계 행 수
   * @param {number} [nodeCap=null] - 노드 수 상한
   * @returns {Promise<{ graph: Object, analysis: Object|null }>} graph: { nodes, edges }, analysis: { degree_centrality?, pagerank?, ... } 또는 null
   */
  async getGraphWithAnalysis(limit = 100, nodeLabels = null, relationshipTypes = null, skip = 0, nodeCap = null) {
    const params = new URLSearchParams({ limit: limit.toString(), skip: String(skip) });
    if (nodeCap != null && nodeCap > 0) {
      params.set('node_cap', String(nodeCap));
    }
    if (!relationshipTypes) {
      relationshipTypes = DEFAULT_RELATIONSHIP_TYPES;
    }
    if (nodeLabels && nodeLabels.length > 0) {
      nodeLabels.forEach(label => params.append('node_labels', label));
    }
    if (relationshipTypes && relationshipTypes.length > 0) {
      relationshipTypes.forEach(type => params.append('relationship_types', type));
    }
    try {
      const response = await this.request(`/api/graph/analysis?${params.toString()}`, { timeout: GRAPH_TIMEOUT });
      const graph = response.graph && typeof response.graph === 'object'
        ? { nodes: response.graph.nodes ?? [], edges: response.graph.edges ?? [] }
        : { nodes: [], edges: [] };
      return { graph, analysis: response.analysis ?? null };
    } catch (error) {
      if (error && error.isTimeout) throw error;
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast('그래프 데이터를 불러올 수 없습니다.', ErrorType.NETWORK);
      return { graph: { nodes: [], edges: [] }, analysis: null };
    }
  }

  /**
   * 그래프 검색 (실제 스키마에 맞춘 버전)
   * @param {string} searchTerm - 검색어
   * @param {number} limit - 최대 반환 개수
   * @param {string[]} searchProperties - 검색할 속성 리스트 (기본값: 실제 스키마 속성)
   * @returns {Promise<Object>} 검색 결과
   */
  async searchGraph(searchTerm, limit = 50, searchProperties = null) {
    const params = new URLSearchParams({
      search: searchTerm,
      limit: limit.toString()
    });

    // 실제 스키마에 맞는 기본 검색 속성 (설정 파일 기반)
    if (!searchProperties) {
      searchProperties = DEFAULT_SEARCH_PROPERTIES;
    }

    if (searchProperties && searchProperties.length > 0) {
      searchProperties.forEach(prop => params.append('search_properties', prop));
    }

    try {
      return await this.request(`/api/graph/search?${params.toString()}`);
    } catch (error) {
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast('검색 중 오류가 발생했습니다.', ErrorType.NETWORK);
      return { nodes: [], edges: [] };
    }
  }

  /**
   * 노드 상세 정보 조회 (실제 스키마에 맞춘 버전)
   * @param {string} nodeId - 노드 ID (bizno 또는 personId)
   * @param {string} idProperty - ID property 이름 (자동 감지 시 null)
   * @returns {Promise<Object>} 노드 상세 정보
   */
  async getNodeDetail(nodeId, idProperty = null) {
    const params = new URLSearchParams();
    if (idProperty) {
      params.append('id_property', idProperty);
    }
    
    try {
      const queryString = params.toString();
      const url = queryString 
        ? `/api/node/${encodeURIComponent(nodeId)}?${queryString}`
        : `/api/node/${encodeURIComponent(nodeId)}`;
      return await this.request(url);
    } catch (error) {
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast(`노드 정보를 불러올 수 없습니다: ${nodeId}`, ErrorType.NETWORK);
      return null;
    }
  }

  /**
   * Ego 그래프 조회
   * @param {string} nodeId - 중심 노드 ID
   * @param {number} depth - 탐색 깊이
   * @param {number} limit - 최대 반환 개수
   * @param {string} [idProperty] - ID 속성(bizno/personId). 미지정 시 백엔드 기본값
   * @returns {Promise<Object>} Ego 그래프 데이터
   */
  async getEgoGraph(nodeId, depth = 1, limit = 100, idProperty = null) {
    const params = new URLSearchParams({
      depth: depth.toString(),
      limit: limit.toString()
    });
    if (idProperty) params.set('id_property', idProperty);

    try {
      return await this.request(`/api/node/${encodeURIComponent(nodeId)}/ego?${params.toString()}`);
    } catch (error) {
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast('Ego 그래프를 불러올 수 없습니다.', ErrorType.NETWORK);
      return { nodes: [], edges: [] };
    }
  }

  /**
   * 그래프 통계 조회
   * @returns {Promise<Object>} 통계 데이터
   */
  async getStatistics() {
    try {
      return await this.request('/api/statistics');
    } catch (error) {
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast('통계를 불러올 수 없습니다.', ErrorType.NETWORK);
      return null;
    }
  }

  /**
   * 서버 측 AI 대화 이력 초기화 (참조 서비스 reset_chat 호환)
   */
  async resetChat() {
    try {
      await this.request('/api/chat/reset', { method: 'POST' });
    } catch (_) {
      // 무시: 로컬 초기화는 이미 진행됨
    }
  }

  /**
   * 챗봇 메시지 전송
   * @param {string} message - 메시지
   * @param {Object} context - 컨텍스트 정보
   * @returns {Promise<Object>} 챗봇 응답
   */
  async sendChatMessage(message, context = null) {
    try {
      return await this.request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          context: context || {}
        })
      });
    } catch (error) {
      if (error instanceof Neo4jConnectionError) {
        this.handleNeo4jError(error);
      }
      showErrorToast('챗봇 응답을 받을 수 없습니다.', ErrorType.NETWORK);
      return {
        response: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        graph_data: null
      };
    }
  }

  /**
   * 헬스 체크 (개선된 버전)
   * @returns {Promise<Object>} 헬스 상태
   */
  async healthCheck() {
    try {
      const health = await this.request('/health');
      return health;
    } catch (error) {
      console.error('[APIClient] 헬스 체크 실패:', error);
      console.error('[APIClient] 에러 상세:', {
        name: error.name,
        message: error.message,
        isTimeout: error.isTimeout,
        isNetworkError: error.isNetworkError,
        stack: error.stack
      });
      throw error;  // 에러를 재throw하여 상위에서 처리하도록 함
    }
  }

  /**
   * 연결 상태 조회
   * @returns {Promise<Object>} 연결 상태 정보
   */
  async getConnectionStatus() {
    try {
      return await this.request('/api/connection/status');
    } catch (error) {
      console.error('[APIClient] 연결 상태 조회 실패:', error);
      return null;
    }
  }

  /**
   * Neo4j 연결 오류 처리
   * @private
   */
  handleNeo4jError(error) {
    const messages = {
      'auth_failed': 'Neo4j 인증 실패: 사용자명 또는 비밀번호를 확인하세요.',
      'network_error': 'Neo4j 서버 연결 실패: 서버가 실행 중인지 확인하세요.',
      'disconnected': 'Neo4j 연결 실패: 백엔드 서버를 확인하세요.',
      'unknown_error': 'Neo4j 연결 오류가 발생했습니다.'
    };
    
    const message = messages[error.status] || messages['unknown_error'];
    showErrorToast(message, ErrorType.NETWORK);
  }
}

/**
 * Neo4j 연결 오류 커스텀 클래스
 */
class Neo4jConnectionError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'Neo4jConnectionError';
    this.status = status;
    this.detail = detail;
  }
}

// 싱글톤 인스턴스
export const apiClient = new APIClient();
