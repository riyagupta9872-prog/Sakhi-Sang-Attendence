/* ══ UI-CORE.JS – Auth, role UI, admin, pickers, sessions, tabs ══ */

// ── AUTH ──────────────────────────────────────────────
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
  if (!user) { showAuthScreen(); return; }
  AppState.userId = user.uid;
  try {
    let userDoc = await fdb.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      // First user EVER bootstraps as superAdmin (so the system has someone
      // who can approve future requests). Everyone else must wait for approval.
      let isFirst = false;
      try {
        const allUsers = await fdb.collection('users').limit(1).get();
        isFirst = allUsers.empty;
      } catch (_) { isFirst = false; }
      if (isFirst) {
        const data = { email: user.email, name: user.displayName || user.email.split('@')[0], role: 'superAdmin', teamName: null, createdAt: TS() };
        await fdb.collection('users').doc(user.uid).set(data);
        userDoc = { data: () => data };
      } else {
        // No users-doc and not the first user → must be approved.
        showPendingApprovalScreen();
        return;
      }
    }
    const ud = userDoc.data();
    if (ud.status === 'rejected') {
      // Their sign-up was explicitly rejected — block sign-in.
      await auth.signOut();
      showAuthScreen();
      const errEl = document.getElementById('login-error');
      if (errEl) {
        errEl.textContent = 'This account was not approved. Please contact your Super Admin.';
        errEl.classList.add('show');
      }
      return;
    }
    AppState.userRole     = ud.role;
    AppState.userTeam     = ud.teamName   || null;
    AppState.userPosition = ud.position   || null;
    AppState.userName     = ud.name       || user.email;
    AppState.profilePic   = ud.profilePic || null;
    hideAuthScreen();
    hidePendingApprovalScreen();
    applyRoleUI();
    await initApp();
    // Super admin only: keep a live count of pending sign-up requests.
    if (AppState.userRole === 'superAdmin') subscribePendingSignups();
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
function showPendingApprovalScreen() { document.getElementById('pending-approval-screen')?.classList.remove('hidden'); document.getElementById('auth-screen').classList.add('hidden'); }
function hidePendingApprovalScreen() { document.getElementById('pending-approval-screen')?.classList.add('hidden'); }

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
    // First user EVER bootstraps as approved superAdmin. Everyone else lands
    // in signupRequests for super admin to approve.
    const existing = await fdb.collection('users').limit(2).get();
    const isFirst = existing.docs.filter(d => d.id !== cred.user.uid).length === 0;
    if (isFirst) {
      await fdb.collection('users').doc(cred.user.uid).set({
        email, name, role: 'superAdmin', teamName: null, createdAt: TS()
      });
      return;  // onAuthStateChanged will pick them up as super admin
    }
    // Record the request and immediately sign them out — they'll see the
    // "Awaiting approval" gate on next sign-in.
    await fdb.collection('signupRequests').doc(cred.user.uid).set({
      uid:            cred.user.uid,
      email, name,
      requestedRole:  role,
      requestedTeam:  role === 'teamAdmin' ? (team || null) : null,
      status:         'pending',
      createdAt:      TS(),
    });
    showPendingApprovalScreen();
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

// ── SIGN-UP REQUESTS (super admin) ─────────────────────
let _signupReqUnsub = null;
let _signupReqCache = [];

function subscribePendingSignups() {
  if (_signupReqUnsub) return;
  try {
    _signupReqUnsub = fdb.collection('signupRequests')
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        _signupReqCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _updateSignupBadges(_signupReqCache.length);
        // If the modal is open, refresh its content
        const open = !document.getElementById('signup-requests-modal')?.classList.contains('hidden');
        if (open) renderSignupRequests();
      }, err => { console.error('signupRequests subscription', err); });
  } catch (e) { console.error('subscribePendingSignups', e); }
}

function _updateSignupBadges(count) {
  const navBadge = document.getElementById('sidebar-badge');
  const itemBadge = document.getElementById('signup-pending-badge');
  if (navBadge) {
    navBadge.classList.toggle('hidden', !count);
    navBadge.textContent = count > 9 ? '9+' : String(count);
  }
  if (itemBadge) {
    itemBadge.classList.toggle('hidden', !count);
    itemBadge.textContent = String(count);
  }
}

function openSignupRequests() {
  closeSidebar();
  openModal('signup-requests-modal');
  renderSignupRequests();
}

