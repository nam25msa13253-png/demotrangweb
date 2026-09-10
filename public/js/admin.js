// Loi/khoi tao Admin Control Tower - nap SAU CUNG (xem thu tu <script> trong admin.html), sau
// khi admin-monitor.js/admin-dispatch.js/admin-config.js/admin-reports.js/admin-staff.js da
// dinh nghia xong tung ham cua tab tuong ung, vi switchTab() va loadMonitor() cuoi file nay can
// goi thang cac ham do (deu la ham global, khong dung type=module, nen chi can dung THU TU nap
// la du - xem them public/js/admin-monitor.js).
const staff = ApiClient.getStaff();
if (!staff || !ApiClient.getToken()) window.location.href = 'login.html';
if (staff.role === 'OFFICER') window.location.href = 'counter.html';

document.getElementById('staffName').textContent = `${staff.fullName} (${staff.role})`;
// Tab Quan ly Tai khoan chi danh cho SUPER_ADMIN (khop voi STAFF_MANAGEMENT trong middleware/auth.js).
if (staff.role !== 'SUPER_ADMIN') document.getElementById('staffTabBtn').remove();

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
  if (name === 'staff') loadStaffTab();
}

// Toast realtime cho cac su kien quan trong Admin can biet ngay ca khi khong dang mo dung
// tab (VD dang o tab Bao cao nhung co quay vua bi dong dot ngot o tab khac/thiet bi khac).
function notifyImportantEvent(type, payload) {
  if (type === 'PRIORITY_INJECTED' && payload.ticket && payload.counter) {
    showToast(`Vé ưu tiên mới ${payload.ticket.ticket_number} tại ${payload.counter.code}.`, 'success');
  } else if (type === 'TICKET_CANCELLED' && payload.outcome === 'EMERGENCY_SKIP' && payload.ticket) {
    showToast(`Đã Emergency Skip vé ${payload.ticket.ticket_number}.`, 'error');
  } else if (type === 'TICKET_CANCELLED' && payload.outcome === 'CANCELLED_3_STRIKE' && payload.ticket) {
    showToast(`Vé ${payload.ticket.ticket_number} bị hủy do vắng mặt 3 lần liên tiếp.`, 'error');
  } else if (type === 'COUNTER_STATUS_CHANGED' && payload.counter && payload.counter.status === 'CLOSED') {
    showToast(`${payload.counter.code} vừa chuyển sang trạng thái Đóng.`, 'error');
  } else if (type === 'COUNTER_STATUS_CHANGED' && payload.deleted) {
    showToast(payload.movedCount > 0 ? `Một quầy vừa bị xóa, đã chuyển ${payload.movedCount} vé sang quầy khác.` : 'Một quầy vừa bị xóa.', 'error');
  }
}

const ws = createWsClient();
ws.on('*', (payload, msg) => {
  const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
  if (activeTab === 'monitor') loadMonitor();
  notifyImportantEvent(msg.type, payload || {});
});

loadMonitor();
