// =============================== TAB: STAFF ===============================
// Tach rieng khoi admin.js (xem ghi chu trong admin-monitor.js).
const ROLE_LABELS = { SUPER_ADMIN: 'Super Admin', MANAGER: 'Manager', SUPERVISOR: 'Supervisor', OFFICER: 'Officer' };

async function loadStaffTab() {
  try {
    const list = await ApiClient.get('/api/admin/staff');
    document.getElementById('staffList').innerHTML = list.map((s) => `
      <div class="counter-row">
        <div>
          <b>${s.full_name}</b> <span class="text-muted">(${s.username})</span>
          <span class="badge badge-blue">${ROLE_LABELS[s.role] || s.role}</span>
          <span class="badge ${s.is_active ? 'badge-green' : 'badge-gray'}">${s.is_active ? 'Đang hoạt động' : 'Đã khóa'}</span>
          ${s.role === 'OFFICER' ? (s.counter_code ? `<span class="badge badge-yellow">Quầy ${s.counter_code}</span>` : '<span class="text-muted" style="font-size:0.85rem;">Chưa gán quầy — vào tab Điều phối để gán</span>') : ''}
        </div>
        <div class="flex gap-8">
          <button class="btn btn-outline action-chip" ${actionAttr('resetStaffPassword', s.id)}>🔑 Đặt lại mật khẩu</button>
          ${s.role === 'SUPER_ADMIN' ? '' : `<button class="btn ${s.is_active ? 'btn-danger' : 'btn-success'} action-chip" ${actionAttr('toggleStaffActive', s.id, !s.is_active)}>${s.is_active ? 'Khóa' : 'Kích hoạt'}</button>`}
        </div>
      </div>`).join('') || '<p class="text-muted">Chưa có tài khoản nào.</p>';
  } catch (err) { showToast(err.message, 'error'); }
}

function toggleNewStaffBox(show) {
  const box = document.getElementById('newStaffBox');
  const shouldShow = show !== undefined ? show : box.classList.contains('hidden');
  box.classList.toggle('hidden', !shouldShow);
  if (shouldShow) {
    document.getElementById('newStaffFullName').value = '';
    document.getElementById('newStaffUsername').value = '';
    document.getElementById('newStaffPassword').value = '';
    document.getElementById('newStaffRole').value = 'OFFICER';
  }
}

async function submitCreateStaff() {
  const fullName = document.getElementById('newStaffFullName').value.trim();
  const username = document.getElementById('newStaffUsername').value.trim();
  const password = document.getElementById('newStaffPassword').value;
  const role = document.getElementById('newStaffRole').value;
  if (!fullName || !username || !password) return showToast('Vui lòng nhập đủ họ tên, tên đăng nhập và mật khẩu.', 'error');
  try {
    await ApiClient.post('/api/admin/staff', { fullName, username, password, role });
    showToast('Đã tạo tài khoản mới.', 'success');
    toggleNewStaffBox(false);
    loadStaffTab();
  } catch (err) { showToast(err.message, 'error'); }
}

async function toggleStaffActive(staffId, isActive) {
  const verb = isActive ? 'kích hoạt lại' : 'khóa';
  const ok = await ConfirmDialog.confirm(`Xác nhận ${verb} tài khoản này?`, { danger: !isActive });
  if (!ok) return;
  try {
    await ApiClient.post(`/api/admin/staff/${staffId}/active`, { isActive });
    showToast(`Đã ${verb} tài khoản.`, 'success');
    loadStaffTab();
  } catch (err) { showToast(err.message, 'error'); }
}

async function resetStaffPassword(staffId) {
  const password = await ConfirmDialog.prompt('Nhập mật khẩu mới (tối thiểu 6 ký tự):', '');
  if (!password) return;
  try {
    await ApiClient.put(`/api/admin/staff/${staffId}/password`, { password });
    showToast('Đã đặt lại mật khẩu.', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}
