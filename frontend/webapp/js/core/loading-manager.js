/**
 * 로딩 상태 관리 모듈
 * UX 전문가 CTO 관점에서 개선된 버전
 * - 최소 표시 시간으로 깜빡임 방지
 * - 진행률 표시
 * - 에러 상태 전환
 * - 접근성 향상
 * - 성능 모니터링
 * @module loading-manager
 */

import { stateManager } from './state-manager.js';

/**
 * 로딩 매니저 클래스
 */
export class LoadingManager {
  constructor() {
    this.minDisplayTime = 300; // 최소 표시 시간 (ms) - 깜빡임 방지
    this.startTime = null;
    this.hideTimeout = null;
    this.progressInterval = null;
    this.currentProgress = 0;
    this.targetProgress = 0;
    this.isVisible = false;
    this.variant = 'minimal'; // 디자인 변형: 'minimal', 'progress', 'steps', 'unified', 'skeleton'
    this.currentStep = 0;
    this.totalSteps = 0;
    
    // 성능 모니터링
    this.loadTimes = [];
    this.maxLoadTimes = 50; // 최근 50개만 저장
  }
  
  /**
   * 디자인 변형 설정
   * @param {string} variant - 'minimal', 'progress', 'steps', 'unified', 'skeleton'
   */
  setVariant(variant = 'minimal') {
    this.variant = variant;
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      // 기존 variant 클래스 제거
      overlay.classList.remove('variant-minimal', 'variant-progress', 'variant-steps', 'variant-unified', 'variant-skeleton');
      // 새 variant 클래스 추가
      overlay.classList.add(`variant-${variant}`);
      
      // unified 변형의 경우 진행률에 따라 클래스 추가
      if (variant === 'unified') {
        overlay.classList.toggle('has-progress', this.targetProgress > 0);
      }
    }
  }
  
  /**
   * 단계 설정 (variant-steps 및 variant-unified용)
   * @param {number} current - 현재 단계
   * @param {number} total - 전체 단계
   */
  setSteps(current, total) {
    this.currentStep = current;
    this.totalSteps = total;
    this.updateStepIndicator();
  }
  
  /**
   * 단계 인디케이터 업데이트 (하이브리드 디자인 지원)
   * @private
   */
  updateStepIndicator() {
    // 하이브리드 디자인(unified)과 단계 디자인(steps) 모두 지원
    if (this.variant !== 'steps' && this.variant !== 'unified') {
      console.log('[LoadingManager] 단계 인디케이터 업데이트 스킵 (variant:', this.variant, ')');
      return;
    }
    
    console.log('[LoadingManager] 단계 인디케이터 업데이트:', {
      variant: this.variant,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps
    });
    
    const stepsContainer = document.getElementById('loadingSteps');
    if (!stepsContainer) {
      console.warn('[LoadingManager] 단계 컨테이너를 찾을 수 없습니다.');
      return;
    }
    
    const steps = [
      '서버 연결',
      '데이터 조회',
      '그래프 구성',
      '완료'
    ];
    
    stepsContainer.innerHTML = steps.map((step, index) => {
      const isCompleted = index < this.currentStep;
      const isActive = index === this.currentStep;
      
      return `
        <div class="step-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}" 
             aria-label="${step} ${isCompleted ? '완료' : isActive ? '진행 중' : '대기 중'}">
          <div class="step-dot"></div>
          <span class="step-label">${step}</span>
          ${index < steps.length - 1 ? '<div class="step-line"></div>' : ''}
        </div>
      `;
    }).join('');
    
    // 하이브리드 디자인: 단계 인디케이터 항상 표시 (사라짐 방지)
    if (this.variant === 'unified' && stepsContainer) {
      stepsContainer.style.display = 'flex';
      stepsContainer.setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * 로딩 표시
   * @param {string} message - 로딩 메시지
   * @param {number} estimatedDuration - 예상 소요 시간 (ms, 선택사항)
   */
  show(message = '그래프 데이터 불러오는 중…', estimatedDuration = null) {
    // 이미 표시 중이면 메시지만 업데이트
    if (this.isVisible) {
      this.updateMessage(message);
      return;
    }

    this.startTime = Date.now();
    this.isVisible = true;
    this.currentProgress = 0;
    this.targetProgress = 0;

    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingBar = document.getElementById('loadingBar');
    const ariaLiveRegion = document.getElementById('aria-live-region');

    if (!overlay) {
      console.warn('[LoadingManager] 로딩 오버레이를 찾을 수 없습니다.');
      return;
    }

    // 오버레이 표시 (variant 클래스 확실히 적용 — 단계표시 유지)
    overlay.classList.remove('hidden');
    if (this.variant && !overlay.classList.contains(`variant-${this.variant}`)) {
      overlay.classList.remove('variant-minimal', 'variant-progress', 'variant-steps', 'variant-unified', 'variant-skeleton');
      overlay.classList.add(`variant-${this.variant}`);
    }
    overlay.setAttribute('aria-busy', 'true');
    overlay.setAttribute('aria-live', 'polite');

    // 메시지 업데이트 (안내 문구는 별도 요소로, show 시에는 비움)
    if (loadingText) {
      loadingText.textContent = message;
    }
    const loadingGuidance = document.getElementById('loadingGuidance');
    if (loadingGuidance) {
      loadingGuidance.textContent = '';
    }

    // 스크린 리더 알림
    if (ariaLiveRegion) {
      ariaLiveRegion.textContent = message;
    }

    // 진행률 초기화
    const progressBar = overlay.querySelector('.loading-progress');
    if (loadingBar && progressBar) {
      loadingBar.style.width = '0%';
      loadingBar.style.animation = 'none';
      progressBar.classList.remove('indeterminate');
      progressBar.setAttribute('aria-valuenow', '0');
      progressBar.setAttribute('aria-label', '로딩 중...');
      
      // 하이브리드 디자인: 초기에는 진행률 없음
      if (this.variant === 'unified') {
        overlay.classList.remove('has-progress');
        progressBar.removeAttribute('data-progress');
      }
    }
    
    // 하이브리드 디자인: 단계 인디케이터 초기화 (로딩 중 단계표시 항상 노출)
    if (this.variant === 'unified') {
      this.totalSteps = Math.max(this.totalSteps || 0, 4);
      this.currentStep = this.currentStep ?? 0;
      this.updateStepIndicator();
      const stepsEl = document.getElementById('loadingSteps');
      if (stepsEl) stepsEl.style.display = 'flex';
      console.log('[LoadingManager] 하이브리드 디자인 초기화 완료');
    }

    // 예상 시간이 있으면 진행률 시뮬레이션
    if (estimatedDuration) {
      this.simulateProgress(estimatedDuration);
    } else {
      // 불확실한 진행률: indeterminate 스타일 사용 (앞뒤 움직임 제거)
      this.startIndeterminateProgress();
    }

    // 상태 업데이트
    stateManager.setState('ui.loading', true);
  }

  /**
   * 로딩 메시지 업데이트
   * 메인 메시지와 괄호 안내 문구를 분리해, 안내는 줄바꿈·비볼드·회색으로 표시.
   * @param {string} message - 메인 메시지
   * @param {string} [guidance] - 안내 문구 (줄바꿈, 회색, 비볼드). 없으면 숨김.
   */
  updateMessage(message, guidance = null) {
    const loadingText = document.getElementById('loadingText');
    const loadingGuidance = document.getElementById('loadingGuidance');
    const ariaLiveRegion = document.getElementById('aria-live-region');

    if (loadingText) {
      loadingText.textContent = message;
    }
    if (loadingGuidance) {
      loadingGuidance.textContent = guidance ?? '';
      loadingGuidance.style.display = guidance ? '' : 'none';
    }

    if (ariaLiveRegion) {
      ariaLiveRegion.textContent = message;
    }
  }

  /**
   * 진행률 업데이트 (실제 진행률이 있을 때만 사용)
   * @param {number} progress - 진행률 (0-100)
   */
  updateProgress(progress) {
    this.targetProgress = Math.min(100, Math.max(0, progress));
    
    const overlay = document.getElementById('loadingOverlay');
    const loadingBar = document.getElementById('loadingBar');
    const progressBar = document.querySelector('.loading-progress');
    
    if (!loadingBar || !progressBar) return;
    
    // 하이브리드 디자인: 진행률이 있으면 has-progress 클래스 추가
    if (overlay && this.variant === 'unified') {
      overlay.classList.add('has-progress');
      // 프로그레스바에 퍼센트 표시
      progressBar.setAttribute('data-progress', `${Math.round(this.targetProgress)}%`);
    }
    
    // indeterminate 모드 해제 (실제 진행률이 있으므로)
    progressBar.classList.remove('indeterminate');
    loadingBar.style.animation = 'none';
    
    // 부드러운 애니메이션으로 실제 진행률 표시
    const animate = () => {
      if (this.currentProgress < this.targetProgress) {
        this.currentProgress = Math.min(
          this.currentProgress + 2, 
          this.targetProgress
        );
        loadingBar.style.width = `${this.currentProgress}%`;
        progressBar.setAttribute('aria-valuenow', Math.round(this.currentProgress));
        progressBar.setAttribute('aria-label', `진행률: ${Math.round(this.currentProgress)}%`);
        
        // 하이브리드 디자인: 진행률 퍼센트 업데이트
        if (overlay && this.variant === 'unified') {
          progressBar.setAttribute('data-progress', `${Math.round(this.currentProgress)}%`);
        }
        
        if (this.currentProgress < this.targetProgress) {
          requestAnimationFrame(animate);
        }
      }
    };
    animate();
  }

  /**
   * 진행률을 indeterminate로 전환 (시간이 걸리는 구간에서 "멈춘 것 같다" 인상 방지)
   * 데이터 조회 등 응답 대기 중 호출 권장.
   */
  setProgressIndeterminate() {
    this.startIndeterminateProgress();
  }

  /**
   * 불확실한 진행률 애니메이션 시작 (indeterminate 스타일)
   * UX 개선: 앞뒤로 움직이는 대신 indeterminate 스타일 사용
   * @private
   */
  startIndeterminateProgress() {
    const loadingBar = document.getElementById('loadingBar');
    const progressBar = document.querySelector('.loading-progress');
    
    if (!loadingBar || !progressBar) return;
    
    // 프로그레스바를 indeterminate 모드로 설정
    progressBar.classList.add('indeterminate');
    progressBar.setAttribute('aria-valuenow', null);
    progressBar.setAttribute('aria-label', '로딩 중...');
    
    // 프로그레스바 숨기고 스피너만 표시 (중복 제거)
    // 또는 프로그레스바를 indeterminate 스타일로 변경
    loadingBar.style.width = '100%';
    loadingBar.style.animation = 'indeterminate-progress 1.5s ease-in-out infinite';
  }

  /**
   * 예상 시간 기반 진행률 시뮬레이션
   * @private
   */
  simulateProgress(estimatedDuration) {
    const startTime = Date.now();
    const interval = 50; // 업데이트 간격 (ms)
    
    this.progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(90, (elapsed / estimatedDuration) * 100);
      
      this.updateProgress(progress);
      
      if (progress >= 90) {
        clearInterval(this.progressInterval);
      }
    }, interval);
  }

  /**
   * 로딩 숨기기
   * @param {boolean} immediate - 즉시 숨기기 (에러 시 사용)
   */
  hide(immediate = false) {
    if (!this.isVisible) {
      return;
    }

    const hideLoading = () => {
      const overlay = document.getElementById('loadingOverlay');
      const loadingBar = document.getElementById('loadingBar');
      const ariaLiveRegion = document.getElementById('aria-live-region');

      if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-busy', 'false');
      }

      // 진행률 완료 표시 및 정리
      const progressBar = document.querySelector('.loading-progress');
      if (progressBar) {
        progressBar.classList.remove('indeterminate');
      }
      
      if (loadingBar) {
        // 완료 애니메이션
        this.updateProgress(100);
        setTimeout(() => {
          loadingBar.style.width = '0%';
          loadingBar.style.animation = 'none';
        }, 300);
      }

      // 진행률 애니메이션 정리
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }

      // 성능 기록
      if (this.startTime) {
        const loadTime = Date.now() - this.startTime;
        this.recordLoadTime(loadTime);
      }

      this.isVisible = false;
      this.currentProgress = 0;
      this.targetProgress = 0;
      stateManager.setState('ui.loading', false);

      // 스크린 리더 알림
      if (ariaLiveRegion) {
        ariaLiveRegion.textContent = '로딩이 완료되었습니다.';
      }
    };

    if (immediate) {
      hideLoading();
    } else {
      // 최소 표시 시간 확인
      const elapsed = this.startTime ? Date.now() - this.startTime : 0;
      const remaining = Math.max(0, this.minDisplayTime - elapsed);

      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
      }

      this.hideTimeout = setTimeout(() => {
        hideLoading();
        this.hideTimeout = null;
      }, remaining);
    }
  }

  /**
   * 첫 페인트 후 로딩 숨김 (로딩 끝나고 빈 화면이 떴다가 그래프가 뜨는 현상 방지)
   * requestAnimationFrame 2회로 브라우저가 그래프 캔버스를 그린 뒤 오버레이 제거.
   * @param {boolean} [immediate=false] - true면 rAF 없이 바로 hide() 호출
   */
  hideAfterPaint(immediate = false) {
    if (immediate) {
      this.hide();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.hide();
      });
    });
  }

  /**
   * 에러 상태로 전환
   * @param {string} errorMessage - 에러 메시지
   */
  showError(errorMessage) {
    const loadingText = document.getElementById('loadingText');
    const overlay = document.getElementById('loadingOverlay');
    const ariaLiveRegion = document.getElementById('aria-live-region');

    // 진행률 애니메이션 정리
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    // 에러 메시지 표시 (안내 문구 제거)
    if (loadingText) {
      loadingText.textContent = errorMessage;
      loadingText.classList.add('error');
    }
    const loadingGuidance = document.getElementById('loadingGuidance');
    if (loadingGuidance) {
      loadingGuidance.textContent = '';
      loadingGuidance.style.display = 'none';
    }

    // 스크린 리더 알림
    if (ariaLiveRegion) {
      ariaLiveRegion.textContent = `오류: ${errorMessage}`;
    }

    // 에러 상태 표시 (빨간색)
    if (overlay) {
      overlay.classList.add('error-state');
    }

    // 2초 후 숨기기
    setTimeout(() => {
      this.hide(true);
      if (loadingText) {
        loadingText.classList.remove('error');
      }
      if (overlay) {
        overlay.classList.remove('error-state');
      }
    }, 2000);
  }

  /**
   * 로드 시간 기록 (성능 모니터링)
   * @private
   */
  recordLoadTime(loadTime) {
    this.loadTimes.push(loadTime);
    
    // 최대 개수 제한
    if (this.loadTimes.length > this.maxLoadTimes) {
      this.loadTimes.shift();
    }

    // 개발 환경에서만 로깅
    if (import.meta.env?.DEV || window.location.hostname === 'localhost') {
      console.log(`[LoadingManager] 로드 시간: ${loadTime}ms`);
      
      if (this.loadTimes.length >= 10) {
        const avg = this.loadTimes.reduce((a, b) => a + b, 0) / this.loadTimes.length;
        const max = Math.max(...this.loadTimes);
        console.log(`[LoadingManager] 평균 로드 시간: ${Math.round(avg)}ms, 최대: ${max}ms`);
      }
    }
  }

  /**
   * 평균 로드 시간 조회
   * @returns {number} 평균 로드 시간 (ms)
   */
  getAverageLoadTime() {
    if (this.loadTimes.length === 0) {
      return 0;
    }
    return this.loadTimes.reduce((a, b) => a + b, 0) / this.loadTimes.length;
  }

  /**
   * 정리
   */
  cleanup() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
  }
}

// 싱글톤 인스턴스
export const loadingManager = new LoadingManager();
