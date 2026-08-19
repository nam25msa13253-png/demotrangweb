// Widget Tro ly AI (ho tro Kiosk) - tu gan vao trang, chi can nhung <script src="js/chatbot.js">.
// Doc lap voi apiClient.js de dung duoc tren moi trang (khong yeu cau dang nhap).
//
// De trang nao do tu mo san panel + goi y ngay khi vao trang (vd Trang chu), dat truoc script:
//   <script>window.CHATBOT_AUTO_OPEN = true;</script>
//   <script src="js/chatbot.js"></script>
(function () {
  const SUGGESTIONS = [
    'Làm giấy khai sinh cần gì?',
    'Lệ phí sang tên sổ đỏ bao nhiêu?',
    'Quầy nào đang mở?'
  ];

  const history = []; // {role: 'user'|'assistant', content: string}
  let isOpen = false;
  let isSending = false;

  const widgetHtml = `
    <div class="chatbot-widget">
      <button class="chatbot-fab" id="chatbotFab" aria-label="Mở trợ lý AI">
        <span class="chatbot-fab-icon">💬</span>
      </button>
      <div class="chatbot-panel hidden" id="chatbotPanel">
        <div class="chatbot-panel-header">
          <div>
            <div class="chatbot-panel-title">Trợ lý AI Hành chính công</div>
            <div class="chatbot-panel-sub">Hỏi về thủ tục, giấy tờ, lệ phí...</div>
          </div>
          <button class="chatbot-close" id="chatbotClose" aria-label="Đóng">✕</button>
        </div>
        <div class="chatbot-messages" id="chatbotMessages">
          <div class="chatbot-msg chatbot-msg-bot">
            Xin chào! Tôi là trợ lý ảo của Trung tâm Hành chính công. Bạn cần hỏi về thủ tục nào?
          </div>
          <div class="chatbot-suggestions" id="chatbotSuggestions"></div>
        </div>
        <div class="chatbot-input-row">
          <input type="text" id="chatbotInput" placeholder="Nhập câu hỏi của bạn..." />
          <button class="chatbot-send" id="chatbotSend">➤</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', widgetHtml);

  const fab = document.getElementById('chatbotFab');
  const panel = document.getElementById('chatbotPanel');
  const closeBtn = document.getElementById('chatbotClose');
  const messagesBox = document.getElementById('chatbotMessages');
  const suggestionsBox = document.getElementById('chatbotSuggestions');
  const input = document.getElementById('chatbotInput');
  const sendBtn = document.getElementById('chatbotSend');

  suggestionsBox.innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="chatbot-chip">${s}</button>`).join('');
  suggestionsBox.querySelectorAll('.chatbot-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.textContent;
      sendMessage();
    });
  });

  function togglePanel(open) {
    isOpen = open !== undefined ? open : !isOpen;
    panel.classList.toggle('hidden', !isOpen);
    if (isOpen) input.focus();
  }

  fab.addEventListener('click', () => togglePanel());
  closeBtn.addEventListener('click', () => togglePanel(false));

  function appendMessage(text, role) {
    const div = document.createElement('div');
    div.className = `chatbot-msg chatbot-msg-${role === 'user' ? 'user' : 'bot'}`;
    div.textContent = text;
    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return div;
  }

  function appendTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'chatbot-msg chatbot-msg-bot chatbot-typing';
    div.id = 'chatbotTyping';
    div.textContent = 'Đang soạn trả lời...';
    messagesBox.appendChild(div);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('chatbotTyping');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isSending) return;

    suggestionsBox.remove(); // chi hien goi y ban dau, an di sau cau hoi dau tien
    appendMessage(text, 'user');
    input.value = '';
    isSending = true;
    sendBtn.disabled = true;
    appendTypingIndicator();

    try {
      const res = await fetch('/api/chatbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });
      const data = await res.json();
      removeTypingIndicator();

      if (!res.ok) {
        appendMessage(data.error || 'Đã có lỗi xảy ra, vui lòng thử lại.', 'bot');
        return;
      }

      appendMessage(data.reply, 'bot');
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      removeTypingIndicator();
      appendMessage('Không thể kết nối tới trợ lý AI. Vui lòng kiểm tra kết nối mạng.', 'bot');
    } finally {
      isSending = false;
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  // Tu mo panel + hien goi y ngay khi vao trang (1 lan / phien trinh duyet) neu trang yeu cau.
  if (window.CHATBOT_AUTO_OPEN && !sessionStorage.getItem('chatbotAutoOpened')) {
    sessionStorage.setItem('chatbotAutoOpened', '1');
    setTimeout(() => togglePanel(true), 1200);
  }
})();
