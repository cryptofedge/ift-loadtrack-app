import { supabase, showConfigWarning } from './supabaseClient.js';

showConfigWarning();

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const toSignup = document.getElementById('toggle-to-signup');
const toLogin = document.getElementById('toggle-to-login');

toSignup.querySelector('a').addEventListener('click', () => {
  loginForm.style.display = 'none';
  signupForm.style.display = 'block';
  toSignup.style.display = 'none';
  toLogin.style.display = 'inline';
});

toLogin.querySelector('a').addEventListener('click', () => {
  signupForm.style.display = 'none';
  loginForm.style.display = 'block';
  toLogin.style.display = 'none';
  toSignup.style.display = 'inline';
});

// If already signed in, skip straight to dashboard
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'dashboard.html';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  window.location.href = 'dashboard.html';
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const full_name = document.getElementById('signup-name').value.trim();
  const truck_id = document.getElementById('signup-truck').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = '';

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name, truck_id } }
  });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  window.location.href = 'dashboard.html';
});
