// =============================== TAB: CONFIG ===============================
// Tach rieng khoi admin.js (xem ghi chu trong admin-monitor.js).
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
          <button class="btn btn-primary action-chip" ${actionAttr('saveConfig', c.config_key)}>Lưu</button>
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
