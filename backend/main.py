"""FastAPI 메인 애플리케이션"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .models import GraphData, ChatMessage, ChatResponse
from .service import get_graph_data, search_graph, chat_with_graph
from .database import db

app = FastAPI(title="Graph DB API", version="1.0.0")

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
    db.connect()


@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 Neo4j 연결 종료"""
    db.close()


@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {"message": "Graph DB API", "status": "running"}


@app.get("/health")
async def health():
    """헬스 체크"""
    return {"status": "healthy"}


@app.get("/api/graph", response_model=GraphData)
async def get_graph(limit: int = 100):
    """그래프 데이터 조회"""
    return get_graph_data(limit)


@app.get("/api/graph/search", response_model=GraphData)
async def search_graph_endpoint(search: str, limit: int = 50):
    """그래프 검색"""
    return search_graph(search, limit)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    """챗봇 메시지 처리"""
    result = chat_with_graph(message.message, message.context)
    return ChatResponse(**result)
