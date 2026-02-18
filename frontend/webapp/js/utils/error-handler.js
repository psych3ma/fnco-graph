/**
 * 에러 핸들링 유틸리티
 * @module utils/error-handler
 */

/**
 * 에러 타입 정의
 */
export const ErrorType = {
  NETWORK: 'NETWORK',
  DATA: 'DATA',
  RENDER: 'RENDER',
  VALIDATION: 'VALIDATION',
  UNKNOWN: 'UNKNOWN'
};

/**
 * 에러 토스트 표시
 * @param {string} message - 에러 메시지
 * @param {ErrorType} type - 에러 타입
 * @param {number} duration - 표시 시간 (ms)
 */
export function showErrorToast(message, type = ErrorType.UNKNOWN, duration = 5000) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  
  const icon = getErrorIcon(type);
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="닫기" onclick="this.parentElement.remove()">×</button>
  `;
  
  document.body.appendChild(toast);
  
  // 애니메이션
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 자동 제거
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * 성공 토스트 표시
 * @param {string} message - 메시지
 * @param {number} duration - 표시 시간 (ms)
 */
export function showSuccessToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'success-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="toast-icon">✓</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * 에러 타입별 아이콘 반환
 * @param {ErrorType} type - 에러 타입
 * @returns {string} 아이콘
 */
function getErrorIcon(type) {
  const icons = {
    [ErrorType.NETWORK]: '⚠',
    [ErrorType.DATA]: '📊',
    [ErrorType.RENDER]: '🎨',
    [ErrorType.VALIDATION]: '✓',
    [ErrorType.UNKNOWN]: '❌'
  };
  return icons[type] || icons[ErrorType.UNKNOWN];
}

/**
 * HTML 이스케이프
 * @param {string} text - 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 안전한 에러 핸들러 래퍼
 * @param {Function} fn - 실행할 함수
 * @param {string} errorMessage - 에러 메시지
 * @param {ErrorType} errorType - 에러 타입
 * @returns {Promise<any>}
 */
export async function safeExecute(fn, errorMessage = '작업 중 오류가 발생했습니다.', errorType = ErrorType.UNKNOWN) {
  try {
    return await fn();
  } catch (error) {
    console.error('[ErrorHandler]', error);
    showErrorToast(`${errorMessage}: ${error.message || error}`, errorType);
    throw error;
  }
}

/**
 * 네트워크 요청 에러 핸들링
 * @param {Response} response - Fetch 응답
 * @returns {Promise<Response>}
 */
export async function handleNetworkError(response) {
  if (!response.ok) {
    const errorText = await response.text().catch(() => '알 수 없는 오류');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return response;
}
