/* ══ UI-ANALYTICS.JS – Reports, Care, Events tabs ══ */

// ── REPORTS TAB ───────────────────────────────────────
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
    const teams    = TEAMS;
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

// ── DEVOTEE CARE TAB ──────────────────────────────────
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

  // Populate team picker in action modal
  const teamSel = document.getElementById('mgmt-new-team');
  if (teamSel && !teamSel.options.length) {
    teamSel.innerHTML = TEAMS.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const weeks = await DB.getCallingWeekHistory(4);
    if (!weeks.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-info-circle"></i>
        <p>No calling weeks saved yet.<br>Enter Calling Date + Session Date above and click <strong>Save Dates</strong>.</p></div>`;
      return;
    }
    const [gridData, lists, allDevotees] = await Promise.all([
      DB.getMgmtGridData(weeks),
      DB.getMgmtSeparateLists(),
      DevoteeCache.all(),
    ]);
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
      <td colspan="${2 + weekData.length * 2 + 1}" style="background:#e8f5e9"></td>
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
    const [gridData, allDevotees] = await Promise.all([
      DB.getMgmtGridData(fyWeeks),
      DevoteeCache.all(),
    ]);
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
