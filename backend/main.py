"""
FastAPI 메인 애플리케이션
Neo4j 연동 API 엔드포인트
백엔드 전문가 CTO 관점에서 개선된 버전
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from typing import List, Optional
from .models import GraphData, ChatMessage, ChatResponse
from .service import (
    get_graph_data,
    search_graph,
    chat_with_graph,
    reset_chat,
    get_node_detail,
    get_ego_graph,
    get_statistics
)
from .database import db, Neo4jConnectionError, ConnectionStatus
from .config import config
from .graph_analysis import run_analysis
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Graph DB API",
    version="1.0.0",
    description="Neo4j 기반 그래프 데이터베이스 시각화 및 챗봇 API"
)

# CORS 설정 (협업 코드: credentials 사용 시 origin은 * 불가, config 기반)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class CORSOnErrorMiddleware(BaseHTTPMiddleware):
    """
    ㅇ 500/예외 응답에도 CORS 헤더를 붙여 브라우저가 CORS로 막지 않고
    실제 오류 메시지를 받을 수 있게 함 (CTO 관점: 협업/디버깅).
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        origin = request.headers.get("origin")
        if not origin:
            return response
        if response.headers.get("Access-Control-Allow-Origin"):
            return response
        if origin in config.CORS_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response


app.add_middleware(CORSOnErrorMiddleware)


@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 Neo4j 연결"""
    try:
        if db.connect():
            logger.info("Neo4j 연결 성공")
        else:
            logger.error("Neo4j 연결 실패 - 시작 시 재시도")
            # 시작 시 실패해도 계속 진행 (지연 연결)
    except Exception as e:
        logger.error(f"시작 시 오류: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 Neo4j 연결 종료"""
    db.close()
    logger.info("Neo4j 연결 종료")


@app.exception_handler(Neo4jConnectionError)
async def neo4j_connection_exception_handler(request, exc: Neo4jConnectionError):
    """Neo4j 연결 오류 전용 핸들러"""
    status_code = 503  # Service Unavailable
    if exc.status == ConnectionStatus.AUTH_FAILED:
        status_code = 401  # Unauthorized
    
    return JSONResponse(
        status_code=status_code,
        content={
            "error": "neo4j_connection_error",
            "message": exc.message,
            "status": exc.status.value,
            "detail": "Neo4j 데이터베이스 연결에 실패했습니다."
        }
    )


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
    """
    헬스 체크 (Neo4j 연결 상태 포함)
    개선된 버전: 구체적인 상태 정보 제공
    """
    try:
        # Neo4j 연결 상태 확인
        connection_status = db.get_connection_status()
        
        if connection_status["connected"]:
            # 실제 쿼리 테스트
            try:
                with db.get_session() as session:
                    session.run("RETURN 1")
                return {
                    "status": "healthy",
                    "neo4j": "connected",
                    "connection_info": {
                        "status": connection_status["status"],
                        "uri": connection_status.get("uri", "masked")
                    }
                }
            except Exception as e:
                logger.warning(f"헬스 체크 쿼리 실패: {e}")
                return {
                    "status": "degraded",
                    "neo4j": "connected_but_unstable",
                    "connection_info": connection_status,
                    "warning": "연결은 되어 있지만 쿼리 실행에 문제가 있습니다."
                }
        else:
            # 연결 실패 정보 제공
            error_info = connection_status.get("error", {})
            return {
                "status": "unhealthy",
                "neo4j": connection_status["status"],
                "connection_info": connection_status,
                "error": {
                    "message": error_info.get("message", "연결 실패"),
                    "type": error_info.get("type", "unknown"),
                    "suggestion": _get_error_suggestion(connection_status["status"])
                }
            }
    except Exception as e:
        logger.error(f"헬스 체크 실패: {e}")
        return {
            "status": "unhealthy",
            "neo4j": "unknown",
            "error": {
                "message": f"헬스 체크 중 오류 발생: {str(e)}",
                "type": "health_check_error"
            }
        }


def _get_error_suggestion(status: str) -> str:
    """에러 타입에 따른 해결 방법 제안"""
    suggestions = {
        ConnectionStatus.AUTH_FAILED.value: "Neo4j 사용자명과 비밀번호를 확인하세요.",
        ConnectionStatus.NETWORK_ERROR.value: "Neo4j 서버가 실행 중인지 확인하고 네트워크 연결을 확인하세요.",
        ConnectionStatus.DISCONNECTED.value: "Neo4j 서버에 연결할 수 없습니다. 서버 상태를 확인하세요.",
        ConnectionStatus.UNKNOWN_ERROR.value: "알 수 없는 오류입니다. 로그를 확인하세요."
    }
    return suggestions.get(status, "Neo4j 연결 설정을 확인하세요.")


