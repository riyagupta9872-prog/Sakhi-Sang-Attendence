/* ══════════════════════════════════════════════════════
   APP.JS – Sakhi Sang Attendance System
   Firebase Firestore backend · Vanilla JS · No build step
   ══════════════════════════════════════════════════════ */

// ── FIREBASE INIT ─────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCxxLIiOy0bGus2NkkSod7_LBVHah5-sz0",
  authDomain: "sakhi-sang-attendence-tracker.firebaseapp.com",
  projectId: "sakhi-sang-attendence-tracker",
  storageBucket: "sakhi-sang-attendence-tracker.firebasestorage.app",
  messagingSenderId: "975645795932",
  appId: "1:975645795932:web:10123086717198940b2899"
};
firebase.initializeApp(firebaseConfig);
const fdb = firebase.firestore();
const TS  = () => firebase.firestore.FieldValue.serverTimestamp();
const INC = (n) => firebase.firestore.FieldValue.increment(n);
fdb.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ── APP STATE ─────────────────────────────────────────
const AppState = {
  currentTab: 'devotees',
  currentSessionId: null,
  currentDevoteeId: null,
  currentEventId: null,
  trendsChart: null,
  callingData: [],
  fromAttendance: false,
  attendanceCandidates: {},
  sessionsCache: {},     // sessionId → session object
  // Auth
  userRole: null,       // 'superAdmin' | 'teamAdmin' | 'serviceDevotee'
  userTeam: null,       // team name for coordinators
  userName: '',
  userId: null,
};

// ── AUTH ──────────────────────────────────────────────
const auth = firebase.auth();

