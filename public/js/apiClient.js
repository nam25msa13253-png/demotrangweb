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
