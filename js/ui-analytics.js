/* ══ UI-ANALYTICS.JS – Reports, Care, Events tabs ══ */

// ── REPORTS TAB ───────────────────────────────────────
let _reportsCategory = 'attendance';

function switchReportsCategory(cat, btn) {
  _reportsCategory = cat;
  const tabsRow = btn?.parentElement;
  if (tabsRow) tabsRow.querySelectorAll('.att-sub-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('reports-cat-attendance')?.classList.toggle('active', cat === 'attendance');
  document.getElementById('reports-cat-calling')?.classList.toggle('active', cat === 'calling');
  if (cat === 'calling') {
    _populateReportWeeks?.().then(() => loadCallingReports?.());
  } else {
    loadReports();
  }
}

function switchCallingRptSub(btn, which) {
  const container = document.getElementById('reports-cat-calling');
  if (!container) return;
  container.querySelectorAll(':scope > .sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  container.querySelectorAll(':scope > .sub-panel').forEach(p => p.classList.remove('active'));
  if (which === 'weekly') {
    document.getElementById('subtab-calling-weekly')?.classList.add('active');
    _populateReportWeeks?.().then(() => loadCallingReports?.());
  } else if (which === 'submission') {
    document.getElementById('subtab-calling-submission')?.classList.add('active');
    loadLateReports?.();
  }
}

function loadReports() {
  if (_reportsCategory === 'calling') return;
  const active = document.querySelector('#reports-cat-attendance .sub-panel.active');
  if (!active) return;
  const id = active.id.replace('subtab-', '');
  if (id === 'attendance-detail') loadYearlySheet();
  if (id === 'serious-analysis')  loadSeriousAnalysis();
  if (id === 'team-leaderboard')  loadTeamLeaderboard();
  if (id === 'trends')            loadTrends();
  if (id === 'newcomers-report')  loadNewComersReport();
}

// Reports → Attendance Reports → New Comers
async function loadNewComersReport() {
  const el = document.getElementById('newcomers-report-content');
  if (!el) return;
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const sess = _reportActive;
    if (!sess) { el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Pick a session above</p></div>'; return; }

    const [attSnap, all] = await Promise.all([
      fdb.collection('attendanceRecords')
        .where('sessionId', '==', sess.id)
        .where('isNewDevotee', '==', true).get(),
      DevoteeCache.all(),
    ]);

    const byId = Object.fromEntries(all.map(d => [d.id, d]));
    const seen = new Set();
    const list = [];

    attSnap.docs.forEach(doc => {
      const a = doc.data();
      if (seen.has(a.devoteeId)) return;
      seen.add(a.devoteeId);
      const d = byId[a.devoteeId] || {};
      list.push({
        id: a.devoteeId,
        name: d.name || a.devoteeName || '—',
        mobile: d.mobile || a.mobile || '',
        teamName: d.teamName || a.teamName || '',
        callingBy: d.callingBy || a.callingBy || '',
        referenceBy: d.referenceBy || '',
        chantingRounds: d.chantingRounds || 0,
        source: 'attended',
      });
    });
    all.forEach(d => {
      if (seen.has(d.id))                        return;
      if (d.isActive === false)                  return;
      if (!d.dateOfJoining)                      return;
      if (d.dateOfJoining !== sess.session_date) return;
      seen.add(d.id);
      list.push({
        id: d.id,
        name: d.name || '—',
        mobile: d.mobile || '',
        teamName: d.teamName || '',
        callingBy: d.callingBy || '',
        referenceBy: d.referenceBy || '',
        chantingRounds: d.chantingRounds || 0,
        source: 'joined',
      });
    });

    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-seedling"></i><p>No new devotees for ${formatDate(sess.session_date)}</p></div>`;
      return;
    }

    el.innerHTML = `
      <div style="font-size:.84rem;margin-bottom:.6rem;color:var(--text-muted)">
        <i class="fas fa-user-plus"></i> ${list.length} new for
        <strong style="color:var(--primary)">${formatDate(sess.session_date)}</strong>
      </div>
      <div style="overflow-x:auto">
        <table class="report-table">
          <thead><tr>
            <th>#</th><th>Name</th><th>Source</th><th>Mobile</th><th>Reference</th>
            <th>Team</th><th>Calling By</th><th style="text-align:center">C.R.</th>
          </tr></thead>
          <tbody>${list.map((d, i) => `<tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td><button class="cm-link" onclick="openProfileModal('${d.id}')">${d.name}</button></td>
            <td>${d.source === 'attended' ? '<span class="newcomer-tag tag-attended">Attended</span>' : '<span class="newcomer-tag tag-joined">Joined</span>'}</td>
            <td>${d.mobile ? contactIcons(d.mobile) + ' <span style="font-size:.78rem">' + d.mobile + '</span>' : '—'}</td>
            <td style="font-size:.82rem">${d.referenceBy || '—'}</td>
            <td>${d.teamName ? teamBadge(d.teamName) : '<span style="color:var(--text-muted);font-size:.78rem">— Unassigned —</span>'}</td>
            <td style="font-size:.82rem">${d.callingBy || '<span style="color:var(--text-muted)">— Unassigned —</span>'}</td>
            <td style="text-align:center">${d.chantingRounds || 0}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  } catch (e) {
    console.error('loadNewComersReport', e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

// ── REPORT SESSION FILTER ─────────────────────────────
// Replaces weekly/monthly + date picker. Reports are pinned to a specific
// past session (the session dates configured in Session Configuration).
let _reportSessions = [];        // [{ id, session_date, topic, ... }]
let _reportMonths   = [];        // distinct "YYYY-MM" (past sessions only)
let _reportActive   = null;      // { id, session_date }

function getWeekDate() {
  // Prefer the selected session date; fall back to today so callers never get empty.
  return _reportActive?.session_date
      || document.getElementById('report-session')?.value
      || getToday();
}

function _monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

async function initReportsSessionFilter() {
  try {
    const today = getToday();
    const all = await DB.getSessions();                  // newest first, up to 52
    // Only past sessions (past & today) are reportable
    _reportSessions = all.filter(s => s.session_date <= today);
    if (!_reportSessions.length) {
      document.getElementById('report-month').innerHTML   = '<option value="">No past sessions</option>';
      document.getElementById('report-session').innerHTML = '<option value="">—</option>';
      return;
    }
    _reportMonths = [...new Set(_reportSessions.map(s => s.session_date.slice(0, 7)))];
    const monthSel = document.getElementById('report-month');
    monthSel.innerHTML = _reportMonths.map(m => `<option value="${m}">${_monthLabel(m)}</option>`).join('');

    // Default: latest past session → its month and that session selected
    const latest = _reportSessions[0];
    monthSel.value = latest.session_date.slice(0, 7);
    _populateReportSessionSelect(monthSel.value);
    document.getElementById('report-session').value = latest.id;
    _reportActive = latest;
    AppState.currentReportSessionId = latest.id;
  } catch (e) { console.error('initReportsSessionFilter', e); }
}

function _populateReportSessionSelect(ym) {
  const sessionSel = document.getElementById('report-session');
  if (!sessionSel) return;
  const inMonth = _reportSessions.filter(s => s.session_date.slice(0, 7) === ym);
  sessionSel.innerHTML = inMonth.map(s => {
    const d = new Date(s.session_date + 'T00:00:00')
      .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<option value="${s.id}">${d}${s.topic ? ' · ' + s.topic.slice(0, 32) : ''}</option>`;
  }).join('');
}

function _refreshAfterFilter() {
  if (_reportsCategory === 'calling') {
    const activeSub = document.querySelector('#reports-cat-calling .sub-panel.active');
    if (activeSub?.id === 'subtab-calling-submission') loadLateReports?.();
    else { _populateReportWeeks?.().then(() => loadCallingReports?.()); }
  } else {
    loadReports();
  }
}

function _onReportMonthChange() {
  const ym = document.getElementById('report-month').value;
  if (!ym) return;
  _populateReportSessionSelect(ym);
  const inMonth = _reportSessions.filter(s => s.session_date.slice(0, 7) === ym);
  if (inMonth.length) {
    document.getElementById('report-session').value = inMonth[0].id;
    _reportActive = inMonth[0];
    AppState.currentReportSessionId = inMonth[0].id;
    _refreshAfterFilter();
  }
}

function _onReportSessionChange() {
  const id = document.getElementById('report-session').value;
  const sess = _reportSessions.find(s => s.id === id);
  if (sess) {
    _reportActive = sess;
    AppState.currentReportSessionId = sess.id;
    _refreshAfterFilter();
  }
}

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
    const data = await DB.getSeriousReport(getWeekDate(), AppState.currentReportSessionId || AppState.currentSessionId);
    const teams    = TEAMS;
    const statuses = ['Most Serious','Serious','Expected to be Serious'];
    c.innerHTML = `<div style="overflow-x:auto"><table class="report-table">
      <thead>
        <tr><th>Team</th>${statuses.map(s => `<th colspan="2" style="text-align:center">${shortStatus(s)}</th>`).join('')}</tr>
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
    const data = (await DB.getTeamsReport(getWeekDate(), AppState.currentReportSessionId || AppState.currentSessionId)).sort((a, b) => b.percentage - a.percentage);
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
    const period = 'weekly';  // main Session filter replaces per-sub-tab period
    const team = document.getElementById('trend-team')?.value || '';
    const data = await DB.getTrends(period, team);
    const canvas = document.getElementById('trends-chart');
    if (!canvas) return;
    if (AppState.trendsChart) { AppState.trendsChart.destroy(); AppState.trendsChart = null; }
    const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
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

// ── DEVOTEE CARE TAB ──────────────────────────────────
// Cache the loaded lists so clicking a card can open a detail modal.
const _careCache = {
  absentWeek:   { title: 'Absent This Week',        list: [] },
  absent2Weeks: { title: 'Absent 2+ Weeks',         list: [] },
  newcomers:    { title: 'Returning Newcomers',     list: [] },
  inactive:     { title: 'Inactivity Alerts (3+ wk)', list: [] },
  saidComing:   { title: 'Said Coming — Didn\'t Come', list: [] },
};
let _careCurrentType = null;

async function loadCareData() {
  await Promise.all([
    loadAbsentDevotees(),
    loadReturningNewcomers(),
    loadInactiveDevotees(),
    loadSaidComingDidntCome(),
  ]);
}

async function loadAbsentDevotees() {
  try {
    const { absentThisWeek, absentPast2Weeks } = await DB.getCareAbsent();
    document.getElementById('absent-week-count').textContent   = absentThisWeek.length;
    document.getElementById('absent-2weeks-count').textContent = absentPast2Weeks.length;
    _careCache.absentWeek.list   = absentThisWeek;
    _careCache.absent2Weeks.list = absentPast2Weeks;
  } catch (_) {}
}

async function loadReturningNewcomers() {
  try {
    const devotees = await DB.getCareNewcomers();
    document.getElementById('newcomers-count').textContent = devotees.length;
    _careCache.newcomers.list = devotees;
  } catch (_) {}
}

async function loadInactiveDevotees() {
  try {
    const devotees = await DB.getCareInactive();
    document.getElementById('inactive-count').textContent = devotees.length;
    _careCache.inactive.list = devotees;
  } catch (_) {}
}

// Said coming on the most recent past Sunday's calling but didn't attend.
async function loadSaidComingDidntCome() {
  try {
    const today = getToday();
    const sessSnap = await fdb.collection('sessions')
      .where('sessionDate', '<=', today)
      .orderBy('sessionDate', 'desc').limit(1).get();
    if (sessSnap.empty) { document.getElementById('said-coming-count').textContent = '0'; return; }
    const weekDate = sessSnap.docs[0].data().sessionDate;
    const { list } = await DB.getYesAbsentList(weekDate);
    // Enrich with extra fields from the devotee cache so the detail table has
    // reference / chanting_rounds etc.
    const all = await DevoteeCache.all();
    const byId = Object.fromEntries(all.map(d => [d.id, d]));
    const enriched = (list || []).map(item => {
      const d = byId[item.id] || {};
      return {
        id: item.id,
        name: item.name || d.name,
        mobile: item.mobile || d.mobile || '',
        team_name: item.teamName || d.teamName || '',
        calling_by: item.callingBy || d.callingBy || '',
        reference_by: d.referenceBy || '',
        chanting_rounds: d.chantingRounds || 0,
      };
    });
    document.getElementById('said-coming-count').textContent = enriched.length;
    _careCache.saidComing.list     = enriched;
    _careCache.saidComing.weekDate = weekDate;
  } catch (e) {
    console.error('loadSaidComingDidntCome', e);
  }
}

function openCareDetail(type) {
  const bucket = _careCache[type];
  if (!bucket) return;
  _careCurrentType = type;
  const titleEl  = document.getElementById('care-detail-title');
  const content  = document.getElementById('care-detail-content');
  titleEl.innerHTML = `<i class="fas fa-heart"></i> ${bucket.title}`;
  const list = bucket.list || [];
  if (!list.length) {
    content.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>All clear!</p></div>`;
    openModal('care-detail-modal');
    return;
  }
  content.innerHTML = `
    <div style="margin-bottom:.5rem;color:var(--text-muted);font-size:.82rem">${list.length} devotee${list.length === 1 ? '' : 's'}</div>
    <div style="overflow-x:auto">
      <table class="report-table">
        <thead><tr>
          <th>#</th><th>Name</th><th>Mobile</th><th>Reference</th><th>Team</th><th>Calling By</th><th style="text-align:center">C.R.</th>
        </tr></thead>
        <tbody>${list.map((d, i) => `<tr>
          <td style="color:var(--text-muted)">${i + 1}</td>
          <td><button class="cm-link" onclick="closeModal('care-detail-modal'); openProfileModal('${d.id}')">${d.name || '—'}</button></td>
          <td>${d.mobile ? contactIcons(d.mobile) + ' <span style="font-size:.78rem">' + d.mobile + '</span>' : '—'}</td>
          <td style="font-size:.82rem">${d.reference_by || '—'}</td>
          <td>${teamBadge(d.team_name)}</td>
          <td style="font-size:.82rem">${d.calling_by || '—'}</td>
          <td style="text-align:center">${d.chanting_rounds || 0}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  openModal('care-detail-modal');
}

async function exportCareDetail() {
  if (!_careCurrentType) return;
  const bucket = _careCache[_careCurrentType];
  const list   = bucket?.list || [];
  if (!list.length) { showToast('Nothing to export', 'error'); return; }
  const rows = list.map((d, i) => ({
    '#':            i + 1,
    Name:           d.name || '',
    Mobile:         d.mobile || '',
    Reference:      d.reference_by || '',
    Team:           d.team_name || '',
    'Calling By':   d.calling_by || '',
    'Chanting Rounds': d.chanting_rounds || 0,
  }));
  downloadExcel(rows, `care_${_careCurrentType}_${getToday()}.xlsx`);
}

// ── EVENTS TAB ────────────────────────────────────────
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

// ══ MANAGEMENT TAB ══════════════════════════════════════

function toggleMgmtConfig(btn) {
  const row = document.getElementById('mgmt-config-row');
  const hidden = row.classList.toggle('hidden');
  btn.innerHTML = hidden
    ? '<i class="fas fa-cog"></i> Configure'
    : '<i class="fas fa-times"></i> Close';
}

async function saveMgmtCallingDates() {
  const cd = document.getElementById('mgmt-config-calling-date')?.value;
  const sd = document.getElementById('mgmt-config-session-date')?.value;
  if (!cd) { showToast('Please enter a calling date', 'error'); return; }
  try {
    await Promise.all([
      DB.setCallingWeekConfig(cd, sd),
      DB.setCallingWeekHistory(cd, sd),
    ]);
    showToast('Dates saved!', 'success');
    // Collapse config row and reset button label
    const row = document.getElementById('mgmt-config-row');
    if (row) row.classList.add('hidden');
    const cfgBtn = document.querySelector('#tab-management .btn[onclick*="toggleMgmtConfig"]');
    if (cfgBtn) cfgBtn.innerHTML = '<i class="fas fa-cog"></i> Configure';
    // Keep calling tab hidden-input in sync so Export Calling FY works
    const hw = document.getElementById('calling-week');
    if (hw) hw.value = cd;
    window._callingSessionDate = sd;
    loadMgmtTab();
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

async function loadMgmtTab() {
  const el = document.getElementById('mgmt-tab-content');
  if (!el) return;

  // Pre-fill date config inputs
  const cfg = await DB.getCallingWeekConfig().catch(() => null);
  if (cfg?.callingDate) {
    const i = document.getElementById('mgmt-config-calling-date');
    if (i) i.value = cfg.callingDate;
  }
  if (cfg?.sessionDate) {
    const i = document.getElementById('mgmt-config-session-date');
    if (i) i.value = cfg.sessionDate;
  }

  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const weeks = await DB.getCallingWeekHistory(4);
    const [gridData, allDevotees] = await Promise.all([
      weeks.length ? DB.getMgmtGridData(weeks) : Promise.resolve([]),
      DevoteeCache.all(),
    ]);
    // Compute separate lists from the already-loaded allDevotees array.
    const lists = {
      online:        allDevotees.filter(d => d.callingMode === 'online'),
      festival:      allDevotees.filter(d => d.callingMode === 'festival'),
      notInterested: allDevotees.filter(d => d.callingMode === 'not_interested' || d.isNotInterested === true),
    };
    const activeDevotees = allDevotees.filter(d =>
      d.isActive !== false && d.callingBy && !d.callingMode && !d.isNotInterested
    );
    el.innerHTML = _buildMgmtGrid(gridData, activeDevotees) + _buildMgmtSeparateLists(lists);
  } catch (e) {
    console.error('loadMgmtTab', e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function _buildMgmtGrid(weekData, devotees) {
  if (!devotees.length) {
    return '<div class="empty-state"><i class="fas fa-inbox"></i><p>No devotees with calling assignments found</p></div>';
  }
  const teamMap = {};
  devotees.forEach(d => {
    const t = d.teamName || 'Unknown';
    if (!teamMap[t]) teamMap[t] = [];
    teamMap[t].push(d);
  });

  function fmt(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y.slice(-2)}`;
  }

  const wkHdr1 = weekData.map(w => {
    const dt = new Date(w.callingDate + 'T00:00:00');
    const lbl = dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    return `<th colspan="2" style="text-align:center;background:#1a5c3a;color:#fff;white-space:nowrap">${lbl}</th>`;
  }).join('');

  const wkHdr2 = weekData.map(w =>
    `<th style="text-align:center;font-size:.7rem;background:#2d7a57;color:#fff;padding:.25rem .4rem;white-space:nowrap">CS<br><span style="font-weight:400">${fmt(w.callingDate)}</span></th>` +
    `<th style="text-align:center;font-size:.7rem;background:#2d7a57;color:#fff;padding:.25rem .4rem;white-space:nowrap">AT<br><span style="font-weight:400">${fmt(w.sessionDate)}</span></th>`
  ).join('');

  function csCell(cs) {
    if (!cs) return '<td style="background:#fafafa;min-width:32px"></td>';
    const s = cs.comingStatus, r = cs.callingReason;
    if (s === 'Yes') return '<td style="background:#a5d6a7;text-align:center;font-weight:700;font-size:.75rem">✓</td>';
    if (r === 'online_class') return '<td style="background:#bbdefb;text-align:center;font-size:.7rem" title="Online">OL</td>';
    if (r === 'festival_calling') return '<td style="background:#fff9c4;text-align:center;font-size:.7rem" title="Festival">FE</td>';
    if (r === 'not_interested_now') return '<td style="background:#ffcdd2;text-align:center;font-size:.7rem" title="Not Interested">NI</td>';
    if (r) return `<td style="background:#ffe0b2;text-align:center;font-size:.65rem" title="${r}">✗</td>`;
    return '<td style="background:#fafafa"></td>';
  }

  function atCell(devoteeId, atSet) {
    return atSet && atSet.has(devoteeId)
      ? '<td style="background:#4caf50;color:#fff;text-align:center;font-weight:700;font-size:.75rem">P</td>'
      : '<td style="background:#fafafa"></td>';
  }

  let html = `<div style="overflow-x:auto">
  <table style="border-collapse:collapse;min-width:600px;width:100%;font-size:.8rem">
    <thead>
      <tr>
        <th rowspan="2" class="mgmt-col-sticky" style="left:0;min-width:30px;background:#1a5c3a;color:#fff;padding:.4rem .3rem">#</th>
        <th rowspan="2" class="mgmt-col-sticky" style="left:30px;min-width:160px;background:#1a5c3a;color:#fff;text-align:left;padding:.4rem .6rem">Name</th>
        <th rowspan="2" style="min-width:80px;background:#1a5c3a;color:#fff">Team</th>
        <th rowspan="2" style="min-width:110px;background:#1a5c3a;color:#fff">Calling By</th>
        ${wkHdr1}
        <th rowspan="2" style="text-align:center;background:#1a5c3a;color:#fff;min-width:44px">Total<br>AT</th>
        <th rowspan="2" style="text-align:center;background:#1a5c3a;color:#fff;min-width:60px">Action</th>
      </tr>
      <tr>${wkHdr2}</tr>
    </thead>
    <tbody>`;

  let sno = 1;
  TEAMS.forEach(team => {
    const members = teamMap[team];
    if (!members) return;
    html += `<tr style="background:#e8f5e9">
      <td class="mgmt-col-sticky" style="left:0;background:#e8f5e9;text-align:center;font-size:.75rem;color:var(--primary);font-weight:700">${members.length}</td>
      <td class="mgmt-col-sticky" style="left:30px;background:#e8f5e9;font-weight:700;color:var(--primary);padding:.35rem .6rem">${team}</td>
      <td colspan="${2 + weekData.length * 2 + 2}" style="background:#e8f5e9"></td>
    </tr>`;
    members.forEach(d => {
      const wkCells = weekData.map(w => csCell(w.csMap[d.id]) + atCell(d.id, w.atSet)).join('');
      const totalAt = weekData.reduce((n, w) => n + (w.atSet && w.atSet.has(d.id) ? 1 : 0), 0);
      html += `<tr>
        <td class="mgmt-col-sticky" style="left:0;background:#fff;text-align:center;color:var(--text-muted);border-bottom:1px solid #f0f0f0">${sno++}</td>
        <td class="mgmt-col-sticky" style="left:30px;background:#fff;border-bottom:1px solid #f0f0f0;padding:.3rem .5rem">
          <button onclick="openMgmtAction('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')"
            style="background:none;border:none;cursor:pointer;font-weight:600;color:var(--primary);padding:0;text-align:left;font-size:.8rem;width:100%">${d.name}</button>
          ${d.mobile ? `<div style="font-size:.68rem;color:var(--text-muted)">${d.mobile}</div>` : ''}
        </td>
        <td style="border-bottom:1px solid #f0f0f0;padding:.3rem .4rem;white-space:nowrap">
          ${teamBadge(team)}
          <button onclick="showMgmtTeamHistory('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')" title="Team change history" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.72rem;padding:.1rem .25rem;margin-left:.15rem;vertical-align:middle;opacity:.7">
            <i class="fas fa-pencil-alt"></i>
          </button>
        </td>
        <td style="border-bottom:1px solid #f0f0f0;padding:.3rem .4rem;font-size:.75rem;color:var(--text-muted)">${d.callingBy || '—'}</td>
        ${wkCells}
        <td style="text-align:center;font-weight:700;color:var(--primary);border-bottom:1px solid #f0f0f0">${d.lifetimeAttendance || totalAt}</td>
        <td style="border-bottom:1px solid #f0f0f0;padding:.3rem .4rem;text-align:center">
          <button onclick="openMgmtAction('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')"
            style="font-size:.72rem;padding:.2rem .5rem;background:var(--accent-light);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--primary);font-weight:600;white-space:nowrap">
            <i class="fas fa-bolt"></i> Action
          </button>
        </td>
      </tr>`;
    });
  });
  html += `</tbody></table></div>`;
  return html;
}

function _buildMgmtSeparateLists({ online, festival, notInterested }) {
  function section(title, icon, bgColor, items) {
    if (!items.length) return '';
    const rows = items.map((d, i) => `<tr style="font-size:.82rem">
      <td style="color:var(--text-muted);text-align:center">${i + 1}</td>
      <td style="font-weight:600">${d.name || ''}</td>
      <td style="font-size:.75rem">${d.mobile || '—'}</td>
      <td style="white-space:nowrap">
        ${teamBadge(d.teamName)}
        <button onclick="showMgmtTeamHistory('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')" title="Team change history" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.72rem;padding:.1rem .25rem;margin-left:.15rem;vertical-align:middle;opacity:.7">
          <i class="fas fa-pencil-alt"></i>
        </button>
      </td>
      <td style="font-size:.75rem;color:var(--text-muted)">${d.callingBy || '—'}</td>
      <td><button onclick="restoreMgmtDevotee('${d.id}')"
        style="font-size:.72rem;padding:.15rem .45rem;background:#e8f5e9;border:1px solid var(--secondary);border-radius:4px;cursor:pointer;color:var(--primary)">
        <i class="fas fa-undo"></i> Restore
      </button></td>
    </tr>`).join('');
    return `<div class="sr-team-block" style="margin-bottom:1.25rem">
      <div class="sr-team-banner" style="background:${bgColor};color:#fff">
        <i class="${icon}"></i> ${title} <span style="font-size:.8rem;font-weight:400;opacity:.85">(${items.length})</span>
      </div>
      <table class="calling-table sr-table" style="margin:0">
        <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Team</th><th>Calling By</th><th>Restore</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }
  const parts = [
    section('Online Class', 'fas fa-laptop', '#1565c0', online),
    section('Festival Calling', 'fas fa-star', '#e65100', festival),
    section('Not Interested', 'fas fa-ban', '#b71c1c', notInterested),
  ].filter(Boolean);
  if (!parts.length) return '';
  return `<div style="margin-top:1.75rem">
    <div style="font-size:.85rem;font-weight:600;color:var(--text-muted);margin-bottom:.75rem;padding-bottom:.35rem;border-bottom:2px solid var(--border)">
      <i class="fas fa-layer-group"></i> Shifted Devotees — Removed from Calling List
    </div>${parts.join('')}
  </div>`;
}

function openMgmtAction(devoteeId, devoteeName) {
  document.getElementById('mgmt-action-devotee-id').value = devoteeId;
  document.getElementById('mgmt-action-name').textContent = devoteeName;
  document.getElementById('mgmt-team-picker').style.display = 'none';
  document.getElementById('mgmt-action-modal').classList.remove('hidden');
}

async function doMgmtAction(type) {
  const devoteeId = document.getElementById('mgmt-action-devotee-id').value;
  if (!devoteeId) return;
  if (type === 'team') {
    const picker = document.getElementById('mgmt-team-picker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    return;
  }
  if (type === 'team_confirm') {
    const newTeam = document.getElementById('mgmt-new-team').value;
    if (!newTeam) return;
    try {
      const allD = await DevoteeCache.all();
      const oldTeam = allD.find(d => d.id === devoteeId)?.teamName || '';
      await fdb.collection('devotees').doc(devoteeId).update({ teamName: newTeam, updatedAt: TS() });
      await fdb.collection('profileChanges').add({ devoteeId, fieldName: 'team_name', oldValue: oldTeam, newValue: newTeam, changedBy: AppState.userName, changedAt: TS() });
      DevoteeCache.bust();
      closeModal('mgmt-action-modal');
      showToast('Team changed!', 'success');
      loadMgmtTab();
    } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
    return;
  }
  const labels = { online: 'Online Class', festival: 'Festival Calling', not_interested: 'Not Interested' };
  const name = document.getElementById('mgmt-action-name').textContent;
  if (!confirm(`Shift "${name}" to ${labels[type]}?\n\nThis will remove them from the calling list and clear their Calling By assignment.`)) return;
  try {
    await DB.setDevoteeCallingMode(devoteeId, type);
    closeModal('mgmt-action-modal');
    showToast(`Shifted to ${labels[type]}!`, 'success');
    loadMgmtTab();
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

async function restoreMgmtDevotee(devoteeId) {
  if (!confirm('Restore to regular calling list?\nTheir Calling By will need to be reassigned.')) return;
  try {
    await fdb.collection('devotees').doc(devoteeId).update({ callingMode: '', isNotInterested: false, updatedAt: TS() });
    DevoteeCache.bust();
    showToast('Restored!', 'success');
    loadMgmtTab();
  } catch (e) { showToast('Failed', 'error'); }
}

async function showMgmtTeamHistory(devoteeId, devoteeName) {
  const titleEl = document.getElementById('history-modal-title');
  const content = document.getElementById('history-content');
  if (titleEl) titleEl.textContent = `Team History — ${devoteeName}`;
  content.innerHTML = '<div class="loading" style="padding:1.5rem"><i class="fas fa-spinner"></i></div>';
  openModal('history-modal');
  try {
    const history = await DB.getTeamChangeHistory(devoteeId);
    if (!history.length) {
      content.innerHTML = '<div class="empty-state" style="padding:2rem"><i class="fas fa-users"></i><p>No team changes recorded</p></div>';
      return;
    }
    content.innerHTML = history.map((h, i) => {
      const oldTeam = h.oldValue || history[i + 1]?.newValue || '—';
      const newTeam = h.newValue || '—';
      const iso = h.changedAt?.toDate ? h.changedAt.toDate().toISOString() : (h.changedAt || null);
      return `<div class="history-item">
        <div class="history-field"><i class="fas fa-users" style="color:var(--primary);margin-right:.35rem"></i> Team Change</div>
        <div class="history-change"><span class="old">${oldTeam}</span> <i class="fas fa-arrow-right" style="color:var(--text-muted);font-size:.7rem"></i> <span class="new">${newTeam}</span></div>
        <div class="history-date">${formatDateTime(iso)}<br><span style="font-size:.7rem">by ${h.changedBy || '—'}</span></div>
      </div>`;
    }).join('');
  } catch (_) {
    content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load history</p></div>';
  }
}

async function exportMgmtFY() {
  showToast('Preparing FY export…');
  try {
    const now = new Date();
    const fyStartYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = `${fyStartYear}-04-01`;
    const today = getToday();
    const allWeeks = await DB.getCallingWeekHistory(52);
    const fyWeeks = allWeeks.filter(w => w.callingDate >= fyStart && w.callingDate <= today);
    if (!fyWeeks.length) { showToast('No data for this FY', 'error'); return; }
    // Process in batches of 10 weeks to avoid firing 100+ parallel Firestore
    // queries at once (a full FY can have up to 52 weeks × 3 queries each).
    const allDevotees = await DevoteeCache.all();
    const gridData = [];
    for (let i = 0; i < fyWeeks.length; i += 10) {
      const chunk = await DB.getMgmtGridData(fyWeeks.slice(i, i + 10));
      gridData.push(...chunk);
    }
    const activeDevotees = allDevotees.filter(d =>
      d.isActive !== false && d.callingBy && !d.callingMode && !d.isNotInterested
    );
    const XS = _xls();
    const wb = XLSX.utils.book_new();
    const HDR = XS.hdr('1A5C3A', 'FFFFFF');
    const SUB = XS.hdr('C8E6C9', '1B5E20');
    const GRD = XS.hdr('0D3B22', 'FFFFFF');
    function fmt(dateStr) {
      if (!dateStr) return '—';
      const [y, m, d] = dateStr.split('-');
      return `${d}.${m}.${y.slice(-2)}`;
    }
    const baseHdrs = ['#', 'Name', 'Mobile', 'Team', 'Calling By'];
    const weekHdrs = fyWeeks.flatMap(w => [`CS ${fmt(w.callingDate)}`, `AT ${fmt(w.sessionDate)}`]);
    const headers = [...baseHdrs, ...weekHdrs, 'Total AT'];
    const colW = [{ wch: 4 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
      ...fyWeeks.flatMap(() => [{ wch: 9 }, { wch: 9 }]), { wch: 8 }];
    const rows = [headers.map(h => ({ v: h, s: HDR }))];
    let sno = 1;
    TEAMS.forEach(team => {
      const members = activeDevotees.filter(d => (d.teamName || '') === team);
      if (!members.length) return;
      rows.push([team, ...Array(headers.length - 1).fill('')].map((v, i) => ({ v, s: i === 0 ? SUB : XS.hdr('C8E6C9', '1B5E20') })));
      members.forEach(d => {
        const wkVals = fyWeeks.flatMap(w => {
          const cs = w.csMap[d.id];
          return [cs?.comingStatus === 'Yes' ? 'Yes' : (cs?.callingReason || ''), w.atSet?.has(d.id) ? 'P' : ''];
        });
        const totalAt = fyWeeks.reduce((n, w) => n + (w.atSet?.has(d.id) ? 1 : 0), 0);
        rows.push([sno++, d.name, d.mobile || '', d.teamName || '', d.callingBy || '', ...wkVals, totalAt].map(v => ({ v, s: XS.cell() })));
      });
    });
    const ws = _xlsSheet(rows, colW);
    XLSX.utils.book_append_sheet(wb, ws, `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`);
    XLSX.writeFile(wb, `Mgmt_FY${fyStartYear}-${String(fyStartYear + 1).slice(-2)}.xlsx`);
    showToast('Downloaded!');
  } catch (e) {
    console.error(e);
    showToast('Export failed', 'error');
  }
}

// ══ REPORTS → YEARLY SHEET SUB-TAB ══════════════════════════════════════════

function _fyRangeFor(dateStr) {
  const ref = dateStr || getToday();
  const [y, m] = ref.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

async function loadYearlySheet() {
  const wrap = document.getElementById('yearly-sheet-wrap');
  if (!wrap) return;
  const { start, end } = _fyRangeFor(_reportActive?.session_date);
  const teamFilter = document.getElementById('yearly-sheet-team')?.value || '';
  wrap.innerHTML = '<div class="loading" style="padding:2rem"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const { sessions, devotees, attMap, csMap } = await DB.getSheetData(start, end);
    if (!sessions.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-table"></i><p>No sessions found for this year</p></div>';
      return;
    }
    wrap.innerHTML = buildFullSheetTable(devotees, sessions, attMap, csMap, teamFilter);
  } catch (e) {
    console.error('loadYearlySheet', e);
    wrap.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

// ══ CALLING MANAGEMENT DASHBOARD TAB (superAdmin only) ══════════════════════

let _cmActiveSubtab = 'calling';
let _cmData = null;

function toggleCMConfig(btn) {
  const row = document.getElementById('cm-config-row');
  const hidden = row.classList.toggle('hidden');
  btn.innerHTML = hidden ? '<i class="fas fa-cog"></i> Configure' : '<i class="fas fa-times"></i> Close';
}

async function saveCMCallingDates() {
  const cd = document.getElementById('cm-config-calling-date')?.value;
  const sd = document.getElementById('cm-config-session-date')?.value;
  if (!cd) { showToast('Please enter a calling date', 'error'); return; }
  try {
    await Promise.all([
      DB.setCallingWeekConfig(cd, sd),
      DB.setCallingWeekHistory(cd, sd),
    ]);
    showToast('Dates saved!', 'success');
    const row = document.getElementById('cm-config-row');
    if (row) row.classList.add('hidden');
    const cfgBtn = document.querySelector('#tab-calling-mgmt .btn[onclick*="toggleCMConfig"]');
    if (cfgBtn) cfgBtn.innerHTML = '<i class="fas fa-cog"></i> Configure';
    // Keep calling tab in sync
    const hw = document.getElementById('calling-week');
    if (hw) hw.value = cd;
    window._callingSessionDate = sd;
    // Also sync mgmt tab inputs
    const mi = document.getElementById('mgmt-config-calling-date');
    if (mi) mi.value = cd;
    const msi = document.getElementById('mgmt-config-session-date');
    if (msi) msi.value = sd || '';
    loadCallingMgmtTab();
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

function switchCallingMgmtTab(tab, btn) {
  _cmActiveSubtab = tab;
  document.querySelectorAll('#calling-mgmt-tabs .att-sub-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['calling', 'newcomers', 'online', 'notinterested', 'festival'].forEach(p => {
    const el = document.getElementById('calling-mgmt-panel-' + p);
    if (el) el.classList.toggle('active', p === tab);
  });
  if (tab === 'calling')       _renderCMWeek();
  if (tab === 'newcomers')     _renderCMNewComers();
  if (tab === 'online')        _renderCMSingleList('online');
  if (tab === 'notinterested') _renderCMSingleList('notinterested');
  if (tab === 'festival')      _renderCMSingleList('festival');
}

async function loadCallingMgmtTab() {
  _cmData = null;
  const weekEl = document.getElementById('cm-week-content');
  if (weekEl) weekEl.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';

  try {
    const cfg = await DB.getCallingWeekConfig().catch(() => null);
    const currentWeek    = cfg?.callingDate || '';
    const currentSession = cfg?.sessionDate || '';

    // Pre-fill config inputs
    const ci = document.getElementById('cm-config-calling-date');
    if (ci && currentWeek) ci.value = currentWeek;
    const si = document.getElementById('cm-config-session-date');
    if (si && currentSession) si.value = currentSession;

    // getCallingWeekHistory returns oldest-first (it .reverse()s the desc query)
    const histWeeks = await DB.getCallingWeekHistory(4);

    // If current week wasn't saved to history yet, append it
    let weeks = histWeeks;
    if (currentWeek && !weeks.some(w => w.callingDate === currentWeek)) {
      weeks = [...weeks, { callingDate: currentWeek, sessionDate: currentSession }].slice(-4);
    }

    const [gridData, allDevotees] = await Promise.all([
      weeks.length ? DB.getMgmtGridData(weeks) : Promise.resolve([]),
      DevoteeCache.all(),
    ]);

    _cmData = { devotees: allDevotees, weeks, gridData, currentWeek };

    if (_cmActiveSubtab === 'calling')       _renderCMWeek();
    if (_cmActiveSubtab === 'newcomers')     _renderCMNewComers();
    if (_cmActiveSubtab === 'online')        _renderCMSingleList('online');
    if (_cmActiveSubtab === 'notinterested') _renderCMSingleList('notinterested');
    if (_cmActiveSubtab === 'festival')      _renderCMSingleList('festival');
  } catch (e) {
    console.error('loadCallingMgmtTab', e);
    if (weekEl) weekEl.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i>
      <p>Failed to load.<br><small style="color:var(--danger)">If this is your first time: deploy Firestore rules in Firebase Console → Firestore → Rules, then refresh.</small></p></div>`;
  }
}

// Bulk selection state for Calling Mgmt — long-press to enter select mode
let _cmSelected  = new Set();
let _cmSelectMode = false;
let _cmPressTimer = null;
let _cmJustTriggered = false;     // suppress the click that follows a long-press
const _CM_LONG_PRESS_MS = 600;

function _enterCMSelectMode() {
  _cmSelectMode = true;
  document.getElementById('cm-week-content')?.classList.add('cm-select-mode');
  if (navigator.vibrate) navigator.vibrate(40);
}
function _exitCMSelectMode() {
  _cmSelectMode = false;
  _cmSelected.clear();
  const host = document.getElementById('cm-week-content');
  host?.classList.remove('cm-select-mode');
  host?.querySelectorAll('input.cm-row-check').forEach(b => b.checked = false);
  const master = document.getElementById('cm-check-all');
  if (master) master.checked = false;
  _updateBulkBar();
}
function _cmStartPress(id) {
  if (_cmSelectMode) return;
  clearTimeout(_cmPressTimer);
  _cmPressTimer = setTimeout(() => {
    _enterCMSelectMode();
    _cmSelected.add(id);
    const box = document.querySelector(`#cm-week-content input.cm-row-check[data-id="${id}"]`);
    if (box) box.checked = true;
    _updateBulkBar();
    // Ignore the click that fires on release — otherwise it would toggle the
    // checkbox straight back off and drop us out of select mode.
    _cmJustTriggered = true;
    setTimeout(() => { _cmJustTriggered = false; }, 500);
  }, _CM_LONG_PRESS_MS);
}
function _cmEndPress() { clearTimeout(_cmPressTimer); }
function _cmRowTap(id, ev) {
  if (_cmJustTriggered) { _cmJustTriggered = false; return; }
  if (!_cmSelectMode) return;
  const tag = (ev.target.tagName || '').toUpperCase();
  if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || ev.target.closest('button, a, input')) return;
  const box = document.querySelector(`#cm-week-content input.cm-row-check[data-id="${id}"]`);
  if (!box) return;
  box.checked = !box.checked;
  _toggleCMSel(id, box.checked);
  if (!_cmSelected.size) _exitCMSelectMode();
}

function _toggleCMSel(id, checked) {
  if (checked) _cmSelected.add(id); else _cmSelected.delete(id);
  _updateBulkBar();
}
function _toggleCMSelAll(checked) {
  if (checked && !_cmSelectMode) _enterCMSelectMode();
  const boxes = document.querySelectorAll('#cm-week-content input.cm-row-check');
  boxes.forEach(b => { b.checked = checked; _toggleCMSel(b.dataset.id, checked); });
  if (!checked && !_cmSelected.size) _exitCMSelectMode();
}
function _updateBulkBar() {
  const bar = document.getElementById('cm-bulk-bar');
  if (!bar) return;
  const n = _cmSelected.size;
  bar.classList.toggle('cm-bulk-visible', n > 0);
  const cnt = bar.querySelector('.cm-bulk-count');
  if (cnt) cnt.textContent = n;
}
function _clearCMSelection() { _exitCMSelectMode(); }

// Explicit "Select" toggle — tappable on mobile so users don't have to rely
// on long-press, which can get cancelled by scroll/OS gestures.
function _toggleCMSelectMode() {
  if (_cmSelectMode) _exitCMSelectMode();
  else _enterCMSelectMode();
}

function _renderCMWeek() {
  const el = document.getElementById('cm-week-content');
  if (!el) return;
  if (!_cmData) { el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>'; return; }

  const { devotees, gridData, currentWeek } = _cmData;
  _cmSelected.clear();

  if (!currentWeek) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i>
      <p>No calling date configured yet.<br>Click <strong>Configure</strong> above to set dates.</p></div>`;
    return;
  }

  const savedTeam = document.getElementById('cm-filter-team')?.value || '';
  const savedBy   = document.getElementById('cm-filter-by')?.value   || '';

  const currentWkData = gridData.find(w => w.callingDate === currentWeek) || { csMap: {}, atSet: new Set() };
  const histWkData    = gridData.filter(w => w.callingDate !== currentWeek);

  const activeDevotees = devotees.filter(d =>
    d.isActive !== false && d.callingBy && !d.callingMode && !d.isNotInterested
  );

  function isUncalled(d) {
    const cs = currentWkData.csMap[d.id];
    return !cs || (!cs.comingStatus && !cs.callingReason);
  }

  let filtered = activeDevotees;
  if (savedTeam) filtered = filtered.filter(d => d.teamName === savedTeam);
  if (savedBy)   filtered = filtered.filter(d => d.callingBy === savedBy);

  const uncalledCount = filtered.filter(d => isUncalled(d)).length;
  const comingCount   = filtered.filter(d => currentWkData.csMap[d.id]?.comingStatus === 'Yes').length;

  const histHdrs = histWkData.map(w => {
    const lbl = new Date(w.callingDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `<th style="text-align:center;min-width:50px;background:#2d7a57;color:#fff;font-size:.7rem">${lbl}</th>`;
  }).join('');

  const teamMap = {};
  filtered.forEach(d => {
    const t = d.teamName || 'Unknown';
    if (!teamMap[t]) teamMap[t] = [];
    teamMap[t].push(d);
  });

  // Build Team + Calling By dropdowns (Calling By is sub-filter of Team)
  const allTeams = [...new Set(activeDevotees.map(d => d.teamName).filter(Boolean))].sort();
  const byPool   = savedTeam ? activeDevotees.filter(d => d.teamName === savedTeam) : activeDevotees;
  const callers  = [...new Set(byPool.map(d => d.callingBy).filter(Boolean))].sort();
  const teamOpts = '<option value="">All Teams</option>' +
    allTeams.map(t => `<option value="${t}"${savedTeam === t ? ' selected' : ''}>${t}</option>`).join('');
  const byOpts = '<option value="">All Calling By</option>' +
    callers.map(c => `<option value="${c.replace(/"/g,'&quot;')}"${savedBy === c ? ' selected' : ''}>${c}</option>`).join('');

  function csChip(cs) {
    if (!cs || (!cs.comingStatus && !cs.callingReason))
      return '<span class="cm-pill cm-none"><i class="fas fa-circle-notch"></i> Not called</span>';
    let main;
    if (cs.comingStatus === 'Yes') {
      main = '<span class="cm-pill cm-yes"><i class="fas fa-check-circle"></i> Confirmed Coming</span>';
    } else if (cs.callingReason) {
      const lbl = (typeof _reasonLabel === 'function' ? _reasonLabel(cs.callingReason) : cs.callingReason);
      const avail = cs.availableFrom ? ` · from ${formatDate(cs.availableFrom)}` : '';
      main = `<span class="cm-pill cm-reason">${lbl}${avail}</span>`;
    } else {
      main = '<span class="cm-pill cm-none">—</span>';
    }
    const notes = cs.callingNotes
      ? `<div class="cm-notes">"${(cs.callingNotes+'').replace(/"/g,'&quot;')}"</div>`
      : '';
    return `<div class="cm-status-cell">${main}${notes}</div>`;
  }

  function histDots(devoteeId) {
    return histWkData.map(w => {
      const cs = w.csMap[devoteeId];
      const at = w.atSet?.has(devoteeId);
      let col, tip;
      if      (at)                           { col = '#2e7d32'; tip = 'Attended class'; }
      else if (cs?.comingStatus === 'Yes')   { col = '#81c784'; tip = 'Said yes — absent'; }
      else if (cs?.callingReason)            { col = '#e67e22'; tip = _reasonLabel ? _reasonLabel(cs.callingReason) : cs.callingReason; }
      else if (cs)                           { col = '#bdbdbd'; tip = 'Called / no outcome'; }
      else                                   { col = '#eeeeee'; tip = 'Not called'; }
      return `<td style="text-align:center;padding:.3rem .2rem">
        <span title="${tip}" style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${col};border:1px solid rgba(0,0,0,.08)"></span>
      </td>`;
    }).join('');
  }

  let rows = '';
  let sno  = 1;
  TEAMS.forEach(team => {
    const members = teamMap[team];
    if (!members?.length) return;
    rows += `<tr style="background:#e8f5e9">
      <td class="cm-check-cell" style="background:#e8f5e9;padding:.3rem .3rem;text-align:center">
        <input type="checkbox" onchange="_cmSelectTeam('${team.replace(/'/g,"\\'")}', this.checked)" title="Select all in ${team}">
      </td>
      <td colspan="${5 + histWkData.length + 3}" style="font-weight:700;color:var(--primary);padding:.3rem .6rem">
        <i class="fas fa-users" style="font-size:.7rem"></i> ${team}
        <span style="font-size:.74rem;font-weight:400;opacity:.75"> (${members.length})</span>
      </td>
    </tr>`;
    members.forEach(d => {
      const cs       = currentWkData.csMap[d.id];
      const uncalled = isUncalled(d);
      const safeName = (d.name || '').replace(/'/g, "\\'");
      const safeTeam = (team || '').replace(/'/g, "\\'");
      rows += `<tr class="cm-row" style="${uncalled ? 'background:#fffde7' : ''}"
        onmousedown="_cmStartPress('${d.id}')" onmouseup="_cmEndPress()" onmouseleave="_cmEndPress()"
        ontouchstart="_cmStartPress('${d.id}')" ontouchend="_cmEndPress()" ontouchcancel="_cmEndPress()"
        onclick="_cmRowTap('${d.id}', event)">
        <td class="cm-check-cell" style="text-align:center;padding:.3rem .3rem">
          <input type="checkbox" class="cm-row-check" data-id="${d.id}" data-team="${safeTeam}" onchange="_toggleCMSel('${d.id}', this.checked)" onclick="event.stopPropagation()">
        </td>
        <td style="text-align:center;color:var(--text-muted);font-size:.74rem;padding:.3rem .3rem">${sno++}</td>
        <td style="padding:.3rem .5rem;min-width:140px">
          <button class="cm-link" onclick="openProfileModal('${d.id}')" title="Open profile">${d.name}</button>
          ${d.mobile ? `<div style="font-size:.68rem;color:var(--text-muted)">${d.mobile}${d.mobileAlt ? ` · <span style="color:var(--text-light)">+1</span>` : ''}</div>` : ''}
        </td>
        <td style="padding:.3rem .4rem;white-space:nowrap">
          ${contactIcons(d.mobile, { altMobile: d.mobileAlt, devoteeId: d.id, name: d.name })}
        </td>
        <td style="padding:.3rem .4rem;white-space:nowrap">
          <button class="cm-team-btn" onclick="openTeamChangeQuick('${d.id}','${safeName}','${safeTeam}')" title="Change team">
            ${teamBadge(team)}
          </button>
          <button class="cm-team-history-btn" onclick="showMgmtTeamHistory('${d.id}','${safeName}')" title="Past team history">
            <i class="fas fa-pencil-alt"></i>
          </button>
        </td>
        <td style="padding:.3rem .4rem">
          ${d.callingBy
            ? `<button class="cm-link cm-link-muted" onclick="openChangeCallingBy('${d.id}','${safeName}','${safeTeam}','${(d.callingBy||'').replace(/'/g,"\\'")}')">${d.callingBy}</button>`
            : `<button class="cm-link cm-link-muted" onclick="openChangeCallingBy('${d.id}','${safeName}','${safeTeam}','')">— Assign —</button>`
          }
        </td>
        <td style="padding:.3rem .4rem;min-width:170px">${csChip(cs)}</td>
        ${histDots(d.id)}
        <td style="text-align:center;font-weight:700;color:var(--primary);font-size:.8rem">${d.lifetimeAttendance || 0}</td>
        <td style="padding:.3rem .4rem">
          <button onclick="openMgmtAction('${d.id}','${safeName}')"
            style="font-size:.72rem;padding:.2rem .5rem;background:var(--accent-light);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--primary);font-weight:600;white-space:nowrap">
            <i class="fas fa-bolt"></i> Action
          </button>
        </td>
      </tr>`;
    });
  });

  const dateLabel = new Date(currentWeek + 'T00:00:00').toLocaleDateString('en-IN',
    { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  el.innerHTML = `
    <div class="cm-header-row">
      <div style="font-size:.84rem;color:var(--text-muted)">
        <i class="fas fa-phone-alt"></i> Week: <strong style="color:var(--primary)">${dateLabel}</strong>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <span style="background:#fff3e0;color:#e65100;padding:.2rem .6rem;border-radius:4px;font-size:.78rem;font-weight:600">
          <i class="fas fa-circle-notch"></i> ${uncalledCount} not called
        </span>
        <span style="background:#e8f5e9;color:#2e7d32;padding:.2rem .6rem;border-radius:4px;font-size:.78rem;font-weight:600">
          <i class="fas fa-check-circle"></i> ${comingCount} confirmed
        </span>
      </div>
      <div class="cm-filters">
        <select id="cm-filter-team" class="filter-select" style="font-size:.82rem" onchange="_onCMTeamChange()">
          ${teamOpts}
        </select>
        <select id="cm-filter-by" class="filter-select" style="font-size:.82rem" onchange="_renderCMWeek()">
          ${byOpts}
        </select>
      </div>
    </div>

    <!-- Select toggle — visible entry point (long-press still works too) -->
    <div class="cm-select-toggle-row">
      <button class="btn btn-secondary cm-select-toggle" onclick="_toggleCMSelectMode()">
        <i class="fas fa-check-square"></i> <span class="cm-select-toggle-label">Select (Bulk Action)</span>
      </button>
      <span class="cm-hint"><i class="fas fa-hand-pointer"></i> or long-press any row</span>
    </div>

    <!-- Bulk action bar — appears at top of list when selections exist -->
    <div id="cm-bulk-bar" class="cm-bulk-bar">
      <span class="cm-bulk-info"><i class="fas fa-check-square"></i> <span class="cm-bulk-count">0</span> selected</span>
      <button class="btn btn-primary" onclick="openBulkAction()"><i class="fas fa-layer-group"></i> Bulk Action</button>
      <button class="btn btn-secondary" onclick="_clearCMSelection()"><i class="fas fa-times"></i> Exit Select</button>
    </div>

    <div style="overflow-x:auto">
    <table style="border-collapse:collapse;min-width:720px;width:100%;font-size:.8rem">
      <thead>
        <tr style="background:#1a5c3a;color:#fff">
          <th class="cm-check-cell" style="padding:.4rem .3rem;min-width:28px">
            <input type="checkbox" id="cm-check-all" onchange="_toggleCMSelAll(this.checked)" title="Select all">
          </th>
          <th style="padding:.4rem .3rem;min-width:28px">#</th>
          <th style="padding:.4rem .6rem;text-align:left;min-width:140px">Name</th>
          <th style="min-width:80px;text-align:center">Contact</th>
          <th style="min-width:90px">Team</th>
          <th style="min-width:110px;padding:.4rem">Calling By</th>
          <th style="min-width:170px">This Week</th>
          ${histHdrs}
          <th style="text-align:center;min-width:48px" title="Lifetime Attendance">🕉️ AT</th>
          <th style="min-width:72px">Action</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="99" style="text-align:center;padding:2rem;color:var(--text-muted)">No devotees match these filters</td></tr>'}</tbody>
    </table></div>
    <div style="margin-top:.5rem;font-size:.72rem;color:var(--text-muted);display:flex;gap:.75rem;flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2e7d32;margin-right:.25rem;vertical-align:middle"></span>Attended</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#81c784;margin-right:.25rem;vertical-align:middle"></span>Said yes — absent</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e67e22;margin-right:.25rem;vertical-align:middle"></span>Reason given</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#eeeeee;border:1px solid #ddd;margin-right:.25rem;vertical-align:middle"></span>Not called</span>
      <span style="background:#fffde7;color:#e65100;padding:.1rem .4rem;border-radius:3px">Yellow rows = not called this week</span>
    </div>`;

  _updateBulkBar();
}

function _cmSelectTeam(team, checked) {
  const boxes = document.querySelectorAll(`#cm-week-content input.cm-row-check[data-team="${team.replace(/"/g,'\\"')}"]`);
  boxes.forEach(b => { b.checked = checked; _toggleCMSel(b.dataset.id, checked); });
}

function _onCMTeamChange() {
  // Reset Calling By when Team changes — byOpts are regenerated on re-render.
  const by = document.getElementById('cm-filter-by');
  if (by) by.value = '';
  _renderCMWeek();
}

function openTeamChangeQuick(devoteeId, devoteeName, currentTeam) {
  openMgmtAction(devoteeId, devoteeName);
  // Auto-expand the Change Team picker
  setTimeout(() => {
    const picker = document.getElementById('mgmt-team-picker');
    if (picker) picker.style.display = 'flex';
    const sel = document.getElementById('mgmt-new-team');
    if (sel && currentTeam) sel.value = currentTeam;
  }, 40);
}

async function openChangeCallingBy(devoteeId, devoteeName, team, currentCaller) {
  document.getElementById('cb-devotee-id').value   = devoteeId;
  document.getElementById('cb-devotee-team').value = team || '';
  document.getElementById('cb-devotee-name').textContent = devoteeName;
  document.getElementById('cb-team-display').textContent = team || '— Any —';
  const sel = document.getElementById('cb-user-select');
  sel.innerHTML = '<option value="">— Loading callers —</option>';
  openModal('change-callingby-modal');
  try {
    const users = await DB.getUsersForTeam(team || '');
    if (!users.length) {
      sel.innerHTML = `<option value="">— No callers in ${team || 'any team'} —</option>`;
      return;
    }
    sel.innerHTML = '<option value="">— Select caller —</option>' +
      users.map(u => {
        const pos = u.position || (u.role === 'teamAdmin' ? 'Coordinator' : 'Facilitator');
        const selected = (u.name === currentCaller) ? ' selected' : '';
        return `<option value="${(u.name||'').replace(/"/g,'&quot;')}"${selected}>${u.name} (${pos})</option>`;
      }).join('');
  } catch (e) {
    sel.innerHTML = '<option value="">— Failed to load —</option>';
  }
}

async function doSaveCallingBy() {
  const devoteeId = document.getElementById('cb-devotee-id').value;
  const newCaller = document.getElementById('cb-user-select').value;
  if (!devoteeId) return;
  if (!newCaller) { showToast('Please select a caller', 'error'); return; }
  try {
    await fdb.collection('devotees').doc(devoteeId).update({ callingBy: newCaller, updatedAt: TS() });
    await fdb.collection('profileChanges').add({
      devoteeId, fieldName: 'calling_by',
      newValue: newCaller, changedBy: AppState.userName, changedAt: TS()
    });
    DevoteeCache.bust();
    closeModal('change-callingby-modal');
    showToast('Calling By updated!', 'success');
    loadCallingMgmtTab?.();
  } catch (e) {
    showToast('Update failed: ' + (e.message || 'Error'), 'error');
  }
}

function _renderCMGrid() {
  const el = document.getElementById('cm-grid-content');
  if (!el) return;
  if (!_cmData) { el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>'; return; }
  const { devotees, weeks, gridData } = _cmData;
  const active = devotees.filter(d => d.isActive !== false && d.callingBy && !d.callingMode && !d.isNotInterested);
  if (!weeks.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-info-circle"></i>
      <p>No weeks saved yet. Configure calling dates and click Save Dates first.</p></div>`;
    return;
  }
  el.innerHTML = _buildMgmtGrid(gridData, active);
}

function _renderCMShifted() {
  const el = document.getElementById('cm-shifted-content');
  if (!el) return;
  if (!_cmData) { el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>'; return; }
  const { devotees } = _cmData;
  const lists = {
    online:        devotees.filter(d => d.callingMode === 'online'),
    festival:      devotees.filter(d => d.callingMode === 'festival'),
    notInterested: devotees.filter(d => d.callingMode === 'not_interested' || d.isNotInterested === true),
  };
  const html = _buildMgmtSeparateLists(lists);
  el.innerHTML = html || `<div class="empty-state"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>No shifted devotees</p></div>`;
}

// ── NEW COMERS data: any devotee who joined for / attended the latest past
// session as new — covers two paths:
//   1. Registered via the Attendance FAB → has attendanceRecord.isNewDevotee
//   2. Added directly via Devotees tab with dateOfJoining === session date
async function _getNewComersForLatestSession() {
  const today = getToday();
  const sessSnap = await fdb.collection('sessions')
    .where('sessionDate', '<=', today)
    .orderBy('sessionDate', 'desc').limit(1).get();
  if (sessSnap.empty) return { sessionDate: null, sessionId: null, list: [] };
  const sess = sessSnap.docs[0];
  const sessionId   = sess.id;
  const sessionDate = sess.data().sessionDate;

  const [attSnap, all] = await Promise.all([
    fdb.collection('attendanceRecords')
      .where('sessionId', '==', sessionId)
      .where('isNewDevotee', '==', true).get(),
    DevoteeCache.all(),
  ]);

  const byId       = Object.fromEntries(all.map(d => [d.id, d]));
  const seen       = new Set();
  const list       = [];

  // 1) Attendance-flagged new devotees
  attSnap.docs.forEach(doc => {
    const a = doc.data();
    if (seen.has(a.devoteeId)) return;
    seen.add(a.devoteeId);
    const d = byId[a.devoteeId] || {};
    list.push({
      id:        a.devoteeId,
      name:      d.name || a.devoteeName || '—',
      mobile:    d.mobile || a.mobile || '',
      mobileAlt: d.mobileAlt || '',
      teamName:  d.teamName || a.teamName || '',
      callingBy: d.callingBy || a.callingBy || '',
      referenceBy:    d.referenceBy || '',
      chantingRounds: d.chantingRounds || 0,
      source: 'attended',
    });
  });

  // 2) Devotees whose dateOfJoining is the same session date — even if
  //    they were added directly to the database without being marked present
  all.forEach(d => {
    if (seen.has(d.id))                  return;
    if (d.isActive === false)            return;
    if (!d.dateOfJoining)                return;
    if (d.dateOfJoining !== sessionDate) return;
    seen.add(d.id);
    list.push({
      id:        d.id,
      name:      d.name || '—',
      mobile:    d.mobile || '',
      mobileAlt: d.mobileAlt || '',
      teamName:  d.teamName || '',
      callingBy: d.callingBy || '',
      referenceBy:    d.referenceBy || '',
      chantingRounds: d.chantingRounds || 0,
      source: 'joined',
    });
  });

  return { sessionDate, sessionId, list };
}

// ── CALLING MGMT — NEW COMERS sub-tab ──
async function _renderCMNewComers() {
  const el = document.getElementById('cm-newcomers-content');
  if (!el) return;
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const { sessionDate, list } = await _getNewComersForLatestSession();
    if (!sessionDate) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-user-plus"></i><p>No past session found yet.</p></div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-seedling"></i><p>No new devotees for ${formatDate(sessionDate)}.</p></div>`;
      return;
    }
    const rows = list.map((d, i) => {
      const safeName = (d.name || '—').replace(/'/g, "\\'");
      const safeTeam = (d.teamName || '').replace(/'/g, "\\'");
      const sourceTag = d.source === 'attended'
        ? '<span class="newcomer-tag tag-attended">Attended</span>'
        : '<span class="newcomer-tag tag-joined">Joined</span>';
      return `<tr>
        <td style="color:var(--text-muted);text-align:center">${i + 1}</td>
        <td>
          <button class="cm-link" onclick="openProfileModal('${d.id}')">${d.name}</button>
          ${d.mobile ? `<div style="font-size:.7rem;color:var(--text-muted)">${d.mobile}</div>` : ''}
        </td>
        <td>${sourceTag}</td>
        <td style="font-size:.78rem">${d.referenceBy || '—'}</td>
        <td style="padding:.3rem .4rem;white-space:nowrap">
          ${d.teamName
            ? `<button class="cm-team-btn" onclick="openTeamChangeQuick('${d.id}','${safeName}','${safeTeam}')" title="Change team">${teamBadge(d.teamName)}</button>
               <button class="cm-team-history-btn" onclick="showMgmtTeamHistory('${d.id}','${safeName}')" title="Past team history"><i class="fas fa-pencil-alt"></i></button>`
            : `<button class="btn btn-secondary" style="padding:.18rem .55rem;font-size:.72rem" onclick="openTeamChangeQuick('${d.id}','${safeName}','')"><i class="fas fa-users"></i> Assign Team</button>`
          }
        </td>
        <td>
          ${d.callingBy
            ? `<button class="cm-link cm-link-muted" onclick="openChangeCallingBy('${d.id}','${safeName}','${safeTeam}','${d.callingBy.replace(/'/g,"\\'")}')">${d.callingBy}</button>`
            : `<button class="btn btn-secondary" style="padding:.18rem .55rem;font-size:.72rem" onclick="openChangeCallingBy('${d.id}','${safeName}','${safeTeam}','')"><i class="fas fa-headset"></i> Assign Caller</button>`
          }
        </td>
        <td style="text-align:center">${d.chantingRounds || 0}</td>
        <td style="text-align:center">
          <button onclick="openMgmtAction('${d.id}','${safeName}')"
            style="font-size:.72rem;padding:.2rem .5rem;background:var(--accent-light);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--primary);font-weight:600;white-space:nowrap">
            <i class="fas fa-bolt"></i> Action
          </button>
        </td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <div style="font-size:.84rem;margin-bottom:.6rem;color:var(--text-muted)">
        <i class="fas fa-user-plus"></i> ${list.length} new devotee${list.length === 1 ? '' : 's'} for
        <strong style="color:var(--primary)">${formatDate(sessionDate)}</strong>
        <span style="margin-left:.5rem;font-size:.72rem;color:var(--text-light)">(joined or attended fresh)</span>
      </div>
      <div style="overflow-x:auto">
        <table class="calling-table">
          <thead><tr>
            <th style="min-width:30px">#</th>
            <th style="min-width:160px">Name</th>
            <th style="min-width:80px">Source</th>
            <th style="min-width:120px">Reference</th>
            <th style="min-width:120px">Team</th>
            <th style="min-width:140px">Calling By</th>
            <th style="min-width:48px;text-align:center">C.R.</th>
            <th style="min-width:70px;text-align:center">Action</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (e) {
    console.error('_renderCMNewComers', e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function _renderCMSingleList(type) {
  const el = document.getElementById(`cm-${type}-content`);
  if (!el) return;
  if (!_cmData) { el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>'; return; }
  const { devotees } = _cmData;
  let items, title, icon, bgColor;
  if (type === 'online') {
    items = devotees.filter(d => d.callingMode === 'online');
    title = 'Online Class'; icon = 'fas fa-laptop'; bgColor = '#1565c0';
  } else if (type === 'festival') {
    items = devotees.filter(d => d.callingMode === 'festival');
    title = 'Festival Calling'; icon = 'fas fa-star'; bgColor = '#e65100';
  } else {
    items = devotees.filter(d => d.callingMode === 'not_interested' || d.isNotInterested === true);
    title = 'Not Interested'; icon = 'fas fa-ban'; bgColor = '#b71c1c';
  }
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><i class="${icon}"></i><p>No devotees in ${title}</p></div>`;
    return;
  }
  const rows = items.map((d, i) => `<tr style="font-size:.82rem">
    <td style="color:var(--text-muted);text-align:center">${i + 1}</td>
    <td style="font-weight:600">${d.name || ''}</td>
    <td style="font-size:.75rem">${d.mobile || '—'}</td>
    <td style="white-space:nowrap">
      ${teamBadge(d.teamName)}
      <button onclick="showMgmtTeamHistory('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')" title="Team change history"
        style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.72rem;padding:.1rem .25rem;vertical-align:middle;opacity:.7">
        <i class="fas fa-pencil-alt"></i>
      </button>
    </td>
    <td style="font-size:.75rem;color:var(--text-muted)">${d.callingBy || '—'}</td>
    <td>
      <button onclick="openMgmtAction('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')"
        style="font-size:.72rem;padding:.15rem .45rem;background:var(--accent-light);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--primary);margin-right:.3rem">
        <i class="fas fa-bolt"></i> Action
      </button>
      <button onclick="restoreMgmtDevotee('${d.id}')"
        style="font-size:.72rem;padding:.15rem .45rem;background:#e8f5e9;border:1px solid var(--secondary);border-radius:4px;cursor:pointer;color:var(--primary)">
        <i class="fas fa-undo"></i> Restore
      </button>
    </td>
  </tr>`).join('');
  el.innerHTML = `<div class="sr-team-block">
    <div class="sr-team-banner" style="background:${bgColor};color:#fff">
      <i class="${icon}"></i> ${title}
      <span style="font-size:.8rem;font-weight:400;opacity:.85"> (${items.length})</span>
    </div>
    <table class="calling-table sr-table" style="margin:0">
      <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Team</th><th>Calling By</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── BULK ACTIONS (Calling Mgmt) ───────────────────────
function openBulkAction() {
  if (!_cmSelected.size) { showToast('Select at least one devotee', 'error'); return; }
  document.getElementById('bulk-count').textContent  = _cmSelected.size;
  document.getElementById('bulk-action-type').value  = '';
  document.getElementById('bulk-team-wrap').style.display       = 'none';
  document.getElementById('bulk-callingby-wrap').style.display  = 'none';
  document.getElementById('bulk-confirm-msg').style.display     = 'none';
  openModal('bulk-action-modal');
}

async function _onBulkActionTypeChange() {
  const t = document.getElementById('bulk-action-type').value;
  const teamWrap = document.getElementById('bulk-team-wrap');
  const byWrap   = document.getElementById('bulk-callingby-wrap');
  const msg      = document.getElementById('bulk-confirm-msg');
  teamWrap.style.display = (t === 'team') ? 'flex' : 'none';
  byWrap.style.display   = (t === 'callingby') ? 'flex' : 'none';
  msg.style.display      = 'none';
  if (t === 'online' || t === 'festival' || t === 'not_interested' || t === 'restore') {
    const lbl = { online:'Shift to Online Class', festival:'Shift to Festival Calling',
                  not_interested:'Mark Not Interested', restore:'Restore to Regular' }[t];
    msg.textContent = `This will ${lbl.toLowerCase()} for all ${_cmSelected.size} selected devotees.`;
    msg.style.display = 'block';
  }
  if (t === 'callingby') {
    const sel = document.getElementById('bulk-callingby');
    sel.innerHTML = '<option value="">— Loading —</option>';
    try {
      const users = await DB.getUsersForTeam('');
      sel.innerHTML = '<option value="">— Select caller —</option>' +
        users.map(u => {
          const pos = u.position || (u.role === 'teamAdmin' ? 'Coordinator' : 'Facilitator');
          const team = u.teamName ? ` · ${u.teamName}` : '';
          return `<option value="${(u.name||'').replace(/"/g,'&quot;')}">${u.name} (${pos}${team})</option>`;
        }).join('');
    } catch (_) { sel.innerHTML = '<option value="">— Failed to load —</option>'; }
  }
}

async function doBulkApply() {
  const t  = document.getElementById('bulk-action-type').value;
  const ids = [...(_cmSelected || [])];
  if (!t)       { showToast('Choose an action', 'error'); return; }
  if (!ids.length) { showToast('No devotees selected', 'error'); return; }

  try {
    if (t === 'team') {
      const newTeam = document.getElementById('bulk-team').value;
      if (!newTeam) { showToast('Select a team', 'error'); return; }
      const batch = fdb.batch();
      ids.forEach(id => {
        batch.update(fdb.collection('devotees').doc(id), { teamName: newTeam, updatedAt: TS() });
        const ref = fdb.collection('profileChanges').doc();
        batch.set(ref, { devoteeId: id, fieldName: 'team_name', newValue: newTeam, changedBy: AppState.userName, changedAt: TS() });
      });
      await batch.commit();
    } else if (t === 'callingby') {
      const newCaller = document.getElementById('bulk-callingby').value;
      if (!newCaller) { showToast('Select a caller', 'error'); return; }
      const batch = fdb.batch();
      ids.forEach(id => {
        batch.update(fdb.collection('devotees').doc(id), { callingBy: newCaller, updatedAt: TS() });
        const ref = fdb.collection('profileChanges').doc();
        batch.set(ref, { devoteeId: id, fieldName: 'calling_by', newValue: newCaller, changedBy: AppState.userName, changedAt: TS() });
      });
      await batch.commit();
    } else if (t === 'restore') {
      const batch = fdb.batch();
      ids.forEach(id => batch.update(fdb.collection('devotees').doc(id),
        { callingMode: '', isNotInterested: false, updatedAt: TS() }));
      await batch.commit();
    } else {
      // online / festival / not_interested — write one-by-one (each records profileChanges)
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await DB.setDevoteeCallingMode(id, t);
      }
    }
    DevoteeCache.bust();
    closeModal('bulk-action-modal');
    showToast(`Applied to ${ids.length} devotees!`, 'success');
    _cmSelected.clear();
    loadCallingMgmtTab?.();
  } catch (e) {
    console.error(e);
    showToast('Bulk action failed: ' + (e.message || 'Error'), 'error');
  }
}
