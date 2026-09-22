// Trang Ket noi Wi-Fi (chu to, cho nguoi lon tuoi): ma QR + ten mang + mat khau + huong dan tung
// buoc cho Android / iPhone / nhap tay. Du lieu huong dan tu GET /api/kiosk/wifi-guide
// (src/data/wifiGuide.js - co nguon va muc xac thuc tung buoc).
//
// Nguon thong tin mang: UU TIEN Dich vu Wi-Fi cuc bo tren may Kiosk (http://localhost:5000, doc
// mang THAT may dang ket noi - xem wifi-local-service/); khong co thi dung Wi-Fi Admin cau hinh.
const WIFI_SERVICE_URL = 'http://localhost:5000/api/current-wifi';

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let guideData = null;
let network = null; // { ssid, password, qrString, qrSupported, from }

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function loadNetwork(configured) {
  try {
    const data = await (await fetchWithTimeout(WIFI_SERVICE_URL, 2500)).json();
    if (data && data.success) return { ...data, from: 'local' };
  } catch (err) { /* khong phai may Kiosk hoac dich vu chua chay - dung du lieu cau hinh */ }
  if (configured && configured.ssid) {
    return { ssid: configured.ssid, password: configured.password || '', qrString: configured.payload, qrSupported: true, from: 'config' };
  }
  return null;
}

function fill(text) {
  return text
    .replace('{SSID}', network && network.ssid ? `<b class="hl">${esc(network.ssid)}</b>` : '<b class="hl">(tên mạng do nhân viên cho biết)</b>')
    .replace('{PASSWORD}', network && network.password ? `<b class="hl">${esc(network.password)}</b>` : '<b class="hl">(mật khẩu do nhân viên cho biết)</b>');
}

function renderSteps(group, extraHtml) {
  const items = group.steps.map((s, i) => `
    <li class="big-step">
      <div class="big-step-icon">${s.icon}</div>
      <div class="big-step-body"><span class="big-step-num">Bước ${i + 1}</span><p>${fill(esc(s.text))}</p></div>
    </li>`).join('');
  return `<h3>${esc(group.icon || '')} ${esc(group.title)}</h3>${group.intro ? `<p class="big-text">${esc(group.intro)}</p>` : ''}<ol class="big-steps">${items}</ol>${extraHtml || ''}`;
}

function showPanel(target) {
  const G = guideData.guide;
  document.querySelectorAll('.choice-btn').forEach((b) => b.classList.toggle('active', b.dataset.target === target));
  const panel = document.getElementById('stepPanel');
  if (target === 'android') {
    panel.innerHTML = renderSteps(G.android, `<div class="fallback-box">🔁 ${esc(G.android.ifNotWork)}</div>`);
  } else if (target === 'iphone') {
    panel.innerHTML = renderSteps(G.iphone, `<div class="fallback-box">🔁 ${esc(G.iphone.ifNotWork)}</div>`);
  } else {
    panel.innerHTML = renderSteps(G.manualAndroid) + '<hr/>' + renderSteps(G.manualIphone);
  }
  if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
}

function renderStaffSources() {
  const G = guideData.guide;
  const labels = guideData.statusLabels;
  const groups = [G.android, G.iphone, G.manualAndroid, G.manualIphone];
  const rows = groups.map((g) => `
    <h4>${esc(g.title)}</h4>
    <ul>${g.steps.map((s, i) => `<li>Bước ${i + 1} – <b>${esc(labels[s.status])}</b>${s.note ? `. ${esc(s.note)}` : ''} ${
      (s.sources || []).map((k) => `<a href="${esc(guideData.sources[k].url)}" target="_blank" rel="noopener noreferrer">[${esc(k)}]</a>`).join(' ')}</li>`).join('')}</ul>`).join('');
  const src = Object.entries(guideData.sources).map(([k, v]) =>
    `<li><b>${esc(k)}</b>: <a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.title)}</a> (đọc ngày ${esc(v.accessed)})</li>`).join('');
  const notes = G.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  document.getElementById('staffSources').innerHTML = `${rows}<h4>Nguồn</h4><ul>${src}</ul><h4>Ghi chú</h4><ul>${notes}</ul>`;
}

async function renderNetwork() {
  const ssidEl = document.getElementById('wifiSsid');
  const pwEl = document.getElementById('wifiPassword');
  const caption = document.getElementById('wifiQrCaption');
  const qrBox = document.getElementById('wifiQr');
  if (!network) {
    ssidEl.textContent = '(nhờ nhân viên cho biết)';
    pwEl.textContent = '(nhờ nhân viên cho biết)';
    caption.textContent = 'Chưa có thông tin mạng Wi-Fi. Vui lòng nhờ nhân viên hỗ trợ.';
    document.getElementById('wifiCopyBtn').classList.add('hidden');
    return;
  }
  ssidEl.textContent = network.ssid;
  pwEl.textContent = network.password || '(mạng mở, không cần mật khẩu)';
  document.getElementById('wifiSourceNote').textContent = network.from === 'local'
    ? 'Thông tin lấy trực tiếp từ mạng mà máy Kiosk này đang kết nối.'
    : 'Thông tin mạng do Trung tâm cài đặt. Nếu không kết nối được, nhờ nhân viên kiểm tra lại.';
  if (!network.password) document.getElementById('wifiCopyBtn').classList.add('hidden');

  if (!network.qrString || network.qrSupported === false) {
    caption.textContent = 'Mạng này không có mã QR. Hãy chọn "Không quét được" bên dưới và nhập tay.';
    return;
  }
  try {
    await window.QrLoader.load();
    // eslint-disable-next-line no-new
    new window.QRCode(qrBox, { text: network.qrString, width: 220, height: 220 });
    caption.textContent = 'Mở Máy ảnh (Camera) và đưa vào mã này.';
  } catch (err) {
    caption.textContent = 'Không hiện được mã QR. Hãy chọn "Không quét được" bên dưới và nhập tay.';
  }
}

(async function init() {
  try {
    guideData = await ApiClient.get('/api/kiosk/wifi-guide');
  } catch (err) {
    document.getElementById('stepPanel').textContent = 'Không tải được hướng dẫn. Vui lòng nhờ nhân viên hỗ trợ.';
    return;
  }
  network = await loadNetwork(guideData.network);
  await renderNetwork();

  document.getElementById('stillStuck').textContent = guideData.guide.stillStuck;
  document.getElementById('passwordTips').innerHTML = guideData.guide.passwordTips.items.map((t) => `<li>${esc(t)}</li>`).join('');
  renderStaffSources();

  document.getElementById('choiceRow').addEventListener('click', (e) => {
    const btn = e.target.closest('.choice-btn');
    if (btn) showPanel(btn.dataset.target);
  });
  document.getElementById('wifiCopyBtn').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(network.password);
      e.target.textContent = '✅ Đã sao chép';
    } catch (err) { e.target.textContent = 'Không sao chép được – hãy gõ tay'; }
  });

  const initial = location.hash.replace('#', '');
  showPanel(['android', 'iphone', 'manual'].includes(initial) ? initial : 'android');
})();