auth.onAuthStateChanged(async (user) => {
  if (!user) { showAuthScreen(); return; }
  AppState.userId = user.uid;
  try {
    let userDoc = await fdb.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      // Check if this is the very first user → make them admin
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
    AppState.userRole = ud.role;
    AppState.userTeam = ud.teamName || null;
    AppState.userName = ud.name || user.email;
    hideAuthScreen();
    applyRoleUI();
    await initApp();
  } catch (e) {
    if (e.code === 'permission-denied') {
      // Firestore rules not configured yet — show helpful message
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

// Wire up auth forms and team-field toggle
document.addEventListener('DOMContentLoaded', () => {
  const roleSelect = document.getElementById('signup-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      document.getElementById('signup-team-field').style.display = roleSelect.value === 'teamAdmin' ? 'flex' : 'none';
    });
  }
  // Ensure login/signup forms fire correctly even if inline onsubmit is blocked
  document.getElementById('login-form')?.addEventListener('submit', doLogin);
  document.getElementById('signup-form')?.addEventListener('submit', doSignup);
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
    // Check if first user
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

// ── ROLE-BASED UI ─────────────────────────────────────
function applyRoleUI() {
  const role = AppState.userRole;
  const team = AppState.userTeam;

  // Header info
  document.getElementById('header-user-name').textContent = AppState.userName;
  const pill = document.getElementById('header-role-pill');
  pill.textContent = role === 'superAdmin' ? 'Super Admin' : role === 'teamAdmin' ? (team ? `${team} Admin` : 'Team Admin') : 'Seva';
  pill.style.background = role === 'superAdmin' ? 'rgba(201,168,76,.5)' : role === 'teamAdmin' ? 'rgba(82,183,136,.4)' : 'rgba(255,255,255,.2)';

  // Admin gear
  if (role === 'superAdmin') {
    document.getElementById('admin-gear-btn').classList.remove('hidden');
    document.getElementById('clear-data-btn').classList.remove('hidden');
  }
  // Super-admin-only elements
  document.querySelectorAll('.super-admin-only').forEach(el => {
    if (role !== 'superAdmin') el.style.display = 'none';
  });

  // Tab visibility
  const tabs = {
    devotees:   ['superAdmin', 'teamAdmin'],
    calling:    ['superAdmin', 'teamAdmin'],
    attendance: ['superAdmin', 'teamAdmin', 'serviceDevotee'],
    reports:    ['superAdmin', 'teamAdmin'],
    care:       ['superAdmin', 'teamAdmin'],
    events:     ['superAdmin', 'teamAdmin'],
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    if (!tabs[tab]?.includes(role)) {
      btn.style.display = 'none';
    }
  });

  // Admin/coordinator only elements
  document.querySelectorAll('.admin-coordinator-only').forEach(el => {
    if (!['superAdmin','teamAdmin'].includes(role)) el.style.display = 'none';
  });

  // If service devotee, default to attendance tab
  if (role === 'serviceDevotee') {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-attendance').classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="attendance"]')?.classList.add('active');
    AppState.currentTab = 'attendance';
  }

  // Lock team filter for coordinators
  if (role === 'teamAdmin' && team) {
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
    const teams = ['','Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
    container.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="devotee-avatar" style="width:36px;height:36px;font-size:.8rem;flex-shrink:0">${initials(u.name||u.email)}</div>
        <div class="admin-user-info">
          <div class="admin-user-email">${u.name || ''} <span style="font-weight:400;color:var(--text-muted)">&lt;${u.email}&gt;</span></div>
          <div class="admin-user-meta">UID: ${u.uid.slice(0,8)}…</div>
        </div>
        <div class="admin-user-controls">
          <select class="filter-select" onchange="updateUserRole('${u.uid}', this.value, document.getElementById('team-${u.uid}').value)">
            <option value="serviceDevotee"${u.role==='serviceDevotee'?' selected':''}>Service Devotee</option>
            <option value="teamAdmin"${u.role==='teamAdmin'?' selected':''}>Team Admin</option>
            <option value="superAdmin"${u.role==='superAdmin'?' selected':''}>Super Admin</option>
          </select>
          <select class="filter-select" id="team-${u.uid}" onchange="updateUserRole('${u.uid}', document.querySelector('[onchange*=\\'${u.uid}\\']:not(#team-${u.uid})').value, this.value)">
            ${teams.map(t => `<option value="${t}"${u.teamName===t?' selected':''}>${t||'No Team'}</option>`).join('')}
          </select>
        </div>
      </div>`).join('');
  } catch (_) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load users</p></div>'; }
}

async function updateUserRole(uid, role, teamName) {
  try {
    await fdb.collection('users').doc(uid).update({ role, teamName: teamName || null });
    showToast('User updated!', 'success');
  } catch (_) { showToast('Update failed', 'error'); }
}

// ── CLEAR DATA ────────────────────────────────────────
async function openClearDataModal() {
  // Populate team dropdown from known teams
  const sel = document.getElementById('clear-team-select');
  sel.innerHTML = '<option value="">-- Select Team --</option>';
  const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
  teams.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
  // Also load from existing devotees
  try {
    const all = await DevoteeCache.all();
    const dbTeams = [...new Set(all.map(d => d.teamName).filter(Boolean))].sort();
    dbTeams.forEach(t => { if (!teams.includes(t)) { const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); } });
  } catch (_) {}
  // Default dates to upcoming Sunday
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
    // Find session for this date
    const sessSnap = await fdb.collection('sessions').where('sessionDate', '==', date).get();
    if (sessSnap.empty) return showToast('No session found for this date', 'error');
    const sessionId = sessSnap.docs[0].id;
    // Delete all attendance records for this session
    const attSnap = await fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get();
    const batches = chunkArray(attSnap.docs, 400);
    for (const chunk of batches) {
      const b = fdb.batch();
      chunk.forEach(d => { b.delete(d.ref); });
      await b.commit();
    }
    // Also delete calling status records for this date
    const csSnap = await fdb.collection('callingStatus').where('weekDate', '==', date).get();
    const csBatches = chunkArray(csSnap.docs, 400);
    for (const chunk of csBatches) {
      const b = fdb.batch();
      chunk.forEach(d => { b.delete(d.ref); });
      await b.commit();
    }
    // Reset lifetimeAttendance for affected devotees
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
    // Decrement lifetimeAttendance
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

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── NORMALISERS ───────────────────────────────────────
function tsToISO(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}

function toSnake(d) {
  if (!d) return null;
  return {
    id: d.id,
    name:                d.name || '',
    mobile:              d.mobile || null,
    address:             d.address || null,
    dob:                 d.dob || null,
    date_of_joining:     d.dateOfJoining || null,
    chanting_rounds:     d.chantingRounds || 0,
    kanthi:              d.kanthi || 0,
    gopi_dress:          d.gopiDress || 0,
    team_name:           d.teamName || null,
    devotee_status:      d.devoteeStatus || 'Expected to be Serious',
    facilitator:         d.facilitator || null,
    reference_by:        d.referenceBy || null,
    calling_by:          d.callingBy || null,
    lifetime_attendance: d.lifetimeAttendance || 0,
    is_active:           d.isActive !== false ? 1 : 0,
    inactivity_flag:     d.inactivityFlag ? 1 : 0,
    created_at:          tsToISO(d.createdAt),
    updated_at:          tsToISO(d.updatedAt),
    coming_status:       d.comingStatus  || null,
    calling_notes:       d.callingNotes  || null,
    attendance_id:       d.attendanceId  || null,
    // Personal details
    education:           d.education || null,
    email:               d.email || null,
    profession:          d.profession || null,
    family_favourable:   d.familyFavourable || null,
    reading:             d.reading || null,
    hearing:             d.hearing || null,
    hobbies:             d.hobbies || null,
    skills:              d.skills || null,
    tilak:               d.tilak || 0,
    is_not_interested:   d.isNotInterested || false,
    not_interested_at:   tsToISO(d.notInterestedAt),
  };
}

function toCamel(f) {
  return {
    name:              (f.name || '').trim(),
    mobile:            (f.mobile || '').trim() || null,
    address:           (f.address || '').trim() || null,
    dob:               f.dob || null,
    dateOfJoining:     f.date_of_joining || null,
    chantingRounds:    parseInt(f.chanting_rounds) || 0,
    kanthi:            parseInt(f.kanthi) || 0,
    gopiDress:         parseInt(f.gopi_dress) || 0,
    teamName:          f.team_name || null,
    devoteeStatus:     f.devotee_status || 'Expected to be Serious',
    facilitator:       (f.facilitator || '').trim() || null,
    referenceBy:       (f.reference_by || '').trim() || null,
    callingBy:         (f.calling_by || '').trim() || null,
    education:         (f.education || '').trim() || null,
    email:             (f.email || '').trim() || null,
    profession:        (f.profession || '').trim() || null,
    familyFavourable:  f.family_favourable || null,
    reading:           f.reading || null,
    hearing:           f.hearing || null,
    hobbies:           (f.hobbies || '').trim() || null,
    skills:            (f.skills || '').trim() || null,
    tilak:             parseInt(f.tilak) || 0,
    isNotInterested:   f.is_not_interested || false,
    notInterestedAt:   f.not_interested_at || null,
  };
}

// ── DEVOTEE CACHE (90-second TTL) ────────────────────
const DevoteeCache = {
  raw: [], stamp: 0, TTL: 90000,
  async refresh() {
    const snap = await fdb.collection('devotees').where('isActive', '==', true).get();
    this.raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    this.raw.sort((a, b) => a.name.localeCompare(b.name));
    this.stamp = Date.now();
    return this.raw;
  },
  async all(force = false) {
    if (force || Date.now() - this.stamp > this.TTL) return this.refresh();
    return this.raw;
  },
  bust() { this.stamp = 0; }
};

// ── DB ────────────────────────────────────────────────
const DB = {

  /* DEVOTEES */
  async getDevotees(filters = {}) {
    let list = await DevoteeCache.all();
    if (filters.search) {
      const s = filters.search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(s) || (d.mobile || '').includes(s));
    }
    if (filters.team)       list = list.filter(d => d.teamName === filters.team);
    if (filters.calling_by) list = list.filter(d => d.callingBy === filters.calling_by);
    if (filters.status)     list = list.filter(d => d.devoteeStatus === filters.status);
    return list.map(toSnake);
  },

  async getDevotee(id) {
    const doc = await fdb.collection('devotees').doc(id).get();
    if (!doc.exists) return null;
    return toSnake({ id: doc.id, ...doc.data() });
  },

  async getCallingPersons() {
    const list = await DevoteeCache.all();
    return [...new Set(list.map(d => d.callingBy).filter(Boolean))].sort();
  },

  async createDevotee(formData) {
    const list = await DevoteeCache.all();
    const mobile = (formData.mobile || '').trim();
    if (mobile) {
      const ex = list.find(d => d.mobile === mobile);
      if (ex) throw { error: 'Duplicate', message: `Mobile already registered to ${ex.name}`, existingId: ex.id };
    }
    const name = (formData.name || '').trim();
    if (name) {
      const exn = list.find(d => d.name.trim().toLowerCase() === name.toLowerCase());
      if (exn) throw { error: 'DuplicateName', message: `Name already exists: ${exn.name}`, existingId: exn.id };
    }
    const payload = { ...toCamel(formData), lifetimeAttendance: 0, isActive: true, inactivityFlag: false, createdAt: TS(), updatedAt: TS() };
    const ref = await fdb.collection('devotees').add(payload);
    DevoteeCache.bust();
    return toSnake({ id: ref.id, ...payload });
  },

  async forceCreateDevotee(formData) {
    const payload = { ...toCamel(formData), lifetimeAttendance: 0, isActive: true, inactivityFlag: false, createdAt: TS(), updatedAt: TS() };
    const ref = await fdb.collection('devotees').add(payload);
    DevoteeCache.bust();
    return toSnake({ id: ref.id, ...payload });
  },

  async updateDevotee(id, formData) {
    const doc = await fdb.collection('devotees').doc(id).get();
    if (!doc.exists) throw new Error('Not found');
    const ex = doc.data();
    const updates = { ...toCamel(formData), updatedAt: TS() };
    const trackMap = { name:'name', mobile:'mobile', chantingRounds:'chanting_rounds', kanthi:'kanthi', gopiDress:'gopi_dress', teamName:'team_name', devoteeStatus:'devotee_status', facilitator:'facilitator', referenceBy:'reference_by', callingBy:'calling_by' };
    const batch = fdb.batch();
    Object.entries(trackMap).forEach(([fKey, formKey]) => {
      const nv = updates[fKey], ov = ex[fKey];
      if (nv !== undefined && String(nv ?? '') !== String(ov ?? '')) {
        batch.set(fdb.collection('profileChanges').doc(), { devoteeId: id, fieldName: formKey, oldValue: String(ov ?? ''), newValue: String(nv ?? ''), changedAt: TS(), changedBy: 'Coordinator' });
      }
    });
    batch.update(fdb.collection('devotees').doc(id), updates);
    await batch.commit();
    DevoteeCache.bust();
    return this.getDevotee(id);
  },

  async softDeleteDevotee(id) {
    await fdb.collection('devotees').doc(id).update({ isActive: false, updatedAt: TS() });
    DevoteeCache.bust();
  },

  async getProfileHistory(id) {
    const snap = await fdb.collection('profileChanges').where('devoteeId', '==', id).get();
    return snap.docs.map(d => {
      const dt = d.data();
      return { id: d.id, field_name: dt.fieldName, old_value: dt.oldValue, new_value: dt.newValue, changed_at: tsToISO(dt.changedAt), changed_by: dt.changedBy };
    }).sort((a, b) => (b.changed_at || '').localeCompare(a.changed_at || ''));
  },

  async importDevotees(rows, mode = 'add') {
    let imported = 0, updated = 0, skipped = [], errors = [];
    const list = await DevoteeCache.all();
    const mobileMap = {}, nameMap = {};
    list.forEach(d => {
      if (d.mobile) mobileMap[d.mobile] = { id: d.id, name: d.name };
      nameMap[d.name.toLowerCase()] = { id: d.id, name: d.name };
    });

    for (let ci = 0; ci < rows.length; ci += 400) {
      const chunk = rows.slice(ci, ci + 400);
      const batch = fdb.batch(); let any = false;
      chunk.forEach((row, i) => {
        const rowNum = ci + i + 2;
        try {
          const name   = importCol(row, ['Name','name','Full Name','Devotee Name','NAAM']).trim();
          const mobile = importCol(row, ['Mobile','Contact','Phone','Mobile Number','Mobile (10 digits)','Contact Number','Mob','Ph No','Ph.No','mob no','contact']).replace(/\D/g,'').slice(0,10);
          if (!name) { skipped.push({ row: rowNum, name: '(blank)', mobile: mobile || '', reason: 'Name is empty' }); return; }

          const payload = {
            name,
            mobile:           mobile || null,
            address:          importCol(row, ['Address','address','Addr','ADDRESS']) || null,
            dob:              importDate(importCol(row, ['DOB','D.O.B','Date of Birth','Birth Date','dob','D.O.B.','DOB (DD/MM/YYYY)'])) || null,
            dateOfJoining:    importDate(importCol(row, ['Date of Joining','Date Of Joining','Joining Date','DOJ','Date of joining'])) || null,
            chantingRounds:   Math.abs(parseInt(importCol(row, ['Chanting Rounds','CHANTING','Chanting','CR','chanting','Rounds','rounds','chanting rounds'])) || 0),
            kanthi:           importYN(importCol(row, ['Kanthi','kanthi','KANTHI'])),
            gopiDress:        importYN(importCol(row, ['Gopi Dress','Gopi','GOPI','gopi dress','Gopi dress'])),
            tilak:            importYN(importCol(row, ['Tilak','tilak','TILAK'])),
            teamName:         importCol(row, ['Team','Team Wise','Team Name','TEAM','Group','team','Team wise','Teamwise']) || null,
            devoteeStatus:    importStatus(importCol(row, ['Status','Devotee Status','Dev Status','status','ETS','devotee status'])),
            facilitator:      importCol(row, ['Facilitator','facilitator','Faciltr']) || null,
            referenceBy:      importCol(row, ['Reference','Ref','Reference By','Referred By','Ref-2','ref','Ref 2','reference']) || null,
            callingBy:        importCol(row, ['Calling By','Called By','Caller','Calling by','calling by','CallingBy']) || null,
            education:        importCol(row, ['Education','education','EDUCATION']) || null,
            email:            importCol(row, ['Email','E-Mail','email','E Mail','e-mail','EMAIL']) || null,
            profession:       importCol(row, ['Profession','Occupation','profession','PROFESSION']) || null,
            familyFavourable: importCol(row, ['Family Favourable','Family Favorable','Family','family favourable','Family Favourable?']) || null,
            reading:          importCol(row, ['Reading','reading','READING']) || null,
            hearing:          importCol(row, ['Hearing','hearing','HEARING']) || null,
            hobbies:          importCol(row, ['Hobbies','hobbies','Hobby','HOBBIES']) || null,
            skills:           importCol(row, ['Skills','skills','Skill','SKILLS']) || null,
            isActive: true, inactivityFlag: false, updatedAt: TS(),
          };

          const byMobile = mobile && mobileMap[mobile];
          const byName   = nameMap[name.toLowerCase()];
          const existingId = (byMobile || (mode === 'upsert' && byName))?.id || null;

          if (mode === 'upsert' && existingId) {
            batch.update(fdb.collection('devotees').doc(existingId), payload);
            updated++; any = true;
          } else if (existingId) {
            const matchedName = (byMobile || byName)?.name || '';
            const reason = byMobile
              ? `Duplicate mobile — already registered as "${matchedName}"`
              : `Duplicate name — already exists as "${matchedName}"`;
            skipped.push({ row: rowNum, name, mobile: mobile || '', reason });
          } else {
            batch.set(fdb.collection('devotees').doc(), { ...payload, lifetimeAttendance: 0, createdAt: TS() });
            if (mobile) mobileMap[mobile] = { id: 'new', name };
            nameMap[name.toLowerCase()] = { id: 'new', name };
            imported++; any = true;
          }
        } catch (e) { errors.push({ row: rowNum, name: '', mobile: '', reason: e.message }); }
      });
      if (any) await batch.commit();
    }
    DevoteeCache.bust();
    return { imported, updated, skipped, errors };
  },

  /* SESSIONS */
  async getTodaySession() {
    const sunday = getUpcomingSunday();
    const snap = await fdb.collection('sessions').where('sessionDate', '==', sunday).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, session_date: sunday };
    const ref = await fdb.collection('sessions').add({ sessionDate: sunday, createdAt: TS() });
    return { id: ref.id, session_date: sunday };
  },

  async getOrCreateSession(dateStr) {
    const snap = await fdb.collection('sessions').where('sessionDate', '==', dateStr).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, session_date: dateStr };
    const ref = await fdb.collection('sessions').add({ sessionDate: dateStr, createdAt: TS() });
    return { id: ref.id, session_date: dateStr };
  },

  async getSessions() {
    const snap = await fdb.collection('sessions').orderBy('sessionDate', 'desc').limit(52).get();
    return snap.docs.map(d => ({
      id: d.id,
      session_date: d.data().sessionDate,
      topic: d.data().topic || '',
      is_cancelled: d.data().isCancelled || false,
    }));
  },

  async configureSunday(sessionId, { topic, isCancelled }) {
    await fdb.collection('sessions').doc(sessionId).update({ topic: topic || '', isCancelled: !!isCancelled, updatedAt: TS() });
  },

  async getSheetData(yearStart, yearEnd) {
    const snap = await fdb.collection('sessions')
      .where('sessionDate', '>=', yearStart)
      .where('sessionDate', '<=', yearEnd)
      .orderBy('sessionDate', 'asc').get();
    const sessions = snap.docs.map(d => ({
      id: d.id, sessionDate: d.data().sessionDate,
      topic: d.data().topic || '', isCancelled: d.data().isCancelled || false,
    }));
    if (!sessions.length) return { sessions: [], devotees: [], attMap: {}, csMap: {} };
    const devotees = await DevoteeCache.all();
    const sessionIds = sessions.map(s => s.id);
    const weekDates  = sessions.map(s => s.sessionDate);
    const attMap = {}, csMap = {};
    // Attendance in batches of 10
    for (let i = 0; i < sessionIds.length; i += 10) {
      const batch = sessionIds.slice(i, i + 10);
      const aSnap = await fdb.collection('attendanceRecords').where('sessionId', 'in', batch).get();
      aSnap.docs.forEach(d => {
        const { sessionId: sid, devoteeId: did } = d.data();
        if (!attMap[sid]) attMap[sid] = new Set();
        attMap[sid].add(did);
      });
    }
    // Calling status in batches of 10
    for (let i = 0; i < weekDates.length; i += 10) {
      const batch = weekDates.slice(i, i + 10);
      const cSnap = await fdb.collection('callingStatus').where('weekDate', 'in', batch).get();
      cSnap.docs.forEach(d => {
        const { weekDate, devoteeId: did, comingStatus } = d.data();
        if (!csMap[weekDate]) csMap[weekDate] = {};
        csMap[weekDate][did] = comingStatus;
      });
    }
    return { sessions, devotees, attMap, csMap };
  },

  async getSessionStats(sessionId) {
    const week = getCurrentSunday();
    const [cs, at] = await Promise.all([
      fdb.collection('callingStatus').where('weekDate', '==', week).get(),
      fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get()
    ]);
    const target  = cs.docs.filter(d => d.data().comingStatus === 'Yes').length;
    const present = at.size;
    const newD    = at.docs.filter(d => d.data().isNewDevotee).length;
    return { target, present, newDevotees: newD, totalPresent: present };
  },

  /* ATTENDANCE */
  async getAttendanceCandidates(sessionId, search = '') {
    const week = getCurrentSunday();
    const [rawDevotees, csSnap, atSnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate', '==', week).get(),
      fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get()
    ]);
    const csMap = {};
    csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = d.data(); });
    const presentSet = new Set(atSnap.docs.map(d => d.data().devoteeId));
    let list = rawDevotees.filter(d => {
      const cs = csMap[d.id];
      return !cs || !['Shifted', 'Not Interested'].includes(cs.comingStatus);
    });
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(s) || (d.mobile || '').includes(s));
    }
    return list.map(d => ({
      ...toSnake(d),
      coming_status: csMap[d.id]?.comingStatus || null,
      attendance_id: presentSet.has(d.id) ? d.id : null,
    }));
  },

  async markPresent(sessionId, devotee, isNewDevotee = false) {
    const snap = await fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).where('devoteeId', '==', devotee.id).limit(1).get();
    if (!snap.empty) throw { status: 409, error: 'Already marked present' };
    await fdb.collection('attendanceRecords').add({
      sessionId, devoteeId: devotee.id,
      devoteeName: devotee.name, teamName: devotee.team_name || null,
      mobile: devotee.mobile || null, referenceBy: devotee.reference_by || null,
      callingBy: devotee.calling_by || null, chantingRounds: devotee.chanting_rounds || 0,
      dob: devotee.dob || null, devoteeStatus: devotee.devotee_status || null,
      isNewDevotee, markedAt: TS()
    });
    await fdb.collection('devotees').doc(devotee.id).update({ lifetimeAttendance: INC(1), inactivityFlag: false, updatedAt: TS() });
    DevoteeCache.bust();
  },

  async undoPresent(sessionId, devoteeId) {
    const snap = await fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).where('devoteeId', '==', devoteeId).limit(1).get();
    if (snap.empty) return;
    await snap.docs[0].ref.delete();
    await fdb.collection('devotees').doc(devoteeId).update({ lifetimeAttendance: INC(-1), updatedAt: TS() });
    DevoteeCache.bust();
  },

  async getSessionAttendance(sessionId) {
    const snap = await fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get();
    return snap.docs.map(d => {
      const dt = d.data();
      return { id: d.id, name: dt.devoteeName, mobile: dt.mobile, chanting_rounds: dt.chantingRounds, team_name: dt.teamName, calling_by: dt.callingBy, is_new_devotee: dt.isNewDevotee ? 1 : 0, marked_at: tsToISO(dt.markedAt) };
    }).sort((a, b) => (b.marked_at || '').localeCompare(a.marked_at || ''));
  },

  /* CALLING */
  async getCallingStatus(weekDate) {
    const [raw, csSnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate', '==', weekDate).get()
    ]);
    const csMap = {};
    csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = { id: d.id, ...d.data() }; });
    // Filter out devotees with no callingBy assigned, and those marked Not Interested
    const filtered = raw.filter(d => d.callingBy && d.callingBy.trim() && !d.isNotInterested);
    return filtered.map(d => ({
      ...toSnake(d),
      coming_status: csMap[d.id]?.comingStatus || null,
      calling_notes: csMap[d.id]?.callingNotes || null,
      calling_id:    csMap[d.id]?.id            || null,
    }));
  },

  async getNotInterestedDevotees() {
    const snap = await fdb.collection('devotees').where('isNotInterested', '==', true).get();
    return snap.docs.map(d => toSnake({ id: d.id, ...d.data() }));
  },

  async markNotInterested(id) {
    const updates = { isNotInterested: true, notInterestedAt: TS(), updatedAt: TS() };
    const batch = fdb.batch();
    batch.update(fdb.collection('devotees').doc(id), updates);
    batch.set(fdb.collection('profileChanges').doc(), {
      devoteeId: id, fieldName: 'is_not_interested',
      oldValue: 'false', newValue: 'true',
      changedAt: TS(), changedBy: AppState.userName || 'Admin'
    });
    await batch.commit();
    DevoteeCache.bust();
  },

  async updateCallingStatus(devoteeId, weekDate, data) {
    const snap = await fdb.collection('callingStatus').where('devoteeId', '==', devoteeId).where('weekDate', '==', weekDate).limit(1).get();
    const payload = { devoteeId, weekDate, comingStatus: data.coming_status || 'Maybe', callingNotes: data.calling_notes || null, updatedAt: TS() };
    if (snap.empty) await fdb.collection('callingStatus').add(payload);
    else await snap.docs[0].ref.update(payload);
  },

  /* REPORTS */
  async getAttendanceReport(sessionId) {
    return this.getSessionAttendance(sessionId);
  },

  async getTeamsReport(weekDate, sessionId) {
    const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
    const raw = await DevoteeCache.all();
    const [csSnap, atSnap] = await Promise.all([
      fdb.collection('callingStatus').where('weekDate', '==', weekDate).get(),
      sessionId ? fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get() : Promise.resolve({ docs: [] })
    ]);
    const csMap = {};
    csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = d.data(); });
    const presentSet = new Set(atSnap.docs.map(d => d.data().devoteeId));
    return teams.map(team => {
      const td = raw.filter(d => d.teamName === team);
      const callingList = td.filter(d => { const cs = csMap[d.id]; return !cs || !['Shifted','Not Interested'].includes(cs.comingStatus); });
      const target = td.filter(d => csMap[d.id]?.comingStatus === 'Yes');
      const actual = td.filter(d => presentSet.has(d.id));
      return { team, total: td.length, callingList: callingList.length, target: target.length, actualPresent: actual.length, percentage: target.length > 0 ? Math.round(actual.length / target.length * 100) : 0 };
    });
  },

  async getSeriousReport(weekDate, sessionId) {
    const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
    const statuses = ['Expected to be Serious','Serious','Most Serious'];
    const raw = await DevoteeCache.all();
    const [csSnap, atSnap] = await Promise.all([
      fdb.collection('callingStatus').where('weekDate', '==', weekDate).get(),
      sessionId ? fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get() : Promise.resolve({ docs: [] })
    ]);
    const calledYes = new Set(csSnap.docs.filter(d => d.data().comingStatus === 'Yes').map(d => d.data().devoteeId));
    const presentSet = new Set(atSnap.docs.map(d => d.data().devoteeId));
    const data = [];
    teams.forEach(team => statuses.forEach(status => {
      const cohort = raw.filter(d => d.teamName === team && d.devoteeStatus === status);
      data.push({ team, status, promised: cohort.filter(d => calledYes.has(d.id)).length, arrived: cohort.filter(d => presentSet.has(d.id)).length });
    }));
    return data;
  },

  async getTrends(period = 'weekly', team = '') {
    const snap = await fdb.collection('sessions').orderBy('sessionDate', 'asc').limit(24).get();
    const sessions = snap.docs.map(d => ({ id: d.id, sessionDate: d.data().sessionDate }));
    const results = [];
    for (const s of sessions) {
      let q = fdb.collection('attendanceRecords').where('sessionId', '==', s.id);
      if (team) q = q.where('teamName', '==', team);
      const aSnap = await q.get();
      const label = period === 'monthly' ? s.sessionDate.slice(0, 7) : s.sessionDate;
      const ex = results.find(r => r.period === label);
      if (ex) ex.count += aSnap.size; else results.push({ period: label, count: aSnap.size });
    }
    return results;
  },

  /* CARE */
  async getCareAbsent() {
    const sSnap = await fdb.collection('sessions').orderBy('sessionDate', 'desc').limit(5).get();
    const sessions = sSnap.docs.map(d => ({ id: d.id }));
    if (sessions.length < 2) return { absentThisWeek: [], absentPast2Weeks: [] };
    const [latest, ...prev] = sessions;
    const raw = await DevoteeCache.all();
    const allIds = sessions.map(s => s.id);
    const attSnaps = await Promise.all(allIds.map(sid => fdb.collection('attendanceRecords').where('sessionId', '==', sid).get()));
    const attMap = {};
    attSnaps.forEach((snap, i) => snap.docs.forEach(d => { const did = d.data().devoteeId; if (!attMap[did]) attMap[did] = new Set(); attMap[did].add(allIds[i]); }));
    const absentThisWeek = [], absentPast2Weeks = [];
    raw.forEach(d => {
      const att = attMap[d.id] || new Set();
      if (att.has(latest.id)) return;
      if (!prev.slice(0, 4).some(s => att.has(s.id))) return;
      (prev.slice(0, 2).every(s => !att.has(s.id)) ? absentPast2Weeks : absentThisWeek).push(toSnake(d));
    });
    return { absentThisWeek, absentPast2Weeks };
  },

  async getCareNewcomers() {
    const snap = await fdb.collection('sessions').orderBy('sessionDate', 'desc').limit(2).get();
    if (snap.size < 2) return [];
    const [latest, prev] = snap.docs.map(d => d.id);
    const [pSnap, lSnap] = await Promise.all([
      fdb.collection('attendanceRecords').where('sessionId', '==', prev).get(),
      fdb.collection('attendanceRecords').where('sessionId', '==', latest).get()
    ]);
    const prevNew   = new Set(pSnap.docs.filter(d => d.data().isNewDevotee).map(d => d.data().devoteeId));
    const latestAll = new Set(lSnap.docs.map(d => d.data().devoteeId));
    const ids = [...prevNew].filter(id => latestAll.has(id));
    const raw = await DevoteeCache.all();
    return raw.filter(d => ids.includes(d.id)).map(toSnake);
  },

  async getCareBirthdays() {
    const raw = await DevoteeCache.all();
    const today = new Date();
    const mds = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      mds.add(`${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    return raw.filter(d => d.dob && mds.has(d.dob.slice(5))).map(toSnake);
  },

  async getCareInactive() {
    const sSnap = await fdb.collection('sessions').orderBy('sessionDate', 'desc').limit(3).get();
    if (sSnap.size >= 3) {
      const sids = sSnap.docs.map(d => d.id);
      const attSnaps = await Promise.all(sids.map(sid => fdb.collection('attendanceRecords').where('sessionId', '==', sid).get()));
      const attendedSet = new Set();
      attSnaps.forEach(s => s.docs.forEach(d => attendedSet.add(d.data().devoteeId)));
      const raw = await DevoteeCache.all();
      const batch = fdb.batch(); let any = false;
      raw.forEach(d => {
        const should = !attendedSet.has(d.id);
        if (should !== !!d.inactivityFlag) { batch.update(fdb.collection('devotees').doc(d.id), { inactivityFlag: should }); any = true; }
      });
      if (any) { await batch.commit(); DevoteeCache.bust(); }
    }
    const raw = await DevoteeCache.all(true);
    return raw.filter(d => d.inactivityFlag).map(toSnake);
  },

  /* EVENTS */
  async getEvents() {
    const snap = await fdb.collection('events').get();
    return snap.docs.map(d => {
      const dt = d.data();
      return { id: d.id, event_name: dt.eventName, event_date: dt.eventDate || null, description: dt.description || null };
    }).sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
  },

  async createEvent(data) {
    const ref = await fdb.collection('events').add({ eventName: data.event_name.trim(), eventDate: data.event_date || null, description: data.description?.trim() || null, createdAt: TS() });
    return { id: ref.id, event_name: data.event_name, event_date: data.event_date };
  },

  async updateEvent(id, data) {
    await fdb.collection('events').doc(id).update({ eventName: data.event_name.trim(), eventDate: data.event_date || null, description: data.description?.trim() || null });
  },

  async deleteEvent(id) {
    const snap = await fdb.collection('eventDevotees').where('eventId', '==', id).get();
    const batch = fdb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(fdb.collection('events').doc(id));
    await batch.commit();
  },

  async getEventDevotees(eventId) {
    const snap = await fdb.collection('eventDevotees').where('eventId', '==', eventId).get();
    return snap.docs.map(d => {
      const dt = d.data();
      return { id: d.id, devotee_id: dt.devoteeId, name: dt.devoteeName, mobile: dt.mobile, team_name: dt.teamName };
    }).sort((a, b) => a.name.localeCompare(b.name));
  },

  async addEventDevotee(eventId, devotee) {
    const snap = await fdb.collection('eventDevotees').where('eventId', '==', eventId).where('devoteeId', '==', devotee.id).limit(1).get();
    if (!snap.empty) throw { error: 'Already added' };
    await fdb.collection('eventDevotees').add({ eventId, devoteeId: devotee.id, devoteeName: devotee.name, teamName: devotee.team_name || null, mobile: devotee.mobile || null, addedAt: TS() });
  },

  async removeEventDevotee(eventId, devoteeId) {
    const snap = await fdb.collection('eventDevotees').where('eventId', '==', eventId).where('devoteeId', '==', devoteeId).limit(1).get();
    if (!snap.empty) await snap.docs[0].ref.delete();
  },
};

// ── IMPORT HELPERS ────────────────────────────────────
function importCol(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row).find(k => k.toString().trim().toLowerCase() === alias.toLowerCase());
    if (key !== undefined && row[key] !== undefined && row[key] !== null) {
      const v = row[key].toString().trim();
      if (v) return v;
    }
  }
  return '';
}

function importDate(val) {
  if (!val) return null;
  const s = val.toString().trim();
  if (!s || s === '0') return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial number (e.g. 36839)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // MM/DD/YYYY (US format)
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return s;
}

function importYN(val) {
  return ['yes','y','1','true','हाँ','ha'].includes((val || '').toLowerCase()) ? 1 : 0;
}

function importStatus(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'ets' || v.includes('expected')) return 'Expected to be Serious';
  if (v === 'ms' || v.includes('most')) return 'Most Serious';
  if (v === 's' || v === 'serious') return 'Serious';
  return val || 'Expected to be Serious';
}

// ── EXCEL HELPER ──────────────────────────────────────
function downloadExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

// ══════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════
function getToday()         { return new Date().toISOString().split('T')[0]; }
function getCurrentSunday() {
  const now = new Date(), day = now.getDay();
  const sun = new Date(now); sun.setDate(now.getDate() - day);
  return sun.toISOString().split('T')[0];
}
function getUpcomingSunday() {
  const now = new Date(), day = now.getDay(); // 0=Sun
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const sun = new Date(now); sun.setDate(now.getDate() + daysUntilSunday);
  return sun.toISOString().split('T')[0];
}
function snapToSunday(dateStr) {
  // Given a YYYY-MM-DD, return the nearest Sunday (same day if already Sunday, else next Sunday)
  const d = new Date(dateStr + 'T00:00:00'), day = d.getDay();
  if (day === 0) return dateStr;
  d.setDate(d.getDate() + (7 - day));
  return d.toISOString().split('T')[0];
}
function initials(name = '') { return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join(''); }
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatBirthday(dob) {
  if (!dob) return '';
  const [, m, d] = dob.split('-');
  return `${parseInt(d)} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[parseInt(m)-1]}`;
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function isBirthdayWeek(dob) {
  if (!dob) return false;
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    if (dob.slice(5) === `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`) return true;
  }
  return false;
}
function statusBadge(s) {
  if (s === 'Most Serious') return `<span class="badge badge-most-serious">${s}</span>`;
  if (s === 'Serious')      return `<span class="badge badge-serious">${s}</span>`;
  return `<span class="badge badge-expected">${s || 'Expected to be Serious'}</span>`;
}
function teamBadge(t) { return t ? `<span class="badge badge-team">${t}</span>` : ''; }
function contactIcons(mobile) {
  if (!mobile) return '';
  const c = mobile.replace(/\D/g, '');
  return `<div class="contact-icons">
    <a href="tel:${c}" class="contact-icon icon-phone" onclick="event.stopPropagation()" title="Call"><i class="fas fa-phone"></i></a>
    <a href="https://wa.me/91${c}" target="_blank" class="contact-icon icon-whatsapp" onclick="event.stopPropagation()" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
  </div>`;
}
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function openImportModal() { openModal('import-modal'); }

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Auth state handler above drives initApp()
});

