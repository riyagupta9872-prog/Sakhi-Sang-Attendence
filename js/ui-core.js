/* ══ UI-CORE.JS – Auth, role UI, admin, pickers, sessions, tabs ══ */

// ── AUTH ──────────────────────────────────────────────
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
  if (!user) { showAuthScreen(); return; }
  AppState.userId = user.uid;
  try {
    let userDoc = await fdb.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      let isFirst = false;
      try {
        const allUsers = await fdb.collection('users').limit(1).get();
        isFirst = allUsers.empty;
      } catch (_) { isFirst = false; }
      const role = isFirst ? 'superAdmin' : 'serviceDevotee';
      const data = { email: user.email, name: user.displayName || user.email.split('@')[0], role, teamName: null, createdAt: TS() };
      await fdb.collection('users').doc(user.uid).set(data);
      userDoc = { data: () => data };
    }
    const ud = userDoc.data();
    AppState.userRole     = ud.role;
    AppState.userTeam     = ud.teamName   || null;
    AppState.userPosition = ud.position   || null;
    AppState.userName     = ud.name       || user.email;
    AppState.profilePic   = ud.profilePic || null;
    hideAuthScreen();
    applyRoleUI();
    await initApp();
  } catch (e) {
    if (e.code === 'permission-denied') {
      document.getElementById('auth-screen').classList.remove('hidden');
      const errEl = document.getElementById('login-error');
      errEl.innerHTML = '⚠️ Firestore rules not set. Go to <b>Firebase Console → Firestore → Rules</b> and paste the rules shown below, then refresh.<br><br><code style="font-size:.75rem;display:block;margin-top:.4rem;background:#f5f5f5;padding:.5rem;border-radius:4px;text-align:left">allow read, write: if request.auth != null;</code>';
      errEl.classList.add('show');
    } else {
      console.error('Auth init', e);
    }
  }
});

function showAuthScreen() { document.getElementById('auth-screen').classList.remove('hidden'); }
function hideAuthScreen() { document.getElementById('auth-screen').classList.add('hidden'); }

function switchAuthTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
}

document.addEventListener('DOMContentLoaded', () => {
  const roleSelect = document.getElementById('signup-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      document.getElementById('signup-team-field').style.display = roleSelect.value === 'teamAdmin' ? 'flex' : 'none';
    });
  }
  document.getElementById('login-form')?.addEventListener('submit', doLogin);
  document.getElementById('signup-form')?.addEventListener('submit', doSignup);
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

async function doLogin(e) {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.classList.remove('show');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (ex) {
    err.textContent = ex.code === 'auth/wrong-password' || ex.code === 'auth/user-not-found'
      ? 'Invalid email or password' : ex.message;
    err.classList.add('show');
  }
}

async function doSignup(e) {
  e.preventDefault();
  const err = document.getElementById('signup-error');
  err.classList.remove('show');
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const role     = document.getElementById('signup-role').value;
  const team     = document.getElementById('signup-team').value;
  if (password.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.classList.add('show'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    const existing = await fdb.collection('users').limit(2).get();
    const isFirst = existing.docs.filter(d => d.id !== cred.user.uid).length === 0;
    await fdb.collection('users').doc(cred.user.uid).set({
      email, name, role: isFirst ? 'superAdmin' : role,
      teamName: role === 'teamAdmin' ? (team || null) : null,
      createdAt: TS()
    });
  } catch (ex) {
    err.textContent = ex.code === 'auth/email-already-in-use' ? 'Email already registered' : ex.message;
    err.classList.add('show');
  }
}

function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  const showing = inp.type === 'text';
  inp.type = showing ? 'password' : 'text';
  btn.querySelector('i').className = showing ? 'fas fa-eye' : 'fas fa-eye-slash';
}

async function doForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) {
    const err = document.getElementById('login-error');
    err.textContent = 'Enter your email address above, then click Forgot password.';
    err.classList.add('show');
    document.getElementById('login-email').focus();
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    const err = document.getElementById('login-error');
    err.style.cssText = 'background:#e8f5e9;color:#2e7d32;border:1.5px solid #a5d6a7;display:block';
    err.textContent = `Password reset email sent to ${email}. Check your inbox.`;
    err.classList.add('show');
  } catch (ex) {
    const err = document.getElementById('login-error');
    err.style.cssText = '';
    err.textContent = ex.code === 'auth/user-not-found' ? 'No account found with this email.' : ex.message;
    err.classList.add('show');
  }
}

