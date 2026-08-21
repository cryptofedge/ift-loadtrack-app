import { supabase, requireSession, getProfile, showConfigWarning } from './supabaseClient.js';

showConfigWarning();

const LIMITS = { steer: 12000, drive: 34000, trailer: 34000, gross: 80000 };

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
}

document.getElementById('calc-btn').addEventListener('click', () => {
  const steer = Number(document.getElementById('steer').value) || 0;
  const drive = Number(document.getElementById('drive').value) || 0;
  const trailer = Number(document.getElementById('trailer').value) || 0;
  const gross = steer + drive + trailer;

  const rows = [
    { label: 'Steer Axle', val: steer, limit: LIMITS.steer },
    { label: 'Drive Tandem', val: drive, limit: LIMITS.drive },
    { label: 'Trailer Tandem', val: trailer, limit: LIMITS.trailer },
  ];

  const overLimit = rows.some(r => r.val > r.limit) || gross > LIMITS.gross;

  const rowsHtml = rows.map(r => {
    const over = r.val > r.limit;
    return `
      <div class="cargo-item" style="margin-bottom:10px;">
        <div class="lbl">${r.label}</div>
        <div class="val" style="${over ? 'color:var(--red);' : 'color:var(--green);'}">
          ${r.val.toLocaleString()} / ${r.limit.toLocaleString()} lbs ${over ? '— OVER' : '— OK'}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('result-slot').innerHTML = `
    <div class="card" style="border-left-color:${overLimit ? 'var(--red)' : 'var(--green)'};">
      <div class="section-title" style="margin-top:0;">Result</div>
      <div class="deadline-block" style="margin:6px 0 18px;">
        <div class="lbl">Gross Vehicle Weight</div>
        <div class="val" style="${gross > LIMITS.gross ? 'color:var(--red);' : ''}">${gross.toLocaleString()} / ${LIMITS.gross.toLocaleString()} lbs</div>
      </div>
      ${rowsHtml}
      <div class="hint-text" style="margin-top:8px; text-align:center; font-weight:700; color:${overLimit ? 'var(--red)' : 'var(--green)'};">
        ${overLimit ? 'One or more axle groups exceed the standard limit.' : 'All axle groups within standard limits.'}
      </div>
    </div>
  `;
});