async function initApp() {
  await initSession();
  const role = AppState.userRole;
  if (role !== 'serviceDevotee') {
    loadDevotees();
    loadCallingPersonsFilter();
  } else {
    loadAttendanceTab();
  }
  loadBirthdays();
  document.getElementById('report-date').value = getToday();
  initAllPickers();
  initSheetYearSelector();
}

// ── MOBILE VALIDATION ─────────────────────────────────
function validateMobile(val) {
  const cleaned = (val || '').replace(/\D/g, '');
  if (val && val.trim() && cleaned.length !== 10) return { valid: false, error: 'Mobile must be exactly 10 digits' };
  return { valid: true, cleaned: cleaned || null };
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
  setupPicker('picker-calling-by',  'f-calling-by');
  setupPicker('picker-facilitator', 'f-facilitator');
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

  // Close on outside click
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

function clearPicker(containerId, hiddenId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelector('.picker-input').value = '';
  container.querySelector('.picker-input').classList.remove('has-value');
  container.querySelector('.picker-dropdown').classList.add('hidden');
  document.getElementById(hiddenId).value = '';
}

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

    // Sync date picker to current session date
    const picker = document.getElementById('session-date-picker');
    const currentSession = AppState.sessionsCache[AppState.currentSessionId];
    if (picker && currentSession) picker.value = currentSession.session_date;

    if (AppState.currentSessionId) showSessionInfo(AppState.currentSessionId);
  } catch (_) {}
}

