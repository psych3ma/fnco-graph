/**
 * 패널 관리 클래스
 * @module core/panel-manager
 */

import { stateManager } from './state-manager.js';
import { safeExecute, ErrorType } from '../utils/error-handler.js';
import { announceToScreenReader } from '../utils/accessibility.js';

/**
 * 패널 관리자 클래스
 */
export class PanelManager {
  constructor() {
    this.detailContainer = null;
    this.chatContainer = null;
    this.typeMeta = {
      company: { label: '회사', color: '#f97316' },
      person: { label: '개인주주', color: '#ef4444' },
      major: { label: '최대주주', color: '#f59e0b' },
      institution: { label: '기관', color: '#6366f1' }
    };
  }

  /**
   * 초기화
   * @param {HTMLElement} detailContainer - 상세 패널 컨테이너
   * @param {HTMLElement} chatContainer - 챗 패널 컨테이너
   */
  initialize(detailContainer, chatContainer) {
    this.detailContainer = detailContainer;
    this.chatContainer = chatContainer;
    
    // 상태 구독
    stateManager.subscribe('selectedNode', (node) => {
      if (node) {
        this.renderNodeDetail(node);
      } else {
        this.showEmptyState();
      }
    });
    
    stateManager.subscribe('ui.activeTab', (tab) => {
      this.switchTab(tab);
    });
  }

  /**
   * 노드 상세 정보 렌더링
   * @param {Object} node - 노드 데이터
   */
  renderNodeDetail(node) {
    return safeExecute(() => {
      if (!this.detailContainer) return;

      const meta = this.typeMeta[node.type] || this.typeMeta.company;
      const inLinks = stateManager.getState('graph.rawLinks')?.filter(l => l.target === node.id) || [];
      const outLinks = stateManager.getState('graph.rawLinks')?.filter(l => l.source === node.id) || [];
      const totalConn = inLinks.length + outLinks.length;

      const connectedNodes = [
        ...outLinks.map(l => ({ id: l.target, pct: l.pct, dir: 'out' })),
        ...inLinks.map(l => ({ id: l.source, pct: l.pct, dir: 'in' }))
      ];

      const SHOW_INIT = 3;
      const overflow = connectedNodes.slice(SHOW_INIT);

      const maxPct = node.shareholders?.[0]?.pct ?? (outLinks[0]?.pct ?? '-');
      const shCount = node.shareholders?.length ?? '-';

      const detailHTML = this.buildDetailHTML(node, meta, connectedNodes, overflow, maxPct, shCount, totalConn);
      
      const emptyState = this.detailContainer.querySelector('.panel-empty');
      if (emptyState) emptyState.style.display = 'none';

      const detailEl = this.detailContainer.querySelector('.node-detail') || 
                       document.createElement('div');
      detailEl.className = 'node-detail visible';
      detailEl.innerHTML = detailHTML;
      
      if (!this.detailContainer.querySelector('.node-detail')) {
        this.detailContainer.appendChild(detailEl);
      }

      // 이벤트 리스너 바인딩
      this.bindDetailEvents(node.id);
      
      announceToScreenReader(`${node.id} 노드 상세 정보가 표시되었습니다.`);
    }, '노드 상세 정보 렌더링 중 오류가 발생했습니다.', ErrorType.RENDER);
  }

