/**
 * 패널 관리 클래스
 * @module core/panel-manager
 */

import { stateManager } from './state-manager.js';
import { safeExecute, ErrorType, showErrorToast } from '../utils/error-handler.js';
import { announceToScreenReader } from '../utils/accessibility.js';
import { apiClient } from '../api-client.js';
import { NODE_TYPE_META, NODE_LABELS } from '../config/constants.js';

/**
 * 패널 관리자 클래스
 */
export class PanelManager {
  constructor() {
    this.detailContainer = null;
    this.chatContainer = null;
    /** @type {typeof NODE_TYPE_META} 타입 메타 (constants 기반, 협업 단일 소스) */
    this.typeMeta = NODE_TYPE_META;
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
   * 노드 상세 정보 렌더링 (실제 API 사용)
   * @param {Object} node - 노드 데이터
   */
  async renderNodeDetail(node) {
    return safeExecute(async () => {
      if (!this.detailContainer) return;

      const requestedNodeId = node.id;
      // 로딩 표시: API 도착 전까지 이전 상세/빈 화면 대신 "불러오는 중" 노출 (CTO: 늦게 표출 완화)
      const detailEl = this.detailContainer.querySelector('.node-detail') || document.createElement('div');
      detailEl.className = 'node-detail visible node-detail-loading';
      detailEl.innerHTML = '<div class="nd-loading" aria-live="polite" aria-busy="true"><span class="nd-loading-spinner" aria-hidden="true"></span>노드 정보를 불러오는 중…</div>';
      const emptyState = this.detailContainer.querySelector('.panel-empty');
      if (emptyState) emptyState.style.display = 'none';
      if (!this.detailContainer.querySelector('.node-detail')) {
        this.detailContainer.appendChild(detailEl);
      }

      // 실제 스키마 라벨 사용
      const displayKey = node.type || node.label || NODE_LABELS.COMPANY;
      const meta = this.typeMeta[displayKey] || this.typeMeta[node.label] || this.typeMeta[NODE_LABELS.COMPANY] || this.typeMeta.company;
      
      // API에서 노드 상세 정보 가져오기 시도 (id_property: 스키마에 맞게 bizno/personId 전달)
      const idProp = (node.label === 'Company' || node.properties?.labels?.includes?.('Company')) ? 'bizno' : (node.label === 'Person' || node.properties?.labels?.includes?.('Person')) ? 'personId' : null;
      let nodeDetail = null;
      try {
        nodeDetail = await apiClient.getNodeDetail(node.id, idProp);
      } catch (error) {
        console.warn('[PanelManager] API 조회 실패, 로컬 데이터 사용:', error);
      }

      // Race 방지: 빠르게 A→B 클릭 시 B 선택인데 A 응답이 나중에 오면 DOM 갱신 스킵 (CTO: 이슈 #6)
      if (stateManager.getState('selectedNode')?.id !== requestedNodeId) {
        return;
      }
      
      // API 데이터가 있으면 사용, 없으면 로컬 데이터 사용
      let inLinks, outLinks, connectedNodes, maxPct, shCount, totalConn;
      
      if (nodeDetail && nodeDetail.relationships) {
        // API 데이터 사용 (백엔드가 direction 제공 시 그대로 사용, 없으면 n/m 기준 추론)
        const relationships = nodeDetail.relationships;
        const rawNode = nodeDetail.node?.n || nodeDetail.node || node.properties || {};
        // Neo4j 직렬화: 노드 속성이 node.properties 하위에 올 수 있음 (CTO: 그래프 DB 값 표출)
        const nodeProps = rawNode.properties && typeof rawNode.properties === 'object'
          ? { ...rawNode.properties, ...rawNode }
          : rawNode;
        const useDirection = relationships.some(r => r.direction != null);

        if (useDirection) {
          inLinks = relationships.filter(r => r.direction === 'in');
          outLinks = relationships.filter(r => r.direction === 'out');
        } else {
          inLinks = relationships.filter(r => {
            const targetId = this.extractNodeIdFromRecord(r.m || {}, r);
            return targetId === node.id;
          });
          outLinks = relationships.filter(r => {
            const sourceId = this.extractNodeIdFromRecord(r.n || {}, r);
            return sourceId === node.id;
          });
        }

        // 지분율: 백엔드 정규화 형태(r.properties) 우선, snake_case 호환 (연결노드 보유비율 표출)
        const relPct = (rec) => {
          const r = rec.r || rec.relationship;
          if (r == null) return null;
          const props = r.properties || {};
          const num = (v) => typeof v === 'number' && !Number.isNaN(v);
          if (num(props.stockRatio)) return props.stockRatio;
          if (num(props.pct)) return props.pct;
          if (num(props.stock_ratio)) return props.stock_ratio;
          if (num(r.stockRatio)) return r.stockRatio;
          if (num(r.pct)) return r.pct;
          if (typeof r.stock_ratio === 'number') return r.stock_ratio;
          return null;
        };
        const outList = outLinks.map(r => ({
          id: this.extractNodeIdFromRecord(r.m || {}, r),
          pct: relPct(r),
          dir: 'out',
          displayName: this.getDisplayNameFromRecord(r, 'm')
        }));
        const inList = inLinks.map(r => ({
          id: this.extractNodeIdFromRecord(r.n || {}, r),
          pct: relPct(r),
          dir: 'in',
          displayName: this.getDisplayNameFromRecord(r, 'n')
        }));
        // 노드 id 기준 디듀프: 같은 노드가 여러 관계로 나오면 한 행만 표시 (CTO: 연결노드 중복 제거)
        connectedNodes = this.dedupeConnectedNodes([...outList, ...inList].filter(c => c.id !== node.id));
        const pctValues = connectedNodes.map(c => c.pct).filter(v => typeof v === 'number');
        const maxFromRels = pctValues.length ? Math.max(...pctValues) : null;
        // 최대주주 지분율: 백엔드 계산값 우선 (CTO: 단일 소스), 없으면 프론트 계산값, 최종 없으면 노드 속성/fallback
        if (nodeDetail.maxStockRatioFromRels != null && typeof nodeDetail.maxStockRatioFromRels === 'number') {
          maxPct = nodeDetail.maxStockRatioFromRels;
        } else if (maxFromRels != null && maxFromRels >= 0) {
          maxPct = maxFromRels;
        } else {
          maxPct = (nodeProps.maxStockRatio ?? (outLinks[0] ? relPct(outLinks[0]) : null) ?? '-');
        }
        connectedNodes.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
        totalConn = connectedNodes.length;
        // 주주 수: 백엔드 계산값(중복 제거된 고유 주주 수) 우선 (CTO: 단일 소스), 없으면 노드 속성, 최종 없으면 incoming 관계 수
        if (nodeDetail.shareholderCount != null && typeof nodeDetail.shareholderCount === 'number' && nodeDetail.shareholderCount >= 0) {
          shCount = nodeDetail.shareholderCount;
        } else if (nodeProps.totalInvestmentCount != null && nodeProps.totalInvestmentCount !== '') {
          shCount = nodeProps.totalInvestmentCount;
        } else {
          const inCount = inLinks.length;
          shCount = (inCount > 0 ? inCount : '-');
        }
      } else {
        // 로컬 데이터 사용 (fallback)
        inLinks = stateManager.getState('graph.rawLinks')?.filter(l => l.target === node.id) || [];
        outLinks = stateManager.getState('graph.rawLinks')?.filter(l => l.source === node.id) || [];
        const localOut = outLinks.map(l => ({ id: l.target, pct: l.pct, dir: 'out', displayName: null }));
        const localIn = inLinks.map(l => ({ id: l.source, pct: l.pct, dir: 'in', displayName: null }));
        connectedNodes = this.dedupeConnectedNodes([...localOut, ...localIn].filter(c => c.id !== node.id));
        const pctValuesLocal = connectedNodes.map(c => c.pct).filter(v => typeof v === 'number');
        const maxFromRelsLocal = pctValuesLocal.length ? Math.max(...pctValuesLocal) : null;
        maxPct = (maxFromRelsLocal != null && maxFromRelsLocal >= 0) ? maxFromRelsLocal : (node.shareholders?.[0]?.pct ?? (outLinks[0]?.pct ?? '-'));
        connectedNodes.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
        totalConn = connectedNodes.length;
        // 주주 수: incoming(이 노드를 보유한 쪽) 수. 노드 속성 없으면 inLinks
        shCount = (node.shareholders?.length != null) ? node.shareholders.length : (inLinks.length > 0 ? inLinks.length : '-');
      }

      // 단일 소스: 표시되는 목록 길이와 상단 통계 수치 일치 (QA: 23 vs 24 불일치 제거)
      totalConn = connectedNodes.length;

      const SHOW_INIT = 2;
      const overflow = connectedNodes.slice(SHOW_INIT);

      const detailHTML = this.buildDetailHTML(node, meta, connectedNodes, overflow, maxPct, shCount, totalConn);
      
      if (stateManager.getState('selectedNode')?.id !== requestedNodeId) return;

      const finalDetailEl = this.detailContainer.querySelector('.node-detail') || document.createElement('div');
      finalDetailEl.classList.remove('node-detail-loading');
      finalDetailEl.className = 'node-detail visible';
      finalDetailEl.removeAttribute('aria-busy');
      finalDetailEl.innerHTML = detailHTML;
      if (!this.detailContainer.querySelector('.node-detail')) {
        this.detailContainer.appendChild(finalDetailEl);
      }

      // 이벤트 리스너 바인딩
      this.bindDetailEvents(node.id);

      // 이웃 하이라이트를 API 단일 소스로 갱신 (vis getConnectedNodes 대신 connected_node_ids 사용)
      if (nodeDetail?.connected_node_ids?.length && typeof window.graphManager?.highlightNeighbors === 'function') {
        window.graphManager.highlightNeighbors(node.id, nodeDetail.connected_node_ids);
      }

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

    // (3) 투자방향표시 미표출, 투자비율(내림차순)만 표시
    const connItem = (c) => {
      const cRaw = stateManager.getState('graph.rawNodes')?.find(n => n.id === c.id);
      const cLabel = cRaw?.label || cRaw?.type || 'Node';
      const cMeta = cRaw ? (this.typeMeta[cLabel] || this.typeMeta[NODE_LABELS.COMPANY] || { color: '#888' }) : { color: '#888' };
      const displayName = c.displayName || c.id;
      const safeName = this.escapeHtml(displayName);
      return `
        <div class="related-item" 
             onclick="window.graphManager?.focusNode('${c.id}')"
             role="button"
             tabindex="0"
             aria-label="${safeName} 노드로 이동"
             title="${safeName}">
          <div class="ri-dot" style="background:${cMeta.color}"></div>
          <div class="ri-name" title="${safeName}">${safeName}</div>
          ${c.pct != null ? `<span class="ri-val">${typeof c.pct === 'number' ? c.pct.toFixed(2) : c.pct}%</span>` : ''}
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

    const displayName = node.displayName || node.id;
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
        <div class="nd-name">${this.escapeHtml(displayName)}</div>
        <div class="nd-sub" aria-hidden="true">${meta.label}</div>
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
      </div>

      ${connectedNodes.length ? `
      <div class="nd-section">
        <div class="nd-section-title">연결 노드 (${connectedNodes.length})</div>
        <div class="related-list" id="relatedList">
          ${connectedNodes.slice(0, 2).map(connItem).join('')}
          ${overflow.length ? `
            <div class="related-item-more" id="relatedMore">
              ${overflow.map(connItem).join('')}
            </div>
            <button class="related-more-btn" 
                    id="relMoreBtn" 
                    onclick="window.panelManager?.toggleRelMore()"
                    aria-expanded="false"
                    aria-controls="relatedMore">
              <span class="related-more-text">더보기</span>
              <span class="related-more-count" id="relMoreCount">(${overflow.length}개)</span>
              <svg class="related-more-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
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
          ${(() => {
            const props = node.properties || {};
            const excludeKeys = new Set(['created', 'createdAt', 'created_at', 'createdAt', 'displayName', 'labels', 'nodeType']);
            return Object.entries(props)
              .filter(([key]) => !excludeKeys.has(key))
              .map(([key, val]) => {
                const valStr = val === null || val === undefined ? '-' : String(val);
                const isBool = typeof val === 'boolean';
                return `<div class="prop-row">
                  <span class="prop-key">${this.escapeHtml(key)}</span>
                  <span class="prop-val ${isBool ? (val ? 'bool-true' : 'bool-false') : ''}">${isBool ? String(val) : this.escapeHtml(valStr)}</span>
                </div>`;
              }).join('');
          })()}
        </div>
      </div>

      <div class="nd-actions">
        <button class="action-btn secondary nd-action--ego" 
                onclick="window.panelManager?.loadEgoGraph()"
                aria-label="이 노드 기준 지배구조 맵 보기">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/>
          </svg>
          이 노드 기준 지배구조 맵 보기
        </button>
        <button class="action-btn primary nd-action--chat" 
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
      if (chatBody) {
        chatBody.classList.remove('active');
        chatBody.style.display = 'none';
      }
    } else {
      chatTab?.classList.add('active');
      detailTab?.classList.remove('active');
      if (detailBody) detailBody.style.display = 'none';
      if (chatBody) {
        chatBody.classList.add('active');
        chatBody.style.display = 'flex';
      }
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
   * 이고 그래프(지배구조 맵) 로드: 선택 노드 기준 ego API 호출 후 그래프 교체
   */
  async loadEgoGraph() {
    const node = stateManager.getState('selectedNode');
    if (!node?.id) {
      announceToScreenReader('노드를 먼저 선택해주세요.');
      return;
    }
    const app = window.app;
    if (!app?.loadEgoGraph) return;
    try {
      await app.loadEgoGraph(node);
      const banner = document.getElementById('egoBanner');
      if (banner) {
        banner.classList.add('visible');
        announceToScreenReader('지배구조 맵 모드로 전환되었습니다.');
      }
    } catch (e) {
      console.warn('[PanelManager] Ego 그래프 로드 실패:', e);
      showErrorToast('지배구조 맵을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', ErrorType.NETWORK);
    }
  }

  /**
   * 이고 그래프 종료 후 전체 그래프 복원
   */
  async exitEgoGraph() {
    const banner = document.getElementById('egoBanner');
    if (banner) banner.classList.remove('visible');
    if (window.app?.exitEgoGraph) await window.app.exitEgoGraph();
  }

  /**
   * 챗 컨텍스트로 열기: AI 질문 탭으로 전환 후 컨텍스트 설정 및 입력 포커스
   */
  openChatWithContext() {
    const node = stateManager.getState('selectedNode');
    if (!node) {
      announceToScreenReader('노드를 먼저 선택해 주세요.');
      return;
    }

    stateManager.setState('ui.activeTab', 'chat');
    stateManager.setState('chat.context', { node_id: node.id, ...node });

    const ctxBar = document.getElementById('ctxBar');
    const ctxChip = document.getElementById('ctxChip');
    if (ctxBar) ctxBar.classList.remove('hidden');
    if (ctxChip) ctxChip.textContent = node.id;

    this.switchTab('chat');

    requestAnimationFrame(() => {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.focus();
      }
    });

    announceToScreenReader(`챗봇이 ${node.id} 노드 컨텍스트로 열렸습니다.`);
  }

  /**
   * 컨텍스트 섹션 닫기 (채팅 컨텍스트 제거)
   * HTML에서 panelManager.clearChatContext() 호출하므로 여기서 chatManager에 위임.
   */
  clearChatContext() {
    window.chatManager?.clearChatContext?.();
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
   * 관계 레코드에서 상대 노드 표시명 추출 (Neo4j 직렬화 시 properties 하위 지원)
   * @private
   */
  getDisplayNameFromRecord(record, key) {
    const obj = record[key] || {};
    const props = obj.properties;
    if (props && typeof props === 'object') {
      return props.companyName || props.stockName || props.displayName || props.personName || null;
    }
    return obj.companyName || obj.stockName || obj.displayName || obj.personName || null;
  }

  /**
   * 연결 노드 목록 디듀프: id 기준 1차, 동일 표시명(displayName) 2차 (연결노드 중복 제거)
   * @private
   */
  dedupeConnectedNodes(list) {
    const byId = new Map();
    for (const c of list) {
      const id = c.id != null ? String(c.id).trim() : '';
      const name = (c.displayName != null ? String(c.displayName) : (c.id != null ? String(c.id) : '')).trim();
      if (!id && !name) continue;
      const key = id || `name:${name}`;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, { ...c });
        continue;
      }
      const pct = c.pct != null && (existing.pct == null || Number(c.pct) > Number(existing.pct)) ? c.pct : existing.pct;
      const displayName = c.displayName || existing.displayName;
      byId.set(key, { ...existing, pct, displayName });
    }
    // 2차: 동일 displayName인데 id가 달라 중복된 행 병합 (같은 주주가 여러 관계로 나온 경우)
    const byName = new Map();
    for (const c of Array.from(byId.values())) {
      const name = (c.displayName != null ? String(c.displayName) : String(c.id)).trim();
      if (!name) {
        byName.set(c.id || `unk-${byName.size}`, c);
        continue;
      }
      const existing = byName.get(name);
      if (!existing) {
        byName.set(name, { ...c });
      } else {
        const pct = c.pct != null && (existing.pct == null || Number(c.pct) > Number(existing.pct)) ? c.pct : existing.pct;
        byName.set(name, { ...existing, id: existing.id || c.id, pct, displayName: existing.displayName || c.displayName });
      }
    }
    return Array.from(byName.values());
  }

  /**
   * 레코드에서 노드 ID 추출
   * @private
   */
  extractNodeIdFromRecord(nodeObj, record) {
    if (!nodeObj) return 'unknown';
    const p = nodeObj.properties && typeof nodeObj.properties === 'object' ? nodeObj.properties : {};
    // 실제 스키마에 맞는 ID 추출 (Neo4j 직렬화 시 properties 하위 지원)
    if (p.bizno != null) return p.bizno;
    if (p.personId != null) return p.personId;
    if (nodeObj.bizno != null) return nodeObj.bizno;
    if (nodeObj.personId != null) return nodeObj.personId;
    if (nodeObj.id != null) return nodeObj.id;
    if (p.companyName != null) return p.companyName;
    if (p.stockName != null) return p.stockName;
    if (nodeObj.companyName != null) return nodeObj.companyName;
    if (nodeObj.stockName != null) return nodeObj.stockName;
    return 'unknown';
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
