import { supabase, requireSession, getProfile, showConfigWarning } from './supabaseClient.js';
import { stageLabel } from './stages.js';

showConfigWarning();

const session = await requireSession();
if (session) {
  const user = session.user;
  const profile = await getProfile(user.id);
  document.getElementById('who').textContent = profile.full_name || user.email;

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });

  if (profile.role !== 'dispatcher') {
    document.getElementById('gate').innerHTML = `<div class="card">Dispatcher access required. Ask an IFT admin to grant your account dispatcher access.</div>`;
  } else {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('dispatch-ui').style.display = 'block';
    await populateDrivers();
    await loadRecent();
    wireForm();
  }
}

async function populateDrivers() {
  const sel = document.getElementById('driver');
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'driver').order('full_name');
  const openOption = `<option value="">— Open Load (any driver can claim) —</option>`;
  if (error || !data || data.length === 0) {
    sel.innerHTML = openOption;
    return;
  }
  sel.innerHTML = openOption + data.map(d => `<option value="${d.id}">${d.full_name || 'Unnamed'} ${d.truck_id ? '(' + d.truck_id + ')' : ''}</option>`).join('');
}

function wireForm() {
  document.getElementById('load-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('form-error');
    errorEl.textContent = '';

    const deadlineVal = document.getElementById('deadline').value;

    const dropoffLat = document.getElementById('dropoff_lat').value.trim();
    const dropoffLng = document.getElementById('dropoff_lng').value.trim();

    const payload = {
      driver_id: document.getElementById('driver').value || null,
      pickup_name: document.getElementById('pickup_name').value.trim(),
      pickup_address: document.getElementById('pickup_address').value.trim(),
      pickup_window: document.getElementById('pickup_window').value.trim() || null,
      dropoff_name: document.getElementById('dropoff_name').value.trim(),
      dropoff_address: document.getElementById('dropoff_address').value.trim(),
      dropoff_lat: dropoffLat ? Number(dropoffLat) : null,
      dropoff_lng: dropoffLng ? Number(dropoffLng) : null,
      deadline: deadlineVal ? new Date(deadlineVal).toISOString() : null,
      weight_lbs: document.getElementById('weight_lbs').value || null,
      commodity: document.getElementById('commodity').value.trim() || null,
      hazmat: document.getElementById('hazmat').checked,
      temp_controlled: document.getElementById('temp_controlled').checked,
    };

    const { error } = await supabase.from('loads').insert(payload);
    if (error) { errorEl.textContent = error.message; return; }

    document.getElementById('load-form').reset();
    await loadRecent();
  });
}

let recentLoadsCache = [];
let allDriversCache = [];

async function loadRecent() {
  const slot = document.getElementById('recent-loads');
  const { data, error } = await supabase
    .from('loads')
    .select('*, profiles:driver_id(full_name, truck_id)')
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) { slot.innerHTML = `<div class="card">Error loading recent loads.</div>`; return; }
  if (!data || data.length === 0) { slot.innerHTML = `<div class="card">No loads dispatched yet.</div>`; return; }

  recentLoadsCache = data;
  const { data: drivers } = await supabase.from('profiles').select('*').eq('role', 'driver').order('full_name');
  allDriversCache = drivers || [];

  const driverIds = [...new Set(data.filter(l => l.driver_id).map(l => l.driver_id))];
  const { data: locations } = driverIds.length
    ? await supabase.from('driver_locations').select('*').in('driver_id', driverIds)
    : { data: [] };
  const locationByDriver = Object.fromEntries((locations || []).map(l => [l.driver_id, l]));

  slot.innerHTML = data.map(load => {
    const loc = locationByDriver[load.driver_id];
    const isActive = load.accepted_at && !['delivered', 'closed'].includes(load.status);
    const trackUrl = `${window.location.origin}${window.location.pathname.replace('dispatch.html', '')}track.html?code=${load.tracking_code}`;
    return `
    <div class="load-item">
      <div class="route">${load.pickup_name} &rarr; ${load.dropoff_name}</div>
      <div class="meta">
        <span>${load.profiles?.full_name || 'Unassigned (open load)'}</span>
        <span class="pill-badge">${stageLabel(load.status)}${!load.accepted_at ? ' (pending)' : ''}</span>
      </div>
      ${isActive && loc ? `
      <div class="meta" style="margin-top:6px;">
        <a href="https://www.google.com/maps?q=${loc.lat},${loc.lng}" target="_blank" rel="noopener" style="color:var(--gold-bright);">View live location</a>
        <span>Updated ${new Date(loc.updated_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
      </div>` : ''}
      <div class="meta" style="margin-top:6px; gap:14px;">
        <button type="button" class="copy-track-btn" data-url="${trackUrl}" style="background:none;border:none;color:var(--gold-bright);font-size:13px;cursor:pointer;padding:0;">Copy tracking link</button>
        <button type="button" class="edit-load-btn" data-id="${load.id}" style="background:none;border:none;color:var(--gold-bright);font-size:13px;cursor:pointer;padding:0;">Edit</button>
      </div>
    </div>
  `;
  }).join('');

  slot.querySelectorAll('.copy-track-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.url);
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });

  slot.querySelectorAll('.edit-load-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const load = recentLoadsCache.find(l => l.id === btn.dataset.id);
      if (load) openEditModal(load);
    });
  });
}

