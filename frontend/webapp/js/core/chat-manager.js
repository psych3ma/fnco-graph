/**
 * 챗봇 관리 클래스
 * @module core/chat-manager
 */

import { stateManager } from './state-manager.js';
import { safeExecute, ErrorType } from '../utils/error-handler.js';
import { announceToScreenReader } from '../utils/accessibility.js';

/**
 * 챗봇 관리자 클래스
 */
export class ChatManager {
  constructor() {
    this.messagesContainer = null;
    this.inputElement = null;
  }

  /**
   * 초기화
   */
  initialize() {
    this.messagesContainer = document.getElementById('chatMsgs');
    this.inputElement = document.getElementById('chatInput');
    
    // 상태 구독
    stateManager.subscribe('chat.context', (context) => {
      this.updateContextBar(context);
    });
  }

  /**
   * 제안 질문 전송
   * @param {HTMLElement} button - 버튼 요소
   */
  sendSuggestion(button) {
    const question = button.dataset.q;
    if (!question) return;
    
    const sugState = document.getElementById('sugState');
    if (sugState) sugState.style.display = 'none';
    
    this.appendMessage('user', question);
    this.simulateAIReply(question);
  }

  /**
   * 채팅 전송
   */
  sendChat() {
    if (!this.inputElement) return;
    
    const message = this.inputElement.value.trim();
    if (!message) return;
    
    this.inputElement.value = '';
    this.autoResizeTextarea(this.inputElement);
    
    this.appendMessage('user', message);
    this.simulateAIReply(message);
  }

  /**
   * 메시지 추가
   * @param {string} role - 역할 ('user' | 'ai')
   * @param {string} text - 메시지 텍스트
   */
  appendMessage(role, text) {
    if (!this.messagesContainer) return;
    
    const now = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const msgEl = document.createElement('div');
    msgEl.className = `msg ${role}`;
    msgEl.setAttribute('role', role === 'user' ? 'user' : 'assistant');
    msgEl.innerHTML = `
      <div class="msg-bubble">${this.escapeHtml(text)}</div>
      <div class="msg-time">${now}</div>
    `;
    
    this.messagesContainer.appendChild(msgEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    
    // 채팅 히스토리에 추가
    const history = stateManager.getState('chat.history') || [];
    history.push({ role, content: text, timestamp: Date.now() });
    stateManager.setState('chat.history', history);
    
    if (role === 'user') {
      announceToScreenReader(`사용자 메시지: ${text}`);
    }
  }

  /**
   * AI 응답 시뮬레이션
   * @param {string} question - 질문
   */
  simulateAIReply(question) {
    if (!this.messagesContainer) return;
    
    const typingEl = document.createElement('div');
    typingEl.className = 'msg ai';
    typingEl.id = 'typingEl';
    typingEl.innerHTML = `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    this.messagesContainer.appendChild(typingEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    
    // 실제로는 API 호출
    const context = stateManager.getState('chat.context');
    const replies = [
      context 
        ? `'${context.id}'와 연결된 노드를 Neo4j Cypher로 조회하면 관련 지분 관계가 확인됩니다.`
        : '연결된 노드를 Neo4j Cypher로 조회하면 관련 지분 관계가 확인됩니다.',
      '현재 그래프 기준으로 지분율 50% 이상 최대주주는 총 3건 확인됩니다.',
      `Cypher: \`MATCH (n)-[r:HOLDS_SHARE]->(m) WHERE r.pct >= 50 RETURN n, r, m\``,
      '국민연금은 현재 2개 법인에 5% 이상 지분을 보유하고 있습니다.'
    ];
    
    setTimeout(() => {
      const typing = document.getElementById('typingEl');
      if (typing) typing.remove();
      
      const reply = replies[Math.floor(Math.random() * replies.length)];
      this.appendMessage('ai', reply);
      announceToScreenReader(`AI 응답: ${reply}`);
    }, 1100);
  }

  /**
   * 채팅 초기화
   */
  resetChat() {
    const history = [];
    stateManager.setState('chat.history', history);
    stateManager.setState('chat.context', null);
    
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = `
        <div id="sugState">
          <div class="sug-header">노드를 선택하거나 아래 질문을 눌러보세요</div>
          <div class="suggestions-list" role="group" aria-label="제안 질문">
            <button class="sug-btn" 
                    onclick="window.chatManager?.sendSuggestion(this)" 
                    data-q="지분율 50% 이상인 최대주주 목록을 보여줘"
                    aria-label="지분율 50% 이상 최대주주 목록 질문">지분율 50% 이상 최대주주 목록</button>
            <button class="sug-btn" 
                    onclick="window.chatManager?.sendSuggestion(this)" 
                    data-q="국민연금이 5% 이상 보유한 회사는 어디야?"
                    aria-label="국민연금 5% 이상 보유 회사 질문">국민연금 5% 이상 보유 회사</button>
            <button class="sug-btn" 
                    onclick="window.chatManager?.sendSuggestion(this)" 
                    data-q="2022년 등기임원 평균보수가 가장 높은 회사 TOP 5"
                    aria-label="임원보수 TOP 5 질문">임원보수 TOP 5 (2022년)</button>
            <button class="sug-btn" 
                    onclick="window.chatManager?.sendSuggestion(this)" 
                    data-q="3개 이상 법인에 투자한 주주를 찾아줘"
                    aria-label="다중 법인 투자 주주 질문">다중 법인 투자 주주</button>
          </div>
        </div>
      `;
    }
    
    const ctxBar = document.getElementById('ctxBar');
    if (ctxBar) ctxBar.classList.add('hidden');
    
    announceToScreenReader('채팅이 초기화되었습니다.');
  }

  /**
   * 컨텍스트 바 업데이트
   * @param {Object|null} context - 컨텍스트 노드
   */
  updateContextBar(context) {
    const ctxBar = document.getElementById('ctxBar');
    const ctxChip = document.getElementById('ctxChip');
    
    if (!ctxBar || !ctxChip) return;
    
    if (context) {
      ctxBar.classList.remove('hidden');
      ctxChip.textContent = context.id;
    } else {
      ctxBar.classList.add('hidden');
    }
  }

  /**
   * 컨텍스트 제거
   */
  clearChatContext() {
    stateManager.setState('chat.context', null);
    announceToScreenReader('채팅 컨텍스트가 제거되었습니다.');
  }

  /**
   * 채팅 키 입력 처리
   * @param {KeyboardEvent} event - 키보드 이벤트
   */
  handleChatKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChat();
    }
  }

  /**
   * 텍스트 영역 자동 크기 조정
   * @param {HTMLTextAreaElement} element - 텍스트 영역 요소
   */
  autoResizeTextarea(element) {
    element.style.height = 'auto';
    element.style.height = Math.min(element.scrollHeight, 100) + 'px';
  }

  /**
   * HTML 이스케이프
   * @private
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
