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
   * 데이터 로드
   */
  async loadData() {
    // 실제로는 API에서 데이터를 가져와야 함
    // 현재는 샘플 데이터 사용
    this.rawNodes = [
      { id: '삼성전자', type: 'company', size: 28,
        shareholders: [
          { name: '삼성생명보험', pct: 8.51 },
          { name: '국민연금', pct: 6.73 },
          { name: '이재용', pct: 1.63 },
          { name: 'BlackRock', pct: 5.1 }
        ]
      },
      { id: '우리금융지주', type: 'company', size: 22,
        shareholders: [
          { name: '예금보험공사', pct: 15.1 },
          { name: '국민연금', pct: 6.4 }
        ]
      },
      { id: '미래에셋캐피탈', type: 'company', size: 18 },
      { id: '메리츠금융지주', type: 'company', size: 20 },
      { id: '한국공항(주)', type: 'company', size: 16 },
      { id: '흥국생명보험', type: 'company', size: 15 },
      { id: '한화손해보험', type: 'company', size: 15 },
      { id: '삼성생명', type: 'institution', size: 22 },
      { id: '국민연금', type: 'institution', size: 26 },
      { id: '강상규', type: 'person', size: 12 },
      { id: '박현주', type: 'person', size: 14 },
      { id: '서재희', type: 'person', size: 11 },
      { id: '심장식', type: 'person', size: 11 },
      { id: '윤대영', type: 'person', size: 11 },
      { id: '윤강노', type: 'person', size: 11 },
      { id: '(주)다산', type: 'major', size: 14 },
      { id: '(주)방림', type: 'major', size: 14 },
      { id: '주식회사 화인파트너스', type: 'major', size: 14 },
      { id: '경남은행', type: 'company', size: 16 },
      { id: '광주은행', type: 'company', size: 15 },
      { id: '이재용', type: 'person', size: 14 },
      { id: '신창재', type: 'person', size: 12 }
    ];

    this.rawLinks = [
      { source: '삼성생명', target: '삼성전자', pct: 8.51 },
      { source: '국민연금', target: '삼성전자', pct: 6.73 },
      { source: '이재용', target: '삼성전자', pct: 1.63 },
      { source: '국민연금', target: '우리금융지주', pct: 6.4 },
      { source: '박현주', target: '미래에셋캐피탈', pct: 33.0 },
      { source: '삼성전자', target: '삼성생명', pct: 19.3 },
      { source: '(주)다산', target: '경남은행', pct: 128.2 },
      { source: '(주)방림', target: '광주은행', pct: 8.4 },
      { source: '신창재', target: '메리츠금융지주', pct: 15.2 }
    ];
    
    // 상태에 저장
    stateManager.setState('graph.rawNodes', this.rawNodes);
    stateManager.setState('graph.rawLinks', this.rawLinks);
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
      filters.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        
        const type = chip.dataset.type;
        const filters = stateManager.getState('filters');
        const isActive = filters.has(type);
        
        if (isActive) {
          filters.delete(type);
          chip.classList.remove('active');
          chip.setAttribute('aria-checked', 'false');
        } else {
          filters.add(type);
          chip.classList.add('active');
          chip.setAttribute('aria-checked', 'true');
        }
        
        stateManager.setState('filters', new Set(filters));
        this.graphManager.buildGraph(document.getElementById('visNetwork'));
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
   * 검색 처리
   */
  handleSearch(query) {
    const suggestions = document.getElementById('suggestions');
    if (!suggestions) return;

    const q = query.trim().toLowerCase();
    stateManager.setState('ui.searchQuery', q);

    if (!q) {
      suggestions.classList.remove('open');
      return;
    }

    const matches = this.rawNodes
      .filter(n => n.id.toLowerCase().includes(q))
      .slice(0, 8);

    if (!matches.length) {
      suggestions.classList.remove('open');
      return;
    }

    const typeMeta = {
      company: { label: '회사', color: '#f97316' },
      person: { label: '개인주주', color: '#ef4444' },
      major: { label: '최대주주', color: '#f59e0b' },
      institution: { label: '기관', color: '#6366f1' }
    };

    suggestions.innerHTML = matches.map(n => {
      const m = typeMeta[n.type];
      return `
        <div class="suggestion-item" 
             data-id="${n.id}"
             role="option"
             tabindex="0"
             onclick="window.app?.selectSearchResult('${n.id}')"
             onkeydown="if(event.key==='Enter') window.app?.selectSearchResult('${n.id}')">
          <span class="suggestion-dot" style="background:${m.color}"></span>
          ${n.id} <span style="color:${m.color};font-size:11px;margin-left:4px">${m.label}</span>
        </div>
      `;
    }).join('');

    suggestions.classList.add('open');
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
