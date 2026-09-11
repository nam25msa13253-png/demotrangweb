// Client HTTP dung chung cho tat ca module (Kiosk khong can token; Counter/Admin can Bearer token).
const ApiClient = (() => {
  function getToken() { return localStorage.getItem('sq_token'); }
  function getStaff() {
    try { return JSON.parse(localStorage.getItem('sq_staff') || 'null'); } catch (e) { return null; }
  }
  function setSession(token, staff) {
    localStorage.setItem('sq_token', token);
    localStorage.setItem('sq_staff', JSON.stringify(staff));
  }
  function clearSession() {
    localStorage.removeItem('sq_token');
    localStorage.removeItem('sq_staff');
  }

  // Render free tier: server "ngu" sau ~15 phut khong co request, khi "thuc day" (cold start)
  // vai giay dau co the tra ve 429/502/503 truoc khi container khoi dong xong hoan toan - dac
  // biet de gap khi 1 trang goi NHIEU request cung luc (VD loadMonitor() dung Promise.all goi
  // 3 API mot luc). Cac ma loi nay la TAM THOI (khong phai loi logic/du lieu) nen tu dong thu
  // lai vai lan truoc khi bao loi that su cho nguoi dung, thay vi bat nguoi dung phai tu bam
  // tai lai trang.
  const TRANSIENT_RETRY_DELAYS_MS = [1000, 2000, 3000];

  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async function request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let attempt = 0;
    for (;;) {
      const res = await fetch(url, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
      });

      if (!res.ok && [429, 502, 503].includes(res.status) && attempt < TRANSIENT_RETRY_DELAYS_MS.length) {
        await delay(TRANSIENT_RETRY_DELAYS_MS[attempt]);
        attempt += 1;
        continue;
      }

      let data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }

      if (!res.ok) {
        if (res.status === 401) { clearSession(); }
        throw new Error((data && data.error) || `Loi HTTP ${res.status}`);
      }
      return data;
    }
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    delete: (url, body) => request('DELETE', url, body),
    getToken, getStaff, setSession, clearSession
  };
})();

// Phien dang nhap dung chung 1 localStorage cho ca trinh duyet: neu 1 tab khac dang nhap/
// dang xuat (VD dang nhap tai khoan Officer trong tab Counter trong khi tab Admin dang mo
// san bang tai khoan SUPER_ADMIN), sq_token bi ghi de ngay lap tuc dung cho MOI tab. Neu
// khong xu ly, tab Admin van hien UI cua vai tro cu (da doc vao bo nho luc tai trang) nhung
// moi request API sau do lai gui token MOI (vai tro khac) -> loi 403 kho hieu ("Vai tro
// OFFICER khong co quyen...") du dang nhin thay giao dien SUPER_ADMIN. Tai lai trang de moi
// tab luon dong bo dung vai tro/token hien hanh va tu dieu huong lai cho phu hop.
window.addEventListener('storage', (e) => {
  if (e.key === 'sq_token' || e.key === 'sq_staff') {
    window.location.reload();
  }
});
