"""
NetworkX 기반 그래프 분석 모듈 (CTO: 확장성/유지보수성/협업)

- Neo4j 조회 결과(GraphData)만 입력으로 사용. DB 계층과 무관.
- 인메모리 분석만 수행. 기존 그래프 API와 충돌 없이 추가 전용.
"""
from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional, Tuple

from .models import GraphData, GraphNode, GraphEdge

logger = logging.getLogger(__name__)

try:
    import networkx as nx
    _NX_AVAILABLE = True
except ImportError:
    _NX_AVAILABLE = False
    nx = None

# pagerank_scipy 사용 가능 여부 (scipy 의존성, NetworkX 전문가 CTO: 성능 최적화)
try:
    from networkx.algorithms.link_analysis.pagerank_alg import pagerank_scipy
    _PAGERANK_SCIPY_AVAILABLE = True
except ImportError:
    _PAGERANK_SCIPY_AVAILABLE = False
    pagerank_scipy = None


# 분석 시 노드/엣지 상한 (과도한 CPU 방지, 확장 시 조정)
MAX_NODES_FOR_HEAVY_ANALYSIS = 500
MAX_EDGES_FOR_HEAVY_ANALYSIS = 2000
MAX_NODES_FOR_PAGERANK = 500  # pagerank도 상한 적용 (NetworkX 전문가 CTO: 성능·확장성)

# 첫 화면 추천 노드: 이웃 라벨이 이 수 이상인 노드만 "다양한 연결" 후보 (CTO: 상수로 확장성)
MIN_DIVERSE_NEIGHBOR_LABELS = 2


def _graph_data_to_nx(graph_data: GraphData, use_edge_weight: bool = True) -> "nx.DiGraph":
    """
    GraphData → NetworkX DiGraph.
    use_edge_weight: True면 edge.properties.stockRatio/pct 를 weight로 사용.
    """
    if not _NX_AVAILABLE:
        raise RuntimeError("networkx is not installed")

    G = nx.DiGraph()
    for node in graph_data.nodes:
        G.add_node(node.id, label=node.label, **node.properties)
    for edge in graph_data.edges:
        weight = None
        if use_edge_weight and edge.properties:
            weight = edge.properties.get("stockRatio") or edge.properties.get("pct")
            if weight is not None and not isinstance(weight, (int, float)):
                weight = None
        if weight is not None:
            G.add_edge(edge.source, edge.target, weight=float(weight), label=edge.label)
        else:
            G.add_edge(edge.source, edge.target, label=edge.label)
    return G


def _to_serializable(value: Any) -> Any:
    """numpy 등 비직렬화 가능 값을 float 등으로 변환."""
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, (int, float)):
        return float(value) if isinstance(value, (int, float)) else value
    return value


def _neighbor_label_diversity(G: "nx.DiGraph", u: Any) -> int:
    """
    노드 u의 이웃(진입+진출)에 등장하는 서로 다른 라벨 개수.
    라벨은 G.nodes[v].get("label") 또는 displayType 등으로 확장 가능 (협업: 단일 소스).
    최적화: list() 대신 직접 이터레이터 사용 (NetworkX 전문가 CTO: 메모리·성능).
    """
    labels = set()
    # successors와 predecessors를 직접 이터레이터로 사용 (메모리 효율)
    for v in G.successors(u):
        lb = G.nodes[v].get("label") or G.nodes[v].get("displayType")
        if lb is not None:
            labels.add(str(lb))
    for v in G.predecessors(u):
        lb = G.nodes[v].get("label") or G.nodes[v].get("displayType")
        if lb is not None:
            labels.add(str(lb))
    return len(labels)


def compute_suggested_focus_node(
    G: "nx.DiGraph",
    degree_centrality: Dict[Any, float],
    pagerank: Dict[Any, float],
    *,
    min_diverse_labels: int = MIN_DIVERSE_NEIGHBOR_LABELS,
    prefer_metric: str = "degree_centrality",
) -> Optional[Tuple[str, str]]:
    """
    첫 화면용 추천 노드 1개 계산 (방안 D: 다양도 2단계 필터 + centrality).

    - 이웃 라벨이 min_diverse_labels개 이상인 노드만 후보로 두고,
      그중 prefer_metric(degree_centrality 또는 pagerank) 최대인 노드 반환.
    - 후보가 없으면 전체 노드에서 prefer_metric argmax로 fallback.

    Returns:
        (node_id_str, reason_str) 또는 None. reason: "diverse" | "fallback".
    """
    if not G:
        return None
    scores = degree_centrality if prefer_metric == "degree_centrality" else pagerank
    if not scores:
        scores = degree_centrality or pagerank
    if not scores:
        return None

    # 후보: 이웃 라벨이 min_diverse_labels개 이상인 노드 (그래프 DB 관점: 다양한 연결)
    # 최적화: 큰 그래프에서는 샘플링 (NetworkX 전문가 CTO: 성능·확장성)
    n_nodes = G.number_of_nodes()
    if n_nodes > 500:
        # 500 노드 초과 시 상위 centrality 노드만 후보로 (다양도 계산 비용 절감)
        top_nodes = sorted(G.nodes(), key=lambda u: scores.get(u, scores.get(str(u), 0)), reverse=True)[:200]
        diverse_candidates = [
            u for u in top_nodes
            if _neighbor_label_diversity(G, u) >= min_diverse_labels
        ]
    else:
        diverse_candidates = [
            u for u in G.nodes()
            if _neighbor_label_diversity(G, u) >= min_diverse_labels
        ]

    def best_node(nodes: List[Any]) -> Optional[str]:
        best_id, best_val = None, -1.0
        for u in nodes:
            v = scores.get(u)
            if v is None:
                v = scores.get(str(u))
            if v is not None and float(v) > best_val:
                best_val = float(v)
                best_id = u
        return str(best_id) if best_id is not None else None

    if diverse_candidates:
        node_id = best_node(diverse_candidates)
        if node_id is not None:
            return (node_id, "diverse")
    node_id = best_node(list(G.nodes()))
    return (node_id, "fallback") if node_id else None


