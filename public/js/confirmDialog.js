// Hop thoai xac nhan/nhap lieu dung chung, thay the confirm()/prompt() goc trinh duyet (trong
// xau, khong dong bo giao dien) bang modal dung style san co (.modal-overlay/.modal-box) cua
// he thong. Tu gan vao trang, chi can nhung <script src="js/confirmDialog.js"> TRUOC script
// nao co goi ConfirmDialog.confirm()/prompt().
const ConfirmDialog = (() => {
  let overlay, messageEl, inputWrap, inputEl, cancelBtn, okBtn;

  function ensureDom() {
    if (overlay) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay hidden" id="confirmDialogOverlay">
        <div class="modal-box" style="max-width:420px;">
          <p id="confirmDialogMessage" style="font-size:1.02rem;white-space:pre-wrap;"></p>
          <div class="field hidden" id="confirmDialogInputWrap">
            <input id="confirmDialogInput" />
          </div>
          <div class="flex gap-12 mt-16">
            <button class="btn btn-outline" id="confirmDialogCancel" style="flex:1;">Hủy</button>
            <button class="btn btn-primary" id="confirmDialogOk" style="flex:1;">Đồng ý</button>
          </div>
        </div>
      </div>
    `);
    overlay = document.getElementById('confirmDialogOverlay');
    messageEl = document.getElementById('confirmDialogMessage');
    inputWrap = document.getElementById('confirmDialogInputWrap');
    inputEl = document.getElementById('confirmDialogInput');
    cancelBtn = document.getElementById('confirmDialogCancel');
    okBtn = document.getElementById('confirmDialogOk');
  }

  // isPrompt=false: tra ve true/false (nhu confirm()). isPrompt=true: tra ve chuoi nhap hoac
  // null neu huy (nhu prompt()).
  function open({ message, isPrompt, defaultValue = '', okLabel, danger }) {
    ensureDom();
    messageEl.textContent = message;
    inputWrap.classList.toggle('hidden', !isPrompt);
    inputEl.value = defaultValue;
    okBtn.textContent = okLabel || 'Đồng ý';
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    overlay.classList.remove('hidden');
    if (isPrompt) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

    return new Promise((resolve) => {
      function finish(result) {
        overlay.classList.add('hidden');
        cancelBtn.removeEventListener('click', onCancel);
        okBtn.removeEventListener('click', onOk);
        overlay.removeEventListener('mousedown', onOverlayClick);
        document.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onCancel() { finish(isPrompt ? null : false); }
      function onOk() { finish(isPrompt ? inputEl.value : true); }
      function onOverlayClick(e) { if (e.target === overlay) onCancel(); }
      function onKeydown(e) {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && isPrompt) onOk();
      }
      cancelBtn.addEventListener('click', onCancel);
      okBtn.addEventListener('click', onOk);
      overlay.addEventListener('mousedown', onOverlayClick);
      document.addEventListener('keydown', onKeydown);
    });
  }

  return {
    confirm: (message, opts = {}) => open({ message, isPrompt: false, ...opts }),
    prompt: (message, defaultValue = '', opts = {}) => open({ message, isPrompt: true, defaultValue, ...opts })
  };
})();
