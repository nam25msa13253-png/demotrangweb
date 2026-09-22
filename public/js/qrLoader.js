// Tai thu vien sinh QR (qrcodejs, cdnjs - da duoc CSP cho phep o src/server.js) 1 lan, dung chung
// cho cac trang moi (ket-noi-wifi.html...). chatbot.js va kiosk-checklist.js co ban tai rieng cua ho.
window.QrLoader = {
  _promise: null,
  load() {
    if (window.QRCode) return Promise.resolve();
    if (!this._promise) {
      this._promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Khong tai duoc thu vien QR'));
        document.head.appendChild(script);
      });
    }
    return this._promise;
  }
};
