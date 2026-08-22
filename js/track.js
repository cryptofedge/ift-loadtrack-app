import { supabase } from './supabaseClient.js';
import { stageLabel, renderStatusTrack } from './stages.js';

const input = document.getElementById('code-input');
const errorEl = document.getElementById('track-error');
const trackBtn = document.getElementById('track-btn');
const searchPanel = document.getElementById('search-panel');
const mapView = document.getElementById('map-view');

let map, truckMarker, destMarker, routeLine;

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

function relativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

function truckIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="truck-pin">&#128666;</div>',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function destIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="dest-pin"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function initMap(centerLat, centerLng) {
  if (map) { map.remove(); }
  map = L.map('map', { zoomControl: true }).setView([centerLat, centerLng], 8);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  }).addTo(map);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    opacity: 0.95,
  }).addTo(map);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    opacity: 0.9,
  }).addTo(map);
}

async function track(code) {
  errorEl.textContent = '';
  trackBtn.textContent = 'LOOKING UP...';

  const { data, error } = await supabase.rpc('get_public_tracking', { p_code: code.trim().toLowerCase() });

  trackBtn.textContent = 'TRACK SHIPMENT';

  if (error || !data || data.length === 0) {
    errorEl.textContent = "We couldn't find a shipment with that tracking code.";
    return;
  }

  const t = data[0];
  const hasLive = t.lat != null && t.lng != null;
  const hasDest = t.dropoff_lat != null && t.dropoff_lng != null;

  searchPanel.style.display = 'none';
  mapView.style.display = 'block';

  document.getElementById('sheet-title').textContent = `${t.pickup_name} → ${t.dropoff_name}`;
  document.getElementById('sheet-sub').textContent = stageLabel(t.status).toUpperCase();

  const driverSection = document.getElementById('driver-section');
  if (t.driver_name) {
    driverSection.style.display = 'block';
    document.getElementById('driver-name').textContent = t.driver_name;
    document.getElementById('driver-truck').textContent = t.driver_truck_id ? `Truck ${t.driver_truck_id}` : '';
    const contactRow = document.getElementById('driver-contact-row');
    if (t.driver_phone) {
      contactRow.style.display = 'flex';
      document.getElementById('call-driver-btn').href = `tel:${t.driver_phone}`;
      document.getElementById('text-driver-btn').href = `sms:${t.driver_phone}`;
    } else {
      contactRow.style.display = 'none';
    }
  } else {
    driverSection.style.display = 'none';
  }

  const distance = hasLive && hasDest ? haversineMiles(t.lat, t.lng, t.dropoff_lat, t.dropoff_lng) : null;
  document.getElementById('sheet-distance').textContent = distance != null
    ? `${distance.toFixed(0)} miles remaining`
    : (hasLive ? 'En route' : 'Awaiting live location');
  document.getElementById('sheet-route').textContent = `To ${t.dropoff_name}`;

  if (hasLive) {
    document.getElementById('sheet-updated-badge').innerHTML = '&#9679; LIVE';
    document.getElementById('sheet-updated-time').textContent = `Updated ${relativeTime(t.location_updated_at)}`;
  } else {
    document.getElementById('sheet-updated-badge').innerHTML = '';
    document.getElementById('sheet-updated-time').textContent = 'No live location yet';
  }

  const directionsBtn = document.getElementById('directions-btn');
  if (hasDest) {
    directionsBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${t.dropoff_lat},${t.dropoff_lng}`;
    directionsBtn.style.pointerEvents = '';
    directionsBtn.style.opacity = '';
  } else {
    directionsBtn.href = '#';
    directionsBtn.style.pointerEvents = 'none';
    directionsBtn.style.opacity = '0.5';
  }

  document.getElementById('trip-history-body').innerHTML = `<div class="card" style="margin-top:8px;">${renderStatusTrack(t.status)}</div>`;

  const podSection = document.getElementById('pod-section');
  if (['delivered', 'closed'].includes(t.status)) {
    podSection.style.display = 'block';
    loadDocuments(code);
  } else {
    podSection.style.display = 'none';
  }

  const centerLat = hasLive ? t.lat : (hasDest ? t.dropoff_lat : 39.8283);
  const centerLng = hasLive ? t.lng : (hasDest ? t.dropoff_lng : -98.5795);
  initMap(centerLat, centerLng);

  const bounds = [];
  if (hasLive) {
    truckMarker = L.marker([t.lat, t.lng], { icon: truckIcon() }).addTo(map);
    bounds.push([t.lat, t.lng]);
  }
  if (hasDest) {
    destMarker = L.marker([t.dropoff_lat, t.dropoff_lng], { icon: destIcon() }).addTo(map);
    bounds.push([t.dropoff_lat, t.dropoff_lng]);
  }
  if (hasLive && hasDest) {
    routeLine = L.polyline([[t.lat, t.lng], [t.dropoff_lat, t.dropoff_lng]], {
      color: '#C19A6B', weight: 3, dashArray: '6, 8',
    }).addTo(map);
  }
  if (bounds.length === 2) {
    map.fitBounds(bounds, { padding: [40, 40] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 10);
  }
  setTimeout(() => map.invalidateSize(), 200);
}

async function loadDocuments(code) {
  const body = document.getElementById('pod-body');
  body.textContent = 'Loading documents…';

  const { data, error } = await supabase.functions.invoke('public-documents', { body: { code } });

  if (error || !data || !data.documents || data.documents.length === 0) {
    body.textContent = 'No documents available yet.';
    return;
  }

  const labels = { bol: 'Bill of Lading', signature: 'Signed Proof of Delivery' };
  body.innerHTML = data.documents.map((d) => `
    <a href="${d.url}" target="_blank" rel="noopener" class="btn btn-outline" style="margin-bottom:10px;">
      &#128196; DOWNLOAD ${(labels[d.type] || d.type).toUpperCase()}
    </a>
  `).join('');
}

trackBtn.addEventListener('click', () => {
  const code = input.value.trim();
  if (!code) { errorEl.textContent = 'Enter a tracking code.'; return; }
  track(code);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') trackBtn.click();
});

document.getElementById('sheet-close').addEventListener('click', () => {
  mapView.style.display = 'none';
  searchPanel.style.display = 'block';
  input.value = '';
  errorEl.textContent = '';
});

document.getElementById('trip-toggle').addEventListener('click', () => {
  const body = document.getElementById('trip-history-body');
  const caret = document.getElementById('trip-caret');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  caret.innerHTML = isOpen ? '&#8250;' : '&#8964;';
});

const params = new URLSearchParams(window.location.search);
const prefill = params.get('code');
if (prefill) {
  input.value = prefill;
  track(prefill);
}
