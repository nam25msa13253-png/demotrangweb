// Khung chat lay so cua Kiosk - thay the 3 man hinh rieng biet (tim thu tuc / doi chieu giay to /
// nhan so) truoc day bang MOT hoi thoai lien tuc, dieu khien hoan toan bang van ban tu do (khong
// checkbox/form co dinh cho 3 buoc nghiep vu chinh). 3 nut Thao tac nhanh (Wi-Fi/DVC/Re-entry)
// KHONG con mo modal rieng nua - chung gui thang cau hoi vao CHINH khung chat nay va duoc tra loi
// ngay trong hoi thoai (xem quickAskWifi/quickAskDvc/quickAskReentry va cac handleXxx ben duoi).
// Widget chatbot FAQ o goc man hinh (chatbot.js) van giu nguyen rieng, dung cho cau hoi tu do
// khac (thu tuc/lich su hoi thoai chung), khong lien quan luong nghiep vu trong file nay.

// ---- Rung nhe khi cham man hinh cam ung ----
function tapFeedback() {
  if (navigator.vibrate) navigator.vibrate(12);
}

function closeAllModals() {
  closeModal('formTemplateModal');
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

// Hanh dong phu (Wi-Fi/DVC/Re-entry) doc lap voi may trang thai lay so o tren - cong dan co the
// hoi cac viec nay bat ky luc nao ma khong lam mat tien trinh lay so dang do. null = khong co
// hanh dong phu nao dang cho tra loi tiep theo.
let kioskPendingAction = null; // null | 'AWAIT_VNEID_LEVEL' | 'AWAIT_REENTRY_TOKEN'
const WIFI_SERVICE_URL = 'http://localhost:5000/api/current-wifi'; // Dich vu cuc bo tren may Kiosk, xem wifi-local-service/
const WIFI_TRIGGER_WORDS = ['wifi', 'wi-fi', 'wi fi', 'mang wifi', 'ket noi mang'];
const DVC_TRIGGER_WORDS = ['dvc', 'dich vu cong', 'nop truc tuyen', 'vneid', 'nop online', 'nop qua mang'];
const REENTRY_TRIGGER_WORDS = ['bo sung ho so', 'quet ma', 're-entry', 'reentry', 'ma qr', 'quet qr'];
let qrLibPromise = null;

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
  const normalized = normalizeVi(text);

  // "Huy/doi thu tuc" luon co hieu luc ngay, ke ca dang cho tra loi 1 hanh dong phu (VD dang cho
  // muc VNeID/ma Re-entry) - tranh cong dan bi ket trong 1 vong hoi-dap khong co loi thoat.
  if (kioskPendingAction && CANCEL_PATTERNS.test(normalized)) {
    kioskPendingAction = null;
    appendBotText('Đã huỷ. Bạn cần hỗ trợ gì tiếp theo?');
    return;
  }

  // Tu khoa the hien y dinh ro rang (VD bam thang nut Thao tac nhanh) luon duoc uu tien truoc,
  // ke ca dang co 1 hanh dong phu dang cho tra loi - tranh cong dan bam nut Wi-Fi ma bi "nuot"
  // vao cau hoi VNeID/Re-entry dang do dang. Chi khi KHONG khop tu khoa nao moi xet den
  // kioskPendingAction (nghia la tin nhan hien tai co ve la cau tra loi ngan cho cau hoi truoc).
  if (WIFI_TRIGGER_WORDS.some((k) => normalized.includes(k))) return handleWifiRequest();
  if (DVC_TRIGGER_WORDS.some((k) => normalized.includes(k))) return handleDvcRequest();
  if (REENTRY_TRIGGER_WORDS.some((k) => normalized.includes(k))) return handleReentryRequest();

  if (kioskPendingAction === 'AWAIT_VNEID_LEVEL') return handleVneidAnswer(text);
  if (kioskPendingAction === 'AWAIT_REENTRY_TOKEN') return handleReentryAnswer(text);

  if (kioskStage !== 'DONE' && CANCEL_PATTERNS.test(normalized)) {
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

// Bam nut Thao tac nhanh = gui thang cau hoi tuong ung vao chinh khung chat nay (hien ra nhu
// cong dan vua go cau do), tai su dung dung logic nhan dien tu khoa trong handleKioskMessage.
function quickAskWifi() { tapFeedback(); handleKioskMessage('Tôi muốn kết nối Wi-Fi'); }
function quickAskDvc() { tapFeedback(); handleKioskMessage('Tôi muốn nộp hồ sơ trực tuyến qua DVC'); }
function quickAskReentry() { tapFeedback(); handleKioskMessage('Tôi cần bổ sung hồ sơ'); }

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Tai thu vien sinh QR (qrcodejs) qua CDN, chi 1 lan.
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

// ---- Wi-Fi: uu tien Dich vu Wi-Fi cuc bo tren may Kiosk (SSID/mat khau THAT dang ket noi, xem
// wifi-local-service/README.md); neu dich vu do chua chay tren may nay, fallback sang cau hinh
// WIFI_SSID/WIFI_PASSWORD Admin da nhap tay trong he thong.
async function handleWifiRequest() {
  appendTyping();
  let ssid = null, password = '', qrString = null;

  try {
    const res = await fetchWithTimeout(WIFI_SERVICE_URL, 2500);
    const data = await res.json();
    if (data.success) { ssid = data.ssid; password = data.password || ''; qrString = data.qrString; }
  } catch (e) { /* Dich vu cuc bo chua chay tren may nay - se fallback ben duoi */ }

  if (!ssid) {
    try {
      const info = await ApiClient.get('/api/kiosk/wifi-qr');
      if (info.ssid) { ssid = info.ssid; password = info.password || ''; qrString = info.payload; }
    } catch (e) { /* Bo qua, se chi hien loi chung ben duoi */ }
  }

  removeTyping();
  if (!ssid) {
    appendBotText('Xin lỗi, hiện chưa có thông tin Wi-Fi khả dụng. Vui lòng liên hệ quầy hỗ trợ.');
    return;
  }

  const row = appendKioskRow(
    `<p style="margin:0 0 8px;">Kết nối Wi-Fi: quét mã QR bên dưới hoặc nhập tay SSID/mật khẩu.</p>
     <div class="kiosk-chat-wifi-row"><span>Tên mạng (SSID)</span><b>${escapeHtml(ssid)}</b></div>
     <div class="kiosk-chat-wifi-row">
       <span>Mật khẩu</span>
       <b>${escapeHtml(password || '(mạng mở, không cần mật khẩu)')}</b>
       ${password ? '<button type="button" class="kiosk-chat-wifi-copy" id="kioskWifiCopyBtn">Sao chép</button>' : ''}
     </div>
     <div class="kiosk-chat-wifi-qr" id="kioskWifiQr"></div>`,
    'bot'
  );

  const copyBtn = row.querySelector('#kioskWifiCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(password);
        copyBtn.textContent = 'Đã sao chép!';
        setTimeout(() => { copyBtn.textContent = 'Sao chép'; }, 1500);
      } catch (e) { /* Clipboard API co the bi chan - bo qua */ }
    });
  }

  if (qrString) {
    try {
      await loadQrLibrary();
      new window.QRCode(row.querySelector('#kioskWifiQr'), { text: qrString, width: 150, height: 150 });
    } catch (e) { /* Khong tai duoc thu vien QR - SSID/mat khau van con hien de doc thu cong */ }
  }
}

