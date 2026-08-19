document.addEventListener('DOMContentLoaded', () => {
  // ---- Password visibility toggles ----
  SC.qsa('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-for'));
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  function setError(fieldId, hasError){
    const el = document.getElementById(fieldId);
    if (el) el.classList.toggle('has-error', hasError);
  }

  function isEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  // ---- Login form ----
  const loginForm = document.getElementById('loginForm');
  if (loginForm){
    const forgot = document.getElementById('forgotLink');
    forgot?.addEventListener('click', (e) => {
      e.preventDefault();
      SC.toast('Password reset link sent — check your inbox.', 'success');
    });

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email');
      const password = document.getElementById('password');
      let valid = true;

      if (!isEmail(email.value)){ setError('fEmail', true); valid = false; } else setError('fEmail', false);
      if (!password.value){ setError('fPassword', true); valid = false; } else setError('fPassword', false);
      if (!valid) return;

      const btn = document.getElementById('loginSubmit');
      SC.setLoading(btn, true);
      SCStore.api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.value.trim(), password: password.value }) })
        .then(({ user }) => { SCStore.setUser(user); window.location.href = '/dashboard.html'; })
        .catch(error => { SC.toast(error.message, 'error'); SC.setLoading(btn, false); });
    });
  }

  // ---- Register form ----
  const registerForm = document.getElementById('registerForm');
  if (registerForm){
    const password = document.getElementById('password');
    const meter = SC.qsa('#strengthMeter span');
    const hint = document.getElementById('strengthHint');

    password?.addEventListener('input', () => {
      const v = password.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      const colors = ['var(--red-500)','var(--amber-500)','var(--star-600)','var(--star-400)'];
      const labels = ['Weak password','Fair password','Good password','Strong password'];
      meter.forEach((s, i) => { s.style.background = i < score ? colors[Math.max(score-1,0)] : 'var(--border-2)'; });
      hint.textContent = v ? labels[Math.max(score-1,0)] : 'Use 8+ characters with a number and a symbol.';
    });

    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('fullName');
      const email = document.getElementById('email');
      const confirm = document.getElementById('confirmPassword');
      const terms = document.getElementById('terms');
      let valid = true;

      if (!name.value.trim()){ setError('fName', true); valid = false; } else setError('fName', false);
      if (!isEmail(email.value)){ setError('fEmail', true); valid = false; } else setError('fEmail', false);
      if (password.value.length < 8){ setError('fPassword', true); valid = false; } else setError('fPassword', false);
      if (confirm.value !== password.value || !confirm.value){ setError('fConfirm', true); valid = false; } else setError('fConfirm', false);

      if (!terms.checked){
        SC.toast('Please accept the Terms of Service to continue.', 'error');
        valid = false;
      }
      if (!valid) return;

      const btn = document.getElementById('registerSubmit');
      SC.setLoading(btn, true);
      SCStore.api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: name.value.trim(), email: email.value.trim(), password: password.value }) })
        .then(({ user }) => { SCStore.setUser(user); window.location.href = '/dashboard.html'; })
        .catch(error => { SC.toast(error.message, 'error'); SC.setLoading(btn, false); });
    });
  }
});
