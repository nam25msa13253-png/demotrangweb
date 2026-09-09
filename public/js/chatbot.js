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
    'Quầy nào đang mở?',
    'Kết nối Wi-Fi',
    'Nộp hồ sơ trực tuyến (DVC)',
    'Quét mã Bổ sung hồ sơ'
  ];

  const history = []; // {role: 'user'|'assistant', content: string}
  let isOpen = false;
  let isSending = false;

  // Dich vu cuc bo chay TREN CHINH MAY KIOSK (xem thu muc wifi-local-service/ o goc du an) -
  // doc SSID/mat khau THAT ma may nay dang ket noi, khac voi WIFI_SSID/WIFI_PASSWORD Admin nhap
  // tay trong Cau hinh Tham so (dung lam du lieu huong dan van ban chung cho AI/rule-based).
  const WIFI_SERVICE_URL = 'http://localhost:5000/api/current-wifi';
  const WIFI_KEYWORDS = ['wifi', 'wi-fi', 'wi fi', 'mang wifi', 'ket noi mang', 'mat khau wifi', 'internet'];
  let qrLibPromise = null;

  // Nut Thao tac nhanh (Wi-Fi/DVC/Bo sung ho so) truoc day nam o 1 trang Kiosk rieng, nay gop
  // het vao ngay o day (goi y phia tren o nhap) - DVC va Re-entry can hoi lai 1 thong tin (muc
  // VNeID, ma Re-entry) truoc khi goi API that, nen dung 1 "hanh dong dang cho tra loi" doc lap
  // voi lich su chat thong thuong.
  let pendingAction = null; // null | 'AWAIT_VNEID_LEVEL' | 'AWAIT_REENTRY_TOKEN'
  const DVC_KEYWORDS = ['dvc', 'dich vu cong', 'nop truc tuyen', 'vneid', 'nop online', 'nop qua mang'];
  const REENTRY_KEYWORDS = ['bo sung ho so', 'quet ma', 're-entry', 'reentry', 'ma qr', 'quet qr'];

  const widgetHtml = `
    <div class="chatbot-widget">
      <button class="chatbot-fab" id="chatbotFab" aria-label="Mở trợ lý AI">
        <span class="chatbot-fab-icon">💬</span>
      </button>
      <div class="chatbot-panel hidden" id="chatbotPanel">
        <div class="chatbot-panel-header">
          <div class="chatbot-panel-heading">
            <div class="chatbot-panel-avatar">🤖</div>
            <div>
              <div class="chatbot-panel-title"><span class="chatbot-status-dot"></span>Trợ lý AI Hành chính công</div>
              <div class="chatbot-panel-sub">Hỏi về thủ tục, giấy tờ, lệ phí...</div>
            </div>
          </div>
          <button class="chatbot-close" id="chatbotClose" aria-label="Đóng">✕</button>
        </div>
        <div class="chatbot-messages" id="chatbotMessages">
          <div class="chatbot-row chatbot-row-bot">
            <div class="chatbot-avatar">🤖</div>
            <div class="chatbot-msg chatbot-msg-bot">
              Xin chào! Tôi là trợ lý ảo của Trung tâm Hành chính công. Bạn cần hỏi về thủ tục nào?
            </div>
          </div>
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
  const input = document.getElementById('chatbotInput');
  const sendBtn = document.getElementById('chatbotSend');

  // Goi y (chip) truoc day nam co dinh 1 lan dau tien roi bi xoa han sau cau hoi dau tien -
  // nguoi dung khong con cach nao bam lai goi y nhanh nua. Gio gan goi y theo TUNG LUOT tra loi:
  // luon hien lai ngay ben duoi cau tra loi MOI NHAT (cuon theo dong tin nhan, khong chiem
  // khong gian co dinh), va tu dong go bo goi y cua luot truoc do khi 1 cau hoi moi duoc gui.
  let currentSuggestionsRow = null;
  function clearSuggestions() {
    if (currentSuggestionsRow) { currentSuggestionsRow.remove(); currentSuggestionsRow = null; }
  }
  function renderSuggestions() {
    clearSuggestions();
    const row = document.createElement('div');
    row.className = 'chatbot-suggestions';
    row.innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="chatbot-chip">${s}</button>`).join('');
    row.querySelectorAll('.chatbot-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = chip.textContent;
        sendMessage();
      });
    });
    messagesBox.appendChild(row);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    currentSuggestionsRow = row;
  }
  renderSuggestions();

  function togglePanel(open) {
    isOpen = open !== undefined ? open : !isOpen;
    panel.classList.toggle('hidden', !isOpen);
    if (isOpen) input.focus();
  }

  fab.addEventListener('click', () => togglePanel());
  closeBtn.addEventListener('click', () => togglePanel(false));

  // Markdown-lite: AI hay tra ve **in dam** va gach dau dong bang * / -. Neu hien thi bang
  // textContent thi cac ky tu ** se hien nguyen van, rat roi mat. Ham nay escape HTML truoc
  // roi doi **/* + danh sach thanh the HTML tuong ung, chi ho tro tap con markdown can dung.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  function renderMarkdownLite(raw) {
    const lines = escapeHtml(raw).split(/\r?\n/);
    let html = '';
    let listType = null;

    function closeList() {
      if (listType) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        listType = null;
      }
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);

      if (bulletMatch) {
        if (listType !== 'ul') { closeList(); html += '<ul class="chatbot-list">'; listType = 'ul'; }
        html += `<li>${formatInline(bulletMatch[1])}</li>`;
      } else if (numberedMatch) {
        if (listType !== 'ol') { closeList(); html += '<ol class="chatbot-list">'; listType = 'ol'; }
        html += `<li>${formatInline(numberedMatch[1])}</li>`;
      } else if (trimmed === '') {
        closeList();
      } else {
        closeList();
        html += `<p class="chatbot-line">${formatInline(trimmed)}</p>`;
      }
    });
    closeList();
    return html;
  }

  function appendMessage(text, role) {
    const isBot = role !== 'user';
    const row = document.createElement('div');
    row.className = `chatbot-row chatbot-row-${isBot ? 'bot' : 'user'}`;

    if (isBot) {
      const avatar = document.createElement('div');
      avatar.className = 'chatbot-avatar';
      avatar.textContent = '🤖';
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = `chatbot-msg chatbot-msg-${isBot ? 'bot' : 'user'}`;
    if (isBot) {
      bubble.innerHTML = renderMarkdownLite(text);
    } else {
      bubble.textContent = text;
    }
    row.appendChild(bubble);

    messagesBox.appendChild(row);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return bubble;
  }

  function appendTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'chatbot-row chatbot-row-bot';
    row.id = 'chatbotTyping';

    const avatar = document.createElement('div');
    avatar.className = 'chatbot-avatar';
    avatar.textContent = '🤖';
    row.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'chatbot-msg chatbot-msg-bot';
    bubble.innerHTML = '<div class="chatbot-typing-dots"><span></span><span></span><span></span></div>';
    row.appendChild(bubble);

    messagesBox.appendChild(row);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('chatbotTyping');
    if (el) el.remove();
  }

  // Bo dau + ha chu thuong (giong ham unaccentVi/normalize ben ruleBasedAssistant.js) de nhan
  // dien cau hoi Wi-Fi du go co dau hay khong dau.
  function unaccentVi(str) {
    return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }
  function isWifiQuestion(text) {
    const normalized = unaccentVi(text).toLowerCase();
    return WIFI_KEYWORDS.some((k) => normalized.includes(k));
  }

  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  // Tai thu vien sinh QR (qrcodejs) qua CDN, chi 1 lan - khong bat trang nao dung chatbot.js
  // phai tu them the <script> rieng, giu dung tinh than "chi can nhung 1 file" o dau file nay.
  function loadQrLibrary() {
    if (window.QRCode) return Promise.resolve();
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Khong tai duoc thu vien QR'));
      document.head.appendChild(script);
    });
    return qrLibPromise;
  }

  // Goi Dich vu Wi-Fi cuc bo (chay tren chinh may Kiosk, xem wifi-local-service/README.md) de
  // lay SSID/mat khau THAT may nay dang ket noi, hien the ngay trong khung chat kem ma QR that -
  // khong dieu huong sang trang/modal nao khac. Neu dich vu chua chay tren may nay (VD dang test
  // tren may van phong khong phai Kiosk that), lang le bo qua: cau tra loi huong dan van ban tu
  // bo rule-based/AI o tren van du de nguoi dung tu bam nut "Ket noi Wi-Fi" tren man hinh chinh.
  async function appendWifiCard() {
    let data;
    try {
      const res = await fetchWithTimeout(WIFI_SERVICE_URL, 2500);
      data = await res.json();
    } catch (err) {
      return;
    }

    const row = document.createElement('div');
    row.className = 'chatbot-row chatbot-row-bot';
    const avatar = document.createElement('div');
    avatar.className = 'chatbot-avatar';
    avatar.textContent = '📶';
    row.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'chatbot-msg chatbot-msg-bot chatbot-wifi-card';

    if (!data.success) {
      bubble.innerHTML = `<p class="chatbot-line">${escapeHtml(data.error || 'Máy này hiện không kết nối Wi-Fi nào.')}</p>`;
      row.appendChild(bubble);
      messagesBox.appendChild(row);
      messagesBox.scrollTop = messagesBox.scrollHeight;
      return;
    }

    bubble.innerHTML = `
      <div class="chatbot-wifi-card-row"><span>Tên mạng (SSID)</span><b>${escapeHtml(data.ssid)}</b></div>
      <div class="chatbot-wifi-card-row">
        <span>Mật khẩu</span>
        <b>${escapeHtml(data.password || '(mạng mở, không cần mật khẩu)')}</b>
        ${data.password ? '<button type="button" class="chatbot-wifi-copy" id="chatbotWifiCopyBtn">Sao chép</button>' : ''}
      </div>
      <div class="chatbot-wifi-qr" id="chatbotWifiQr"></div>
      <div class="chatbot-wifi-note">Quét mã QR trên bằng camera điện thoại để kết nối Wi-Fi ngay.</div>
    `;
    row.appendChild(bubble);
    messagesBox.appendChild(row);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    const copyBtn = bubble.querySelector('#chatbotWifiCopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.password);
          copyBtn.textContent = 'Đã sao chép!';
          setTimeout(() => { copyBtn.textContent = 'Sao chép'; }, 1500);
        } catch (e) { /* Clipboard API co the bi chan (VD trang khong phai HTTPS) - bo qua */ }
      });
    }

    try {
      await loadQrLibrary();
      new window.QRCode(bubble.querySelector('#chatbotWifiQr'), { text: data.qrString, width: 140, height: 140 });
      messagesBox.scrollTop = messagesBox.scrollHeight;
    } catch (e) { /* Khong tai duoc thu vien QR - SSID/mat khau van con hien de doc thu cong */ }
  }

  // ---- DVC / VNeID: hoi muc dinh danh roi goi API kiem tra dieu kien that (khong chi tra loi
  // van ban chung chung) ----
  async function handleDvcRequest() {
    pendingAction = 'AWAIT_VNEID_LEVEL';
    appendMessage('Để nộp hồ sơ trực tuyến qua Dịch vụ công (DVC), cho tôi biết mức định danh điện tử VNeID hiện tại của bạn là Mức 1 hay Mức 2? (Trả lời "1" hoặc "2")', 'bot');
  }
  async function handleVneidAnswer(text) {
    const level = /2/.test(text) ? 2 : /1/.test(text) ? 1 : null;
    if (!level) {
      appendMessage('Xin lỗi, vui lòng trả lời "Mức 1" hoặc "Mức 2".', 'bot');
      return;
    }
    pendingAction = null;
    appendTypingIndicator();
    try {
      const res = await fetch('/api/kiosk/dvc/check-vneid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vneidLevel: level })
      });
      const result = await res.json();
      removeTypingIndicator();
      if (result.eligible) {
        appendMessage('Bạn đủ điều kiện nộp trực tuyến! Các bước thực hiện:\n' + result.guideSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'), 'bot');
      } else {
        appendMessage(result.message, 'bot');
      }
      renderSuggestions();
    } catch (err) {
      removeTypingIndicator();
      appendMessage('Không kiểm tra được điều kiện, vui lòng thử lại.', 'bot');
      renderSuggestions();
    }
  }

  // ---- Re-entry: hoi ma roi goi API chen lai vao hang doi that ----
  async function handleReentryRequest() {
    pendingAction = 'AWAIT_REENTRY_TOKEN';
    appendMessage('Vui lòng nhập mã Re-entry được cán bộ cấp cho bạn khi yêu cầu bổ sung hồ sơ:', 'bot');
  }
  async function processReentryToken(token) {
    appendTypingIndicator();
    try {
      const res = await fetch('/api/kiosk/reentry-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
      });
      const result = await res.json();
      removeTypingIndicator();
      if (!res.ok) {
        appendMessage(result.error || 'Mã Re-entry không hợp lệ hoặc đã hết hạn.', 'bot');
        renderSuggestions();
        return;
      }
      appendMessage(`Đã xác nhận! Số thứ tự ${result.ticket.ticket_number} của bạn đã được chèn trở lại hàng đợi ưu tiên. Vui lòng theo dõi Bảng LED/Loa.`, 'bot');
      renderSuggestions();
    } catch (err) {
      removeTypingIndicator();
      appendMessage('Không xử lý được mã Re-entry, vui lòng thử lại.', 'bot');
      renderSuggestions();
    }
  }
  async function handleReentryAnswer(text) {
    const token = text.trim();
    if (!token) { appendMessage('Vui lòng nhập mã Re-entry hợp lệ.', 'bot'); return; }
    pendingAction = null;
    await processReentryToken(token);
  }

  // presetText: cho phep trang chu (VD nut Thao tac nhanh tren Kiosk) tu goi 1 cau hoi dinh
  // san thay vi nguoi dung phai tu go, xem window.ChatbotWidget o cuoi file.
  async function sendMessage(presetText) {
    const text = (presetText !== undefined ? presetText : input.value).trim();
    if (!text || isSending) return;

    clearSuggestions(); // an goi y cua luot truoc, se hien lai goi y moi sau khi co cau tra loi
    appendMessage(text, 'user');
    input.value = '';

    // DVC/Re-entry can hoi lai 1 thong tin truoc khi goi API that - xu ly rieng, khong di qua
    // /api/chatbot/ask (chi tra loi van ban, khong thuc hien duoc hanh dong that).
    if (pendingAction === 'AWAIT_VNEID_LEVEL') return handleVneidAnswer(text);
    if (pendingAction === 'AWAIT_REENTRY_TOKEN') return handleReentryAnswer(text);

    const normalizedTrigger = unaccentVi(text).toLowerCase();
    if (DVC_KEYWORDS.some((k) => normalizedTrigger.includes(k))) return handleDvcRequest();
    if (REENTRY_KEYWORDS.some((k) => normalizedTrigger.includes(k))) return handleReentryRequest();

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
        renderSuggestions();
        return;
      }

      appendMessage(data.reply, 'bot');
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: data.reply });

      // Cho the Wi-Fi (neu co) hien xong roi moi hien lai goi y, de dung thu tu: tra loi -> the
      // Wi-Fi -> goi y. Khong await ca chuoi nay o muc sendMessage() de khong lam cham viec mo
      // lai nut gui/xoa typing indicator (xem finally ben duoi).
      (isWifiQuestion(text) ? appendWifiCard() : Promise.resolve()).then(renderSuggestions);
    } catch (err) {
      removeTypingIndicator();
      appendMessage('Không thể kết nối tới trợ lý AI. Vui lòng kiểm tra kết nối mạng.', 'bot');
      renderSuggestions();
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

  // Mo phong quet QR Re-entry that: ma QR (vd tren giay hen bo sung ho so) dan toi URL trang bat
  // ky ?reentry=<token> - vi widget nay nam tren MOI trang cong khai, xu ly ngay tai day thay vi
  // phai phu thuoc 1 trang Kiosk rieng (da bo, gop het chuc nang vao chatbot).
  (function handleReentryFromUrl() {
    const token = new URLSearchParams(window.location.search).get('reentry');
    if (!token) return;
    togglePanel(true);
    clearSuggestions();
    appendMessage(`Mã Re-entry: ${token}`, 'user');
    processReentryToken(token);
  })();

  // API cong khai toi thieu de cac trang khac (VD nut Thao tac nhanh tren Kiosk) tu mo panel
  // va gui san 1 cau hoi huong dan, khong can dong lai voi cach widget dung DOM noi bo.
  window.ChatbotWidget = {
    open: () => togglePanel(true),
    ask: (message) => { togglePanel(true); sendMessage(message); }
  };
})();
