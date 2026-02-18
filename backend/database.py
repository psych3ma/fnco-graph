"""Neo4j 데이터베이스 연결 및 쿼리 실행 모듈"""
from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()


class Neo4jDriver:
    """Neo4j 데이터베이스 드라이버 클래스"""
    
    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "")
        self.driver = None
    
    def connect(self):
        """데이터베이스 연결"""
        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            return True
        except Exception as e:
            print(f"Neo4j 연결 실패: {e}")
            return False
    
    def close(self):
        """데이터베이스 연결 종료"""
        if self.driver:
            self.driver.close()
    
    def execute_query(self, query: str, parameters: dict = None):
        """Cypher 쿼리 실행"""
        if not self.driver:
            if not self.connect():
                return None
        
        try:
            with self.driver.session() as session:
                result = session.run(query, parameters or {})
                return [record.data() for record in result]
        except Exception as e:
            print(f"쿼리 실행 실패: {e}")
            return None
    
    def get_graph_data(self, limit: int = 100):
        """그래프 데이터 조회 (노드 및 관계)"""
        query = """
        MATCH (n)-[r]->(m)
        RETURN n, r, m
        LIMIT $limit
        """
        return self.execute_query(query, {"limit": limit})
    
    def get_nodes(self, limit: int = 100):
        """모든 노드 조회"""
        query = """
        MATCH (n)
        RETURN n
        LIMIT $limit
        """
        return self.execute_query(query, {"limit": limit})
    
    def search_nodes(self, search_term: str, limit: int = 50):
        """노드 검색"""
        query = """
        MATCH (n)
        WHERE toLower(toString(n.name)) CONTAINS toLower($search_term)
           OR toLower(toString(n.title)) CONTAINS toLower($search_term)
        RETURN n
        LIMIT $limit
        """
        return self.execute_query(query, {"search_term": search_term, "limit": limit})


# 전역 인스턴스
db = Neo4jDriver()
