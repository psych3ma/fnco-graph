"""
Neo4j 데이터베이스 연결 및 쿼리 실행 모듈
실제 스키마에 맞춘 버전 (Company/Person/Stockholder)
"""
from neo4j import GraphDatabase, Transaction
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
import logging

load_dotenv()

# 로깅 설정
logger = logging.getLogger(__name__)


class Neo4jDriver:
    """
    Neo4j 데이터베이스 드라이버 클래스
    - Connection pooling 활용
    - 트랜잭션 관리
    - 에러 핸들링 강화
    - 쿼리 최적화
    - 실제 스키마에 맞춘 쿼리
    """
    
    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "")
        self.driver = None
        self._connected = False
    
    def connect(self) -> bool:
        """
        데이터베이스 연결
        Returns:
            bool: 연결 성공 여부
        """
        if self._connected and self.driver:
            try:
                # 연결 상태 확인
                with self.driver.session() as session:
                    session.run("RETURN 1")
                return True
            except Exception:
                self._connected = False
        
        try:
            self.driver = GraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password),
                max_connection_lifetime=3600,  # 1시간
                max_connection_pool_size=50,
                connection_acquisition_timeout=60
            )
            # 연결 테스트
            with self.driver.session() as session:
                session.run("RETURN 1")
            self._connected = True
            logger.info("Neo4j 연결 성공")
            return True
        except Exception as e:
            logger.error(f"Neo4j 연결 실패: {e}")
            self._connected = False
            return False
    
    def close(self):
        """데이터베이스 연결 종료"""
        if self.driver:
            try:
                self.driver.close()
                self._connected = False
                logger.info("Neo4j 연결 종료")
            except Exception as e:
                logger.error(f"Neo4j 연결 종료 실패: {e}")
    
    @contextmanager
    def get_session(self):
        """
        세션 컨텍스트 매니저
        사용 예:
            with db.get_session() as session:
                result = session.run("MATCH (n) RETURN n LIMIT 10")
        """
        if not self.driver:
            if not self.connect():
                raise ConnectionError("Neo4j 연결에 실패했습니다.")
        
        session = self.driver.session()
        try:
            yield session
        finally:
            session.close()
    
    def execute_query(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None,
        read_only: bool = True
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Cypher 쿼리 실행
        
        Args:
            query: Cypher 쿼리 문자열
            parameters: 쿼리 파라미터
            read_only: 읽기 전용 여부 (기본값: True)
        
        Returns:
            쿼리 결과 리스트 또는 None (에러 시)
        """
        if not self.driver:
            if not self.connect():
                return None
        
        try:
            with self.get_session() as session:
                if read_only:
                    result = session.read_transaction(
                        self._execute_query_tx,
                        query,
                        parameters or {}
                    )
                else:
                    result = session.write_transaction(
                        self._execute_query_tx,
                        query,
                        parameters or {}
                    )
                return result
        except Exception as e:
            logger.error(f"쿼리 실행 실패: {e}\n쿼리: {query[:100]}...")
            return None
    
    @staticmethod
    def _execute_query_tx(tx: Transaction, query: str, parameters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """트랜잭션 내 쿼리 실행"""
        result = tx.run(query, parameters)
        return [record.data() for record in result]
    
    def get_graph_data(
        self,
        limit: int = 100,
        node_labels: Optional[List[str]] = None,
        relationship_types: Optional[List[str]] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """
        그래프 데이터 조회 (실제 스키마에 맞춘 버전)
        
        실제 관계 타입:
        - HOLDS_SHARES: Stockholder -> Company
        - HAS_COMPENSATION: Company -> Company
        
        Args:
            limit: 최대 반환 개수
            node_labels: 필터링할 노드 라벨 리스트 (예: ['Company', 'Person'])
            relationship_types: 필터링할 관계 타입 리스트
        
        Returns:
            노드와 관계 데이터 리스트
        """
        # 기본 관계 타입 설정
        if not relationship_types:
            relationship_types = ['HOLDS_SHARES', 'HAS_COMPENSATION']
        
        # 라벨 필터링
        label_filter = ""
        if node_labels:
            label_str = ":" + ":".join(node_labels)
            rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
            label_filter = f"(n{label_str})-[r{rel_filter}]->(m{label_str})"
        else:
            rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
            label_filter = f"(n)-[r{rel_filter}]->(m)"
        
        query = f"""
        MATCH {label_filter}
        WITH n, r, m
        LIMIT $limit
        RETURN n, r, m,
               labels(n) as n_labels,
               labels(m) as m_labels,
               type(r) as rel_type
        """
        
        return self.execute_query(query, {"limit": limit})
    
    def get_nodes(
        self,
        limit: int = 100,
        labels: Optional[List[str]] = None,
        properties: Optional[Dict[str, Any]] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """
        노드 조회 (최적화)
        
        Args:
            limit: 최대 반환 개수
            labels: 필터링할 라벨 리스트
            properties: 필터링할 속성
        
        Returns:
            노드 데이터 리스트
        """
        label_clause = ""
        if labels:
            label_clause = ":" + ":".join(labels)
        
        where_clause = ""
        params = {"limit": limit}
        
        if properties:
            conditions = []
            for key, value in properties.items():
                param_key = f"prop_{key}"
                conditions.append(f"n.{key} = ${param_key}")
                params[param_key] = value
            where_clause = "WHERE " + " AND ".join(conditions)
        
        query = f"""
        MATCH (n{label_clause})
        {where_clause}
        RETURN n, labels(n) as node_labels, id(n) as node_id
        LIMIT $limit
        """
        
        return self.execute_query(query, params)
    
    def search_nodes(
        self,
        search_term: str,
        limit: int = 50,
        search_properties: Optional[List[str]] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """
        노드 검색 (실제 스키마에 맞춘 버전)
        
        실제 속성:
        - Company: companyName, companyNameNormalized
        - Person: stockName, stockNameNormalized
        
        Args:
            search_term: 검색어
            limit: 최대 반환 개수
            search_properties: 검색할 속성 리스트
        
        Returns:
            검색된 노드 리스트
        """
        if not search_properties:
            # 실제 스키마에 맞는 기본 검색 속성
            search_properties = [
                'companyName', 'companyNameNormalized',
                'stockName', 'stockNameNormalized',
                'bizno', 'personId'
            ]
        
        # 검색 조건 생성
        conditions = []
        for prop in search_properties:
            conditions.append(f"toLower(toString(n.{prop})) CONTAINS toLower($search_term)")
        
        where_clause = "WHERE " + " OR ".join(conditions)
        
        query = f"""
        MATCH (n)
        {where_clause}
        RETURN n, labels(n) as node_labels, id(n) as node_id
        LIMIT $limit
        """
        
        return self.execute_query(query, {"search_term": search_term, "limit": limit})
    
    def get_node_by_id(self, node_id: str, id_property: str = "id") -> Optional[Dict[str, Any]]:
        """
        ID로 노드 조회 (실제 스키마에 맞춘 버전)
        
        실제 ID 속성:
        - Company: bizno
        - Person: personId
        
        Args:
            node_id: 노드 ID (property 값)
            id_property: ID로 사용할 property 이름
        
        Returns:
            노드 데이터 또는 None
        """
        query = f"""
        MATCH (n)
        WHERE n.{id_property} = $node_id
        RETURN n, labels(n) as node_labels, id(n) as internal_id
        LIMIT 1
        """
        
        result = self.execute_query(query, {"node_id": node_id})
        return result[0] if result else None
    
    def get_node_relationships(
        self,
        node_id: str,
        id_property: str = "id",
        direction: str = "both",
        limit: int = 100
    ) -> Optional[List[Dict[str, Any]]]:
        """
        노드의 관계 조회 (실제 스키마에 맞춘 버전)
        
        Args:
            node_id: 노드 ID
            id_property: ID property 이름 (bizno 또는 personId)
            direction: 관계 방향 ('in', 'out', 'both')
            limit: 최대 반환 개수
        
        Returns:
            관계 데이터 리스트
        """
        if direction == "in":
            pattern = f"(m)-[r]->(n)"
        elif direction == "out":
            pattern = f"(n)-[r]->(m)"
        else:  # both
            pattern = f"(n)-[r]-(m)"
        
        query = f"""
        MATCH (n)
        WHERE n.{id_property} = $node_id
        MATCH {pattern}
        RETURN n, r, m, labels(n) as n_labels, labels(m) as m_labels, type(r) as rel_type
        LIMIT $limit
        """
        
        return self.execute_query(query, {"node_id": node_id, "limit": limit})
    
    def get_ego_graph(
        self,
        node_id: str,
        id_property: str = "id",
        depth: int = 1,
        limit: int = 100
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Ego 그래프 조회 (특정 노드를 중심으로 한 서브그래프)
        
        Args:
            node_id: 중심 노드 ID
            id_property: ID property 이름
            depth: 탐색 깊이 (1 = 직접 연결, 2 = 2단계 연결)
            limit: 최대 반환 개수
        
        Returns:
            Ego 그래프 데이터
        """
        query = f"""
        MATCH (center)
        WHERE center.{id_property} = $node_id
        MATCH path = (center)-[*1..{depth}]-(connected)
        WITH center, connected, relationships(path) as rels
        UNWIND rels as r
        WITH DISTINCT center, connected, r
        LIMIT $limit
        RETURN center, r, connected,
               labels(center) as center_labels,
               labels(connected) as connected_labels,
               type(r) as rel_type
        """
        
        return self.execute_query(query, {"node_id": node_id, "limit": limit})
    
    def get_statistics(self) -> Optional[Dict[str, Any]]:
        """
        그래프 통계 조회
        
        Returns:
            노드 수, 관계 수, 라벨별 통계 등
        """
        query = """
        MATCH (n)
        WITH count(n) as total_nodes
        MATCH ()-[r]->()
        WITH total_nodes, count(r) as total_relationships
        MATCH (n)
        UNWIND labels(n) as label
        WITH total_nodes, total_relationships, label, count(*) as count
        RETURN total_nodes, total_relationships, collect({label: label, count: count}) as label_counts
        """
        
        result = self.execute_query(query)
        return result[0] if result else None


# 전역 인스턴스
db = Neo4jDriver()
