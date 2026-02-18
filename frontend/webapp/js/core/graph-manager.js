/**
 * 그래프 관리 클래스
 * @module core/graph-manager
 */

import { stateManager } from './state-manager.js';
import { safeExecute, ErrorType } from '../utils/error-handler.js';
import { announceToScreenReader } from '../utils/accessibility.js';

/**
 * 그래프 관리자 클래스
 */
export class GraphManager {
  constructor() {
    this.network = null;
    this.visNodes = null;
    this.visEdges = null;
    this.typeMeta = {
      company: { label: '회사', color: '#f97316' },
      person: { label: '개인주주', color: '#ef4444' },
      major: { label: '최대주주', color: '#f59e0b' },
      institution: { label: '기관', color: '#6366f1' }
    };
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
   */
  async buildGraph(container) {
    const filters = stateManager.getState('filters');
    const fNodes = this.rawNodes.filter(n => filters.has(n.type));
    const fIds = new Set(fNodes.map(n => n.id));
    const fLinks = this.rawLinks.filter(l => 
      fIds.has(l.source) && fIds.has(l.target)
    );

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
      this.network.setData({ nodes: this.visNodes, edges: this.visEdges });
      this.network.fit({ 
        animation: { duration: 600, easingFunction: 'easeInOutQuad' } 
      });
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

    const meta = this.typeMeta[node.type] || this.typeMeta.company;
    const color = meta.color;

    return {
      id: node.id,
      label: node.id.length > 8 ? node.id.slice(0, 7) + '…' : node.id,
      size: node.size || 16,
      shape: 'dot',
      color: {
        background: this.hexAlpha(color, 0.18),
        border: color,
        highlight: { background: this.hexAlpha(color, 0.38), border: '#fff' },
        hover: { background: this.hexAlpha(color, 0.28), border: color }
      },
      font: { 
        color: '#e8eaf0', 
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
        color: '#3a3d52', 
        highlight: '#d85604', 
        hover: '#d85604', 
        opacity: 0.8 
      },
      font: { 
        color: '#7a7f99', 
        size: 10, 
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
          iterations: 300,
          updateInterval: 25,
          fit: true
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 0,
        hideEdgesOnDrag: true,
        navigationButtons: false
      }
    };
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
        font: { color: '#d85604' }
      });
    });

    this.network.on('blurEdge', (params) => {
      this.visEdges.update({
        id: params.edge,
        font: { color: '#7a7f99' }
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
   * @param {string} nodeId - 노드 ID
   * @param {Object} rawNode - 원본 노드
   */
  onNodeClick(nodeId, rawNode) {
    this.highlightNeighbors(nodeId);
    stateManager.setState('selectedNode', rawNode);
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
   */
  highlightNeighbors(nodeId) {
    const connectedNodes = new Set([
      nodeId,
      ...this.network.getConnectedNodes(nodeId)
    ]);
    const connectedEdges = new Set(this.network.getConnectedEdges(nodeId));

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
          color: isConnected ? '#d85604' : '#1a1c27',
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
        color: { color: '#3a3d52', opacity: 0.8 },
        width: 1.5
      });
    });
  }

  /**
   * 노드 포커스
   * @param {string} nodeId - 노드 ID
   */
  focusNode(nodeId) {
    if (!this.network) return;
    
    const node = this.visNodes.get(nodeId);
    if (!node) return;

    this.network.selectNodes([nodeId]);
    this.network.focus(nodeId, {
      scale: 1.3,
      animation: {
        duration: 400,
        easingFunction: 'easeInOutQuad'
      }
    });
    
    this.highlightNeighbors(nodeId);
    stateManager.setState('selectedNode', node._raw);
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
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }
    this.visNodes = null;
    this.visEdges = null;
  }
}
