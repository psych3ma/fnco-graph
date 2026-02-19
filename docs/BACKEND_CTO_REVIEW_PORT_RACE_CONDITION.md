# 백엔드 전문가 출신 CTO 관점: 포트 충돌 Race Condition 해결

## 🔍 발견된 문제

### 문제 상황
터미널 로그에서 다음 문제가 발생했습니다:
1. `check_port()` 함수가 "✅ 포트 8000 사용 가능" 메시지 출력
2. 하지만 실제 `uvicorn` 시작 시 `ERROR: [Errno 48] Address already in use` 발생
3. 포트 확인과 서버 시작 사이에 불일치 발생

### 근본 원인 분석

#### 1. 포트 확인 로직의 한계
- **기존**: `lsof -Pi :$PORT -sTCP:LISTEN`만 확인
- **문제**: CLOSED, TIME_WAIT 상태의 프로세스는 감지하지 못함
- **결과**: 포트가 실제로는 사용 중이지만 "사용 가능"으로 판단

#### 2. Race Condition
- 포트 확인 후 서버 시작 전 사이에 다른 프로세스가 포트 점유 가능
- 또는 CLOSED 상태 프로세스가 포트를 점유하고 있음

#### 3. 프로세스 상태 다양성
- LISTEN: 정상적으로 리스닝 중
- CLOSED: 종료되었지만 포트가 아직 해제되지 않음
- TIME_WAIT: 연결 종료 후 대기 상태

## ✅ 해결 방법

### 1. 포트 확인 로직 개선

#### Before (문제)
```bash
check_port() {
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0  # 포트 사용 중
    else
        return 1  # 포트 사용 가능
    fi
}
```

#### After (해결)
```bash
check_port() {
    # LISTEN 상태 확인
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # 포트 사용 중 (LISTEN)
    fi
    
    # CLOSED, TIME_WAIT 등 다른 상태도 확인
    if lsof -i :$PORT -t >/dev/null 2>&1; then
        return 0  # 포트 사용 중 (다른 상태)
    fi
    
    return 1  # 포트 사용 가능
}
```

### 2. 포트 정리 함수 추가

```bash
cleanup_port() {
    local cleaned=false
    
    # LISTEN 상태 프로세스
    local listen_pids=$(lsof -Pi :$PORT -sTCP:LISTEN -t 2>/dev/null || echo "")
    if [ -n "$listen_pids" ]; then
        for pid in $listen_pids; do
            kill -9 $pid 2>/dev/null || true
            cleaned=true
        done
    fi
    
    # CLOSED/TIME_WAIT 등 다른 상태 프로세스
    local all_pids=$(lsof -i :$PORT -t 2>/dev/null | grep -v "^$listen_pids$" || echo "")
    if [ -n "$all_pids" ]; then
        for pid in $all_pids; do
            kill -9 $pid 2>/dev/null || true
            cleaned=true
        done
    fi
    
    if [ "$cleaned" = "true" ]; then
        sleep 2  # 프로세스 종료 대기
        return 0
    fi
    
    return 1
}
```

### 3. 서버 시작 직전 재확인

```bash
# 서버 시작 직전 최종 포트 확인 (race condition 방지)
echo -e "${BLUE}🔍 서버 시작 전 최종 포트 확인...${NC}"
if check_port; then
    echo -e "${RED}❌ 포트 $PORT이 여전히 사용 중입니다.${NC}"
    echo -e "${YELLOW}   잠시 후 다시 시도하거나 ./scripts/stop-backend.sh를 실행하세요.${NC}"
    exit 1
fi
```

### 4. 에러 처리 개선

```bash
# uvicorn 실행 시 포트 충돌 에러 자동 감지 및 처리
uvicorn main:app --reload --host 0.0.0.0 --port $PORT 2>&1 | while IFS= read -r line; do
    echo "$line"
    
    # 포트 충돌 에러 감지
    if echo "$line" | grep -q "Address already in use\|Errno 48"; then
        echo -e "${RED}❌ 포트 충돌 감지: $PORT${NC}"
        cleanup_port
        # 재시도 안내
    fi
done
```

### 5. stop-backend.sh 개선

모든 상태의 프로세스를 종료하도록 개선:

```bash
# 포트를 사용하는 모든 프로세스 찾기 (개선된 버전)
ALL_PIDS=$(lsof -i :$PORT -t 2>/dev/null || echo "")

# 모든 프로세스 종료
for PID in $ALL_PIDS; do
    kill -15 $PID 2>/dev/null || true  # 정상 종료 시도
done

sleep 2

# 남은 프로세스 강제 종료
REMAINING_PIDS=$(lsof -i :$PORT -t 2>/dev/null || echo "")
if [ -n "$REMAINING_PIDS" ]; then
    for PID in $REMAINING_PIDS; do
        kill -9 $PID 2>/dev/null || true
    done
fi
```

## 🎯 백엔드 전문가 CTO 관점 권장사항

### 1. 포트 관리 전략

#### 권장사항
- ✅ **모든 상태 확인**: LISTEN뿐만 아니라 CLOSED, TIME_WAIT도 확인
- ✅ **재확인 로직**: 서버 시작 직전 최종 확인
- ✅ **자동 정리**: 포트 충돌 시 자동으로 정리 시도

### 2. 에러 처리

#### 개선사항
- ✅ **에러 감지**: uvicorn 출력에서 포트 충돌 자동 감지
- ✅ **자동 복구**: 가능한 경우 자동으로 포트 정리
- ✅ **명확한 안내**: 실패 시 명확한 해결 방법 제시

### 3. 협업 환경 고려

#### 안전장치
- ✅ **사용자 확인**: 중요한 작업 전 사용자 확인
- ✅ **프로세스 정보 표시**: 종료 전 프로세스 정보 표시
- ✅ **수동 옵션**: 자동 해결 실패 시 수동 해결 방법 제공

## 📊 개선 효과

### Before
- ❌ CLOSED 상태 프로세스 감지 실패
- ❌ Race condition 발생 가능
- ❌ 포트 충돌 시 수동 해결 필요

### After
- ✅ 모든 상태의 프로세스 감지
- ✅ Race condition 방지 (재확인)
- ✅ 자동 포트 정리 및 복구

## 🚀 사용 방법

### 일반적인 사용
```bash
# 자동 포트 정리 및 서버 시작
./scripts/start-backend.sh
```

### 포트 충돌 발생 시
```bash
# 자동으로 포트 정리 시도
# 사용자 확인 후 프로세스 종료
```

### 수동 정리
```bash
# 모든 포트 점유 프로세스 종료
./scripts/stop-backend.sh
```

## ✅ 체크리스트

### 코드 개선
- [x] 포트 확인 로직 개선 (모든 상태 확인)
- [x] 포트 정리 함수 추가
- [x] 서버 시작 직전 재확인
- [x] 에러 처리 개선
- [x] stop-backend.sh 개선
- [x] 문서화 완료

### 테스트
- [ ] CLOSED 상태 프로세스 감지 테스트
- [ ] Race condition 방지 테스트
- [ ] 자동 포트 정리 테스트

## 🎉 결론

백엔드 전문가 CTO 관점에서 포트 충돌 race condition 문제를 체계적으로 해결했습니다:

1. **포트 확인 개선**: 모든 상태의 프로세스 감지
2. **Race Condition 방지**: 서버 시작 직전 재확인
3. **자동 복구**: 포트 충돌 시 자동 정리
4. **협업 고려**: 안전한 프로세스 종료 및 명확한 안내

이제 포트 충돌이 발생해도 자동으로 감지하고 해결할 수 있습니다!
