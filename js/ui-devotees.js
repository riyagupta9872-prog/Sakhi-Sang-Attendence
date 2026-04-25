/* ══ UI-DEVOTEES.JS – Devotee list, form modal, profile modal ══ */

async function loadDevotees() {
  const filters = {
    search:     document.getElementById('devotee-search').value.trim(),
    team:       AppState.userRole === 'teamAdmin' && AppState.userTeam
                  ? AppState.userTeam
                  : document.getElementById('filter-team').value,
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
    <div class="devotee-item" onclick="openProfileModal('${d.id}')">
      <div class="devotee-avatar">${initials(d.name)}</div>
      <div class="devotee-info">
        <div class="devotee-name">
          ${d.name}
          ${isBirthdayWeek(d.dob) ? '<i class="fas fa-birthday-cake birthday-icon" title="Birthday this week!"></i>' : ''}
        </div>
        <div class="devotee-meta">${d.mobile || '—'}</div>
        <div class="devotee-badges">${statusBadge(d.devotee_status)}${d.team_name ? ' ' + teamBadge(d.team_name) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.5rem">${contactIcons(d.mobile, { altMobile: d.mobile_alt, devoteeId: d.id, name: d.name })}</div>
    </div>`;
}

async function unCancelSession() {
  if (!AppState.currentSessionId) return;
  const s = AppState.sessionsCache[AppState.currentSessionId];
  try {
    await DB.configureSunday(AppState.currentSessionId, { topic: s?.topic || '', isCancelled: false });
    AppState.sessionsCache[AppState.currentSessionId] = { ...s, is_cancelled: false };
    showSessionInfo(AppState.currentSessionId);
    showToast('Class restored! Hare Krishna 🙏', 'success');
  } catch (_) { showToast('Failed to restore', 'error'); }
}

async function openProfileModal(id) {
  AppState.currentDevoteeId = id;
  openModal('profile-modal');
  switchProfileViewTab('identity', null);
  const content = document.getElementById('profile-modal-content');
  const heroEl  = document.getElementById('profile-view-hero');
  const actsEl  = document.getElementById('profile-view-actions');
  content.innerHTML = '<div class="loading" style="padding:2rem"><i class="fas fa-spinner"></i> Loading…</div>';
  if (heroEl) heroEl.innerHTML = '';
  if (actsEl) actsEl.innerHTML = '';
  try {
    const d = await DB.getDevotee(id);
    document.getElementById('profile-modal-name').textContent = d.name;
    const yn = v => v ? '<span class="pf-yes">✓ Yes</span>' : '<span class="pf-no">✗ No</span>';
    const val = v => (v === 0 || v) ? v : '—';

    // Hero
    if (heroEl) {
      heroEl.innerHTML = `
        <div class="profile-hero">
          <div class="profile-avatar-lg">${initials(d.name)}</div>
          <div class="profile-hero-info">
            <h2>${d.name}${isBirthdayWeek(d.dob) ? ' 🎂' : ''}</h2>
            <div class="profile-hero-meta">${d.team_name ? teamBadge(d.team_name) : ''} ${statusBadge(d.devotee_status)}${d.is_not_interested ? ' <span class="badge" style="background:#bf360c;color:#fff"><i class="fas fa-ban"></i> Not Interested</span>' : ''}</div>
            <div class="profile-hero-meta" style="margin-top:.4rem">${contactIcons(d.mobile, { altMobile: d.mobile_alt, devoteeId: d.id, name: d.name })}${d.mobile ? `<span style="font-size:.85rem;margin-left:.4rem">${d.mobile}</span>` : ''}${d.mobile_alt ? `<span style="font-size:.72rem;color:var(--text-muted);margin-left:.4rem">(Alt: ${d.mobile_alt})</span>` : ''}</div>
          </div>
        </div>`;
    }

    content.innerHTML = `
      <!-- Identity panel -->
      <div class="psec-panel active" id="pvpanel-identity">
        <div class="psec-panel-header psec-identity">
          <i class="fas fa-user"></i> Personal Identity
          <span class="psec-note">Name, contact, and location details</span>
        </div>
        <div class="profile-fields">
          <div class="profile-field full"><label>Residential Address</label><span>${d.address || '—'}</span></div>
          <div class="profile-field"><label>Date of Birth</label><span>${formatDate(d.dob)}${isBirthdayWeek(d.dob) ? ' 🎂' : ''}</span></div>
          <div class="profile-field"><label>Mobile (Primary)</label><span>${d.mobile || '—'}</span></div>
          <div class="profile-field"><label>Alternate Mobile</label><span>${d.mobile_alt || '—'}</span></div>
          <div class="profile-field"><label>Email</label><span>${d.email ? `<a href="mailto:${d.email}" style="color:var(--primary)">${d.email}</a>` : '—'}</span></div>
          <div class="profile-field"><label>Admitted On</label><span style="font-size:.82rem;color:var(--text-muted)">${d.created_at ? formatDateTime(d.created_at) : '—'}</span></div>
        </div>
      </div>

      <!-- Team panel -->
      <div class="psec-panel" id="pvpanel-team">
        <div class="psec-panel-header psec-team">
          <i class="fas fa-users"></i> Team Management
          <span class="psec-note">Team assignment and connections</span>
        </div>
        <div class="profile-fields">
          <div class="profile-field"><label>Team Name</label><span>${d.team_name ? teamBadge(d.team_name) : '—'}</span></div>
          <div class="profile-field"><label>Devotee Status</label><span>${statusBadge(d.devotee_status)}</span></div>
          <div class="profile-field"><label>Date of Joining</label><span>${formatDate(d.date_of_joining)}</span></div>
          <div class="profile-field"><label>Reference By</label><span>${d.reference_by || '—'}</span></div>
          <div class="profile-field"><label>Facilitator</label><span>${d.facilitator || '—'}</span></div>
          <div class="profile-field"><label>Calling By</label><span>${d.calling_by || '—'}</span></div>
        </div>
      </div>

      <!-- Professional panel -->
      <div class="psec-panel" id="pvpanel-professional">
        <div class="psec-panel-header psec-professional">
          <i class="fas fa-briefcase"></i> Professional Profile
          <span class="psec-note">Education and occupation</span>
        </div>
        <div class="profile-fields">
          <div class="profile-field"><label>Education / Qualification</label><span>${d.education || '—'}</span></div>
          <div class="profile-field"><label>Profession / Occupation</label><span>${d.profession || '—'}</span></div>
        </div>
      </div>

      <!-- Sadhana panel -->
      <div class="psec-panel" id="pvpanel-sadhana">
        <div class="psec-panel-header psec-sadhana">
          <i class="fas fa-dharmachakra"></i> Sadhana &amp; Practices
          <span class="psec-note">Daily spiritual practice details</span>
        </div>
        <div class="profile-fields">
          <div class="profile-field"><label>Daily Chanting Rounds</label><span style="font-size:1.1rem;font-family:'Cinzel',serif">${val(d.chanting_rounds) || 0}</span></div>
          <div class="profile-field"><label>Lifetime Attendance</label><span style="color:var(--primary);font-size:1.1rem;font-family:'Cinzel',serif">${d.lifetime_attendance || 0}</span></div>
          <div class="profile-field"><label>Reading</label><span>${d.reading ? `<span class="pf-tag">${d.reading}</span>` : '—'}</span></div>
          <div class="profile-field"><label>Hearing</label><span>${d.hearing ? `<span class="pf-tag">${d.hearing}</span>` : '—'}</span></div>
          <div class="profile-field"><label>Tilak</label>${yn(d.tilak)}</div>
          <div class="profile-field"><label>Kanthi</label>${yn(d.kanthi)}</div>
          <div class="profile-field"><label>Gopi Dress</label>${yn(d.gopi_dress)}</div>
        </div>
      </div>

      <!-- Family panel -->
      <div class="psec-panel" id="pvpanel-family">
        <div class="psec-panel-header psec-family">
          <i class="fas fa-home"></i> Social &amp; Family
          <span class="psec-note">Family background and interests</span>
        </div>
        <div class="profile-fields">
          <div class="profile-field"><label>Total Family Members</label><span>${val(d.family_members)}</span></div>
          <div class="profile-field"><label>Members in Class</label><span>${val(d.family_participants)}</span></div>
          <div class="profile-field"><label>Favorable to Devotion</label><span>${d.family_favourable ? `<span class="pf-tag pf-family-${d.family_favourable.toLowerCase().replace(/\s/g,'-')}">${d.family_favourable}</span>` : '—'}</span></div>
          <div class="profile-field full"><label>Hobbies &amp; Interests</label><span>${d.hobbies || '—'}</span></div>
        </div>
      </div>`;

    // Action row
    if (actsEl) {
      const adminOrCoord = AppState.userRole === 'superAdmin' || AppState.userRole === 'teamAdmin';
      actsEl.innerHTML = `
        <div style="display:flex;gap:.5rem;align-items:center">
          ${AppState.userRole === 'superAdmin' && !d.is_not_interested ? `<button class="btn btn-warning-soft" onclick="markNotInterested('${d.id}')"><i class="fas fa-ban"></i> Not Interested</button>` : ''}
        </div>
        <div style="display:flex;gap:.5rem">
          ${adminOrCoord ? `<button class="btn btn-secondary" onclick="editCurrentDevotee()"><i class="fas fa-pencil-alt"></i> Edit</button>` : ''}
          ${AppState.userRole === 'superAdmin' ? `<button class="btn btn-danger" onclick="deleteDevotee('${d.id}')"><i class="fas fa-trash"></i> Remove</button>` : ''}
        </div>`;
    }
  } catch (_) {
    content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function switchProfileViewTab(tab, btn) {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  modal.querySelectorAll('.psec-tab').forEach(b => b.classList.remove('active'));
  modal.querySelectorAll('.psec-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('pvpanel-' + tab);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const idx = PROFILE_TABS.indexOf(tab);
    const tabs = modal.querySelectorAll('.psec-tab');
    if (tabs[idx]) tabs[idx].classList.add('active');
  }
}

function editCurrentDevotee() { closeModal('profile-modal'); openDevoteeFormModal(false, AppState.currentDevoteeId); }

const PROFILE_TABS = ['identity','team','professional','sadhana','family'];

function switchProfileTab(tab, btn) {
  const formModal = document.getElementById('devotee-form-modal');
  if (!formModal) return;
  formModal.querySelectorAll('.psec-panel').forEach(p => p.classList.remove('active'));
  formModal.querySelectorAll('.psec-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('psec-' + tab)?.classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const allBtns = formModal.querySelectorAll('.psec-tab');
    const idx = PROFILE_TABS.indexOf(tab);
    if (allBtns[idx]) allBtns[idx].classList.add('active');
  }
  const idx = PROFILE_TABS.indexOf(tab);
  const prevBtn = document.getElementById('psec-prev');
  const nextBtn = document.getElementById('psec-next');
  const saveBtn = document.getElementById('psec-save');
  if (prevBtn) prevBtn.style.display = idx === 0 ? 'none' : '';
  if (nextBtn) nextBtn.style.display = idx === PROFILE_TABS.length - 1 ? 'none' : '';
  // Save is available on every tab so the user doesn't have to walk through
  // all 5 tabs to save a partial profile.
  if (saveBtn) saveBtn.style.display = '';
}

function stepProfileTab(dir) {
  const formModal = document.getElementById('devotee-form-modal');
  if (!formModal) return;
  const allBtns = [...formModal.querySelectorAll('.psec-tab')];
  const active = formModal.querySelector('.psec-tab.active');
  const idx = allBtns.indexOf(active);
  const next = allBtns[idx + dir];
  if (next) next.click();
}

function openDevoteeFormModal(fromAttendance = false, editId = null) {
  AppState.fromAttendance = fromAttendance;
  document.getElementById('f-id').value = editId || '';
  document.getElementById('devotee-form-title').textContent = editId ? 'Edit Devotee Profile' : (fromAttendance ? 'Register New Devotee' : 'Add New Devotee');
  if (editId) populateEditForm(editId); else clearDevoteeForm();
  switchProfileTab('identity', null);
  openModal('devotee-form-modal');
}

function clearDevoteeForm() {
  ['f-name','f-mobile','f-mobile-alt','f-address','f-education','f-email','f-profession','f-hobbies','f-family-members','f-family-participants'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('f-dob').value = '';
  document.getElementById('f-joining').value = getToday();
  document.getElementById('f-chanting').value = '0';
  document.getElementById('f-team').value = '';
  document.getElementById('f-status').value = 'Expected to be Serious';
  document.getElementById('f-kanthi').value = '0';
  document.getElementById('f-gopi').value = '0';
  document.getElementById('f-family-favourable').value = '';
  document.getElementById('f-reading').value = '';
  document.getElementById('f-hearing').value = '';
  document.getElementById('f-tilak').value = '0';
  clearPicker('picker-facilitator', 'f-facilitator');
  clearPicker('picker-reference',   'f-reference');
  clearPicker('picker-calling-by',  'f-calling-by');
  clearFieldError('mobile');
  if ((AppState.userRole === 'teamAdmin' || AppState.userRole === 'serviceDevotee') && AppState.userTeam) {
    document.getElementById('f-team').value = AppState.userTeam;
  }
}

async function populateEditForm(id) {
  try {
    const d = await DB.getDevotee(id);
    document.getElementById('f-name').value     = d.name || '';
    document.getElementById('f-mobile').value   = d.mobile || '';
    const fMobileAlt = document.getElementById('f-mobile-alt'); if (fMobileAlt) fMobileAlt.value = d.mobile_alt || '';
    document.getElementById('f-address').value  = d.address || '';
    document.getElementById('f-dob').value      = d.dob || '';
    document.getElementById('f-joining').value  = d.date_of_joining || '';
    document.getElementById('f-chanting').value = d.chanting_rounds || 0;
    document.getElementById('f-team').value     = d.team_name || '';
    document.getElementById('f-status').value   = d.devotee_status || 'Expected to be Serious';
    document.getElementById('f-kanthi').value   = d.kanthi || 0;
    document.getElementById('f-gopi').value     = d.gopi_dress || 0;
    if (d.facilitator) { document.getElementById('f-facilitator').value = d.facilitator; const pi = document.querySelector('#picker-facilitator .picker-input'); if(pi){pi.value=d.facilitator;pi.classList.add('has-value');} }
    if (d.reference_by) { document.getElementById('f-reference').value = d.reference_by; const pi = document.querySelector('#picker-reference .picker-input'); if(pi){pi.value=d.reference_by;pi.classList.add('has-value');} }
    if (d.calling_by) { document.getElementById('f-calling-by').value = d.calling_by; const pi = document.querySelector('#picker-calling-by .picker-input'); if(pi){pi.value=d.calling_by;pi.classList.add('has-value');} }
    document.getElementById('f-education').value          = d.education || '';
    document.getElementById('f-email').value              = d.email || '';
    document.getElementById('f-profession').value         = d.profession || '';
    document.getElementById('f-family-favourable').value  = d.family_favourable || '';
    document.getElementById('f-reading').value            = d.reading || '';
    document.getElementById('f-hearing').value            = d.hearing || '';
    document.getElementById('f-hobbies').value            = d.hobbies || '';
    document.getElementById('f-tilak').value              = d.tilak || '0';
    const fm = document.getElementById('f-family-members');    if(fm) fm.value = d.family_members || '';
    const fp = document.getElementById('f-family-participants'); if(fp) fp.value = d.family_participants || '';
    clearFieldError('mobile');
  } catch (_) { showToast('Failed to load profile', 'error'); }
}

function getFormPayload() {
  return {
    name:              document.getElementById('f-name').value.trim(),
    mobile:            document.getElementById('f-mobile').value.replace(/\D/g,'').slice(0,10),
    mobile_alt:        (document.getElementById('f-mobile-alt')?.value || '').replace(/\D/g,'').slice(0,10),
    address:           document.getElementById('f-address').value.trim(),
    dob:               document.getElementById('f-dob').value,
    date_of_joining:   document.getElementById('f-joining').value,
    chanting_rounds:   parseInt(document.getElementById('f-chanting').value) || 0,
    team_name:         document.getElementById('f-team').value,
    devotee_status:    document.getElementById('f-status').value,
    kanthi:            parseInt(document.getElementById('f-kanthi').value),
    gopi_dress:        parseInt(document.getElementById('f-gopi').value),
    facilitator:       document.getElementById('f-facilitator').value.trim(),
    reference_by:      document.getElementById('f-reference').value.trim() || document.querySelector('#picker-reference .picker-input')?.value.trim() || '',
    calling_by:        document.getElementById('f-calling-by').value.trim(),
    education:            document.getElementById('f-education').value.trim(),
    email:                document.getElementById('f-email').value.trim(),
    profession:           document.getElementById('f-profession').value.trim(),
    family_favourable:    document.getElementById('f-family-favourable').value,
    family_members:       parseInt(document.getElementById('f-family-members')?.value) || null,
    family_participants:  parseInt(document.getElementById('f-family-participants')?.value) || null,
    reading:              document.getElementById('f-reading').value,
    hearing:              document.getElementById('f-hearing').value,
    hobbies:              document.getElementById('f-hobbies').value.trim(),
    tilak:                parseInt(document.getElementById('f-tilak').value),
  };
}

async function saveDevotee(e) {
  e.preventDefault();
  const mobileRaw = document.getElementById('f-mobile').value;
  const mob = validateMobile(mobileRaw);
  if (!mob.valid) { switchProfileTab('identity', null); showFieldError('mobile', mob.error); return; }
  clearFieldError('mobile');
  const id = document.getElementById('f-id').value;
  const payload = getFormPayload();

  // Required fields: Name + Mobile + Reference By only.
  if (!payload.name) {
    switchProfileTab('identity', null);
    showToast('Name is required', 'error');
    setTimeout(() => document.getElementById('f-name')?.focus(), 100);
    return;
  }
  if (!payload.reference_by) {
    switchProfileTab('team', null);
    showToast('Reference By is required', 'error');
    setTimeout(() => document.querySelector('#picker-reference .picker-input')?.focus(), 100);
    return;
  }

  if (payload.calling_by) {
    const teamUsers = await DB.getUsersForTeam(payload.team_name);
    if (!teamUsers.some(u => u.name === payload.calling_by)) {
      showToast(`"${payload.calling_by}" has no system login in ${payload.team_name || 'this team'}. Assign a login first.`, 'error');
      return;
    }
  }
  if (payload.facilitator) {
    const allUsers = await DB.getUsersForTeam('');
    if (!allUsers.some(u => u.name === payload.facilitator)) {
      showToast(`Facilitator "${payload.facilitator}" has no system login. Assign a login first.`, 'error');
      return;
    }
  }

  try {
    let saved;
    if (id) { saved = await DB.updateDevotee(id, payload); showToast('Profile updated!', 'success'); }
    else    { saved = await DB.createDevotee(payload);     showToast('Devotee added!', 'success'); }
    closeModal('devotee-form-modal');
    loadDevotees(); loadCallingPersonsFilter();
    if (AppState.fromAttendance && AppState.currentSessionId && saved?.id) {
      await DB.markPresent(AppState.currentSessionId, saved, true);
      showToast('Registered & marked Present! Hare Krishna 🙏', 'success');
      loadAttendanceCandidates(); updateAttendanceStats();
    }
  } catch (err) {
    if (err.error === 'Duplicate') { showToast(err.message, 'error'); }
    else if (err.error === 'DuplicateName') {
      if (confirm(`${err.message}\n\nAdd anyway as a different person?`)) {
        try {
          const saved2 = await DB.forceCreateDevotee(payload);
          showToast('Devotee added!', 'success');
          closeModal('devotee-form-modal'); loadDevotees();
          if (AppState.fromAttendance && AppState.currentSessionId && saved2?.id) {
            await DB.markPresent(AppState.currentSessionId, saved2, true);
            showToast('Registered & marked Present! Hare Krishna 🙏', 'success');
            loadAttendanceCandidates(); updateAttendanceStats();
          }
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

async function markNotInterested(id) {
  if (AppState.userRole !== 'superAdmin') return showToast('Only Super Admin can mark Not Interested', 'error');
  if (!confirm('Mark this devotee as "Not Interested"? They will be removed from all calling lists permanently. This can be undone by editing their profile.')) return;
  try {
    await DB.markNotInterested(id);
    showToast('Marked as Not Interested', 'success');
    closeModal('profile-modal');
    loadDevotees();
  } catch (e) { showToast('Failed: ' + (e.message || 'Unknown error'), 'error'); }
}

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
        <div class="history-change"><span class="old">${h.old_value ?? '—'}</span> <i class="fas fa-arrow-right" style="color:var(--text-muted);font-size:.7rem"></i> <span class="new">${h.new_value ?? '—'}</span></div>
        <div class="history-date">${formatDateTime(h.changed_at)}<br><span style="font-size:.7rem">by ${h.changed_by}</span></div>
      </div>`).join('');
  } catch (_) { content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load history</p></div>'; }
}
