import { supabase, requireSession, getProfile, showConfigWarning } from './supabaseClient.js';
import { stageLabel } from './stages.js';

showConfigWarning();

const session = await requireSession();
if (session) {
  const user = session.user;
  const profile = await getProfile(user.id);

  document.getElementById('who').textContent = `${profile.full_name || user.email}${profile.truck_id ? ' · ' + profile.truck_id : ''}`;

  if (profile.role === 'dispatcher') {
    document.getElementById('dispatch-tab').style.display = 'flex';
  }

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });

  await loadHero(user.id);
  await loadHos(user.id);
  await loadUpcoming(user.id);
}

async function loadHero(userId) {
  const slot = document.getElementById('hero-slot');
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('driver_id', userId)
    .not('status', 'eq', 'closed')
    .not('accepted_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) { slot.innerHTML = `<div class="card">Error loading current load.</div>`; return; }

  if (!data || data.length === 0) {
    slot.innerHTML = `<div class="hero-card"><div class="empty">No active load right now.</div></div>`;
    return;
  }

  const load = data[0];
  slot.innerHTML = `
    <a class="hero-card" href="load.html?id=${load.id}">
      <div class="stage">${stageLabel(load.status).toUpperCase()}</div>
      <div class="dest">${load.pickup_name} &rarr; ${load.dropoff_name}</div>
    </a>
  `;
}

async function loadHos(userId) {
  const slot = document.getElementById('hos-slot');
  let { data } = await supabase.from('hos_status').select('*').eq('driver_id', userId).maybeSingle();

  if (!data) {
    const { data: inserted } = await supabase
      .from('hos_status')
      .insert({ driver_id: userId })
      .select()
      .single();
    data = inserted;
  }

  const driveCls = data.drive_minutes_remaining < 30 ? 'hos-crit' : data.drive_minutes_remaining < 120 ? 'hos-warn' : 'hos-ok';
  const shiftCls = data.shift_minutes_remaining < 30 ? 'hos-crit' : data.shift_minutes_remaining < 120 ? 'hos-warn' : 'hos-ok';

  slot.innerHTML = `
    <div class="hos-strip">
      <div class="hos-cell"><div class="num ${driveCls}">${fmtMinutes(data.drive_minutes_remaining)}</div><div class="lbl">Drive Left</div></div>
      <div class="hos-cell"><div class="num ${shiftCls}">${fmtMinutes(data.shift_minutes_remaining)}</div><div class="lbl">Shift Left</div></div>
      <div class="hos-cell"><div class="num hos-ok">${data.break_due_at ? new Date(data.break_due_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</div><div class="lbl">Break Due</div></div>
    </div>
  `;
}

function fmtMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

async function loadUpcoming(userId) {
  const slot = document.getElementById('upcoming-slot');
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('driver_id', userId)
    .is('accepted_at', null)
    .order('created_at', { ascending: true });

  if (error) { slot.innerHTML = `<div class="card">Error loading schedule.</div>`; return; }

  if (!data || data.length === 0) {
    slot.innerHTML = `<div class="card">No pending loads assigned.</div>`;
    return;
  }

  slot.innerHTML = data.map(load => `
    <a class="load-item" href="load.html?id=${load.id}">
      <div class="route">${load.pickup_name} &rarr; ${load.dropoff_name}</div>
      <div class="meta">
        <span>${load.pickup_window || 'Pickup window TBD'}</span>
        <span class="pill-badge">Pending Accept</span>
      </div>
    </a>
  `).join('');
}
