#!/usr/bin/env bash
# 백엔드 QA 스크립트
# CTO 관점에서 작성된 종합 테스트 도구

set -e

PORT=${API_PORT:-8000}
API_URL="http://localhost:$PORT"
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PATH="$BACKEND_DIR/backend"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}           백엔드 QA 테스트 (CTO 관점)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 테스트 결과 추적
TESTS_PASSED=0
TESTS_FAILED=0
ISSUES_FOUND=()

# 함수: 테스트 결과 기록
record_test() {
    local test_name="$1"
    local status="$2"
    local message="$3"
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}   ✅ $test_name${NC}"
        if [ -n "$message" ]; then
            echo -e "${BLUE}      $message${NC}"
        fi
        ((TESTS_PASSED++))
    else
        echo -e "${RED}   ❌ $test_name${NC}"
        if [ -n "$message" ]; then
            echo -e "${RED}      $message${NC}"
        fi
        ((TESTS_FAILED++))
        ISSUES_FOUND+=("$test_name: $message")
    fi
}

# 1. Python 의존성 확인
echo -e "${YELLOW}1. Python 의존성 확인${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    record_test "Python 설치 확인" "PASS" "버전: $PYTHON_VERSION"
else
    record_test "Python 설치 확인" "FAIL" "Python3가 설치되어 있지 않습니다"
    exit 1
fi

# 필수 패키지 확인
REQUIRED_PACKAGES=("fastapi" "uvicorn" "neo4j" "pydantic" "python-dotenv" "openai")
for package in "${REQUIRED_PACKAGES[@]}"; do
    if python3 -c "import $package" 2>/dev/null; then
        record_test "패키지: $package" "PASS" ""
    else
        record_test "패키지: $package" "FAIL" "설치되지 않음"
    fi
done

echo ""

# 2. 설정 파일 확인
echo -e "${YELLOW}2. 설정 파일 확인${NC}"
if [ -f "$BACKEND_DIR/.env" ]; then
    record_test ".env 파일 존재" "PASS" ""
    
    # 필수 환경 변수 확인
    source "$BACKEND_DIR/.env" 2>/dev/null || true
    if [ -n "$NEO4J_URI" ]; then
        record_test "NEO4J_URI 설정" "PASS" ""
    else
        record_test "NEO4J_URI 설정" "FAIL" "환경 변수가 설정되지 않음"
    fi
    
    if [ -n "$NEO4J_USER" ]; then
        record_test "NEO4J_USER 설정" "PASS" ""
    else
        record_test "NEO4J_USER 설정" "FAIL" "환경 변수가 설정되지 않음"
    fi
else
    record_test ".env 파일 존재" "FAIL" ".env 파일이 없습니다"
fi

if [ -f "$BACKEND_PATH/config.py" ]; then
    record_test "config.py 존재" "PASS" ""
else
    record_test "config.py 존재" "FAIL" "config.py 파일이 없습니다"
fi

echo ""

# 3. 코드 품질 검사 (Import 오류 확인)
echo -e "${YELLOW}3. 코드 품질 검사${NC}"

# Python 경로 설정
export PYTHONPATH="$BACKEND_DIR:$PYTHONPATH"

# config 모듈 테스트
if python3 -c "import sys; sys.path.insert(0, '$BACKEND_DIR'); from backend.config import config; print('OK')" 2>&1 | grep -q "OK"; then
    record_test "config 모듈 import" "PASS" ""
else
    ERROR=$(python3 -c "import sys; sys.path.insert(0, '$BACKEND_DIR'); from backend.config import config" 2>&1)
    record_test "config 모듈 import" "FAIL" "$ERROR"
fi

# database 모듈 테스트
if python3 -c "import sys; sys.path.insert(0, '$BACKEND_DIR'); from backend.database import db" 2>&1 | grep -q "OK\|^$"; then
    record_test "database 모듈 import" "PASS" ""
else
    ERROR=$(python3 -c "import sys; sys.path.insert(0, '$BACKEND_DIR'); from backend.database import db" 2>&1 | head -3)
    record_test "database 모듈 import" "FAIL" "$ERROR"
fi

# service 모듈 테스트
if python3 -c "import sys; sys.path.insert(0, '$BACKEND_DIR'); from backend.service import get_graph_data" 2>&1 | grep -q "OK\|^$"; then
    record_test "service 모듈 import" "PASS" ""
else
    ERROR=$(python3 -c "import sys; sys.path.insert(0, '$BACKEND_DIR'); from backend.service import get_graph_data" 2>&1 | head -3)
    record_test "service 모듈 import" "FAIL" "$ERROR"
