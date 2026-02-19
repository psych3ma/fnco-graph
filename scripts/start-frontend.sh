#!/usr/bin/env bash
# 프론트엔드 웹앱 서버 시작 스크립트
# 협업 코드 고려: 명확한 에러 메시지 및 자동화

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 루트 디렉토리
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${PROJECT_ROOT}/frontend/webapp"
PORT=8080

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     프론트엔드 웹앱 서버 시작                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 포트 확인
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    PID=$(lsof -ti :$PORT)
    echo -e "${YELLOW}⚠️  포트 $PORT가 이미 사용 중입니다.${NC}"
    echo -e "${BLUE}프로세스 ID: $PID${NC}"
    echo ""
    echo -e "${YELLOW}기존 프로세스를 종료하고 새로 시작하시겠습니까? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}기존 프로세스 종료 중...${NC}"
        kill -9 $PID 2>/dev/null || true
        sleep 1
    else
        echo -e "${GREEN}기존 서버를 사용합니다: http://localhost:$PORT${NC}"
        exit 0
    fi
fi

# 디렉토리 확인
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ 프론트엔드 디렉토리를 찾을 수 없습니다: $FRONTEND_DIR${NC}"
    exit 1
fi

# Python 확인
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3가 설치되어 있지 않습니다.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Python3 확인됨${NC}"
echo ""

# 서버 시작
cd "$FRONTEND_DIR"

echo -e "${BLUE}프론트엔드 서버 시작 중...${NC}"
echo -e "${GREEN}서버 URL: http://localhost:$PORT${NC}"
echo -e "${YELLOW}종료하려면 Ctrl+C를 누르세요${NC}"
echo ""

# Python HTTP 서버 시작
python3 -m http.server $PORT
