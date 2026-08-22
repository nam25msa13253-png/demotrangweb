// Goi y tim kiem thu tuc dung chung cho moi thanh tim kiem (Trang chu + Kiosk): khi bam vao o
// nhap, hien ngay danh sach thu tuc pho bien; go chu thi loc dan theo tu khoa (debounce, goi
// lai API /api/kiosk/services?q=...). Khong yeu cau dang nhap, dung duoc tren moi trang cong khai.
const SearchSuggest = (() => {
  const DEBOUNCE_MS = 220;
  const MAX_ITEMS = 8;

  function attach(inputEl, anchorEl, { onSelect }) {
    if (!inputEl || !anchorEl) return;
    anchorEl.classList.add('search-suggest-wrap');

    const list = document.createElement('div');
    list.className = 'search-suggest-list hidden';
    anchorEl.appendChild(list);

    let debounceTimer = null;
    let requestSeq = 0;
    let allServicesCache = null;

    function render(services) {
      if (!services || services.length === 0) {
        list.innerHTML = '<div class="search-suggest-empty">Không tìm thấy thủ tục phù hợp.</div>';
      } else {
        list.innerHTML = services.slice(0, MAX_ITEMS).map((s) => `
          <div class="search-suggest-item" data-id="${s.id}">
            <div class="search-suggest-name">${s.name}</div>
            <div class="search-suggest-meta">${s.field_name} • SLA ${s.sla_minutes} phút</div>
          </div>`).join('');
        list.querySelectorAll('.search-suggest-item').forEach((el, i) => {
          el.addEventListener('mousedown', (e) => {
            e.preventDefault(); // tranh input blur truoc khi bat duoc click
            close();
            inputEl.value = services[i].name;
            onSelect(services[i]);
          });
        });
      }
      list.classList.remove('hidden');
    }

    function close() { list.classList.add('hidden'); }

    async function fetchAndRender(keyword) {
      const seq = ++requestSeq;
      try {
        let services;
        if (!keyword) {
          if (!allServicesCache) allServicesCache = await fetch('/api/kiosk/services').then((r) => r.json());
          services = allServicesCache;
        } else {
          services = await fetch(`/api/kiosk/services?q=${encodeURIComponent(keyword)}`).then((r) => r.json());
        }
        if (seq !== requestSeq) return; // co request moi hon da bay
        render(services);
      } catch (e) { /* bo qua loi mang, giu danh sach cu */ }
    }

    inputEl.addEventListener('focus', () => fetchAndRender(inputEl.value.trim()));
    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const keyword = inputEl.value.trim();
      debounceTimer = setTimeout(() => fetchAndRender(keyword), DEBOUNCE_MS);
    });
    inputEl.addEventListener('blur', () => setTimeout(close, 150));
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  return { attach };
})();