// ---- DVC / VNeID ----
async function handleDvcRequest() {
  kioskPendingAction = 'AWAIT_VNEID_LEVEL';
  appendBotText('Để nộp hồ sơ trực tuyến qua Dịch vụ công (DVC), cho tôi biết mức định danh điện tử VNeID hiện tại của bạn là Mức 1 hay Mức 2? (Trả lời "1" hoặc "2")');
}
async function handleVneidAnswer(text) {
  const level = /2/.test(text) ? 2 : /1/.test(text) ? 1 : null;
  if (!level) {
    appendBotText('Xin lỗi, vui lòng trả lời "Mức 1" hoặc "Mức 2".');
    return;
  }
  kioskPendingAction = null;
  appendTyping();
  try {
    const result = await ApiClient.post('/api/kiosk/dvc/check-vneid', { vneidLevel: level });
    removeTyping();
    if (result.eligible) {
      appendBotText('Bạn đủ điều kiện nộp trực tuyến! Các bước thực hiện:\n' + result.guideSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
    } else {
      appendBotText(result.message);
    }
  } catch (err) {
    removeTyping();
    appendBotText('Không kiểm tra được điều kiện, vui lòng thử lại: ' + err.message);
  }
}

// ---- Re-entry QR (nhap tay ma trong chat - luong quet QR that qua URL ?reentry= van xu ly rieng
// o initFromUrl ben duoi, khong doi) ----
async function handleReentryRequest() {
  kioskPendingAction = 'AWAIT_REENTRY_TOKEN';
  appendBotText('Vui lòng nhập mã Re-entry được cán bộ cấp cho bạn khi yêu cầu bổ sung hồ sơ:');
}
async function handleReentryAnswer(text) {
  kioskPendingAction = null;
  const token = text.trim();
  if (!token) { appendBotText('Vui lòng nhập mã Re-entry hợp lệ.'); kioskPendingAction = 'AWAIT_REENTRY_TOKEN'; return; }

  appendTyping();
  try {
    const result = await ApiClient.post('/api/kiosk/reentry-scan', { token });
    removeTyping();
    appendBotText(`Đã xác nhận! Số thứ tự ${result.ticket.ticket_number} của bạn đã được chèn trở lại hàng đợi ưu tiên. Vui lòng theo dõi Bảng LED/Loa.`);
  } catch (err) {
    removeTyping();
    appendBotText('Mã Re-entry không hợp lệ hoặc đã hết hạn: ' + err.message);
  }
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
