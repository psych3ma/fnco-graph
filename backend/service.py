"""
비즈니스 로직 및 챗봇 서비스
Neo4j 데이터를 vis.js 형식으로 변환
실제 스키마에 맞춘 버전 (Company/Person/Stockholder)
"""
from typing import Dict, Any, Optional, List
from .database import db
from .models import GraphData, GraphNode, GraphEdge
import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

# OpenAI 클라이언트 초기화
openai_client = None
if os.getenv("OPENAI_API_KEY"):
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def extract_node_id(node: Any, node_data: Dict[str, Any]) -> str:
    """
    노드 ID 추출 (실제 스키마에 맞춘 버전)
    
    실제 스키마:
    - Company: bizno (고유 ID)
    - Person: personId (고유 ID)
    - Stockholder: Company 또는 Person의 ID 사용
    
    Args:
        node: Neo4j 노드 객체
        node_data: 노드 데이터 딕셔너리
    
    Returns:
        노드 ID 문자열
    """
    # 노드 속성 가져오기
    node_props = {}
    if isinstance(node, dict):
        node_props = node
    elif hasattr(node, '_properties'):
        node_props = dict(node._properties)
    else:
        node_props = node_data.get('n', {}) or node_data.get('m', {})
    
    # 라벨 확인
    labels = node_data.get('n_labels') or node_data.get('node_labels') or node_data.get('m_labels') or []
    
    # Company 노드: bizno 사용
    if 'Company' in labels:
        if 'bizno' in node_props:
            return str(node_props['bizno'])
        # fallback
        if 'companyName' in node_props:
            return str(node_props['companyName'])
    
    # Person 노드: personId 사용
    if 'Person' in labels:
        if 'personId' in node_props:
            return str(node_props['personId'])
        # fallback
        if 'stockName' in node_props:
            return str(node_props['stockName'])
    
    # 일반적인 속성 시도 (하위 호환성)
    for prop in ['id', 'bizno', 'personId', 'name', 'companyName', 'stockName', 'title']:
        if prop in node_props:
            return str(node_props[prop])
    
    # 내부 ID 사용 (fallback)
    if 'node_id' in node_data:
        return str(node_data['node_id'])
    
    # 최후의 수단: Neo4j 내부 ID
    return str(node.id) if hasattr(node, 'id') else str(node_data.get('internal_id', 'unknown'))


def extract_node_label(node_data: Dict[str, Any]) -> str:
    """
    노드 라벨 추출 (실제 스키마에 맞춘 버전)
    
    실제 라벨:
    - Company, Person, Stockholder, LegalEntity, Active, Closed, MajorShareholder 등
    
    Args:
        node_data: 노드 데이터 딕셔너리
    
    Returns:
        노드 라벨 (주요 라벨 우선)
    """
    labels = node_data.get('n_labels') or node_data.get('node_labels') or node_data.get('m_labels') or []
    
    if labels:
        # 주요 라벨 우선순위
        priority_labels = ['Company', 'Person', 'Stockholder', 'LegalEntity']
        for priority in priority_labels:
            if priority in labels:
                return priority
        return labels[0]
    
    # property에서 타입 찾기
    node_props = node_data.get('n', {}) or node_data.get('m', {})
    if 'shareholderType' in node_props:
        stype = node_props['shareholderType']
        if stype == 'PERSON':
            return 'Person'
        elif stype in ['CORPORATION', 'INSTITUTION']:
            return 'Company'
    
    return "Node"


def extract_node_display_name(node_props: Dict[str, Any], labels: List[str]) -> str:
    """
    노드 표시 이름 추출
    
    Args:
        node_props: 노드 속성
        labels: 노드 라벨 리스트
    
    Returns:
        표시할 이름
    """
    # Company: companyName
    if 'Company' in labels:
        return node_props.get('companyName', node_props.get('bizno', 'Unknown Company'))
    
    # Person: stockName
    if 'Person' in labels:
        return node_props.get('stockName', node_props.get('personId', 'Unknown Person'))
    
    # 일반적인 속성
    for prop in ['name', 'title', 'companyName', 'stockName']:
        if prop in node_props:
            return str(node_props[prop])
    
    return 'Unknown'


