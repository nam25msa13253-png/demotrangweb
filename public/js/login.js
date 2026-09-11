let pendingCurrentPassword = null;

function goToRoleHome(staff) {
  if (staff.role === 'OFFICER') window.location.href = 'counter.html';
  else window.location.href = 'admin.html';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const result = await ApiClient.post('/api/auth/login', { username, password });
    ApiClient.setSession(result.token, result.staff);

    if (result.mustChangePassword) {
      // Tai khoan dang dung mat khau tam (mac dinh hoac Admin vua cap lai) - bat buoc dat mat
      // khau rieng truoc khi vao he thong. Token da co (o tren) nen goi duoc /change-password.
      pendingCurrentPassword = password;
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('changePasswordForm').classList.remove('hidden');
      return;
    }
    goToRoleHome(result.staff);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  if (newPassword !== confirmPassword) return showToast('Mật khẩu xác nhận không khớp.', 'error');

  try {
    await ApiClient.post('/api/auth/change-password', { currentPassword: pendingCurrentPassword, newPassword });
    showToast('Đã đặt mật khẩu mới.', 'success');
    goToRoleHome(ApiClient.getStaff());
  } catch (err) {
    showToast(err.message, 'error');
  }
});
