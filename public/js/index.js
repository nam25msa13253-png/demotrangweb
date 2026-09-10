function renderCategoryCards(services, opts) {
  opts = opts || {};
  const grid = document.getElementById('categoryGrid');
  if (!services.length) {
    grid.innerHTML = `<div class="empty-search" style="grid-column: 1 / -1;">Không tìm thấy thủ tục phù hợp. Vui lòng thử từ khóa khác hoặc hỏi Trợ lý AI.</div>`;
    return;
  }
  grid.innerHTML = services.map((s) => `
    <a href="kiosk-checklist.html?serviceId=${s.id}" class="card-link category-card">
      <div class="card">
        <h3>${s.name}</h3>
        <p class="desc">${s.field_name} • SLA ${s.sla_minutes} phút</p>
        <div class="meta">Xem giấy tờ cần chuẩn bị →</div>
      </div>
    </a>
  `).join('');

  if (opts.title) {
    document.getElementById('categoryEyebrow').textContent = 'Kết quả tra cứu';
    document.getElementById('categoryTitle').textContent = opts.title;
    document.getElementById('categorySub').textContent = `Tìm thấy ${services.length} thủ tục phù hợp.`;
  }
}

function renderCategorySkeleton() {
  document.getElementById('categoryGrid').innerHTML = Array.from({ length: 8 })
    .map(() => '<div class="skeleton-card" style="height:130px;"></div>').join('');
}

async function loadPopularServices() {
  renderCategorySkeleton();
  try {
    const services = await fetch('/api/kiosk/services').then((r) => r.json());
    renderCategoryCards(services.slice(0, 8));
    document.getElementById('statServices').textContent = services.length;
  } catch (e) { /* bo qua, giu placeholder */ }
}

async function performSearch(keyword) {
  renderCategorySkeleton();
  try {
    const services = await fetch(`/api/kiosk/services?q=${encodeURIComponent(keyword)}`).then((r) => r.json());
    renderCategoryCards(services, { title: `Kết quả cho "${keyword}"` });
    document.getElementById('categoryGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { /* bo qua */ }
}

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const keyword = document.getElementById('searchInput').value.trim();
  if (keyword) performSearch(keyword); else loadPopularServices();
});

SearchSuggest.attach(document.getElementById('searchInput'), document.getElementById('searchForm'), {
  onSelect: (service) => { window.location.href = `kiosk-checklist.html?serviceId=${service.id}`; }
});

fetch('/api/kiosk/counters/status')
  .then((r) => r.json())
  .then((counters) => {
    const open = counters.filter((c) => c.status === 'OPEN').length;
    const waiting = counters.reduce((sum, c) => sum + Number(c.waiting_count || 0), 0);
    document.getElementById('statOpenCounters').textContent = open;
    document.getElementById('statWaiting').textContent = waiting;
  })
  .catch(() => {});

loadPopularServices();
