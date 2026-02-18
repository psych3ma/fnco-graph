"""FastAPI 백엔드와 통신하는 클라이언트"""
import requests
import os
from typing import Dict, Any, Optional

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def get_graph_data(limit: int = 100) -> Dict[str, Any]:
    """그래프 데이터 조회"""
    try:
        response = requests.get(f"{API_BASE_URL}/api/graph", params={"limit": limit})
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"그래프 데이터 조회 실패: {e}")
        return {"nodes": [], "edges": []}


def search_graph(search_term: str, limit: int = 50) -> Dict[str, Any]:
    """그래프 검색"""
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/graph/search",
            params={"search": search_term, "limit": limit}
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"그래프 검색 실패: {e}")
        return {"nodes": [], "edges": []}


def send_chat_message(message: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """챗봇 메시지 전송"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/chat",
            json={"message": message, "context": context or {}}
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"챗봇 메시지 전송 실패: {e}")
        return {"response": f"오류가 발생했습니다: {str(e)}", "graph_data": None}
