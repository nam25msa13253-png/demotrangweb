// Khung chat lay so cua Kiosk - thay the 3 man hinh rieng biet (tim thu tuc / doi chieu giay to /
// nhan so) truoc day bang MOT hoi thoai lien tuc, dieu khien hoan toan bang van ban tu do (khong
// checkbox/form co dinh cho 3 buoc nghiep vu chinh). Cac nut Thao tac nhanh (Wi-Fi/DVC/Re-entry)
// va widget chatbot FAQ o goc man hinh (chatbot.js) van giu nguyen, khong lien quan file nay.

// ---- Rung nhe khi cham man hinh cam ung ----
function tapFeedback() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function closeAllModals() {
  ['wifiModal', 'dvcModal', 'reentryModal', 'formTemplateModal'].forEach(closeModal);
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }

// Kiosk dat noi cong cong: neu cong dan roi di giua chung, tu dong ve trang chu (index.html)
// sau 1 thoi gian khong thao tac de bao ve rieng tu (nguoi ke tiep khong thay STT/thong tin cua
// nguoi truoc con dang mo tren man hinh).
const IDLE_RESET_MS = 90 * 1000;
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (kioskStage !== 'FIND_SERVICE' || kioskChatMessages.children.length > 1) {
      window.location.href = 'index.html';
    }
  }, IDLE_RESET_MS);
}
['click', 'touchstart', 'keydown'].forEach((evt) => document.addEventListener(evt, resetIdleTimer, { passive: true }));

// ================= KHUNG CHAT LAY SO =================
const STEP_ORDER = ['home', 'checklist', 'ticket'];
function updateStepper(stepName) {
  const currentIndex = STEP_ORDER.indexOf(stepName);
  document.querySelectorAll('.kiosk-step').forEach((el) => {
    const idx = STEP_ORDER.indexOf(el.dataset.step);
    el.classList.toggle('active', idx === currentIndex);
    el.classList.toggle('done', idx < currentIndex);
  });
  document.getElementById('stepLine1').classList.toggle('done', currentIndex > 0);
  document.getElementById('stepLine2').classList.toggle('done', currentIndex > 1);
}

const kioskChatMessages = document.getElementById('kioskChatMessages');
const kioskChatInput = document.getElementById('kioskChatInput');
const kioskChatSendBtn = document.getElementById('kioskChatSendBtn');

// May trang thai hoi thoai: FIND_SERVICE (dang go mo ta thu tuc) -> DISAMBIGUATE (nhieu ket qua,
// cho chon 1) -> AWAIT_DOC_CONFIRM (da xac dinh thu tuc, cho xac nhan du giay to) -> DONE (da co so).
let kioskStage = 'FIND_SERVICE';
let kioskCandidates = [];
let kioskMatchedChecklist = null; // { service, requiredDocs, formTemplate }

