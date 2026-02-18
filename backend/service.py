"""비즈니스 로직 및 챗봇 서비스"""
from typing import Dict, Any, Optional
from .database import db
from .models import GraphData, GraphNode, GraphEdge
import os
from openai import OpenAI

# OpenAI 클라이언트 초기화
openai_client = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def format_graph_data(records: list) -> GraphData:
    """Neo4j 쿼리 결과를 GraphData 형식으로 변환"""
    nodes = []
    edges = []
    node_ids = set()
    
    for record in records:
        # 노드 처리
        if 'n' in record:
            node = record['n']
            node_id = str(node.id)
            if node_id not in node_ids:
                nodes.append(GraphNode(
                    id=node_id,
                    label=list(node.labels)[0] if node.labels else "Node",
                    properties=dict(node)
                ))
                node_ids.add(node_id)
        
        if 'm' in record:
            node = record['m']
            node_id = str(node.id)
            if node_id not in node_ids:
                nodes.append(GraphNode(
                    id=node_id,
                    label=list(node.labels)[0] if node.labels else "Node",
                    properties=dict(node)
                ))
                node_ids.add(node_id)
        
        # 관계 처리
        if 'r' in record:
            rel = record['r']
            edges.append(GraphEdge(
                source=str(rel.start_node.id),
                target=str(rel.end_node.id),
                label=rel.type,
                properties=dict(rel)
            ))
    
    return GraphData(nodes=nodes, edges=edges)


def get_graph_data(limit: int = 100) -> GraphData:
    """그래프 데이터 조회"""
    records = db.get_graph_data(limit)
    if not records:
        return GraphData(nodes=[], edges=[])
    return format_graph_data(records)


def search_graph(search_term: str, limit: int = 50) -> GraphData:
    """그래프 검색"""
    nodes = db.search_nodes(search_term, limit)
    if not nodes:
        return GraphData(nodes=[], edges=[])
    
    # 검색된 노드와 연결된 관계 조회
    node_ids = [str(record['n'].id) for record in nodes]
    query = f"""
    MATCH (n)-[r]->(m)
    WHERE id(n) IN {node_ids} OR id(m) IN {node_ids}
    RETURN n, r, m
    LIMIT $limit
    """
    records = db.execute_query(query, {"limit": limit * 2})
    
    if not records:
        return format_graph_data(nodes)
    return format_graph_data(records)


def chat_with_graph(message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """그래프 컨텍스트를 활용한 챗봇 응답"""
    if not openai_client:
        return {
            "response": "OpenAI API 키가 설정되지 않았습니다. .env 파일에 OPENAI_API_KEY를 설정해주세요.",
            "graph_data": None
        }
    
    # 그래프 데이터 조회 (컨텍스트로 사용)
    graph_data = get_graph_data(limit=50)
    
    # 프롬프트 구성
    system_prompt = """당신은 그래프 데이터베이스 전문가입니다. 
사용자의 질문에 답변하고, 필요시 그래프 데이터를 활용하여 답변하세요."""
    
    user_prompt = f"""
사용자 질문: {message}

그래프 데이터 정보:
- 노드 수: {len(graph_data.nodes)}
- 관계 수: {len(graph_data.edges)}
- 노드 타입: {set(node.label for node in graph_data.nodes)}

위 정보를 참고하여 답변해주세요.
"""
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        
        return {
            "response": response.choices[0].message.content,
            "graph_data": graph_data if context and context.get("include_graph") else None
        }
    except Exception as e:
        return {
            "response": f"챗봇 응답 생성 중 오류가 발생했습니다: {str(e)}",
            "graph_data": None
        }