function renderSignupRequests() {
  const el = document.getElementById('signup-requests-list');
  if (!el) return;
  if (!_signupReqCache.length) {
    el.innerHTML = '<div class="empty-state" style="padding:2rem"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>No pending sign-up requests.</p></div>';
    return;
  }
  // Sort newest first
  const rows = [..._signupReqCache].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });
  const teamOptions = '<option value="">— No team —</option>' +
    TEAMS.map(t => `<option value="${t}">${t}</option>`).join('');
  el.innerHTML = rows.map(r => {
    const when = r.createdAt?.toDate
      ? r.createdAt.toDate().toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
      : '—';
    const safeName = (r.name || '').replace(/"/g, '&quot;');
    return `<div class="signup-req-row">
      <div class="devotee-avatar" style="width:42px;height:42px;font-size:.85rem;flex-shrink:0">${initials(r.name || r.email)}</div>
      <div class="signup-req-info">
        <div class="signup-req-name">${r.name || '(unnamed)'}</div>
        <div class="signup-req-meta">
          <i class="fas fa-envelope"></i> ${r.email || '—'}
          &nbsp;·&nbsp; requested ${when}
          ${r.requestedRole ? '&nbsp;·&nbsp; wants <strong>' + (r.requestedRole === 'teamAdmin' ? 'Coordinator' : 'Facilitator') + '</strong>' : ''}
          ${r.requestedTeam ? ' for <strong>' + r.requestedTeam + '</strong>' : ''}
        </div>
      </div>
      <div class="signup-req-actions">
        <select id="srq-role-${r.id}" class="filter-select">
          <option value="serviceDevotee"${r.requestedRole==='serviceDevotee'?' selected':''}>Facilitator</option>
          <option value="teamAdmin"${r.requestedRole==='teamAdmin'?' selected':''}>Coordinator</option>
          <option value="superAdmin">Super Admin</option>
        </select>
        <select id="srq-team-${r.id}" class="filter-select">
          ${teamOptions.replace(`value="${(r.requestedTeam||'').replace(/"/g,'&quot;')}"`, `value="${(r.requestedTeam||'').replace(/"/g,'&quot;')}" selected`)}
        </select>
        <button class="btn btn-secondary" onclick="contactSignupRequest('${r.email||''}','${safeName}')" title="Email"><i class="fas fa-envelope"></i></button>
        <button class="btn btn-primary" onclick="approveSignupRequest('${r.id}')"><i class="fas fa-check"></i> Approve</button>
        <button class="btn btn-danger" onclick="rejectSignupRequest('${r.id}')"><i class="fas fa-times"></i> Reject</button>
      </div>
    </div>`;
  }).join('');
}

async function approveSignupRequest(id) {
  const r = _signupReqCache.find(x => x.id === id);
  if (!r) return;
  const role = document.getElementById('srq-role-' + id)?.value || 'serviceDevotee';
  const team = document.getElementById('srq-team-' + id)?.value || null;
  try {
    // Create the users/{uid} doc — this is what onAuthStateChanged looks for.
    await fdb.collection('users').doc(r.uid).set({
      email: r.email,
      name:  r.name,
      role,
      teamName: team || null,
      createdAt: TS(),
      approvedBy: AppState.userName,
      approvedAt: TS(),
    });
    await fdb.collection('signupRequests').doc(id).update({
      status: 'approved',
      decidedBy: AppState.userName,
      decidedAt: TS(),
      assignedRole: role,
      assignedTeam: team || null,
    });
    showToast(`Approved ${r.name || r.email}`, 'success');
  } catch (e) {
    showToast('Approval failed: ' + (e.message || 'Error'), 'error');
  }
}

async function rejectSignupRequest(id) {
  const r = _signupReqCache.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Reject sign-up request from ${r.name || r.email}?\n\nThey won't be able to access the app.`)) return;
  try {
    const now = TS();
    // Write a users doc with status:'rejected' so onAuthStateChanged can block sign-in.
    await fdb.collection('users').doc(r.uid).set({
      email: r.email || '', name: r.name || '', status: 'rejected',
      role: 'serviceDevotee', teamName: null,
      rejectedBy: AppState.userName, rejectedAt: now,
    });
    await fdb.collection('signupRequests').doc(id).update({
      status: 'rejected',
      decidedBy: AppState.userName,
      decidedAt: now,
    });
    showToast(`Rejected ${r.name || r.email}`, 'success');
  } catch (e) {
    showToast('Reject failed: ' + (e.message || 'Error'), 'error');
  }
}

// Open the super admin's mail client pre-filled to the requester. Client-side
// JavaScript can't reliably send email itself; mailto is the universal fallback.
function contactSignupRequest(email, name) {
  if (!email) { showToast('No email on this request', 'error'); return; }
  const subj = encodeURIComponent('Your Sakhi Sang account');
  const body = encodeURIComponent(`Hare Krishna ${name || ''},\n\nRegarding your Sakhi Sang sign-up request — `);
  window.location.href = `mailto:${email}?subject=${subj}&body=${body}`;
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
  _applySidebarInfo();
}

