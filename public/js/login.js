document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const result = await ApiClient.post('/api/auth/login', { username, password });
    ApiClient.setSession(result.token, result.staff);
    const role = result.staff.role;
    if (role === 'OFFICER') window.location.href = 'counter.html';
    else window.location.href = 'admin.html';
  } catch (err) {
    showToast(err.message, 'error');
  }
});
