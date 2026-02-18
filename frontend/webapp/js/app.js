/**
 * 메인 애플리케이션
 * @module app
 */

import { GraphManager } from './core/graph-manager.js';
import { PanelManager } from './core/panel-manager.js';
import { ChatManager } from './core/chat-manager.js';
import { stateManager } from './core/state-manager.js';
import { registerKeyboardShortcut } from './utils/accessibility.js';
import { safeExecute, ErrorType, showErrorToast } from './utils/error-handler.js';
import { apiClient } from './api-client.js';

/**
 * 애플리케이션 클래스
 */
class App {
  constructor() {
    this.graphManager = null;
    this.panelManager = null;
    this.chatManager = null;
    this.rawNodes = [];
    this.rawLinks = [];
  }

  /**
   * 애플리케이션 초기화
   */
  async init() {
    try {
      // 데이터 로드
      await this.loadData();
      
      // 매니저 초기화
      this.graphManager = new GraphManager();
      this.panelManager = new PanelManager();
      this.chatManager = new ChatManager();
      
      // 그래프 초기화
      const graphContainer = document.getElementById('visNetwork');
      if (!graphContainer) {
        throw new Error('그래프 컨테이너를 찾을 수 없습니다.');
      }
      
      await this.graphManager.initialize(graphContainer, this.rawNodes, this.rawLinks);
      
      // 패널 초기화
      const detailContainer = document.getElementById('detailTabBody');
      const chatContainer = document.getElementById('chatTabBody');
      this.panelManager.initialize(detailContainer, chatContainer);
      
      // 챗 초기화
      this.chatManager.initialize();
      
      // 이벤트 바인딩
      this.bindEvents();
      
      // 키보드 단축키 등록
      this.registerShortcuts();
      
      // 로딩 완료
      this.hideLoading();
      
      // 전역 접근
      window.app = this;
      window.graphManager = this.graphManager;
      window.panelManager = this.panelManager;
      window.chatManager = this.chatManager;
      
      console.log('[App] 초기화 완료');
    } catch (error) {
      console.error('[App] 초기화 실패:', error);
      showErrorToast('애플리케이션 초기화 중 오류가 발생했습니다.', ErrorType.UNKNOWN);
    }
  }

