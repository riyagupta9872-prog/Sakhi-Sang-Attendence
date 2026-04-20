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

// Show team field when coordinator is selected
document.addEventListener('DOMContentLoaded', () => {
  const roleSelect = document.getElementById('signup-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      document.getElementById('signup-team-field').style.display = roleSelect.value === 'teamAdmin' ? 'flex' : 'none';
    });
  }
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
  if (role === 'superAdmin') document.getElementById('admin-gear-btn').classList.remove('hidden');

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
  };
}

function toCamel(f) {
  return {
    name:           (f.name || '').trim(),
    mobile:         (f.mobile || '').trim() || null,
    address:        (f.address || '').trim() || null,
    dob:            f.dob || null,
    dateOfJoining:  f.date_of_joining || null,
    chantingRounds: parseInt(f.chanting_rounds) || 0,
    kanthi:         parseInt(f.kanthi) || 0,
    gopiDress:      parseInt(f.gopi_dress) || 0,
    teamName:       f.team_name || null,
    devoteeStatus:  f.devotee_status || 'Expected to be Serious',
    facilitator:    (f.facilitator || '').trim() || null,
    referenceBy:    (f.reference_by || '').trim() || null,
    callingBy:      (f.calling_by || '').trim() || null,
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

  async importDevotees(rows) {
    let imported = 0, skipped = 0, errors = [];
    const list = await DevoteeCache.all();
    const existingMobiles = new Set(list.map(d => d.mobile).filter(Boolean));
    for (let ci = 0; ci < rows.length; ci += 400) {
      const chunk = rows.slice(ci, ci + 400);
      const batch = fdb.batch(); let any = false;
      chunk.forEach((row, i) => {
        try {
          const name   = (row.Name || row.name || '').toString().trim();
          const mobile = (row.Mobile || row.mobile || row.Phone || '').toString().trim();
          if (!name) { skipped++; return; }
          if (mobile && existingMobiles.has(mobile)) { skipped++; return; }
          batch.set(fdb.collection('devotees').doc(), {
            name, mobile: mobile || null,
            address: (row.Address || '').toString() || null,
            dob: (row.DOB || row['Date of Birth'] || '').toString() || null,
            dateOfJoining: (row['Date of Joining'] || '').toString() || null,
            chantingRounds: parseInt(row['Chanting Rounds'] || 0) || 0,
            kanthi: row.Kanthi === 'Yes' ? 1 : 0,
            gopiDress: row['Gopi Dress'] === 'Yes' ? 1 : 0,
            teamName: (row.Team || '').toString() || null,
            devoteeStatus: (row.Status || 'Expected to be Serious').toString(),
            facilitator: (row.Facilitator || '').toString() || null,
            referenceBy: (row.Reference || '').toString() || null,
            callingBy: (row['Calling By'] || '').toString() || null,
            lifetimeAttendance: 0, isActive: true, inactivityFlag: false, createdAt: TS(), updatedAt: TS()
          });
          if (mobile) existingMobiles.add(mobile);
          imported++; any = true;
        } catch (e) { errors.push(`Row ${ci + i + 2}: ${e.message}`); }
      });
      if (any) await batch.commit();
    }
    DevoteeCache.bust();
    return { imported, skipped, errors };
  },

  /* SESSIONS */
  async getTodaySession() {
    const today = getToday();
    const snap = await fdb.collection('sessions').where('sessionDate', '==', today).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, session_date: today };
    const ref = await fdb.collection('sessions').add({ sessionDate: today, createdAt: TS() });
    return { id: ref.id, session_date: today };
  },

  async getSessions() {
    const snap = await fdb.collection('sessions').orderBy('sessionDate', 'desc').limit(30).get();
    return snap.docs.map(d => ({ id: d.id, session_date: d.data().sessionDate }));
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
    return raw.map(d => ({
      ...toSnake(d),
      coming_status: csMap[d.id]?.comingStatus || null,
      calling_notes: csMap[d.id]?.callingNotes || null,
      calling_id:    csMap[d.id]?.id            || null,
    }));
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
    await loadSessionSelector();
  } catch (e) { console.error('Session init', e); }
}

async function loadSessionSelector() {
  const sel = document.getElementById('session-selector');
  try {
    const sessions = await DB.getSessions();
    sel.innerHTML = '<option value="">-- Select Date --</option>';
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = formatDate(s.session_date);
      if (s.id === AppState.currentSessionId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (_) {}
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

async function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const zone   = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary)"></i><p>Importing…</p>`;
  try {
    const ab   = await file.arrayBuffer();
    const wb   = XLSX.read(ab, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const data = await DB.importDevotees(rows);
    result.className = 'import-result success';
    result.innerHTML = `<strong>Done!</strong> Imported: ${data.imported} | Skipped: ${data.skipped}${data.errors.length ? `<br><small>${data.errors.slice(0,3).join(', ')}</small>` : ''}`;
    result.classList.remove('hidden');
    loadDevotees(); loadCallingPersonsFilter();
    showToast(`Imported ${data.imported} devotees!`, 'success');
  } catch (err) {
    result.className = 'import-result error';
    result.textContent = 'Import failed: ' + (err.message || 'Unknown error');
    result.classList.remove('hidden');
    zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i><p>Click to browse or drag & drop</p><input type="file" id="import-file" accept=".xlsx,.xls" style="display:none" onchange="handleImportFile(event)">`;
  }
  e.target.value = '';
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
  ['f-name','f-mobile','f-address'].forEach(id => document.getElementById(id).value = '');
  ['f-dob','f-joining'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-chanting').value = '0';
  document.getElementById('f-team').value = '';
  document.getElementById('f-status').value = 'Expected to be Serious';
  document.getElementById('f-kanthi').value = '0';
  document.getElementById('f-gopi').value = '0';
  clearPicker('picker-facilitator', 'f-facilitator');
  clearPicker('picker-reference',   'f-reference');
  clearPicker('picker-calling-by',  'f-calling-by');
  clearFieldError('mobile');
  // Auto-fill team for coordinators
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
    clearFieldError('mobile');
  } catch (_) { showToast('Failed to load profile', 'error'); }
}

function getFormPayload() {
  return {
    name:           document.getElementById('f-name').value.trim(),
    mobile:         document.getElementById('f-mobile').value.replace(/\D/g,'').slice(0,10),
    address:        document.getElementById('f-address').value.trim(),
    dob:            document.getElementById('f-dob').value,
    date_of_joining:document.getElementById('f-joining').value,
    chanting_rounds:parseInt(document.getElementById('f-chanting').value) || 0,
    team_name:      document.getElementById('f-team').value,
    devotee_status: document.getElementById('f-status').value,
    kanthi:         parseInt(document.getElementById('f-kanthi').value),
    gopi_dress:     parseInt(document.getElementById('f-gopi').value),
    facilitator:    document.getElementById('f-facilitator').value.trim(),
    reference_by:   document.getElementById('f-reference').value.trim(),
    calling_by:     document.getElementById('f-calling-by').value.trim(),
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
  document.getElementById('session-selector').value = sessionId;
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
    list.innerHTML = candidates.map(d => {
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
            <div class="attendance-card-meta">${d.team_name || ''}${d.calling_by ? ' · Called: ' + d.calling_by : ''}</div>
            ${d.mobile ? `<div class="attendance-card-meta" style="margin-top:.2rem" onclick="event.stopPropagation()">${contactIcons(d.mobile)}</div>` : ''}
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
