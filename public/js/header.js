// Header dung chung, tu gan vao dau <body> - chi can nhung 1 dong <script src="js/header.js">
// vao moi trang, khong phai lap lai markup logo/nav o tung file HTML.
(function () {
  // login.html KHONG dung header nay (tu quan ly rieng, xem public/login.html).
  const PUBLIC_PAGES = ['', 'index.html', 'kiosk.html', 'huong-dan.html', 'display.html', '404.html'];
  const currentPage = window.location.pathname.split('/').pop();
  const isPublicPage = PUBLIC_PAGES.includes(currentPage);

  // QUAN TRONG: header cong khai (Trang chu/Kiosk/Huong dan/Bang LED) KHONG duoc chua bat ky
  // lien ket nao toi /login.html hay khu vuc Quay/Admin - nguoi dan tra cuu khong duoc thay
  // hoac tiep can luong "goi so"/dang nhap noi bo. Khu vuc can bo hoan toan tach rieng.
  const navItems = isPublicPage
    ? [
        { href: 'index.html', label: 'Trang chủ', match: ['', 'index.html'] },
        { href: 'huong-dan.html', label: 'Hướng dẫn', match: ['huong-dan.html'] }
      ]
    : [
        { href: 'index.html', label: 'Trang chủ', match: [] }
      ];

  const navHtml = navItems.map((item) => {
    const active = item.match.includes(currentPage);
    return `<a href="${item.href}" class="site-nav-link${active ? ' active' : ''}">${item.label}</a>`;
  }).join('');

  // window.SHOW_HEADER_CLOCK = true (dat truoc khi nhung header.js) de hien dong ho
  // thoi gian thuc canh cac lien ket dieu huong - dung cho man hinh Kiosk cong khai.
  const clockHtml = window.SHOW_HEADER_CLOCK ? `<span id="site-clock" class="site-clock"></span>` : '';

  // Nut tang co chu: chi hien o cac trang cong dan truc tiep thao tac (khong hien tren Bang
  // LED display.html - man hinh khong tuong tac, khong co ai bam vao do). Tang nhe (~8%,
  // khong phong to qua muc) va nho trang thai qua localStorage de giu nguyen khi chuyen trang.
  const showFontToggle = isPublicPage && currentPage !== 'display.html';
  const FONT_BOOST_KEY = 'a11y_font_boost';
  const fontToggleHtml = showFontToggle
    ? `<button type="button" class="site-font-toggle" id="site-font-toggle" aria-pressed="false">A<span style="font-size:1.15em;">A</span> Chữ to hơn</button>`
    : '';

  const headerHtml = `
    <header class="site-header">
      <a href="index.html" class="site-brand">
        <img src="assets/logo.svg" alt="Logo KIOSK" class="site-logo" />
        <span class="site-brand-text">KIOSK</span>
      </a>
      <nav class="site-nav">${fontToggleHtml}${clockHtml}${navHtml}</nav>
    </header>
  `;

  document.body.insertAdjacentHTML('afterbegin', headerHtml);

  if (window.SHOW_HEADER_CLOCK) {
    const tick = () => { document.getElementById('site-clock').textContent = new Date().toLocaleString('vi-VN'); };
    tick();
    setInterval(tick, 1000);
  }

  if (showFontToggle) {
    const btn = document.getElementById('site-font-toggle');
    function applyFontBoost(on) {
      document.body.classList.toggle('a11y-font-boost', on);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    applyFontBoost(localStorage.getItem(FONT_BOOST_KEY) === '1');
    btn.addEventListener('click', () => {
      const nowOn = !document.body.classList.contains('a11y-font-boost');
      applyFontBoost(nowOn);
      localStorage.setItem(FONT_BOOST_KEY, nowOn ? '1' : '0');
    });
  }
})();