function unaccentVi(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
function normalizeVi(str) { return unaccentVi(str).toLowerCase().trim(); }

const CANCEL_PATTERNS = /\b(doi thu tuc|chon lai|huy|quay lai tim|tim thu tuc khac)\b/;
function classifyYesNo(text) {
  const n = ' ' + normalizeVi(text) + ' ';
  if (/\b(chua|thieu|khong|ko)\b/.test(n)) return 'no';
  if (/\b(co|roi|du|xong|dong y|ok|oke|da co)\b/.test(n)) return 'yes';
  return null;
}

function appendKioskRow(html, role) {
  const row = document.createElement('div');
  row.className = `kiosk-chat-row ${role === 'user' ? 'user' : ''}`;
  if (role !== 'user') {
    row.innerHTML = `<div class="kiosk-chat-avatar">🤖</div><div class="kiosk-chat-bubble bot">${html}</div>`;
  } else {
    row.innerHTML = `<div class="kiosk-chat-bubble user"></div>`;
    row.querySelector('.kiosk-chat-bubble').textContent = html;
  }
  kioskChatMessages.appendChild(row);
  kioskChatMessages.scrollTop = kioskChatMessages.scrollHeight;
  return row;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function appendBotText(text) {
  appendKioskRow(`<p style="margin:0;">${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`, 'bot');
}

function appendTyping() {
  const row = appendKioskRow('<div class="kiosk-chat-typing" id="kioskTyping"><span></span><span></span><span></span></div>', 'bot');
  return row;
}
function removeTyping() {
  const el = document.getElementById('kioskTyping');
  if (el) el.closest('.kiosk-chat-row').remove();
}

function greet() {
  appendBotText('Xin chào! Bạn cần thực hiện thủ tục hành chính nào hôm nay? Hãy gõ mô tả ngắn gọn, ví dụ "sang tên sổ đỏ" hoặc "khai sinh".');
}

function checklistText(requiredDocs) {
  return (requiredDocs || []).map((d) => `- ${d.name}${d.mandatory ? ' (bắt buộc)' : ' (nếu có)'}`).join('\n');
}

async function handleKioskMessage(rawText) {
  const text = rawText.trim();
  if (!text) return;

  appendKioskRow(text, 'user');
  kioskChatInput.value = '';

  if (kioskStage !== 'DONE' && CANCEL_PATTERNS.test(normalizeVi(text))) {
    kioskStage = 'FIND_SERVICE';
    kioskCandidates = [];
    kioskMatchedChecklist = null;
    updateStepper('home');
    appendBotText('Đã huỷ lựa chọn trước đó. Bạn cần thực hiện thủ tục nào?');
    return;
  }

  if (kioskStage === 'FIND_SERVICE') {
    await stageFindService(text);
  } else if (kioskStage === 'DISAMBIGUATE') {
    await stageDisambiguate(text);
  } else if (kioskStage === 'AWAIT_DOC_CONFIRM') {
    await stageAwaitDocConfirm(text);
  } else {
    appendBotText('Số thứ tự của bạn đã được cấp. Vui lòng theo dõi Bảng LED/Loa, hoặc bấm "Về trang chủ ngay" để nhường máy cho người tiếp theo.');
  }
}

async function stageFindService(query) {
  appendTyping();
  try {
    const services = await ApiClient.get(`/api/kiosk/services?q=${encodeURIComponent(query)}`);
    removeTyping();

    if (services.length === 0) {
      appendBotText('Xin lỗi, tôi chưa tìm thấy thủ tục phù hợp. Bạn thử mô tả lại bằng từ khác, hoặc liên hệ quầy hỗ trợ để được giúp trực tiếp.');
      return;
    }
    if (services.length === 1) {
      await selectService(services[0].id);
      return;
    }

    kioskCandidates = services.slice(0, 5);
    kioskStage = 'DISAMBIGUATE';
    const list = kioskCandidates.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    const row = appendKioskRow(
      `<p style="margin:0 0 4px;">Tôi tìm thấy ${kioskCandidates.length} thủ tục phù hợp, bạn cần thủ tục nào? Gõ số thứ tự hoặc tên thủ tục:</p>
       <p style="margin:0;white-space:pre-wrap;">${escapeHtml(list)}</p>
       <div class="kiosk-chat-candidates"></div>`,
      'bot'
    );
    const candidatesBox = row.querySelector('.kiosk-chat-candidates');
    kioskCandidates.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kiosk-chat-candidate-btn';
      btn.textContent = `${i + 1}. ${s.name}`;
      btn.onclick = () => { tapFeedback(); selectService(s.id); };
      candidatesBox.appendChild(btn);
    });
  } catch (err) {
    removeTyping();
    appendBotText('Đã có lỗi khi tìm thủ tục, vui lòng thử lại: ' + err.message);
  }
}

async function stageDisambiguate(text) {
  const asNumber = Number(text.trim());
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= kioskCandidates.length) {
    await selectService(kioskCandidates[asNumber - 1].id);
    return;
  }

  const normalized = normalizeVi(text);
  const match = kioskCandidates.find((s) => normalizeVi(s.name).includes(normalized) || normalized.includes(normalizeVi(s.name)));
  if (match) {
    await selectService(match.id);
    return;
  }

  // Khong khop lua chon nao - coi nhu 1 truy van tim kiem moi thay vi bao loi cung nhac.
  kioskStage = 'FIND_SERVICE';
  await stageFindService(text);
}

async function selectService(serviceId) {
  appendTyping();
  try {
    const data = await ApiClient.get(`/api/kiosk/services/${serviceId}/checklist`);
    removeTyping();
    kioskMatchedChecklist = data;
    kioskStage = 'AWAIT_DOC_CONFIRM';
    updateStepper('checklist');

    const docs = checklistText(data.requiredDocs);
    appendBotText(
      `Bạn cần thực hiện: "${data.service.name}"\n\nGiấy tờ cần chuẩn bị:\n${docs || '(Không yêu cầu giấy tờ đặc biệt)'}\n\nBạn đã chuẩn bị đầy đủ các giấy tờ bắt buộc trên chưa? (Trả lời "Có" hoặc "Chưa")`
    );
  } catch (err) {
    removeTyping();
    appendBotText('Không tải được thông tin thủ tục, vui lòng thử lại: ' + err.message);
    kioskStage = 'FIND_SERVICE';
  }
}