def run_analysis(
    graph_data: GraphData,
    *,
    include_degree: bool = True,
    include_pagerank: bool = True,
    include_betweenness: bool = False,
    include_components: bool = True,
    use_edge_weight: bool = True,
) -> Dict[str, Any]:
    """
    GraphData에 대해 NetworkX 분석을 실행해 JSON 직렬화 가능한 지표를 반환.

    Args:
        graph_data: Neo4j에서 조회된 그래프 (서비스 계층 GraphData).
        include_degree: degree_centrality 포함 여부.
        include_pagerank: pagerank 포함 여부 (weight 사용 시 지분 비율 반영).
        include_betweenness: betweenness_centrality 포함 여부 (노드 많으면 비활성 권장).
        include_components: 연결요소 개수 및 최대 연결요소 크기 포함 여부.
        use_edge_weight: 엣지 가중치(stockRatio/pct) 사용 여부.

    Returns:
        {
          "available": true/false (networkx 설치 및 그래프 유효 시 true),
          "node_count": int,
          "edge_count": int,
          "degree_centrality": { "node_id": float, ... },
          "pagerank": { "node_id": float, ... },
          "betweenness_centrality": { ... } (옵션),
          "n_weakly_connected_components": int,
          "largest_component_size": int,
        }
    """
    result: Dict[str, Any] = {
        "available": False,
        "node_count": len(graph_data.nodes),
        "edge_count": len(graph_data.edges),
    }
    if not _NX_AVAILABLE:
        logger.warning("graph_analysis: networkx not installed, skipping analysis")
        return result
    if not graph_data.nodes and not graph_data.edges:
        result["available"] = True
        result["n_weakly_connected_components"] = 0
        result["largest_component_size"] = 0
        return result

    try:
        G = _graph_data_to_nx(graph_data, use_edge_weight=use_edge_weight)
    except Exception as e:
        logger.warning("graph_analysis: build graph failed: %s", e)
        return result

    result["available"] = True
    n_nodes = G.number_of_nodes()
    n_edges = G.number_of_edges()

    if include_degree:
        try:
            dc = nx.degree_centrality(G)
            result["degree_centrality"] = {n: _to_serializable(v) for n, v in dc.items()}
        except Exception as e:
            logger.debug("degree_centrality failed: %s", e)
            result["degree_centrality"] = {}

    if include_pagerank:
        try:
            # node_cap 기반 조건부 실행 (NetworkX 전문가 CTO: 확장성·성능)
            if n_nodes > MAX_NODES_FOR_PAGERANK:
                result["pagerank"] = {}
                result["pagerank_skipped"] = f"graph too large (node limit: {MAX_NODES_FOR_PAGERANK})"
            else:
                weight_key = "weight" if use_edge_weight and any(
                    d.get("weight") is not None for u, v, d in G.edges(data=True)
                ) else None
                # 그래프 크기별 파라미터 최적화 (NetworkX 전문가 CTO: 수렴 시간 단축)
                if n_nodes < 200:
                    max_iter, tol = 100, 1e-06  # 기본값 (작은 그래프)
                elif n_nodes < 500:
                    max_iter, tol = 50, 1e-05   # 중간 그래프 (빠른 수렴)
                else:
                    max_iter, tol = 30, 1e-04   # 대형 그래프 (최대한 빠른 수렴)
                # 대형 그래프는 scipy 사용 (5-10배 빠름, NetworkX 전문가 권장)
                if n_nodes >= 200 and _PAGERANK_SCIPY_AVAILABLE:
                    pr = pagerank_scipy(G, weight=weight_key, max_iter=max_iter, tol=tol)
                else:
                    pr = nx.pagerank(G, weight=weight_key, max_iter=max_iter, tol=tol)
                result["pagerank"] = {n: _to_serializable(v) for n, v in pr.items()}
        except Exception as e:
            logger.debug("pagerank failed: %s", e)
            result["pagerank"] = {}

    if include_betweenness and n_nodes <= MAX_NODES_FOR_HEAVY_ANALYSIS and n_edges <= MAX_EDGES_FOR_HEAVY_ANALYSIS:
        try:
            bc = nx.betweenness_centrality(G)
            result["betweenness_centrality"] = {n: _to_serializable(v) for n, v in bc.items()}
        except Exception as e:
            logger.debug("betweenness_centrality failed: %s", e)
            result["betweenness_centrality"] = {}
    elif include_betweenness:
        result["betweenness_centrality"] = {}
        result["betweenness_centrality_skipped"] = "graph too large (node/edge limit)"

    if include_components:
        try:
            wccs = list(nx.weakly_connected_components(G))
            result["n_weakly_connected_components"] = len(wccs)
            result["largest_component_size"] = max(len(c) for c in wccs) if wccs else 0
        except Exception as e:
            logger.debug("weakly_connected_components failed: %s", e)
            result["n_weakly_connected_components"] = 0
            result["largest_component_size"] = 0

    # 첫 화면 추천 노드 (방안 D+E: 다양도 후보 중 centrality 1등, 호환성: 기존 analysis 필드 유지)
    try:
        suggested = compute_suggested_focus_node(
            G,
            result.get("degree_centrality") or {},
            result.get("pagerank") or {},
            prefer_metric="degree_centrality",
        )
        if suggested:
            result["suggested_focus_node_id"], result["suggested_focus_reason"] = suggested
    except Exception as e:
        logger.debug("suggested_focus_node failed: %s", e)

    return result
