/* ═══════════════════════════════════════════════════
   FIREBASE.JS  –  Config + Firestore data layer
   Returns snake_case objects so all UI files stay consistent
   ═══════════════════════════════════════════════════ */

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

// ── NORMALISERS ────────────────────────────────────────────────────────────
function tsToISO(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}

// Firestore (camelCase)  →  snake_case for UI
function toSnake(d) {
  if (!d) return null;
  return {
    id: d.id,
    name:               d.name || '',
    mobile:             d.mobile || null,
    address:            d.address || null,
    dob:                d.dob || null,
    date_of_joining:    d.dateOfJoining || null,
    chanting_rounds:    d.chantingRounds || 0,
    kanthi:             d.kanthi || 0,
    gopi_dress:         d.gopiDress || 0,
    team_name:          d.teamName || null,
    devotee_status:     d.devoteeStatus || 'Expected to be Serious',
    facilitator:        d.facilitator || null,
    reference_by:       d.referenceBy || null,
    calling_by:         d.callingBy || null,
    lifetime_attendance:d.lifetimeAttendance || 0,
    is_active:          d.isActive !== false ? 1 : 0,
    inactivity_flag:    d.inactivityFlag ? 1 : 0,
    created_at:         tsToISO(d.createdAt),
    updated_at:         tsToISO(d.updatedAt),
    // extras for joined queries
    coming_status:      d.comingStatus  || null,
    calling_notes:      d.callingNotes  || null,
    called_by:          d.calledBy      || null,
    calling_id:         d.callingId     || null,
    attendance_id:      d.attendanceId  || null,
  };
}

// form data (snake_case) → Firestore (camelCase)
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

// ── LOCAL CACHE ────────────────────────────────────────────────────────────
const DevoteeCache = {
  raw: [],   // raw Firestore data (camelCase)
  stamp: 0,
  TTL: 90000,
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

// ── DB ─────────────────────────────────────────────────────────────────────
const DB = {

  /* ══ DEVOTEES ══════════════════════════════════════════════════════════ */

  async getDevotees(filters = {}) {
    let devotees = await DevoteeCache.all();
    if (filters.search) {
      const s = filters.search.toLowerCase();
      devotees = devotees.filter(d => d.name.toLowerCase().includes(s) || (d.mobile || '').includes(s));
    }
    if (filters.team)       devotees = devotees.filter(d => d.teamName === filters.team);
    if (filters.calling_by) devotees = devotees.filter(d => d.callingBy === filters.calling_by);
    if (filters.status)     devotees = devotees.filter(d => d.devoteeStatus === filters.status);
    return devotees.map(toSnake);
  },

  async getDevotee(id) {
    const doc = await fdb.collection('devotees').doc(id).get();
    if (!doc.exists) return null;
    return toSnake({ id: doc.id, ...doc.data() });
  },

  async getCallingPersons() {
    const devotees = await DevoteeCache.all();
    return [...new Set(devotees.map(d => d.callingBy).filter(Boolean))].sort();
  },

  async createDevotee(formData) {
    const devotees = await DevoteeCache.all();
    const mobile = (formData.mobile || '').trim();
    if (mobile) {
      const ex = devotees.find(d => d.mobile === mobile);
      if (ex) throw { error: 'Duplicate', message: `Mobile already registered to ${ex.name}`, existingId: ex.id };
    }
    const name = (formData.name || '').trim();
    if (name) {
      const exn = devotees.find(d => d.name.trim().toLowerCase() === name.toLowerCase());
      if (exn) throw { error: 'DuplicateName', message: `Name already exists: ${exn.name}`, existingId: exn.id, confirm: true };
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
    const trackMap = {
      name:'name', mobile:'mobile', chantingRounds:'chanting_rounds',
      kanthi:'kanthi', gopiDress:'gopi_dress', teamName:'team_name',
      devoteeStatus:'devotee_status', facilitator:'facilitator',
      referenceBy:'reference_by', callingBy:'calling_by'
    };
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
    const devotees = await DevoteeCache.all();
    const existingMobiles = new Set(devotees.map(d => d.mobile).filter(Boolean));
    // Firestore batch limit = 500 ops
    for (let ci = 0; ci < rows.length; ci += 400) {
      const chunk = rows.slice(ci, ci + 400);
      const batch = fdb.batch();
      let any = false;
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

  /* ══ SESSIONS ══════════════════════════════════════════════════════════ */

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

  /* ══ ATTENDANCE ════════════════════════════════════════════════════════ */

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
      calling_notes: csMap[d.id]?.callingNotes || null,
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
      return { id: d.id, name: dt.devoteeName, mobile: dt.mobile, chanting_rounds: dt.chantingRounds, team_name: dt.teamName, calling_by: dt.callingBy, is_new_devotee: dt.isNewDevotee ? 1 : 0, marked_at: tsToISO(dt.markedAt), session_date: null };
    }).sort((a, b) => (b.marked_at || '').localeCompare(a.marked_at || ''));
  },

  /* ══ CALLING ═══════════════════════════════════════════════════════════ */

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
      called_by:     csMap[d.id]?.calledBy     || null,
      calling_id:    csMap[d.id]?.id            || null,
    }));
  },

  async updateCallingStatus(devoteeId, weekDate, data) {
    const snap = await fdb.collection('callingStatus').where('devoteeId', '==', devoteeId).where('weekDate', '==', weekDate).limit(1).get();
    const payload = { devoteeId, weekDate, comingStatus: data.coming_status || 'Maybe', callingNotes: data.calling_notes || null, calledBy: data.called_by || null, updatedAt: TS() };
    if (snap.empty) await fdb.collection('callingStatus').add(payload);
    else await snap.docs[0].ref.update(payload);
  },

  /* ══ REPORTS ═══════════════════════════════════════════════════════════ */

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

  /* ══ CARE ══════════════════════════════════════════════════════════════ */

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

  /* ══ EVENTS ════════════════════════════════════════════════════════════ */

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

// ── CLIENT-SIDE EXCEL EXPORT helper ────────────────────────────────────────
function downloadExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}
