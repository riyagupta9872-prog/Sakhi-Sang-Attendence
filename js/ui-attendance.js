/* ══ UI-ATTENDANCE.JS – Attendance sheet, Sunday config, live session ══ */

// ── ATTENDANCE SUB-TAB ────────────────────────────────
function switchAttTab(tab, btn) {
  document.querySelectorAll('#tab-attendance .att-sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.att-sub-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('att-panel-' + tab).classList.add('active');
  const fab = document.getElementById('register-fab');
  if (fab) fab.classList.toggle('hidden', tab !== 'live');
  if (tab === 'sheet') loadAttendanceSheet();
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

function initSheetYearSelector(elId) {
  const sel = document.getElementById(elId || 'sheet-year');
  if (!sel || sel.options.length > 0) return;
  getFYYears().forEach((y, i) => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ start: y.start, end: y.end });
    opt.textContent = y.label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  });
}

// Simple roster (Attendance tab) — no per-session CS/AT columns
async function loadAttendanceSheet() {
  const wrap = document.getElementById('attendance-sheet-wrap');
  const teamFilter = document.getElementById('sheet-team').value;
  wrap.innerHTML = '<div class="loading" style="padding:2rem"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const devotees = await DevoteeCache.all();
    wrap.innerHTML = buildSimpleRoster(devotees, teamFilter);
  } catch (e) {
    console.error('Sheet error', e);
    wrap.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function buildSimpleRoster(devotees, teamFilter) {
  let rows = [...devotees];
  if (teamFilter) rows = rows.filter(d => d.teamName === teamFilter);
  rows.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || a.name.localeCompare(b.name));
  if (!rows.length) return '<div class="empty-state"><i class="fas fa-users"></i><p>No devotees found</p></div>';

  let currentTeam = null;
  const bodyRows = rows.map((d, i) => {
    const isActive = d.isActive !== false;
    const total = d.lifetimeAttendance || 0;
    const totalBg = total >= 30 ? 'background:#b2ebf2;font-weight:700' : total >= 15 ? 'background:#c8e6c9;font-weight:600' : total >= 5 ? 'background:#fff9c4' : '';
    let teamRow = '';
    if (d.teamName !== currentTeam) {
      currentTeam = d.teamName;
      teamRow = `<tr style="background:#e8f5e9"><td colspan="9" style="font-weight:700;color:var(--primary);padding:.3rem .6rem;font-size:.82rem">${currentTeam || '—'}</td></tr>`;
    }
    return teamRow + `<tr style="${isActive ? 'background:#fffde7' : 'background:#ffebee'}">
      <td class="sh-cell sh-center sh-sno">${i + 1}</td>
      <td class="sh-cell sh-name">${d.name}</td>
      <td class="sh-cell sh-center">${d.mobile || '—'}</td>
      <td class="sh-cell">${d.referenceBy || ''}</td>
      <td class="sh-cell sh-center">${d.chantingRounds || 0}</td>
      <td class="sh-cell sh-center">${isActive ? '<span class="sh-active">Active</span>' : ''}</td>
      <td class="sh-cell">${d.teamName || ''}</td>
      <td class="sh-cell">${d.callingBy || ''}</td>
      <td class="sh-cell sh-center" style="${totalBg}">${total}</td>
    </tr>`;
  }).join('');

  return `<table class="attendance-sheet-table">
    <thead><tr>
      <th class="sh-header sh-sno">Sno</th>
      <th class="sh-header" style="min-width:130px">Name</th>
      <th class="sh-header">Mobile</th>
      <th class="sh-header">Reference</th>
      <th class="sh-header">CR</th>
      <th class="sh-header">Active</th>
      <th class="sh-header">Team</th>
      <th class="sh-header">Calling By</th>
      <th class="sh-header sh-total">Total AT</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

// Full CS+AT grid (Reports → Yearly Sheet tab)
function buildFullSheetTable(devotees, sessions, attMap, csMap, teamFilter) {
  let rows = [...devotees];
  if (teamFilter) rows = rows.filter(d => d.teamName === teamFilter);
  rows.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || a.name.localeCompare(b.name));

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

  let h2 = '';
  sessions.forEach(s => {
    const sat = sheetFmtShort(shiftDateDay(s.sessionDate, -1));
    const sun = sheetFmtShort(s.sessionDate);
    h2 += `<th class="sh-sub-header">CS<small>${sat}</small></th><th class="sh-sub-header">AT<small>${sun}</small></th>`;
  });

  const bodyRows = rows.map((d, i) => {
    const isActive = d.isActive !== false;
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
    return `<tr style="${isActive ? 'background:#fffde7' : 'background:#ffebee'}">${cells}</tr>`;
  }).join('');

  return `<table class="attendance-sheet-table">
    <thead><tr>${h1}</tr><tr>${h2}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}

