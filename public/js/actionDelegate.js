// Thay the cho onclick="..."/onchange="..." rai rac trong HTML tinh va trong chuoi template
// render dong (admin.js/counter.js/kiosk-checklist.js) - Content-Security-Policy script-src
// (bat lai o src/server.js) coi MOI inline event handler la 1 dang inline script va chan tuyet
// doi, du no chi goi 1 ham global don gian. Giai phap: 1 cap listener uy quyen (event
// delegation) duy nhat gan vao document, doc thuoc tinh data-action/data-args roi tu goi ham
// global tuong ung (cac ham nghiep vu van khai bao binh thuong qua <script src> khong-module,
// nen tu dong gan vao window nhu truoc).
(function () {
  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Dung khi render HTML dong, VD:
  //   `<button ${actionAttr('changeCounterStatus', c.id, 'OPEN')}>Mo</button>`
  // Truyen chuoi '$value' lam 1 tham so de no duoc thay bang gia tri hien tai cua chinh
  // input/select luc su kien xay ra (thay cho "this.value" cua onchange kieu cu).
  window.actionAttr = function actionAttr(name, ...args) {
    return `data-action="${name}" data-args='${escapeAttr(JSON.stringify(args))}'`;
  };

  function dispatch(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = window[el.dataset.action];
    if (typeof fn !== 'function') {
      console.error(`[actionDelegate] Khong tim thay ham global: ${el.dataset.action}`);
      return;
    }
    const args = (el.dataset.args ? JSON.parse(el.dataset.args) : [])
      .map((a) => (a === '$value' ? el.value : a));
    fn(...args);
  }

  document.addEventListener('click', dispatch);
  document.addEventListener('change', dispatch);
})();
