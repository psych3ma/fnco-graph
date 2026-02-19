"""
애플리케이션 설정 관리 모듈
CTO 관점에서 작성된 중앙화된 설정 관리
"""
import os
from typing import List, Dict, Any
from dotenv import load_dotenv
from enum import Enum

load_dotenv()


class NodeLabel(str, Enum):
    """Neo4j 노드 라벨 열거형"""
    COMPANY = "Company"
    PERSON = "Person"
    STOCKHOLDER = "Stockholder"
    LEGAL_ENTITY = "LegalEntity"
    ACTIVE = "Active"
    CLOSED = "Closed"
    MAJOR_SHAREHOLDER = "MajorShareholder"


class RelationshipType(str, Enum):
    """Neo4j 관계 타입 열거형"""
    HOLDS_SHARES = "HOLDS_SHARES"
    HAS_COMPENSATION = "HAS_COMPENSATION"


class NodeProperty(str, Enum):
    """노드 속성 이름 열거형"""
    # Company 속성
    BIZNO = "bizno"
    COMPANY_NAME = "companyName"
    COMPANY_NAME_NORMALIZED = "companyNameNormalized"
    
    # Person 속성
    PERSON_ID = "personId"
    STOCK_NAME = "stockName"
    STOCK_NAME_NORMALIZED = "stockNameNormalized"
    
    # 공통 속성
    DISPLAY_NAME = "displayName"
    LABELS = "labels"


class RelationshipProperty(str, Enum):
    """관계 속성 이름 열거형"""
    STOCK_RATIO = "stockRatio"
    BASE_DATE = "baseDate"
    STOCK_COUNT = "stockCount"
    VOTING_POWER = "votingPower"
    PCT = "pct"  # 호환성을 위한 별칭


class AppConfig:
    """애플리케이션 설정 클래스"""
    
    def __init__(self):
        # Neo4j 설정
        self.NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
        self.NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "")
        
        # API 설정
        self.API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
        self.API_PORT: int = int(os.getenv("API_PORT", "8000"))
        
        # OpenAI 설정
        self.OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
        self.OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
        
        # Streamlit 설정
        self.STREAMLIT_PORT: int = int(os.getenv("STREAMLIT_PORT", "8501"))
        
        # 기본 관계 타입 (확장 가능)
        self.DEFAULT_RELATIONSHIP_TYPES: List[str] = [
            RelationshipType.HOLDS_SHARES.value,
            RelationshipType.HAS_COMPENSATION.value
        ]
        
        # 기본 검색 속성 (확장 가능)
        self.DEFAULT_SEARCH_PROPERTIES: List[str] = [
            NodeProperty.COMPANY_NAME.value,
            NodeProperty.COMPANY_NAME_NORMALIZED.value,
            NodeProperty.STOCK_NAME.value,
            NodeProperty.STOCK_NAME_NORMALIZED.value,
            NodeProperty.BIZNO.value,
            NodeProperty.PERSON_ID.value
        ]
        
        # 노드 라벨 우선순위 (표시용)
        self.LABEL_PRIORITY: List[str] = [
            NodeLabel.COMPANY.value,
            NodeLabel.PERSON.value,
            NodeLabel.STOCKHOLDER.value,
            NodeLabel.LEGAL_ENTITY.value
        ]
        
        # 노드 ID 속성 매핑 (라벨별)
        self.NODE_ID_PROPERTIES: Dict[str, str] = {
            NodeLabel.COMPANY.value: NodeProperty.BIZNO.value,
            NodeLabel.PERSON.value: NodeProperty.PERSON_ID.value,
            NodeLabel.STOCKHOLDER.value: NodeProperty.BIZNO.value,  # Company 또는 Person
        }
        
        # 노드 표시 이름 속성 매핑 (라벨별)
        self.NODE_DISPLAY_NAME_PROPERTIES: Dict[str, List[str]] = {
            NodeLabel.COMPANY.value: [NodeProperty.COMPANY_NAME.value, NodeProperty.BIZNO.value],
            NodeLabel.PERSON.value: [NodeProperty.STOCK_NAME.value, NodeProperty.PERSON_ID.value],
        }
        
        # 쿼리 제한값
        self.MAX_QUERY_LIMIT: int = 1000
        self.DEFAULT_QUERY_LIMIT: int = 100
        self.MAX_SEARCH_LIMIT: int = 200
        self.DEFAULT_SEARCH_LIMIT: int = 50
        
        # 연결 설정
        self.MAX_CONNECTION_RETRIES: int = 3
        self.CONNECTION_TIMEOUT: int = 10
        self.CONNECTION_ACQUISITION_TIMEOUT: int = 30
        self.MAX_CONNECTION_LIFETIME: int = 3600
        self.MAX_CONNECTION_POOL_SIZE: int = 50
        
        # CORS 허용 origin (협업/프로덕션: env로 확장 가능)
        _env_origins = os.getenv("CORS_ORIGINS", "").strip()
        self.CORS_ORIGINS: List[str] = (
            [o.strip() for o in _env_origins.split(",") if o.strip()]
            if _env_origins
            else [
                "http://localhost:8080",
                "http://127.0.0.1:8080",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        )
    
    @property
    def API_BASE_URL(self) -> str:
        """API Base URL (동적 생성)"""
        return os.getenv("API_BASE_URL", f"http://{self.API_HOST}:{self.API_PORT}")


# 싱글톤 인스턴스
config = AppConfig()