  /**
   * 데이터 로드 (Neo4j API에서 실제 데이터 가져오기)
   */
  async loadData() {
    try {
      // 헬스 체크
      const health = await apiClient.healthCheck();
      if (health.neo4j !== 'connected') {
        showErrorToast('Neo4j 연결이 되지 않았습니다. 백엔드 서버를 확인해주세요.', ErrorType.NETWORK);
        // 폴백: 빈 데이터
        this.rawNodes = [];
        this.rawLinks = [];
        stateManager.setState('graph.rawNodes', []);
        stateManager.setState('graph.rawLinks', []);
        return;
      }

      // 그래프 데이터 조회 (실제 스키마에 맞춘 버전)
      const filters = stateManager.getState('filters');
      const nodeLabels = Array.from(filters).map(type => {
        // 실제 스키마 라벨 매핑
        const labelMap = {
          'company': 'Company',
          'person': 'Person',
          'major': 'Stockholder',  // MajorShareholder는 Stockholder의 하위 집합
          'institution': 'Stockholder'  // Institution도 Stockholder
        };
        return labelMap[type] || type;
      });

      // 실제 관계 타입 사용
      const relationshipTypes = ['HOLDS_SHARES', 'HAS_COMPENSATION'];
      
      const graphData = await apiClient.getGraphData(
        100, 
        nodeLabels.length > 0 ? nodeLabels : null,
        relationshipTypes
      );
      
      // API 응답을 내부 형식으로 변환 (실제 스키마에 맞춘 버전)
      this.rawNodes = graphData.nodes.map(node => ({
        id: node.id,
        label: node.label,  // 실제 Neo4j 라벨 유지
        type: this.mapLabelToType(node.label),  // 필터용 타입 매핑
        size: this.calculateNodeSize(node),
        properties: node.properties,
        displayName: node.properties?.displayName || node.id
      }));

      this.rawLinks = graphData.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        pct: edge.properties?.pct || edge.properties?.stockRatio || edge.properties?.percentage || null,
        type: edge.label,  // 실제 관계 타입 (HOLDS_SHARES, HAS_COMPENSATION)
        properties: edge.properties
      }));

      // 상태에 저장
      stateManager.setState('graph.rawNodes', this.rawNodes);
      stateManager.setState('graph.rawLinks', this.rawLinks);

      // 통계 업데이트
      const stats = await apiClient.getStatistics();
      if (stats) {
        this.updateStatistics(stats);
      }

    } catch (error) {
      console.error('[App] 데이터 로드 실패:', error);
      showErrorToast('데이터를 불러오는 중 오류가 발생했습니다.', ErrorType.NETWORK);
      // 폴백: 빈 데이터
      this.rawNodes = [];
      this.rawLinks = [];
      stateManager.setState('graph.rawNodes', []);
      stateManager.setState('graph.rawLinks', []);
    }
  }

  /**
   * 라벨을 타입으로 매핑 (필터용)
   * @private
   */
  mapLabelToType(label) {
    const labelMap = {
      'Company': 'company',
      'Person': 'person',
      'Stockholder': 'major',
      'MajorShareholder': 'major',
      'LegalEntity': 'company'
    };
    return labelMap[label] || 'company';
  }

  /**
   * 노드 크기 계산
   * @private
   */
  calculateNodeSize(node) {
    // 관계 수나 다른 속성에 따라 크기 결정
    const baseSize = 16;
    // 실제 스키마 속성 활용
    const stockRatio = node.properties?.maxStockRatio || node.properties?.totalStockRatio || 0;
    const investmentCount = node.properties?.totalInvestmentCount || 0;
    const sizeMultiplier = Math.max(stockRatio / 10, investmentCount / 5);
    return Math.min(baseSize + sizeMultiplier * 4, 40);
  }

  /**
   * 통계 업데이트 (실제 스키마에 맞춘 버전)
   * @private
   */
  updateStatistics(stats) {
    // 레전드 카운트 업데이트
    if (stats.label_counts) {
      // 라벨 매핑
      const labelMapping = {
        'Company': 'company',
        'Person': 'person',
        'Stockholder': 'major',
        'MajorShareholder': 'major',
        'LegalEntity': 'company'
      };
      
      stats.label_counts.forEach(({ label, count }) => {
        const mappedLabel = labelMapping[label] || label.toLowerCase();
        const countEl = document.getElementById(`cnt-${mappedLabel}`);
        if (countEl) {
          countEl.textContent = `${count} 건`;
        }
      });
    }
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents() {
    // 검색
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.target.value = '';
          this.handleSearch('');
        }
      });
    }

    // 필터
    const filters = document.getElementById('filters');
    if (filters) {
      filters.addEventListener('click', async (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        
        const type = chip.dataset.type;
        const currentFilters = stateManager.getState('filters');
        const isActive = currentFilters.has(type);
        
        if (isActive) {
          currentFilters.delete(type);
          chip.classList.remove('active');
          chip.setAttribute('aria-checked', 'false');
        } else {
          currentFilters.add(type);
          chip.classList.add('active');
          chip.setAttribute('aria-checked', 'true');
        }
        
        stateManager.setState('filters', new Set(currentFilters));
        
        // 필터 변경 시 데이터 다시 로드
        await this.loadData();
        if (this.graphManager) {
          await this.graphManager.buildGraph(document.getElementById('visNetwork'));
        }
      });
    }

    // 줌 컨트롤
    document.getElementById('zoomIn')?.addEventListener('click', () => {
      this.graphManager.zoomIn();
    });
    
    document.getElementById('zoomOut')?.addEventListener('click', () => {
      this.graphManager.zoomOut();
    });
    
    document.getElementById('zoomFit')?.addEventListener('click', () => {
      this.graphManager.zoomFit();
    });

    // 레전드 클릭
    const legend = document.getElementById('legend');
    if (legend) {
      legend.addEventListener('click', (e) => {
        const row = e.target.closest('.legend-row');
        if (!row) return;
        
        const type = row.dataset.type;
        const chip = document.querySelector(`.chip[data-type="${type}"]`);
        if (chip) chip.click();
      });
    }
  }

  /**
   * 검색 처리 (Neo4j API 사용)
   */
  async handleSearch(query) {
    const suggestions = document.getElementById('suggestions');
    if (!suggestions) return;

    const q = query.trim();
    stateManager.setState('ui.searchQuery', q);

    if (!q) {
      suggestions.classList.remove('open');
      return;
    }

    try {
      // API로 검색
      const searchResults = await apiClient.searchGraph(q, 8);
      
      if (!searchResults.nodes || searchResults.nodes.length === 0) {
        suggestions.classList.remove('open');
        return;
      }

      // 실제 스키마 라벨 매핑
      const labelToType = {
        'Company': 'company',
        'Person': 'person',
        'Stockholder': 'major',
        'MajorShareholder': 'major',
        'LegalEntity': 'company'
      };
      
      const typeMeta = {
        company: { label: '회사', color: '#f97316' },
        person: { label: '개인주주', color: '#ef4444' },
        major: { label: '주주', color: '#f59e0b' },
        institution: { label: '기관', color: '#6366f1' },
        node: { label: '노드', color: '#888' }
      };

      suggestions.innerHTML = searchResults.nodes.map(node => {
        // 라벨에서 타입 추출
        const nodeLabel = node.label || 'Node';
        const nodeType = labelToType[nodeLabel] || 'node';
        const m = typeMeta[nodeType] || typeMeta.node;
        return `
          <div class="suggestion-item" 
               data-id="${node.id}"
               role="option"
               tabindex="0"
               onclick="window.app?.selectSearchResult('${node.id}')"
               onkeydown="if(event.key==='Enter') window.app?.selectSearchResult('${node.id}')">
            <span class="suggestion-dot" style="background:${m.color}"></span>
            ${this.escapeHtml(node.id)} <span style="color:${m.color};font-size:11px;margin-left:4px">${m.label}</span>
          </div>
        `;
      }).join('');

      suggestions.classList.add('open');
    } catch (error) {
      console.error('[App] 검색 실패:', error);
      suggestions.classList.remove('open');
    }
  }

  /**
   * HTML 이스케이프
   * @private
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 검색 결과 선택
   */
  selectSearchResult(nodeId) {
    const searchInput = document.getElementById('searchInput');
    const suggestions = document.getElementById('suggestions');
    
    if (searchInput) searchInput.value = nodeId;
    if (suggestions) suggestions.classList.remove('open');
    
    this.graphManager.focusNode(nodeId);
  }

  /**
   * 패널 탭 전환
   */
  switchPanelTab(tab) {
    stateManager.setState('ui.activeTab', tab);
    this.panelManager.switchTab(tab);
  }

  /**
   * 키보드 단축키 등록
   */
  registerShortcuts() {
    // 검색 포커스: /
    registerKeyboardShortcut('/', (e) => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // ESC: 검색 취소
    registerKeyboardShortcut('Escape', (e) => {
      const searchInput = document.getElementById('searchInput');
      if (document.activeElement === searchInput) {
        searchInput.value = '';
        this.handleSearch('');
        searchInput.blur();
      }
    });
  }

  /**
   * 로딩 숨기기
   */
  hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.setAttribute('aria-busy', 'false');
    }
  }
}

// DOM 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
  });
} else {
  const app = new App();
  app.init();
}