function _applySidebarInfo() {
  const img   = document.getElementById('sidebar-avatar-img');
  const inits = document.getElementById('sidebar-avatar-initials');
  const name  = document.getElementById('sidebar-user-name');
  const role  = document.getElementById('sidebar-user-role');
  if (name) name.textContent = AppState.userName || '';
  if (role) {
    const r = AppState.userRole;
    const t = AppState.userTeam;
    const p = AppState.userPosition;
    role.textContent = r === 'superAdmin' ? 'Super Admin'
      : r === 'teamAdmin' ? (t ? `${t} · Coordinator` : 'Coordinator')
      : (t ? `${t} · ${p || 'Facilitator'}` : (p || 'Facilitator'));
  }
  const pic = AppState.profilePic;
  if (img && inits) {
    if (pic) {
      img.src = pic; img.style.display = 'block';
      inits.style.display = 'none';
    } else {
      img.style.display = 'none';
      inits.textContent = initials(AppState.userName || '?');
      inits.style.display = '';
    }
  }
}

// ── SIDEBAR ────────────────────────────────────────────
function openSidebar() {
  const sb = document.getElementById('app-sidebar');
  if (!sb || sb.classList.contains('open')) return;
  _applySidebarInfo();
  sb.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.remove('hidden');
  _ensureOverlayHistory?.();
}
function closeSidebar() {
  const sb = document.getElementById('app-sidebar');
  if (!sb) return;
  sb.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.add('hidden');
}

// ── SESSION CONFIGURATION ──────────────────────────────
async function openSessionConfig() {
  closeSidebar();
  try {
    const cfg = await DB.getCallingWeekConfig();
    document.getElementById('sc-topic').value           = cfg?.topic        || '';
    document.getElementById('sc-speaker').value         = cfg?.speakerName  || '';
    document.getElementById('sc-session-type').value    = cfg?.sessionType  || 'regular';
    document.getElementById('sc-calling-date').value    = cfg?.callingDate  || '';
    document.getElementById('sc-attendance-date').value = cfg?.sessionDate  || '';
  } catch (_) {}
  openModal('session-config-modal');
}

async function saveSessionConfig() {
  const topic       = document.getElementById('sc-topic').value.trim();
  const speakerName = document.getElementById('sc-speaker').value.trim();
  const sessionType = document.getElementById('sc-session-type').value;
  const callingDate = document.getElementById('sc-calling-date').value;
  const sessionDate = document.getElementById('sc-attendance-date').value;
  if (!callingDate) { showToast('Calling date is required', 'error'); return; }
  if (!sessionDate) { showToast('Attendance date is required', 'error'); return; }
  try {
    await DB.setCallingWeekConfig(callingDate, sessionDate, { topic, speakerName, sessionType });
    closeModal('session-config-modal');
    showToast('Session configured! Hare Krishna 🙏', 'success');
    if (AppState.currentTab === 'calling') loadCallingStatus?.();
    if (AppState.currentTab === 'attendance') loadAttendanceTab?.();
  } catch (e) {
    showToast('Save failed: ' + (e.message || 'Check connection'), 'error');
  }
}

// ── CHANGE PASSWORD ────────────────────────────────────
function openChangePassword() {
  closeSidebar();
  ['cp-current','cp-new','cp-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const err = document.getElementById('cp-error'); if (err) err.style.display = 'none';
  openModal('change-password-modal');
}

async function doChangePassword() {
  const cur = document.getElementById('cp-current').value;
  const nw  = document.getElementById('cp-new').value;
  const cf  = document.getElementById('cp-confirm').value;
  const err = document.getElementById('cp-error');
  err.style.display = 'none';
  if (!cur || !nw || !cf) { err.textContent = 'All fields are required.'; err.style.display = 'block'; return; }
  if (nw.length < 6)      { err.textContent = 'New password must be at least 6 characters.'; err.style.display = 'block'; return; }
  if (nw !== cf)          { err.textContent = 'New passwords do not match.'; err.style.display = 'block'; return; }
  const user = auth.currentUser;
  if (!user) { err.textContent = 'Not signed in.'; err.style.display = 'block'; return; }
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nw);
    closeModal('change-password-modal');
    showToast('Password updated! Hare Krishna 🙏', 'success');
  } catch (e) {
    err.textContent = e.code === 'auth/wrong-password' ? 'Current password is incorrect.'
      : e.code === 'auth/weak-password' ? 'Password is too weak.'
      : (e.message || 'Could not update password.');
    err.style.display = 'block';
  }
}

// ── USER MANAGEMENT (enhanced) ─────────────────────────
let _umUsers = [];

async function openUserManagement() {
  closeSidebar();
  openModal('user-mgmt-modal');
  const list = document.getElementById('um-list');
  list.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading users…</div>';
  try {
    const snap = await fdb.collection('users').get();
    _umUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    _umUsers.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    renderUserMgmtList();
  } catch (_) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load users</p></div>';
  }
}