async function loadSessionByDate(dateStr) {
  if (!dateStr) return;
  // Snap to Sunday — sessions are always on Sundays
  const sunday = snapToSunday(dateStr);
  if (sunday !== dateStr) {
    showToast(`Snapped to Sunday: ${formatDate(sunday)}`, 'info');
    const picker = document.getElementById('session-date-picker');
    if (picker) picker.value = sunday;
  }
  try {
    const session = await DB.getOrCreateSession(sunday);
    AppState.currentSessionId = session.id;
    // Cache it
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

// ── EXPORT / IMPORT ───────────────────────────────────
async function exportAttendance() {
  if (!AppState.currentSessionId) return showToast('No session selected', 'error');
  try {
    const records = await DB.getSessionAttendance(AppState.currentSessionId);
    if (!records.length) return showToast('No attendance data', 'error');
    const rows = records.map(r => ({ Name: r.name, Mobile: r.mobile || '', 'Chanting Rounds': r.chanting_rounds, Team: r.team_name || '', 'Calling By': r.calling_by || '', Type: r.is_new_devotee ? 'New' : 'Regular' }));
    downloadExcel(rows, `attendance_${getToday()}.xlsx`);
  } catch (_) { showToast('Export failed', 'error'); }
}

// ── EXPORT CALLING LIST ───────────────────────────────
async function exportCallingList() {
  showToast('Preparing Calling List Excel…');
  try {
    const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];

    // Get last 2 completed sessions (sessionDate <= today, not cancelled, ordered desc)
    const today = getToday();
    const sessSnap = await fdb.collection('sessions')
      .where('sessionDate', '<=', today)
      .orderBy('sessionDate', 'desc')
      .limit(5)
      .get();
    const completedSessions = sessSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => !s.isCancelled)
      .slice(0, 2)
      .reverse(); // oldest first → [sess1, sess2]

    // For each session: get CS and AT records
    const csData = [], atData = [];
    for (const sess of completedSessions) {
      const [csSnap, atSnap] = await Promise.all([
        fdb.collection('callingStatus').where('weekDate', '==', sess.sessionDate).get(),
        fdb.collection('attendanceRecords').where('sessionId', '==', sess.id).get()
      ]);
      const csMap = {};
      csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = d.data().comingStatus; });
      const presentSet = new Set(atSnap.docs.map(d => d.data().devoteeId));
      csData.push(csMap);
      atData.push(presentSet);
    }

    // Get all active devotees with callingBy set AND not isNotInterested
    const allDevotees = await DevoteeCache.all();
    const activeDevotees = allDevotees.filter(d => d.callingBy && d.callingBy.trim() && !d.isNotInterested);

    // Not interested devotees
    const notInterestedDevotees = await DB.getNotInterestedDevotees();

    // FY label — dynamic
    const now = new Date();
    const fyStartYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyLabel = `Apr-${String(fyStartYear).slice(-2)} to Mar-${String(fyStartYear + 1).slice(-2)}`;

    // Column headers for CS/AT
    const s1 = completedSessions[0];
    const s2 = completedSessions[1];
    const cs1Hdr = s1 ? `CS ${sheetFmtDDMMYY(shiftDateDay(s1.sessionDate, -1))}` : 'CS (prev)';
    const at1Hdr = s1 ? `AT ${sheetFmtDDMMYY(s1.sessionDate)}` : 'AT (prev)';
    const cs2Hdr = s2 ? `CS ${sheetFmtDDMMYY(shiftDateDay(s2.sessionDate, -1))}` : 'CS (latest)';
    const at2Hdr = s2 ? `AT ${sheetFmtDDMMYY(s2.sessionDate)}` : 'AT (latest)';

    const mainHeaders = [
      'Sno', 'Name', 'Mobile Number', 'Ref-2', 'C.R', 'Active', 'Team Wise',
      'Calling By', `Attendance ${fyLabel}`,
      cs1Hdr, at1Hdr, cs2Hdr, at2Hdr, 'TOTAL'
    ];

    const wb = XLSX.utils.book_new();

    teams.forEach(team => {
      const members = activeDevotees.filter(d => d.teamName === team);
      members.sort((a, b) => (a.callingBy || '').localeCompare(b.callingBy || '') || a.name.localeCompare(b.name));

      const rows = members.map((d, i) => {
        const cs1 = s1 ? (csData[0]?.[d.id] ? csLabel(csData[0][d.id]) : '') : '';
        const at1 = s1 ? (atData[0]?.has(d.id) ? 'P' : '') : '';
        const cs2 = s2 ? (csData[1]?.[d.id] ? csLabel(csData[1][d.id]) : '') : '';
        const at2 = s2 ? (atData[1]?.has(d.id) ? 'P' : '') : '';
        return [
          i + 1, d.name, d.mobile || '', d.referenceBy || '',
          d.chantingRounds || 0, d.isActive !== false ? 'Active' : '',
          d.teamName || '', d.callingBy || '',
          d.lifetimeAttendance || 0,
          cs1, at1, cs2, at2,
          d.lifetimeAttendance || 0
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([mainHeaders, ...rows]);
      ws['!cols'] = [
        { wch: 5 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 5 },
        { wch: 8 }, { wch: 14 }, { wch: 20 }, { wch: 22 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, team.slice(0, 31));
    });

    // Not Interested sheet
    const niHeaders = ['Sno', 'Name', 'Mobile Number', 'Ref-2', 'C.R', 'Team Wise', 'Calling By', 'Date of Joining', 'Moved to Not Interested On', 'Lifetime Attendance'];
    const niRows = notInterestedDevotees.map((d, i) => [
      i + 1, d.name, d.mobile || '', d.reference_by || '',
      d.chanting_rounds || 0, d.team_name || '', d.calling_by || '',
      d.date_of_joining || '',
      d.not_interested_at ? new Date(d.not_interested_at).toLocaleDateString('en-IN') : '',
      d.lifetime_attendance || 0
    ]);
    const wsNI = XLSX.utils.aoa_to_sheet([niHeaders, ...niRows]);
    wsNI['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 5 },
      { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, wsNI, 'Not Interested');

    XLSX.writeFile(wb, `calling_list_${getToday()}.xlsx`);
    showToast('Calling list exported!', 'success');
  } catch (e) {
    console.error('exportCallingList error', e);
    showToast('Export failed: ' + (e.message || 'Unknown error'), 'error');
  }
}

// ── ATTENDANCE SUB-TAB ────────────────────────────────
function switchAttTab(tab, btn) {
  // Scope to attendance tab only (not calling sub-tabs)
  document.querySelectorAll('#tab-attendance .att-sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.att-sub-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('att-panel-' + tab).classList.add('active');
  if (tab === 'sheet') loadAttendanceSheet();
}

// ── SUNDAY CONFIG ─────────────────────────────────────
function openSundayConfig() {
  if (!AppState.currentSessionId) return showToast('Select a session first', 'error');
  const s = AppState.sessionsCache?.[AppState.currentSessionId];
  document.getElementById('config-session-date').value = s ? formatDate(s.session_date) : '';
  document.getElementById('config-topic').value = s?.topic || '';
  document.getElementById('config-cancelled').checked = s?.is_cancelled || false;
  openModal('sunday-config-modal');
}

async function saveSundayConfig() {
  if (!AppState.currentSessionId) return;
  const topic     = document.getElementById('config-topic').value.trim();
  const cancelled = document.getElementById('config-cancelled').checked;
  try {
    await DB.configureSunday(AppState.currentSessionId, { topic, isCancelled: cancelled });
    showToast('Sunday class configured!', 'success');
    closeModal('sunday-config-modal');
    await loadSessionSelector();
  } catch (_) { showToast('Save failed', 'error'); }
}

// ── ATTENDANCE SHEET ──────────────────────────────────
function getFYYears() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const fyStart = m >= 4 ? y : y - 1;
  const years = [];
  for (let i = 0; i <= 3; i++) {
    const s = fyStart - i;
    years.push({ label: `FY ${s}-${String(s + 1).slice(-2)}`, start: `${s}-04-01`, end: `${s + 1}-03-31` });
  }
  return years;
}

function initSheetYearSelector() {
  const sel = document.getElementById('sheet-year');
  if (!sel || sel.options.length > 0) return;
  getFYYears().forEach((y, i) => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ start: y.start, end: y.end });
    opt.textContent = y.label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function loadAttendanceSheet() {
  initSheetYearSelector();
  const wrap = document.getElementById('attendance-sheet-wrap');
  const yearVal = document.getElementById('sheet-year').value;
  const teamFilter = document.getElementById('sheet-team').value;
  if (!yearVal) return;
  const { start, end } = JSON.parse(yearVal);
  wrap.innerHTML = '<div class="loading" style="padding:2rem"><i class="fas fa-spinner"></i> Loading attendance data…</div>';
  try {
    const { sessions, devotees, attMap, csMap } = await DB.getSheetData(start, end);
    if (!sessions.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-table"></i><p>No sessions found for this year</p></div>';
      return;
    }
    wrap.innerHTML = buildSheetTable(devotees, sessions, attMap, csMap, teamFilter);
  } catch (e) {
    console.error('Sheet error', e);
    wrap.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load sheet data</p></div>';
  }
}

function buildSheetTable(devotees, sessions, attMap, csMap, teamFilter) {
  let rows = [...devotees];
  if (teamFilter) rows = rows.filter(d => d.teamName === teamFilter);
  rows.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || a.name.localeCompare(b.name));

  // Header row 1
  let h1 = `<th rowspan="2" class="sh-header sh-sno">Sno</th>
    <th rowspan="2" class="sh-header" style="min-width:120px">Name</th>
    <th rowspan="2" class="sh-header">Mobile</th>
    <th rowspan="2" class="sh-header">Reference</th>
    <th rowspan="2" class="sh-header">CR</th>
    <th rowspan="2" class="sh-header">Active</th>
    <th rowspan="2" class="sh-header">Team</th>
    <th rowspan="2" class="sh-header">Calling By</th>`;
  sessions.forEach(s => {
    const cls = s.isCancelled ? 'sh-header sh-cancelled' : 'sh-header';
    const dateLabel = sheetFmtDate(s.sessionDate);
    const topicLine = s.topic ? `<small>${s.topic.length > 18 ? s.topic.slice(0, 18) + '…' : s.topic}</small>` : '';
    const cancelLine = s.isCancelled ? `<small>CANCELLED</small>` : '';
    h1 += `<th colspan="2" class="${cls}">${dateLabel}${topicLine}${cancelLine}</th>`;
  });
  h1 += `<th rowspan="2" class="sh-header sh-total">TOTAL</th>`;

  // Header row 2 — CS / AT sub-cols
  let h2 = '';
  sessions.forEach(s => {
    const sat = sheetFmtShort(shiftDateDay(s.sessionDate, -1));
    const sun = sheetFmtShort(s.sessionDate);
    h2 += `<th class="sh-sub-header">CS<small>${sat}</small></th><th class="sh-sub-header">AT<small>${sun}</small></th>`;
  });

  // Body rows
  const bodyRows = rows.map((d, i) => {
    const isActive = d.isActive !== false;
    const rowBg = isActive ? 'background:#fffde7' : 'background:#ffebee';
    let cells = `<td class="sh-cell sh-center sh-sno">${i + 1}</td>
      <td class="sh-cell sh-name">${d.name}</td>
      <td class="sh-cell sh-center">${d.mobile || '—'}</td>
      <td class="sh-cell">${d.referenceBy || ''}</td>
      <td class="sh-cell sh-center">${d.chantingRounds || 0}</td>
      <td class="sh-cell sh-center">${isActive ? '<span class="sh-active">Active</span>' : ''}</td>
      <td class="sh-cell">${d.teamName || ''}</td>
      <td class="sh-cell">${d.callingBy || ''}</td>`;
    sessions.forEach(s => {
      if (s.isCancelled) {
        cells += `<td colspan="2" class="sh-cell sh-cancelled-cell sh-center">—</td>`;
      } else {
        const cs = csMap[s.sessionDate]?.[d.id] || null;
        const at = attMap[s.id]?.has(d.id) || false;
        cells += `<td class="sh-cell sh-center" style="${csColor(cs)}">${csLabel(cs)}</td>`;
        cells += `<td class="sh-cell sh-center" style="${at ? 'background:#a5d6a7;font-weight:700' : ''}">${at ? 'P' : ''}</td>`;
      }
    });
    const total = d.lifetimeAttendance || 0;
    const totalBg = total >= 30 ? 'background:#b2ebf2;font-weight:700' : total >= 15 ? 'background:#c8e6c9;font-weight:600' : total >= 5 ? 'background:#fff9c4' : '';
    cells += `<td class="sh-cell sh-center" style="${totalBg}">${total}</td>`;
    return `<tr style="${rowBg}">${cells}</tr>`;
  }).join('');

  return `<table class="attendance-sheet-table">
    <thead><tr>${h1}</tr><tr>${h2}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

function shiftDateDay(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function sheetFmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]} ${y.slice(-2)}`;
}
function sheetFmtShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y.slice(-2)}`;
}
// DD.MM.YY format for calling list export column headers
function sheetFmtDDMMYY(dateStr) {
  return sheetFmtShort(dateStr);
}
function csLabel(status) {
  return { Yes: 'Coming', No: 'No', Maybe: 'Maybe', Shifted: 'Shifted', 'Not Interested': 'N/I' }[status] || '';
}
function csColor(status) {
  if (!status) return '';
  if (status === 'Yes')             return 'background:#c8e6c9';
  if (status === 'Maybe')           return 'background:#fff9c4';
  if (status === 'No')              return 'background:#ffcdd2';
  if (status === 'Shifted')         return 'background:#ffe0b2';
  if (status === 'Not Interested')  return 'background:#ffccbc';
  return '';
}

async function exportSheetExcel() {
  initSheetYearSelector();
  const yearVal = document.getElementById('sheet-year').value;
  const teamFilter = document.getElementById('sheet-team').value;
  if (!yearVal) return showToast('Select a year first', 'error');
  const { start, end } = JSON.parse(yearVal);
  showToast('Preparing Excel…');
  try {
    const { sessions, devotees, attMap, csMap } = await DB.getSheetData(start, end);
    let rows = [...devotees];
    if (teamFilter) rows = rows.filter(d => d.teamName === teamFilter);
    rows.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || a.name.localeCompare(b.name));

    // Build header rows
    const fixedHdrs = ['Sno', 'Name', 'Mobile', 'Reference', 'CR', 'Active', 'Team', 'Calling By'];
    const headerRow1 = [...fixedHdrs];
    const headerRow2 = [...fixedHdrs.map(() => '')];
    sessions.forEach(s => {
      const label = sheetFmtDate(s.sessionDate) + (s.isCancelled ? ' [CANCELLED]' : '') + (s.topic ? ` – ${s.topic}` : '');
      headerRow1.push(label, '');
      headerRow2.push(`CS (${sheetFmtShort(shiftDateDay(s.sessionDate, -1))})`, `AT (${sheetFmtShort(s.sessionDate)})`);
    });
    headerRow1.push('TOTAL'); headerRow2.push('');

    const dataRows = rows.map((d, i) => {
      const base = [i + 1, d.name, d.mobile || '', d.referenceBy || '', d.chantingRounds || 0, d.isActive !== false ? 'Active' : '', d.teamName || '', d.callingBy || ''];
      sessions.forEach(s => {
        if (s.isCancelled) { base.push('—', '—'); return; }
        base.push(csLabel(csMap[s.sessionDate]?.[d.id] || null), attMap[s.id]?.has(d.id) ? 'P' : '');
      });
      base.push(d.lifetimeAttendance || 0);
      return base;
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Sheet');
    const yearLabel = JSON.parse(yearVal).start.slice(0, 4);
    XLSX.writeFile(wb, `attendance_sheet_${yearLabel}.xlsx`);
    showToast('Excel downloaded!', 'success');
  } catch (e) { console.error(e); showToast('Export failed', 'error'); }
}

async function exportDevoteeDatabase() {
  showToast('Building database export…');
  try {
    const allDevotees = await DevoteeCache.all();
    const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];

    const levels = [
      { label: 'Level 1 – (0–4 Rounds)  Well Wishers  (Yet to start chanting)', min: 0, max: 4 },
      { label: 'Level 2 – (5–8 Rounds)  Beginners  (Starting their journey)', min: 5, max: 8 },
      { label: 'Level 3 – (9–15 Rounds)  Advancing  (Growing in practice)', min: 9, max: 15 },
      { label: 'Level 4 – (16+ Rounds)  Committed Chanters  (Steady practitioners)', min: 16, max: 999 },
    ];

    const cols = [
      'Sr. No.', 'Name', 'Contact', 'Date of Joining', 'D.O.B',
      'Devotee Status', 'Address', 'E-Mail', 'Education', 'Profession',
      'Facilitator', 'Chanting', 'Family Favourable',
      'Hobbies', 'Skills', 'Reading', 'Hearing',
      'Gopi Dress', 'Tilak', 'Kanthi',
    ];

    const wb = XLSX.utils.book_new();

    teams.forEach(team => {
      const teamDevotees = allDevotees.filter(d => d.teamName === team && d.isActive !== false);
      if (!teamDevotees.length) return;

      const aoa = []; // array of arrays for this sheet
      const merges = [];
      let rowIdx = 0;

      levels.forEach(lvl => {
        const members = teamDevotees.filter(d => {
          const cr = d.chantingRounds || 0;
          return cr >= lvl.min && cr <= lvl.max;
        });

        // Level header (merged across all cols)
        aoa.push([lvl.label, ...Array(cols.length - 1).fill('')]);
        merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: cols.length - 1 } });
        rowIdx++;

        // Column headers
        aoa.push([...cols]);
        rowIdx++;

        // Data rows
        if (members.length === 0) {
          aoa.push(['—', ...Array(cols.length - 1).fill('')]);
          rowIdx++;
        } else {
          members.sort((a, b) => a.name.localeCompare(b.name));
          members.forEach((d, i) => {
            aoa.push([
              i + 1,
              d.name,
              d.mobile || '',
              d.dateOfJoining || '',
              d.dob || '',
              d.devoteeStatus || '',
              d.address || '',
              d.email || '',
              d.education || '',
              d.profession || '',
              d.facilitator || '',
              d.chantingRounds || 0,
              d.familyFavourable || '',
              d.hobbies || '',
              d.skills || '',
              d.reading || '',
              d.hearing || '',
              d.gopiDress ? 'Yes' : 'No',
              d.tilak ? 'Yes' : 'No',
              d.kanthi ? 'Yes' : 'No',
            ]);
            rowIdx++;
          });
        }

        // Blank spacer row between levels
        aoa.push(Array(cols.length).fill(''));
        rowIdx++;
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = merges;
      ws['!cols'] = [
        { wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 13 },
        { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
        { wch: 20 }, { wch: 10 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
        { wch: 11 }, { wch: 9 }, { wch: 9 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, team.slice(0, 31));
    });

    // All teams combined sheet
    const aoaAll = [];
    const mergesAll = [];
    let rAll = 0;
    aoaAll.push(['ALL TEAMS – Devotee Database', ...Array(cols.length - 1).fill('')]);
    mergesAll.push({ s: { r: rAll, c: 0 }, e: { r: rAll, c: cols.length - 1 } });
    rAll++;
    aoaAll.push(Array(cols.length).fill(''));
    rAll++;

    teams.forEach(team => {
      const teamDevotees = allDevotees.filter(d => d.teamName === team && d.isActive !== false);
      if (!teamDevotees.length) return;

      // Team header
      aoaAll.push([`── ${team.toUpperCase()} ──`, ...Array(cols.length - 1).fill('')]);
      mergesAll.push({ s: { r: rAll, c: 0 }, e: { r: rAll, c: cols.length - 1 } });
      rAll++;

      levels.forEach(lvl => {
        const members = teamDevotees.filter(d => {
          const cr = d.chantingRounds || 0; return cr >= lvl.min && cr <= lvl.max;
        });
        if (!members.length) return;

        aoaAll.push([lvl.label, ...Array(cols.length - 1).fill('')]);
        mergesAll.push({ s: { r: rAll, c: 0 }, e: { r: rAll, c: cols.length - 1 } });
        rAll++;
        aoaAll.push([...cols]); rAll++;

        members.sort((a, b) => a.name.localeCompare(b.name));
        members.forEach((d, i) => {
          aoaAll.push([
            i + 1, d.name, d.mobile || '', d.dateOfJoining || '', d.dob || '',
            d.devoteeStatus || '', d.address || '', d.email || '',
            d.education || '', d.profession || '', d.facilitator || '',
            d.chantingRounds || 0, d.familyFavourable || '',
            d.hobbies || '', d.skills || '', d.reading || '', d.hearing || '',
            d.gopiDress ? 'Yes' : 'No', d.tilak ? 'Yes' : 'No', d.kanthi ? 'Yes' : 'No',
          ]);
          rAll++;
        });
        aoaAll.push(Array(cols.length).fill('')); rAll++;
      });
    });

    const wsAll = XLSX.utils.aoa_to_sheet(aoaAll);
    wsAll['!merges'] = mergesAll;
    wsAll['!cols'] = [
      { wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 13 },
      { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
      { wch: 20 }, { wch: 10 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
      { wch: 11 }, { wch: 9 }, { wch: 9 },
    ];
    XLSX.utils.book_append_sheet(wb, wsAll, 'All Teams');

    XLSX.writeFile(wb, `sakhi_sang_database_${getToday()}.xlsx`);
    showToast('Database exported!', 'success');
  } catch (e) {
    console.error(e);
    showToast('Export failed', 'error');
  }
}

function downloadImportTemplate() {
  const teams  = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
  const statuses = ['Expected to be Serious','Serious','Most Serious'];

  // ── Sheet 1: DATA (import-ready) ──
  const headers = [
    'Name', 'Mobile', 'Address', 'DOB',
    'Date of Joining', 'Chanting Rounds', 'Kanthi', 'Gopi Dress',
    'Team', 'Status', 'Facilitator', 'Reference', 'Calling By',
    'Education', 'Email', 'Profession', 'Family Favourable', 'Reading', 'Hearing',
    'Hobbies', 'Skills', 'Tilak',
  ];
  const sample1 = [
    'Radha Kumari', '9876543210', 'C-12, Sector 5, Noida',
    '2000-06-15', '2023-04-02', '16', 'Yes', 'No',
    'Champaklata', 'Serious', 'Anjali Mishra Mtg', 'Priya Devi', 'Anjali Mishra Mtg',
    'B.Com', 'radha@example.com', 'Housewife', 'Yes', 'Regular', 'Daily',
    'Singing, Cooking', 'Music, Art', 'Yes',
  ];
  const sample2 = [
    'Sita Devi', '8765432109', 'B-4, Govind Nagar, Mathura',
    '1998-03-22', '2024-01-07', '8', 'No', 'No',
    'Lalita', 'Expected to be Serious', 'Neha Bhandari', '', 'Neha Bhandari',
    '12th Pass', '', 'Student', 'Partial', 'Occasionally', 'Occasionally',
    'Dance', 'Teaching', 'No',
  ];

  const wsData = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  wsData['!cols'] = [
    { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 13 }, { wch: 15 },
    { wch: 15 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 22 }, { wch: 22 },
    { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
  ];

  // ── Sheet 2: INSTRUCTIONS ──
  const instrRows = [
    ['SAKHI SANG – Devotee Import Template', '', ''],
    ['', '', ''],
    ['HOW TO USE:', '', ''],
    ['1. Fill your data in the "Devotees" sheet starting from Row 2 (Row 1 = headers — do not change)', '', ''],
    ['2. Delete the 2 sample rows before importing', '', ''],
    ['3. Save the file and upload it using Import Excel button', '', ''],
    ['', '', ''],
    ['COLUMN GUIDE:', 'Allowed Values / Format', 'Required?'],
    ['Name', 'Full name of devotee', 'YES (mandatory)'],
    ['Mobile', '10-digit number only, no spaces/dashes', 'Recommended'],
    ['Address', 'Full address', 'Optional'],
    ['DOB', 'YYYY-MM-DD  (e.g. 2000-06-15)', 'Optional'],
    ['Date of Joining', 'YYYY-MM-DD  (e.g. 2023-04-02)', 'Optional'],
    ['Chanting Rounds', 'Number between 0 and 64', 'Optional'],
    ['Kanthi', 'Yes  or  No', 'Optional'],
    ['Gopi Dress', 'Yes  or  No', 'Optional'],
    ['Team', teams.join('  |  '), 'Optional'],
    ['Status', statuses.join('  |  '), 'Optional'],
    ['Facilitator', 'Name of facilitator (must match a devotee in database)', 'Optional'],
    ['Reference', 'Name of referring devotee (must match a devotee in database)', 'Optional'],
    ['Calling By', 'Name of caller (must match a devotee in database)', 'Optional'],
    ['Education', 'e.g. 10th, 12th Pass, B.Com, M.A., PhD…', 'Optional'],
    ['Email', 'Valid email address', 'Optional'],
    ['Profession', 'e.g. Housewife, Teacher, Student, Business…', 'Optional'],
    ['Family Favourable', 'Yes  |  Partial  |  No', 'Optional'],
    ['Reading', 'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
    ['Hearing', 'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
    ['Hobbies', 'Free text — e.g. Singing, Dance, Cooking', 'Optional'],
    ['Skills', 'Free text — e.g. Teaching, Graphic Design, Music', 'Optional'],
    ['Tilak', 'Yes  or  No', 'Optional'],
    ['', '', ''],
    ['NOTE: Duplicate mobile numbers are automatically skipped during import.', '', ''],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData,  'Devotees');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');
  XLSX.writeFile(wb, 'sakhi_sang_devotee_template.xlsx');
  showToast('Template downloaded!', 'success');
}

// ── IMPORT FIELD DEFINITIONS (for column mapping UI) ──
const IMPORT_FIELDS = [
  { key: 'name',             label: 'Name *',             aliases: ['Name','name','Full Name','Devotee Name','NAAM'] },
  { key: 'mobile',           label: 'Mobile',             aliases: ['Mobile','Contact','Phone','Mobile Number','Mobile (10 digits)','Contact Number','Mob','Ph No','mob no','contact'] },
  { key: 'address',          label: 'Address',            aliases: ['Address','address','Addr','ADDRESS'] },
  { key: 'dob',              label: 'Date of Birth',      aliases: ['DOB','D.O.B','Date of Birth','Birth Date','dob','D.O.B.','DOB (DD/MM/YYYY)'] },
  { key: 'dateOfJoining',    label: 'Date of Joining',    aliases: ['Date of Joining','Date Of Joining','Joining Date','DOJ','Date of joining'] },
  { key: 'chantingRounds',   label: 'Chanting Rounds',    aliases: ['Chanting Rounds','CHANTING','Chanting','CR','chanting','Rounds','rounds','chanting rounds'] },
  { key: 'teamName',         label: 'Team',               aliases: ['Team','Team Wise','Team Name','TEAM','Group','team','Team wise','Teamwise'] },
  { key: 'devoteeStatus',    label: 'Devotee Status',     aliases: ['Status','Devotee Status','Dev Status','status','ETS','devotee status'] },
  { key: 'facilitator',      label: 'Facilitator',        aliases: ['Facilitator','facilitator','Faciltr'] },
  { key: 'referenceBy',      label: 'Reference By',       aliases: ['Reference','Ref','Reference By','Referred By','Ref-2','ref','Ref 2','reference'] },
  { key: 'callingBy',        label: 'Calling By',         aliases: ['Calling By','Called By','Caller','Calling by','calling by','CallingBy'] },
  { key: 'kanthi',           label: 'Kanthi (Y/N)',       aliases: ['Kanthi','kanthi','KANTHI'] },
  { key: 'gopiDress',        label: 'Gopi Dress (Y/N)',   aliases: ['Gopi Dress','Gopi','GOPI','gopi dress','Gopi dress'] },
  { key: 'tilak',            label: 'Tilak (Y/N)',        aliases: ['Tilak','tilak','TILAK'] },
  { key: 'education',        label: 'Education',          aliases: ['Education','education','EDUCATION'] },
  { key: 'email',            label: 'Email',              aliases: ['Email','E-Mail','email','E Mail','e-mail','EMAIL'] },
  { key: 'profession',       label: 'Profession',         aliases: ['Profession','Occupation','profession','PROFESSION'] },
  { key: 'familyFavourable', label: 'Family Favourable',  aliases: ['Family Favourable','Family Favorable','Family','family favourable','Family Favourable?'] },
  { key: 'reading',          label: 'Reading',            aliases: ['Reading','reading','READING'] },
  { key: 'hearing',          label: 'Hearing',            aliases: ['Hearing','hearing','HEARING'] },
  { key: 'hobbies',          label: 'Hobbies',            aliases: ['Hobbies','hobbies','Hobby','HOBBIES'] },
  { key: 'skills',           label: 'Skills',             aliases: ['Skills','skills','Skill','SKILLS'] },
];

// Temp storage for mapping modal
let _importRows = [], _importMode = 'add';

async function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const zone   = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  _importMode  = document.querySelector('input[name="import-mode"]:checked')?.value || 'add';
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary)"></i><p>Reading file…</p>`;
  result.classList.add('hidden');
  e.target.value = '';
  try {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellDates: false });

    let allRows = [];
    for (const sheetName of wb.SheetNames) {
      if (sheetName.toLowerCase().includes('instruction')) continue;
      const ws = wb.Sheets[sheetName];
      let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) continue;

      const firstKeys = Object.keys(rows[0] || {});
      const knownCols = ['Name','name','Contact','Mobile','NAAM','Devotee Name'];
      const hasHeader = firstKeys.some(k => knownCols.some(kc => k.toLowerCase() === kc.toLowerCase()));
      if (!hasHeader && rows.length > 1) {
        rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: 1 });
      }

      rows = rows.filter(r => {
        const nm = importCol(r, ['Name','name','Devotee Name','NAAM','Contact']);
        if (!nm) return false;
        if (/^(level|──|sr\.?\s*no|sno|s\.no|well wish|beginn|advanc|committ)/i.test(nm)) return false;
        return true;
      });

      allRows = allRows.concat(rows);
    }

    if (!allRows.length) {
      throw new Error('No data rows found. Make sure your Excel has data rows with a Name/Contact column.');
    }

    _importRows = allRows;
    zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>
      <p>Click to browse or drag & drop Excel file</p>
      <small style="color:var(--text-muted)">Supports any column names — auto-detected</small>
      <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">`;
    showColumnMappingUI(allRows);
  } catch (err) {
    result.className = 'import-result error';
    result.innerHTML = `<strong>Import failed:</strong> ${err.message || 'Unknown error'}`;
    result.classList.remove('hidden');
    console.error('Import error', err);
    zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>
      <p>Click to browse or drag & drop Excel file</p>
      <small style="color:var(--text-muted)">Supports any column names — auto-detected</small>
      <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">`;
  }
}

