"""
FastAPI 메인 애플리케이션
Neo4j 연동 API 엔드포인트
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from .models import GraphData, ChatMessage, ChatResponse
from .service import (
    get_graph_data,
    search_graph,
    chat_with_graph,
    get_node_detail,
    get_ego_graph,
    get_statistics
)
from .database import db
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Graph DB API",
    version="1.0.0",
    description="Neo4j 기반 그래프 데이터베이스 시각화 및 챗봇 API"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 특정 도메인으로 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 Neo4j 연결"""
    try:
        if db.connect():
            logger.info("Neo4j 연결 성공")
        else:
            logger.error("Neo4j 연결 실패")
    except Exception as e:
        logger.error(f"시작 시 오류: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 Neo4j 연결 종료"""
    db.close()
    logger.info("Neo4j 연결 종료")


@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {
        "message": "Graph DB API",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """헬스 체크 (Neo4j 연결 상태 포함)"""
    try:
        # Neo4j 연결 테스트
        with db.get_session() as session:
            session.run("RETURN 1")
        return {
            "status": "healthy",
            "neo4j": "connected"
        }
    except Exception as e:
        logger.error(f"헬스 체크 실패: {e}")
        return {
            "status": "unhealthy",
            "neo4j": "disconnected",
            "error": str(e)
        }


@app.get("/api/graph", response_model=GraphData)
async def get_graph(
    limit: int = Query(100, ge=1, le=1000, description="최대 반환 개수"),
    node_labels: Optional[List[str]] = Query(None, description="필터링할 노드 라벨"),
    relationship_types: Optional[List[str]] = Query(None, description="필터링할 관계 타입")
):
    """
    그래프 데이터 조회
    
    - **limit**: 최대 반환 개수 (1-1000)
    - **node_labels**: 필터링할 노드 라벨 (예: Company, Person)
    - **relationship_types**: 필터링할 관계 타입
    """
    try:
        return get_graph_data(limit, node_labels, relationship_types)
    except Exception as e:
        logger.error(f"그래프 데이터 조회 실패: {e}")
        raise HTTPException(status_code=500, detail=f"그래프 데이터 조회 실패: {str(e)}")


@app.get("/api/graph/search", response_model=GraphData)
async def search_graph_endpoint(
    search: str = Query(..., description="검색어"),
    limit: int = Query(50, ge=1, le=200, description="최대 반환 개수"),
    search_properties: Optional[List[str]] = Query(None, description="검색할 속성 리스트")
):
    """
    그래프 검색
    
    - **search**: 검색어
    - **limit**: 최대 반환 개수 (1-200)
    - **search_properties**: 검색할 속성 리스트 (기본값: name, title, id)
    """
    try:
        return search_graph(search, limit, search_properties)
    except Exception as e:
        logger.error(f"그래프 검색 실패: {e}")
        raise HTTPException(status_code=500, detail=f"그래프 검색 실패: {str(e)}")


@app.get("/api/node/{node_id}")
async def get_node(
    node_id: str,
    id_property: str = Query("id", description="ID로 사용할 property 이름")
):
    """
    노드 상세 정보 조회
    
    - **node_id**: 노드 ID
    - **id_property**: ID로 사용할 property 이름 (기본값: id)
    """
    try:
        result = get_node_detail(node_id, id_property)
        if not result:
            raise HTTPException(status_code=404, detail=f"노드를 찾을 수 없습니다: {node_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"노드 상세 정보 조회 실패: {e}")
        raise HTTPException(status_code=500, detail=f"노드 조회 실패: {str(e)}")


@app.get("/api/node/{node_id}/ego", response_model=GraphData)
async def get_ego_graph_endpoint(
    node_id: str,
    depth: int = Query(1, ge=1, le=3, description="탐색 깊이"),
    limit: int = Query(100, ge=1, le=500, description="최대 반환 개수"),
    id_property: str = Query("id", description="ID로 사용할 property 이름")
):
    """
    Ego 그래프 조회 (특정 노드를 중심으로 한 서브그래프)
    
    - **node_id**: 중심 노드 ID
    - **depth**: 탐색 깊이 (1-3)
    - **limit**: 최대 반환 개수 (1-500)
    """
    try:
        return get_ego_graph(node_id, depth, limit)
    except Exception as e:
        logger.error(f"Ego 그래프 조회 실패: {e}")
        raise HTTPException(status_code=500, detail=f"Ego 그래프 조회 실패: {str(e)}")


@app.get("/api/statistics")
async def get_statistics_endpoint():
    """
    그래프 통계 조회
    
    - 노드 수, 관계 수, 라벨별 통계 등
    """
    try:
        stats = get_statistics()
        if not stats:
            raise HTTPException(status_code=404, detail="통계 데이터를 찾을 수 없습니다.")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"통계 조회 실패: {e}")
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {str(e)}")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    """
    챗봇 메시지 처리
    
    - **message**: 사용자 메시지
    - **context**: 컨텍스트 정보 (선택 노드 등)
    """
    try:
        result = chat_with_graph(message.message, message.context)
        return ChatResponse(**result)
    except Exception as e:
        logger.error(f"챗봇 처리 실패: {e}")
        raise HTTPException(status_code=500, detail=f"챗봇 처리 실패: {str(e)}")
