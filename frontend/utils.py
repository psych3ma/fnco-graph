"""유틸리티 함수"""
import streamlit as st
from typing import Dict, Any, List


def init_session_state():
    """세션 상태 초기화"""
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    if "graph_data" not in st.session_state:
        st.session_state.graph_data = {"nodes": [], "edges": []}


def format_node_for_vis(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """vis.js 형식으로 노드 변환"""
    formatted_nodes = []
    for node in nodes:
        formatted_node = {
            "id": node.get("id"),
            "label": node.get("label", "Node"),
            "title": str(node.get("properties", {})),
        }
        # 속성에서 색상이나 크기 정보 추출 가능
        if "properties" in node:
            props = node["properties"]
            if "color" in props:
                formatted_node["color"] = props["color"]
            if "size" in props:
                formatted_node["value"] = props["size"]
        formatted_nodes.append(formatted_node)
    return formatted_nodes


def format_edge_for_vis(edges: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """vis.js 형식으로 엣지 변환"""
    formatted_edges = []
    for edge in edges:
        formatted_edge = {
            "from": edge.get("source"),
            "to": edge.get("target"),
            "label": edge.get("label", ""),
            "title": str(edge.get("properties", {})),
        }
        formatted_edges.append(formatted_edge)
    return formatted_edges