function renderUserMgmtList() {
  const list = document.getElementById('um-list');
  if (!list) return;
  const q = (document.getElementById('um-search')?.value || '').toLowerCase().trim();
  const filtered = _umUsers.filter(u => {
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><p>No users found</p></div>';
    return;
  }
  list.innerHTML = filtered.map(u => {
    const roleLabel = u.role === 'superAdmin' ? 'Super Admin'
      : u.role === 'teamAdmin' ? 'Coordinator' : 'Facilitator';
    const meta = [roleLabel, u.teamName || '', u.position || ''].filter(Boolean).join(' · ');
    return `<div class="um-row" onclick="openUserAction('${u.uid}')">
      <div class="um-avatar">${initials(u.name || u.email)}</div>
      <div class="um-info">
        <div class="um-name">${u.name || u.email}</div>
        <div class="um-meta">${u.email ? u.email + ' · ' : ''}${meta}</div>
      </div>
      <i class="fas fa-chevron-right um-chevron"></i>
    </div>`;
  }).join('');
}

function openUserAction(uid) {
  const u = _umUsers.find(x => x.uid === uid);
  if (!u) return;
  document.getElementById('ua-user-name').textContent = u.name || u.email || 'User';
  document.getElementById('ua-user-id').value          = uid;
  document.getElementById('ua-position').value         = u.position || '';
  document.getElementById('ua-team').value             = u.teamName || '';
  document.getElementById('ua-role').value             = u.role     || 'serviceDevotee';
  openModal('user-action-modal');
}

async function doSaveUserAction() {
  const uid      = document.getElementById('ua-user-id').value;
  const position = document.getElementById('ua-position').value.trim() || null;
  const teamName = document.getElementById('ua-team').value || null;
  const role     = document.getElementById('ua-role').value;
  if (!uid) return;
  try {
    await fdb.collection('users').doc(uid).update({ position, teamName, role, updatedAt: TS() });
    // reflect in local cache
    const u = _umUsers.find(x => x.uid === uid);
    if (u) { u.position = position; u.teamName = teamName; u.role = role; }
    renderUserMgmtList();
    closeModal('user-action-modal');
    showToast('User updated!', 'success');
  } catch (e) {
    showToast('Update failed: ' + (e.message || 'Unknown'), 'error');
  }
}

async function doRemoveUser() {
  const uid = document.getElementById('ua-user-id').value;
  if (!uid) return;
  if (uid === AppState.userId) { showToast('You cannot remove your own account here.', 'error'); return; }
  if (!confirm('Remove this user profile? Their Firestore record will be deleted. (Auth account must be deleted separately in Firebase Console.)')) return;
  try {
    await fdb.collection('users').doc(uid).delete();
    _umUsers = _umUsers.filter(u => u.uid !== uid);
    renderUserMgmtList();
    closeModal('user-action-modal');
    showToast('User removed', 'success');
  } catch (e) {
    showToast('Remove failed: ' + (e.message || 'Unknown'), 'error');
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
    : (team ? `${team} - ${pos || 'Facilitator'}` : (pos || 'Facilitator'));
  pill.style.background = role === 'superAdmin' ? 'rgba(201,168,76,.5)' : role === 'teamAdmin' ? 'rgba(82,183,136,.4)' : 'rgba(82,183,136,.25)';

  if (role === 'superAdmin') {
    document.getElementById('admin-gear-btn')?.classList.remove('hidden');
    document.getElementById('clear-data-btn')?.classList.remove('hidden');
  }
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = role === 'superAdmin' ? '' : 'none';
  });

  const tabs = {
    dashboard:   ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    devotees:    ['superAdmin'],
    calling:     ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    attendance:  ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    reports:     ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    care:        ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    events:      ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    'calling-mgmt':  ['superAdmin'],
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    const allowed = tabs[tab]?.includes(role);
    btn.style.display = allowed ? '' : 'none';
  });

  // If the currently-active panel is one the user can't access, switch to
  // the first tab they CAN access. Devotees is the HTML default, so non-super-
  // admins would otherwise land on an empty/forbidden view.
  const activePanel = document.querySelector('.tab-panel.active');
  const activeTab   = activePanel?.id?.replace('tab-', '');
  if (activeTab && !tabs[activeTab]?.includes(role)) {
    const firstAllowed = Object.keys(tabs).find(t => tabs[t].includes(role));
    const firstBtn = document.querySelector(`.tab-btn[data-tab="${firstAllowed}"]`);
    if (firstBtn && typeof switchTab === 'function') switchTab(firstAllowed, firstBtn);
  }

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
            <option value="serviceDevotee"${u.role==='serviceDevotee'?' selected':''}>Facilitator</option>
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
    const submSnap = await fdb.collection('callingSubmissions').where('weekDate', '==', date).get();
    const submBatches = chunkArray(submSnap.docs, 400);
    for (const chunk of submBatches) {
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
    const collections = ['devotees','sessions','attendanceRecords','callingStatus','callingSubmissions','callingWeekHistory','events','profileChanges'];
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
  await initMasterFilterBar();
  loadDevotees();
  loadCallingPersonsFilter();
  loadBirthdays();
  initReportsSessionFilter?.();
  initAllPickers();
  initHomeDevoteePickers?.();
  initSheetYearSelector();
  // Default current tab follows the HTML's active panel.
  if (!AppState.currentTab) {
    const activePanel = document.querySelector('.tab-panel.active');
    AppState.currentTab = activePanel?.id?.replace('tab-', '') || 'dashboard';
  }
  if (AppState.currentTab === 'dashboard') { loadHome?.(); loadDashboard?.(); }
  renderBreadcrumb?.();
}

