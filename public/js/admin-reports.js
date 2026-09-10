// =============================== TAB: REPORTS ===============================
// Tach rieng khoi admin.js (xem ghi chu trong admin-monitor.js).
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
      <div class="peak-bar-col" title="${p.hour}h: ${p.ticket_count} vé">
        <div class="peak-bar-count">${p.ticket_count}</div>
        <div class="peak-bar" style="height:${Math.max(4, (p.ticket_count / maxCount) * 100)}px;"></div>
        <div class="peak-bar-label">${p.hour}h</div>
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
