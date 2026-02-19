#!/usr/bin/env bash
# E2E 테스트 실행 스크립트
# 프론트엔드 전문가 CTO 관점에서 작성

set -euo pipefail

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 프로젝트 루트 디렉토리
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_DIR="${PROJECT_ROOT}/tests/e2e"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     프론트엔드 E2E 테스트 실행                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. 백엔드 서버 상태 확인
echo -e "${YELLOW}[1/5] 백엔드 서버 상태 확인...${NC}"
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${RED}❌ 백엔드 서버가 실행 중이 아닙니다.${NC}"
    echo -e "${YELLOW}백엔드 서버를 시작하시겠습니까? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}백엔드 서버 시작 중...${NC}"
        "${PROJECT_ROOT}/scripts/start-backend.sh" &
        BACKEND_PID=$!
        echo -e "${GREEN}백엔드 서버 시작됨 (PID: $BACKEND_PID)${NC}"
        sleep 5
    else
        echo -e "${RED}백엔드 서버 없이 테스트를 진행합니다. 일부 테스트가 실패할 수 있습니다.${NC}"
    fi
else
    echo -e "${GREEN}✅ 백엔드 서버 실행 중${NC}"
fi

# 2. 프론트엔드 서버 상태 확인
echo -e "${YELLOW}[2/5] 프론트엔드 서버 상태 확인...${NC}"
if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo -e "${YELLOW}프론트엔드 서버가 실행 중이 아닙니다. 시작합니다...${NC}"
    cd "${PROJECT_ROOT}/frontend/webapp"
    python3 -m http.server 8080 > /dev/null 2>&1 &
    FRONTEND_PID=$!
    echo -e "${GREEN}프론트엔드 서버 시작됨 (PID: $FRONTEND_PID)${NC}"
    sleep 3
else
    echo -e "${GREEN}✅ 프론트엔드 서버 실행 중${NC}"
fi

# 3. Node.js 및 Playwright 확인
echo -e "${YELLOW}[3/5] Node.js 및 Playwright 확인...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js가 설치되어 있지 않습니다.${NC}"
    echo -e "${YELLOW}Node.js를 설치해주세요: https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js 버전: $NODE_VERSION${NC}"

# 4. 의존성 설치
echo -e "${YELLOW}[4/5] E2E 테스트 의존성 설치...${NC}"
cd "$E2E_DIR"

if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}npm 패키지 설치 중...${NC}"
    npm install
else
    echo -e "${GREEN}✅ 의존성 이미 설치됨${NC}"
fi

# Playwright 브라우저 설치 확인 및 자동 설치
echo -e "${YELLOW}[4/5] Playwright 브라우저 설치 확인...${NC}"
if [ ! -d "node_modules/@playwright/test" ]; then
    echo -e "${RED}❌ Playwright 패키지가 설치되지 않았습니다.${NC}"
    echo -e "${BLUE}npm 패키지 설치 중...${NC}"
    npm install
fi

# 브라우저 바이너리 설치 확인 및 자동 설치
if ! npx playwright install --dry-run chromium 2>/dev/null | grep -q "chromium"; then
    echo -e "${YELLOW}⚠️  Playwright 브라우저가 설치되지 않았습니다.${NC}"
    echo -e "${BLUE}브라우저 자동 설치 중... (시간이 걸릴 수 있습니다)${NC}"
    npx playwright install --with-deps chromium firefox webkit
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 브라우저 설치 완료${NC}"
    else
        echo -e "${RED}❌ 브라우저 설치 실패${NC}"
        echo -e "${YELLOW}수동 설치: npx playwright install --with-deps${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ 브라우저 설치 확인됨${NC}"
fi

# 5. 테스트 실행
echo -e "${YELLOW}[5/5] E2E 테스트 실행...${NC}"
echo ""

# 환경 변수 설정
export API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"

# 테스트 실행
if npm test; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     ✅ E2E 테스트 완료                                 ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    
    # 테스트 리포트 열기 옵션
    echo ""
    echo -e "${YELLOW}테스트 리포트를 보시겠습니까? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        npx playwright show-report
    fi
    
    exit 0
else
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ❌ E2E 테스트 실패                                 ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
