/**
 * 그래프 관리 클래스
 * @module core/graph-manager
 */

import { stateManager } from './state-manager.js';
import { safeExecute, ErrorType } from '../utils/error-handler.js';
import { announceToScreenReader } from '../utils/accessibility.js';
import { NODE_TYPE_META, NODE_LABELS, ACCENT_HIGHLIGHT, ACCENT_STRONG } from '../config/constants.js';

/**
 * 그래프 관리자 클래스
 */
export class GraphManager {
  constructor() {
    this.network = null;
    this.visNodes = null;
    this.visEdges = null;
    this.typeMeta = NODE_TYPE_META;
    /** 안정화 완료 시 콜백 (첫 화면 포커스 등, 협업용) */
    this._onStabilizedCallback = null;
  }

  /**
   * 그래프 초기화
   * @param {HTMLElement} container - 컨테이너 요소
   * @param {Array} rawNodes - 원본 노드 데이터
   * @param {Array} rawLinks - 원본 링크 데이터
   */
  async initialize(container, rawNodes, rawLinks) {
    return safeExecute(async () => {
      stateManager.setState('graph.loading', true);
      
      this.rawNodes = rawNodes || [];
      this.rawLinks = rawLinks || [];
      
      await this.buildGraph(container);
      
      stateManager.setState('graph.loading', false);
      announceToScreenReader('그래프가 로드되었습니다.');
    }, '그래프 초기화 중 오류가 발생했습니다.', ErrorType.RENDER);
  }

  /**
   * 그래프 빌드
   * @param {HTMLElement} container - 컨테이너 요소
   * @param {{ fitAfterStabilization?: boolean }} [options] - fitAfterStabilization: true면 안정화 완료 후 fit (필터 적용 시 뭉친 화면 완화)
   */
  async buildGraph(container, options = {}) {
    const filters = stateManager.getState('filters');
    
    // 필터가 비어있거나 설정되지 않았으면 모든 노드 표시
    // (초기 상태에서는 모든 노드를 표시해야 함)
    const fNodes = (filters && filters.size > 0)
      ? this.rawNodes.filter(n => filters.has(n.type))
      : this.rawNodes;
    
    const fIds = new Set(fNodes.map(n => n.id));
    const fLinks = this.rawLinks.filter(l => 
      fIds.has(l.source) && fIds.has(l.target)
    );
    
    // 디버깅: 필터링 결과 로깅
    console.log(`[GraphManager] 빌드: 전체 노드 ${this.rawNodes.length}개, 필터링 후 ${fNodes.length}개`);
    console.log(`[GraphManager] 필터 상태:`, filters);

    const nodes = fNodes.map(n => this.toVisNode(n));
    const edges = fLinks.map((l, i) => this.toVisEdge(l, i));

    // 통계 업데이트
    stateManager.setState('graph.nodes', nodes);
    stateManager.setState('graph.edges', edges);

    if (this.network) {
      this.visNodes.clear();
      this.visEdges.clear();
      this.visNodes.add(nodes);
      this.visEdges.add(edges);
      this.network.setOptions({ physics: true });
      this.network.setData({ nodes: this.visNodes, edges: this.visEdges });
      // 필터 등 업데이트 시: 안정화 완료 후 fit 하면 레이아웃 뭉침이 보이지 않음 (CTO: UX)
      if (options.fitAfterStabilization) {
        this._fitAfterStabilization = true;
      } else {
        this.network.fit({
          animation: { duration: 600, easingFunction: 'easeInOutQuad' }
        });
      }
      // 선택 동기화: 현재 표시 노드에 선택이 있으면 vis에 반영, 없으면 선택 해제 (CTO: 그래프-패널 일치)
      const sel = stateManager.getState('selectedNode');
      const selId = sel?.id != null ? String(sel.id) : null;
      const inGraph = selId && (fIds.has(selId) || fIds.has(sel.id));
      if (inGraph) {
        this.network.selectNodes([selId]);
        this.highlightNeighbors(selId, null);
      } else if (selId) {
        stateManager.setState('selectedNode', null);
      }
      return;
    }

    // vis.js는 전역 네임스페이스로 로드됨
    if (typeof vis === 'undefined') {
      throw new Error('vis.js가 로드되지 않았습니다.');
    }
    
    this.visNodes = new vis.DataSet(nodes);
    this.visEdges = new vis.DataSet(edges);

    this.network = new vis.Network(
      container,
      { nodes: this.visNodes, edges: this.visEdges },
      this.getNetworkOptions()
    );

    this.setupEventHandlers();
    this.setupStabilizationAndResize(container);
    stateManager.setState('graph.network', this.network);
  }

