"""
비즈니스 로직 및 챗봇 서비스
Neo4j 데이터를 vis.js 형식으로 변환
실제 스키마에 맞춘 버전 (Company/Person/Stockholder)
CTO: 참조 서비스(ask_graph) 흐름 반영 — Cypher 생성·실행·QA·대화이력
"""
import time
import re
from typing import Dict, Any, Optional, List
from .database import db, Neo4jConnectionError
from .models import GraphData, GraphNode, GraphEdge
from .config import config, NodeLabel, RelationshipType, NodeProperty, RelationshipProperty
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

# AI 질문: 서버 측 대화 이력 (참조 서비스 호환, 최근 6턴=12메시지)
_chat_history: List[Dict[str, str]] = []
_MAX_CHAT_TURNS = 6

# OpenAI 클라이언트 초기화 (지연 초기화 - 협업 코드 고려)
# 모듈 레벨에서 초기화하면 httpx 버전 호환성 문제가 발생할 수 있으므로
# 함수 내에서 필요할 때 초기화하도록 변경
_openai_client = None
_openai_client_error = None

def get_openai_client():
    """
    OpenAI 클라이언트를 지연 초기화하여 반환 (협업 코드 고려)
    
    Returns:
        OpenAI 클라이언트 인스턴스 또는 None
    """
    global _openai_client, _openai_client_error
    
    # 이미 초기화 시도했고 에러가 있었으면 None 반환
    if _openai_client_error:
        return None
    
    # 이미 초기화되어 있으면 반환
    if _openai_client:
        return _openai_client
    
    # API 키가 없으면 None 반환
    if not config.OPENAI_API_KEY:
        return None
    
    try:
        # 지연 초기화: httpx 호환성 문제 방지
        _openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
        return _openai_client
    except TypeError as e:
        # httpx 버전 호환성 문제 처리
        logger.warning(f"OpenAI 클라이언트 초기화 실패 (버전 호환성 문제): {e}")
        logger.warning("httpx 버전을 업데이트하거나 OpenAI 라이브러리를 업그레이드하세요.")
        _openai_client_error = str(e)
        return None
    except Exception as e:
        logger.error(f"OpenAI 클라이언트 초기화 실패: {e}")
        _openai_client_error = str(e)
        return None


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
    
    # Company 노드: bizno 사용 (설정 파일 기반)
    if NodeLabel.COMPANY.value in labels:
        id_prop = config.NODE_ID_PROPERTIES.get(NodeLabel.COMPANY.value)
        if id_prop and id_prop in node_props:
            return str(node_props[id_prop])
        # fallback
        display_props = config.NODE_DISPLAY_NAME_PROPERTIES.get(NodeLabel.COMPANY.value, [])
        for prop in display_props:
            if prop in node_props:
                return str(node_props[prop])
    
    # Person 노드: personId 사용 (설정 파일 기반)
    if NodeLabel.PERSON.value in labels:
        id_prop = config.NODE_ID_PROPERTIES.get(NodeLabel.PERSON.value)
        if id_prop and id_prop in node_props:
            return str(node_props[id_prop])
        # fallback
        display_props = config.NODE_DISPLAY_NAME_PROPERTIES.get(NodeLabel.PERSON.value, [])
        for prop in display_props:
            if prop in node_props:
                return str(node_props[prop])
    
    # 일반적인 속성 시도 (하위 호환성)
    fallback_props = ['id', NodeProperty.BIZNO.value, NodeProperty.PERSON_ID.value, 
                      'name', NodeProperty.COMPANY_NAME.value, NodeProperty.STOCK_NAME.value, 'title']
    for prop in fallback_props:
        if prop in node_props:
            return str(node_props[prop])
    
    # 내부 ID 사용 (fallback)
    if 'node_id' in node_data:
        return str(node_data['node_id'])
    
    # 최후의 수단: Neo4j 내부 ID
    return str(node.id) if hasattr(node, 'id') else str(node_data.get('internal_id', 'unknown'))


