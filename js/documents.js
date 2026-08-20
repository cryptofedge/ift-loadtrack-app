import { supabase, requireSession, getProfile, showConfigWarning } from './supabaseClient.js';

showConfigWarning();

const session = await requireSession();
if (session) {
  const user = session.user;
  const profile = await getProfile(user.id);
  document.getElementById('who').textContent = profile.full_name || user.email;
  if (profile.role === 'dispatcher') document.getElementById('dispatch-tab').style.display = 'flex';

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });

  await loadDocs(user.id, profile);
}

async function loadDocs(userId, profile) {
  const slot = document.getElementById('doc-list');

  let query = supabase.from('loads').select('*, documents(*)').in('status', ['delivered', 'closed']).order('created_at', { ascending: false });
  if (profile.role !== 'dispatcher') query = query.eq('driver_id', userId);

  const { data, error } = await query;
  if (error) { slot.innerHTML = `<div class="card">Error loading documents.</div>`; return; }
  if (!data || data.length === 0) { slot.innerHTML = `<div class="card">No delivered loads yet.</div>`; return; }

  slot.innerHTML = data.map(load => `
    <a class="load-item" href="load.html?id=${load.id}">
      <div class="route">${load.pickup_name} &rarr; ${load.dropoff_name}</div>
      <div class="meta">
        <span>${new Date(load.created_at).toLocaleDateString()}</span>
        <span class="pill-badge">${load.documents?.length || 0} document${load.documents?.length === 1 ? '' : 's'}</span>
      </div>
    </a>
  `).join('');
}
