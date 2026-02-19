/**
 * 메인 애플리케이션
 * @module app
 */

import { GraphManager } from './core/graph-manager.js';
import { PanelManager } from './core/panel-manager.js';
import { ChatManager } from './core/chat-manager.js';
import { stateManager } from './core/state-manager.js';
import { registerKeyboardShortcut } from './utils/accessibility.js';
import { safeExecute, ErrorType, showErrorToast, showSuccessToast } from './utils/error-handler.js';
import { apiClient } from './api-client.js';
import { loadingManager } from './core/loading-manager.js';
import {
  NODE_LABELS,
  RELATIONSHIP_TYPES,
  DEFAULT_RELATIONSHIP_TYPES,
  TYPE_TO_LABEL_MAP,
  LABEL_TO_TYPE_MAP,
  DEFAULT_FILTERS,
  NODE_TYPE_META,
  INITIAL_GRAPH_EDGE_LIMIT,
  INITIAL_GRAPH_NODE_CAP,
  API_CONFIG
} from './config/constants.js';

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
    /** 첫 화면 포커스(연결도 기준) 적용 여부. 세션당 1회만 적용 (NetworkX CTO: 어디를 볼지 제시) */
    this.appliedInitialFocus = false;
  }

  /**
   * 그래프 구조 단일 진입점 (CTO: 유지보수성/호환성/확장성/협업코드)
   * "어떤 노드/엣지를 그릴지"는 이 메서드로만 설정. App·state·GraphManager 항상 동기화.
   * @param {Array} nodes - 노드 배열
   * @param {Array} links - 링크 배열
   */
  setGraphData(nodes, links) {
    this.rawNodes = Array.isArray(nodes) ? nodes : [];
    this.rawLinks = Array.isArray(links) ? links : [];
    stateManager.setState('graph.rawNodes', this.rawNodes);
    stateManager.setState('graph.rawLinks', this.rawLinks);
    if (this.graphManager) {
      this.graphManager.rawNodes = this.rawNodes;
      this.graphManager.rawLinks = this.rawLinks;
    }
  }

  /**
   * 애플리케이션 초기화
   */
  async init() {
    try {
      // 디버깅: 초기화 시작 로그
      console.log('[App] 초기화 시작');
      console.log('[App] API Base URL:', window.API_BASE_URL || '기본값 사용');
      
      // 하이브리드 디자인 적용 (UX 전문가 CTO 관점)
      loadingManager.setVariant('unified');
      console.log('[App] 하이브리드 디자인 적용됨');
      
      // 로딩 표시
      loadingManager.show('애플리케이션 초기화 중…');
      
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
      
      loadingManager.updateMessage('그래프 초기화 중…');
      await this.graphManager.initialize(graphContainer, this.rawNodes, this.rawLinks);
      this.graphManager.setOnStabilized(() => this.applyInitialFocus());
      
      // 패널 초기화
      loadingManager.updateMessage('UI 구성 중…');
      const detailContainer = document.getElementById('detailTabBody');
      const chatContainer = document.getElementById('chatTabBody');
      this.panelManager.initialize(detailContainer, chatContainer);
      
      // 챗 초기화
      this.chatManager.initialize();
      
      // 이벤트 바인딩
      this.bindEvents();
      
      // 키보드 단축키 등록
      this.registerShortcuts();
      
      // 로딩 완료: 첫 페인트 후 숨겨서 "빈 화면 → 그래프" 깜빡임 방지 (UX)
      loadingManager.hideAfterPaint();
      
      // 전역 접근
      window.app = this;
      window.graphManager = this.graphManager;
      window.panelManager = this.panelManager;
      window.chatManager = this.chatManager;
      
      console.log('[App] 초기화 완료');
    } catch (error) {
      console.error('[App] 초기화 실패:', error);
      loadingManager.showError('초기화 중 오류가 발생했습니다.');
      showErrorToast('애플리케이션 초기화 중 오류가 발생했습니다.', ErrorType.UNKNOWN);
    }
  }

  /**
   * 데이터 로드 (Neo4j API에서 실제 데이터 가져오기)
   */
  async loadData() {
    try {
      // 단계만 표시 (unified: 프로그레스바 제거, 실제 진행은 단계로)
      loadingManager.setSteps(0, 4);
      loadingManager.updateMessage('서버 연결 확인 중…');
      
      // 헬스 체크 (개선된 버전, 타임아웃 및 에러 핸들링 강화)
      console.log('[App] 헬스 체크 시작');
      let health;
      try {
        health = await apiClient.healthCheck();
        console.log('[App] 헬스 체크 성공:', health);
      } catch (error) {
        console.error('[App] 헬스 체크 실패:', error);
        console.error('[App] 에러 타입:', error.name);
        console.error('[App] 에러 메시지:', error.message);
        // 타임아웃 또는 네트워크 에러 처리
        if (error.isTimeout || error.isNetworkError) {
          const errorMessage = error.isTimeout 
            ? '백엔드 서버가 응답하지 않습니다. 서버가 실행 중인지 확인하세요.'
            : '백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.';
          
          loadingManager.showError(errorMessage);
          showErrorToast(errorMessage, ErrorType.NETWORK);
          console.error('[App] 헬스 체크 실패:', error);
          
          // 폴백: 빈 데이터 (단일 진입점으로 3곳 동기화, CTO: 그래프 구조 일관성)
          this.setGraphData([], []);
          return;
        }
        throw error;  // 기타 에러는 재throw
      }
      
      if (health.status !== 'healthy' || health.neo4j !== 'connected') {
        // 구체적인 에러 메시지 표시
        let errorMessage = 'Neo4j 연결이 되지 않았습니다.';
        
        if (health.error) {
          const errorType = health.error.type || health.neo4j;
          const suggestions = {
            'auth_failed': 'Neo4j 사용자명과 비밀번호를 확인하세요.',
            'network_error': 'Neo4j 서버가 실행 중인지 확인하세요.',
            'disconnected': '백엔드 서버를 확인하세요.',
            'connected_but_unstable': 'Neo4j 연결이 불안정합니다. 잠시 후 다시 시도하세요.'
          };
          
          errorMessage = health.error.message || errorMessage;
          const suggestion = health.error.suggestion || suggestions[errorType] || '';
          if (suggestion) {
            errorMessage += ` ${suggestion}`;
          }
        }
        
        loadingManager.showError(errorMessage);
        showErrorToast(errorMessage, ErrorType.NETWORK);
        
        // 연결 상태 정보 로깅 (디버깅용)
        console.error('[App] Neo4j 연결 실패:', health);
        
        // 폴백: 빈 데이터 (단일 진입점, CTO: 그래프 구조 일관성)
        this.setGraphData([], []);
        return;
      }

      loadingManager.setSteps(1, 4);
      loadingManager.updateMessage('그래프 데이터 불러오는 중…');

      // 그래프 데이터 조회 (설정 파일 기반)
      const filters = stateManager.getState('filters');
      const nodeLabels = Array.from(new Set(Array.from(filters).map(type => {
        // 실제 스키마 라벨 매핑 (설정 파일 기반)
        return TYPE_TO_LABEL_MAP[type] || type;
      })));  // 중복 제거 (CTO: 타임아웃 원인 분석 - 중복 node_labels 제거)

      // 실제 관계 타입 사용 (설정 파일 기반)
      const relationshipTypes = DEFAULT_RELATIONSHIP_TYPES;

      loadingManager.updateMessage('그래프 데이터 불러오는 중…', '데이터가 많으면 1분까지 걸릴 수 있습니다');
      
      // 타임아웃 및 에러 핸들링 강화 (무한 로딩 방지). 분석 API로 graph+analysis 한 번에 수신 (CTO: 단일 소스·확장성)
      // CTO: 단계별 타임아웃 전략 - 최소한의 데이터라도 빠르게 표시
      let graphData;
      let initialAnalysis = null;
      
      // 1단계: 최소 요청 먼저 시도 (타임아웃 방지)
      const minimalLimit = INITIAL_GRAPH_EDGE_LIMIT;
      const minimalNodeCap = INITIAL_GRAPH_NODE_CAP;
      console.log(`[App] 최소 요청 시작: limit=${minimalLimit}, node_cap=${minimalNodeCap}`);
      
      try {
        // 최소 요청으로 먼저 시도 (빠른 응답 보장)
        const minimalResult = await apiClient.getGraphData(
          minimalLimit,
          nodeLabels.length > 0 ? nodeLabels : null,
          relationshipTypes,
          0,
          minimalNodeCap,
          { timeout: API_CONFIG.MINIMAL_REQUEST_TIMEOUT }  // 최소 요청 전용 타임아웃 (의미 명확화)
        );
        
        // 최소한의 데이터라도 먼저 표시 (CTO: 사용자 경험 개선)
        if (minimalResult && minimalResult.nodes && minimalResult.nodes.length > 0) {
          console.log(`[App] 최소 요청 성공: ${minimalResult.nodes.length}개 노드`);
          graphData = minimalResult;
          initialAnalysis = null;
          
          // 최소 데이터로 먼저 표시 (백그라운드에서 추가 로드)
          this.setGraphData(
            minimalResult.nodes.map(n => ({
              id: n.id,
              label: n.label,
              type: n.properties?.displayType || this.mapLabelToType(n.label),
              size: this.calculateNodeSize(n),
              properties: n.properties,
              displayName: n.properties?.displayName || n.id
            })),
            (minimalResult.edges || []).map(e => ({
              source: e.source,
              target: e.target,
              pct: e.properties?.pct || e.properties?.stockRatio || null,
              type: e.label,
              properties: e.properties
            }))
          );
          
          if (this.graphManager?.network) {
            await this.graphManager.buildGraph(document.getElementById('visNetwork'));
          }
        }
        
        // 2단계: 전체 요청 시도 (백그라운드)
        try {
          const result = await apiClient.getGraphWithAnalysis(
            INITIAL_GRAPH_EDGE_LIMIT,
            nodeLabels.length > 0 ? nodeLabels : null,
            relationshipTypes,
            0,
            INITIAL_GRAPH_NODE_CAP
          );
          graphData = result.graph;
          initialAnalysis = result.analysis;
        } catch (fullError) {
          console.warn('[App] 전체 요청 실패, 최소 데이터 유지:', fullError);
          // 최소 데이터는 이미 표시됨
        }
      } catch (error) {
        // 타임아웃 에러 처리: 분석 없이 그래프만 재요청 (CTO: 확장성·UX - 빈 화면 대신 그래프라도 표시)
        if (error.isTimeout) {
          console.warn('[App] 그래프+분석 타임아웃, 그래프만 재요청:', error.message);
          showErrorToast('분석 요청이 지연되어 그래프만 불러옵니다.', ErrorType.NETWORK);
          try {
            // 폴백 요청: 더 작은 limit과 node_cap으로 재시도 (타임아웃 방지, 즉시 대응)
            const fallbackLimit = INITIAL_GRAPH_EDGE_LIMIT;
            const fallbackNodeCap = INITIAL_GRAPH_NODE_CAP;
            console.log(`[App] 폴백 요청: limit=${fallbackLimit}, node_cap=${fallbackNodeCap}`);
            const graphOnly = await apiClient.getGraphData(
              fallbackLimit,
              nodeLabels.length > 0 ? nodeLabels : null,
              relationshipTypes,
              0,
              fallbackNodeCap,
              { timeout: API_CONFIG.GRAPH_FALLBACK_TIMEOUT }  // 폴백 전용 타임아웃 (의미 명확화)
            );
            graphData = graphOnly;
            initialAnalysis = null;
          } catch (fallbackError) {
            const timeoutMessage = `요청 시간 초과: ${error.message}`;
            loadingManager.showError(timeoutMessage);
            showErrorToast(timeoutMessage, ErrorType.NETWORK);
            console.error('[App] 그래프 데이터 요청 타임아웃(폴백 실패):', fallbackError);
            this.setGraphData([], []);
            return;
          }
        } else if (error.isNetworkError) {
          const networkMessage = `네트워크 오류: ${error.message}`;
          loadingManager.showError(networkMessage);
          showErrorToast(networkMessage, ErrorType.NETWORK);
          console.error('[App] 그래프 데이터 요청 네트워크 오류:', error);
          this.setGraphData([], []);
          return;
        } else {
          throw error;
        }
      }
      if (!graphData) {
        this.setGraphData([], []);
        return;
      }

      loadingManager.setSteps(2, 4);
      loadingManager.updateMessage('그래프 구성 중…');
      
      // [필터 비활성화] 확장성/유지보수: 노드 1000개(API limit) 전부 내려받아 표시. 필요 시 아래 필터 재활성화.
      // --- (1) 회사만 / 2명 이상 주주인 회사만 표시
      // const isCompanyIncludedForInitialGraph = (n) => {
      //   if (n.label !== NODE_LABELS.COMPANY) return false;
      //   const v = n.properties?.totalInvestmentCount;
      //   if (v === undefined || v === null) return true;
      //   const str = String(v).trim();
      //   if (str === '' || str === '-') return true;
      //   const num = typeof v === 'number' ? v : parseInt(str, 10);
      //   if (Number.isNaN(num)) return true;
      //   return num >= 2;
      // };
      // 노드 캡·엣지 일관성은 서버(node_cap)에서 적용. 클라이언트는 변환만 (CTO: vis → 백엔드 마이그레이션)
      const graphNodes = graphData.nodes || [];
      const graphNodeIds = new Set(graphNodes.map(n => n.id));

      this.rawNodes = graphNodes.map(node => ({
        id: node.id,
        label: node.label,
        type: node.properties?.displayType || this.mapLabelToType(node.label),
        size: this.calculateNodeSize(node),
        properties: node.properties,
        displayName: node.properties?.displayName || node.id
      }));

      this.rawLinks = (graphData.edges || []).filter(edge =>
        graphNodeIds.has(edge.source) && graphNodeIds.has(edge.target)
      ).map(edge => ({
        source: edge.source,
        target: edge.target,
        pct: edge.properties?.pct || edge.properties?.stockRatio || edge.properties?.percentage || null,
        type: edge.label,  // 실제 관계 타입 (HOLDS_SHARES, HAS_COMPENSATION)
        properties: edge.properties
      }));

      // 그래프 구조 단일 진입점: App·state·GraphManager 동기화 (CTO: 유지보수성/호환성)
      this.setGraphData(this.rawNodes, this.rawLinks);
      stateManager.setState('graph.initialAnalysis', initialAnalysis);

      // 선택 노드가 새 그래프에 없으면 선택 해제 (필터/로드 후 불일치 방지, QA 문서 참고)
      const sel = stateManager.getState('selectedNode');
      if (sel?.id && !this.rawNodes.some(n => n.id === sel.id)) {
        stateManager.setState('selectedNode', null);
      }

      // 디버깅: 로드된 데이터 확인
      console.log(`[App] 데이터 로드 완료: 노드 ${this.rawNodes.length}개, 링크 ${this.rawLinks.length}개`);
      if (this.rawNodes.length > 0) {
        console.log('[App] 첫 번째 노드 샘플:', this.rawNodes[0]);
      }
      if (this.rawLinks.length > 0) {
        console.log('[App] 첫 번째 링크 샘플:', this.rawLinks[0]);
      }

      // 전체 그래프 로드 후 캔버스 갱신 (exitEgoGraph 등에서 loadData 호출 시 setGraphData가 이미 동기화함)
      if (this.graphManager?.network) {
        await this.graphManager.buildGraph(document.getElementById('visNetwork'));
      }

      loadingManager.setSteps(3, 4);
      loadingManager.updateMessage('마무리 중…');
      try {
        const stats = await apiClient.getStatistics();
        if (stats) {
          this.updateStatistics(stats);
        }
      } catch (error) {
        // 통계 업데이트 실패는 치명적이지 않으므로 로그만 남김
        console.warn('[App] 통계 업데이트 실패 (계속 진행):', error);
      }

      loadingManager.setSteps(4, 4);
      loadingManager.updateMessage('완료');
      // 단계 표시 후 스무스 전환: 짧은 유지 후 hideAfterPaint로 빈 화면 깜빡임 없이 그래프 노출
      setTimeout(() => {
        loadingManager.hideAfterPaint();
      }, 320);

    } catch (error) {
      // 최종 에러 핸들링 (타임아웃 및 네트워크 에러 구분)
      console.error('[App] 데이터 로드 실패:', error);
      
      let errorMessage = '데이터를 불러오는 중 오류가 발생했습니다.';
      
      // 타임아웃 에러 처리
      if (error.isTimeout) {
        errorMessage = `요청 시간 초과: ${error.message}`;
      } 
      // 네트워크 에러 처리
      else if (error.isNetworkError) {
        errorMessage = `네트워크 오류: ${error.message}`;
      }
      // 기타 에러
      else if (error.message) {
        errorMessage = `오류: ${error.message}`;
      }
      
      loadingManager.showError(errorMessage);
      showErrorToast(errorMessage, ErrorType.NETWORK);
      
      // 폴백: 빈 데이터 (단일 진입점, CTO: 그래프 구조 일관성)
      this.setGraphData([], []);
    }
  }

  /**
   * 선택 노드 기준 이고 그래프(지배구조 맵) 로드
   * API 호출 후 그래프 데이터 교체 및 빌드 (협업: panel-manager에서 호출)
   * @param {Object} node - 선택된 노드 { id, label, ... }
   */
  async loadEgoGraph(node) {
    if (!node?.id) return;
    const idProp = (node.label === 'Company' || node.properties?.labels?.includes?.('Company'))
      ? 'bizno' : (node.label === 'Person' || node.properties?.labels?.includes?.('Person')) ? 'personId' : null;
    try {
      const graphData = await apiClient.getEgoGraph(node.id, 1, 250, idProp || undefined);
      const graphNodes = graphData.nodes || [];
      const graphEdges = graphData.edges || [];
      this.rawNodes = graphNodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.properties?.displayType || this.mapLabelToType(n.label),
        size: this.calculateNodeSize(n),
        properties: n.properties,
        displayName: n.properties?.displayName || n.id
      }));
      const egoLinks = graphEdges.filter(edge =>
        graphNodes.some(n => n.id === edge.source) && graphNodes.some(n => n.id === edge.target)
      ).map(edge => ({
        source: edge.source,
        target: edge.target,
        pct: edge.properties?.pct ?? edge.properties?.stockRatio ?? edge.properties?.percentage ?? null,
        type: edge.label,
        properties: edge.properties || {}
      }));
      // 그래프 구조 단일 진입점: App·state·GraphManager 동기화 (CTO: 지배구조 맵 정상동작)
      this.setGraphData(this.rawNodes, egoLinks);
      if (this.graphManager?.network) {
        await this.graphManager.buildGraph(document.getElementById('visNetwork'));
      }
    } catch (e) {
      console.error('[App] Ego 그래프 로드 실패:', e);
    }
  }

  /**
   * 이고 그래프 종료 후 전체 그래프 복원
   */
  async exitEgoGraph() {
    document.getElementById('egoBanner')?.classList.remove('visible');
    await this.loadData();
  }

  /**
   * 라벨을 타입으로 매핑 (필터용)
   * @private
   */
  mapLabelToType(label) {
    // 설정 파일 기반 매핑
    return LABEL_TO_TYPE_MAP[label] || 'company';
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
        // 설정 파일 기반 매핑
        const mappedLabel = LABEL_TO_TYPE_MAP[label] || label.toLowerCase();
        const countEl = document.getElementById(`cnt-${mappedLabel}`);
        if (countEl) {
          countEl.textContent = `${count} 건`;
        }
      });
    }
  }

  /**
   * "시작 노드" 추천: API 분석(degree_centrality/pagerank) 우선, 없으면 클라이언트 degree (CTO: 단일 소스·fallback)
   * @returns {string|null} 노드 ID 또는 null
   */
  /**
   * 첫 화면 추천 노드: suggested_focus_node_id(다양한 연결) 우선 → degree_centrality/pagerank → 클라이언트 degree.
   */
  getSuggestedFocusNode() {
    const nodeIds = stateManager.getState('graph.rawNodes')?.map(n => n.id) || [];
    if (nodeIds.length === 0) return null;
    const idSet = new Set(nodeIds.map(id => String(id)));
    const analysis = stateManager.getState('graph.initialAnalysis');

    // 1) 백엔드 추천 노드 (다양도 2단계 필터 + centrality, CTO: 단일 소스)
    if (analysis && typeof analysis === 'object' && analysis.suggested_focus_node_id) {
      const sid = String(analysis.suggested_focus_node_id);
      if (idSet.has(sid)) return sid;
      const found = nodeIds.find(n => String(n) === sid);
      if (found != null) return found;
    }

    // 2) 분석 지표 argmax (degree_centrality → pagerank 순)
    if (analysis && typeof analysis === 'object') {
      const scores = analysis.degree_centrality ?? analysis.pagerank;
      if (scores && typeof scores === 'object') {
        let bestId = null;
        let bestVal = -Infinity;
        for (const id of nodeIds) {
          const v = scores[id] ?? scores[String(id)];
          if (v != null && (idSet.has(String(id)) || idSet.has(id)) && Number(v) > bestVal) {
            bestVal = Number(v);
            bestId = id;
          }
        }
        if (bestId != null) return String(bestId);
      }
    }

    // fallback: 클라이언트 degree
    const links = stateManager.getState('graph.rawLinks') || [];
    const degree = {};
    links.forEach(l => {
      degree[l.source] = (degree[l.source] || 0) + 1;
      degree[l.target] = (degree[l.target] || 0) + 1;
    });
    let maxDegree = 0;
    let suggested = null;
    for (const id of nodeIds) {
      const d = degree[id] || 0;
      if (d > maxDegree) {
        maxDegree = d;
        suggested = id;
      }
    }
    return suggested;
  }

  /**
   * 첫 화면 포커스: 연결이 많은 노드 + 이웃에 뷰 맞춤 (세션당 1회). 노드 크기는 그대로, 해당 구역이 커져 클릭 용이.
   */
  applyInitialFocus() {
    if (this.appliedInitialFocus || !this.graphManager) return;
    const nodeId = this.getSuggestedFocusNode();
    if (!nodeId) return;
    this.graphManager.fitToNodeAndNeighbors(nodeId);
    this.appliedInitialFocus = true;
    if (!sessionStorage.getItem('fnco-graph-initial-focus-hint')) {
      sessionStorage.setItem('fnco-graph-initial-focus-hint', '1');
      showSuccessToast('연결이 많은 노드로 이동했습니다. 노드를 클릭해 상세를 보세요.', 4500);
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

    // 필터 (클라이언트 전용: 재요청 없이 기존 rawNodes/rawLinks로 즉시 반영, CTO: 반응 속도·뭉친 화면 완화)
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
        
        // 필터만 변경: API 재호출 없이 기존 데이터로 그래프만 다시 빌드 (확장성: 초기 로드는 모든 타입 로드)
        if (this.graphManager) {
          await this.graphManager.buildGraph(document.getElementById('visNetwork'), { fitAfterStabilization: true });
        }
      });
    }

    // 줌 컨트롤 (스로틀로 연속 클릭 시 버벅거림 완화, 확장성: 상수만 조정)
    const ZOOM_THROTTLE_MS = 280;
    let lastZoomAt = 0;
    const throttleZoom = (fn) => () => {
      const now = Date.now();
      if (now - lastZoomAt < ZOOM_THROTTLE_MS) return;
      lastZoomAt = now;
      fn();
    };
    document.getElementById('zoomIn')?.addEventListener('click', throttleZoom(() => this.graphManager.zoomIn()));
    document.getElementById('zoomOut')?.addEventListener('click', throttleZoom(() => this.graphManager.zoomOut()));
    document.getElementById('zoomFit')?.addEventListener('click', throttleZoom(() => this.graphManager.zoomFit()));

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

      // (5) 검색어가 이름에 포함된 노드만 제안 (관련 없는 자동검색 제거)
      const qLower = q.toLowerCase();
      const relevantNodes = searchResults.nodes.filter(node => {
        const name = (node.properties?.displayName || node.properties?.companyName || node.properties?.stockName || node.id || '').toString().toLowerCase();
        return name.includes(qLower);
      });
      if (relevantNodes.length === 0) {
        suggestions.classList.remove('open');
        return;
      }

      // 실제 스키마 라벨 매핑 (설정 파일 기반)
      const labelToType = LABEL_TO_TYPE_MAP;
      
      // 타입 메타데이터 (설정 파일 기반)
      const typeMeta = NODE_TYPE_META;

      suggestions.innerHTML = relevantNodes.map(node => {
        const nodeLabel = node.label || 'Node';
        const nodeType = labelToType[nodeLabel] || 'node';
        const m = typeMeta[nodeType] || typeMeta.node;
        const displayLabel = node.properties?.displayName || node.properties?.companyName || node.properties?.stockName || node.id;
        const isNumericId = /^\d+$/.test(String(node.id));
        const suggestionText = isNumericId ? this.escapeHtml(displayLabel) : this.escapeHtml(node.id);
        return `
          <div class="suggestion-item" 
               data-id="${node.id}"
               role="option"
               tabindex="0"
               onclick="window.app?.selectSearchResult('${node.id}')"
               onkeydown="if(event.key==='Enter') window.app?.selectSearchResult('${node.id}')">
            <span class="suggestion-dot" style="background:${m.color}"></span>
            ${suggestionText} <span style="color:${m.color};font-size:11px;margin-left:4px">${m.label}</span>
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
  /**
   * 패널 접기/펼치기 (레퍼런스 서식: 토글 버튼 연동)
   */
  togglePanel() {
    const panel = document.getElementById('sidePanel');
    if (panel) panel.classList.toggle('collapsed');
  }

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
   * 로딩 숨기기 (deprecated: loadingManager 사용)
   * @deprecated Use loadingManager.hide() instead
   */
  hideLoading() {
    loadingManager.hide();
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
