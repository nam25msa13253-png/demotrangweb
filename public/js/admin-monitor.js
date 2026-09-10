// =============================== TAB: MONITOR ===============================
// Tach rieng khoi admin.js (truoc day 1 file 419 dong gom ca 5 tab) de de doc/bao tri hon -
// cac ham o day van la global (khong dung type=module) nen switchTab()/admin.js (nap SAU cung,
// xem thu tu <script> trong admin.html) van goi thang duoc ten ham nhu truoc.
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