def _serializable_dict(d: Dict[str, Any]) -> Dict[str, Any]:
    """딕셔너리 값을 JSON 직렬화 가능한 타입으로 변환 (Neo4j 타입 호환)."""
    if not d:
        return {}
    out = {}
    for k, v in (d.items() if isinstance(d, dict) else []):
        try:
            if v is None or isinstance(v, (str, int, float, bool)):
                out[k] = v
            elif isinstance(v, (list, tuple)):
                out[k] = [_serializable_value(x) for x in v]
            elif isinstance(v, dict):
                out[k] = _serializable_dict(v)
            else:
                out[k] = _serializable_value(v)
        except Exception:
            out[k] = str(v)
    return out


def _serializable_value(v: Any) -> Any:
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, (list, tuple)):
        return [_serializable_value(x) for x in v]
    if isinstance(v, dict):
        return _serializable_dict(v)
    return str(v)


def _normalize_labels(labels: Any) -> List[str]:
    """Neo4j labels() 결과를 JSON 직렬화 가능한 문자열 리스트로 변환."""
    if labels is None:
        return []
    if isinstance(labels, (list, tuple)):
        return [str(x) for x in labels]
    return [str(labels)]


def _display_type_for_filter(node_label: str, node_props: Dict[str, Any]) -> Optional[str]:
    """
    필터/레전드용 displayType. 기관(Institution)은 shareholderType='INSTITUTION' 기준.
    """
    if node_label != NodeLabel.STOCKHOLDER.value:
        return None
    st = node_props.get("shareholderType") or node_props.get("shareholder_type")
    if st == "INSTITUTION":
        return "institution"
    return "major"


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
    raw = node_data.get('n_labels') or node_data.get('node_labels') or node_data.get('m_labels') or []
    labels = _normalize_labels(raw)
    
    if labels:
        # 주요 라벨 우선순위 (설정 파일 기반)
        for priority in config.LABEL_PRIORITY:
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
    # Company: companyName (설정 파일 기반)
    if NodeLabel.COMPANY.value in labels:
        display_props = config.NODE_DISPLAY_NAME_PROPERTIES.get(NodeLabel.COMPANY.value, [])
        for prop in display_props:
            if prop in node_props:
                return str(node_props[prop])
        return 'Unknown Company'
    
    # Person: stockName (설정 파일 기반)
    if NodeLabel.PERSON.value in labels:
        display_props = config.NODE_DISPLAY_NAME_PROPERTIES.get(NodeLabel.PERSON.value, [])
        for prop in display_props:
            if prop in node_props:
                return str(node_props[prop])
        return 'Unknown Person'
    
    # 일반적인 속성
    fallback_props = ['name', 'title', NodeProperty.COMPANY_NAME.value, NodeProperty.STOCK_NAME.value]
    for prop in fallback_props:
        if prop in node_props:
            return str(node_props[prop])
    
    return 'Unknown'


