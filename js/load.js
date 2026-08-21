import { supabase, requireSession, getProfile, showConfigWarning } from './supabaseClient.js';
import { renderStatusTrack } from './stages.js';
import { startTracking } from './tracker.js';

showConfigWarning();

const params = new URLSearchParams(window.location.search);
const loadId = params.get('id');
const content = document.getElementById('content');

if (!loadId) {
  content.innerHTML = `<div class="card">No load specified.</div>`;
} else {
  const session = await requireSession();
  if (session) {
    const user = session.user;
    const profile = await getProfile(user.id);
    document.getElementById('who').textContent = `${profile.full_name || user.email}`;
    await render(user, profile);
    startTracking(user.id);
  }
}

async function fetchLoad() {
  const { data, error } = await supabase.from('loads').select('*').eq('id', loadId).single();
  if (error) throw error;
  return data;
}

async function fetchDocuments() {
  const { data } = await supabase.from('documents').select('*').eq('load_id', loadId).order('uploaded_at');
  return data || [];
}

const EVENT_LABELS = {
  accepted: 'Load Accepted',
  arrived_pickup: 'Arrived at Pickup',
  departed_pickup: 'Departed Pickup (Loaded)',
  arrived_dropoff: 'Arrived at Drop-off',
  delivered: 'Delivered — POD Captured',
  closed: 'Load Closed',
};

async function fetchEvents() {
  const { data } = await supabase.from('load_events').select('*').eq('load_id', loadId).order('occurred_at');
  return data || [];
}

