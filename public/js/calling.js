/* ══ CALLING.JS – Tab 2 ══ */

async function loadCallingStatus() {
  const inp = document.getElementById('calling-week');
  if (!inp.value) {
    const now = new Date(), day = now.getDay();
    const sun = new Date(now); sun.setDate(now.getDate() - day);
    inp.value = sun.toISOString().split('T')[0];
  }
  const week = inp.value;
  document.getElementById('calling-list').innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const devotees = await DB.getCallingStatus(week);
    AppState.callingData = devotees;
    renderCallingStats(devotees);
    renderCallingList(devotees);
  } catch (_) {
    document.getElementById('calling-list').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function renderCallingStats(devotees) {
  const yes = devotees.filter(d => d.coming_status === 'Yes').length;
  const maybe = devotees.filter(d => d.coming_status === 'Maybe').length;
  const no = devotees.filter(d => d.coming_status === 'No').length;
  const shift = devotees.filter(d => d.coming_status === 'Shifted').length;
  const uncalled = devotees.filter(d => !d.coming_status).length;
  document.getElementById('calling-stats').innerHTML = `
    <div class="calling-stat"><i class="fas fa-check" style="color:var(--success)"></i> <strong>${yes}</strong> Coming</div>
    <div class="calling-stat"><i class="fas fa-question" style="color:var(--warning)"></i> <strong>${maybe}</strong> Maybe</div>
    <div class="calling-stat"><i class="fas fa-times" style="color:var(--danger)"></i> <strong>${no}</strong> No</div>
    <div class="calling-stat"><i class="fas fa-user-slash" style="color:var(--text-muted)"></i> <strong>${shift}</strong> Shifted</div>
    <div class="calling-stat"><i class="fas fa-phone-slash" style="color:var(--text-muted)"></i> <strong>${uncalled}</strong> Not Called</div>`;
}

function filterCallingList() {
  const q = document.getElementById('calling-search').value.toLowerCase();
  const s = document.getElementById('calling-filter-status').value;
  renderCallingList(AppState.callingData.filter(d =>
    (!q || d.name.toLowerCase().includes(q) || (d.mobile || '').includes(q)) &&
    (!s || d.coming_status === s || (!d.coming_status && s === ''))
  ));
}

function renderCallingList(devotees) {
  const wrap = document.getElementById('calling-list');
  if (!devotees.length) { wrap.innerHTML = '<div class="empty-state"><i class="fas fa-phone-slash"></i><p>No devotees found</p></div>'; return; }
  wrap.innerHTML = `
    <table class="calling-table">
      <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Team</th><th>Coming?</th><th>Notes</th></tr></thead>
      <tbody>${devotees.map((d, i) => renderCallingRow(d, i + 1)).join('')}</tbody>
    </table>`;
}

function renderCallingRow(d, i) {
  const statuses = ['Yes','No','Maybe','Shifted'];
  const cur = d.coming_status || '';
  const btns = statuses.map(s => `<button class="status-btn ${s.toLowerCase()}${cur === s ? ' active' : ''}" onclick="updateCallingStatus('${d.id}', '${s}', this)">${s}</button>`).join('');
  return `<tr class="${cur === 'Shifted' ? 'status-shifted' : ''}">
    <td style="color:var(--text-muted)">${i}</td>
    <td><div style="display:flex;align-items:center;gap:.4rem">
      <div class="devotee-avatar" style="width:30px;height:30px;font-size:.7rem">${initials(d.name)}</div>
      <span style="font-weight:600">${d.name}</span>
      ${isBirthdayWeek(d.dob) ? '<i class="fas fa-birthday-cake" style="color:var(--gold);font-size:.8rem"></i>' : ''}
    </div></td>
    <td>${contactIcons(d.mobile)}</td>
    <td>${teamBadge(d.team_name)}</td>
    <td><div class="status-btns">${btns}</div></td>
    <td><input class="calling-notes-input" type="text" placeholder="Notes…" value="${d.calling_notes || ''}"
      onchange="updateCallingNotes('${d.id}', this.value)" onclick="event.stopPropagation()"></td>
  </tr>`;
}

async function updateCallingStatus(devoteeId, status, btn) {
  const week = document.getElementById('calling-week').value;
  try {
    await DB.updateCallingStatus(devoteeId, week, { coming_status: status });
    const d = AppState.callingData.find(x => x.id === devoteeId);
    if (d) d.coming_status = status;
    const row = btn.closest('tr');
    row.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    row.className = status === 'Shifted' ? 'status-shifted' : '';
    renderCallingStats(AppState.callingData);
  } catch (_) { showToast('Update failed', 'error'); }
}

const _notesTimers = {};
function updateCallingNotes(devoteeId, notes) {
  clearTimeout(_notesTimers[devoteeId]);
  _notesTimers[devoteeId] = setTimeout(async () => {
    const week = document.getElementById('calling-week').value;
    const d = AppState.callingData.find(x => x.id === devoteeId);
    try { await DB.updateCallingStatus(devoteeId, week, { coming_status: d?.coming_status || 'Maybe', calling_notes: notes }); } catch (_) {}
  }, 800);
}