fi

echo ""

# 4. 백엔드 서버 상태 확인
echo -e "${YELLOW}4. 백엔드 서버 상태 확인${NC}"

if lsof -i :$PORT >/dev/null 2>&1; then
    record_test "포트 $PORT 사용 중" "PASS" "서버가 실행 중입니다"
    SERVER_RUNNING=true
else
    record_test "포트 $PORT 사용 중" "FAIL" "서버가 실행되지 않았습니다"
    SERVER_RUNNING=false
    echo -e "${YELLOW}   💡 서버를 시작하려면: ./scripts/start-backend.sh${NC}"
fi

echo ""

# 5. API 엔드포인트 테스트 (서버가 실행 중인 경우)
if [ "$SERVER_RUNNING" = true ]; then
    echo -e "${YELLOW}5. API 엔드포인트 테스트${NC}"
    
    # 헬스 체크
    HEALTH=$(curl -s "$API_URL/health" 2>/dev/null || echo "")
    if [ -n "$HEALTH" ]; then
        record_test "GET /health" "PASS" "응답: $HEALTH"
    else
        record_test "GET /health" "FAIL" "응답 없음"
    fi
    
    # 연결 상태 확인
    CONN_STATUS=$(curl -s "$API_URL/api/connection/status" 2>/dev/null || echo "")
    if [ -n "$CONN_STATUS" ]; then
        record_test "GET /api/connection/status" "PASS" "상태: $CONN_STATUS"
    else
        record_test "GET /api/connection/status" "FAIL" "응답 없음"
    fi
    
    # 그래프 데이터 조회
    GRAPH_DATA=$(curl -s "$API_URL/api/graph?limit=5" 2>/dev/null || echo "")
    if [ -n "$GRAPH_DATA" ]; then
        NODE_COUNT=$(echo "$GRAPH_DATA" | grep -o '"id"' | wc -l | tr -d ' ')
        EDGE_COUNT=$(echo "$GRAPH_DATA" | grep -o '"source"' | wc -l | tr -d ' ')
        record_test "GET /api/graph" "PASS" "노드: $NODE_COUNT, 엣지: $EDGE_COUNT"
    else
        record_test "GET /api/graph" "FAIL" "응답 없음"
    fi
    
    echo ""
fi

# 6. 협업 코드 품질 검사
echo -e "${YELLOW}6. 협업 코드 품질 검사${NC}"

# 하드코딩 확인
HARDCODED_PORTS=$(grep -r "8000\|8501" "$BACKEND_PATH" --include="*.py" | grep -v "config.py\|.env\|#\|test" | wc -l | tr -d ' ')
if [ "$HARDCODED_PORTS" -eq 0 ]; then
    record_test "포트 하드코딩" "PASS" "하드코딩 없음"
else
    record_test "포트 하드코딩" "FAIL" "$HARDCODED_PORTS 개의 하드코딩 발견"
fi

# 설정 파일 사용 확인
CONFIG_USAGE=$(grep -r "from.*config import\|import.*config" "$BACKEND_PATH" --include="*.py" | wc -l | tr -d ' ')
if [ "$CONFIG_USAGE" -gt 0 ]; then
    record_test "설정 파일 사용" "PASS" "$CONFIG_USAGE 개 파일에서 사용"
else
    record_test "설정 파일 사용" "FAIL" "설정 파일을 사용하지 않음"
fi

# 에러 핸들링 확인
ERROR_HANDLING=$(grep -r "try:\|except\|raise\|HTTPException" "$BACKEND_PATH" --include="*.py" | wc -l | tr -d ' ')
if [ "$ERROR_HANDLING" -gt 10 ]; then
    record_test "에러 핸들링" "PASS" "충분한 에러 핸들링 ($ERROR_HANDLING 개)"
else
    record_test "에러 핸들링" "FAIL" "에러 핸들링 부족 ($ERROR_HANDLING 개)"
fi

echo ""

# 결과 요약
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                    테스트 결과 요약${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}✅ 통과: $TESTS_PASSED${NC}"
echo -e "${RED}❌ 실패: $TESTS_FAILED${NC}"
echo ""

if [ ${#ISSUES_FOUND[@]} -gt 0 ]; then
    echo -e "${YELLOW}발견된 문제:${NC}"
    for issue in "${ISSUES_FOUND[@]}"; do
        echo -e "${RED}   • $issue${NC}"
    done
    echo ""
fi

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 모든 테스트 통과!${NC}"
    exit 0
else
    echo -e "${RED}❌ 일부 테스트 실패${NC}"
    exit 1
fi