// ── MASTER FILTER BAR ───────────────────────────────────
// Stage 2: bar is visible and editable, but tabs still also use their legacy
// widgets. The bar mirrors values in both directions through dispatchFilters
// + a 'filtersChanged' listener that syncs legacy <select> values back.
async function initMasterFilterBar() {
  // Populate Team — for non-super-admin, render the static chip and hide the
  // editable select (they cannot change away from their own team).
  const teamSel  = document.getElementById('mfb-team');
  const teamChip = document.getElementById('mfb-team-chip');
  if (AppState.userRole && AppState.userRole !== 'superAdmin' && AppState.userTeam) {
    if (teamSel) teamSel.style.display = 'none';
    if (teamChip) {
      teamChip.style.display = '';
      teamChip.innerHTML = `<i class="fas fa-lock" style="font-size:.7rem"></i> ${AppState.userTeam}`;
    }
    AppState.filters.team = AppState.userTeam;
  } else if (teamSel) {
    teamSel.value = AppState.filters.team || '';
  }

  // Populate Session — past sessions newest first, with the upcoming Sunday
  // promoted to the top with an "Upcoming" badge.
  await _mfbReloadSessionOptions();

  // Populate Calling By based on current Team
  _mfbReloadCallingByOptions();

  // Listen to dispatchFilters firing → keep widgets in sync (legacy + master)
  window.addEventListener('filtersChanged', _mfbOnFiltersChanged);

  // Mirror back: when legacy widgets change, push their value into the master
  // state so the master bar updates too (and the active tab re-loads).
  _mfbAttachLegacyMirror();

  _mfbUpdateCaption();
}

function _mfbAttachLegacyMirror() {
  const teamIds = ['filter-team','calling-filter-team','yearly-sheet-team','trend-team','cm-filter-team'];
  const byIds   = ['filter-calling-by','calling-filter-callingby','cm-filter-by'];
  teamIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => dispatchFilters({ team: el.value }));
  });
  byIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => dispatchFilters({ callingBy: el.value }));
  });
}

async function _mfbReloadSessionOptions() {
  const sel = document.getElementById('mfb-session');
  if (!sel) return;
  try {
    const today    = getToday();
    const sessions = await DB.getSessions();          // newest first, up to 52
    const upcoming = sessions.filter(s => s.session_date >  today)
                              .sort((a, b) => a.session_date.localeCompare(b.session_date));
    const past     = sessions.filter(s => s.session_date <= today);
    let html = '';
    if (upcoming[0]) {
      const u = upcoming[0];
      const lbl = new Date(u.session_date + 'T00:00:00')
        .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      html += `<option value="${u.id}" data-date="${u.session_date}">▶ ${lbl} (Upcoming)</option>`;
      html += `<option disabled>──────────────</option>`;
    }
    past.forEach(s => {
      const lbl = new Date(s.session_date + 'T00:00:00')
        .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      html += `<option value="${s.id}" data-date="${s.session_date}">${lbl}${s.topic ? ' · ' + s.topic.slice(0, 28) : ''}</option>`;
    });
    sel.innerHTML = html || '<option value="">No sessions yet</option>';
    // Options use the Firestore doc ID as their value; filters.sessionId is the date string.
    // Try to select by matching data-date to the current filter; fall back to upcoming/past.
    const currentFilter = AppState.filters.sessionId;
    if (currentFilter) {
      const match = Array.from(sel.options).find(o => o.dataset?.date === currentFilter);
      if (match) sel.value = match.value;
    }
    if (!sel.value) { const fb = upcoming[0] || past[0]; if (fb) sel.value = fb.id; }
    if (sel.value && sel.value !== AppState._currentSessionId) {
      const opt2 = sel.options[sel.selectedIndex];
      dispatchFilters({ sessionId: opt2?.dataset?.date || sel.value, _sessionDocId: sel.value });
    }
  } catch (e) { console.error('mfbReloadSessionOptions', e); }
}

