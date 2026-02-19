#!/usr/bin/env bash
# 백엔드 서버 상태 확인 스크립트
# zsh 호환성 고려

set -e

# zsh에서 bash 모드로 실행되도록 보장
if [ -n "$ZSH_VERSION" ]; then
    emulate -L bash
fi

PORT=8000
API_URL="http://localhost:$PORT"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 백엔드 서버 상태 확인${NC}"
echo ""

# 포트 사용 확인
echo -e "${YELLOW}1. 포트 $PORT 사용 확인${NC}"
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    PID=$(lsof -ti :$PORT)
    PROCESS_INFO=$(ps -p $PID -o comm=,args= 2>/dev/null || echo "알 수 없음")
    echo -e "${GREEN}   ✅ 포트 $PORT 사용 중${NC}"
    echo -e "${GREEN}   프로세스 ID: $PID${NC}"
    echo -e "${GREEN}   프로세스: $PROCESS_INFO${NC}"
else
    echo -e "${RED}   ❌ 포트 $PORT 사용 안 함${NC}"
    exit 1
fi

echo ""

# 헬스 체크
echo -e "${YELLOW}2. 헬스 체크${NC}"
HEALTH_RESPONSE=$(curl -s "$API_URL/health" 2>/dev/null || echo "")
if [ -n "$HEALTH_RESPONSE" ]; then
    echo -e "${GREEN}   ✅ 헬스 체크 성공${NC}"
    echo -e "${BLUE}   응답: $HEALTH_RESPONSE${NC}"
else
    echo -e "${RED}   ❌ 헬스 체크 실패${NC}"
fi

echo ""

# 연결 상태 확인
echo -e "${YELLOW}3. 연결 상태 확인${NC}"
CONNECTION_RESPONSE=$(curl -s "$API_URL/api/connection/status" 2>/dev/null || echo "")
if [ -n "$CONNECTION_RESPONSE" ]; then
    echo -e "${GREEN}   ✅ 연결 상태 확인 성공${NC}"
    echo -e "${BLUE}   응답: $CONNECTION_RESPONSE${NC}"
else
    echo -e "${RED}   ❌ 연결 상태 확인 실패${NC}"
fi

echo ""
echo -e "${GREEN}✅ 상태 확인 완료${NC}"
