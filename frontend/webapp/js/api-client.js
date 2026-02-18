/**
 * FastAPI 백엔드와 통신하는 클라이언트
 * @module api-client
 */

import { showErrorToast, ErrorType, handleNetworkError } from './utils/error-handler.js';

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 
                     window.API_BASE_URL || 
                     'http://localhost:8000';

/**
 * API 클라이언트 클래스
 */
export class APIClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  /**
   * 기본 요청 메서드
   * @private
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      await handleNetworkError(response);
      return await response.json();
    } catch (error) {
      console.error(`[APIClient] ${endpoint} 요청 실패:`, error);
      throw error;
    }
  }

  /**
   * 그래프 데이터 조회
   * @param {number} limit - 최대 반환 개수
   * @param {string[]} nodeLabels - 필터링할 노드 라벨 (예: ['Company', 'Person'])
   * @param {string[]} relationshipTypes - 필터링할 관계 타입 (기본값: ['HOLDS_SHARES', 'HAS_COMPENSATION'])
   * @returns {Promise<Object>} 그래프 데이터
   */
  async getGraphData(limit = 100, nodeLabels = null, relationshipTypes = null) {
    const params = new URLSearchParams({ limit: limit.toString() });
    
    // 기본 관계 타입 설정 (실제 스키마)
    if (!relationshipTypes) {
      relationshipTypes = ['HOLDS_SHARES', 'HAS_COMPENSATION'];
    }
    
    if (nodeLabels && nodeLabels.length > 0) {
      nodeLabels.forEach(label => params.append('node_labels', label));
    }
    
    if (relationshipTypes && relationshipTypes.length > 0) {
      relationshipTypes.forEach(type => params.append('relationship_types', type));
    }

    try {
      return await this.request(`/api/graph?${params.toString()}`);
    } catch (error) {
      showErrorToast('그래프 데이터를 불러올 수 없습니다.', ErrorType.NETWORK);
      return { nodes: [], edges: [] };
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

    // 실제 스키마에 맞는 기본 검색 속성
    if (!searchProperties) {
      searchProperties = [
        'companyName', 'companyNameNormalized',
        'stockName', 'stockNameNormalized',
        'bizno', 'personId'
      ];
    }

    if (searchProperties && searchProperties.length > 0) {
      searchProperties.forEach(prop => params.append('search_properties', prop));
    }

    try {
      return await this.request(`/api/graph/search?${params.toString()}`);
    } catch (error) {
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
      showErrorToast(`노드 정보를 불러올 수 없습니다: ${nodeId}`, ErrorType.NETWORK);
      return null;
    }
  }

  /**
   * Ego 그래프 조회
   * @param {string} nodeId - 중심 노드 ID
   * @param {number} depth - 탐색 깊이
   * @param {number} limit - 최대 반환 개수
   * @returns {Promise<Object>} Ego 그래프 데이터
   */
  async getEgoGraph(nodeId, depth = 1, limit = 100) {
    const params = new URLSearchParams({
      depth: depth.toString(),
      limit: limit.toString()
    });

    try {
      return await this.request(`/api/node/${encodeURIComponent(nodeId)}/ego?${params.toString()}`);
    } catch (error) {
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
      showErrorToast('통계를 불러올 수 없습니다.', ErrorType.NETWORK);
      return null;
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
      showErrorToast('챗봇 응답을 받을 수 없습니다.', ErrorType.NETWORK);
      return {
        response: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        graph_data: null
      };
    }
  }

  /**
   * 헬스 체크
   * @returns {Promise<Object>} 헬스 상태
   */
  async healthCheck() {
    try {
      return await this.request('/health');
    } catch (error) {
      return { status: 'unhealthy', neo4j: 'disconnected' };
    }
  }
}

// 싱글톤 인스턴스
export const apiClient = new APIClient();