function _mfbReloadCallingByOptions() {
  const sel = document.getElementById('mfb-by');
  if (!sel) return;
  // Source from DevoteeCache so callers list stays consistent everywhere.
  DevoteeCache.all().then(all => {
    const team = AppState.filters.team || '';
    const pool = team ? all.filter(d => d.teamName === team) : all;
    const callers = [...new Set(pool.map(d => d.callingBy).filter(Boolean))].sort();
    const prev = AppState.filters.callingBy || '';
    sel.innerHTML = '<option value="">All Callers</option>' +
      callers.map(c => `<option value="${c.replace(/"/g,'&quot;')}"${c===prev?' selected':''}>${c}</option>`).join('');
    // Hide entirely if there are no callers in the chosen team
    const field = document.getElementById('mfb-by-field');
    if (field) field.style.display = callers.length ? '' : 'none';
    // If the current callingBy isn't in the new pool, clear it
    if (prev && !callers.includes(prev)) {
      dispatchFilters({ callingBy: '' });
    }
  }).catch(() => {});
}

function _mfbOnSession(value) {
  const sel = document.getElementById('mfb-session');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const dateStr = opt?.dataset?.date || null;
  const docId   = opt?.value || null;
  dispatchFilters({ sessionId: dateStr, _sessionDocId: docId });
}

function _mfbOnTeam(value) {
  dispatchFilters({ team: value || '' });
  _mfbReloadCallingByOptions();
}

function _mfbOnCallingBy(value) {
  dispatchFilters({ callingBy: value || '' });
}

function _mfbUpdateCaption() {
  const cap = document.getElementById('mfb-caption');
  if (!cap) return;
  const f = AppState.filters || {};
  const parts = [];
  if (f.team)      parts.push(`<strong>${f.team}</strong> team`);
  else             parts.push('all teams');
  if (f.callingBy) parts.push(`called by <strong>${f.callingBy}</strong>`);
  if (f.sessionId) {
    const lbl = new Date(f.sessionId + 'T00:00:00')
      .toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    parts.push(`for <strong>${lbl}</strong>`);
  }
  cap.innerHTML = 'Showing ' + parts.join(', ');
}

// Sync between master bar + legacy widgets. Fires on every dispatchFilters call.
function _mfbOnFiltersChanged(e) {
  const f = AppState.filters;
  // Master bar widgets
  const mfbTeam = document.getElementById('mfb-team');
  if (mfbTeam && mfbTeam.value !== (f.team || '')) mfbTeam.value = f.team || '';
  const mfbBy   = document.getElementById('mfb-by');
  if (mfbBy && mfbBy.value !== (f.callingBy || '')) mfbBy.value = f.callingBy || '';
  const mfbSes  = document.getElementById('mfb-session');
  if (mfbSes && f.sessionId) {
    // Match the option whose data-date equals the canonical sessionId
    Array.from(mfbSes.options).forEach(o => {
      if (o.dataset && o.dataset.date === f.sessionId) mfbSes.value = o.value;
    });
  }
  // Legacy widgets (mirrors so both stay in sync until later stages drop them)
  const pairs = [
    ['filter-team',           f.team],
    ['calling-filter-team',   f.team],
    ['yearly-sheet-team',     f.team],
    ['trend-team',            f.team],
    ['cm-filter-team',        f.team],
    ['cs-modal-team',         f.team],
    ['filter-calling-by',     f.callingBy],
    ['calling-filter-callingby', f.callingBy],
    ['cm-filter-by',          f.callingBy],
    ['cs-modal-by',           f.callingBy],
  ];
  pairs.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && el.value !== (val || '')) {
      el.value = val || '';
    }
  });
  _mfbUpdateCaption();

  // Re-render the visible tab so it picks up the new filter values.
  // Each load* is idempotent and reads from filters / legacy widgets (now
  // already synced above). Reports has its own dispatch in _refreshAfterFilter.
  const tab = AppState.currentTab;
  if (tab === 'dashboard'    && typeof loadDashboard === 'function')       loadDashboard();
  if (tab === 'devotees'     && typeof loadDevotees === 'function')        loadDevotees();
  const _sessionChanged = e?.detail?.before && e.detail.before.sessionId !== AppState.filters.sessionId;
  if (tab === 'calling') {
    if (_sessionChanged) loadCallingStatus?.();
    else if (typeof filterCallingList === 'function' && AppState.callingData?.length) filterCallingList();
  }
  if (tab === 'attendance') loadAttendanceTab?.();
  if (tab === 'reports'      && typeof _refreshAfterFilter === 'function') _refreshAfterFilter();
  if (tab === 'care'         && typeof loadCareData === 'function')        loadCareData();
  if (tab === 'calling-mgmt' && typeof loadCallingMgmtTab === 'function')  loadCallingMgmtTab();
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

  async function showResults(q) {
    const team = getTeam();
    const results = await DB.getUsersForTeam(team, q);
    if (!results.length) {
      dropdown.innerHTML = `<div class="picker-no-result">No login found${team ? ' for ' + team + ' team' : ''}.${team ? '<br><small>Pick a different team or have an admin assign a login first.</small>' : ''}</div>`;
      dropdown.classList.remove('hidden'); return;
    }
    dropdown.innerHTML = results.slice(0, 12).map(u => {
      const display = (u.name || u.email || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const meta = `${u.teamName || ''}${u.teamName ? ' · ' : ''}${u.role === 'teamAdmin' ? 'Coordinator' : 'Calling Facilitator'}`;
      return `<div class="picker-option" onclick="selectPicker('${containerId}','${hiddenId}','${display}','${u.uid}')">
        <span>${u.name || u.email || '(no name)'}</span>
        <span class="picker-team">${meta}</span>
      </div>`;
    }).join('');
    dropdown.classList.remove('hidden');
  }

  // Show all candidates when the field gains focus (so the user sees options
  // immediately, without having to type 2+ characters first).
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    showResults(q);
  });

  input.addEventListener('input', debounce(() => {
    hidden.value = '';
    input.classList.remove('has-value');
    showResults(input.value.trim());
  }, 200));

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
function _setSessionDateDisplay(dateStr) {
  const el = document.getElementById('session-date-text');
  if (el) el.textContent = dateStr ? formatDate(dateStr) : '';
}