async function doLogout() {
  if (!confirm('Log out?')) return;
  await auth.signOut();
}

// ── EDIT PROFILE ─────────────────────────────────────
let _pendingProfilePic = undefined;

function openEditProfile() {
  _pendingProfilePic = undefined;
  document.getElementById('edit-profile-name').value     = AppState.userName || '';
  document.getElementById('edit-profile-position').value = AppState.userPosition || '';
  document.getElementById('edit-profile-error').style.display = 'none';
  document.getElementById('profile-pic-input').value = '';
  _renderProfilePicPreview(AppState.profilePic || null);

  const isSuperAdmin = AppState.userRole === 'superAdmin';
  const teamSelect   = document.getElementById('edit-profile-team');
  const teamReadonly = document.getElementById('edit-profile-team-readonly');
  const teamNote     = document.getElementById('edit-profile-team-note');

  if (isSuperAdmin) {
    teamSelect.style.display   = '';
    teamReadonly.style.display = 'none';
    teamNote.style.display     = 'none';
    teamSelect.value           = AppState.userTeam || '';
  } else {
    teamSelect.style.display   = 'none';
    teamReadonly.style.display = '';
    teamReadonly.textContent   = AppState.userTeam || '— Not assigned —';
    teamNote.style.display     = '';
  }

  openModal('edit-profile-modal');
}

function _renderProfilePicPreview(src) {
  const img   = document.getElementById('profile-pic-img');
  const inits = document.getElementById('profile-pic-initials');
  const rmBtn = document.getElementById('remove-pic-btn');
  if (src) {
    img.src = src; img.style.display = 'block';
    inits.style.display = 'none';
    rmBtn.style.display = '';
  } else {
    img.style.display = 'none';
    inits.textContent = initials(AppState.userName || '?');
    inits.style.display = '';
    rmBtn.style.display = 'none';
  }
}

function handleProfilePicSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const errEl = document.getElementById('edit-profile-error');
  errEl.style.display = 'none';
  if (file.size > 50 * 1024) {
    errEl.textContent = `Image is too large (${(file.size / 1024).toFixed(1)} KB). Please choose an image under 50 KB.`;
    errEl.style.display = 'block';
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    _pendingProfilePic = ev.target.result;
    _renderProfilePicPreview(_pendingProfilePic);
  };
  reader.readAsDataURL(file);
}

function removeProfilePic() {
  _pendingProfilePic = null;
  _renderProfilePicPreview(null);
}

async function saveEditProfile() {
  const name     = document.getElementById('edit-profile-name').value.trim();
  const position = document.getElementById('edit-profile-position').value.trim() || null;
  const errEl    = document.getElementById('edit-profile-error');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Name cannot be empty.'; errEl.style.display = 'block'; return; }

  const updates = { name, position, updatedAt: TS() };
  if (AppState.userRole === 'superAdmin') {
    updates.teamName = document.getElementById('edit-profile-team').value || null;
  }
  if (_pendingProfilePic !== undefined) updates.profilePic = _pendingProfilePic;

  try {
    await fdb.collection('users').doc(AppState.userId).update(updates);
    AppState.userName     = name;
    AppState.userPosition = position;
    if (AppState.userRole === 'superAdmin') AppState.userTeam = updates.teamName;
    if (_pendingProfilePic !== undefined) AppState.profilePic = _pendingProfilePic || null;
    document.getElementById('header-user-name').textContent = name;
    _applyHeaderAvatar();
    applyRoleUI();
    closeModal('edit-profile-modal');
    showToast('Profile updated! Hare Krishna 🙏', 'success');
  } catch (ex) {
    errEl.textContent = 'Save failed: ' + ex.message;
    errEl.style.display = 'block';
  }
}

function _applyHeaderAvatar() {
  const img   = document.getElementById('header-avatar-img');
  const inits = document.getElementById('header-avatar-initials');
  const pic   = AppState.profilePic;
  if (pic) {
    img.src = pic; img.style.display = 'block';
    inits.style.display = 'none';
  } else {
    img.style.display = 'none';
    inits.textContent = initials(AppState.userName || '?');
    inits.style.display = '';
  }
}

