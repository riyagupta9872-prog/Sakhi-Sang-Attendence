/* ══ DEVOTEES.JS – Tab 1 ══ */

async function loadDevotees() {
  const filters = {
    search:     document.getElementById('devotee-search').value.trim(),
    team:       document.getElementById('filter-team').value,
    calling_by: document.getElementById('filter-calling-by').value,
    status:     document.getElementById('filter-status').value,
  };
  const list  = document.getElementById('devotee-list');
  const count = document.getElementById('devotee-count');
  list.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const devotees = await DB.getDevotees(filters);
    count.textContent = `${devotees.length} devotee${devotees.length !== 1 ? 's' : ''} found`;
    list.innerHTML = devotees.length
      ? devotees.map(renderDevoteeItem).join('')
      : '<div class="empty-state"><i class="fas fa-users-slash"></i><p>No devotees found</p></div>';
  } catch (_) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function renderDevoteeItem(d) {
  return `
    <div class="devotee-item${d.inactivity_flag ? ' flagged' : ''}" onclick="openProfileModal('${d.id}')">
      <div class="devotee-avatar">${initials(d.name)}</div>
      <div class="devotee-info">
        <div class="devotee-name">${d.name}
          ${isBirthdayWeek(d.dob) ? '<i class="fas fa-birthday-cake birthday-icon" title="Birthday this week!"></i>' : ''}
          ${d.inactivity_flag ? '<i class="fas fa-flag flag-icon" title="Inactive 3+ weeks"></i>' : ''}
        </div>
        <div class="devotee-meta">${d.mobile || '—'}${d.team_name ? ' · ' + d.team_name : ''}</div>
        <div class="devotee-badges">${statusBadge(d.devotee_status)} ${teamBadge(d.team_name)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem">${contactIcons(d.mobile)}</div>
    </div>`;
}

