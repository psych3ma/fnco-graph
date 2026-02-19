/**
 * E2E 테스트 헬퍼 함수
 * 프론트엔드 전문가 CTO 관점에서 작성
 */

import { TEST_CONFIG } from './test-config.js';

/**
 * 백엔드 서버 상태 확인
 */
export async function checkBackendHealth() {
  try {
    const response = await fetch(`${TEST_CONFIG.API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Backend health check failed: ${response.status}`);
    }
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    console.error('[E2E] Backend health check failed:', error);
    return false;
  }
}

/**
 * 로딩 완료 대기
 */
export async function waitForLoadingComplete(page, timeout = TEST_CONFIG.TIMEOUT.LOADING) {
  try {
    // 로딩 오버레이가 숨겨질 때까지 대기
    await page.waitForSelector(TEST_CONFIG.SELECTORS.LOADING_OVERLAY, {
      state: 'hidden',
      timeout,
    });
    return true;
  } catch (error) {
    // 로딩이 완료되지 않았거나 이미 완료된 경우
    const overlay = await page.$(TEST_CONFIG.SELECTORS.LOADING_OVERLAY);
    if (overlay) {
      const isVisible = await overlay.isVisible();
      return !isVisible;
    }
    return true;
  }
}

/**
 * 그래프 데이터 로드 확인
 */
export async function waitForGraphData(page, minNodes = TEST_CONFIG.EXPECTATIONS.MIN_NODES) {
  try {
    // 그래프 네트워크가 표시될 때까지 대기
    await page.waitForSelector(TEST_CONFIG.SELECTORS.VIS_NETWORK, {
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUT.ELEMENT_VISIBLE,
    });
    
    // 그래프에 노드가 있는지 확인 (JavaScript 실행)
    const nodeCount = await page.evaluate(() => {
      if (window.app && window.app.graphManager && window.app.graphManager.network) {
        const nodes = window.app.graphManager.network.body.data.nodes;
        return nodes ? nodes.length : 0;
      }
      return 0;
    });
    
    return nodeCount >= minNodes;
  } catch (error) {
    console.error('[E2E] Graph data check failed:', error);
    return false;
  }
}

/**
 * 에러 토스트 확인
 */
export async function checkErrorToast(page, expectedMessage = null) {
  try {
    const toast = await page.$(TEST_CONFIG.SELECTORS.ERROR_TOAST);
    if (!toast) return false;
    
    if (expectedMessage) {
      const text = await toast.textContent();
      return text.includes(expectedMessage);
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * API 호출 재시도 로직
 */
export async function retryApiCall(fn, retries = TEST_CONFIG.RETRY.COUNT) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.RETRY.DELAY));
    }
  }
}

/**
 * 콘솔 에러 확인
 */
export async function checkConsoleErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * 접근성 검증 (기본)
 */
export async function checkAccessibility(page) {
  const issues = [];
  
  // ARIA 속성 확인
  const interactiveElements = await page.$$('button, input, [role="button"]');
  for (const element of interactiveElements) {
    const ariaLabel = await element.getAttribute('aria-label');
    const role = await element.getAttribute('role');
    
    if (!ariaLabel && !role) {
      const tagName = await element.evaluate(el => el.tagName);
      if (tagName !== 'BUTTON' && tagName !== 'INPUT') {
        issues.push(`Missing accessibility attributes: ${tagName}`);
      }
    }
  }
  
  return issues;
}