  /**
   * 상세 HTML 빌드
   * @private
   */
  buildDetailHTML(node, meta, connectedNodes, overflow, maxPct, shCount, totalConn) {
    const hexAlpha = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    const connItem = (c) => {
      const cRaw = stateManager.getState('graph.rawNodes')?.find(n => n.id === c.id);
      const cMeta = cRaw ? this.typeMeta[cRaw.type] : { color: '#888' };
      const edgeLabel = c.dir === 'out' ? '투자→' : '←투자';
      return `
        <div class="related-item" 
             onclick="window.graphManager?.focusNode('${c.id}')"
             role="button"
             tabindex="0"
             aria-label="${c.id} 노드로 이동">
          <div class="ri-dot" style="background:${cMeta.color}"></div>
          <div class="ri-name">${this.escapeHtml(c.id)}</div>
          <span class="ri-edge-label">${edgeLabel}</span>
          ${c.pct != null ? `<span class="ri-val">${c.pct}%</span>` : ''}
          <span class="ri-arrow">›</span>
        </div>`;
    };

    const shSection = node.shareholders?.length ? `
      <div class="nd-section">
        <div class="nd-section-title">주요 주주</div>
        ${node.shareholders.map(s => `
          <div class="related-item">
            <div class="ri-dot" style="background:${meta.color}"></div>
            <div class="ri-name">${this.escapeHtml(s.name)}</div>
            <span class="ri-val">${s.pct}%</span>
            <div style="display:flex;align-items:center;gap:4px">
              <div class="sh-bar-wrap"><div class="sh-bar" style="width:${Math.min(s.pct, 100)}%"></div></div>
            </div>
          </div>
        `).join('')}
      </div>` : '';

    return `
      <div class="nd-header">
        <div class="nd-type-row">
          <span class="nd-badge" 
                style="background:${hexAlpha(meta.color, 0.12)};color:${meta.color};border:1px solid ${hexAlpha(meta.color, 0.28)}"
                aria-label="노드 타입: ${meta.label}">
            <span class="badge-dot" style="background:${meta.color}"></span>
            ${meta.label}
          </span>
          <span class="nd-node-id">${node.id.replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 6)}</span>
        </div>
        <div class="nd-name">${this.escapeHtml(node.id)}</div>
      </div>

      <div class="nd-stats">
        <div class="nd-stat">
          <div class="nd-stat-val">${typeof maxPct === 'number' ? maxPct + '%' : maxPct}</div>
          <div class="nd-stat-key">최대주주 지분율</div>
        </div>
        <div class="nd-stat">
          <div class="nd-stat-val">${shCount}</div>
          <div class="nd-stat-key">주주 수</div>
        </div>
        <div class="nd-stat">
          <div class="nd-stat-val">${totalConn}</div>
          <div class="nd-stat-key">연결 노드</div>
        </div>
      </div>

      ${connectedNodes.length ? `
      <div class="nd-section">
        <div class="nd-section-title">연결 노드 (${connectedNodes.length})</div>
        <div class="related-list" id="relatedList">
          ${connectedNodes.slice(0, 3).map(connItem).join('')}
          ${overflow.length ? `
            <div class="related-item-more" id="relatedMore">
              ${overflow.map(connItem).join('')}
            </div>
            <button class="related-more-btn" 
                    id="relMoreBtn" 
                    onclick="window.panelManager?.toggleRelMore()"
                    aria-expanded="false"
                    aria-controls="relatedMore">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" id="relMoreIcon">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              더보기 <span id="relMoreCount">(${overflow.length}개)</span>
            </button>
          ` : ''}
        </div>
      </div>` : ''}

      ${shSection}

      <div class="nd-section" id="propsSection">
        <div class="nd-section-title">속성</div>
        <div class="props-grid" id="propsGrid">
          <div class="prop-row">
            <span class="prop-key">nodeType</span>
            <span class="prop-val">${meta.label}</span>
          </div>
          <div class="prop-row">
            <span class="prop-key">isActive</span>
            <span class="prop-val bool-true">true</span>
          </div>
          <div id="propsExtra">
            <div class="prop-row">
              <span class="prop-key">dataSource</span>
              <span class="prop-val">DART</span>
            </div>
            <div class="prop-row">
              <span class="prop-key">connections</span>
              <span class="prop-val mono">${totalConn}</span>
            </div>
            <div class="prop-row">
              <span class="prop-key">status</span>
              <span class="prop-val">계속사업자</span>
            </div>
          </div>
        </div>
        <button class="props-toggle" 
                id="propsToggleBtn" 
                onclick="window.panelManager?.togglePropsSection()"
                aria-expanded="true"
                aria-controls="propsExtra">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" id="propsToggleIcon">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          상세 속성 접기
        </button>
      </div>

      <div class="nd-actions">
        <button class="action-btn secondary" 
                onclick="window.panelManager?.loadEgoGraph()"
                aria-label="이 노드 기준 지배구조 맵 보기">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/>
          </svg>
          이 노드 기준 지배구조 맵 보기
        </button>
        <button class="action-btn primary" 
                onclick="window.panelManager?.openChatWithContext()"
                aria-label="이 노드에 대해 AI에게 질문하기">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 10V3a1 1 0 011-1h7a1 1 0 011 1v5a1 1 0 01-1 1H4L2 10z" stroke="white" stroke-width="1.3" stroke-linejoin="round"/>
          </svg>
          이 노드에 대해 AI에게 질문하기
        </button>
      </div>
    `;
  }

