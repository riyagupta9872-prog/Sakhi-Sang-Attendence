/* ══ ATTENDANCE.JS – Tab 3 ══ */

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
    // Cache for markPresent
    AppState.attendanceCandidates = {};
    candidates.forEach(d => { AppState.attendanceCandidates[d.id] = d; });

    if (!candidates.length) {
      list.innerHTML = search
        ? `<div class="empty-state"><i class="fas fa-search"></i><p>No result for "${search}"</p></div>`
        : '<div class="empty-state"><i class="fas fa-users"></i><p>No candidates for this session</p></div>';
      return;
    }
    list.innerHTML = candidates.map(renderAttendanceCard).join('');
  } catch (_) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function renderAttendanceCard(d) {
  const isPresent = !!d.attendance_id;
  return `
    <div class="attendance-card${isPresent ? ' is-present' : ''}" id="att-card-${d.id}">
      <div class="devotee-avatar" style="width:40px;height:40px;font-size:.9rem">${initials(d.name)}</div>
      <div class="attendance-card-info">
        <div class="attendance-card-name">${d.name}
          ${isBirthdayWeek(d.dob) ? '<i class="fas fa-birthday-cake" style="color:var(--gold);margin-left:.3rem"></i>' : ''}
          ${d.coming_status === 'Yes' ? '<span class="badge badge-expected" style="font-size:.7rem">Confirmed</span>' : ''}
        </div>
        <div class="attendance-card-meta">${d.team_name || ''}${d.reference_by ? ' · Ref: ' + d.reference_by : ''}${d.calling_by ? ' · Called: ' + d.calling_by : ''}</div>
        ${d.mobile ? `<div class="attendance-card-meta" style="margin-top:.2rem">${contactIcons(d.mobile)}</div>` : ''}
      </div>
      <div>
        ${isPresent
          ? `<span style="color:var(--success);font-weight:700;font-size:.85rem"><i class="fas fa-check-circle"></i> Present</span>
             <button class="undo-btn" onclick="undoPresent('${d.id}')">Undo</button>`
          : `<button class="present-btn" onclick="markPresent('${d.id}', false)">PRESENT</button>`
        }
      </div>
    </div>`;
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
