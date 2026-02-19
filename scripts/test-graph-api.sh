#!/usr/bin/env bash
# 그래프 API 테스트 스크립트
# Neo4j 전문가 출신 백엔드 CTO 관점에서 작성된 테스트 도구

set -e

PORT=8000
API_URL="http://localhost:$PORT"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 그래프 API 테스트${NC}"
echo ""

# 1. 헬스 체크
echo -e "${YELLOW}1. 헬스 체크${NC}"
HEALTH=$(curl -s "$API_URL/health" 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
    echo -e "${GREEN}   ✅ 헬스 체크 성공${NC}"
    echo -e "${BLUE}   응답: $HEALTH${NC}"
else
    echo -e "${RED}   ❌ 헬스 체크 실패${NC}"
    echo -e "${YELLOW}   백엔드 서버가 실행 중인지 확인하세요: ./scripts/start-backend.sh${NC}"
    exit 1
fi

echo ""

# 2. 기본 그래프 데이터 조회
echo -e "${YELLOW}2. 기본 그래프 데이터 조회 (limit=10)${NC}"
GRAPH_DATA=$(curl -s "$API_URL/api/graph?limit=10" 2>/dev/null || echo "")
if [ -n "$GRAPH_DATA" ]; then
    NODE_COUNT=$(echo "$GRAPH_DATA" | grep -o '"id"' | wc -l | tr -d ' ')
    EDGE_COUNT=$(echo "$GRAPH_DATA" | grep -o '"source"' | wc -l | tr -d ' ')
    echo -e "${GREEN}   ✅ 그래프 데이터 조회 성공${NC}"
    echo -e "${BLUE}   노드 수: $NODE_COUNT${NC}"
    echo -e "${BLUE}   엣지 수: $EDGE_COUNT${NC}"
    
    if [ "$NODE_COUNT" -eq 0 ]; then
        echo -e "${RED}   ⚠️  노드가 없습니다. Neo4j 데이터베이스에 데이터가 있는지 확인하세요.${NC}"
    fi
    
    if [ "$EDGE_COUNT" -eq 0 ]; then
        echo -e "${RED}   ⚠️  엣지가 없습니다. 관계 데이터가 있는지 확인하세요.${NC}"
    fi
else
    echo -e "${RED}   ❌ 그래프 데이터 조회 실패${NC}"
fi

echo ""

# 3. 라벨 필터링 테스트
echo -e "${YELLOW}3. 라벨 필터링 테스트 (Company)${NC}"
COMPANY_DATA=$(curl -s "$API_URL/api/graph?limit=10&node_labels=Company" 2>/dev/null || echo "")
if [ -n "$COMPANY_DATA" ]; then
    COMPANY_NODE_COUNT=$(echo "$COMPANY_DATA" | grep -o '"id"' | wc -l | tr -d ' ')
    echo -e "${GREEN}   ✅ Company 필터링 성공${NC}"
    echo -e "${BLUE}   노드 수: $COMPANY_NODE_COUNT${NC}"
else
    echo -e "${RED}   ❌ Company 필터링 실패${NC}"
fi

echo ""

# 4. 관계 타입 필터링 테스트
echo -e "${YELLOW}4. 관계 타입 필터링 테스트 (HOLDS_SHARES)${NC}"
REL_DATA=$(curl -s "$API_URL/api/graph?limit=10&relationship_types=HOLDS_SHARES" 2>/dev/null || echo "")
if [ -n "$REL_DATA" ]; then
    REL_EDGE_COUNT=$(echo "$REL_DATA" | grep -o '"source"' | wc -l | tr -d ' ')
    echo -e "${GREEN}   ✅ HOLDS_SHARES 필터링 성공${NC}"
    echo -e "${BLUE}   엣지 수: $REL_EDGE_COUNT${NC}"
else
    echo -e "${RED}   ❌ HOLDS_SHARES 필터링 실패${NC}"
fi

echo ""

# 5. 연결 상태 확인
echo -e "${YELLOW}5. Neo4j 연결 상태${NC}"
CONN_STATUS=$(curl -s "$API_URL/api/connection/status" 2>/dev/null || echo "")
if [ -n "$CONN_STATUS" ]; then
    echo -e "${GREEN}   ✅ 연결 상태 확인 성공${NC}"
    echo -e "${BLUE}   상태: $CONN_STATUS${NC}"
else
    echo -e "${RED}   ❌ 연결 상태 확인 실패${NC}"
fi

echo ""
echo -e "${GREEN}✅ 테스트 완료${NC}"