def extract_node_properties(node: Any, node_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    노드 속성 추출 (Neo4j Node/드라이버 버전 호환)
    
    Args:
        node: Neo4j 노드 객체 또는 dict
        node_data: 노드 데이터 딕셔너리
    
    Returns:
        JSON 직렬화 가능한 속성 딕셔너리
    """
    try:
        if node is None:
            return {}
        if isinstance(node, dict):
            return _serializable_dict(node)
        if hasattr(node, "_properties"):
            return _serializable_dict(dict(node._properties))
        if hasattr(node, "keys") and callable(node.keys):
            return _serializable_dict(dict(node))
        return _serializable_dict(node_data.get("n") or node_data.get("m") or {})
    except Exception as e:
        logger.debug("extract_node_properties fallback: %s", e)
        return {}


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
        try:
            # 소스 노드 처리
            if 'n' in record:
                node = record['n']
                node_id = extract_node_id(node, record)
                if not node_id:
                    continue
                if node_id not in node_ids:
                    node_label = extract_node_label(record)
                    node_props = extract_node_properties(node, record)
                    labels = _normalize_labels(record.get('n_labels', []))
                    display_type = _display_type_for_filter(node_label, node_props)
                    props = {
                        **node_props,
                        'displayName': extract_node_display_name(node_props, labels),
                        'labels': labels
                    }
                    if display_type:
                        props['displayType'] = display_type
                    nodes.append(GraphNode(id=node_id, label=node_label, properties=props))
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
                if node_id and node_id not in node_ids:
                    node_label = extract_node_label(m_record)
                    node_props = extract_node_properties(node, {'m': record.get('m', {})})
                    labels = _normalize_labels(record.get('m_labels', []))
                    display_type = _display_type_for_filter(node_label, node_props)
                    props = {
                        **node_props,
                        'displayName': extract_node_display_name(node_props, labels),
                        'labels': labels
                    }
                    if display_type:
                        props['displayType'] = display_type
                    nodes.append(GraphNode(id=node_id, label=node_label, properties=props))
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
                if not source_id or not target_id:
                    continue
                rel_type = record.get('rel_type')
                if rel_type is None and hasattr(rel, 'type'):
                    rel_type = getattr(rel, 'type', 'RELATED')
                rel_type = str(rel_type) if rel_type else 'RELATED'
                rel_props = {}
                if hasattr(rel, '_properties'):
                    rel_props = _serializable_dict(dict(rel._properties))
                elif isinstance(rel, dict):
                    rel_props = _serializable_dict(rel)
                if RelationshipProperty.STOCK_RATIO.value in rel_props:
                    rel_props[RelationshipProperty.PCT.value] = rel_props[RelationshipProperty.STOCK_RATIO.value]
                edges.append(GraphEdge(
                    source=source_id,
                    target=target_id,
                    label=rel_type,
                    properties=rel_props
                ))
        except Exception as e:
            logger.debug("format_graph_data skip record: %s", e)
            continue
    
    return GraphData(nodes=nodes, edges=edges)


def get_graph_data(
    limit: int = 100,
    node_labels: Optional[List[str]] = None,
    relationship_types: Optional[List[str]] = None,
    skip: int = 0,
    node_cap: Optional[int] = None,
) -> GraphData:
    """
    그래프 데이터 조회 (실제 스키마에 맞춘 버전)
    node_cap 지정 시 노드 수 상한 적용 후, 그 노드 집합에 양끝이 포함된 엣지만 반환 (CTO: vis → 백엔드 마이그레이션).
    
    Args:
        limit: 최대 반환 관계 행 수
        node_labels: 필터링할 노드 라벨 리스트
        relationship_types: 필터링할 관계 타입 리스트
        skip: 건너뛸 관계 행 수 (더 보기용)
        node_cap: 노드 수 상한. 지정 시 노드 캡 적용 후 엣지 일관성 유지.
    
    Returns:
        GraphData 객체
    """
    try:
        if not relationship_types:
            relationship_types = config.DEFAULT_RELATIONSHIP_TYPES
        records = db.get_graph_data(limit, node_labels, relationship_types, skip=skip)
        if not records:
            logger.warning("그래프 데이터가 없습니다.")
            return GraphData(nodes=[], edges=[])
        data = format_graph_data(records)
        if node_cap is not None and node_cap > 0 and len(data.nodes) > node_cap:
            nodes = data.nodes[:node_cap]
            node_ids = {n.id for n in nodes}
            edges = [e for e in data.edges if e.source in node_ids and e.target in node_ids]
            return GraphData(nodes=nodes, edges=edges)
        return data
    except Neo4jConnectionError:
        raise
    except Exception as e:
        logger.exception("그래프 데이터 조회 실패: %s", e)
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
        # 실제 스키마에 맞는 검색 속성 (설정 파일 기반)
        if not search_properties:
            search_properties = config.DEFAULT_SEARCH_PROPERTIES
        
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


def _relationship_to_serializable(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    노드 상세 API용: 관계 레코드의 r을 JSON 직렬화 가능한 dict로 변환.
    프론트엔드가 r.properties.stockRatio / r.stockRatio 로 읽을 수 있도록 함.
    """
    rel = record.get("r")
    if rel is None:
        return {**record, "r": {"type": record.get("rel_type"), "properties": {}}}
    rel_type = record.get("rel_type") or (getattr(rel, "type", None) if hasattr(rel, "type") else None)
    rel_props = {}
    if hasattr(rel, "_properties"):
        rel_props = _serializable_dict(dict(rel._properties))
    elif isinstance(rel, dict):
        rel_props = _serializable_dict(rel)
    # Neo4j snake_case → API camelCase (연결노드 보유비율 표출)
    if "stock_ratio" in rel_props and RelationshipProperty.STOCK_RATIO.value not in rel_props:
        rel_props[RelationshipProperty.STOCK_RATIO.value] = rel_props["stock_ratio"]
    if RelationshipProperty.STOCK_RATIO.value in rel_props:
        rel_props[RelationshipProperty.PCT.value] = rel_props[RelationshipProperty.STOCK_RATIO.value]
    return {
        **record,
        "r": {"type": str(rel_type) if rel_type else "RELATED", "properties": rel_props},
    }


def get_node_detail(node_id: str, id_property: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    노드 상세 정보 조회 (실제 스키마에 맞춘 버전)
    - 관계(r)를 JSON 직렬화 가능 형태로 정규화 (stockRatio 등 properties 포함).
    - 관계 기반 최대 지분율을 계산해 maxStockRatioFromRels 로 반환 (최대주주 지분율 표시용).
    """
    try:
        if not id_property:
            node_data = db.get_node_by_id(node_id, "bizno")
            if node_data:
                id_property = "bizno"
            else:
                node_data = db.get_node_by_id(node_id, "personId")
                if node_data:
                    id_property = "personId"
                else:
                    return None
        else:
            node_data = db.get_node_by_id(node_id, id_property)

        if not node_data:
            return None

        raw_rels = db.get_node_relationships(
            node_id,
            id_property=id_property,
            direction="both",
            limit=50,
        )
        relationships = []
        max_stock_ratio: Optional[float] = None
        # 주주 수 계산: incoming 관계의 고유 주주 ID 집합 (회사 기준: (주주)-[보유]->(회사))
        shareholder_ids = set()
        
        for rec in raw_rels or []:
            try:
                normalized = _relationship_to_serializable(rec)
                # 관계 방향: 주주 수 등 시맨틱 분리를 위해 (회사 기준 in=주주, out=투자처)
                rel = rec.get("r")
                n_id = extract_node_id(rec.get("n"), {"n": rec.get("n"), "n_labels": rec.get("n_labels", [])}) if rec.get("n") else None
                m_id = extract_node_id(rec.get("m"), {"m": rec.get("m"), "m_labels": rec.get("m_labels", [])}) if rec.get("m") else None
                
                if hasattr(rel, "start_node") and hasattr(rel.start_node, "get"):
                    sn = rel.start_node
                    start_id = sn.get(id_property) or sn.get("bizno") or sn.get("personId")
                    normalized["direction"] = "out" if str(start_id) == str(node_id) else "in"
                else:
                    # fallback: n/m ID로 방향 추론
                    if n_id == node_id:
                        normalized["direction"] = "out"
                    elif m_id == node_id:
                        normalized["direction"] = "in"
                    else:
                        normalized["direction"] = "out"
                
                relationships.append(normalized)
                
                # 최대 지분율: 모든 관계의 stockRatio/pct 중 최댓값 (in/out 모두 포함)
                props = normalized.get("r") or {}
                rel_props = props.get("properties") or {}
                for key in (RelationshipProperty.STOCK_RATIO.value, RelationshipProperty.PCT.value):
                    v = rel_props.get(key)
                    if isinstance(v, (int, float)) and v >= 0:
                        max_stock_ratio = max(max_stock_ratio, float(v)) if max_stock_ratio is not None else float(v)
                
                # 주주 수: incoming 관계의 다른 끝 노드 ID 수집 (중복 제거)
                if normalized.get("direction") == "in":
                    other_id = m_id if n_id == node_id else (n_id if m_id == node_id else None)
                    if other_id and other_id != node_id:
                        shareholder_ids.add(str(other_id))
            except Exception as e:
                logger.debug("relationship normalize skip: %s", e)
                relationships.append(rec)

        # 이웃 노드 ID 목록 (vis 하이라이트 등 프론트 단일 소스용, CTO: vis → 백엔드 마이그레이션)
        connected_node_ids = []
        seen = set()
        for rec in relationships:
            try:
                n_id = extract_node_id(rec.get("n"), {"n": rec.get("n"), "n_labels": rec.get("n_labels", [])}) if rec.get("n") else None
                m_id = extract_node_id(rec.get("m"), {"m": rec.get("m"), "m_labels": rec.get("m_labels", [])}) if rec.get("m") else None
                other = m_id if n_id == node_id else (n_id if m_id == node_id else None)
                if other and other != node_id and other not in seen:
                    seen.add(other)
                    connected_node_ids.append(other)
            except Exception:
                pass

        return {
            "node": node_data,
            "relationships": relationships,
            "id_property": id_property,
            "maxStockRatioFromRels": max_stock_ratio,
            "shareholderCount": len(shareholder_ids) if shareholder_ids else None,  # 주주 수 (중복 제거된 고유 주주 수)
            "connected_node_ids": connected_node_ids,
        }
    except Exception as e:
        logger.error(f"노드 상세 정보 조회 실패: {e}")
        return None


def get_ego_graph(node_id: str, depth: int = 1, limit: int = 100, id_property: str = "id") -> GraphData:
    """
    Ego 그래프 조회
    
    Args:
        node_id: 중심 노드 ID
        depth: 탐색 깊이
        limit: 최대 반환 개수
        id_property: ID 속성(bizno/personId)
    
    Returns:
        GraphData 객체
    """
    try:
        records = db.get_ego_graph(node_id, id_property=id_property, depth=depth, limit=limit)
        if not records:
            return GraphData(nodes=[], edges=[])
        # format_graph_data는 n, r, m 키를 기대함. ego 쿼리는 center, r, connected 반환.
        normalized = [
            {
                "n": r["center"],
                "r": r["r"],
                "m": r["connected"],
                "n_labels": r.get("center_labels", []),
                "m_labels": r.get("connected_labels", []),
                "rel_type": r.get("rel_type"),
            }
            for r in records
        ]
        return format_graph_data(normalized)
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


def reset_chat() -> None:
    """서버 측 AI 대화 이력 초기화 (참조 서비스 reset_chat 호환)"""
    global _chat_history
    _chat_history = []


def _get_schema_for_cypher() -> str:
    """Cypher 생성용 스키마 문자열 (설정 기반)"""
    rels = ", ".join(config.DEFAULT_RELATIONSHIP_TYPES)
    return f"""
[노드]
- (Company) bizno, companyName, companyNameNormalized
- (Person) personId, stockName, stockNameNormalized
- (Stockholder) 주주 역할
- (MajorShareholder) maxStockRatio >= 5% 인 주주

[관계]
- (s)-[:HOLDS_SHARES]->(c)  속성: stockRatio(Float, 지분율%), stockCount, baseDate, reportYear
- (c)-[:HAS_COMPENSATION]->(c)  속성: fiscalYear, registeredExecCount, registeredExecTotalComp(만원) 등

[규칙]
- 주주명: stockName (name 아님)
- 회사명 검색: c.companyName CONTAINS '키워드'
- 지분율: r.stockRatio (Float, 예: >= 50.0)
- 금액 단위 만원, 1억=10000. LIMIT 기본 10.
""".strip()


def _extract_cypher_from_llm(text: str) -> str:
    """LLM 출력에서 Cypher만 추출 (마크다운/설명 제거)"""
    if not text:
        return ""
    text = text.strip()
    # ```cypher ... ``` 또는 ``` ... ``` 블록
    m = re.search(r"```(?:cypher)?\s*\n?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # 한 줄로 반환된 경우
    if text.upper().startswith("MATCH ") or text.upper().startswith("RETURN "):
        return text
    # 여러 줄 중 MATCH로 시작하는 줄부터
    for line in text.split("\n"):
        line = line.strip()
        if line.upper().startswith("MATCH ") or line.upper().startswith("RETURN "):
            return line
    return text


def _ask_graph_flow(question: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    참조 서비스 ask_graph 흐름: Cypher 생성 → Neo4j 실행 → 결과로 답변 생성.
    read_only로만 실행. 대화 이력 유지.
    """
    t0 = time.time()
    openai_client = get_openai_client()
    if not openai_client:
        err = "OpenAI API 키가 설정되지 않았습니다. .env에 OPENAI_API_KEY를 설정해주세요."
        if _openai_client_error:
            err += f"\n(초기화 오류: {_openai_client_error})"
        return {"response": err, "graph_data": None, "source": "ERROR", "elapsed": round(time.time() - t0, 2)}

    schema = _get_schema_for_cypher()
    # 컨텍스트 보강
    enhanced = question
    if context and context.get("node_id"):
        node_detail = get_node_detail(context.get("node_id"))
        if node_detail:
            enhanced = f"{question}\n[선택 노드 ID: {context.get('node_id')}, 연결 관계 수: {len(node_detail.get('relationships', []))}]"

    cypher_prompt = f"""당신은 Neo4j Cypher 전문가입니다. 아래 스키마와 규칙에 맞게 질문에 대한 Cypher만 작성하세요.
## 스키마
{schema}

질문: {enhanced}

규칙: Cypher 코드만 반환. 설명·마크다운 금지. 읽기 전용(MATCH/RETURN 등만 사용).

Cypher:"""

    cypher = ""
    raw: List[Dict[str, Any]] = []
    try:
        resp = openai_client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=[{"role": "user", "content": cypher_prompt}],
            temperature=0,
            max_tokens=512,
        )
        cypher = _extract_cypher_from_llm(resp.choices[0].message.content or "")
    except Exception as e:
        logger.warning(f"Cypher 생성 실패: {e}")
        cypher = ""

    if cypher:
        try:
            result = db.execute_query(cypher, {}, read_only=True)
            if result is not None:
                raw = result
        except Exception as e:
            logger.warning(f"Cypher 실행 실패: {e}")
            raw = []

    # QA: DB 결과 또는 폴백으로 답변 생성
    messages_for_qa: List[Dict[str, str]] = []
    for m in _chat_history[-2 * _MAX_CHAT_TURNS :]:
        messages_for_qa.append({"role": m["role"], "content": m["content"]})
    context_str = str(raw)[:6000] if raw else "(DB 조회 결과 없음)"
    qa_user = f"""질문: {question}

DB 결과:
{context_str}

[답변 규칙] 핵심 수치(지분율·금액·건수) 먼저. 금액은 "X억 X천만원" 형식. 결과 없으면 "해당 데이터가 없습니다" 안내. 4줄 이내 간결하게."""

    messages_for_qa.append({"role": "user", "content": qa_user})
    try:
        qa_resp = openai_client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "당신은 주주 네트워크 분석 전문가입니다. DB 조회 결과를 바탕으로 질문에 명확하고 친절하게 답변하세요."},
                *messages_for_qa,
            ],
            temperature=0,
            max_tokens=1024,
        )
        answer = (qa_resp.choices[0].message.content or "").strip()
    except Exception as e:
        error_msg = str(e)
        if "context_length" in error_msg.lower() or "token" in error_msg.lower():
            answer = f"⚠️ 질문이 너무 길거나 대화 이력이 깁니다. 짧게 하거나 '대화 초기화'를 해주세요.\n\n오류: {error_msg[:200]}"
        else:
            answer = f"⚠️ 오류 발생: {error_msg[:200]}"
        return {
            "response": answer,
            "graph_data": None,
            "cypher": cypher or None,
            "raw": raw if raw else None,
            "source": "ERROR",
            "elapsed": round(time.time() - t0, 2),
        }

    if cypher and raw:
        source = "DB"
    elif cypher and not raw:
        source = "DB_EMPTY"
    else:
        source = "LLM"
        if not answer.startswith("⚠️"):
            answer = f"⚠️ DB 조회에 실패하여 추론으로 답변합니다. 실제 데이터와 다를 수 있습니다.\n\n{answer}"

    _chat_history.append({"role": "user", "content": question})
    _chat_history.append({"role": "assistant", "content": answer})
    while len(_chat_history) > 2 * _MAX_CHAT_TURNS:
        _chat_history.pop(0)
        _chat_history.pop(0)

    return {
        "response": answer,
        "graph_data": None,
        "cypher": cypher or None,
        "raw": raw if raw else None,
        "source": source,
        "elapsed": round(time.time() - t0, 2),
    }


def chat_with_graph(message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    그래프 컨텍스트를 활용한 챗봇 응답.
    참조 서비스(ask_graph) 흐름: Cypher 생성 → Neo4j 실행 → 결과 기반 답변 + 대화 이력.
    """
    try:
        return _ask_graph_flow(message, context)
    except Neo4jConnectionError:
        return {
            "response": "Neo4j에 연결할 수 없어 그래프 기반 답변을 생성하지 못했습니다. 연결 상태를 확인해 주세요.",
            "graph_data": None,
            "source": "ERROR",
            "elapsed": 0,
        }
    except Exception as e:
        logger.error(f"챗봇 응답 생성 실패: {e}")
        return {
            "response": f"챗봇 응답 생성 중 오류가 발생했습니다: {str(e)}",
            "graph_data": None,
            "source": "ERROR",
            "elapsed": 0,
        }
