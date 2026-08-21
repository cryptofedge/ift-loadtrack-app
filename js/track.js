import { supabase } from './supabaseClient.js';
import { stageLabel, renderStatusTrack } from './stages.js';

const input = document.getElementById('code-input');
const errorEl = document.getElementById('track-error');
const resultSlot = document.getElementById('result-slot');
const trackBtn = document.getElementById('track-btn');

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function track(code) {
  errorEl.textContent = '';
  resultSlot.innerHTML = `<div class="loading">Looking up shipment…</div>`;
  trackBtn.textContent = 'TRACK SHIPMENT';

  const { data, error } = await supabase.rpc('get_public_tracking', { p_code: code.trim().toLowerCase() });

  if (error || !data || data.length === 0) {
    resultSlot.innerHTML = '';
    errorEl.textContent = "We couldn't find a shipment with that tracking code.";
    return;
  }

  const t = data[0];
  const hasLive = t.lat != null && t.lng != null;
  const hasDest = t.dropoff_lat != null && t.dropoff_lng != null;
  const distance = hasLive && hasDest ? haversineMiles(t.lat, t.lng, t.dropoff_lat, t.dropoff_lng) : null;

  resultSlot.innerHTML = `
    <div class="card">
      ${renderStatusTrack(t.status)}
    </div>
    <div class="card">
      <div class="route-diagram">
        <div class="route-point">
          <div class="route-dot"></div>
          <div>
            <div class="route-label">From</div>
            <div class="route-name">${t.pickup_name}</div>
          </div>
        </div>
        <div class="route-line" style="margin-left:6px;"></div>
        <div class="route-point">
          <div class="route-dot"></div>
          <div>
            <div class="route-label">To</div>
            <div class="route-name">${t.dropoff_name}</div>
          </div>
        </div>
      </div>
      ${t.deadline ? `
      <div class="deadline-block">
        <div class="lbl">Expected By</div>
        <div class="val">${new Date(t.deadline).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>` : ''}
    </div>
    ${hasLive ? `
    <div class="card">
      <div class="section-title" style="margin-top:0;">Live Location</div>
      ${distance != null ? `
      <div class="deadline-block" style="margin-bottom:14px;">
        <div class="lbl">Approx. Distance Remaining</div>
        <div class="val">${distance.toFixed(0)} miles (straight-line)</div>
      </div>` : ''}
      <div class="btn-row" style="margin-top:0;">
        <a class="btn btn-outline" href="https://www.google.com/maps?q=${t.lat},${t.lng}" target="_blank" rel="noopener">VIEW ON MAP</a>
      </div>
      <div class="hint-text" style="text-align:center;">Last updated ${new Date(t.location_updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
    </div>
    ` : `<div class="empty-hint">Live location not available yet for this shipment.</div>`}
  `;
}

trackBtn.addEventListener('click', () => {
  const code = input.value.trim();
  if (!code) { errorEl.textContent = 'Enter a tracking code.'; return; }
  track(code);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') trackBtn.click();
});

const params = new URLSearchParams(window.location.search);
const prefill = params.get('code');
if (prefill) {
  input.value = prefill;
  track(prefill);
}