function openEditModal(load) {
  const driverOptions = `<option value="">— Open Load —</option>` + allDriversCache
    .map(d => `<option value="${d.id}" ${d.id === load.driver_id ? 'selected' : ''}>${d.full_name || 'Unnamed'} ${d.truck_id ? '(' + d.truck_id + ')' : ''}</option>`)
    .join('');

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="hos-backdrop" id="edit-backdrop"></div>
    <div class="hos-sheet" id="edit-sheet" style="max-height:85vh; overflow-y:auto;">
      <div class="hos-sheet-handle"></div>
      <div class="hos-sheet-title">Edit Load</div>

      <label for="edit-driver">Assign to Driver</label>
      <select id="edit-driver">${driverOptions}</select>

      <label for="edit-pickup_name">Pickup Facility</label>
      <input id="edit-pickup_name" value="${load.pickup_name}">
      <label for="edit-dropoff_name">Drop-off Facility</label>
      <input id="edit-dropoff_name" value="${load.dropoff_name}">
      <label for="edit-weight_lbs">Weight (lbs)</label>
      <input id="edit-weight_lbs" type="number" value="${load.weight_lbs || ''}">
      <label for="edit-commodity">Commodity</label>
      <input id="edit-commodity" value="${load.commodity || ''}">

      <div class="btn-row">
        <button id="save-edit-btn" class="btn btn-primary btn-lg">SAVE CHANGES</button>
        ${load.status !== 'closed' ? `<button id="cancel-load-btn" class="btn btn-danger">CANCEL LOAD</button>` : ''}
        <button id="close-edit-btn" class="btn btn-outline">CLOSE</button>
      </div>
      <div class="error-text" id="edit-error"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  document.getElementById('edit-backdrop').addEventListener('click', close);
  document.getElementById('close-edit-btn').addEventListener('click', close);

  document.getElementById('save-edit-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('edit-error');
    const { error } = await supabase.from('loads').update({
      driver_id: document.getElementById('edit-driver').value || null,
      pickup_name: document.getElementById('edit-pickup_name').value.trim(),
      dropoff_name: document.getElementById('edit-dropoff_name').value.trim(),
      weight_lbs: document.getElementById('edit-weight_lbs').value || null,
      commodity: document.getElementById('edit-commodity').value.trim() || null,
    }).eq('id', load.id);

    if (error) { errorEl.textContent = error.message; return; }
    close();
    await loadRecent();
  });

  const cancelBtn = document.getElementById('cancel-load-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('Cancel this load? This will close it out permanently.')) return;
      await supabase.from('loads').update({ status: 'closed' }).eq('id', load.id);
      close();
      await loadRecent();
    });
  }
}
