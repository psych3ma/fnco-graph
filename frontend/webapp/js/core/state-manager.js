/**
 * 중앙화된 상태 관리자
 * @module core/state-manager
 */

/**
 * 애플리케이션 상태 관리 클래스
 */
export class StateManager {
  constructor() {
    this.state = {
      filters: new Set(['company', 'person', 'major', 'institution']),
      selectedNode: null,
      chat: {
        history: [],
        context: null
      },
      graph: {
        network: null,
        nodes: null,
        edges: null,
        loading: false
      },
      ui: {
        activeTab: 'detail',
        searchQuery: '',
        propsExpanded: true
      }
    };
    
    this.listeners = new Map();
  }

  /**
   * 상태 구독
   * @param {string} key - 상태 키 (점 표기법 지원: 'chat.history')
   * @param {Function} callback - 콜백 함수
   * @returns {Function} 구독 해제 함수
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  /**
   * 상태 업데이트
   * @param {string} key - 상태 키
   * @param {any} value - 새로운 값
   */
  setState(key, value) {
    const keys = key.split('.');
    let current = this.state;
    
    // 중첩된 키 경로 탐색
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    current[lastKey] = value;
    
    // 리스너 호출
    this.notify(key, value, oldValue);
    
    // 부모 키 리스너도 호출
    if (keys.length > 1) {
      const parentKey = keys.slice(0, -1).join('.');
      this.notify(parentKey, current, oldValue);
    }
  }

  /**
   * 상태 가져오기
   * @param {string} key - 상태 키
   * @returns {any} 상태 값
   */
  getState(key) {
    const keys = key.split('.');
    let current = this.state;
    
    for (const k of keys) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[k];
    }
    
    return current;
  }

  /**
   * 리스너에게 알림
   * @param {string} key - 상태 키
   * @param {any} newValue - 새로운 값
   * @param {any} oldValue - 이전 값
   */
  notify(key, newValue, oldValue) {
    // 정확한 키 매칭
    this.listeners.get(key)?.forEach(callback => {
      try {
        callback(newValue, oldValue, key);
      } catch (error) {
        console.error(`[StateManager] Error in listener for ${key}:`, error);
      }
    });
    
    // 와일드카드 리스너
    this.listeners.get('*')?.forEach(callback => {
      try {
        callback(newValue, oldValue, key);
      } catch (error) {
        console.error('[StateManager] Error in wildcard listener:', error);
      }
    });
  }

  /**
   * 상태 초기화
   */
  reset() {
    this.state = {
      filters: new Set(['company', 'person', 'major', 'institution']),
      selectedNode: null,
      chat: {
        history: [],
        context: null
      },
      graph: {
        network: null,
        nodes: null,
        edges: null,
        loading: false
      },
      ui: {
        activeTab: 'detail',
        searchQuery: '',
        propsExpanded: true
      }
    };
    
    this.notify('*', this.state, null);
  }
}

// 싱글톤 인스턴스
export const stateManager = new StateManager();