@app.get("/api/graph", response_model=GraphData)
async def get_graph(
    limit: int = Query(config.DEFAULT_QUERY_LIMIT, ge=1, le=config.MAX_QUERY_LIMIT, description="최대 반환 개수"),
    skip: int = Query(0, ge=0, description="건너뛸 관계 행 수 (더 보기)"),
    node_labels: Optional[List[str]] = Query(None, description="필터링할 노드 라벨"),
    relationship_types: Optional[List[str]] = Query(None, description="필터링할 관계 타입"),
    node_cap: Optional[int] = Query(None, description="노드 수 상한. 지정 시 서버에서 캡·엣지 일관성 적용 (vis 마이그레이션)"),
):
    """
    그래프 데이터 조회
    
    - **limit**: 최대 반환 관계 행 수 (1-1000)
    - **skip**: 건너뛸 관계 행 수 (더 보기 시 사용)
    - **node_labels**: 필터링할 노드 라벨 (예: Company, Person)
    - **relationship_types**: 필터링할 관계 타입
    - **node_cap**: 노드 수 상한. 있으면 서버가 캡 적용 후 일관된 엣지만 반환.
    """
    try:
        return get_graph_data(limit, node_labels, relationship_types, skip=skip, node_cap=node_cap)
    except Neo4jConnectionError as e:
        logger.error(f"그래프 데이터 조회 실패 (연결 오류): {e}")
        raise
    except Exception as e:
        logger.error(f"그래프 데이터 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"그래프 데이터 조회 실패: {str(e)}"
        )


@app.get("/api/graph/analysis")
async def get_graph_with_analysis(
    limit: int = Query(config.DEFAULT_QUERY_LIMIT, ge=1, le=config.MAX_QUERY_LIMIT, description="최대 반환 개수"),
    skip: int = Query(0, ge=0, description="건너뛸 관계 행 수"),
    node_labels: Optional[List[str]] = Query(None, description="필터링할 노드 라벨"),
    relationship_types: Optional[List[str]] = Query(None, description="필터링할 관계 타입"),
    node_cap: Optional[int] = Query(None, description="노드 수 상한"),
    include_betweenness: bool = Query(False, description="betweenness_centrality 포함 (대형 그래프 시 비활성 권장)"),
):
    """
    그래프 데이터 + NetworkX 분석 결과 조회 (Neo4j 조회 후 인메모리 분석).

    - **limit**, **skip**, **node_labels**, **relationship_types**, **node_cap**: GET /api/graph 와 동일.
    - **include_betweenness**: True 시 betweenness_centrality 계산 (노드/엣지 많으면 느림).
    - 응답: `{ "graph": GraphData, "analysis": { degree_centrality, pagerank, n_weakly_connected_components, ... } }`
    """
    import time
    start_time = time.time()
    try:
        # Neo4j 쿼리 시간 측정 (CTO: 성능 진단)
        query_start = time.time()
        graph_data = get_graph_data(limit, node_labels, relationship_types, skip=skip, node_cap=node_cap)
        query_time = time.time() - query_start
        logger.info(f"[Performance] Neo4j 쿼리 시간: {query_time:.2f}초 (limit={limit}, node_cap={node_cap}, nodes={len(graph_data.nodes)}, edges={len(graph_data.edges)})")
        
        # NetworkX 분석 시간 측정 (CTO: 성능 진단)
        analysis_start = time.time()
        analysis = run_analysis(
            graph_data,
            include_degree=True,
            include_pagerank=True,
            include_betweenness=include_betweenness,
            include_components=True,
            use_edge_weight=True,
        )
        analysis_time = time.time() - analysis_start
        logger.info(f"[Performance] NetworkX 분석 시간: {analysis_time:.2f}초")
        
        total_time = time.time() - start_time
        logger.info(f"[Performance] 총 처리 시간: {total_time:.2f}초")
        
        return {"graph": graph_data.model_dump(), "analysis": analysis}
    except Neo4jConnectionError as e:
        elapsed = time.time() - start_time
        logger.error(f"[Performance] 그래프 분석 조회 실패 (연결 오류, 소요 시간: {elapsed:.2f}초): {e}")
        raise
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[Performance] 그래프 분석 조회 실패 (소요 시간: {elapsed:.2f}초): {e}")
        raise HTTPException(
            status_code=500,
            detail=f"그래프 분석 조회 실패: {str(e)}"
        )