async function initSession() {
  try {
    const session = await DB.getTodaySession();
    AppState.currentSessionId = session.id;
    _setSessionDateDisplay(session.session_date);
    await loadSessionSelector();
    loadAttendanceSession(session.id);
  } catch (e) { console.error('Session init', e); }
}

async function loadSessionSelector() {
  try {
    const sessions = await DB.getSessions();
    AppState.sessionsCache = {};
    sessions.forEach(s => { AppState.sessionsCache[s.id] = s; });
    const currentSession = AppState.sessionsCache[AppState.currentSessionId];
    if (currentSession) _setSessionDateDisplay(currentSession.session_date);
    if (AppState.currentSessionId) showSessionInfo(AppState.currentSessionId);
  } catch (_) {}
}

async function loadSessionByDate(dateStr) {
  if (!dateStr) return;
  const sunday = snapToSunday(dateStr);
  try {
    const session = await DB.getOrCreateSession(sunday);
    AppState.currentSessionId = session.id;
    AppState.sessionsCache[session.id] = AppState.sessionsCache[session.id] || {
      id: session.id, session_date: sunday, topic: '', is_cancelled: false
    };
    _setSessionDateDisplay(sunday);
    showSessionInfo(session.id);
    loadAttendanceSession(session.id);
  } catch (e) { showToast('Could not load session', 'error'); console.error(e); }
}

function showSessionInfo(sessionId) {
  const s = AppState.sessionsCache?.[sessionId];
  const banner   = document.getElementById('session-cancelled-banner');
  const topicPil = document.getElementById('session-topic-inline');
  if (!banner || !topicPil) return;
  banner.classList.toggle('hidden', !s?.is_cancelled);
  if (s?.topic && !s.is_cancelled) {
    document.getElementById('session-topic-text').textContent = s.topic;
    topicPil.classList.remove('hidden');
  } else {
    topicPil.classList.add('hidden');
  }
}

async function loadCallingPersonsFilter() {
  await _repopulateCallingByFilter();
}

