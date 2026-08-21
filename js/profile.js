import { supabase, requireSession, getProfile, showConfigWarning } from './supabaseClient.js';

showConfigWarning();

const session = await requireSession();
if (session) {
  const user = session.user;
  const profile = await getProfile(user.id);

  document.getElementById('who').textContent = profile.full_name || user.email;
  if (profile.role === 'dispatcher') document.getElementById('dispatch-tab').style.display = 'flex';

  document.getElementById('full_name').value = profile.full_name || '';
  document.getElementById('truck_id').value = profile.truck_id || '';
  document.getElementById('email').value = user.email;
  document.getElementById('role').value = profile.role === 'dispatcher' ? 'Dispatcher' : 'Driver';

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });

  document.getElementById('save-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('save-status');
    statusEl.style.color = '';
    statusEl.textContent = '';

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: document.getElementById('full_name').value.trim() || null,
        truck_id: document.getElementById('truck_id').value.trim() || null,
      })
      .eq('id', user.id);

    if (error) {
      statusEl.textContent = error.message;
      return;
    }
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = 'Saved.';
    document.getElementById('who').textContent = document.getElementById('full_name').value.trim() || user.email;
  });
}