@app.get("/api/graph/search", response_model=GraphData)
async def search_graph_endpoint(
    search: str = Query(..., description="검색어"),
    limit: int = Query(config.DEFAULT_SEARCH_LIMIT, ge=1, le=config.MAX_SEARCH_LIMIT, description="최대 반환 개수"),
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
    except Neo4jConnectionError as e:
        logger.error(f"그래프 검색 실패 (연결 오류): {e}")
        raise
    except Exception as e:
        logger.error(f"그래프 검색 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"그래프 검색 실패: {str(e)}"
        )


@app.get("/api/node/{node_id}")
async def get_node(
    node_id: str,
    id_property: Optional[str] = Query(None, description="ID 속성(bizno/personId). 없으면 자동 감지")
):
    """
    노드 상세 정보 조회
    
    - **node_id**: 노드 ID (bizno 또는 personId 값)
    - **id_property**: ID 속성 이름. 미지정 시 bizno → personId 순으로 자동 감지
    """
    try:
        result = get_node_detail(node_id, id_property)
        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"노드를 찾을 수 없습니다: {node_id}"
            )
        return result
    except Neo4jConnectionError as e:
        logger.error(f"노드 조회 실패 (연결 오류): {e}")
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"노드 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"노드 조회 실패: {str(e)}"
        )


@app.get("/api/node/{node_id}/ego", response_model=GraphData)
async def get_ego_graph_endpoint(
    node_id: str,
    depth: int = Query(1, ge=1, le=3, description="탐색 깊이"),
    limit: int = Query(100, ge=1, le=500, description="최대 반환 개수"),
    id_property: str = Query("id", description="ID 속성(bizno/personId)")
):
    """
    Ego 그래프 조회 (특정 노드를 중심으로 한 서브그래프)
    
    - **node_id**: 중심 노드 ID
    - **depth**: 탐색 깊이 (1-3)
    - **limit**: 최대 반환 개수 (1-500)
    - **id_property**: bizno 또는 personId
    """
    try:
        return get_ego_graph(node_id, depth, limit, id_property)
    except Neo4jConnectionError as e:
        logger.error(f"Ego 그래프 조회 실패 (연결 오류): {e}")
        raise
    except Exception as e:
        logger.error(f"Ego 그래프 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Ego 그래프 조회 실패: {str(e)}"
        )


@app.get("/api/statistics")
async def get_statistics_endpoint():
    """
    그래프 통계 조회
    
    - 노드 수, 관계 수, 라벨별 통계 등
    """
    try:
        stats = get_statistics()
        if not stats:
            raise HTTPException(
                status_code=404,
                detail="통계 데이터를 찾을 수 없습니다."
            )
        return stats
    except Neo4jConnectionError as e:
        logger.error(f"통계 조회 실패 (연결 오류): {e}")
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"통계 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"통계 조회 실패: {str(e)}"
        )


@app.get("/stats")
async def get_stats_legacy():
    """
    레거시 엔드포인트: /stats -> /api/statistics로 리다이렉트
    협업 코드 고려: 하위 호환성을 위해 유지
    """
    try:
        stats = get_statistics()
        if not stats:
            raise HTTPException(
                status_code=404,
                detail="통계 데이터를 찾을 수 없습니다."
            )
        return stats
    except Neo4jConnectionError as e:
        logger.error(f"통계 조회 실패 (연결 오류): {e}")
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"통계 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"통계 조회 실패: {str(e)}"
        )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    """
    챗봇 메시지 처리 (참조 ask_graph 흐름: Cypher 생성·실행·결과 기반 답변)
    
    - **message**: 사용자 메시지
    - **context**: 컨텍스트 정보 (선택 노드 node_id 등)
    """
    try:
        result = chat_with_graph(message.message, message.context)
        return ChatResponse(**result)
    except Neo4jConnectionError as e:
        logger.error(f"챗봇 처리 실패 (연결 오류): {e}")
        # 챗봇은 연결 오류가 있어도 기본 응답 제공
        return ChatResponse(
            response=f"죄송합니다. 현재 Neo4j 데이터베이스에 연결할 수 없어 그래프 정보를 활용할 수 없습니다. {e.message}",
            graph_data=None
        )
    except Exception as e:
        logger.error(f"챗봇 처리 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"챗봇 처리 실패: {str(e)}"
        )


@app.post("/api/chat/reset")
async def chat_reset():
    """서버 측 AI 대화 이력 초기화 (참조 서비스 reset_chat 호환)"""
    reset_chat()
    return {"ok": True}


@app.get("/api/connection/status")
async def get_connection_status():
    """
    Neo4j 연결 상태 상세 정보 조회
    
    디버깅 및 모니터링용 엔드포인트
    """
    return db.get_connection_status()
