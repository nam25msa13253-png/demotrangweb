// Trang huong dan nop ho so truc tuyen: ve tu GET /api/kiosk/dvc-guide (src/data/dvcGuide.js).
// Moi buoc kem cac "chip" nguon [S1] [S2]... bam vao mo dung URL nguon; muc PARTIAL/UNVERIFIED
// co nhan canh bao de nguoi dan khong hieu nham la quy trinh da duoc xac nhan.
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let data = null;

function sourceChips(keys) {
  if (!keys || !keys.length) return '';
  return `<div class="src-row">Nguồn: ${keys.map((k) => {
    const s = data.SOURCES[k];
    return s ? `<a class="src-chip" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${esc(k)}</a>` : '';
  }).join('')}</div>`;
}

function statusBadge(status) {
  if (status === 'VERIFIED') return '';
  const text = status === 'PARTIAL' ? 'Chưa chắc chắn' : 'Chưa xác thực';
  return `<span class="badge-status ${esc(status)}" title="${esc(data.STATUS_LABELS[status])}">${text}</span>`;
}

function detailsList(details) {
  return details && details.length ? `<ul>${details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
}

function render() {
  document.getElementById('intro').textContent = data.INTRO;

  document.getElementById('prereq').innerHTML = data.PREREQUISITES.map((p) => `
    <div class="dvc-step">
      <div class="icon">${p.icon}</div>
      <div>
        <h3>${esc(p.title)} ${statusBadge(p.status)}</h3>
        <p class="simple">${esc(p.simple)}</p>
        ${detailsList(p.details)}
        ${sourceChips(p.sources)}
      </div>
    </div>`).join('');

  document.getElementById('steps').innerHTML = data.STEPS.map((s) => `
    <div class="dvc-step">
      <div class="no">${s.no}</div>
      <div>
        <h3>${s.icon} ${esc(s.title)} ${statusBadge(s.status)}</h3>
        <p class="simple">${esc(s.simple)}</p>
        ${detailsList(s.details)}
        ${sourceChips(s.sources)}
      </div>
    </div>`).join('');

  document.getElementById('problems').innerHTML = data.COMMON_PROBLEMS.map((p) => `
    <div class="problem-item">
      <b>${esc(p.problem)}</b> ${statusBadge(p.status)}
      <p class="big-text" style="margin:6px 0 0;">${esc(p.advice)}</p>
      ${sourceChips(p.sources)}
    </div>`).join('');

  document.getElementById('unverified').innerHTML = data.UNVERIFIED_TOPICS.map((t) => `<li>${esc(t)}</li>`).join('');

  const sup = data.SUPPORT;
  document.getElementById('support').innerHTML = `
    <p>Tổng đài của Cổng dịch vụ công: <b>${esc(sup.phone)}</b> — Email: <b>${esc(sup.email)}</b></p>
    <p class="text-muted" style="font-size:0.85rem;">${esc(sup.note)} ${sourceChips(sup.sources)}</p>`;

  document.getElementById('sourceList').innerHTML = Object.entries(data.SOURCES).map(([k, s]) =>
    `<li><b>${esc(k)}</b>: <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> — đọc ngày ${esc(s.accessed)}</li>`).join('');
}

(async function init() {
  try {
    data = await ApiClient.get('/api/kiosk/dvc-guide');
    render();
    document.getElementById('printBtn').addEventListener('click', () => window.print());
  } catch (err) {
    document.getElementById('intro').textContent = 'Không tải được hướng dẫn. Vui lòng hỏi cán bộ hỗ trợ.';
  }
})();
