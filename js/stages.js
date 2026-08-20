export const STAGES = [
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'at_pickup', label: 'At Pickup' },
  { key: 'loaded_en_route', label: 'Loaded & En Route' },
  { key: 'at_dropoff', label: 'At Drop-off' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'closed', label: 'Load Closed' },
];

export function stageIndex(status) {
  return STAGES.findIndex(s => s.key === status);
}

export function renderStatusTrack(status) {
  const idx = stageIndex(status);
  return `<div class="status-track">${STAGES.map((s, i) => {
    const cls = i < idx ? 'done' : i === idx ? 'active' : '';
    return `<span class="status-pill ${cls}">${i + 1}. ${s.label}</span>`;
  }).join('')}</div>`;
}

export function stageLabel(status) {
  const s = STAGES.find(s => s.key === status);
  return s ? s.label : status;
}