function renderTimeline(events) {
  if (!events || events.length === 0) return '';
  const rows = events.map(e => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div>
        <div class="timeline-label">${EVENT_LABELS[e.event_type] || e.event_type}</div>
        <div class="timeline-time">${new Date(e.occurred_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>
    </div>
  `).join('');
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Activity History</div>
      <div class="timeline">${rows}</div>
    </div>
  `;
}

async function logEvent(eventType) {
  await supabase.from('load_events').insert({ load_id: loadId, event_type: eventType });
}

async function render(user, profile) {
  let load;
  try {
    load = await fetchLoad();
  } catch (e) {
    content.innerHTML = `<div class="card">Load not found or you don't have access.</div>`;
    return;
  }

  const docs = await fetchDocuments();
  const bolDocs = docs.filter(d => d.doc_type === 'bol');
  const isDispatcher = profile.role === 'dispatcher';

  const routeBlock = `
    <div class="route-diagram">
      <div class="route-point">
        <div class="route-dot"></div>
        <div>
          <div class="route-label">Pickup</div>
          <div class="route-name">${load.pickup_name}</div>
          <div class="route-addr">${load.pickup_address}</div>
          ${load.pickup_window ? `<div class="route-addr">${load.pickup_window}</div>` : ''}
        </div>
      </div>
      <div class="route-line" style="margin-left:6px;"></div>
      <div class="route-point">
        <div class="route-dot"></div>
        <div>
          <div class="route-label">Drop-off</div>
          <div class="route-name">${load.dropoff_name}</div>
          <div class="route-addr">${load.dropoff_address}</div>
        </div>
      </div>
    </div>
    <div class="cargo-grid">
      <div class="cargo-item"><div class="lbl">Weight</div><div class="val">${load.weight_lbs ? load.weight_lbs.toLocaleString() + ' lbs' : '—'}</div></div>
      <div class="cargo-item"><div class="lbl">Commodity</div><div class="val">${load.commodity || '—'}</div></div>
      ${load.temp_controlled ? `<div class="cargo-item"><div class="lbl">Temp Controlled</div><div class="val">Yes</div></div>` : ''}
      ${load.hazmat ? `<div class="cargo-item"><div class="lbl">Hazmat</div><div class="val" style="color:var(--red);">Yes</div></div>` : ''}
    </div>
    ${load.deadline ? `
    <div class="deadline-block">
      <div class="lbl">Must Deliver By</div>
      <div class="val">${new Date(load.deadline).toLocaleString([], {dateStyle:'medium', timeStyle:'short'})}</div>
    </div>` : ''}
  `;

  // Open load on the board: any driver can claim it
  if (!load.driver_id) {
    content.innerHTML = `
      <div class="card">
        <div class="section-title" style="margin-top:0;">Open Load — Available to Claim</div>
        ${routeBlock}
        <div class="btn-row">
          <button id="claim-btn" class="btn btn-primary btn-lg">CLAIM THIS LOAD</button>
        </div>
      </div>
    `;
    document.getElementById('claim-btn').addEventListener('click', async () => {
      const { error } = await supabase.from('loads').update({ driver_id: user.id, accepted_at: new Date().toISOString() }).eq('id', loadId);
      if (error) { alert('Could not claim load: ' + error.message); return; }
      await logEvent('accepted');
      render(user, profile);
    });
    return;
  }

  // Assigned but not yet accepted -> Accept / Decline (driver only)
  if (!load.accepted_at) {
    if (load.driver_id !== user.id) {
      content.innerHTML = `<div class="card">This load is assigned to another driver.</div>`;
      return;
    }
    content.innerHTML = `
      <div class="card">
        <div class="section-title" style="margin-top:0;">New Load Assignment</div>
        ${routeBlock}
        <div class="btn-row">
          <button id="accept-btn" class="btn btn-primary btn-lg">ACCEPT LOAD</button>
          <button id="decline-btn" class="btn btn-outline">DECLINE / REASSIGN</button>
        </div>
      </div>
    `;
    document.getElementById('accept-btn').addEventListener('click', async () => {
      await supabase.from('loads').update({ accepted_at: new Date().toISOString() }).eq('id', loadId);
      await logEvent('accepted');
      render(user, profile);
    });
    document.getElementById('decline-btn').addEventListener('click', async () => {
      if (!confirm('Decline this load? It will go back to dispatch for reassignment.')) return;
      await supabase.from('loads').update({ driver_id: null, accepted_at: null }).eq('id', loadId);
      window.location.href = 'dashboard.html';
    });
    return;
  }

  // Accepted: show status track + route + stage-specific action panel
  let actionPanel = '';

  if (load.status === 'dispatched') {
    actionPanel = `
      <div class="arrival-zone">
        <button id="arrive-pickup-btn" class="btn btn-primary btn-lg">CONFIRM ARRIVAL</button>
        <div class="hint-text">Time will be recorded automatically</div>
      </div>
    `;
  } else if (load.status === 'at_pickup') {
    actionPanel = `
      <div class="section-title">Capture Bill of Lading</div>
      <input type="file" id="bol-input" accept="image/*" capture="environment" style="display:none;">
      <button id="bol-btn" class="btn btn-outline">CAPTURE BOL / DOCUMENTS</button>
      <div class="doc-thumb-row" id="bol-thumbs"></div>
      <div class="btn-row">
        <button id="depart-btn" class="btn btn-primary btn-lg" ${bolDocs.length === 0 ? 'disabled' : ''}>LOADED &amp; DEPART</button>
      </div>
      ${bolDocs.length === 0 ? `<div class="hint-text">Capture at least one BOL photo to continue.</div>` : ''}
    `;
  } else if (load.status === 'loaded_en_route') {
    actionPanel = `
      <div class="arrival-zone">
        <button id="arrive-dropoff-btn" class="btn btn-primary btn-lg">CONFIRM ARRIVAL</button>
        <div class="hint-text">Time will be recorded automatically</div>
      </div>
    `;
  } else if (load.status === 'at_dropoff') {
    actionPanel = `
      <div class="section-title">Signature Capture</div>
      <canvas id="sigpad" class="sigpad"></canvas>
      <div class="btn-row">
        <button id="clear-sig-btn" class="btn btn-outline">CLEAR</button>
        <button id="confirm-delivery-btn" class="btn btn-primary btn-lg">CONFIRM DELIVERY</button>
      </div>
    `;
  } else if (load.status === 'delivered') {
    actionPanel = `
      <div class="card" style="border-left-color:var(--green);">Delivered. Proof of delivery captured.</div>
      ${isDispatcher || load.driver_id === user.id ? `<button id="close-btn" class="btn btn-outline">CLOSE LOAD</button>` : ''}
    `;
  } else if (load.status === 'closed') {
    actionPanel = `<div class="card" style="border-left-color:var(--steel);">This load is closed.</div>`;
  }

  const events = await fetchEvents();

  content.innerHTML = `
    <div class="card">
      ${renderStatusTrack(load.status)}
    </div>
    <div class="card">
      ${routeBlock}
    </div>
    ${actionPanel}
    ${renderTimeline(events)}
  `;

  wireActions(load, docs, user);
}

function wireActions(load, docs, user) {
  const arrivePickupBtn = document.getElementById('arrive-pickup-btn');
  if (arrivePickupBtn) {
    arrivePickupBtn.addEventListener('click', async () => {
      await supabase.from('loads').update({ status: 'at_pickup' }).eq('id', loadId);
      await logEvent('arrived_pickup');
      location.reload();
    });
  }

  const bolBtn = document.getElementById('bol-btn');
  const bolInput = document.getElementById('bol-input');
  if (bolBtn && bolInput) {
    bolBtn.addEventListener('click', () => bolInput.click());
    bolInput.addEventListener('change', async () => {
      const file = bolInput.files[0];
      if (!file) return;
      bolBtn.textContent = 'UPLOADING…';
      const path = `${loadId}/bol-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) { alert('Upload failed: ' + error.message); bolBtn.textContent = 'CAPTURE BOL / DOCUMENTS'; return; }
      await supabase.from('documents').insert({ load_id: loadId, doc_type: 'bol', file_path: path });
      location.reload();
    });
  }

  renderBolThumbs(docs);

  const departBtn = document.getElementById('depart-btn');
  if (departBtn) {
    departBtn.addEventListener('click', async () => {
      await supabase.from('loads').update({ status: 'loaded_en_route' }).eq('id', loadId);
      await logEvent('departed_pickup');
      location.reload();
    });
  }

  const arriveDropoffBtn = document.getElementById('arrive-dropoff-btn');
  if (arriveDropoffBtn) {
    arriveDropoffBtn.addEventListener('click', async () => {
      await supabase.from('loads').update({ status: 'at_dropoff' }).eq('id', loadId);
      await logEvent('arrived_dropoff');
      location.reload();
    });
  }

  const sigpad = document.getElementById('sigpad');
  if (sigpad) setupSignaturePad(sigpad);

  const clearSigBtn = document.getElementById('clear-sig-btn');
  if (clearSigBtn && sigpad) {
    clearSigBtn.addEventListener('click', () => {
      const ctx = sigpad.getContext('2d');
      ctx.clearRect(0, 0, sigpad.width, sigpad.height);
    });
  }

  const confirmDeliveryBtn = document.getElementById('confirm-delivery-btn');
  if (confirmDeliveryBtn && sigpad) {
    confirmDeliveryBtn.addEventListener('click', async () => {
      confirmDeliveryBtn.textContent = 'SAVING…';
      const blob = await new Promise(resolve => sigpad.toBlob(resolve, 'image/png'));
      const path = `${loadId}/signature-${Date.now()}.png`;
      const { error } = await supabase.storage.from('documents').upload(path, blob);
      if (error) { alert('Signature upload failed: ' + error.message); confirmDeliveryBtn.textContent = 'CONFIRM DELIVERY'; return; }
      await supabase.from('documents').insert({ load_id: loadId, doc_type: 'signature', file_path: path });
      await supabase.from('loads').update({ status: 'delivered' }).eq('id', loadId);
      await logEvent('delivered');
      location.reload();
    });
  }

  const closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      await supabase.from('loads').update({ status: 'closed' }).eq('id', loadId);
      await logEvent('closed');
      location.reload();
    });
  }
}

function renderBolThumbs(docs) {
  const row = document.getElementById('bol-thumbs');
  if (!row) return;
  const bolDocs = docs.filter(d => d.doc_type === 'bol');
  if (bolDocs.length === 0) return;
  Promise.all(bolDocs.map(async d => {
    const { data } = await supabase.storage.from('documents').createSignedUrl(d.file_path, 3600);
    return data?.signedUrl;
  })).then(urls => {
    row.innerHTML = urls.filter(Boolean).map(u => `<img class="doc-thumb" src="${u}">`).join('');
  });
}

function setupSignaturePad(canvas) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = '#E8C88A';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  let drawing = false;

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}