async function _repopulateCallingByFilter() {
  const sel = document.getElementById('filter-calling-by');
  if (!sel) return;
  const team = document.getElementById('filter-team')?.value || '';
  const prev = sel.value;
  try {
    // Pull all active devotees from cache, narrow by team if set, then
    // return unique callingBy values (users who actually call in that team).
    const all = await DevoteeCache.all();
    const pool = team ? all.filter(d => d.teamName === team) : all;
    const persons = [...new Set(pool.map(d => d.callingBy).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All Callers</option>' +
      persons.map(p => `<option value="${p.replace(/"/g,'&quot;')}"${p===prev?' selected':''}>${p}</option>`).join('');
  } catch (_) {}
}

// Called when the Team filter changes on the Devotees tab: re-scope callers, then reload.
function onDevoteeTeamFilterChange() {
  const by = document.getElementById('filter-calling-by');
  if (by) by.value = '';
  _repopulateCallingByFilter().then(() => loadDevotees());
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
  // btn may be omitted when called programmatically (e.g. via breadcrumb).
  if (btn) btn.classList.add('active');
  else document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
  AppState.currentTab = tab;
  renderBreadcrumb();
  document.getElementById('register-fab')?.classList.toggle('hidden', tab !== 'attendance');
  document.getElementById('add-devotee-fab')?.classList.toggle('hidden', tab !== 'devotees');
  if (tab === 'dashboard')  { loadHome?.(); loadDashboard?.(); }
  if (tab === 'calling')    loadCallingStatus();
  if (tab === 'attendance') loadAttendanceTab();
  if (tab === 'reports')    loadReports();
  if (tab === 'care')       loadCareData();
  if (tab === 'events')     loadEvents();
  if (tab === 'calling-mgmt') loadCallingMgmtTab?.();
  // Sync legacy widgets on the newly-shown tab to current filter values.
  if (typeof _mfbOnFiltersChanged === 'function') _mfbOnFiltersChanged();
}

function switchSubTab(btn, id) {
  const scope = btn.closest('.reports-cat-panel') || document;
  scope.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  scope.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('subtab-' + id)?.classList.add('active');
  if (id === 'trends')            loadTrends();
  if (id === 'serious-analysis')  loadSeriousAnalysis();
  if (id === 'team-leaderboard')  loadTeamLeaderboard();
  if (id === 'attendance-detail') loadAttendanceDetail();
  if (id === 'newcomers-report')  loadNewComersReport?.();
  renderBreadcrumb?.();
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

// ── BREADCRUMB ──────────────────────────────────────────
// Renders the current location as a clickable path. Reads tab + sub-tab state
// from the DOM so we don't need a separate registry.
function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb-trail');
  if (!el) return;
  const tabLabels = {
    dashboard:      'Dashboard',
    devotees:       'Devotees',
    calling:        'Calling',
    attendance:     'Attendance',
    reports:        'Reports',
    care:           'Care',
    events:         'Events',
    'calling-mgmt': 'Calling Mgmt',
  };
  const tab = AppState.currentTab || 'dashboard';
  const segments = [
    { label: '<i class="fas fa-home"></i>', cls: 'bc-home', onClick: `switchTab('dashboard', null)` },
  ];
  if (tab !== 'dashboard') segments.push({ label: tabLabels[tab] || tab, onClick: `switchTab('${tab}', null)` });

  // Reports: two-level nesting (category → sub-tab)
  if (tab === 'reports') {
    const cat = document.querySelector('.reports-cat-panel.active')?.id || '';
    if (cat === 'reports-cat-attendance') {
      segments.push({ label: 'Attendance Reports', onClick: `switchReportsCategory('attendance', document.querySelector('#tab-reports .att-sub-tab'))` });
    } else if (cat === 'reports-cat-calling') {
      segments.push({ label: 'Calling Reports', onClick: `switchReportsCategory('calling', document.querySelectorAll('#tab-reports .att-sub-tab')[1])` });
    }
    const subId = document.querySelector('.reports-cat-panel.active .sub-panel.active')?.id || '';
    const subLabels = {
      'subtab-attendance-detail':  'Attendance Sheet',
      'subtab-newcomers-report':   'New Comers',
      'subtab-serious-analysis':   'Serious',
      'subtab-team-leaderboard':   'Teams',
      'subtab-trends':             'Trends',
      'subtab-calling-weekly':     'Weekly Report',
      'subtab-calling-submission': 'Submission Reports',
    };
    if (subLabels[subId]) segments.push({ label: subLabels[subId], current: true });
  }

  // Calling Mgmt: 5-way sub-tabs
  if (tab === 'calling-mgmt') {
    const cmLabels = {
      'calling-mgmt-panel-calling':       'Calling List',
      'calling-mgmt-panel-newcomers':     'New Comers',
      'calling-mgmt-panel-online':        'Online Class',
      'calling-mgmt-panel-notinterested': 'Not Interested',
      'calling-mgmt-panel-festival':      'Festival Calling',
    };
    const subId = document.querySelector('#tab-calling-mgmt .att-sub-panel.active')?.id || '';
    if (cmLabels[subId]) segments.push({ label: cmLabels[subId], current: true });
  }

  // Mark final segment as current
  if (segments.length && !segments[segments.length - 1].current) {
    segments[segments.length - 1].current = true;
  }

  el.innerHTML = segments.map((s, i) => {
    const sep = i > 0 ? '<span class="bc-sep">›</span>' : '';
    if (s.current) {
      return `${sep}<span class="bc-seg bc-current ${s.cls || ''}">${s.label}</span>`;
    }
    return `${sep}<button class="bc-seg ${s.cls || ''}" onclick="${s.onClick || ''}">${s.label}</button>`;
  }).join('');
}
