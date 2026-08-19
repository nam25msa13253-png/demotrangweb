const staff = ApiClient.getStaff();
if (!staff || !ApiClient.getToken()) window.location.href = 'login.html';
if (staff.role === 'OFFICER') window.location.href = 'counter.html';

document.getElementById('staffName').textContent = `${staff.fullName} (${staff.role})`;

function logout() {
  ApiClient.post('/api/auth/logout', {}).finally(() => { ApiClient.clearSession(); window.location.href = 'login.html'; });
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('hidden', c.id !== `tab-${name}`));
  if (name === 'monitor') loadMonitor();
  if (name === 'dispatch') loadDispatch();
  if (name === 'config') loadConfig();
  if (name === 'reports') loadReports();
}

// =============================== TAB: MONITOR ===============================
async function loadMonitor() {
  try {
    const [metrics, heatmap, counters] = await Promise.all([
      ApiClient.get('/api/admin/analytics/top-metrics'),
      ApiClient.get('/api/admin/analytics/heatmap'),
      ApiClient.get('/api/admin/counters')
    ]);

    document.getElementById('mTotal').textContent = metrics.totalServedToday;
    document.getElementById('mAwt').textContent = metrics.awtMinutes;
    document.getElementById('mAht').textContent = metrics.ahtMinutes;
    document.getElementById('mNoShow').textContent = metrics.noShowRatePercent;

    document.getElementById('heatmapGrid').innerHTML = heatmap.map((h) => `
      <div class="heat-cell heat-${h.level.toLowerCase()}-bg">
        <div>
          <div style="font-weight:700;font-size:1.1rem;">${h.code}</div>
          <div style="font-size:0.85rem;opacity:0.9;">${h.field_name}</div>
        </div>
        <div>
          <div style="font-size:1.6rem;font-weight:800;">${h.waiting_count} chờ</div>
          <div style="font-size:0.8rem;">AWT ~ ${h.avg_wait_minutes}p</div>
        </div>
      </div>`).join('');

    document.getElementById('counterMatrix').innerHTML = counters.map((c) => `
      <div class="counter-row">
        <div>
          <b>${c.code} - ${c.name}</b>
          <span class="badge ${c.status === 'OPEN' ? 'badge-green' : c.status === 'PAUSED' ? 'badge-yellow' : 'badge-gray'}">${c.status}</span>
          <span class="text-muted" style="margin-left:8px;">${c.field_name} • ${c.officer_name || 'Chưa gán cán bộ'}</span>
        </div>
        <div>${c.active_ticket_number ? `<span class="badge badge-blue">${c.active_ticket_number} (${c.active_ticket_status})</span>` : '<span class="text-muted">—</span>'}</div>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

// =============================== TAB: DISPATCH ===============================
let dispatchFieldsCache = [];

async function loadDispatch() {
  try {
    // /api/kiosk/services tra ve TAT CA thu tuc dang hoat dong trong he thong (khong gioi han
    // so luong) - dropdown VIP Injection ben duoi vi vay luon liet ke day du tat ca thu tuc.
    const [counters, fields, services, reasons] = await Promise.all([
      ApiClient.get('/api/admin/counters'),
      ApiClient.get('/api/admin/fields'),
      ApiClient.get('/api/kiosk/services'),
      ApiClient.get('/api/admin/priority-reasons')
    ]);
    dispatchFieldsCache = fields;

    renderDispatchCounters(counters, fields);
    document.getElementById('newCounterField').innerHTML = fields.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');

    const counterOptions = counters.map((c) => `<option value="${c.id}">${c.code} - ${c.name}</option>`).join('');
    document.getElementById('rebalFrom').innerHTML = counterOptions;
    document.getElementById('rebalTo').innerHTML = counterOptions;
    document.getElementById('vipCounter').innerHTML = '<option value="">Tự động (Least Queue Depth)</option>' + counterOptions;

    document.getElementById('vipService').innerHTML = services.map((s) => `<option value="${s.id}">${s.field_name} — ${s.name}</option>`).join('');
    document.getElementById('vipReason').innerHTML = reasons.map((r) => `<option value="${r.code}">${r.label}</option>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

function counterRowHtml(c, fields) {
  return `
    <div class="counter-row" id="counter-row-${c.id}">
      <div class="counter-row-top">
        <div>
          <b>${c.code} - ${c.name}</b>
          <span class="badge ${c.status === 'OPEN' ? 'badge-green' : c.status === 'PAUSED' ? 'badge-yellow' : 'badge-gray'}">${c.status}</span>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-success action-chip" onclick="changeCounterStatus(${c.id}, 'OPEN')">Mở</button>
          <button class="btn btn-warning action-chip" onclick="changeCounterStatus(${c.id}, 'PAUSED')">Tạm dừng</button>
          <button class="btn btn-danger action-chip" onclick="changeCounterStatus(${c.id}, 'CLOSED')">Đóng</button>
        </div>
      </div>
      <div class="counter-row-bottom">
        <select onchange="changeCounterField(${c.id}, this.value)">
          <option value="">Đổi lĩnh vực...</option>
          ${fields.map((f) => `<option value="${f.id}" ${f.id === c.field_id ? 'selected' : ''}>${f.name}</option>`).join('')}
        </select>
        <div class="flex gap-8">
          <button class="btn btn-outline action-chip" onclick="editCounter(${c.id}, '${c.code}', '${c.name.replace(/'/g, "\\'")}')">✏️ Sửa</button>
          <button class="btn btn-danger action-chip" onclick="deleteCounter(${c.id})">🗑️ Xóa</button>
        </div>
      </div>
    </div>`;
}

function renderDispatchCounters(counters, fields) {
  document.getElementById('dispatchCounterList').innerHTML = counters.map((c) => counterRowHtml(c, fields)).join('');
}

function editCounter(counterId, code, name) {
  document.getElementById(`counter-row-${counterId}`).innerHTML = `
    <div class="counter-row-top">
      <input id="editCode-${counterId}" value="${code}" style="max-width:130px;" placeholder="Mã quầy" />
      <input id="editName-${counterId}" value="${name}" style="max-width:200px;flex:1;" placeholder="Tên quầy" />
    </div>
    <div class="counter-row-bottom" style="justify-content:flex-end;">
      <button class="btn btn-primary action-chip" onclick="saveCounterEdit(${counterId})">Lưu</button>
      <button class="btn btn-outline action-chip" onclick="loadDispatch()">Hủy</button>
    </div>`;
}

async function saveCounterEdit(counterId) {
  const code = document.getElementById(`editCode-${counterId}`).value.trim();
  const name = document.getElementById(`editName-${counterId}`).value.trim();
  if (!code || !name) return showToast('Vui lòng nhập đủ mã và tên quầy.', 'error');
  try { await ApiClient.put(`/api/admin/counters/${counterId}`, { code, name }); showToast('Đã cập nhật quầy.', 'success'); loadDispatch(); }
  catch (err) { showToast(err.message, 'error'); }
}

async function deleteCounter(counterId) {
  if (!confirm('Xóa quầy này? Nếu quầy đã có lịch sử giao dịch, hệ thống sẽ từ chối để bảo toàn Audit Trail — khi đó hãy dùng "Đóng" thay vì xóa.')) return;
  const reason = prompt('Lý do xóa quầy (ghi Audit Log):', '') || '';
  try { await ApiClient.delete(`/api/admin/counters/${counterId}`, { reason }); showToast('Đã xóa quầy.', 'success'); loadDispatch(); }
  catch (err) { showToast(err.message, 'error'); }
}

function toggleNewCounterBox(show) {
  const box = document.getElementById('newCounterBox');
  const shouldShow = show !== undefined ? show : box.classList.contains('hidden');
  box.classList.toggle('hidden', !shouldShow);
  if (shouldShow) {
    document.getElementById('newCounterCode').value = '';
    document.getElementById('newCounterName').value = '';
  }
}

async function submitCreateCounter() {
  const code = document.getElementById('newCounterCode').value.trim();
  const name = document.getElementById('newCounterName').value.trim();
  const fieldId = document.getElementById('newCounterField').value;
  if (!code || !name || !fieldId) return showToast('Vui lòng nhập đủ mã quầy, tên quầy và lĩnh vực.', 'error');
  try {
    await ApiClient.post('/api/admin/counters', { code, name, fieldId });
    showToast('Đã thêm quầy mới.', 'success');
    toggleNewCounterBox(false);
    loadDispatch();
  } catch (err) { showToast(err.message, 'error'); }
}

async function changeCounterStatus(counterId, status) {
  const reason = prompt(`Nhập lý do chuyển quầy sang trạng thái ${status}:`, '');
  try { await ApiClient.post(`/api/admin/counters/${counterId}/status`, { status, reason }); showToast('Đã cập nhật trạng thái quầy.', 'success'); loadDispatch(); loadMonitor(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function changeCounterField(counterId, fieldId) {
  if (!fieldId) return;
  try { await ApiClient.post(`/api/admin/counters/${counterId}/field`, { fieldId, reason: 'Doi linh vuc tu Admin Dashboard' }); showToast('Đã đổi lĩnh vực chuyên trách.', 'success'); loadDispatch(); }
  catch (err) { showToast(err.message, 'error'); }
}
async function submitRebalance() {
  const fromCounterId = document.getElementById('rebalFrom').value;
  const toCounterId = document.getElementById('rebalTo').value;
  const percent = document.getElementById('rebalPercent').value;
  try {
    const result = await ApiClient.post('/api/admin/rebalance', { fromCounterId, toCounterId, percent });
    showToast(`Đã san tải ${result.movedCount} vé.`, 'success');
  } catch (err) { showToast(err.message, 'error'); }
}
async function submitPriorityInject() {
  try {
    const result = await ApiClient.post('/api/admin/priority-inject', {
      serviceId: document.getElementById('vipService').value,
      counterId: document.getElementById('vipCounter').value || null,
      citizenName: document.getElementById('vipName').value,
      phone: document.getElementById('vipPhone').value,
      priorityReasonCode: document.getElementById('vipReason').value
    });
    showToast(`Đã cấp vé ưu tiên ${result.ticket.ticket_number}.`, 'success');
  } catch (err) { showToast(err.message, 'error'); }
}
async function submitEmergencySkip() {
  const ticketId = document.getElementById('skipTicketId').value.trim();
  const reason = document.getElementById('skipReason').value.trim();
  if (!ticketId || !reason) return showToast('Vui lòng nhập Ticket ID và lý do.', 'error');
  try { await ApiClient.post(`/api/admin/tickets/${ticketId}/emergency-skip`, { reason }); showToast('Đã đẩy hồ sơ ra khỏi băng chuyền.', 'success'); }
  catch (err) { showToast(err.message, 'error'); }
}
async function submitRestore() {
  const ticketId = document.getElementById('skipTicketId').value.trim();
  const reason = document.getElementById('skipReason').value.trim();
  if (!ticketId) return showToast('Vui lòng nhập Ticket ID.', 'error');
  try { await ApiClient.post(`/api/admin/tickets/${ticketId}/restore`, { reason }); showToast('Đã khôi phục vé.', 'success'); }
  catch (err) { showToast(err.message, 'error'); }
}

// =============================== TAB: CONFIG ===============================
async function loadConfig() {
  try {
    const [configs, forms] = await Promise.all([
      ApiClient.get('/api/admin/configs'),
      ApiClient.get('/api/admin/form-templates')
    ]);
    document.getElementById('configList').innerHTML = Object.values(configs).map((c) => `
      <div class="config-row">
        <div>
          <b>${c.config_key}</b>
          <div class="text-muted" style="font-size:0.82rem;">${c.description || ''} ${c.min_bound !== null ? `(Biên độ: ${c.min_bound} - ${c.max_bound})` : ''}</div>
        </div>
        <div class="flex gap-8">
          <input id="cfg-${c.config_key}" value="${c.config_value}" />
          <button class="btn btn-primary action-chip" onclick="saveConfig('${c.config_key}')">Lưu</button>
        </div>
      </div>`).join('');

    document.getElementById('formTemplateList').innerHTML = forms.map((f) => `
      <div class="counter-row">
        <div><b>${f.form_name}</b> <span class="text-muted">(${f.service_name})</span></div>
        <div class="text-muted">${f.shelf_name} → ${f.tray_number} → ${f.desk_area}</div>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function saveConfig(key) {
  const value = document.getElementById(`cfg-${key}`).value;
  try { await ApiClient.put(`/api/admin/configs/${key}`, { value }); showToast(`Đã cập nhật ${key}.`, 'success'); }
  catch (err) { showToast(err.message, 'error'); }
}

// =============================== TAB: REPORTS ===============================
async function loadReports() {
  try {
    const [kpi, quality, peak, audit] = await Promise.all([
      ApiClient.get('/api/admin/analytics/officer-kpi'),
      ApiClient.get('/api/admin/analytics/service-quality'),
      ApiClient.get('/api/admin/analytics/peak-hour'),
      ApiClient.get('/api/admin/audit-logs?limit=50')
    ]);

    document.querySelector('#kpiTable tbody').innerHTML = kpi.map((k) => `
      <tr><td>${k.full_name}</td><td>${k.completed_count}</td><td>${k.supp_requested_count}</td><td>${k.avg_aht_minutes || '-'}</td><td>${k.on_time_count}</td></tr>
    `).join('') || '<tr><td colspan="5" class="text-muted text-center">Chưa có dữ liệu</td></tr>';

    document.querySelector('#qualityTable tbody').innerHTML = quality.map((q) => `
      <tr><td>${q.field_name}</td><td>${q.total}</td><td>${q.no_show_rate_percent}%</td><td>${q.avg_awt_minutes || '-'}</td></tr>
    `).join('') || '<tr><td colspan="4" class="text-muted text-center">Chưa có dữ liệu</td></tr>';

    const maxCount = Math.max(1, ...peak.map((p) => p.ticket_count));
    document.getElementById('peakHourChart').innerHTML = peak.map((p) => `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
        <div style="font-size:0.75rem;">${p.ticket_count}</div>
        <div style="width:100%; background:var(--color-primary); border-radius:4px 4px 0 0; height:${(p.ticket_count / maxCount) * 100}px;"></div>
        <div style="font-size:0.7rem; color:var(--color-text-muted);">${p.hour}h</div>
      </div>`).join('') || '<p class="text-muted">Chưa có dữ liệu hôm nay</p>';

    document.querySelector('#auditTable tbody').innerHTML = audit.map((a) => `
      <tr>
        <td>${new Date(a.created_at).toLocaleString('vi-VN')}</td>
        <td>${a.admin_name || 'Hệ thống'}</td>
        <td>${a.action}</td>
        <td>${a.target_type} #${a.target_id}</td>
        <td>${a.reason || ''}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="text-muted text-center">Chưa có nhật ký</td></tr>';
  } catch (err) { showToast(err.message, 'error'); }
}

const ws = createWsClient();
ws.on('*', () => {
  const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
  if (activeTab === 'monitor') loadMonitor();
});

loadMonitor();
