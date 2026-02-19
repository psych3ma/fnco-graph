# Neo4j 전문가 출신 CTO 관점: 그래프 미표시 및 CORS 검토 (협업 코드)

## 1. 현상

- 하이브리드 로딩 UI는 정상 표시 (서버 연결 → 데이터 조회 단계)
- `/health` 성공
- **`/api/graph` 요청이 CORS로 차단** → 노드 0개, 링크 0개 → 그래프 미표시
- `/api/statistics`는 성공

## 2. 원인

- 브라우저 콘솔:  
  `Access to fetch at 'http://localhost:8000/api/graph?...' from origin 'http://localhost:8080' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- **근본 원인**: `allow_credentials=True`와 `allow_origins=["*"]`를 함께 사용함.  
  브라우저 스펙상 credentials 요청에서는 `*`를 허용하지 않으므로, 일부 요청에서 CORS 헤더가 유효하지 않게 됨.

## 3. 조치 (적용 완료)

### 3.1 CORS origin 명시 (backend)

- **변경 전**: `allow_origins=["*"]` + `allow_credentials=True` (조합 불가)
- **변경 후**: 허용 origin을 명시한 목록 사용
  - `config.CORS_ORIGINS`: `http://localhost:8080`, `http://127.0.0.1:8080`, `http://localhost:3000`, `http://127.0.0.1:3000`
  - `allow_credentials=True` 유지

### 3.2 설정 중앙화 (협업 코드)

- `backend/config.py`에 `CORS_ORIGINS` 추가
- 환경 변수 `CORS_ORIGINS`로 확장 가능 (쉼표 구분)
  - 예: `CORS_ORIGINS=https://app.example.com,https://admin.example.com`
- `backend/main.py`는 `config.CORS_ORIGINS`만 참조

## 4. 적용 후 확인 방법

1. **백엔드 재시작** (CORS 설정 반영)
   ```bash
   ./scripts/stop-backend.sh
   ./scripts/start-backend.sh
   ```
2. **프론트 새로고침** (http://localhost:8080)
3. **기대 결과**
   - `/api/graph` CORS 차단 해소
   - 노드/링크 수 > 0
   - 그래프 캔버스에 노드·엣지 표시

## 5. 협업/운영 시 참고

- **프로덕션**: `.env`에 `CORS_ORIGINS` 설정해 프론트 도메인만 허용
- **신규 프론트 포트/도메인**: `config.CORS_ORIGINS` 기본 목록 또는 `CORS_ORIGINS` env에 추가
- **Neo4j**: CORS는 브라우저↔백엔드만 해당, Neo4j 통신에는 영향 없음

이 수정으로 동일 CORS 정책 하에서 `/api/graph`가 정상 응답하고, 그래프가 표시되어야 합니다.