async function stageAwaitDocConfirm(text) {
  const answer = classifyYesNo(text);
  if (answer === 'no') {
    appendBotText('Không sao, bạn hãy chuẩn bị đầy đủ giấy tờ rồi quay lại đây. Khi sẵn sàng, hãy gõ "đã đủ" hoặc "rồi" để tiếp tục lấy số. Bạn cũng có thể gõ "đổi thủ tục" nếu muốn chọn thủ tục khác.');
    return;
  }
  if (answer !== 'yes') {
    appendBotText('Xin lỗi, bạn vui lòng trả lời "Có" nếu đã chuẩn bị đầy đủ giấy tờ bắt buộc, hoặc "Chưa" nếu còn thiếu.');
    return;
  }
  await submitTicket();
}

async function submitTicket() {
  tapFeedback();
  appendTyping();
  const mandatoryCodes = (kioskMatchedChecklist.requiredDocs || []).filter((d) => d.mandatory).map((d) => d.code);

  try {
    const result = await ApiClient.post('/api/kiosk/tickets', {
      serviceId: kioskMatchedChecklist.service.id,
      citizenName: 'Khách tại Kiosk',
      phone: '',
      confirmedDocCodes: mandatoryCodes
    });
    removeTyping();

    if (result.status === 'REJECTED') {
      showMissingDocsGuide(result);
      appendBotText('Hệ thống ghi nhận bạn còn thiếu giấy tờ bắt buộc (xem hướng dẫn vừa hiện). Vui lòng chuẩn bị xong rồi gõ "đã đủ" để thử lại.');
      return;
    }

    kioskStage = 'DONE';
    updateStepper('ticket');
    renderTicketCard(result.ticket, result.counter);
  } catch (err) {
    removeTyping();
    appendBotText('Không thể lấy số thứ tự lúc này, vui lòng thử lại: ' + err.message);
  }
}

let kioskCountdownTimer = null;
function renderTicketCard(ticket, counter) {
  const row = appendKioskRow(
    `<div class="kiosk-chat-ticket-card">
       <div>Số thứ tự của bạn</div>
       <div class="kiosk-chat-ticket-number">${escapeHtml(ticket.ticket_number)}</div>
       <div style="font-weight:600;font-size:1.15rem;">Vui lòng đến ${escapeHtml(counter.name)}</div>
       <p class="text-muted" style="margin:8px 0 0;">Vui lòng theo dõi Bảng LED và lắng nghe Loa thông báo</p>
       <div class="kiosk-chat-countdown" id="kioskCountdown"></div>
       <button class="btn btn-primary btn-lg mt-16" onclick="goHomeNow()">Về trang chủ ngay</button>
     </div>`,
    'bot'
  );

  kioskChatInput.disabled = true;
  kioskChatSendBtn.disabled = true;

  let secondsLeft = 8;
  const countdownEl = row.querySelector('#kioskCountdown');
  const tick = () => {
    countdownEl.textContent = `Tự động về trang chủ sau ${secondsLeft} giây...`;
    if (secondsLeft <= 0) { goHomeNow(); return; }
    secondsLeft -= 1;
  };
  tick();
  kioskCountdownTimer = setInterval(tick, 1000);
}

function goHomeNow() {
  if (kioskCountdownTimer) clearInterval(kioskCountdownTimer);
  window.location.href = 'index.html';
}

