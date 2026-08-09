async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.msg || 'Request failed');
  }

  return payload;
}

function requireAuthRedirect() {
  if (!localStorage.getItem('token')) {
    window.location.href = 'login.html';
  }
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function requireAdminRedirect() {
  const token = localStorage.getItem('token');
  const user = getStoredUser();
  if (!token || !user || user.role !== 'admin') {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const phone = document.getElementById('phone')?.value;
      const password = document.getElementById('password')?.value;
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, password }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.msg || 'Login failed');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = 'dashboard.html';
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    if (!requireAdminRedirect()) {
      return;
    }

    const passwordInput = document.getElementById('password');
    const strengthBar = document.getElementById('passwordStrengthBar');
    const strengthText = document.getElementById('passwordStrengthText');

    const updatePasswordStrength = () => {
      const score = getPasswordStrength(passwordInput?.value || '');
      if (strengthBar) {
        strengthBar.style.width = `${Math.min(score, 4) * 25}%`;
        strengthBar.className = 'progress-bar';
        if (score <= 1) strengthBar.classList.add('bg-danger');
        else if (score === 2) strengthBar.classList.add('bg-warning');
        else if (score === 3) strengthBar.classList.add('bg-info');
        else strengthBar.classList.add('bg-success');
      }
      if (strengthText) {
        if (!passwordInput?.value) {
          strengthText.textContent = 'Use at least 8 characters with upper, lower, number, and symbol.';
        } else if (score <= 1) {
          strengthText.textContent = 'Weak password';
        } else if (score === 2) {
          strengthText.textContent = 'Fair password';
        } else if (score === 3) {
          strengthText.textContent = 'Strong password';
        } else {
          strengthText.textContent = 'Very strong password';
        }
      }
    };

    passwordInput?.addEventListener('input', updatePasswordStrength);
    updatePasswordStrength();

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = document.getElementById('name')?.value;
      const phone = document.getElementById('phone')?.value;
      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      const role = document.getElementById('role')?.value;

      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }

      if (getPasswordStrength(password || '') < 4) {
        alert('Password is too weak. Use at least 8 characters with upper, lower, number, and symbol.');
        return;
      }

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, password, role }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.msg || 'Registration failed');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = 'dashboard.html';
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const stockTable = document.getElementById('stockTable');
  if (stockTable) {
    requireAuthRedirect();
    apiFetch('/api/stock')
      .then((rows) => {
        stockTable.innerHTML = rows.map((row) => `
          <tr>
            <td>${row.product?.name || ''}</td>
            <td>${row.godownName}</td>
            <td>${row.rackNumber || ''}</td>
            <td>${row.quantity}</td>
            <td>${row.damageQuantity}</td>
            <td>${row.reservedQuantity}</td>
          </tr>
        `).join('') || '<tr><td colspan="6">No stock records found</td></tr>';
      })
      .catch((error) => {
        stockTable.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
      });
  }
});