// ── ROLE-BASED UI ─────────────────────────────────────
function applyRoleUI() {
  const role = AppState.userRole;
  const team = AppState.userTeam;

  document.getElementById('header-user-name').textContent = AppState.userName;
  _applyHeaderAvatar();
  const pill = document.getElementById('header-role-pill');
  const pos = AppState.userPosition;
  pill.textContent = role === 'superAdmin' ? 'Super Admin'
    : role === 'teamAdmin' ? (team ? `${team} - Coordinator` : 'Coordinator')
    : (team ? `${team} - ${pos || 'Sevak'}` : (pos || 'Sevak'));
  pill.style.background = role === 'superAdmin' ? 'rgba(201,168,76,.5)' : role === 'teamAdmin' ? 'rgba(82,183,136,.4)' : 'rgba(82,183,136,.25)';

  if (role === 'superAdmin') {
    document.getElementById('admin-gear-btn').classList.remove('hidden');
    document.getElementById('clear-data-btn').classList.remove('hidden');
  }
  document.querySelectorAll('.super-admin-only').forEach(el => {
    if (role !== 'superAdmin') el.style.display = 'none';
  });

  const tabs = {
    devotees:   ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    calling:    ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    attendance: ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    reports:    ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    care:       ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    events:     ['superAdmin', 'teamAdmin', 'serviceDevotee'],
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    if (!tabs[tab]?.includes(role)) {
      btn.style.display = 'none';
    }
  });

  document.querySelectorAll('.admin-coordinator-only').forEach(el => {
    if (!['superAdmin','teamAdmin'].includes(role)) el.style.display = 'none';
  });

  if ((role === 'teamAdmin' || role === 'serviceDevotee') && team) {
    const ft = document.getElementById('filter-team');
    if (ft) { ft.value = team; ft.disabled = true; }
  }
}