function showColumnMappingUI(rows) {
  // Gather all unique column headers from uploaded file
  const headerSet = new Set();
  rows.forEach(r => Object.keys(r).forEach(k => { if (k && !k.startsWith('__')) headerSet.add(k); }));
  const headers = [...headerSet];

  const tbody = document.getElementById('col-mapping-body');
  tbody.innerHTML = '';

  // Build field options HTML
  const fieldOptions = IMPORT_FIELDS.map(f => `<option value="${f.key}">${f.label}</option>`).join('');

  headers.forEach(col => {
    // Auto-detect best match from aliases
    let autoMatch = '';
    for (const field of IMPORT_FIELDS) {
      if (field.aliases.some(a => a.toLowerCase() === col.toString().trim().toLowerCase())) {
        autoMatch = field.key;
        break;
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="excel-col" title="${col}">${col}</td>
      <td>
        <select data-col="${col}" onchange="this.classList.toggle('mapped', this.value !== '')">
          <option value="">(Ignore)</option>
          ${fieldOptions}
        </select>
      </td>`;
    tbody.appendChild(tr);

    const sel = tr.querySelector('select');
    if (autoMatch) { sel.value = autoMatch; sel.classList.add('mapped'); }
  });

  openModal('import-mapping-modal');
}

async function confirmMappingImport() {
  if (!_importRows.length) return;
  const selects = document.querySelectorAll('#col-mapping-body select');
  const colMap = {};
  selects.forEach(sel => {
    if (sel.value) colMap[sel.dataset.col] = sel.value;
  });

  closeModal('import-mapping-modal');
  const zone   = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary)"></i><p>Saving ${_importRows.length} rows…</p>`;
  result.classList.add('hidden');

  try {
    const data = await importWithMapping(_importRows, colMap, _importMode);
    showImportReport(data, result);
    loadDevotees(); loadCallingPersonsFilter();
    showToast(`Import complete — ${data.imported} added${data.updated ? ', ' + data.updated + ' updated' : ''}`, 'success');
  } catch (err) {
    result.className = 'import-result error';
    result.innerHTML = `<strong>Import failed:</strong> ${err.message || 'Unknown error'}`;
    result.classList.remove('hidden');
    console.error('Import error', err);
  }
  zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>
    <p>Click to browse or drag & drop Excel file</p>
    <small style="color:var(--text-muted)">Supports any column names — auto-detected</small>
    <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">`;
  _importRows = [];
}

async function importWithMapping(rows, colMap, mode = 'add') {
  function getField(row, fieldKey) {
    const excelCol = Object.keys(colMap).find(c => colMap[c] === fieldKey);
    return excelCol ? (row[excelCol] ?? '') : '';
  }

  let imported = 0, updated = 0, skipped = [], errors = [];
  const list = await DevoteeCache.all();
  const mobileMap = {}, nameMap = {};
  list.forEach(d => {
    if (d.mobile) mobileMap[d.mobile] = { id: d.id, name: d.name };
    nameMap[d.name.toLowerCase()] = { id: d.id, name: d.name };
  });

  const chunks = [];
  for (let i = 0; i < rows.length; i += 20) chunks.push(rows.slice(i, i + 20));
  let globalRow = 2;

  for (const chunk of chunks) {
    const batch = fdb.batch();
    let batchHasWrites = false;

    chunk.forEach((row) => {
      const rowNum = globalRow++;
      try {
        const name   = String(getField(row, 'name')).trim();
        const mobile = String(getField(row, 'mobile')).replace(/\D/g, '').slice(0, 10);
        if (!name) { skipped.push({ row: rowNum, name: '(blank)', mobile: mobile || '', reason: 'Name is empty' }); return; }

        const payload = {
          name,
          mobile:           mobile || null,
          address:          String(getField(row, 'address')) || null,
          dob:              importDate(getField(row, 'dob')) || null,
          dateOfJoining:    importDate(getField(row, 'dateOfJoining')) || null,
          chantingRounds:   Math.abs(parseInt(getField(row, 'chantingRounds')) || 0),
          kanthi:           importYN(getField(row, 'kanthi')),
          gopiDress:        importYN(getField(row, 'gopiDress')),
          tilak:            importYN(getField(row, 'tilak')),
          teamName:         String(getField(row, 'teamName')) || null,
          devoteeStatus:    importStatus(getField(row, 'devoteeStatus')),
          facilitator:      String(getField(row, 'facilitator')) || null,
          referenceBy:      String(getField(row, 'referenceBy')) || null,
          callingBy:        String(getField(row, 'callingBy')) || null,
          education:        String(getField(row, 'education')) || null,
          email:            String(getField(row, 'email')) || null,
          profession:       String(getField(row, 'profession')) || null,
          familyFavourable: String(getField(row, 'familyFavourable')) || null,
          reading:          String(getField(row, 'reading')) || null,
          hearing:          String(getField(row, 'hearing')) || null,
          hobbies:          String(getField(row, 'hobbies')) || null,
          skills:           String(getField(row, 'skills')) || null,
          isActive: true, inactivityFlag: false, updatedAt: TS(),
        };
        Object.keys(payload).forEach(k => { if (payload[k] === 'null' || payload[k] === '') payload[k] = null; });

        const byMobile = mobile && mobileMap[mobile];
        const byName   = nameMap[name.toLowerCase()];
        const existId  = (byMobile || (mode === 'upsert' && byName))?.id || null;

        if (existId) {
          if (mode === 'upsert') {
            batch.update(fdb.collection('devotees').doc(existId), payload);
            updated++;
          } else {
            const matchedName = (byMobile || byName)?.name || '';
            const reason = byMobile
              ? `Duplicate mobile — already registered as "${matchedName}"`
              : `Duplicate name — already exists as "${matchedName}"`;
            skipped.push({ row: rowNum, name, mobile: mobile || '', reason });
          }
        } else {
          const ref = fdb.collection('devotees').doc();
          batch.set(ref, { ...payload, lifetimeAttendance: 0, createdAt: TS() });
          if (mobile) mobileMap[mobile] = { id: ref.id, name };
          nameMap[name.toLowerCase()] = { id: ref.id, name };
          imported++;
        }
        batchHasWrites = true;
      } catch (err) {
        errors.push({ row: rowNum, name: '', mobile: '', reason: err.message });
      }
    });

    if (batchHasWrites) await batch.commit();
  }

  DevoteeCache.bust();
  return { imported, updated, skipped, errors };
}

let _lastSkipReport = [];

function showImportReport(data, resultEl) {
  const allSkipped = [...(data.skipped || []), ...(data.errors || [])];
  _lastSkipReport = allSkipped;

  const updLine = data.updated ? ` &nbsp;|&nbsp; Updated: <b>${data.updated}</b>` : '';
  const skipCount = allSkipped.length;

  let html = `<div style="margin-bottom:.5rem">
    ✅ Added: <b>${data.imported}</b>${updLine} &nbsp;|&nbsp; ⚠️ Skipped: <b>${skipCount}</b>
  </div>`;

  if (skipCount > 0) {
    html += `<details style="margin-top:.4rem">
      <summary style="cursor:pointer;font-weight:600;font-size:.83rem;color:var(--danger)">
        Show ${skipCount} skipped / error rows ▾
      </summary>
      <div style="max-height:200px;overflow-y:auto;margin-top:.4rem">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead><tr style="background:var(--primary);color:#fff">
            <th style="padding:.3rem .5rem;text-align:left">Row</th>
            <th style="padding:.3rem .5rem;text-align:left">Name</th>
            <th style="padding:.3rem .5rem;text-align:left">Mobile</th>
            <th style="padding:.3rem .5rem;text-align:left">Reason</th>
          </tr></thead>
          <tbody>
            ${allSkipped.map((s, i) => `<tr style="background:${i%2?'#fff':'#fafafa'}">
              <td style="padding:.25rem .5rem;color:var(--text-muted)">${s.row}</td>
              <td style="padding:.25rem .5rem;font-weight:600">${s.name || ''}</td>
              <td style="padding:.25rem .5rem">${s.mobile || ''}</td>
              <td style="padding:.25rem .5rem;color:var(--danger)">${s.reason}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="btn btn-secondary" style="margin-top:.5rem;font-size:.8rem;padding:.35rem .75rem"
        onclick="downloadSkipReport()"><i class="fas fa-download"></i> Download Skip Report (.xlsx)</button>
    </details>`;
  }

  resultEl.className = skipCount > 0 ? 'import-result' : 'import-result success';
  resultEl.style.cssText = skipCount > 0
    ? 'background:#fff8e1;border:1.5px solid #f9a825;color:#5d4037'
    : '';
  resultEl.innerHTML = html;
  resultEl.classList.remove('hidden');
}

function downloadSkipReport() {
  if (!_lastSkipReport.length) return;
  const ws = XLSX.utils.aoa_to_sheet([
    ['Row #', 'Name', 'Mobile', 'Reason Skipped'],
    ..._lastSkipReport.map(s => [s.row, s.name || '', s.mobile || '', s.reason])
  ]);
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 55 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Skipped Rows');
  XLSX.writeFile(wb, `import_skip_report_${getToday()}.xlsx`);
}

// ══════════════════════════════════════════════════════
// TAB 1 – DEVOTEES
// ══════════════════════════════════════════════════════
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

async function openProfileModal(id) {
  AppState.currentDevoteeId = id;
  openModal('profile-modal');
  const content = document.getElementById('profile-modal-content');
  content.innerHTML = '<div class="loading" style="padding:2rem"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const d = await DB.getDevotee(id);
    document.getElementById('profile-modal-name').textContent = d.name;
    content.innerHTML = `
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
          <div class="profile-field"><label>Admitted On</label><span style="font-size:.82rem;color:var(--text-muted)">${d.created_at ? formatDateTime(d.created_at) : '—'}</span></div>
          <div class="profile-field"><label>Lifetime Attendance</label><span style="color:var(--primary);font-size:1.1rem;font-family:'Cinzel',serif">${d.lifetime_attendance}</span></div>
        </div>
      </div>
      <div class="profile-section">
        <div class="profile-section-title">Spiritual Profile</div>
        <div class="profile-fields">
          <div class="profile-field"><label>Chanting Rounds</label><span style="font-size:1.1rem;font-family:'Cinzel',serif">${d.chanting_rounds || 0}</span></div>
          <div class="profile-field"><label>Lifetime Attendance</label><span style="color:var(--primary);font-size:1.1rem;font-family:'Cinzel',serif">${d.lifetime_attendance}</span></div>
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
      ${(d.education || d.email || d.profession || d.family_favourable || d.reading || d.hearing || d.hobbies || d.skills || d.tilak || d.kanthi || d.gopi_dress) ? `
      <div class="profile-section">
        <div class="profile-section-title"><i class="fas fa-user-graduate" style="margin-right:.35rem"></i>Personal Details</div>
        <div class="profile-fields">
          ${d.education ? `<div class="profile-field"><label>Education</label><span>${d.education}</span></div>` : ''}
          ${d.email ? `<div class="profile-field"><label>Email</label><span><a href="mailto:${d.email}" style="color:var(--primary)">${d.email}</a></span></div>` : ''}
          ${d.profession ? `<div class="profile-field"><label>Profession</label><span>${d.profession}</span></div>` : ''}
          ${d.family_favourable ? `<div class="profile-field"><label>Family Favourable</label><span class="pf-tag pf-family-${d.family_favourable.toLowerCase().replace(/\s/g,'-')}">${d.family_favourable}</span></div>` : ''}
          ${d.reading ? `<div class="profile-field"><label>Reading</label><span class="pf-tag">${d.reading}</span></div>` : ''}
          ${d.hearing ? `<div class="profile-field"><label>Hearing</label><span class="pf-tag">${d.hearing}</span></div>` : ''}
          ${d.hobbies ? `<div class="profile-field"><label>Hobbies</label><span>${d.hobbies}</span></div>` : ''}
          ${d.skills ? `<div class="profile-field"><label>Skills</label><span>${d.skills}</span></div>` : ''}
          <div class="profile-field"><label>Tilak</label><span>${d.tilak ? '✓ Yes' : '✗ No'}</span></div>
          <div class="profile-field"><label>Kanthi</label><span>${d.kanthi ? '✓ Yes' : '✗ No'}</span></div>
          <div class="profile-field"><label>Gopi Dress</label><span>${d.gopi_dress ? '✓ Yes' : '✗ No'}</span></div>
        </div>
      </div>` : ''}
      <div class="profile-section" style="display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap">
        ${AppState.userRole === 'superAdmin' && !d.is_not_interested ? `<button class="btn" style="background:#ff6f00;color:#fff" onclick="markNotInterested('${d.id}')"><i class="fas fa-ban"></i> Mark Not Interested</button>` : ''}
        ${d.is_not_interested ? `<span class="badge" style="background:#bf360c;color:#fff;padding:.35rem .7rem;align-self:center"><i class="fas fa-ban"></i> Not Interested</span>` : ''}
        <button class="btn btn-secondary" onclick="editCurrentDevotee()"><i class="fas fa-pencil-alt"></i> Edit</button>
        <button class="btn btn-danger" onclick="deleteDevotee('${d.id}')"><i class="fas fa-trash"></i> Remove</button>
      </div>`;
  } catch (_) {
    content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function editCurrentDevotee() { closeModal('profile-modal'); openDevoteeFormModal(false, AppState.currentDevoteeId); }

function openDevoteeFormModal(fromAttendance = false, editId = null) {
  AppState.fromAttendance = fromAttendance;
  document.getElementById('f-id').value = editId || '';
  document.getElementById('devotee-form-title').textContent = editId ? 'Edit Devotee Profile' : (fromAttendance ? 'Register New Devotee' : 'Add New Devotee');
  if (editId) populateEditForm(editId); else clearDevoteeForm();
  openModal('devotee-form-modal');
}

function clearDevoteeForm() {
  ['f-name','f-mobile','f-address','f-education','f-email','f-profession','f-hobbies','f-skills'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-dob').value = '';
  document.getElementById('f-joining').value = getToday(); // auto-fill today for new devotees
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
  if (AppState.userRole === 'teamAdmin' && AppState.userTeam) {
    document.getElementById('f-team').value = AppState.userTeam;
  }
}

async function populateEditForm(id) {
  try {
    const d = await DB.getDevotee(id);
    document.getElementById('f-name').value     = d.name || '';
    document.getElementById('f-mobile').value   = d.mobile || '';
    document.getElementById('f-address').value  = d.address || '';
    document.getElementById('f-dob').value      = d.dob || '';
    document.getElementById('f-joining').value  = d.date_of_joining || '';
    document.getElementById('f-chanting').value = d.chanting_rounds || 0;
    document.getElementById('f-team').value     = d.team_name || '';
    document.getElementById('f-status').value   = d.devotee_status || 'Expected to be Serious';
    document.getElementById('f-kanthi').value   = d.kanthi || 0;
    document.getElementById('f-gopi').value     = d.gopi_dress || 0;
    // Pickers
    if (d.facilitator) { document.getElementById('f-facilitator').value = d.facilitator; const pi = document.querySelector('#picker-facilitator .picker-input'); if(pi){pi.value=d.facilitator;pi.classList.add('has-value');} }
    if (d.reference_by) { document.getElementById('f-reference').value = d.reference_by; const pi = document.querySelector('#picker-reference .picker-input'); if(pi){pi.value=d.reference_by;pi.classList.add('has-value');} }
    if (d.calling_by) { document.getElementById('f-calling-by').value = d.calling_by; const pi = document.querySelector('#picker-calling-by .picker-input'); if(pi){pi.value=d.calling_by;pi.classList.add('has-value');} }
    // Personal details
    document.getElementById('f-education').value        = d.education || '';
    document.getElementById('f-email').value            = d.email || '';
    document.getElementById('f-profession').value       = d.profession || '';
    document.getElementById('f-family-favourable').value= d.family_favourable || '';
    document.getElementById('f-reading').value          = d.reading || '';
    document.getElementById('f-hearing').value          = d.hearing || '';
    document.getElementById('f-hobbies').value          = d.hobbies || '';
    document.getElementById('f-skills').value           = d.skills || '';
    document.getElementById('f-tilak').value            = d.tilak || '0';
    clearFieldError('mobile');
  } catch (_) { showToast('Failed to load profile', 'error'); }
}

function getFormPayload() {
  return {
    name:              document.getElementById('f-name').value.trim(),
    mobile:            document.getElementById('f-mobile').value.replace(/\D/g,'').slice(0,10),
    address:           document.getElementById('f-address').value.trim(),
    dob:               document.getElementById('f-dob').value,
    date_of_joining:   document.getElementById('f-joining').value,
    chanting_rounds:   parseInt(document.getElementById('f-chanting').value) || 0,
    team_name:         document.getElementById('f-team').value,
    devotee_status:    document.getElementById('f-status').value,
    kanthi:            parseInt(document.getElementById('f-kanthi').value),
    gopi_dress:        parseInt(document.getElementById('f-gopi').value),
    facilitator:       document.getElementById('f-facilitator').value.trim(),
    reference_by:      document.getElementById('f-reference').value.trim(),
    calling_by:        document.getElementById('f-calling-by').value.trim(),
    education:         document.getElementById('f-education').value.trim(),
    email:             document.getElementById('f-email').value.trim(),
    profession:        document.getElementById('f-profession').value.trim(),
    family_favourable: document.getElementById('f-family-favourable').value,
    reading:           document.getElementById('f-reading').value,
    hearing:           document.getElementById('f-hearing').value,
    hobbies:           document.getElementById('f-hobbies').value.trim(),
    skills:            document.getElementById('f-skills').value.trim(),
    tilak:             parseInt(document.getElementById('f-tilak').value),
  };
}

async function saveDevotee(e) {
  e.preventDefault();
  // Mobile validation
  const mobileRaw = document.getElementById('f-mobile').value;
  const mob = validateMobile(mobileRaw);
  if (!mob.valid) { showFieldError('mobile', mob.error); return; }
  clearFieldError('mobile');
  const id = document.getElementById('f-id').value;
  const payload = getFormPayload();
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

// ══════════════════════════════════════════════════════
// TAB 2 – CALLING STATUS
// ══════════════════════════════════════════════════════
function switchCallingSubTab(tab, btn) {
  document.querySelectorAll('#calling-sub-tabs .att-sub-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('calling-panel-active').classList.toggle('hidden', tab !== 'active');
  document.getElementById('calling-panel-notinterested').classList.toggle('hidden', tab !== 'notinterested');
  if (tab === 'notinterested') loadNotInterestedList();
}

async function loadNotInterestedList() {
  const wrap = document.getElementById('not-interested-list');
  wrap.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const list = await DB.getNotInterestedDevotees();
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-ban"></i><p>No devotees marked as Not Interested</p></div>';
      return;
    }
    wrap.innerHTML = `<table class="calling-table">
      <thead><tr>
        <th>#</th><th>Name</th><th>Mobile</th><th>Team</th>
        <th>Date of Joining</th><th>Moved Not Interested On</th>
        <th>C.R</th><th>Ref</th><th>Calling By</th>
      </tr></thead>
      <tbody>${list.map((d, i) => `<tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td><span style="font-weight:600">${d.name}</span></td>
        <td>${d.mobile || '—'}</td>
        <td>${teamBadge(d.team_name)}</td>
        <td>${formatDate(d.date_of_joining)}</td>
        <td>${d.not_interested_at ? formatDateTime(d.not_interested_at) : '—'}</td>
        <td>${d.chanting_rounds || 0}</td>
        <td>${d.reference_by || '—'}</td>
        <td>${d.calling_by || '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

async function loadCallingStatus() {
  const inp = document.getElementById('calling-week');
  if (!inp.value) inp.value = getCurrentSunday();
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
  const yes     = devotees.filter(d => d.coming_status === 'Yes').length;
  const maybe   = devotees.filter(d => d.coming_status === 'Maybe').length;
  const no      = devotees.filter(d => d.coming_status === 'No').length;
  const shift   = devotees.filter(d => d.coming_status === 'Shifted').length;
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
  wrap.innerHTML = `<table class="calling-table">
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

// ══════════════════════════════════════════════════════
// TAB 3 – ATTENDANCE
// ══════════════════════════════════════════════════════
async function loadAttendanceTab() {
  if (!AppState.currentSessionId) await initSession();
  await loadAttendanceSession(AppState.currentSessionId);
}

async function loadAttendanceSession(sessionId) {
  if (!sessionId) return;
  AppState.currentSessionId = sessionId;
  // Sync date picker to this session's date
  const s = AppState.sessionsCache[sessionId];
  const picker = document.getElementById('session-date-picker');
  if (picker && s?.session_date) picker.value = s.session_date;
  showSessionInfo(sessionId);
  await Promise.all([updateAttendanceStats(), loadAttendanceCandidates()]);
}

async function updateAttendanceStats() {
  if (!AppState.currentSessionId) return;
  try {
    const s = await DB.getSessionStats(AppState.currentSessionId);
    document.getElementById('stat-target').textContent  = s.target;
    document.getElementById('stat-present').textContent = s.present;
    document.getElementById('stat-new').textContent     = s.newDevotees;
    document.getElementById('stat-total').textContent   = s.totalPresent;
  } catch (_) {}
}

async function loadAttendanceCandidates() {
  if (!AppState.currentSessionId) return;
  const search = document.getElementById('attendance-search').value.trim();
  const list   = document.getElementById('attendance-list');
  list.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const candidates = await DB.getAttendanceCandidates(AppState.currentSessionId, search);
    AppState.attendanceCandidates = {};
    candidates.forEach(d => { AppState.attendanceCandidates[d.id] = d; });
    if (!candidates.length) {
      list.innerHTML = search
        ? `<div class="empty-state"><i class="fas fa-search"></i><p>No result for "${search}"</p></div>`
        : '<div class="empty-state"><i class="fas fa-users"></i><p>No candidates for this session</p></div>';
      return;
    }
    const isServiceDev = AppState.userRole === 'serviceDevotee';
    list.innerHTML = candidates.map((d, idx) => {
      const isPresent = !!d.attendance_id;
      const canEdit   = !isServiceDev || isPresent; // service devotee can only edit present ones
      return `
        <div class="attendance-card${isPresent ? ' is-present' : ''}" id="att-card-${d.id}"
             ${canEdit ? `onclick="openProfileModal('${d.id}')" style="cursor:pointer"` : ''}>
          <div class="devotee-avatar" style="width:40px;height:40px;font-size:.9rem">${initials(d.name)}</div>
          <div class="attendance-card-info">
            <div class="attendance-card-name">${d.name}
              ${isBirthdayWeek(d.dob) ? '<i class="fas fa-birthday-cake" style="color:var(--gold);margin-left:.3rem"></i>' : ''}
              ${d.coming_status === 'Yes' ? '<span class="badge badge-expected" style="font-size:.7rem">Confirmed</span>' : ''}
            </div>
            ${d.mobile ? `<div class="att-mobile" onclick="event.stopPropagation()">${contactIcons(d.mobile)}<span class="att-mobile-num">${d.mobile}</span></div>` : ''}
            <div class="attendance-card-meta">${d.team_name || ''}${d.calling_by ? ' · Called: ' + d.calling_by : ''}</div>
          </div>
          <div onclick="event.stopPropagation()">
            ${isPresent
              ? `<span style="color:var(--success);font-weight:700;font-size:.85rem"><i class="fas fa-check-circle"></i> Present</span>
                 <button class="undo-btn" onclick="undoPresent('${d.id}')">Undo</button>`
              : `<button class="present-btn" onclick="markPresent('${d.id}', false)">PRESENT</button>`}
          </div>
        </div>`;
    }).join('');
  } catch (_) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

async function markPresent(devoteeId, isNew = false) {
  if (!AppState.currentSessionId) return showToast('No session active', 'error');
  const devotee = AppState.attendanceCandidates[devoteeId];
  if (!devotee) return showToast('Devotee not found', 'error');
  try {
    await DB.markPresent(AppState.currentSessionId, devotee, isNew);
    await updateAttendanceStats();
    if (AppState.currentTab === 'attendance') loadAttendanceCandidates();
    showToast('Marked Present! Hare Krishna 🙏', 'success');
  } catch (e) {
    if (e.status === 409) showToast('Already marked present', 'error');
    else showToast('Error marking present', 'error');
  }
}

async function undoPresent(devoteeId) {
  if (!AppState.currentSessionId) return;
  if (!confirm('Remove attendance for this devotee?')) return;
  try {
    await DB.undoPresent(AppState.currentSessionId, devoteeId);
    await updateAttendanceStats();
    loadAttendanceCandidates();
    showToast('Attendance removed');
  } catch (_) { showToast('Error', 'error'); }
}

// ══════════════════════════════════════════════════════
// TAB 4 – REPORTS
// ══════════════════════════════════════════════════════
function loadReports() {
  const active = document.querySelector('.sub-panel.active');
  if (!active) return;
  const id = active.id.replace('subtab-', '');
  if (id === 'attendance-detail') loadAttendanceDetail();
  if (id === 'serious-analysis')  loadSeriousAnalysis();
  if (id === 'team-leaderboard')  loadTeamLeaderboard();
  if (id === 'trends')            loadTrends();
}

function getWeekDate() { return document.getElementById('report-date').value || getToday(); }

async function loadAttendanceDetail() {
  const c = document.getElementById('attendance-detail-table');
  c.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';
  if (!AppState.currentSessionId) { c.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>No session selected</p></div>'; return; }
  try {
    const records = await DB.getAttendanceReport(AppState.currentSessionId);
    if (!records.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>No attendance data</p></div>'; return; }
    c.innerHTML = `
      <div style="margin-bottom:.75rem;color:var(--text-muted);font-size:.85rem">${records.length} devotees present</div>
      <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Rounds</th><th>Team</th><th>Calling By</th><th>Type</th></tr></thead>
          <tbody>${records.map((r, i) => `
            <tr><td style="color:var(--text-muted)">${i+1}</td>
                <td style="font-weight:600">${r.name}</td>
                <td>${r.mobile ? contactIcons(r.mobile) : '—'}</td>
                <td style="text-align:center">${r.chanting_rounds || 0}</td>
                <td>${teamBadge(r.team_name)}</td>
                <td>${r.calling_by || '—'}</td>
                <td>${r.is_new_devotee ? '<span class="badge badge-most-serious">New</span>' : '<span class="badge badge-expected">Regular</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (_) { c.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>'; }
}

async function loadSeriousAnalysis() {
  const c = document.getElementById('serious-analysis-content');
  c.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';
  try {
    const data = await DB.getSeriousReport(getWeekDate(), AppState.currentSessionId);
    const teams    = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
    const statuses = ['Most Serious','Serious','Expected to be Serious'];
    c.innerHTML = `<div style="overflow-x:auto"><table class="report-table">
      <thead>
        <tr><th>Team</th>${statuses.map(s => `<th colspan="2" style="text-align:center">${s}</th>`).join('')}</tr>
        <tr><th></th>${statuses.map(() => '<th>Promised</th><th>Arrived</th>').join('')}</tr>
      </thead>
      <tbody>${teams.map(team => {
        const cells = statuses.map(status => {
          const row = data.find(d => d.team === team && d.status === status);
          const p = row?.promised || 0, a = row?.arrived || 0, pct = p > 0 ? Math.round(a/p*100) : 0;
          return `<td style="text-align:center;font-weight:600">${p}</td>
                  <td style="text-align:center"><span style="font-weight:700;color:${a>=p?'var(--success)':'var(--warning)'}">${a}</span>${p>0?`<span style="font-size:.72rem;color:var(--text-muted)"> (${pct}%)</span>`:''}`;
        }).join('');
        return `<tr><td style="font-weight:700">${team}</td>${cells}</tr>`;
      }).join('')}
      </tbody></table></div>`;
  } catch (_) { c.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>'; }
}

async function loadTeamLeaderboard() {
  const c = document.getElementById('team-leaderboard-content');
  c.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';
  try {
    const data = (await DB.getTeamsReport(getWeekDate(), AppState.currentSessionId)).sort((a, b) => b.percentage - a.percentage);
    c.innerHTML = `<div style="overflow-x:auto"><table class="report-table">
      <thead><tr><th>Rank</th><th>Team</th><th>Total</th><th>Calling List</th><th>Target</th><th>Present</th><th>Achievement</th></tr></thead>
      <tbody>${data.map((row, i) => {
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
        const cls   = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
        const col   = row.percentage>=100?'var(--success)':row.percentage>=70?'var(--warning)':'var(--danger)';
        return `<tr>
          <td class="leaderboard-rank ${cls}">${medal}</td>
          <td style="font-weight:700">${row.team}</td>
          <td style="text-align:center">${row.total}</td>
          <td style="text-align:center">${row.callingList}</td>
          <td style="text-align:center">${row.target}</td>
          <td style="text-align:center;font-weight:700;color:var(--success)">${row.actualPresent}</td>
          <td><div style="display:flex;align-items:center;gap:.5rem">
            <div class="pct-bar-wrap"><div class="pct-bar" style="width:${Math.min(row.percentage,100)}%"></div></div>
            <span style="font-size:.82rem;font-weight:700;color:${col}">${row.percentage}%</span>
          </div></td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
  } catch (_) { c.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>'; }
}

async function loadTrends() {
  try {
    const data = await DB.getTrends(document.getElementById('trend-period').value, document.getElementById('trend-team').value);
    const canvas = document.getElementById('trends-chart');
    if (!canvas) return;
    if (AppState.trendsChart) { AppState.trendsChart.destroy(); AppState.trendsChart = null; }
    const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
    const period = document.getElementById('trend-period').value;
    const labels = data.map(d => {
      if (period === 'monthly') { const [y, m] = d.period.split('-'); return months[parseInt(m)-1] + ' ' + y; }
      return formatDate(d.period);
    });
    AppState.trendsChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Devotees Present', data: data.map(d => d.count), borderColor: '#2d7a52', backgroundColor: 'rgba(82,183,136,0.15)', borderWidth: 2.5, pointBackgroundColor: '#2d7a52', pointRadius: 5, fill: true, tension: 0.4 }] },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#1b4332', font: { family: 'Nunito', size: 13 } } },
          tooltip: { backgroundColor: '#1a5c3a', titleFont: { family: 'Cinzel' }, bodyFont: { family: 'Nunito' } }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#d8f3dc' }, ticks: { color: '#6b9080', font: { family: 'Nunito' } } },
          x: { grid: { color: '#d8f3dc' }, ticks: { color: '#6b9080', font: { family: 'Nunito' }, maxRotation: 45 } }
        }
      }
    });
  } catch (e) { console.error('Trends', e); }
}

// ══════════════════════════════════════════════════════
// TAB 5 – DEVOTEE CARE
// ══════════════════════════════════════════════════════
async function loadCareData() {
  await Promise.all([loadAbsentDevotees(), loadReturningNewcomers(), loadInactiveDevotees()]);
}

async function loadAbsentDevotees() {
  try {
    const { absentThisWeek, absentPast2Weeks } = await DB.getCareAbsent();
    document.getElementById('absent-week-count').textContent   = absentThisWeek.length;
    document.getElementById('absent-2weeks-count').textContent = absentPast2Weeks.length;
    renderCareList('absent-week-list', absentThisWeek);
    renderCareList('absent-2weeks-list', absentPast2Weeks);
  } catch (_) {}
}

async function loadReturningNewcomers() {
  try {
    const devotees = await DB.getCareNewcomers();
    document.getElementById('newcomers-count').textContent = devotees.length;
    renderCareList('newcomers-list', devotees);
  } catch (_) {}
}

async function loadInactiveDevotees() {
  try {
    const devotees = await DB.getCareInactive();
    document.getElementById('inactive-count').textContent = devotees.length;
    renderCareList('inactive-list', devotees);
  } catch (_) {}
}

function renderCareList(containerId, devotees) {
  const c = document.getElementById(containerId);
  if (!devotees.length) { c.innerHTML = '<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem"><i class="fas fa-check-circle" style="color:var(--success)"></i> All clear!</div>'; return; }
  c.innerHTML = devotees.map(d => `
    <div class="care-item" onclick="openProfileModal('${d.id}')" style="cursor:pointer">
      <div class="devotee-avatar" style="width:30px;height:30px;font-size:.7rem;flex-shrink:0">${initials(d.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="care-item-name">${d.name}</div>
        <div class="care-item-meta">${d.team_name || ''}${d.calling_by ? ' · ' + d.calling_by : ''}</div>
      </div>
      ${contactIcons(d.mobile)}
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// TAB 6 – EVENTS
// ══════════════════════════════════════════════════════
async function loadEvents() {
  const grid = document.getElementById('events-list');
  grid.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const events = await DB.getEvents();
    if (!events.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No events yet. Create one!</p></div>'; return; }
    grid.innerHTML = events.map(ev => `
      <div class="event-card" onclick="openEventDetail('${ev.id}')">
        <div class="event-card-header">
          <div><div class="event-name">${ev.event_name}</div><div class="event-date"><i class="fas fa-calendar"></i> ${formatDate(ev.event_date) || 'Date TBD'}</div></div>
          <div class="event-actions" onclick="event.stopPropagation()">
            <button class="btn-icon" onclick="openEditEventModal('${ev.id}')" title="Edit"><i class="fas fa-pencil-alt"></i></button>
            <button class="btn-icon close" onclick="deleteEvent('${ev.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        ${ev.description ? `<div class="event-desc">${ev.description}</div>` : ''}
        <div class="event-count"><i class="fas fa-users"></i> Click to manage devotees</div>
      </div>`).join('');
  } catch (_) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>'; }
}

function openNewEventModal() {
  document.getElementById('e-id').value = '';
  ['e-name','e-description'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('e-date').value = '';
  document.getElementById('event-form-title').textContent = 'New Event';
  openModal('event-form-modal');
}

async function openEditEventModal(id) {
  try {
    const events = await DB.getEvents();
    const ev = events.find(e => e.id === id);
    if (!ev) return;
    document.getElementById('e-id').value          = ev.id;
    document.getElementById('e-name').value        = ev.event_name;
    document.getElementById('e-date').value        = ev.event_date || '';
    document.getElementById('e-description').value = ev.description || '';
    document.getElementById('event-form-title').textContent = 'Edit Event';
    openModal('event-form-modal');
  } catch (_) {}
}

async function saveEvent(e) {
  e.preventDefault();
  const id = document.getElementById('e-id').value;
  const payload = { event_name: document.getElementById('e-name').value.trim(), event_date: document.getElementById('e-date').value || null, description: document.getElementById('e-description').value.trim() };
  try {
    if (id) await DB.updateEvent(id, payload); else await DB.createEvent(payload);
    closeModal('event-form-modal'); loadEvents();
    showToast('Event saved!', 'success');
  } catch (_) { showToast('Error saving event', 'error'); }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event and all its devotee assignments?')) return;
  try { await DB.deleteEvent(id); loadEvents(); showToast('Event deleted'); }
  catch (_) { showToast('Error', 'error'); }
}

async function openEventDetail(id) {
  AppState.currentEventId = id;
  openModal('event-detail-modal');
  const events = await DB.getEvents().catch(() => []);
  const ev = events.find(e => e.id === id);
  document.getElementById('event-detail-title').textContent = ev?.event_name || 'Event';
  document.getElementById('event-devotee-search').value = '';
  document.getElementById('event-search-results').innerHTML = '';
  loadEventDevotees();
}

async function loadEventDevotees() {
  const list = document.getElementById('event-devotee-list');
  try {
    const devotees = await DB.getEventDevotees(AppState.currentEventId);
    if (!devotees.length) { list.innerHTML = '<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem">No devotees added yet. Search above to add.</div>'; return; }
    list.innerHTML = devotees.map(d => `
      <div class="care-item">
        <div class="devotee-avatar" style="width:30px;height:30px;font-size:.7rem;flex-shrink:0">${initials(d.name)}</div>
        <div style="flex:1"><div class="care-item-name">${d.name}</div><div class="care-item-meta">${d.team_name||''} ${d.mobile||''}</div></div>
        ${contactIcons(d.mobile)}
        <button class="btn-icon close" style="width:26px;height:26px;font-size:.75rem" onclick="removeEventDevotee('${d.devotee_id}')"><i class="fas fa-times"></i></button>
      </div>`).join('');
  } catch (_) {}
}

async function searchEventDevotees() {
  const q = document.getElementById('event-devotee-search').value.trim();
  const results = document.getElementById('event-search-results');
  if (!q) { results.innerHTML = ''; return; }
  try {
    const devotees = await DB.getDevotees({ search: q });
    if (!devotees.length) { results.innerHTML = '<div style="font-size:.85rem;color:var(--text-muted);padding:.5rem">No results</div>'; return; }
    results.innerHTML = devotees.slice(0, 8).map(d => `
      <div class="event-search-item">
        <div><span style="font-weight:600">${d.name}</span><span style="font-size:.78rem;color:var(--text-muted)"> · ${d.team_name||''}</span></div>
        <button class="btn btn-primary" style="padding:.25rem .7rem;font-size:.8rem" onclick="addEventDevotee('${d.id}', '${d.name.replace(/'/g,"\\'")}')"><i class="fas fa-plus"></i> Add</button>
      </div>`).join('');
  } catch (_) {}
}

async function addEventDevotee(devoteeId, name) {
  try {
    const devotee = await DB.getDevotee(devoteeId);
    await DB.addEventDevotee(AppState.currentEventId, devotee);
    showToast(name + ' added!', 'success');
    document.getElementById('event-devotee-search').value = '';
    document.getElementById('event-search-results').innerHTML = '';
    loadEventDevotees();
  } catch (e) {
    if (e.error === 'Already added') showToast('Already in this event');
    else showToast('Error adding', 'error');
  }
}

async function removeEventDevotee(devoteeId) {
  try { await DB.removeEventDevotee(AppState.currentEventId, devoteeId); loadEventDevotees(); }
  catch (_) { showToast('Error removing', 'error'); }
}

async function exportEventDevotees() {
  if (!AppState.currentEventId) return;
  try {
    const devotees = await DB.getEventDevotees(AppState.currentEventId);
    if (!devotees.length) return showToast('No devotees in this event', 'error');
    const rows = devotees.map(d => ({ Name: d.name, Mobile: d.mobile || '', Team: d.team_name || '' }));
    downloadExcel(rows, 'event_devotees.xlsx');
  } catch (_) { showToast('Export failed', 'error'); }
}
