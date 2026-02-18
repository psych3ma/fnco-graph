"""Pydantic 모델 정의"""
from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class GraphNode(BaseModel):
    """그래프 노드 모델"""
    id: str
    label: str
    properties: Dict[str, Any] = {}


class GraphEdge(BaseModel):
    """그래프 엣지 모델"""
    id: Optional[str] = None
    source: str
    target: str
    label: str
    properties: Dict[str, Any] = {}


class GraphData(BaseModel):
    """그래프 데이터 모델"""
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class ChatMessage(BaseModel):
    """챗봇 메시지 모델"""
    message: str
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    """챗봇 응답 모델"""
    response: str
    graph_data: Optional[GraphData] = None
