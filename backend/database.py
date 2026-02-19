"""
Neo4j 데이터베이스 연결 및 쿼리 실행 모듈
실제 스키마에 맞춘 버전 (Company/Person/Stockholder)
백엔드 전문가 CTO 관점에서 개선된 버전
"""
from neo4j import GraphDatabase, Transaction
from neo4j.exceptions import (
    AuthError,
    ServiceUnavailable,
    TransientError,
    ClientError,
    CypherSyntaxError
)
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
import logging
import time
from enum import Enum
from .config import config, RelationshipType

# load_dotenv()는 config.py에서 이미 호출됨 (중복 제거)
# 환경 변수는 config 객체를 통해 접근

# Cypher 삽입 방지: id_property는 화이트리스트만 허용 (협업: config와 동기화)
_ALLOWED_ID_PROPERTIES = frozenset(config.NODE_ID_PROPERTIES.values()) | {"id"}


def _safe_id_property(id_property: str) -> str:
    """id_property가 허용 목록에 있으면 그대로, 아니면 'id' 반환."""
    return id_property if id_property in _ALLOWED_ID_PROPERTIES else "id"


# 로깅 설정
logger = logging.getLogger(__name__)


class ConnectionStatus(Enum):
    """연결 상태 열거형"""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    AUTH_FAILED = "auth_failed"
    NETWORK_ERROR = "network_error"
    UNKNOWN_ERROR = "unknown_error"


class Neo4jConnectionError(Exception):
    """Neo4j 연결 오류 커스텀 예외"""
    def __init__(self, message: str, status: ConnectionStatus, original_error: Optional[Exception] = None):
        self.message = message
        self.status = status
        self.original_error = original_error
        super().__init__(self.message)


