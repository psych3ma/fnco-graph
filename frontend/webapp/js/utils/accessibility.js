/**
 * 접근성 유틸리티
 * @module utils/accessibility
 */

/**
 * 키보드 단축키 등록
 * @param {string} key - 키 조합 (예: 'ctrl+k', '/')
 * @param {Function} callback - 콜백 함수
 * @param {Object} options - 옵션
 */
export function registerKeyboardShortcut(key, callback, options = {}) {
  const { preventDefault = true, stopPropagation = false } = options;
  
  document.addEventListener('keydown', (e) => {
    const keyParts = key.split('+').map(k => k.trim().toLowerCase());
    const modifiers = {
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      alt: e.altKey
    };
    
    const keyMatch = keyParts.some(k => {
      if (k === 'ctrl' || k === 'cmd') return modifiers.ctrl;
      if (k === 'shift') return modifiers.shift;
      if (k === 'alt') return modifiers.alt;
      return e.key.toLowerCase() === k;
    });
    
    if (keyMatch && keyParts.length === Object.values(modifiers).filter(Boolean).length + 1) {
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      callback(e);
    }
  });
}

/**
 * 포커스 트랩 설정 (모달 등에서 사용)
 * @param {HTMLElement} container - 컨테이너 요소
 */
export function trapFocus(container) {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  });
}

/**
 * ARIA 라이브 리전 업데이트
 * @param {string} message - 메시지
 * @param {string} priority - 우선순위 ('polite' | 'assertive')
 */
export function announceToScreenReader(message, priority = 'polite') {
  let liveRegion = document.getElementById('aria-live-region');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'aria-live-region';
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
  }
  
  liveRegion.setAttribute('aria-live', priority);
  liveRegion.textContent = message;
  
  // 메시지 초기화 (다음 업데이트를 위해)
  setTimeout(() => {
    liveRegion.textContent = '';
  }, 1000);
}

/**
 * 스크린 리더 전용 텍스트 추가
 * @param {HTMLElement} element - 요소
 * @param {string} text - 텍스트
 */
export function addScreenReaderText(element, text) {
  const srText = document.createElement('span');
  srText.className = 'sr-only';
  srText.textContent = text;
  element.appendChild(srText);
}

/**
 * 포커스 가능한 요소 찾기
 * @param {HTMLElement} container - 컨테이너
 * @returns {NodeList} 포커스 가능한 요소들
 */
export function getFocusableElements(container) {
  return container.querySelectorAll(
    'button:not([disabled]), ' +
    'a[href], ' +
    'input:not([disabled]), ' +
    'select:not([disabled]), ' +
    'textarea:not([disabled]), ' +
    '[tabindex]:not([tabindex="-1"]):not([disabled])'
  );
}

/**
 * 다음 포커스 가능한 요소로 이동
 * @param {HTMLElement} currentElement - 현재 요소
 * @param {boolean} reverse - 역방향 여부
 */
export function moveFocus(currentElement, reverse = false) {
  const container = currentElement.closest('.workspace') || document.body;
  const focusableElements = Array.from(getFocusableElements(container));
  const currentIndex = focusableElements.indexOf(currentElement);
  
  let nextIndex;
  if (reverse) {
    nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
  } else {
    nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
  }
  
  focusableElements[nextIndex]?.focus();
}
