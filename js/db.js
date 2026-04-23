/* ══ DB.JS – All Firestore operations ══ */

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
    family_members:      d.familyMembers || null,
    family_participants: d.familyParticipants || null,
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
    familyMembers:     f.family_members || null,
    familyParticipants: f.family_participants || null,
    reading:           f.reading || null,
    hearing:           f.hearing || null,
    hobbies:           (f.hobbies || '').trim() || null,
    skills:            (f.skills || '').trim() || null,
    tilak:             parseInt(f.tilak) || 0,
    isNotInterested:   f.is_not_interested || false,
    notInterestedAt:   f.not_interested_at || null,
  };
}

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
    for (let i = 0; i < sessionIds.length; i += 10) {
      const batch = sessionIds.slice(i, i + 10);
      const aSnap = await fdb.collection('attendanceRecords').where('sessionId', 'in', batch).get();
      aSnap.docs.forEach(d => {
        const { sessionId: sid, devoteeId: did } = d.data();
        if (!attMap[sid]) attMap[sid] = new Set();
        attMap[sid].add(did);
      });
    }
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
    const sessSnap = await fdb.collection('sessions').doc(sessionId).get();
    const week = sessSnap.exists ? sessSnap.data().sessionDate : getUpcomingSunday();
    const [cs, at] = await Promise.all([
      fdb.collection('callingStatus').where('weekDate', '==', week).get(),
      fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get()
    ]);
    const confirmed = cs.docs.filter(d => d.data().comingStatus === 'Yes').length;
    const present   = at.size;
    const newD      = at.docs.filter(d => d.data().isNewDevotee).length;
    return { confirmed, present, newDevotees: newD, totalPresent: present };
  },

  /* ATTENDANCE */
  async getAttendanceCandidates(sessionId, search = '') {
    const sessSnap = await fdb.collection('sessions').doc(sessionId).get();
    const week = sessSnap.exists ? sessSnap.data().sessionDate : getUpcomingSunday();
    const [rawDevotees, csSnap, atSnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate', '==', week).get(),
      fdb.collection('attendanceRecords').where('sessionId', '==', sessionId).get()
    ]);
    const csMap = {}, markedAtMap = {};
    csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = d.data(); });
    atSnap.docs.forEach(d => {
      markedAtMap[d.data().devoteeId] = tsToISO(d.data().markedAt);
    });
    const presentSet = new Set(atSnap.docs.map(d => d.data().devoteeId));
    let list = rawDevotees.filter(d => {
      const cs = csMap[d.id];
      return !cs || !['Shift', 'Not Interested'].includes(cs.comingStatus);
    });
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(s) || (d.mobile || '').includes(s));
    }
    return list.map(d => ({
      ...toSnake(d),
      coming_status: csMap[d.id]?.comingStatus || null,
      attendance_id: presentSet.has(d.id) ? d.id : null,
      marked_at:     markedAtMap[d.id] || null,
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

  /* CALLING CONFIG */
  async getCallingWeekConfig() {
    const doc = await fdb.collection('settings').doc('callingWeek').get();
    return doc.exists ? doc.data() : null;
  },
  async setCallingWeekConfig(callingDate, sessionDate) {
    await fdb.collection('settings').doc('callingWeek').set({
      callingDate, sessionDate: sessionDate || '',
      updatedAt: TS(), updatedBy: AppState.userName
    });
  },

  /* CALLING */
  async getCallingStatus(weekDate) {
    const [raw, csSnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate', '==', weekDate).get()
    ]);
    const csMap = {};
    csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = { id: d.id, ...d.data() }; });
    let filtered = raw.filter(d => d.callingBy && d.callingBy.trim() && !d.isNotInterested);
    if (AppState.userRole !== 'superAdmin') {
      filtered = filtered.filter(d => d.callingBy === AppState.userName);
    }
    return filtered.map(d => ({
      ...toSnake(d),
      coming_status:     csMap[d.id]?.comingStatus    || null,
      calling_notes:     csMap[d.id]?.callingNotes    || null,
      calling_reason:    csMap[d.id]?.callingReason   || null,
      available_from:    csMap[d.id]?.availableFrom   || null,
      calling_id:        csMap[d.id]?.id              || null,
      updated_at_client: csMap[d.id]?.updatedAtClient || null,
      late_remarks:      csMap[d.id]?.lateRemarks     || null,
    }));
  },

  async getUsersForTeam(team, search = '') {
    const snap = await fdb.collection('users').get();
    let users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    users = users.filter(u => u.role !== 'superAdmin');
    if (team) users = users.filter(u => u.teamName === team);
    if (search) {
      const s = search.toLowerCase();
      users = users.filter(u => (u.name || '').toLowerCase().includes(s));
    }
    return users;
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
    const now = new Date();
    const snap = await fdb.collection('callingStatus').where('devoteeId', '==', devoteeId).where('weekDate', '==', weekDate).limit(1).get();
    const payload = {
      devoteeId, weekDate,
      comingStatus:    data.coming_status || '',
      updatedAt:       TS(),
      updatedAtClient: now.toISOString(),
    };
    if (data.calling_notes   !== undefined) payload.callingNotes   = data.calling_notes   ?? null;
    if (data.calling_reason  !== undefined) payload.callingReason  = data.calling_reason  ?? null;
    if (data.available_from  !== undefined) payload.availableFrom  = data.available_from  ?? null;
    if (data.late_remarks    !== undefined) payload.lateRemarks    = data.late_remarks    ?? null;
    if (snap.empty) {
      payload.createdAt = TS();
      payload.createdAtClient = now.toISOString();
      await fdb.collection('callingStatus').add(payload);
    } else {
      await snap.docs[0].ref.update(payload);
    }
  },

  async getCallingHistory(devoteeId, weeksBefore = 2) {
    const weeks = [];
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate() - day);
    for (let i = 0; i < weeksBefore; i++) {
      weeks.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() - 7);
    }
    const snaps = await Promise.all(weeks.map(w =>
      fdb.collection('callingStatus').where('devoteeId', '==', devoteeId).where('weekDate', '==', w).limit(1).get()
    ));
    return weeks.map((w, i) => {
      const doc = snaps[i].docs[0];
      return doc ? { weekDate: w, ...doc.data(), id: doc.id } : { weekDate: w, comingStatus: null };
    });
  },

  async getLateSubmissions(weekDate, afterHour = 21) {
    const snap = await fdb.collection('callingStatus').where('weekDate', '==', weekDate).get();
    const all  = await DevoteeCache.all();
    const devMap = {}; all.forEach(d => { devMap[d.id] = d; });
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => {
        const t = r.updatedAtClient || (r.updatedAt?.toDate ? r.updatedAt.toDate().toISOString() : null);
        if (!t) return false;
        return new Date(t).getHours() >= afterHour;
      })
      .map(r => {
        const dev = devMap[r.devoteeId] || {};
        return {
          id: r.id, devoteeId: r.devoteeId,
          name: dev.name || '—', team_name: dev.teamName || '',
          calling_by: dev.callingBy || '',
          coming_status: r.comingStatus || '',
          updated_at_client: r.updatedAtClient || null,
          late_remarks: r.lateRemarks || '',
        };
      })
      .sort((a, b) => (a.updated_at_client || '').localeCompare(b.updated_at_client || ''));
  },

  async saveCallingRemarks(statusId, remarks) {
    await fdb.collection('callingStatus').doc(statusId).update({ lateRemarks: remarks, updatedAt: TS() });
  },

  async submitCallingWeek(weekDate, userId, userName, teamName) {
    const docId = `${userId}_${weekDate}`;
    const now = new Date().toISOString();
    const docRef = fdb.collection('callingSubmissions').doc(docId);
    const existing = await docRef.get();
    if (existing.exists && existing.data().initialSubmittedAtClient) {
      await docRef.update({
        weekDate, userId, userName, teamName: teamName || '',
        submittedAt: TS(), submittedAtClient: now,
      });
    } else {
      await docRef.set({
        weekDate, userId, userName, teamName: teamName || '',
        submittedAt: TS(), submittedAtClient: now,
        initialSubmittedAt: TS(), initialSubmittedAtClient: now,
      });
    }
  },

  async getCallingSubmissions(weekDates) {
    const result = {};
    weekDates.forEach(w => { result[w] = {}; });
    await Promise.all(weekDates.map(async w => {
      const snap = await fdb.collection('callingSubmissions').where('weekDate', '==', w).get();
      snap.docs.forEach(d => {
        const { userName, teamName, submittedAtClient, initialSubmittedAtClient } = d.data();
        result[w][userName] = {
          teamName: teamName || '',
          submittedAtClient: submittedAtClient || null,
          initialSubmittedAtClient: initialSubmittedAtClient || submittedAtClient || null,
        };
      });
    }));
    return result;
  },

  async getMyCallingSubmission(weekDate, userId) {
    const docId = `${userId}_${weekDate}`;
    const doc = await fdb.collection('callingSubmissions').doc(docId).get();
    if (doc.exists) return doc.data();
    const snap = await fdb.collection('callingSubmissions')
      .where('weekDate', '==', weekDate).where('userId', '==', userId).limit(1).get();
    return snap.empty ? null : snap.docs[0].data();
  },

  async getCallingWeeksList() {
    const snap = await fdb.collection('callingSubmissions').orderBy('weekDate', 'desc').get();
    const weeks = [...new Set(snap.docs.map(d => d.data().weekDate).filter(Boolean))];
    return weeks.sort((a, b) => b.localeCompare(a));
  },

  async getSubmissionReport() {
    const [submSnap, usersSnap, allDevotees] = await Promise.all([
      fdb.collection('callingSubmissions').orderBy('weekDate', 'desc').limit(500).get(),
      fdb.collection('users').get(),
      DevoteeCache.all(),
    ]);

    // Last 4 distinct calling dates that have submissions
    const weekDatesSet = new Set();
    submSnap.docs.forEach(d => weekDatesSet.add(d.data().weekDate));
    const fourWeeks = [...weekDatesSet].sort().slice(-4);

    if (!fourWeeks.length) return { fourWeeks: [], teamRows: [] };

    // Team admins: teamName → adminName
    const teamAdminMap = {};
    usersSnap.docs.forEach(d => {
      const u = d.data();
      if (u.role === 'teamAdmin' && u.teamName && u.name) teamAdminMap[u.teamName] = u.name;
    });

    // Submission map: weekDate → userName → { initialSubmittedAtClient }
    const submMap = {};
    fourWeeks.forEach(w => { submMap[w] = {}; });
    submSnap.docs.forEach(d => {
      const { weekDate, userName, teamName, submittedAtClient, initialSubmittedAtClient } = d.data();
      if (!submMap[weekDate]) return;
      submMap[weekDate][userName] = {
        teamName: teamName || '',
        initial: initialSubmittedAtClient || submittedAtClient || null,
      };
    });

    // Coordinator → team from devotees
    const coordTeamMap = {};
    allDevotees.filter(d => d.callingBy && !d.isNotInterested).forEach(d => {
      if (!coordTeamMap[d.callingBy]) coordTeamMap[d.callingBy] = d.teamName || '';
    });
    // Also register team admins themselves
    Object.entries(teamAdminMap).forEach(([team, name]) => {
      if (!coordTeamMap[name]) coordTeamMap[name] = team;
    });
    // Include anyone who submitted but isn't in devotees
    fourWeeks.forEach(w => {
      Object.entries(submMap[w]).forEach(([name, s]) => {
        if (!coordTeamMap[name]) coordTeamMap[name] = s.teamName || '';
      });
    });

    // Build per-team lists
    const teamMap = {};
    Object.entries(coordTeamMap).forEach(([name, team]) => {
      if (!teamMap[team]) teamMap[team] = { admin: teamAdminMap[team] || null, others: [] };
      teamMap[team].others.push(name);
    });

    // Build ordered teamRows: known TEAMS first, then any extras
    const teamRows = [];
    const knownTeamNames = (typeof TEAMS !== 'undefined') ? TEAMS : [];
    [...knownTeamNames, ...Object.keys(teamMap).filter(t => !knownTeamNames.includes(t))].forEach(team => {
      if (!teamMap[team]) return;
      const { admin, others } = teamMap[team];
      const othersSorted = [...new Set(others)].filter(n => n !== admin).sort();
      teamRows.push({ team, admin, coordinators: othersSorted });
    });

    return { fourWeeks, submMap, teamRows };
  },

  async getCallingReport(weekDate) {
    const [raw, snap, usersSnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate', '==', weekDate).get(),
      fdb.collection('users').get()
    ]);
    const csMap = {};
    snap.docs.forEach(d => { csMap[d.data().devoteeId] = d.data(); });
    const userRoleMap = {};
    usersSnap.docs.forEach(d => { const u = d.data(); if (u.name) userRoleMap[u.name] = { role: u.role, position: u.position || null }; });

    const sessSnap = await fdb.collection('sessions')
      .where('sessionDate', '==', weekDate).limit(1).get();
    let attSet = new Set(), hasSession = false;
    if (!sessSnap.empty && !sessSnap.docs[0].data().isCancelled) {
      hasSession = true;
      const attSnap = await fdb.collection('attendanceRecords')
        .where('sessionId', '==', sessSnap.docs[0].id).get();
      attSnap.docs.forEach(d => attSet.add(d.data().devoteeId));
    }

    const active = raw.filter(d => d.callingBy && !d.isNotInterested);
    const STAT_KEYS = ['called','yes','online','festival','notInterested','notCalled','came','yesAndCame','yesNotCame','noButCame'];
    const zeroStats = () => Object.fromEntries(STAT_KEYS.map(k => [k, 0]));

    const result = { _hasSession: hasSession, _totalPresent: attSet.size };
    TEAMS.forEach(team => {
      const members = active.filter(d => d.teamName === team);
      if (!members.length) return;
      const callers = [...new Set(members.map(d => d.callingBy).filter(Boolean))].sort();
      result[team] = { total: members.length, ...zeroStats(), callers: {} };
      callers.forEach(caller => {
        const sub = members.filter(d => d.callingBy === caller);
        const s = { total: sub.length, ...zeroStats() };
        sub.forEach(d => {
          const cs = csMap[d.id];
          const came = attSet.has(d.id);
          if (came) s.came++;
          if (!cs) { s.notCalled++; return; }
          s.called++;
          if (cs.comingStatus === 'Yes') { s.yes++; came ? s.yesAndCame++ : s.yesNotCame++; }
          else if (cs.callingReason === 'online_class' || cs.comingStatus === 'Shift') { s.online++; }
          else if (cs.callingReason === 'festival_calling') { s.festival++; }
          else if (cs.callingReason === 'not_interested_now') { s.notInterested++; }
        });
        s.isCoordinator = userRoleMap[caller]?.role === 'teamAdmin';
        s.position = s.isCoordinator ? 'Coordinator' : (userRoleMap[caller]?.position || 'Calling Sevak');
        result[team].callers[caller] = s;
        STAT_KEYS.forEach(k => { result[team][k] += s[k]; });
      });
    });
    return result;
  },

  async getYesAbsentList(weekDate) {
    const [all, csSnap, sessSnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate','==',weekDate).where('comingStatus','==','Yes').get(),
      fdb.collection('sessions').where('sessionDate','==',weekDate).limit(1).get()
    ]);
    const devMap = {};
    all.forEach(d => { devMap[d.id] = d; });
    const yesIds = csSnap.docs.map(d => d.data().devoteeId);
    if (sessSnap.empty || sessSnap.docs[0].data().isCancelled) return { hasSession:false, list:[] };
    const attSnap = await fdb.collection('attendanceRecords').where('sessionId','==',sessSnap.docs[0].id).get();
    const attSet = new Set(attSnap.docs.map(d => d.data().devoteeId));
    const list = yesIds.filter(id => !attSet.has(id)).map(id => {
      const d = devMap[id] || {};
      return { id, name:d.name||'—', teamName:d.teamName||'', callingBy:d.callingBy||'', mobile:d.mobile||'' };
    }).sort((a,b) => (a.teamName||'').localeCompare(b.teamName||'') || a.name.localeCompare(b.name));
    return { hasSession:true, list };
  },

  /* REPORTS */
  async getAttendanceReport(sessionId) {
    return this.getSessionAttendance(sessionId);
  },

  async getTeamsReport(weekDate, sessionId) {
    const teams = TEAMS;
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
      const callingList = td.filter(d => { const cs = csMap[d.id]; return !cs || !['Shift','Not Interested'].includes(cs.comingStatus); });
      const target = td.filter(d => csMap[d.id]?.comingStatus === 'Yes');
      const actual = td.filter(d => presentSet.has(d.id));
      return { team, total: td.length, callingList: callingList.length, target: target.length, actualPresent: actual.length, percentage: target.length > 0 ? Math.round(actual.length / target.length * 100) : 0 };
    });
  },

  async getCallingMgmtData(currentWeek) {
    const fourWeeksAgo = (() => {
      const d = new Date(currentWeek + 'T00:00:00');
      d.setDate(d.getDate() - 28);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();

    const [allDevotees, csCurrentSnap, csHistorySnap] = await Promise.all([
      DevoteeCache.all(),
      fdb.collection('callingStatus').where('weekDate', '==', currentWeek).get(),
      fdb.collection('callingStatus')
        .where('weekDate', '>=', fourWeeksAgo)
        .where('weekDate', '<=', currentWeek)
        .get(),
    ]);

    const csCurrentMap = {};
    csCurrentSnap.docs.forEach(d => { csCurrentMap[d.data().devoteeId] = d.data(); });

    const csHistoryMap = {};
    csHistorySnap.docs.forEach(d => {
      const { devoteeId, comingStatus, callingReason, weekDate } = d.data();
      if (!csHistoryMap[devoteeId]) csHistoryMap[devoteeId] = [];
      csHistoryMap[devoteeId].push({ comingStatus, callingReason, weekDate });
    });

    const active = allDevotees.filter(d => d.callingBy && !d.isNotInterested);
    return active.map(d => ({
      id: d.id,
      name: d.name,
      mobile: d.mobile || '',
      team_name: d.teamName || '',
      calling_by: d.callingBy || '',
      lifetime_attendance: d.lifetimeAttendance || 0,
      chanting_rounds: d.chantingRounds || 0,
      current_status: csCurrentMap[d.id]?.comingStatus || null,
      current_reason: csCurrentMap[d.id]?.callingReason || null,
      history: (csHistoryMap[d.id] || [])
        .sort((a, b) => b.weekDate.localeCompare(a.weekDate))
        .slice(0, 4),
    }));
  },

  async getTeamChangeHistory(devoteeId) {
    const snap = await fdb.collection('profileChanges')
      .where('devoteeId', '==', devoteeId)
      .where('fieldName', '==', 'team_name')
      .orderBy('changedAt', 'desc')
      .limit(30)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getSeriousReport(weekDate, sessionId) {
    const teams = TEAMS;
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

  // ── MANAGEMENT / CALLING WEEK HISTORY ─────────────────────────────
  async getCallingWeekHistory(limit = 4) {
    const snap = await fdb.collection('callingWeekHistory')
      .orderBy('callingDate', 'desc').limit(limit).get();
    return snap.docs.map(d => d.data()).reverse();
  },

  async setCallingWeekHistory(callingDate, sessionDate) {
    await fdb.collection('callingWeekHistory').doc(callingDate).set({
      callingDate,
      sessionDate: sessionDate || null,
      updatedAt: TS(),
      updatedBy: AppState.userId || null,
    }, { merge: true });
  },

  async getMgmtGridData(weekEntries) {
    const results = await Promise.all(weekEntries.map(async ({ callingDate, sessionDate }) => {
      const csSnap = await fdb.collection('callingStatus')
        .where('weekDate', '==', callingDate).get();
      const csMap = {};
      csSnap.docs.forEach(d => { csMap[d.data().devoteeId] = d.data(); });

      let atSet = new Set();
      if (sessionDate) {
        const sessSnap = await fdb.collection('sessions')
          .where('sessionDate', '==', sessionDate).limit(1).get();
        if (!sessSnap.empty) {
          const attSnap = await fdb.collection('attendanceRecords')
            .where('sessionId', '==', sessSnap.docs[0].id).get();
          attSnap.docs.forEach(d => atSet.add(d.data().devoteeId));
        }
      }
      return { callingDate, sessionDate, csMap, atSet };
    }));
    return results;
  },

  async getMgmtSeparateLists() {
    const all = await DevoteeCache.all();
    const online = all.filter(d => d.callingMode === 'online');
    const festival = all.filter(d => d.callingMode === 'festival');
    const notInterested = all.filter(d => d.callingMode === 'not_interested' || d.isNotInterested === true);
    return { online, festival, notInterested };
  },

  async setDevoteeCallingMode(devoteeId, mode) {
    const updateData = { callingMode: mode || '', callingBy: '', updatedAt: TS() };
    await fdb.collection('devotees').doc(devoteeId).update(updateData);
    await fdb.collection('profileChanges').add({
      devoteeId,
      changedBy: AppState.userId || '',
      changedByName: AppState.userName || '',
      changeType: 'callingMode',
      newValue: mode || '',
      timestamp: TS(),
    });
    DevoteeCache.bust();
  },
};