// ── ADMIN PANEL ───────────────────────────────────────
async function openAdminPanel() {
  openModal('admin-panel-modal');
  const container = document.getElementById('admin-users-list');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const snap = await fdb.collection('users').get();
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const teams = ['', ...TEAMS];
    container.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="devotee-avatar" style="width:36px;height:36px;font-size:.8rem;flex-shrink:0">${initials(u.name||u.email)}</div>
        <div class="admin-user-info">
          <div class="admin-user-email">${u.name || ''} <span style="font-weight:400;color:var(--text-muted)">&lt;${u.email}&gt;</span></div>
          <div class="admin-user-meta">UID: ${u.uid.slice(0,8)}…</div>
        </div>
        <div class="admin-user-controls">
          <select class="filter-select" id="role-${u.uid}" onchange="updateUserRole('${u.uid}')">
            <option value="serviceDevotee"${u.role==='serviceDevotee'?' selected':''}>Sevak</option>
            <option value="teamAdmin"${u.role==='teamAdmin'?' selected':''}>Coordinator</option>
            <option value="superAdmin"${u.role==='superAdmin'?' selected':''}>Super Admin</option>
          </select>
          <select class="filter-select" id="team-${u.uid}" onchange="updateUserRole('${u.uid}')">
            ${teams.map(t => `<option value="${t}"${u.teamName===t?' selected':''}>${t||'No Team'}</option>`).join('')}
          </select>
          <input class="filter-select" id="pos-${u.uid}" placeholder="Position…" value="${u.position||''}" style="width:110px" onchange="updateUserRole('${u.uid}')" onblur="updateUserRole('${u.uid}')" />
        </div>
      </div>`).join('');
  } catch (_) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load users</p></div>'; }
}

async function updateUserRole(uid) {
  const role     = document.getElementById(`role-${uid}`)?.value;
  const teamName = document.getElementById(`team-${uid}`)?.value || null;
  const position = document.getElementById(`pos-${uid}`)?.value.trim() || null;
  try {
    await fdb.collection('users').doc(uid).update({ role, teamName, position });
    showToast('User updated!', 'success');
  } catch (_) { showToast('Update failed', 'error'); }
}

// ── CLEAR DATA ────────────────────────────────────────
async function openClearDataModal() {
  const sel = document.getElementById('clear-team-select');
  sel.innerHTML = '<option value="">-- Select Team --</option>';
  const teams = TEAMS;
  teams.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
  try {
    const all = await DevoteeCache.all();
    const dbTeams = [...new Set(all.map(d => d.teamName).filter(Boolean))].sort();
    dbTeams.forEach(t => { if (!teams.includes(t)) { const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); } });
  } catch (_) {}
  const sun = getUpcomingSunday();
  document.getElementById('clear-date-input').value = sun;
  document.getElementById('clear-team-date-input').value = sun;
  document.getElementById('clear-all-confirm').value = '';
  openModal('clear-data-modal');
}

async function clearDataForDate() {
  const date = document.getElementById('clear-date-input').value;
  if (!date) return showToast('Please select a date', 'error');
  if (!confirm(`Delete ALL attendance records for ${formatDate(date)}?\n\nThis cannot be undone.`)) return;
  try {
    showToast('Clearing…');
    const sessSnap = await fdb.collection('sessions').where('sessionDate', '==', date).get();
    if (sessSnap.empty) return showToast('No session found for this date', 'error');
    const sessionId = sessSnap.docs[0].id;
    const attSnap = await fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get();
    const batches = chunkArray(attSnap.docs, 400);
    for (const chunk of batches) {
      const b = fdb.batch();
      chunk.forEach(d => { b.delete(d.ref); });
      await b.commit();
    }
    const csSnap = await fdb.collection('callingStatus').where('weekDate', '==', date).get();
    const csBatches = chunkArray(csSnap.docs, 400);
    for (const chunk of csBatches) {
      const b = fdb.batch();
      chunk.forEach(d => { b.delete(d.ref); });
      await b.commit();
    }
    const devoteeIds = [...new Set(attSnap.docs.map(d => d.data().devoteeId))];
    const dbatches = chunkArray(devoteeIds, 400);
    for (const chunk of dbatches) {
      const b = fdb.batch();
      chunk.forEach(id => b.update(fdb.collection('devotees').doc(id), { lifetimeAttendance: INC(-1) }));
      await b.commit();
    }
    DevoteeCache.bust();
    showToast(`Cleared ${attSnap.size} records for ${formatDate(date)}`, 'success');
    loadAttendanceCandidates?.(); updateAttendanceStats?.();
  } catch (e) { showToast('Error: ' + e.message, 'error'); console.error(e); }
}

async function clearDataForTeamDate() {
  const date = document.getElementById('clear-team-date-input').value;
  const team = document.getElementById('clear-team-select').value;
  if (!date) return showToast('Please select a date', 'error');
  if (!team) return showToast('Please select a team', 'error');
  if (!confirm(`Delete attendance records for team "${team}" on ${formatDate(date)}?\n\nThis cannot be undone.`)) return;
  try {
    showToast('Clearing…');
    const sessSnap = await fdb.collection('sessions').where('sessionDate', '==', date).get();
    if (sessSnap.empty) return showToast('No session found for this date', 'error');
    const sessionId = sessSnap.docs[0].id;
    const attSnap = await fdb.collection('attendanceRecords')
      .where('sessionId', '==', sessionId)
      .where('teamName', '==', team).get();
    if (attSnap.empty) return showToast(`No records found for ${team} on ${formatDate(date)}`, 'error');
    const b = fdb.batch();
    attSnap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    const b2 = fdb.batch();
    attSnap.docs.forEach(d => b2.update(fdb.collection('devotees').doc(d.data().devoteeId), { lifetimeAttendance: INC(-1) }));
    await b2.commit();
    DevoteeCache.bust();
    showToast(`Cleared ${attSnap.size} records for ${team} on ${formatDate(date)}`, 'success');
    loadAttendanceCandidates?.(); updateAttendanceStats?.();
  } catch (e) { showToast('Error: ' + e.message, 'error'); console.error(e); }
}

async function clearAllData() {
  const confirm1 = document.getElementById('clear-all-confirm').value.trim();
  if (confirm1 !== 'DELETE ALL') return showToast('Type "DELETE ALL" exactly to confirm', 'error');
  if (!confirm('FINAL WARNING: This will permanently delete ALL devotees, sessions, attendance, and calling records.\n\nAre you absolutely sure?')) return;
  try {
    closeModal('clear-data-modal');
    showToast('Erasing all data…');
    const collections = ['devotees','sessions','attendanceRecords','callingStatus','events','profileChanges'];
    for (const col of collections) {
      let snap = await fdb.collection(col).limit(400).get();
      while (!snap.empty) {
        const b = fdb.batch();
        snap.docs.forEach(d => b.delete(d.ref));
        await b.commit();
        snap = await fdb.collection(col).limit(400).get();
      }
    }
    DevoteeCache.bust();
    showToast('All data erased. Reloading…', 'success');
    setTimeout(() => location.reload(), 2000);
  } catch (e) { showToast('Error: ' + e.message, 'error'); console.error(e); }
}

// ── INIT ─────────────────────────────────────────────
async function initApp() {
  await initSession();
  loadDevotees();
  loadCallingPersonsFilter();
  loadBirthdays();
  document.getElementById('report-date').value = getToday();
  initAllPickers();
  initSheetYearSelector();
}

// ── MOBILE VALIDATION ─────────────────────────────────
function validateMobile(val) {
  const cleaned = (val || '').replace(/\D/g, '');
  if (cleaned.length === 0) return { valid: false, error: 'Mobile number is required' };
  if (cleaned.length !== 10) return { valid: false, error: 'Mobile must be exactly 10 digits' };
  return { valid: true, cleaned };
}

function showFieldError(id, msg) {
  const el = document.getElementById('err-' + id);
  const inp = document.getElementById('f-' + id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
  if (inp) inp.classList.add('invalid');
}

function clearFieldError(id) {
  const el = document.getElementById('err-' + id);
  const inp = document.getElementById('f-' + id);
  if (el) el.classList.remove('show');
  if (inp) inp.classList.remove('invalid');
}

// ── DEVOTEE PICKER ────────────────────────────────────
function initAllPickers() {
  setupPicker('picker-reference',   'f-reference');
  setupUserPicker('picker-calling-by',  'f-calling-by',  () => document.getElementById('f-team')?.value || '');
  setupUserPicker('picker-facilitator', 'f-facilitator', () => '');
}

function setupPicker(containerId, hiddenId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const input    = container.querySelector('.picker-input');
  const dropdown = container.querySelector('.picker-dropdown');
  const hidden   = document.getElementById(hiddenId);

  input.addEventListener('input', debounce(async () => {
    const q = input.value.trim();
    hidden.value = '';
    input.classList.remove('has-value');
    if (q.length < 2) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }
    const results = await DB.getDevotees({ search: q });
    if (!results.length) {
      dropdown.innerHTML = '<div class="picker-no-result">No devotee found</div>';
      dropdown.classList.remove('hidden'); return;
    }
    dropdown.innerHTML = results.slice(0, 8).map(d => `
      <div class="picker-option" onclick="selectPicker('${containerId}','${hiddenId}','${d.name.replace(/'/g,"\\'")}','${d.id}')">
        <span>${d.name}</span>
        <span class="picker-team">${d.team_name || ''}</span>
      </div>`).join('');
    dropdown.classList.remove('hidden');
  }, 280));

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.classList.add('hidden');
  });
}

function selectPicker(containerId, hiddenId, name, id) {
  const container = document.getElementById(containerId);
  const input    = container.querySelector('.picker-input');
  const dropdown = container.querySelector('.picker-dropdown');
  const hidden   = document.getElementById(hiddenId);
  input.value  = name;
  hidden.value = name;
  input.classList.add('has-value');
  dropdown.classList.add('hidden');
}

function setupUserPicker(containerId, hiddenId, getTeam) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const input    = container.querySelector('.picker-input');
  const dropdown = container.querySelector('.picker-dropdown');
  const hidden   = document.getElementById(hiddenId);

  input.addEventListener('input', debounce(async () => {
    const q = input.value.trim();
    hidden.value = '';
    input.classList.remove('has-value');
    if (q.length < 2) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }
    const team = getTeam();
    const results = await DB.getUsersForTeam(team, q);
    if (!results.length) {
      dropdown.innerHTML = `<div class="picker-no-result">No login found${team ? ' for ' + team + ' team' : ''}</div>`;
      dropdown.classList.remove('hidden'); return;
    }
    dropdown.innerHTML = results.slice(0, 8).map(u => `
      <div class="picker-option" onclick="selectPicker('${containerId}','${hiddenId}','${(u.name||'').replace(/'/g,"\\'")}','${u.uid}')">
        <span>${u.name || u.email}</span>
        <span class="picker-team">${u.teamName || ''}${u.teamName ? ' · ' : ''}${u.role === 'teamAdmin' ? 'Coordinator' : 'Calling Sevak'}</span>
      </div>`).join('');
    dropdown.classList.remove('hidden');
  }, 280));

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.classList.add('hidden');
  });
}

function clearPicker(containerId, hiddenId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelector('.picker-input').value = '';
  container.querySelector('.picker-input').classList.remove('has-value');
  container.querySelector('.picker-dropdown').classList.add('hidden');
  document.getElementById(hiddenId).value = '';
}

// ── SESSION MANAGEMENT ─────────────────────────────────
async function initSession() {
  try {
    const session = await DB.getTodaySession();
    AppState.currentSessionId = session.id;
    const picker = document.getElementById('session-date-picker');
    if (picker) picker.value = session.session_date;
    await loadSessionSelector();
    loadAttendanceSession(session.id);
  } catch (e) { console.error('Session init', e); }
}

async function loadSessionSelector() {
  try {
    const sessions = await DB.getSessions();
    AppState.sessionsCache = {};
    sessions.forEach(s => { AppState.sessionsCache[s.id] = s; });

    const picker = document.getElementById('session-date-picker');
    const currentSession = AppState.sessionsCache[AppState.currentSessionId];
    if (picker && currentSession) picker.value = currentSession.session_date;

    if (AppState.currentSessionId) showSessionInfo(AppState.currentSessionId);
  } catch (_) {}
}

async function loadSessionByDate(dateStr) {
  if (!dateStr) return;
  const sunday = snapToSunday(dateStr);
  if (sunday !== dateStr) {
    showToast(`Snapped to Sunday: ${formatDate(sunday)}`, 'info');
    const picker = document.getElementById('session-date-picker');
    if (picker) picker.value = sunday;
  }
  try {
    const session = await DB.getOrCreateSession(sunday);
    AppState.currentSessionId = session.id;
    AppState.sessionsCache[session.id] = AppState.sessionsCache[session.id] || {
      id: session.id, session_date: sunday, topic: '', is_cancelled: false
    };
    showSessionInfo(session.id);
    loadAttendanceSession(session.id);
  } catch (e) { showToast('Could not load session', 'error'); console.error(e); }
}

function showSessionInfo(sessionId) {
  const s = AppState.sessionsCache?.[sessionId];
  const banner = document.getElementById('session-cancelled-banner');
  const topicBar = document.getElementById('session-topic-bar');
  if (!banner || !topicBar) return;
  if (s?.is_cancelled) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
  if (s?.topic && !s.is_cancelled) {
    document.getElementById('session-topic-text').textContent = s.topic;
    topicBar.classList.remove('hidden');
  } else {
    topicBar.classList.add('hidden');
  }
}

async function loadCallingPersonsFilter() {
  try {
    const persons = await DB.getCallingPersons();
    const sel = document.getElementById('filter-calling-by');
    persons.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
  } catch (_) {}
}

async function loadBirthdays() {
  try {
    const bdays = await DB.getCareBirthdays();
    if (!bdays.length) return;
    document.getElementById('birthday-list').innerHTML = bdays.map(d => `
      <div class="birthday-item">
        <div class="devotee-avatar" style="width:38px;height:38px;font-size:.9rem">${initials(d.name)}</div>
        <span class="birthday-name">${d.name}</span>
        <span class="birthday-date">${formatBirthday(d.dob)}</span>
        ${contactIcons(d.mobile)}
      </div>`).join('');
    document.getElementById('birthday-popup').classList.remove('hidden');
  } catch (_) {}
}
function closeBirthdayPopup() { document.getElementById('birthday-popup').classList.add('hidden'); }

// ── TAB SWITCHING ─────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  AppState.currentTab = tab;
  const fab = document.getElementById('register-fab');
  if (fab) fab.classList.toggle('hidden', tab !== 'attendance');
  if (tab === 'calling')    loadCallingStatus();
  if (tab === 'attendance') loadAttendanceTab();
  if (tab === 'reports')    loadReports();
  if (tab === 'care')       loadCareData();
  if (tab === 'events')     loadEvents();
}

function switchSubTab(btn, id) {
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('subtab-' + id).classList.add('active');
  if (id === 'trends')            loadTrends();
  if (id === 'serious-analysis')  loadSeriousAnalysis();
  if (id === 'team-leaderboard')  loadTeamLeaderboard();
  if (id === 'attendance-detail') loadAttendanceDetail();
}

// ── EXPORT ATTENDANCE ─────────────────────────────────
async function exportAttendance() {
  if (!AppState.currentSessionId) return showToast('No session selected', 'error');
  try {
    const records = await DB.getSessionAttendance(AppState.currentSessionId);
    if (!records.length) return showToast('No attendance data', 'error');
    const rows = records.map(r => ({ Name: r.name, Mobile: r.mobile || '', 'Chanting Rounds': r.chanting_rounds, Team: r.team_name || '', 'Calling By': r.calling_by || '', Type: r.is_new_devotee ? 'New' : 'Regular' }));
    downloadExcel(rows, `attendance_${getToday()}.xlsx`);
  } catch (_) { showToast('Export failed', 'error'); }
}