// ── PROFILE MODAL ─────────────────────
async function openProfileModal(id) {
  AppState.currentDevoteeId = id;
  openModal('profile-modal');
  const content = document.getElementById('profile-modal-content');
  content.innerHTML = '<div class="loading" style="padding:2rem"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const d = await DB.getDevotee(id);
    document.getElementById('profile-modal-name').textContent = d.name;
    content.innerHTML = renderProfileContent(d);
  } catch (_) {
    content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function renderProfileContent(d) {
  return `
    <div class="profile-hero">
      <div class="profile-avatar-lg">${initials(d.name)}</div>
      <div class="profile-hero-info">
        <h2>${d.name}${isBirthdayWeek(d.dob) ? ' 🎂' : ''}</h2>
        <div class="profile-hero-meta">${teamBadge(d.team_name)} ${statusBadge(d.devotee_status)}</div>
        <div class="profile-hero-meta" style="margin-top:.4rem">${contactIcons(d.mobile)}${d.mobile ? `<span style="font-size:.85rem;margin-left:.4rem">${d.mobile}</span>` : ''}</div>
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">Basic Information</div>
      <div class="profile-fields">
        <div class="profile-field"><label>Address</label><span>${d.address || '—'}</span></div>
        <div class="profile-field"><label>Date of Birth</label><span>${formatDate(d.dob)}${isBirthdayWeek(d.dob) ? ' 🎂' : ''}</span></div>
        <div class="profile-field"><label>Date of Joining</label><span>${formatDate(d.date_of_joining)}</span></div>
        <div class="profile-field"><label>Lifetime Attendance</label><span style="color:var(--primary);font-size:1.1rem;font-family:'Cinzel',serif">${d.lifetime_attendance}</span></div>
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">Spiritual Profile</div>
      <div class="profile-fields">
        <div class="profile-field"><label>Chanting Rounds</label><span style="font-size:1.1rem;font-family:'Cinzel',serif">${d.chanting_rounds || 0}</span></div>
        <div class="profile-field"><label>Kanthi</label><span>${d.kanthi ? '✓ Yes' : '✗ No'}</span></div>
        <div class="profile-field"><label>Gopi Dress</label><span>${d.gopi_dress ? '✓ Yes' : '✗ No'}</span></div>
      </div>
    </div>
    <div class="profile-section">
      <div class="profile-section-title">Classification</div>
      <div class="profile-fields">
        <div class="profile-field"><label>Facilitator</label><span>${d.facilitator || '—'}</span></div>
        <div class="profile-field"><label>Reference</label><span>${d.reference_by || '—'}</span></div>
        <div class="profile-field"><label>Calling By</label><span>${d.calling_by || '—'}</span></div>
      </div>
    </div>
    <div class="profile-section" style="display:flex;gap:.6rem;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="editCurrentDevotee()"><i class="fas fa-pencil-alt"></i> Edit</button>
      <button class="btn btn-danger" onclick="deleteDevotee('${d.id}')"><i class="fas fa-trash"></i> Remove</button>
    </div>`;
}

function editCurrentDevotee() { closeModal('profile-modal'); openDevoteeFormModal(false, AppState.currentDevoteeId); }

// ── DEVOTEE FORM ──────────────────────
function openDevoteeFormModal(fromAttendance = false, editId = null) {
  AppState.fromAttendance = fromAttendance;
  document.getElementById('f-id').value = editId || '';
  document.getElementById('devotee-form-title').textContent = editId ? 'Edit Devotee Profile' : (fromAttendance ? 'Register New Devotee' : 'Add New Devotee');
  if (editId) populateEditForm(editId); else clearDevoteeForm();
  openModal('devotee-form-modal');
}

function clearDevoteeForm() {
  ['f-name','f-mobile','f-address','f-facilitator','f-reference','f-calling-by'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-dob').value = '';
  document.getElementById('f-joining').value = '';
  document.getElementById('f-chanting').value = '0';
  document.getElementById('f-team').value = '';
  document.getElementById('f-status').value = 'Expected to be Serious';
  document.getElementById('f-kanthi').value = '0';
  document.getElementById('f-gopi').value = '0';
}

async function populateEditForm(id) {
  try {
    const d = await DB.getDevotee(id);
    document.getElementById('f-name').value       = d.name || '';
    document.getElementById('f-mobile').value     = d.mobile || '';
    document.getElementById('f-address').value    = d.address || '';
    document.getElementById('f-dob').value        = d.dob || '';
    document.getElementById('f-joining').value    = d.date_of_joining || '';
    document.getElementById('f-chanting').value   = d.chanting_rounds || 0;
    document.getElementById('f-team').value       = d.team_name || '';
    document.getElementById('f-status').value     = d.devotee_status || 'Expected to be Serious';
    document.getElementById('f-kanthi').value     = d.kanthi || 0;
    document.getElementById('f-gopi').value       = d.gopi_dress || 0;
    document.getElementById('f-facilitator').value = d.facilitator || '';
    document.getElementById('f-reference').value  = d.reference_by || '';
    document.getElementById('f-calling-by').value = d.calling_by || '';
  } catch (_) { showToast('Failed to load profile', 'error'); }
}

function getFormPayload() {
  return {
    name: document.getElementById('f-name').value.trim(),
    mobile: document.getElementById('f-mobile').value.trim(),
    address: document.getElementById('f-address').value.trim(),
    dob: document.getElementById('f-dob').value,
    date_of_joining: document.getElementById('f-joining').value,
    chanting_rounds: parseInt(document.getElementById('f-chanting').value) || 0,
    team_name: document.getElementById('f-team').value,
    devotee_status: document.getElementById('f-status').value,
    kanthi: parseInt(document.getElementById('f-kanthi').value),
    gopi_dress: parseInt(document.getElementById('f-gopi').value),
    facilitator: document.getElementById('f-facilitator').value.trim(),
    reference_by: document.getElementById('f-reference').value.trim(),
    calling_by: document.getElementById('f-calling-by').value.trim(),
  };
}

async function saveDevotee(e) {
  e.preventDefault();
  const id = document.getElementById('f-id').value;
  const payload = getFormPayload();
  try {
    let saved;
    if (id) { saved = await DB.updateDevotee(id, payload); showToast('Profile updated!', 'success'); }
    else    { saved = await DB.createDevotee(payload);     showToast('Devotee added!', 'success'); }
    closeModal('devotee-form-modal');
    loadDevotees(); loadCallingPersonsFilter();
    if (AppState.fromAttendance && AppState.currentSessionId && saved?.id) await markPresent(saved.id, true);
  } catch (err) {
    if (err.error === 'Duplicate') { showToast(err.message, 'error'); }
    else if (err.error === 'DuplicateName') {
      if (confirm(`${err.message}\n\nAdd anyway as a different person?`)) {
        try {
          const saved2 = await DB.forceCreateDevotee(payload);
          showToast('Devotee added!', 'success');
          closeModal('devotee-form-modal'); loadDevotees();
          if (AppState.fromAttendance && AppState.currentSessionId && saved2?.id) await markPresent(saved2.id, true);
        } catch (_) { showToast('Error saving', 'error'); }
      }
    } else { showToast('Error: ' + (err.message || 'Unknown'), 'error'); }
  }
}

async function deleteDevotee(id) {
  if (!confirm('Remove this devotee from the active list? Their history is preserved.')) return;
  try {
    await DB.softDeleteDevotee(id);
    closeModal('profile-modal'); loadDevotees();
    showToast('Devotee removed', 'success');
  } catch (_) { showToast('Delete failed', 'error'); }
}

// ── HISTORY ───────────────────────────
async function openHistoryModal() {
  openModal('history-modal');
  const content = document.getElementById('history-content');
  content.innerHTML = '<div class="loading" style="padding:1.5rem"><i class="fas fa-spinner"></i></div>';
  try {
    const history = await DB.getProfileHistory(AppState.currentDevoteeId);
    if (!history.length) { content.innerHTML = '<div class="empty-state" style="padding:2rem"><i class="fas fa-history"></i><p>No changes recorded yet</p></div>'; return; }
    const labels = { name:'Name', mobile:'Mobile', chanting_rounds:'Chanting Rounds', kanthi:'Kanthi', gopi_dress:'Gopi Dress', team_name:'Team', devotee_status:'Status', facilitator:'Facilitator', reference_by:'Reference', calling_by:'Calling By' };
    content.innerHTML = history.map(h => `
      <div class="history-item">
        <div class="history-field">${labels[h.field_name] || h.field_name}</div>
        <div class="history-change"><span class="old">${h.old_value ?? '—'}</span> <i class="fas fa-arrow-right" style="color:var(--text-muted);font-size:.7rem"></i> <span class="new"> ${h.new_value ?? '—'}</span></div>
        <div class="history-date">${formatDateTime(h.changed_at)}<br><span style="font-size:.7rem">by ${h.changed_by}</span></div>
      </div>`).join('');
  } catch (_) { content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load history</p></div>'; }
}