function showMissingDocsGuide(result) {
  const allDocs = (kioskMatchedChecklist && kioskMatchedChecklist.requiredDocs) || [];
  const missingNames = (result.missing || []).map((code) => {
    const doc = allDocs.find((d) => d.code === code);
    return doc ? doc.name : code;
  });

  document.getElementById('missingDocsBox').innerHTML = `
    <div class="missing-list">
      <b>Bạn còn thiếu ${missingNames.length} giấy tờ:</b>
      <ul>${missingNames.map((n) => `<li>${n}</li>`).join('')}</ul>
    </div>`;

  const form = result.formTemplate;
  if (form) {
    document.getElementById('formLocationBox').innerHTML = `
      <div class="location-box">
        <b>📍 Vị trí lấy phôi tờ khai:</b> ${form.shelf_name} → ${form.tray_number} → ${form.desk_area}<br/>
        ${form.annotated_sample_url ? `<img src="${form.annotated_sample_url}" alt="Mẫu tờ khai" style="max-width:100%;border-radius:8px;margin-top:10px;" onerror="this.style.display='none'"/>` : ''}
        <div class="mt-16"><b>Mã tờ khai:</b> ${form.form_name}</div>
      </div>`;
  } else {
    document.getElementById('formLocationBox').innerHTML = '<p class="text-muted">Vui lòng liên hệ quầy hỗ trợ để được hướng dẫn.</p>';
  }
  openModal('formTemplateModal');
}

function sendKioskChat() {
  tapFeedback();
  handleKioskMessage(kioskChatInput.value);
}
kioskChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendKioskChat(); });

// Mo them bang chat AI FAQ voi 1 cau hoi huong dan dinh san, song song voi modal chuc nang that
// (khong thay the) - dung cho 3 nut Thao tac nhanh o man hinh chu Kiosk. Doc lap voi khung chat
// lay so o tren (khung nay dan dat nghiep vu that, con day chi la tro ly hoi-dap huong dan).
function askChatbotGuide(question) {
  if (window.ChatbotWidget) window.ChatbotWidget.ask(question);
}

// ---- Wi-Fi QR ----
async function openWifiModal() {
  askChatbotGuide('Hướng dẫn tôi kết nối Wi-Fi miễn phí tại đây.');
  try {
    const info = await ApiClient.get('/api/kiosk/wifi-qr');
    document.getElementById('wifiInfo').innerHTML = `Tên mạng (SSID): <b>${info.ssid}</b><br/>Mật khẩu: <b>${info.password}</b>`;
    openModal('wifiModal');
  } catch (err) { showToast(err.message, 'error'); }
}

// ---- DVC / VNeID ----
function openDvcModal() {
  askChatbotGuide('Hướng dẫn tôi cách nộp hồ sơ trực tuyến qua Dịch vụ công (DVC).');
  document.getElementById('dvcResult').innerHTML = '';
  openModal('dvcModal');
}
async function checkVneid() {
  const level = document.getElementById('vneidLevel').value;
  try {
    const result = await ApiClient.post('/api/kiosk/dvc/check-vneid', { vneidLevel: level });
    if (result.eligible) {
      document.getElementById('dvcResult').innerHTML = `
        <div class="location-box">
          <b>✅ Đủ điều kiện nộp trực tuyến!</b>
          <ol>${result.guideSteps.map((s) => `<li>${s}</li>`).join('')}</ol>
        </div>`;
    } else {
      document.getElementById('dvcResult').innerHTML = `<div class="missing-list">${result.message}</div>`;
    }
  } catch (err) { showToast(err.message, 'error'); }
}

// ---- Re-entry QR ----
function openReentryModal() {
  askChatbotGuide('Hướng dẫn tôi cách quét mã QR để bổ sung hồ sơ còn thiếu.');
  openModal('reentryModal');
}
async function submitReentry() {
  const token = document.getElementById('reentryTokenInput').value.trim();
  if (!token) return showToast('Vui lòng nhập mã Re-entry.', 'error');
  try {
    const result = await ApiClient.post('/api/kiosk/reentry-scan', { token });
    showToast(`Đã chèn STT ${result.ticket.ticket_number} trở lại hàng đợi ưu tiên.`, 'success');
    closeModal('reentryModal');
  } catch (err) { showToast(err.message, 'error'); }
}

// Auto-xu ly khi mo bang URL ?reentry=<token> (mo phong quet QR that) hoac
// ?serviceId=<id> (nhay thang vao xac nhan giay to khi den tu Trang chu / the danh muc).
(function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('reentry');
  if (token) {
    ApiClient.post('/api/kiosk/reentry-scan', { token })
      .then((result) => showToast(`Đã chèn STT ${result.ticket.ticket_number} trở lại hàng đợi ưu tiên.`, 'success'))
      .catch((err) => showToast(err.message, 'error'));
  }

  updateStepper('home');
  greet();
  resetIdleTimer();

  const serviceId = params.get('serviceId');
  if (serviceId) selectService(Number(serviceId));
})();