function shiftDateDay(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
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
function sheetFmtDDMMYY(dateStr) {
  return sheetFmtShort(dateStr);
}
function sheetFmtShortMonth(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${+d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]}`;
}
function csLabel(status) {
  return { Yes: 'Coming', 'Not Interested': 'N/I' }[status] || (status || '');
}
function csColor(status) {
  if (!status) return '';
  if (status === 'Yes')            return 'background:#c8e6c9';
  if (status === 'Not Interested') return 'background:#ffccbc';
  return 'background:#ffcdd2';
}
function csEntryText(entry) {
  if (!entry) return '';
  if (entry.status === 'Yes') return entry.notes ? `Coming — ${entry.notes}` : 'Coming';
  const reasonLbl = _reasonLabel(entry.reason || '');
  const avail = entry.availableFrom ? ` (from ${entry.availableFrom})` : '';
  const parts = [reasonLbl + avail, entry.notes].filter(Boolean);
  return parts.join(' | ');
}
function csEntryBg(entry) {
  if (!entry?.status) return null;
  if (entry.status === 'Yes') return 'C8E6C9';
  if (entry.reason === 'online_class') return 'E3F2FD';
  if (['out_of_station','exams'].includes(entry.reason)) return 'EDE7F6';
  if (entry.reason) return 'FFCDD2';
  return 'FFF9C4';
}

// ── LIVE SESSION ATTENDANCE ───────────────────────────
async function loadAttendanceTab() {
  if (!AppState.currentSessionId) await initSession();
  await loadAttendanceSession(AppState.currentSessionId);
}

async function loadAttendanceSession(sessionId) {
  if (!sessionId) return;
  AppState.currentSessionId = sessionId;
  const s = AppState.sessionsCache[sessionId];
  if (s?.session_date) _setSessionDateDisplay(s.session_date);
  showSessionInfo(sessionId);
  await Promise.all([updateAttendanceStats(), loadAttendanceCandidates()]);
}

async function updateAttendanceStats() {
  if (!AppState.currentSessionId) return;
  try {
    const s = await DB.getSessionStats(AppState.currentSessionId);
    document.getElementById('stat-confirmed').textContent = s.confirmed;
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
      const canEdit   = !isServiceDev || isPresent;
      const ts        = attTimeStyle(d.marked_at);
      const cardStyle = isPresent && ts.card ? ts.card : '';
      const timeLabel = isPresent && d.marked_at
        ? ` <span style="font-size:.7rem;opacity:.85">${new Date(d.marked_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>` : '';
      return `
        <div class="attendance-card${isPresent ? ' is-present' : ''}" id="att-card-${d.id}"
             style="${cardStyle}${canEdit ? ';cursor:pointer' : ''}"
             ${canEdit ? `onclick="openProfileModal('${d.id}')"` : ''}>
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
              ? `<span style="font-weight:700;font-size:.85rem;${ts.card.includes('c62828') ? 'color:#fff' : 'color:var(--success)'}"><i class="fas fa-check-circle"></i> P${timeLabel}</span>
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