  /**
   * 빈 상태 표시
   */
  showEmptyState() {
    if (!this.detailContainer) return;
    
    const emptyState = this.detailContainer.querySelector('.panel-empty');
    if (emptyState) emptyState.style.display = '';
    
    const detailEl = this.detailContainer.querySelector('.node-detail');
    if (detailEl) detailEl.classList.remove('visible');
  }

  /**
   * 탭 전환
   * @param {string} tab - 탭 이름 ('detail' | 'chat')
   */
  switchTab(tab) {
    const detailTab = document.querySelector('.ptab[data-tab="detail"]');
    const chatTab = document.querySelector('.ptab[data-tab="chat"]');
    const detailBody = document.getElementById('detailTabBody');
    const chatBody = document.getElementById('chatTabBody');

    if (tab === 'detail') {
      detailTab?.classList.add('active');
      chatTab?.classList.remove('active');
      if (detailBody) detailBody.style.display = '';
      if (chatBody) chatBody.classList.remove('active');
    } else {
      chatTab?.classList.add('active');
      detailTab?.classList.remove('active');
      if (detailBody) detailBody.style.display = 'none';
      if (chatBody) chatBody.classList.add('active');
    }
  }

  /**
   * 연결 노드 더보기 토글
   */
  toggleRelMore() {
    const more = document.getElementById('relatedMore');
    const btn = document.getElementById('relMoreBtn');
    const icon = document.getElementById('relMoreIcon');
    const cnt = document.getElementById('relMoreCount');
    
    if (!more || !btn) return;
    
    const isOpen = more.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen);
    
    if (icon) {
      icon.style.transform = isOpen ? 'rotate(180deg)' : '';
    }
    
    if (cnt && btn.dataset.count) {
      cnt.textContent = isOpen ? '' : `(${btn.dataset.count})`;
    }
    
    btn.childNodes[2].textContent = isOpen ? ' 접기' : ' 더보기 ';
  }

  /**
   * 속성 섹션 토글
   */
  togglePropsSection() {
    const extra = document.getElementById('propsExtra');
    const icon = document.getElementById('propsToggleIcon');
    const btn = document.getElementById('propsToggleBtn');
    
    if (!extra || !btn) return;
    
    const isExpanded = extra.style.display !== 'none';
    extra.style.display = isExpanded ? 'none' : '';
    btn.setAttribute('aria-expanded', !isExpanded);
    
    if (icon) {
      icon.style.transform = isExpanded ? 'rotate(180deg)' : '';
    }
    
    btn.childNodes[2].textContent = isExpanded ? ' 상세 속성 더 보기' : ' 상세 속성 접기';
    
    stateManager.setState('ui.propsExpanded', !isExpanded);
  }

  /**
   * 이고 그래프 로드
   */
  loadEgoGraph() {
    const banner = document.getElementById('egoBanner');
    if (banner) {
      banner.classList.add('visible');
      announceToScreenReader('지배구조 맵 모드로 전환되었습니다.');
    }
  }

  /**
   * 챗 컨텍스트로 열기
   */
  openChatWithContext() {
    const node = stateManager.getState('selectedNode');
    if (!node) return;
    
    stateManager.setState('ui.activeTab', 'chat');
    stateManager.setState('chat.context', node);
    
    const ctxBar = document.getElementById('ctxBar');
    const ctxChip = document.getElementById('ctxChip');
    
    if (ctxBar) ctxBar.classList.remove('hidden');
    if (ctxChip) ctxChip.textContent = node.id;
    
    announceToScreenReader(`챗봇이 ${node.id} 노드 컨텍스트로 열렸습니다.`);
  }

  /**
   * 상세 이벤트 바인딩
   * @private
   */
  bindDetailEvents(nodeId) {
    // 키보드 이벤트 추가
    const relatedItems = this.detailContainer.querySelectorAll('.related-item');
    relatedItems.forEach(item => {
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });
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
}
