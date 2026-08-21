import { supabase } from './supabaseClient.js';

const UPDATE_INTERVAL_MS = 2 * 60 * 1000;

async function hasActiveLoad(userId) {
  const { data } = await supabase
    .from('loads')
    .select('id')
    .eq('driver_id', userId)
    .not('status', 'in', '(closed,delivered)')
    .not('accepted_at', 'is', null)
    .limit(1);
  return data && data.length > 0;
}

async function pushLocation(userId, coords) {
  await supabase.from('driver_locations').upsert({
    driver_id: userId,
    lat: coords.latitude,
    lng: coords.longitude,
    updated_at: new Date().toISOString(),
  });
}

async function tick(userId) {
  if (!navigator.geolocation) return;
  const active = await hasActiveLoad(userId);
  if (!active) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => pushLocation(userId, pos.coords),
    () => { /* permission denied or unavailable - stay silent, non-critical feature */ },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

export async function startTracking(userId) {
  await tick(userId);
  setInterval(() => tick(userId), UPDATE_INTERVAL_MS);
}
