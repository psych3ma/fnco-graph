#!/usr/bin/env bash
# 백엔드 서버 종료 스크립트
# zsh 호환성 고려

set -e

# zsh에서 bash 모드로 실행되도록 보장
if [ -n "$ZSH_VERSION" ]; then
    emulate -L bash
fi

PORT=8000

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 백엔드 서버 종료 중...${NC}"

# 포트를 사용하는 모든 프로세스 찾기 (개선된 버전)
# LISTEN 상태뿐만 아니라 CLOSED, TIME_WAIT 등 모든 상태 확인
ALL_PIDS=$(lsof -i :$PORT -t 2>/dev/null || echo "")

if [ -z "$ALL_PIDS" ]; then
    echo -e "${YELLOW}⚠️  포트 $PORT을 사용하는 프로세스가 없습니다.${NC}"
    exit 0
fi

# 프로세스 정보 확인 및 표시
echo -e "${YELLOW}   포트 $PORT을 사용하는 프로세스:${NC}"
for PID in $ALL_PIDS; do
    PROCESS_INFO=$(ps -p $PID -o comm=,args= 2>/dev/null || echo "알 수 없음")
    echo -e "${YELLOW}   - 프로세스 ID: $PID${NC}"
    echo -e "${YELLOW}     프로세스 정보: $PROCESS_INFO${NC}"
done

# 모든 프로세스 종료
echo -e "${GREEN}   프로세스 종료 중...${NC}"
for PID in $ALL_PIDS; do
    # 먼저 정상 종료 시도
    kill -15 $PID 2>/dev/null || true
done

# 종료 대기
sleep 2

# 남은 프로세스 강제 종료
REMAINING_PIDS=$(lsof -i :$PORT -t 2>/dev/null || echo "")
if [ -n "$REMAINING_PIDS" ]; then
    echo -e "${YELLOW}   강제 종료 중...${NC}"
    for PID in $REMAINING_PIDS; do
        kill -9 $PID 2>/dev/null || true
    done
    sleep 1
fi

# 최종 확인 (모든 상태 포함)
if ! lsof -i :$PORT -t >/dev/null 2>&1; then
    echo -e "${GREEN}✅ 서버가 종료되었습니다.${NC}"
else
    echo -e "${RED}❌ 일부 프로세스가 여전히 실행 중입니다.${NC}"
    echo -e "${YELLOW}   남은 프로세스:${NC}"
    lsof -i :$PORT 2>/dev/null || echo "   없음"
    echo -e "${YELLOW}   수동 종료: lsof -ti :$PORT | xargs kill -9${NC}"
    exit 1
fi
