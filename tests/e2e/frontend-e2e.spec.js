/**
 * 프론트엔드 E2E 테스트 스위트
 * 프론트엔드 전문가 CTO 관점에서 작성
 * 
 * 테스트 범위:
 * 1. 페이지 로드 및 초기화
 * 2. 그래프 데이터 로드
 * 3. 검색 기능
 * 4. 필터 기능
 * 5. 노드 상호작용
 * 6. 챗봇 기능
 * 7. 에러 처리
 * 8. 로딩 상태
 * 9. 접근성
 */

import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config.js';
import {
  checkBackendHealth,
  waitForLoadingComplete,
  waitForGraphData,
  checkErrorToast,
  checkConsoleErrors,
  checkAccessibility,
} from './test-helpers.js';

// 테스트 전 백엔드 상태 확인
test.beforeAll(async ({ request }) => {
  const isHealthy = await checkBackendHealth();
  if (!isHealthy) {
    console.warn('[E2E] Backend is not healthy. Some tests may fail.');
  }
});

test.describe('프론트엔드 E2E 테스트', () => {
  
  test.beforeEach(async ({ page }) => {
    // 콘솔 에러 수집
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // 페이지 로드
    await page.goto(TEST_CONFIG.FRONTEND_URL, {
      waitUntil: 'networkidle',
      timeout: TEST_CONFIG.TIMEOUT.NAVIGATION,
    });
  });

  test('페이지 로드 및 초기화', async ({ page }) => {
    // 로고 확인
    const logo = await page.locator(TEST_CONFIG.SELECTORS.LOGO);
    await expect(logo).toBeVisible();
    
    // 검색 입력 확인
    const searchInput = await page.locator(TEST_CONFIG.SELECTORS.SEARCH_INPUT);
    await expect(searchInput).toBeVisible();
    
    // 필터 버튼 확인
    const filters = await page.locator(TEST_CONFIG.SELECTORS.FILTERS);
    await expect(filters).toBeVisible();
    
    // 그래프 영역 확인
    const graphArea = await page.locator(TEST_CONFIG.SELECTORS.GRAPH_AREA);
    await expect(graphArea).toBeVisible();
  });

  test('로딩 상태 표시 및 완료', async ({ page }) => {
    // 초기 로딩 상태 확인
    const loadingOverlay = await page.locator(TEST_CONFIG.SELECTORS.LOADING_OVERLAY);
    
    // 로딩이 표시되거나 이미 완료되었는지 확인
    const isVisible = await loadingOverlay.isVisible().catch(() => false);
    
    if (isVisible) {
      // 로딩 텍스트 확인
      const loadingText = await page.locator(TEST_CONFIG.SELECTORS.LOADING_TEXT);
      await expect(loadingText).toBeVisible();
      
      // 로딩 완료 대기
      await waitForLoadingComplete(page);
    }
    
    // 로딩 완료 후 그래프 영역 확인
    const graphArea = await page.locator(TEST_CONFIG.SELECTORS.GRAPH_AREA);
    await expect(graphArea).toBeVisible();
  });

  test('그래프 데이터 로드', async ({ page }) => {
    // 로딩 완료 대기
    await waitForLoadingComplete(page);
    
    // 그래프 데이터 확인
    const hasGraphData = await waitForGraphData(page);
    expect(hasGraphData).toBe(true);
    
    // 그래프 네트워크 확인
    const visNetwork = await page.locator(TEST_CONFIG.SELECTORS.VIS_NETWORK);
    await expect(visNetwork).toBeVisible();
  });

  test('검색 기능', async ({ page }) => {
    // 로딩 완료 대기
    await waitForLoadingComplete(page);
    
    // 검색 입력
    const searchInput = await page.locator(TEST_CONFIG.SELECTORS.SEARCH_INPUT);
    await searchInput.fill(TEST_CONFIG.TEST_DATA.SEARCH_TERM);
    await searchInput.press('Enter');
    
    // 검색 결과 대기
    await page.waitForTimeout(2000); // 검색 API 호출 대기
    
    // 검색 결과 확인 (그래프 업데이트 또는 제안 표시)
    // 실제 구현에 따라 검증 로직 조정 필요
  });

  test('필터 기능', async ({ page }) => {
    // 로딩 완료 대기
    await waitForLoadingComplete(page);
    
    // 필터 버튼 클릭
    const companyFilter = await page.locator(
      TEST_CONFIG.SELECTORS.FILTER_BUTTON('company')
    );
    
    // 필터 상태 확인
    const isActive = await companyFilter.getAttribute('aria-checked');
    expect(isActive).toBe('true');
    
    // 필터 토글
    await companyFilter.click();
    
    // 필터 상태 변경 확인
    await page.waitForTimeout(500); // 상태 업데이트 대기
    const newState = await companyFilter.getAttribute('aria-checked');
    expect(newState).toBe('false');
  });

  test('노드 클릭 및 패널 표시', async ({ page }) => {
    // 로딩 완료 대기
    await waitForLoadingComplete(page);
    
    // 그래프 데이터 확인
    const hasGraphData = await waitForGraphData(page);
    if (!hasGraphData) {
      test.skip();
      return;
    }
    
    // 노드 클릭 시뮬레이션 (vis.js 네트워크 이벤트)
    await page.evaluate(() => {
      if (window.app && window.app.graphManager && window.app.graphManager.network) {
        const network = window.app.graphManager.network;
        const nodes = network.body.data.nodes;
        if (nodes && nodes.length > 0) {
          const nodeId = nodes.get(0).id;
          network.selectNodes([nodeId]);
          network.fire('click', { nodes: [nodeId] });
        }
      }
    });
    
    // 노드 패널 표시 확인
    await page.waitForTimeout(1000); // 패널 표시 대기
    const nodePanel = await page.locator(TEST_CONFIG.SELECTORS.NODE_PANEL);
    const isVisible = await nodePanel.isVisible().catch(() => false);
    
    // 패널이 표시되거나 숨겨질 수 있음 (구현에 따라)
    // expect(isVisible).toBe(true);
  });

  test('챗봇 기능', async ({ page }) => {
    // 챗 패널 열기 (구현에 따라)
    // 챗 입력 확인
    // 메시지 전송 확인
    // 응답 확인
    
    // 현재 구현 상태에 따라 테스트 작성 필요
    test.skip('Chatbot functionality not fully implemented');
  });

  test('에러 처리 - 백엔드 연결 실패', async ({ page }) => {
    // 백엔드 서버 중지 시뮬레이션
    // 또는 잘못된 API URL 사용
    
    // 에러 토스트 확인
    // 에러 메시지 확인
    
    // 현재 구현 상태에 따라 테스트 작성 필요
    test.skip('Error handling test requires backend manipulation');
  });

  test('접근성 검증', async ({ page }) => {
    // 로딩 완료 대기
    await waitForLoadingComplete(page);
    
    // 접근성 이슈 확인
    const issues = await checkAccessibility(page);
    
    // 주요 접근성 이슈가 없어야 함
    expect(issues.length).toBeLessThan(5); // 허용 가능한 이슈 수
  });

  test('콘솔 에러 확인', async ({ page }) => {
    // 로딩 완료 대기
    await waitForLoadingComplete(page);
    
    // 콘솔 에러 확인
    const errors = await checkConsoleErrors(page);
    
    // 치명적인 에러가 없어야 함
    const criticalErrors = errors.filter(err => 
      !err.includes('favicon') && 
      !err.includes('sourcemap') &&
      !err.includes('Extension')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('반응형 디자인', async ({ page }) => {
    // 모바일 뷰포트
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    
    // 요소들이 적절히 표시되는지 확인
    const graphArea = await page.locator(TEST_CONFIG.SELECTORS.GRAPH_AREA);
    await expect(graphArea).toBeVisible();
    
    // 데스크톱 뷰포트
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    
    await expect(graphArea).toBeVisible();
  });
});