  /**
   * vis.js 노드 변환
   * @param {Object} node - 원본 노드
   * @returns {Object} vis.js 노드
   */
  toVisNode(node) {
    if (!node || !node.id) {
      throw new Error('Invalid node: missing id');
    }

    // 표시용: displayType(institution/major) 우선, 없으면 Neo4j 라벨 기반
    const displayKey = node.type || node.label || NODE_LABELS.COMPANY;
    const meta = this.typeMeta[displayKey] || this.typeMeta[node.label] || this.typeMeta[NODE_LABELS.COMPANY] || this.typeMeta.company;
    const color = meta.color;

    // 전체 이름만 표시 (이름 앞 2글자 미표시 요구사항)
    const fullName = node.displayName || node.id;
    const label = this.escapeHtml(fullName);

    return {
      id: node.id,
      label,
      title: fullName,
      size: node.size || 16,
      shape: 'dot',
      color: {
        background: this.hexAlpha(color, 0.18),
        border: color,
        highlight: { background: this.hexAlpha(color, 0.38), border: ACCENT_HIGHLIGHT },
        hover: { background: this.hexAlpha(color, 0.28), border: color }
      },
      font: {
        color: '#1c1a17',
        size: 11,
        face: 'Noto Sans KR, sans-serif'
      },
      borderWidth: 2,
      borderWidthSelected: 3,
      _raw: node
    };
  }

  /**
   * vis.js 엣지 변환
   * @param {Object} link - 원본 링크
   * @param {number} index - 인덱스
   * @returns {Object} vis.js 엣지
   */
  toVisEdge(link, index) {
    if (!link || !link.source || !link.target) {
      throw new Error('Invalid link: missing source or target');
    }

    return {
      id: index,
      from: link.source,
      to: link.target,
      label: link.pct != null ? `${link.pct}%` : '',
      arrows: { to: { enabled: true, scaleFactor: 0.6 } },
      color: { 
        color: '#8a8580', 
        highlight: ACCENT_HIGHLIGHT, 
        hover: ACCENT_HIGHLIGHT, 
        opacity: 0.85 
      },
      font: { 
        color: '#5a5349', 
        size: 12, 
        align: 'middle', 
        face: 'IBM Plex Mono, monospace' 
      },
      width: 1.5,
      smooth: { type: 'curvedCW', roundness: 0.1 },
      _pct: link.pct
    };
  }