class Neo4jDriver:
    """
    Neo4j 데이터베이스 드라이버 클래스
    - Connection pooling 활용
    - 트랜잭션 관리
    - 에러 핸들링 강화
    - 쿼리 최적화
    - 실제 스키마에 맞춘 쿼리
    - 백엔드 전문가 CTO 관점에서 개선된 버전
    """
    
    def __init__(self):
        # 설정 파일 기반 (협업 코드 고려)
        self.uri = config.NEO4J_URI
        self.user = config.NEO4J_USER
        self.password = config.NEO4J_PASSWORD
        self.driver = None
        self._connected = False
        self._connection_status = ConnectionStatus.DISCONNECTED
        self._last_error = None
        self._retry_count = 0
        self._max_retries = config.MAX_CONNECTION_RETRIES
    
    def connect(self, retry: bool = True) -> bool:
        """
        데이터베이스 연결 (개선된 버전)
        
        Args:
            retry: 재시도 여부
        
        Returns:
            bool: 연결 성공 여부
        """
        # 이미 연결되어 있고 유효한지 확인
        if self._connected and self.driver:
            try:
                with self.driver.session() as session:
                    session.run("RETURN 1")
                self._connection_status = ConnectionStatus.CONNECTED
                return True
            except Exception as e:
                logger.warning(f"기존 연결이 유효하지 않음, 재연결 시도: {e}")
                self._connected = False
                self._connection_status = ConnectionStatus.DISCONNECTED
        
        # 재시도 로직
        for attempt in range(self._max_retries if retry else 1):
            try:
                # Neo4j Aura (neo4j+s://) 또는 SSL 연결을 위한 설정 (설정 파일 기반)
                driver_config = {
                    "max_connection_lifetime": config.MAX_CONNECTION_LIFETIME,
                    "max_connection_pool_size": config.MAX_CONNECTION_POOL_SIZE,
                    "connection_acquisition_timeout": config.CONNECTION_ACQUISITION_TIMEOUT,
                    "connection_timeout": config.CONNECTION_TIMEOUT
                }
                
                # SSL 연결인 경우 추가 설정
                if self.uri.startswith("neo4j+s://") or self.uri.startswith("bolt+s://"):
                    # Neo4j Aura는 자동으로 SSL 인증서 검증
                    # 추가 SSL 설정이 필요한 경우 여기에 추가
                    logger.info("SSL 연결 모드로 연결 시도 중...")
                
                self.driver = GraphDatabase.driver(
                    self.uri,
                    auth=(self.user, self.password),
                    **driver_config
                )
                
                # 연결 테스트
                with self.driver.session() as session:
                    session.run("RETURN 1")
                
                self._connected = True
                self._connection_status = ConnectionStatus.CONNECTED
                self._last_error = None
                self._retry_count = 0
                logger.info(f"Neo4j 연결 성공: {self.uri}")
                return True
                
            except AuthError as e:
                self._connection_status = ConnectionStatus.AUTH_FAILED
                self._last_error = Neo4jConnectionError(
                    f"인증 실패: 사용자명 또는 비밀번호가 올바르지 않습니다.",
                    ConnectionStatus.AUTH_FAILED,
                    e
                )
                logger.error(f"Neo4j 인증 실패: {e}")
                if not retry or attempt == self._max_retries - 1:
                    return False
                    
            except ServiceUnavailable as e:
                self._connection_status = ConnectionStatus.NETWORK_ERROR
                self._last_error = Neo4jConnectionError(
                    f"서버 연결 실패: Neo4j 서버({self.uri})에 연결할 수 없습니다.",
                    ConnectionStatus.NETWORK_ERROR,
                    e
                )
                logger.error(f"Neo4j 서버 연결 실패: {e}")
                if not retry or attempt == self._max_retries - 1:
                    return False
                # 지수 백오프
                wait_time = 2 ** attempt
                logger.info(f"{wait_time}초 후 재시도 ({attempt + 1}/{self._max_retries})...")
                time.sleep(wait_time)
                
            except Exception as e:
                self._connection_status = ConnectionStatus.UNKNOWN_ERROR
                self._last_error = Neo4jConnectionError(
                    f"연결 오류: {str(e)}",
                    ConnectionStatus.UNKNOWN_ERROR,
                    e
                )
                logger.error(f"Neo4j 연결 실패 (알 수 없는 오류): {e}")
                if not retry or attempt == self._max_retries - 1:
                    return False
                wait_time = 2 ** attempt
                time.sleep(wait_time)
        
        self._connected = False
        return False
    
    def get_connection_status(self) -> Dict[str, Any]:
        """
        연결 상태 정보 반환
        
        Returns:
            연결 상태 딕셔너리
        """
        status_info = {
            "status": self._connection_status.value,
            "connected": self._connected,
            "uri": self._uri_masked() if not self._connected else self.uri,
            "retry_count": self._retry_count
        }
        
        if self._last_error:
            status_info["error"] = {
                "message": self._last_error.message,
                "type": self._last_error.status.value
            }
        
        return status_info
    
    def _uri_masked(self) -> str:
        """URI 마스킹 (보안)"""
        if "@" in self.uri:
            return self.uri.split("@")[1]
        return self.uri
    
    def close(self):
        """데이터베이스 연결 종료"""
        if self.driver:
            try:
                self.driver.close()
                self._connected = False
                self._connection_status = ConnectionStatus.DISCONNECTED
                logger.info("Neo4j 연결 종료")
            except Exception as e:
                logger.error(f"Neo4j 연결 종료 실패: {e}")
    
    @contextmanager
    def get_session(self):
        """
        세션 컨텍스트 매니저 (개선된 버전)
        
        Raises:
            Neo4jConnectionError: 연결 실패 시
        """
        if not self.driver:
            if not self.connect():
                raise self._last_error or Neo4jConnectionError(
                    "Neo4j 연결에 실패했습니다.",
                    ConnectionStatus.DISCONNECTED
                )
        
        session = self.driver.session()
        try:
            yield session
        except (ServiceUnavailable, TransientError) as e:
            # 일시적 오류 시 재연결 시도
            logger.warning(f"일시적 오류 발생, 재연결 시도: {e}")
            self._connected = False
            if self.connect():
                session = self.driver.session()
                yield session
            else:
                raise Neo4jConnectionError(
                    "Neo4j 재연결에 실패했습니다.",
                    ConnectionStatus.NETWORK_ERROR,
                    e
                )
        finally:
            session.close()
    
    def execute_query(
        self,
        query: str,
        parameters: Optional[Dict[str, Any]] = None,
        read_only: bool = True,
        retry_on_failure: bool = True
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Cypher 쿼리 실행 (개선된 버전)
        
        Args:
            query: Cypher 쿼리 문자열
            parameters: 쿼리 파라미터
            read_only: 읽기 전용 여부
            retry_on_failure: 실패 시 재시도 여부
        
        Returns:
            쿼리 결과 리스트 또는 None (에러 시)
        """
        if not self.driver:
            if not self.connect():
                logger.error("쿼리 실행 실패: Neo4j 연결 없음")
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
        except Neo4jConnectionError:
            raise
        except Exception as e:
            logger.error(f"쿼리 실행 실패: {e}\n쿼리: {query[:100]}...")
            if retry_on_failure and isinstance(e, (ServiceUnavailable, TransientError)):
                logger.info("일시적 오류로 재시도...")
                time.sleep(1)
                return self.execute_query(query, parameters, read_only, retry_on_failure=False)
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
        relationship_types: Optional[List[str]] = None,
        skip: int = 0,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        그래프 데이터 조회 (실제 스키마에 맞춘 버전)
        
        실제 관계 타입:
        - HOLDS_SHARES: Stockholder -> Company
        - HAS_COMPENSATION: Company -> Company
        
        Args:
            limit: 최대 반환 **관계(엣지) 행 수**. 노드는 이 행에 등장하는 n,m 만
                   format_graph_data에서 추출되므로, limit이 작으면 화면에 보이는 노드 수가 적음.
            node_labels: 필터링할 노드 라벨 리스트 (예: ['Company', 'Person'])
            relationship_types: 필터링할 관계 타입 리스트
            skip: 건너뛸 관계 행 수 (더 보기 페이지네이션, ORDER BY id(r) 로 안정화)
        
        Returns:
            노드와 관계 데이터 리스트 (각 레코드 = 관계 1건)
        """
        # 기본 관계 타입 설정 (설정 파일 기반)
        if not relationship_types:
            relationship_types = config.DEFAULT_RELATIONSHIP_TYPES
        
        # 관계 타입 필터
        rel_filter = ":" + "|".join(relationship_types) if relationship_types else ""
        # 안정적 페이지네이션: id(r) 기준 정렬 후 SKIP/LIMIT
        order_skip_limit = "ORDER BY id(r) SKIP $skip LIMIT $limit"
        
        # 라벨 필터링 (수정된 버전: 양쪽 노드 중 하나라도 라벨에 포함되면 포함)
        if node_labels:
            # 각 라벨에 대해 조건 생성
            label_conditions = []
            for label in node_labels:
                label_conditions.append(f"'{label}' IN labels(n)")
                label_conditions.append(f"'{label}' IN labels(m)")
            
            # OR 조건으로 결합 (양쪽 노드 중 하나라도 해당 라벨을 가지면 포함)
            where_clause = " OR ".join(label_conditions)
            
            query = f"""
            MATCH (n)-[r{rel_filter}]->(m)
            WHERE {where_clause}
            WITH n, r, m
            {order_skip_limit}
            RETURN n, r, m,
                   labels(n) as n_labels,
                   labels(m) as m_labels,
                   type(r) as rel_type
            """
        else:
            query = f"""
            MATCH (n)-[r{rel_filter}]->(m)
            WITH n, r, m
            {order_skip_limit}
            RETURN n, r, m,
                   labels(n) as n_labels,
                   labels(m) as m_labels,
                   type(r) as rel_type
            """
        
        logger.debug(f"그래프 데이터 쿼리: skip=%s limit=%s", skip, limit)
        result = self.execute_query(query, {"limit": limit, "skip": skip})
        
        if result:
            logger.info(f"그래프 데이터 조회 성공: {len(result)}개 관계")
        else:
            logger.warning("그래프 데이터 조회 결과 없음")
        
        return result
    
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
        
        실제 속성 (설정 파일 기반):
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
            # 실제 스키마에 맞는 기본 검색 속성 (설정 파일 기반)
            search_properties = config.DEFAULT_SEARCH_PROPERTIES
        
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
            id_property: ID로 사용할 property 이름 (화이트리스트만 허용)

        Returns:
            노드 데이터 또는 None
        """
        id_property = _safe_id_property(id_property)
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
        id_property = _safe_id_property(id_property)
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
        id_property = _safe_id_property(id_property)
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
            노드 수, 관계 수, 라벨별 통계. 기관(Institution)은 shareholderType='INSTITUTION' 기준 집계.
        """
        query = """
        MATCH (n)
        WITH count(n) as total_nodes
        MATCH ()-[r]->()
        WITH total_nodes, count(r) as total_relationships
        MATCH (n)
        UNWIND labels(n) as label
        WITH total_nodes, total_relationships, label, count(*) as count
        WITH total_nodes, total_relationships, collect({label: label, count: count}) as label_counts
        RETURN total_nodes, total_relationships, label_counts
        """
        result = self.execute_query(query)
        if not result:
            return None
        row = result[0]
        label_counts = list(row.get("label_counts") or [])
        # 기관: Neo4j 라벨이 아닌 속성(shareholderType) 기준 집계 (협업/스키마 확장 고려)
        inst_query = """
        MATCH (n) WHERE n.shareholderType = 'INSTITUTION'
        RETURN count(n) as institution_count
        """
        inst_result = self.execute_query(inst_query)
        inst_count = inst_result[0].get("institution_count", 0) if inst_result else 0
        label_counts.append({"label": "Institution", "count": inst_count})
        row["label_counts"] = label_counts
        return row


# 전역 인스턴스
db = Neo4jDriver()
