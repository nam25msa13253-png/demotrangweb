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

  async function request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (!res.ok) {
      if (res.status === 401) { clearSession(); }
      throw new Error((data && data.error) || `Loi HTTP ${res.status}`);
    }
    return data;
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