  /**
   * 네트워크 옵션 가져오기
   * @returns {Object} vis.js 옵션
   */
  getNetworkOptions() {
    return {
      nodes: {
        shape: 'dot',
        scaling: { min: 10, max: 35 },
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,.5)',
          size: 10,
          x: 2,
          y: 2
        }
      },
      edges: {
        smooth: { type: 'curvedCW', roundness: 0.12 },
        selectionWidth: 2
      },
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -60,
          centralGravity: 0.005,
          springLength: 150,
          springConstant: 0.04,
          damping: 0.6,
          avoidOverlap: 0.6
        },
        stabilization: {
          enabled: true,
          iterations: 100,  // 300 → 100 (CTO: 성능·UX 균형, 렌더링 시간 5-15초 → 2-5초로 단축)
          updateInterval: 50,  // 25 → 50ms (CTO: 렌더링 부하 감소, 확장성)
          fit: true
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 0,
        hideEdgesOnDrag: true,
        navigationButtons: false,
        zoomView: true,
        dragView: true
        // zoomMin/zoomMax: vis-network 표준 interaction 옵션이 아니어서 제거 (호환성, CTO: 콘솔 에러 방지)
      }
    };
  }

  /**
   * 안정화 후 physics 비활성화 + 컨테이너 리사이즈 시 캔버스 동기화 (CTO: 마우스/클릭/스크롤 싱크)
   * - physics가 계속 켜져 있으면 노드가 미세하게 움직여 클릭/호버 위치가 어긋남.
   * - 리사이즈 시 redraw로 캔버스와 뷰포트 일치.
   */
  setupStabilizationAndResize(container) {
    if (!this.network || !container) return;
    this.network.on('stabilizationIterationsDone', () => {
      this.network.setOptions({ physics: false });
      if (this._fitAfterStabilization) {
        this._fitAfterStabilization = false;
        this.network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
      }
      this._onStabilizedCallback?.();
    });
    const resizeObserver = new ResizeObserver(() => {
      if (this.network) this.network.redraw();
    });
    resizeObserver.observe(container);
    this._resizeObserver = resizeObserver;
    const graphArea = container.closest('.graph-area');
    if (graphArea && !graphArea.dataset.wheelBound) {
      graphArea.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
      graphArea.dataset.wheelBound = '1';
    }
    // CTO 크리티컬: 드래그 시 그래프만 팬되도록, 문서/상위 스크롤이 같이 동작하지 않게 (마우스 드래그와 그래프 따로 놀음 방지)
    if (container && !container.dataset.dragSyncBound) {
      const preventDragDefault = (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'TEXTAREA') return;
        e.preventDefault();
      };
      container.addEventListener('mousedown', preventDragDefault, { capture: true });
      container.addEventListener('touchstart', preventDragDefault, { capture: true, passive: false });
      container.dataset.dragSyncBound = '1';
    }
  }

  /**
   * 이벤트 핸들러 설정
   */
  setupEventHandlers() {
    this.network.on('hoverNode', (params) => {
      const node = this.visNodes.get(params.node);
      if (node) {
        this.onNodeHover(params.event, node._raw);
      }
    });

    this.network.on('blurNode', () => {
      this.onNodeBlur();
    });

    this.network.on('click', (params) => {
      if (params.nodes.length) {
        const node = this.visNodes.get(params.nodes[0]);
        if (node) {
          this.onNodeClick(params.nodes[0], node._raw);
        }
      } else {
        this.onCanvasClick();
      }
    });

    this.network.on('hoverEdge', (params) => {
      this.visEdges.update({
        id: params.edge,
        font: { color: ACCENT_HIGHLIGHT }
      });
    });

    this.network.on('blurEdge', (params) => {
      this.visEdges.update({
        id: params.edge,
        font: { color: '#5a5349' }
      });
    });
  }

  /**
   * 노드 호버 핸들러
   * @param {Event} event - 이벤트
   * @param {Object} rawNode - 원본 노드
   */
  onNodeHover(event, rawNode) {
    // 외부에서 구현
  }

  /**
   * 노드 블러 핸들러
   */
  onNodeBlur() {
    // 외부에서 구현
  }

  /**
   * 노드 클릭 핸들러
   * 선택 노드와 연결 이웃을 화면에 맞게 확대·포커스하고 하이라이트한다.
   * @param {string} nodeId - 노드 ID
   * @param {Object} rawNode - 원본 노드
   */
  onNodeClick(nodeId, rawNode) {
    this.focusNode(nodeId);
    announceToScreenReader(`${rawNode.id} 노드가 선택되었습니다.`);
  }

  /**
   * 캔버스 클릭 핸들러
   */
  onCanvasClick() {
    this.resetHighlight();
    stateManager.setState('selectedNode', null);
  }

  /**
   * 이웃 노드 하이라이트
   * @param {string} nodeId - 노드 ID
   * @param {string[]} [optionalConnectedIds] - API(노드 상세)에서 받은 연결 노드 ID 목록. 있으면 이걸 사용(단일 소스), 없으면 vis 내부 그래프 사용.
   */
  highlightNeighbors(nodeId, optionalConnectedIds = null) {
    const connectedNodes = new Set(
      optionalConnectedIds != null
        ? [nodeId, ...optionalConnectedIds]
        : [nodeId, ...(this.network.getConnectedNodes(nodeId) || [])]
    );
    const connectedEdges = optionalConnectedIds != null
      ? new Set((this.visEdges.get() || []).filter(e => connectedNodes.has(e.from) && connectedNodes.has(e.to)).map(e => e.id))
      : new Set(this.network.getConnectedEdges(nodeId));

    this.visNodes.get().forEach(n => {
      const meta = this.typeMeta[n._raw.type];
      const color = meta.color;
      const isConnected = connectedNodes.has(n.id);
      
      this.visNodes.update({
        id: n.id,
        opacity: isConnected ? 1 : 0.12,
        color: {
          background: this.hexAlpha(color, isConnected ? 0.25 : 0.04),
          border: isConnected ? color : '#2a2d3e'
        }
      });
    });

    this.visEdges.get().forEach(e => {
      const isConnected = connectedEdges.has(e.id);
      this.visEdges.update({
        id: e.id,
        color: {
          color: isConnected ? ACCENT_HIGHLIGHT : '#8a8580',
          opacity: isConnected ? 1 : 0.15
        },
        width: isConnected ? 2.5 : 1
      });
    });
  }

  /**
   * 하이라이트 리셋
   */
  resetHighlight() {
    this.visNodes.get().forEach(n => {
      const meta = this.typeMeta[n._raw.type];
      const color = meta.color;
      
      this.visNodes.update({
        id: n.id,
        opacity: 1,
        color: {
          background: this.hexAlpha(color, 0.18),
          border: color
        }
      });
    });

    this.visEdges.get().forEach(e => {
      this.visEdges.update({
        id: e.id,
        color: { color: '#8a8580', opacity: 0.85 },
        width: 1.5
      });
    });
  }

  /** 노드 포커스 시 목표 줌 배율 (moveTo 사용 시, 협업용 상수) */
  static FOCUS_ZOOM_SCALE = 1.25;

  /**
   * 노드 포커스: 클릭한 노드를 화면 중앙에 맞춰 확대
   * (vis 4.x 호환: getPosition + moveTo 우선, fit(nodes)는 지원 시 보조)
   * @param {string|number} nodeId - 노드 ID
   * @param {string[]} [optionalConnectedIds] - API에서 받은 연결 노드 ID. 있으면 하이라이트에 사용 (vis 마이그레이션).
   */
  focusNode(nodeId, optionalConnectedIds = null) {
    if (!this.network) return;
    const id = nodeId != null ? String(nodeId) : null;
    if (!id) return;

    const node = this.visNodes.get(id) || this.visNodes.get(nodeId);
    if (!node) return;

    const resolvedId = node.id;
    this.network.selectNodes([resolvedId]);
    stateManager.setState('selectedNode', node._raw);

    const animation = { duration: 400, easingFunction: 'easeInOutQuad' };

    // 하이라이트·줌을 다음 프레임으로 미뤄 선택 반영 후 실행 (CTO: 노드 선택 시 멈춤 완화)
    const runHighlightAndFocus = () => {
      if (!this.network) return;
      this.highlightNeighbors(resolvedId, optionalConnectedIds);
      const pos = typeof this.network.getPosition === 'function'
        ? this.network.getPosition(resolvedId)
        : null;
      if (pos && (pos.x != null || pos.y != null)) {
        this.network.moveTo({
          position: pos,
          scale: GraphManager.FOCUS_ZOOM_SCALE,
          animation
        });
        return;
      }
      const connectedIds = this.network.getConnectedNodes(resolvedId) || [];
      const fitNodeIds = [resolvedId, ...connectedIds];
      try {
        if (fitNodeIds.length > 0 && typeof this.network.fit === 'function') {
          this.network.fit({ nodes: fitNodeIds, animation });
        }
      } catch (_) {
        // fit 미지원/실패 시 무시 (moveTo 이미 시도됨)
      }
    };

    requestAnimationFrame(runHighlightAndFocus);
  }

  /**
   * 줌 인
   */
  zoomIn() {
    if (!this.network) return;
    this.network.moveTo({
      scale: this.network.getScale() * 1.3,
      animation: {
        duration: 300,
        easingFunction: 'easeInOutQuad'
      }
    });
  }

  /**
   * 줌 아웃
   */
  zoomOut() {
    if (!this.network) return;
    this.network.moveTo({
      scale: this.network.getScale() * 0.77,
      animation: {
        duration: 300,
        easingFunction: 'easeInOutQuad'
      }
    });
  }

  /**
   * 전체 보기
   */
  zoomFit() {
    if (!this.network) return;
    this.network.fit({
      animation: {
        duration: 500,
        easingFunction: 'easeInOutQuad'
      }
    });
  }

  /**
   * 지정 노드와 그 이웃에 뷰 맞추기 (NetworkX CTO: "어디를 봐야 할지" 제시, 해당 구역이 커져 클릭 용이)
   * @param {string} nodeId - 기준 노드 ID
   */
  fitToNodeAndNeighbors(nodeId) {
    if (!this.network) return;
    const connected = this.network.getConnectedNodes(nodeId) || [];
    const nodeIds = [nodeId, ...connected];
    if (nodeIds.length === 0) return;
    this.network.fit({
      nodes: nodeIds,
      animation: { duration: 600, easingFunction: 'easeInOutQuad' }
    });
  }

  /**
   * 안정화 완료 시 호출할 콜백 등록 (첫 화면 포커스 등)
   * @param {function} fn - 콜백 (인자 없음)
   */
  setOnStabilized(fn) {
    this._onStabilizedCallback = typeof fn === 'function' ? fn : null;
  }

  /**
   * HTML 라벨용 이스케이프 (XSS 방지)
   * @param {string} text - 원문
   * @returns {string} 이스케이프된 문자열
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 색상 알파값 적용
   * @param {string} hex - 헥스 색상
   * @param {number} alpha - 알파값
   * @returns {string} RGBA 색상
   */
  hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /**
   * 정리
   */
  destroy() {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }
    this.visNodes = null;
    this.visEdges = null;
  }
}
