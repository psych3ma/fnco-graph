# Graph DB Visualization & Chatbot Service

Streamlit + FastAPI + Neo4j + vis.js 기반 그래프 데이터베이스 시각화 및 챗봇 서비스

## 구조

- `backend/`: FastAPI 서버 (API 엔드포인트 및 비즈니스 로직)
- `frontend/`: Streamlit 웹 애플리케이션 (UI 및 시각화)

## 설치 및 실행

1. 의존성 설치:
```bash
pip install -r requirements.txt
```

2. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일을 편집하여 Neo4j 및 OpenAI 설정 입력
```

3. Neo4j 실행 (Docker 사용 시):
```bash
docker-compose up -d neo4j
```

4. Backend 서버 실행:
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

5. Frontend 실행:
```bash
cd frontend
streamlit run app.py
```

## Docker Compose로 전체 실행

```bash
docker-compose up
```
