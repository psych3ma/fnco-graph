#!/usr/bin/env bash
# OpenAI 및 httpx 업그레이드 스크립트
# CTO 관점에서 작성된 안전한 업그레이드 도구
# 쉘 호환성 문제 자동 처리

set -e

# zsh 호환성
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

echo -e "${BLUE}🔄 OpenAI 및 httpx 업그레이드${NC}"
echo ""

cd "$PROJECT_ROOT"

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

# 업그레이드 실행 (따옴표로 감싸서 쉘 호환성 문제 방지)
echo -e "${YELLOW}OpenAI 및 httpx 업그레이드 중...${NC}"
echo ""

if $PIP_CMD install --upgrade "openai>=1.12.0" "httpx>=0.27.0"; then
    echo ""
    echo -e "${GREEN}✅ 업그레이드 완료${NC}"
    echo ""
    echo -e "${YELLOW}설치된 버전 확인:${NC}"
    $PIP_CMD show openai httpx 2>/dev/null | grep -E "Name|Version" || echo "버전 정보를 가져올 수 없습니다."
    echo ""
    echo -e "${GREEN}다음 단계: ./scripts/start-backend.sh${NC}"
else
    echo ""
    echo -e "${RED}❌ 업그레이드 실패${NC}"
    echo ""
    echo -e "${YELLOW}대안 방법:${NC}"
    echo -e "${BLUE}1. requirements.txt 사용: pip install --upgrade -r requirements.txt${NC}"
    echo -e "${BLUE}2. 전체 의존성 재설치: ./scripts/install-dependencies.sh${NC}"
    exit 1
fi