def extract_node_properties(node: Any, node_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    노드 속성 추출
    
    Args:
        node: Neo4j 노드 객체
        node_data: 노드 데이터 딕셔너리
    
    Returns:
        속성 딕셔너리
    """
    if isinstance(node, dict):
        return node
    elif hasattr(node, '_properties'):
        return dict(node._properties)
    else:
        return node_data.get('n', {}) or node_data.get('m', {})


def format_graph_data(records: List[Dict[str, Any]]) -> GraphData:
    """
    Neo4j 쿼리 결과를 GraphData 형식으로 변환 (실제 스키마에 맞춘 버전)
    
    Args:
        records: Neo4j 쿼리 결과 리스트
    
    Returns:
        GraphData 객체
    """
    nodes = []
    edges = []
    node_ids = set()
    
    for record in records:
        # 소스 노드 처리
        if 'n' in record:
            node = record['n']
            node_id = extract_node_id(node, record)
            
            if node_id not in node_ids:
                node_label = extract_node_label(record)
                node_props = extract_node_properties(node, record)
                labels = record.get('n_labels', [])
                
                nodes.append(GraphNode(
                    id=node_id,
                    label=node_label,
                    properties={
                        **node_props,
                        'displayName': extract_node_display_name(node_props, labels),
                        'labels': labels
                    }
                ))
                node_ids.add(node_id)
        
        # 타겟 노드 처리
        if 'm' in record:
            node = record['m']
            m_record = {
                'm': record.get('m', {}),
                'm_labels': record.get('m_labels', []),
                'node_id': record.get('m_node_id')
            }
            node_id = extract_node_id(node, m_record)
            
            if node_id not in node_ids:
                node_label = extract_node_label(m_record)
                node_props = extract_node_properties(node, {'m': record.get('m', {})})
                labels = record.get('m_labels', [])
                
                nodes.append(GraphNode(
                    id=node_id,
                    label=node_label,
                    properties={
                        **node_props,
                        'displayName': extract_node_display_name(node_props, labels),
                        'labels': labels
                    }
                ))
                node_ids.add(node_id)
        
        # 관계 처리
        if 'r' in record:
            rel = record['r']
            source_id = extract_node_id(record.get('n'), record)
            target_id = extract_node_id(record.get('m'), {
                'm': record.get('m', {}),
                'm_labels': record.get('m_labels', []),
                'node_id': record.get('m_node_id')
            })
            
            rel_type = record.get('rel_type') or (rel.type if hasattr(rel, 'type') else 'RELATED')
            rel_props = {}
            
            if hasattr(rel, '_properties'):
                rel_props = dict(rel._properties)
            elif isinstance(rel, dict):
                rel_props = rel
            
            # 관계 속성에 표시 이름 추가
            if 'stockRatio' in rel_props:
                rel_props['pct'] = rel_props['stockRatio']  # 호환성을 위해
            
            edges.append(GraphEdge(
                source=source_id,
                target=target_id,
                label=rel_type,
                properties=rel_props
            ))
    
    return GraphData(nodes=nodes, edges=edges)


def get_graph_data(
    limit: int = 100,
    node_labels: Optional[List[str]] = None,
    relationship_types: Optional[List[str]] = None
) -> GraphData:
    """
    그래프 데이터 조회 (실제 스키마에 맞춘 버전)
    
    Args:
        limit: 최대 반환 개수
        node_labels: 필터링할 노드 라벨 리스트
        relationship_types: 필터링할 관계 타입 리스트
    
    Returns:
        GraphData 객체
    """
    try:
        # 기본 관계 타입 설정
        if not relationship_types:
            relationship_types = ['HOLDS_SHARES', 'HAS_COMPENSATION']
        
        records = db.get_graph_data(limit, node_labels, relationship_types)
        if not records:
            logger.warning("그래프 데이터가 없습니다.")
            return GraphData(nodes=[], edges=[])
        return format_graph_data(records)
    except Exception as e:
        logger.error(f"그래프 데이터 조회 실패: {e}")
        return GraphData(nodes=[], edges=[])


def search_graph(
    search_term: str,
    limit: int = 50,
    search_properties: Optional[List[str]] = None
) -> GraphData:
    """
    그래프 검색 (실제 스키마에 맞춘 버전)
    
    실제 속성:
    - Company: companyName, companyNameNormalized
    - Person: stockName, stockNameNormalized
    
    Args:
        search_term: 검색어
        limit: 최대 반환 개수
        search_properties: 검색할 속성 리스트
    
    Returns:
        GraphData 객체
    """
    try:
        # 실제 스키마에 맞는 검색 속성
        if not search_properties:
            search_properties = ['companyName', 'companyNameNormalized', 'stockName', 'stockNameNormalized', 'bizno', 'personId']
        
        nodes = db.search_nodes(search_term, limit, search_properties)
        if not nodes:
            logger.info(f"검색 결과 없음: {search_term}")
            return GraphData(nodes=[], edges=[])
        
        # 검색된 노드 ID 추출
        node_ids = []
        for record in nodes:
            node_id = extract_node_id(record.get('n'), record)
            node_ids.append(node_id)
        
        # 검색된 노드와 연결된 관계 조회
        if node_ids:
            # 각 노드의 관계 조회 (실제 스키마에 맞게)
            all_edges = []
            for node_id in node_ids[:10]:  # 최대 10개 노드만
                # 라벨에 따라 적절한 ID 속성 사용
                relationships = db.get_node_relationships(
                    node_id,
                    id_property='bizno' if any('Company' in str(l) for l in record.get('node_labels', [])) else 'personId',
                    limit=20
                )
                if relationships:
                    all_edges.extend(relationships)
            
            # 중복 제거를 위해 edges도 포함
            if all_edges:
                return format_graph_data(all_edges)
        
        # 관계가 없으면 노드만 반환
        return format_graph_data(nodes)
    except Exception as e:
        logger.error(f"그래프 검색 실패: {e}")
        return GraphData(nodes=[], edges=[])


def get_node_detail(node_id: str, id_property: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    노드 상세 정보 조회 (실제 스키마에 맞춘 버전)
    
    Args:
        node_id: 노드 ID
        id_property: ID property 이름 (자동 감지)
    
    Returns:
        노드 상세 정보 딕셔너리
    """
    try:
        # ID property 자동 감지 시도
        if not id_property:
            # 먼저 bizno로 시도 (Company)
            node_data = db.get_node_by_id(node_id, 'bizno')
            if node_data:
                id_property = 'bizno'
            else:
                # personId로 시도 (Person)
                node_data = db.get_node_by_id(node_id, 'personId')
                if node_data:
                    id_property = 'personId'
                else:
                    return None
        else:
            node_data = db.get_node_by_id(node_id, id_property)
        
        if not node_data:
            return None
        
        # 관계 조회 (실제 관계 타입 사용)
        relationships = db.get_node_relationships(
            node_id,
            id_property=id_property,
            direction="both",
            limit=50
        )
        
        return {
            "node": node_data,
            "relationships": relationships or [],
            "id_property": id_property
        }
    except Exception as e:
        logger.error(f"노드 상세 정보 조회 실패: {e}")
        return None


def get_ego_graph(node_id: str, depth: int = 1, limit: int = 100) -> GraphData:
    """
    Ego 그래프 조회
    
    Args:
        node_id: 중심 노드 ID
        depth: 탐색 깊이
        limit: 최대 반환 개수
    
    Returns:
        GraphData 객체
    """
    try:
        records = db.get_ego_graph(node_id, depth=depth, limit=limit)
        if not records:
            return GraphData(nodes=[], edges=[])
        return format_graph_data(records)
    except Exception as e:
        logger.error(f"Ego 그래프 조회 실패: {e}")
        return GraphData(nodes=[], edges=[])


def get_statistics() -> Optional[Dict[str, Any]]:
    """
    그래프 통계 조회
    
    Returns:
        통계 딕셔너리
    """
    try:
        return db.get_statistics()
    except Exception as e:
        logger.error(f"통계 조회 실패: {e}")
        return None


def chat_with_graph(message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    그래프 컨텍스트를 활용한 챗봇 응답
    
    Args:
        message: 사용자 메시지
        context: 컨텍스트 정보 (선택 노드 등)
    
    Returns:
        챗봇 응답 딕셔너리
    """
    if not openai_client:
        return {
            "response": "OpenAI API 키가 설정되지 않았습니다. .env 파일에 OPENAI_API_KEY를 설정해주세요.",
            "graph_data": None
        }
    
    try:
        # 컨텍스트 노드가 있으면 해당 노드 정보 조회
        graph_context = ""
        if context and context.get("node_id"):
            node_detail = get_node_detail(context["node_id"])
            if node_detail:
                graph_context = f"\n선택된 노드: {context['node_id']}\n연결 수: {len(node_detail.get('relationships', []))}"
        
        # 그래프 통계 조회
        stats = get_statistics()
        if stats:
            graph_context += f"\n전체 노드 수: {stats.get('total_nodes', 0)}\n전체 관계 수: {stats.get('total_relationships', 0)}"
        
        # 프롬프트 구성
        system_prompt = """당신은 그래프 데이터베이스 전문가입니다. 
사용자의 질문에 답변하고, 필요시 Neo4j Cypher 쿼리를 제안하세요.
실제 스키마: Company(bizno), Person(personId), Stockholder, HOLDS_SHARES, HAS_COMPENSATION 관계를 사용합니다."""
        
        user_prompt = f"""
사용자 질문: {message}
{graph_context}

위 정보를 참고하여 답변해주세요. 필요시 Cypher 쿼리 예시를 제공하세요.
실제 스키마에 맞는 쿼리를 제안해주세요.
"""
        
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
            "graph_data": None
        }
    except Exception as e:
        logger.error(f"챗봇 응답 생성 실패: {e}")
        return {
            "response": f"챗봇 응답 생성 중 오류가 발생했습니다: {str(e)}",
            "graph_data": None
        }
