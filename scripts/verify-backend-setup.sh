#!/usr/bin/env bash
# 백엔드 서버 시작 전 사전 체크 스크립트
# 백엔드 전문가 CTO 관점에서 작성된 진단 도구
# zsh 호환성 고려

set -e

# zsh에서 bash 모드로 실행되도록 보장
if [ -n "$ZSH_VERSION" ]; then
    emulate -L bash
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
PORT=8000

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 백엔드 서버 시작 전 사전 체크${NC}"
echo ""

ERRORS=0
WARNINGS=0

# 1. Python 설치 확인
echo -e "${YELLOW}1. Python 설치 확인${NC}"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}   ✅ Python 설치됨: $PYTHON_VERSION${NC}"
    
    # Python 버전 확인 (3.8 이상 필요)
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
    if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]); then
        echo -e "${RED}   ❌ Python 3.8 이상이 필요합니다. 현재: $PYTHON_VERSION${NC}"
        ((ERRORS++))
    fi
else
    echo -e "${RED}   ❌ Python3가 설치되지 않았습니다.${NC}"
    ((ERRORS++))
fi

echo ""

# 2. 백엔드 디렉토리 확인
echo -e "${YELLOW}2. 백엔드 디렉토리 확인${NC}"
if [ -d "$BACKEND_DIR" ]; then
    echo -e "${GREEN}   ✅ 백엔드 디렉토리 존재: $BACKEND_DIR${NC}"
else
    echo -e "${RED}   ❌ 백엔드 디렉토리를 찾을 수 없습니다: $BACKEND_DIR${NC}"
    ((ERRORS++))
fi

echo ""

# 3. 필수 파일 확인
echo -e "${YELLOW}3. 필수 파일 확인${NC}"
REQUIRED_FILES=(
    "$BACKEND_DIR/main.py"
    "$BACKEND_DIR/database.py"
    "$BACKEND_DIR/service.py"
    "$BACKEND_DIR/models.py"
    "$PROJECT_ROOT/requirements.txt"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}   ✅ $(basename $file)${NC}"
    else
        echo -e "${RED}   ❌ $(basename $file) 없음${NC}"
        ((ERRORS++))
    fi
done

echo ""

# 4. 의존성 설치 확인
echo -e "${YELLOW}4. Python 패키지 확인${NC}"
cd "$PROJECT_ROOT"

# 주요 패키지 확인 (zsh 호환성을 위해 배열 사용)
PACKAGES=("fastapi" "uvicorn" "neo4j" "pydantic" "python-dotenv")
PACKAGE_IMPORTS=("fastapi" "uvicorn" "neo4j" "pydantic" "dotenv")

MISSING_PACKAGES=()

for i in "${!PACKAGES[@]}"; do
    package="${PACKAGES[$i]}"
    import_name="${PACKAGE_IMPORTS[$i]}"
    
    if python3 -c "import $import_name" 2>/dev/null; then
        # 버전 정보 가져오기 (안전하게)
        VERSION=$(python3 -c "import $import_name; print(getattr($import_name, '__version__', 'unknown'))" 2>/dev/null || echo "unknown")
        echo -e "${GREEN}   ✅ $package ($VERSION)${NC}"
    else
        echo -e "${RED}   ❌ $package 미설치${NC}"
        MISSING_PACKAGES+=("$package")
        ((ERRORS++))
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}   💡 설치 명령어:${NC}"
    if [ -f "$PROJECT_ROOT/scripts/install-dependencies.sh" ]; then
        echo -e "${BLUE}   ./scripts/install-dependencies.sh (권장)${NC}"
    fi
    echo -e "${BLUE}   또는: pip install -r requirements.txt${NC}"
    echo ""
    echo -e "${YELLOW}   또는 개별 설치:${NC}"
    for pkg in "${MISSING_PACKAGES[@]}"; do
        echo -e "${BLUE}   pip install $pkg${NC}"
    done
fi

echo ""

# 5. 환경 변수 확인
echo -e "${YELLOW}5. 환경 변수 확인${NC}"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}   ✅ .env 파일 존재${NC}"
    
    # 필수 환경 변수 확인
    source "$ENV_FILE" 2>/dev/null || true
    
    REQUIRED_VARS=("NEO4J_URI" "NEO4J_USER" "NEO4J_PASSWORD")
    for var in "${REQUIRED_VARS[@]}"; do
        var_value="${!var}"
        if [ -z "$var_value" ]; then
            echo -e "${RED}   ❌ $var 설정되지 않음${NC}"
            ((ERRORS++))
        else
            if [ "$var" == "NEO4J_PASSWORD" ]; then
                # 비밀번호 길이만 표시 (보안)
                password_len=${#var_value}
                echo -e "${GREEN}   ✅ $var: ${password_len}자 (마스킹됨)${NC}"
            else
                echo -e "${GREEN}   ✅ $var: $var_value${NC}"
            fi
        fi
    done
else
    echo -e "${YELLOW}   ⚠️  .env 파일 없음${NC}"
    if [ -f "$ENV_EXAMPLE" ]; then
        echo -e "${YELLOW}   💡 .env.example을 참고하여 .env 파일을 생성하세요${NC}"
        echo -e "${BLUE}   cp .env.example .env${NC}"
    fi
    ((WARNINGS++))
fi

echo ""

# 6. 포트 사용 확인
echo -e "${YELLOW}6. 포트 $PORT 사용 확인${NC}"
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    PID=$(lsof -ti :$PORT)
    PROCESS_INFO=$(ps -p $PID -o comm=,args= 2>/dev/null || echo "알 수 없음")
    echo -e "${YELLOW}   ⚠️  포트 $PORT이 이미 사용 중입니다${NC}"
    echo -e "${YELLOW}   프로세스 ID: $PID${NC}"
    echo -e "${YELLOW}   프로세스: $PROCESS_INFO${NC}"
    echo -e "${YELLOW}   💡 해결 방법: ./scripts/start-backend.sh (자동 해결)${NC}"
    ((WARNINGS++))
else
    echo -e "${GREEN}   ✅ 포트 $PORT 사용 가능${NC}"
fi

echo ""

# 7. Neo4j 연결 테스트 (선택사항)
echo -e "${YELLOW}7. Neo4j 연결 테스트 (선택사항)${NC}"
if [ -f "$PROJECT_ROOT/scripts/test-neo4j-connection.py" ]; then
    echo -e "${BLUE}   Neo4j 연결 테스트를 실행하시겠습니까? (y/N)${NC}"
    read -p "   " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        python3 "$PROJECT_ROOT/scripts/test-neo4j-connection.py"
    else
        echo -e "${YELLOW}   건너뜀${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  테스트 스크립트 없음${NC}"
fi

echo ""

# 결과 요약
echo -e "${BLUE}═══════════════════════════════════════${NC}"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ 모든 체크 통과! 서버를 시작할 수 있습니다.${NC}"
    echo ""
    echo -e "${GREEN}서버 시작 명령어:${NC}"
    echo -e "${BLUE}  ./scripts/start-backend.sh${NC}"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  경고 $WARNINGS개 발견${NC}"
    echo -e "${GREEN}서버를 시작할 수 있지만, 경고를 확인하세요.${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ 오류 $ERRORS개 발견${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  경고 $WARNINGS개 발견${NC}"
    fi
    echo ""
    echo -e "${RED}서버를 시작하기 전에 오류를 해결하세요.${NC}"
    echo ""
    exit 1
fi
