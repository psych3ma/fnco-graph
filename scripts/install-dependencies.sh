#!/usr/bin/env bash
# 의존성 설치 스크립트
# 백엔드 전문가 CTO 관점에서 작성된 안전한 설치 도구
# zsh 호환성 고려

set -e

# zsh에서 bash 모드로 실행되도록 보장
if [ -n "$ZSH_VERSION" ]; then
    emulate -L bash
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 의존성 설치${NC}"
echo ""

cd "$PROJECT_ROOT"

# Python 확인
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3가 설치되지 않았습니다.${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo -e "${GREEN}✅ Python: $PYTHON_VERSION${NC}"

# pip 확인
PIP_CMD=""
if command -v pip3 &> /dev/null; then
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    PIP_CMD="pip"
else
    echo -e "${RED}❌ pip가 설치되지 않았습니다.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ pip 사용: $PIP_CMD${NC}"
echo ""

# requirements.txt 확인
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}❌ requirements.txt 파일을 찾을 수 없습니다.${NC}"
    exit 1
fi

echo -e "${YELLOW}의존성 설치 시작...${NC}"
echo ""

# 설치 실행
if $PIP_CMD install -r requirements.txt 2>&1 | tee /tmp/install.log; then
    echo ""
    echo -e "${GREEN}✅ 의존성 설치 완료${NC}"
    
    # 의존성 충돌 경고 확인
    if grep -q "dependency conflicts" /tmp/install.log 2>/dev/null || grep -q "incompatible" /tmp/install.log 2>/dev/null; then
        echo ""
        echo -e "${YELLOW}⚠️  의존성 충돌 경고가 발견되었습니다.${NC}"
        echo -e "${YELLOW}   대부분의 경우 작동하지만, 문제가 발생하면 가상 환경 사용을 권장합니다.${NC}"
        echo ""
        echo -e "${BLUE}가상 환경 사용 방법:${NC}"
        echo -e "${BLUE}  python3 -m venv venv${NC}"
        echo -e "${BLUE}  source venv/bin/activate${NC}"
        echo -e "${BLUE}  pip install -r requirements.txt${NC}"
    fi
    
    echo ""
    echo -e "${YELLOW}설치된 주요 패키지 확인:${NC}"
    $PIP_CMD list 2>/dev/null | grep -E "fastapi|uvicorn|neo4j|pydantic|python-dotenv|streamlit|requests|openai" || echo "일부 패키지가 표시되지 않을 수 있습니다."
    echo ""
    echo -e "${GREEN}다음 단계: ./scripts/start-backend.sh${NC}"
    rm -f /tmp/install.log
else
    echo ""
    echo -e "${RED}❌ 의존성 설치 실패${NC}"
    echo ""
    echo -e "${YELLOW}문제 해결 방법:${NC}"
    echo -e "${BLUE}1. pip 업그레이드: $PIP_CMD install --upgrade pip${NC}"
    echo -e "${BLUE}2. 가상 환경 사용 권장:${NC}"
    echo -e "${BLUE}   python3 -m venv venv${NC}"
    echo -e "${BLUE}   source venv/bin/activate${NC}"
    echo -e "${BLUE}   pip install -r requirements.txt${NC}"
    rm -f /tmp/install.log
    exit 1
fi
