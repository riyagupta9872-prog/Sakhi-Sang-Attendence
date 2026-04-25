/* ══ UI-CALLING.JS – Calling status tab, reports, late tracking ══ */

let _callingActiveTab = 'list';
let _callingLocked = false;

function switchCallingTab(tab, btn) {
  // Legacy no-op: Calling tab now shows only the calling list.
  _callingActiveTab = 'list';
  loadCallingStatus();
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

async function _unusedMgmtStub() {
  // Management tab is now a top-level tab — see ui-analytics.js loadMgmtTab()
  const el = document.getElementById('calling-mgmt-content');
  if (!el) return;
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const week = document.getElementById('calling-week').value;
    if (!week) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Set a calling date first (use ⚙️ icon)</p></div>';
      return;
    }

    const data = await DB.getCallingMgmtData(week);
    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No active calling devotees found</p></div>';
      return;
    }

    // Group by team
    const teamMap = {};
    data.forEach(d => {
      const t = d.team_name || 'Unknown';
      if (!teamMap[t]) teamMap[t] = [];
      teamMap[t].push(d);
    });

    function statusChip(status, reason) {
      if (status === 'Yes') return `<span style="background:#e8f5e9;color:#1b5e20;padding:.1rem .4rem;border-radius:4px;font-size:.75rem;font-weight:600">✓ Yes</span>`;
      if (reason === 'online_class') return `<span style="background:#e3f2fd;color:#0d47a1;padding:.1rem .4rem;border-radius:4px;font-size:.75rem">💻 Online</span>`;
      if (reason === 'festival_calling') return `<span style="background:#fff8e1;color:#e65100;padding:.1rem .4rem;border-radius:4px;font-size:.75rem">🌟 Festival</span>`;
      if (reason === 'not_interested_now') return `<span style="background:#fce4ec;color:#b71c1c;padding:.1rem .4rem;border-radius:4px;font-size:.75rem">✗ Not Int.</span>`;
      if (reason) return `<span style="background:#fff3e0;color:#bf360c;padding:.1rem .4rem;border-radius:4px;font-size:.75rem">${_reasonLabel(reason)}</span>`;
      return `<span style="color:var(--text-muted);font-size:.75rem">—</span>`;
    }

    function historyDots(history) {
      if (!history || !history.length) return '<span style="color:var(--text-muted);font-size:.72rem">No history</span>';
      return history.slice(0,4).map(h => {
        const ok = h.comingStatus === 'Yes';
        const col = ok ? '#27ae60' : (h.comingStatus || h.callingReason) ? '#e67e22' : '#bbb';
        const tip = ok ? 'Yes' : (_reasonLabel(h.callingReason) || h.comingStatus || 'Not called');
        return `<span title="${formatDate(h.weekDate)}: ${tip}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${col};margin:0 1px"></span>`;
      }).join('');
    }

    let html = `<div style="margin-bottom:.75rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
      <span style="font-size:.82rem;color:var(--text-muted)"><i class="fas fa-info-circle"></i> Last 4 weeks activity dots: <span style="color:#27ae60">●</span> Yes &nbsp;<span style="color:#e67e22">●</span> Called/Reason &nbsp;<span style="color:#bbb">●</span> Not called</span>
    </div>`;

    TEAMS.forEach(team => {
      const members = teamMap[team];
      if (!members) return;
      let rows = '';
      members.forEach((d, i) => {
        const empty = !d.current_status && !d.current_reason;
        rows += `<tr style="font-size:.82rem${empty ? ';background:#fff8e1' : ''}">
          <td style="color:var(--text-muted);padding:.4rem .5rem">${i+1}</td>
          <td style="padding:.4rem .5rem">
            <div style="font-weight:600">${d.name}</div>
            <div style="font-size:.72rem;color:var(--text-muted)">${d.mobile || ''}</div>
          </td>
          <td style="padding:.4rem .5rem">
            ${teamBadge(team)}
            <button onclick="openTeamHistory('${d.id}','${d.name.replace(/'/g,"\\'")}','${team}')" title="Team change history"
              style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.8rem;margin-left:.2rem;padding:.1rem .25rem" >
              <i class="fas fa-pencil-alt"></i>
            </button>
          </td>
          <td style="padding:.4rem .5rem;font-size:.75rem;color:var(--text-muted)">${d.calling_by || '—'}</td>
          <td style="text-align:center;padding:.4rem .5rem;font-weight:700;color:var(--primary)">${d.lifetime_attendance || 0}</td>
          <td style="padding:.4rem .5rem">${statusChip(d.current_status, d.current_reason)}</td>
          <td style="padding:.4rem .5rem">${historyDots(d.history)}</td>
          <td style="padding:.4rem .5rem">
            <button onclick="openQuickStatus('${d.id}','${d.name.replace(/'/g,"\\'")}','${week}')"
              style="font-size:.72rem;padding:.2rem .5rem;background:var(--accent-light);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--primary);font-weight:600;white-space:nowrap">
              <i class="fas fa-bolt"></i> Quick Update
            </button>
          </td>
        </tr>`;
      });

      html += `<div class="sr-team-block" style="margin-bottom:1.25rem">
        <div class="sr-team-banner"><i class="fas fa-users"></i> ${team} <span style="font-size:.8rem;font-weight:400;opacity:.8">(${members.length})</span></div>
        <div style="overflow-x:auto">
        <table class="calling-table sr-table" style="margin:0">
          <thead><tr>
            <th style="width:32px">#</th>
            <th style="min-width:140px">Name</th>
            <th style="min-width:110px">Team</th>
            <th style="min-width:120px">Calling By</th>
            <th style="text-align:center;min-width:60px" title="Lifetime Attendance">🕉️ Att.</th>
            <th style="min-width:110px">This Week</th>
            <th style="min-width:90px" title="Last 4 weeks">4-Wk Activity</th>
            <th style="min-width:100px">Action</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    });

    el.innerHTML = html;
  } catch(e) {
    console.error(e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

async function openTeamHistory(devoteeId, devoteeName, currentTeam) {
  const modal = document.getElementById('team-history-modal');
  if (!modal) return;
  document.getElementById('team-history-name').textContent = devoteeName;
  document.getElementById('team-history-content').innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  modal.classList.remove('hidden');
  try {
    const history = await DB.getTeamChangeHistory(devoteeId);
    if (!history.length) {
      document.getElementById('team-history-content').innerHTML =
        `<div style="text-align:center;padding:1rem;color:var(--text-muted)"><i class="fas fa-info-circle"></i> No team changes recorded.<br>Current team: ${teamBadge(currentTeam)}</div>`;
      return;
    }
    document.getElementById('team-history-content').innerHTML = `
      <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem">Current: ${teamBadge(currentTeam)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead><tr style="background:var(--primary);color:#fff">
          <th style="padding:.3rem .6rem;text-align:left">Date & Time</th>
          <th style="padding:.3rem .6rem;text-align:left">Changed By</th>
          <th style="padding:.3rem .6rem;text-align:left">From</th>
          <th style="padding:.3rem .6rem;text-align:left">To</th>
        </tr></thead>
        <tbody>
          ${history.map((h, i) => {
            const dt = h.changedAt?.toDate ? h.changedAt.toDate() : (h.changedAt ? new Date(h.changedAt) : null);
            const dtStr = dt ? dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) + ' ' + dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
            return `<tr style="background:${i%2?'#fff':'#f9f9f9'}">
              <td style="padding:.3rem .6rem;color:var(--text-muted)">${dtStr}</td>
              <td style="padding:.3rem .6rem;font-weight:600">${h.changedBy || '—'}</td>
              <td style="padding:.3rem .6rem">${teamBadge(h.oldValue) || h.oldValue || '—'}</td>
              <td style="padding:.3rem .6rem">${teamBadge(h.newValue) || h.newValue || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    document.getElementById('team-history-content').innerHTML = '<div class="empty-state"><p>Failed to load history</p></div>';
  }
}

async function openQuickStatus(devoteeId, devoteeName, week) {
  const modal = document.getElementById('quick-status-modal');
  if (!modal) return;
  document.getElementById('qs-devotee-name').textContent = devoteeName;
  document.getElementById('qs-devotee-id').value = devoteeId;
  document.getElementById('qs-week').value = week;
  // Load current status
  const d = AppState.callingData?.find(x => x.id === devoteeId);
  const selReason = document.getElementById('qs-reason');
  const selStatus = document.getElementById('qs-coming');
  if (selReason) selReason.value = d?.calling_reason || '';
  if (selStatus) selStatus.value = d?.coming_status || '';
  modal.classList.remove('hidden');
}

async function saveQuickStatus() {
  const devoteeId = document.getElementById('qs-devotee-id').value;
  const week      = document.getElementById('qs-week').value;
  const status    = document.getElementById('qs-coming').value;
  const reason    = document.getElementById('qs-reason').value;
  if (!devoteeId || !week) return;
  try {
    await DB.updateCallingStatus(devoteeId, week, { coming_status: status, calling_reason: reason, calling_notes: '' });
    closeModal('quick-status-modal');
    showToast('Status updated!', 'success');
    loadManagementTab();
  } catch(e) {
    showToast('Failed: ' + (e.message || 'Error'), 'error');
  }
}

async function saveCallingWeekConfig() {
  const cd = document.getElementById('config-calling-date').value;
  const sd = document.getElementById('config-calling-session-date').value;
  if (!cd) { showToast('Please set a calling date', 'error'); return; }
  try {
    await DB.setCallingWeekConfig(cd, sd);
    showToast('Dates saved!', 'success');
    loadCallingStatus();
  } catch (e) {
    showToast('Failed to save: ' + (e.message || 'Check connection'), 'error');
  }
}

async function loadCallingStatus() {
  _callingLocked = false;
  document.getElementById('calling-list').innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const cfg = await DB.getCallingWeekConfig();
    let week = cfg?.callingDate || '';
    let sessionDate = cfg?.sessionDate || '';
    let isHistoryFallback = false;
    let beforeCallingDate = false;

    if (week) {
      const today = getToday();
      if (today < week) {
        // Before calling date → list is read-only, no submit yet
        _callingLocked = true;
        beforeCallingDate = true;
      } else if (today > week) {
        // After calling date → locked (past)
        _callingLocked = true;
      } else {
        // today === callingDate: open until 11:59 PM
        _callingLocked = Date.now() > new Date(week + 'T23:59:00').getTime();
      }
    } else {
      _callingLocked = true;
      isHistoryFallback = true;
      const history = await DB.getCallingWeekHistory(1);
      if (history.length) {
        week = history[0].callingDate;
        sessionDate = history[0].sessionDate || '';
      }
    }

    window._callingSessionDate = sessionDate;
    document.getElementById('calling-week').value = week;

    const disp = document.getElementById('calling-dates-display');
    if (disp) {
      if (week) {
        const cd = new Date(week + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
        const sd = sessionDate ? new Date(sessionDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : '—';
        disp.innerHTML = `<i class="fas fa-phone-alt"></i> <strong>${cd}</strong>&nbsp;&nbsp;<i class="fas fa-chalkboard-teacher"></i> <strong>${sd}</strong>`;
      } else {
        disp.innerHTML = '<span style="color:var(--danger);font-size:.82rem"><i class="fas fa-exclamation-circle"></i> No dates configured</span>';
      }
    }

    _renderSessionInfoChip(cfg, sessionDate);

    if (!week) {
      document.getElementById('calling-list').innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No session configured yet.<br>Super Admin must configure the next session from the sidebar.</p></div>';
      document.getElementById('calling-stats').innerHTML = '';
      const bar = document.getElementById('calling-submit-bar');
      if (bar) bar.innerHTML = '';
      return;
    }

    window._beforeCallingDate = beforeCallingDate;

    const [devotees, mySubmission] = await Promise.all([
      DB.getCallingStatus(week),
      _callingLocked ? Promise.resolve(null) : DB.getMyCallingSubmission(week, AppState.userId).catch(() => null)
    ]);
    AppState.callingData = devotees;

    const teamSel = document.getElementById('calling-filter-team');
    const prevTeam = teamSel.value;
    teamSel.innerHTML = '<option value="">All Teams</option>' +
      TEAMS.filter(t => devotees.some(d => d.team_name === t))
           .map(t => `<option value="${t}"${prevTeam===t?' selected':''}>${t}</option>`).join('');
    const bySel = document.getElementById('calling-filter-callingby');
    const prevBy = bySel.value;
    const callers = [...new Set(devotees.map(d => d.calling_by).filter(Boolean))].sort();
    bySel.innerHTML = '<option value="">All Calling By</option>' +
      callers.map(c => `<option value="${c}"${prevBy===c?' selected':''}>${c}</option>`).join('');

    renderCallingStats(devotees);
    if (_callingLocked) {
      _renderLockedBanner(isHistoryFallback, week, window._beforeCallingDate);
    } else {
      _renderCallingSubmitBar(week, mySubmission);
    }
    filterCallingList();
  } catch (e) {
    console.error(e);
    document.getElementById('calling-list').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function _renderSessionInfoChip(cfg, sessionDate) {
  const host = document.getElementById('calling-panel-list');
  if (!host) return;
  let chip = document.getElementById('calling-session-chip');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'calling-session-chip';
    chip.className = 'session-info-chip';
    host.insertBefore(chip, host.firstChild);
  }
  const parts = [];
  if (cfg?.topic) {
    parts.push(`<span class="sic-item"><i class="fas fa-book-open"></i> <span class="sic-label">Topic:</span> <strong>${cfg.topic}</strong></span>`);
  }
  if (cfg?.speakerName) {
    parts.push(`<span class="sic-item"><i class="fas fa-user-tie"></i> <span class="sic-label">Speaker:</span> <strong>${cfg.speakerName}</strong></span>`);
  }
  if (sessionDate) {
    const sd = new Date(sessionDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    parts.push(`<span class="sic-item"><i class="fas fa-chalkboard-teacher"></i> <span class="sic-label">Upcoming Class:</span> <strong>${sd}</strong></span>`);
  }
  if (cfg?.sessionType) {
    const cls = cfg.sessionType === 'festival' ? 'sic-type-festival' : 'sic-type-regular';
    parts.push(`<span class="${cls}">${cfg.sessionType === 'festival' ? '🌟 Festival' : '● Regular'}</span>`);
  }
  if (!parts.length) {
    chip.style.display = 'none';
    return;
  }
  chip.style.display = '';
  chip.innerHTML = parts.join('');
}

function _renderLockedBanner(isHistoryFallback, weekDate, beforeCallingDate) {
  const bar = document.getElementById('calling-submit-bar');
  if (!bar) return;
  const weekLabel = weekDate
    ? new Date(weekDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', weekday:'short' })
    : '';
  if (beforeCallingDate) {
    bar.style.background  = '#fff8e1';
    bar.style.borderColor = '#ffcc80';
    bar.innerHTML = `<div style="flex:1">
      <span style="font-size:.9rem;font-weight:700;color:#e65100">
        <i class="fas fa-hourglass-half"></i> Calling opens on <strong>${weekLabel}</strong>
      </span>
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:.2rem">
        Your devotee list is available for reference. Submit will unlock on the calling date.
      </div>
    </div>`;
  } else if (isHistoryFallback) {
    bar.style.background  = '#e3f2fd';
    bar.style.borderColor = '#90caf9';
    bar.innerHTML = `<div style="flex:1">
      <span style="font-size:.9rem;font-weight:700;color:#0d47a1">
        <i class="fas fa-info-circle"></i> Showing previous week — <strong>${weekLabel}</strong>
      </span>
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:.2rem">
        No session is configured. This is last week's data for reference. Super Admin must configure the next session.
      </div>
    </div>`;
  } else {
    bar.style.background  = '#fce4ec';
    bar.style.borderColor = '#ef9a9a';
    bar.innerHTML = `<div style="flex:1">
      <span style="font-size:.9rem;font-weight:700;color:#b71c1c">
        <i class="fas fa-lock"></i> Calling date of <strong>${weekLabel}</strong> has passed
      </span>
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:.2rem">
        The submission window (until 11:59 PM on calling date) has closed. This list is read-only.
      </div>
    </div>`;
  }
}

function _renderCallingSubmitBar(week, existing) {
  const bar = document.getElementById('calling-submit-bar');
  if (!bar) return;
  const weekLabel = week
    ? new Date(week + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    : '';
  if (existing && existing.initialSubmittedAtClient) {
    const init = new Date(existing.initialSubmittedAtClient);
    const initTime = init.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
    const isLate = init.getHours() >= 21;
    const latest = existing.submittedAtClient && existing.submittedAtClient !== existing.initialSubmittedAtClient
      ? new Date(existing.submittedAtClient).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })
      : null;
    bar.style.background  = isLate ? '#fff3e0' : '#e8f5e9';
    bar.style.borderColor = isLate ? '#ffb74d' : 'var(--secondary)';
    bar.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.2rem;flex:1">
        <span style="font-size:.9rem;font-weight:700;color:${isLate ? '#bf360c' : 'var(--success)'}">
          <i class="fas fa-${isLate ? 'clock' : 'check-circle'}"></i>
          Calling Status of <strong>${weekLabel}</strong> was submitted at <strong>${initTime}</strong>${isLate ? ' — Late' : ' ✓'}
        </span>
        ${latest ? `<span style="font-size:.75rem;color:var(--text-muted)"><i class="fas fa-redo"></i> Last update: ${latest}</span>` : ''}
        <span style="font-size:.75rem;color:var(--text-muted)"><i class="fas fa-pencil-alt"></i> You can still edit and re-submit for corrections. Original timestamp is locked.</span>
      </div>
      <button class="btn btn-primary" style="padding:.35rem 1rem;font-size:.85rem;flex-shrink:0" onclick="doSubmitCallingWeek('${week}')">
        <i class="fas fa-paper-plane"></i> Re-submit
      </button>`;
  } else if (week) {
    bar.style.background  = '';
    bar.style.borderColor = '';
    bar.innerHTML = `
      <span style="font-size:.85rem;color:var(--text-muted)">
        <i class="fas fa-info-circle"></i> Done calling for <strong>${weekLabel}</strong>?
      </span>
      <button class="btn btn-primary" style="padding:.35rem 1rem;font-size:.85rem" onclick="doSubmitCallingWeek('${week}')">
        <i class="fas fa-paper-plane"></i> Submit Calling
      </button>`;
  } else {
    bar.innerHTML = '';
  }
}

async function doSubmitCallingWeek(week) {
  try {
    await DB.submitCallingWeek(week, AppState.userId, AppState.userName, AppState.userTeam);
    showToast('Calling submitted! Hare Krishna 🙏', 'success');
  } catch (e) {
    console.error('Submit calling failed:', e);
    showToast('Submit failed: ' + (e.message || 'Check connection & try again'), 'error');
    return;
  }
  try {
    const sub = await DB.getMyCallingSubmission(week, AppState.userId);
    _renderCallingSubmitBar(week, sub);
  } catch (_) {
    _renderCallingSubmitBar(week, { submittedAtClient: new Date().toISOString() });
  }
}

const CALLING_REASONS = [
  { value: '',               label: '— Select reason —',          text: '',                             needsDate: false },
  { value: 'did_not_pick',   label: 'Did not pick call',          text: 'Did not pick call',            needsDate: false },
  { value: 'incoming_na',    label: 'Incoming not available',     text: 'Incoming not available',       needsDate: false },
  { value: 'wrong_number',   label: 'Wrong number',               text: 'Wrong number',                 needsDate: false },
  { value: 'online_class',   label: 'Shifted to online class',    text: 'Shifted to online class',      needsDate: false },
  { value: 'out_of_service', label: 'Temporarily out of service', text: 'Temporarily out of service',   needsDate: false },
  { value: 'out_of_station', label: 'Out of station',             text: 'Out of station — available from: ', needsDate: true },
  { value: 'exams',             label: 'Exams',                      text: 'Exams — available from: ',     needsDate: true },
  { value: 'festival_calling',  label: 'Festival Calling',           text: 'Festival Calling',             needsDate: false },
  { value: 'not_interested_now',label: 'Not Interested (this week)', text: 'Not Interested',               needsDate: false },
];

function _reasonLabel(r) {
  return CALLING_REASONS.find(x => x.value === r)?.label || r || '';
}
function _reasonNeedsDate(r) {
  return CALLING_REASONS.find(x => x.value === r)?.needsDate || false;
}

function renderCallingStats(devotees) {
  const yes       = devotees.filter(d => d.coming_status === 'Yes').length;
  const reached   = devotees.filter(d => ['did_not_pick','incoming_na','wrong_number','out_of_service'].includes(d.calling_reason)).length;
  const unavail   = devotees.filter(d => ['out_of_station','exams'].includes(d.calling_reason)).length;
  const online    = devotees.filter(d => d.calling_reason === 'online_class').length;
  const festival  = devotees.filter(d => d.calling_reason === 'festival_calling').length;
  const notInt    = devotees.filter(d => d.calling_reason === 'not_interested_now').length;
  const uncalled  = devotees.filter(d => !d.coming_status && !d.calling_reason && !d.calling_notes).length;
  document.getElementById('calling-stats').innerHTML = `
    <div class="calling-stat"><i class="fas fa-check-circle" style="color:var(--success)"></i> <strong>${yes}</strong> Confirmed</div>
    <div class="calling-stat"><i class="fas fa-phone-slash" style="color:var(--danger)"></i> <strong>${reached}</strong> Not reached</div>
    <div class="calling-stat"><i class="fas fa-calendar-times" style="color:#7b5ea7"></i> <strong>${unavail}</strong> Unavailable</div>
    <div class="calling-stat"><i class="fas fa-laptop" style="color:#0288d1"></i> <strong>${online}</strong> Online</div>
    ${festival ? `<div class="calling-stat"><i class="fas fa-star-and-crescent" style="color:#f57f17"></i> <strong>${festival}</strong> Festival</div>` : ''}
    ${notInt ? `<div class="calling-stat"><i class="fas fa-ban" style="color:var(--danger)"></i> <strong>${notInt}</strong> Not Interested</div>` : ''}
    <div class="calling-stat"><i class="fas fa-circle-notch" style="color:var(--text-muted)"></i> <strong>${uncalled}</strong> Not called</div>`;
}

function filterCallingList() {
  const q    = document.getElementById('calling-search').value.toLowerCase();
  const s    = document.getElementById('calling-filter-status').value;
  const team = document.getElementById('calling-filter-team').value;
  const by   = document.getElementById('calling-filter-callingby').value;
  renderCallingList(AppState.callingData.filter(d => {
    if (q    && !d.name.toLowerCase().includes(q) && !(d.mobile||'').includes(q)) return false;
    if (team && d.team_name !== team) return false;
    if (by   && d.calling_by !== by) return false;
    if (s) {
      if (s === '_none') return !d.coming_status && !d.calling_reason && !d.calling_notes;
      if (s === 'Yes')   return d.coming_status === 'Yes';
      return d.calling_reason === s;
    }
    return true;
  }), _callingLocked);
}

function renderCallingList(devotees, locked) {
  const wrap = document.getElementById('calling-list');
  if (!devotees.length) { wrap.innerHTML = '<div class="empty-state"><i class="fas fa-phone-slash"></i><p>No devotees found</p></div>'; return; }
  wrap.innerHTML = `<table class="calling-table">
    <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Team</th><th>Calling By</th><th>${locked ? 'Status' : '✓ Coming'}</th><th>Reason &amp; Notes</th></tr></thead>
    <tbody>${devotees.map((d, i) => renderCallingRow(d, i + 1, locked)).join('')}</tbody>
  </table>`;
}

function _reasonOptions(selected) {
  return CALLING_REASONS.map(r =>
    `<option value="${r.value}"${r.value === selected ? ' selected' : ''}>${r.label}</option>`
  ).join('');
}

function renderCallingRow(d, i, locked) {
  const isYes   = d.coming_status === 'Yes';
  const reason  = d.calling_reason || '';
  const safeId  = d.id;
  const safeName = d.name.replace(/'/g,"\\'");

  if (locked) {
    const avail = (_reasonNeedsDate(reason) && d.available_from) ? ` · from ${formatDate(d.available_from)}` : '';
    let statusChip;
    if (isYes) {
      statusChip = `<span style="background:#e8f5e9;color:#1b5e20;padding:.2rem .6rem;border-radius:4px;font-size:.82rem;font-weight:600"><i class="fas fa-check-circle"></i> Coming</span>`;
    } else if (reason) {
      statusChip = `<span style="background:#fff3e0;color:#bf360c;padding:.2rem .6rem;border-radius:4px;font-size:.82rem">${_reasonLabel(reason)}${avail}</span>`;
    } else {
      statusChip = `<span style="color:var(--text-muted);font-size:.82rem">—</span>`;
    }
    const notesHtml = d.calling_notes
      ? `<div style="font-size:.75rem;color:var(--text-muted);font-style:italic">"${(d.calling_notes||'').replace(/"/g,'&quot;')}"</div>`
      : `<span style="color:var(--text-muted);font-size:.75rem">—</span>`;
    return `<tr data-id="${safeId}" class="${isYes ? 'row-confirmed' : (reason ? 'row-has-reason' : '')}">
      <td class="cs-num">${i}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <div class="devotee-avatar" style="width:28px;height:28px;font-size:.65rem;flex-shrink:0">${initials(d.name)}</div>
          <span class="calling-name-link" onclick="openCallingHistory('${safeId}','${safeName}')">
            ${d.name}${isBirthdayWeek(d.dob) ? ' <i class="fas fa-birthday-cake" style="color:var(--gold);font-size:.7rem"></i>' : ''}
          </span>
        </div>
      </td>
      <td>${contactIcons(d.mobile)}</td>
      <td>${teamBadge(d.team_name)}</td>
      <td class="cs-callingby">${d.calling_by || '—'}</td>
      <td>${statusChip}</td>
      <td><div class="reason-notes-cell">${notesHtml}</div></td>
    </tr>`;
  }

  const needsDate = _reasonNeedsDate(reason);
  const updTime = d.updated_at_client
    ? `<span class="calling-upd-time">${new Date(d.updated_at_client).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})}</span>` : '';
  return `<tr data-id="${safeId}" class="${isYes ? 'row-confirmed' : (reason ? 'row-has-reason' : '')}">
    <td class="cs-num">${i}</td>
    <td>
      <div style="display:flex;align-items:center;gap:.4rem">
        <div class="devotee-avatar" style="width:28px;height:28px;font-size:.65rem;flex-shrink:0">${initials(d.name)}</div>
        <span class="calling-name-link" onclick="openCallingHistory('${safeId}','${safeName}')">
          ${d.name}${isBirthdayWeek(d.dob) ? ' <i class="fas fa-birthday-cake" style="color:var(--gold);font-size:.7rem"></i>' : ''}
        </span>
      </div>
    </td>
    <td>${contactIcons(d.mobile)}</td>
    <td>${teamBadge(d.team_name)}</td>
    <td class="cs-callingby">${d.calling_by || '—'}</td>
    <td>
      <button class="coming-toggle${isYes ? ' active' : ''}" onclick="toggleComing('${safeId}', this)" title="${isYes ? 'Click to unmark' : 'Mark as confirmed coming'}">
        ${isYes ? '<i class="fas fa-check-circle"></i> Coming' : '<i class="fas fa-circle"></i> Mark Yes'}
      </button>
      ${updTime}
    </td>
    <td>
      <div class="reason-notes-cell">
        <select class="calling-reason-select${reason ? ' has-reason' : ''}" onchange="onReasonChange('${safeId}', this)" onclick="event.stopPropagation()">
          ${_reasonOptions(reason)}
        </select>
        <input type="date" class="calling-avail-date filter-select" style="display:${needsDate ? 'block' : 'none'}"
          value="${d.available_from || ''}" title="Available from this date"
          onchange="updateAvailableFrom('${safeId}', this.value)" onclick="event.stopPropagation()">
        <input class="calling-notes-input" type="text" placeholder="Add notes…" value="${(d.calling_notes || '').replace(/"/g,'&quot;')}"
          onchange="updateCallingNotes('${safeId}', this.value)" onclick="event.stopPropagation()">
      </div>
    </td>
  </tr>`;
}

async function openCallingHistory(devoteeId, devoteeName) {
  const modal = document.getElementById('calling-history-modal');
  document.getElementById('calling-history-name').innerHTML = `<i class="fas fa-history"></i> ${devoteeName}`;
  document.getElementById('calling-history-content').innerHTML =
    '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  modal.classList.remove('hidden');
  try {
    const history = await DB.getCallingHistory(devoteeId, 4);
    document.getElementById('calling-history-content').innerHTML = history.map(h => {
      const label = formatDate(h.weekDate);
      const isYes = h.comingStatus === 'Yes';
      const reason = h.callingReason || '';
      const reasonLbl = _reasonLabel(reason);
      const avail = h.availableFrom ? ` (available from ${formatDate(h.availableFrom)})` : '';
      const statusHtml = isYes
        ? `<span style="font-weight:700;color:var(--success)"><i class="fas fa-check-circle"></i> Confirmed Coming</span>`
        : (reason
            ? `<span style="font-weight:600;color:var(--danger)">${reasonLbl}${avail}</span>`
            : (h.comingStatus ? `<span style="font-weight:600;color:var(--text-muted)">${h.comingStatus}</span>` : '<span style="color:var(--text-muted)">Not called</span>'));
      const note = h.callingNotes ? `<div style="font-size:.8rem;color:var(--text-muted);margin-top:.2rem;font-style:italic">"${h.callingNotes}"</div>` : '';
      return `<div style="display:flex;align-items:flex-start;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border-subtle)">
        <div style="min-width:80px;font-size:.8rem;color:var(--text-muted)">${label}</div>
        <div>${statusHtml}${note}</div>
      </div>`;
    }).join('') || '<div class="empty-state"><p>No calling history</p></div>';
  } catch (_) {
    document.getElementById('calling-history-content').innerHTML = '<div class="empty-state"><p>Failed to load history</p></div>';
  }
}

async function toggleComing(devoteeId, btn) {
  if (_callingLocked) return;
  const week = document.getElementById('calling-week').value;
  const d = AppState.callingData.find(x => x.id === devoteeId);
  const row = btn.closest('tr');
  const isNowYes = !d || d.coming_status !== 'Yes';

  try {
    const payload = isNowYes
      ? { coming_status: 'Yes', calling_reason: '', available_from: null }
      : { coming_status: '', calling_reason: '', available_from: null };
    await DB.updateCallingStatus(devoteeId, week, payload);

    if (d) { d.coming_status = isNowYes ? 'Yes' : ''; d.calling_reason = ''; d.available_from = null; }
    btn.className = 'coming-toggle' + (isNowYes ? ' active' : '');
    btn.innerHTML = isNowYes
      ? '<i class="fas fa-check-circle"></i> Coming'
      : '<i class="fas fa-circle"></i> Mark Yes';
    row.className = isNowYes ? 'row-confirmed' : '';

    if (isNowYes) {
      const sel = row.querySelector('.calling-reason-select');
      if (sel) { sel.value = ''; sel.classList.remove('has-reason'); }
      const datePicker = row.querySelector('.calling-avail-date');
      if (datePicker) datePicker.style.display = 'none';
    }
    renderCallingStats(AppState.callingData);
  } catch (_) { showToast('Update failed', 'error'); }
}

function onReasonChange(devoteeId, sel) {
  if (_callingLocked) return;
  const reason = sel.value;
  const row = sel.closest('tr');
  const notesInput = row?.querySelector('.calling-notes-input');
  const datePicker = row?.querySelector('.calling-avail-date');
  const needsDate = _reasonNeedsDate(reason);

  sel.classList.toggle('has-reason', !!reason);

  const reasonDef = CALLING_REASONS.find(r => r.value === reason);
  if (reasonDef && reasonDef.text && notesInput && !notesInput.value) {
    notesInput.value = reasonDef.text;
  }

  if (datePicker) datePicker.style.display = needsDate ? 'block' : 'none';

  const d = AppState.callingData.find(x => x.id === devoteeId);
  if (d && d.coming_status === 'Yes' && reason) {
    const toggleBtn = row?.querySelector('.coming-toggle');
    if (toggleBtn) {
      toggleBtn.className = 'coming-toggle';
      toggleBtn.innerHTML = '<i class="fas fa-circle"></i> Mark Yes';
    }
    row.className = 'row-has-reason';
    if (d) d.coming_status = '';
  }

  if (needsDate && datePicker && !datePicker.value) {
    showToast('Please select the available-from date', 'error');
    datePicker.focus();
    return;
  }

  _saveCallingReason(devoteeId, reason, notesInput?.value || '', datePicker?.value || null);
}

async function updateAvailableFrom(devoteeId, date) {
  if (_callingLocked) return;
  const week = document.getElementById('calling-week').value;
  const row = document.querySelector(`tr[data-id="${devoteeId}"]`);
  const notesInput = row?.querySelector('.calling-notes-input');
  const notes = notesInput?.value || '';
  const d = AppState.callingData.find(x => x.id === devoteeId);
  try {
    await DB.updateCallingStatus(devoteeId, week, { coming_status: '', available_from: date, calling_notes: notes });
    if (d) d.available_from = date;
  } catch (_) { showToast('Update failed', 'error'); }
}

const _reasonTimers = {};
function _saveCallingReason(devoteeId, reason, notes, availFrom) {
  if (_callingLocked) return;
  clearTimeout(_reasonTimers[devoteeId]);
  _reasonTimers[devoteeId] = setTimeout(async () => {
    const week = document.getElementById('calling-week').value;
    const d = AppState.callingData.find(x => x.id === devoteeId);
    try {
      await DB.updateCallingStatus(devoteeId, week, {
        coming_status: '', calling_reason: reason, calling_notes: notes, available_from: availFrom
      });
      if (d) { d.calling_reason = reason; d.calling_notes = notes; d.available_from = availFrom; }
      const row = document.querySelector(`tr[data-id="${devoteeId}"]`);
      if (row) row.className = reason ? 'row-has-reason' : '';
      renderCallingStats(AppState.callingData);
    } catch (_) {}
  }, 600);
}

const _notesTimers = {};
function updateCallingNotes(devoteeId, notes) {
  if (_callingLocked) return;
  clearTimeout(_notesTimers[devoteeId]);
  _notesTimers[devoteeId] = setTimeout(async () => {
    const week = document.getElementById('calling-week').value;
    const d = AppState.callingData.find(x => x.id === devoteeId);
    try {
      await DB.updateCallingStatus(devoteeId, week, {
        coming_status: d?.coming_status || '', calling_notes: notes,
        calling_reason: d?.calling_reason || ''
      });
      if (d) d.calling_notes = notes;
    } catch (_) {}
  }, 800);
}

let _reportType = 'summary';

function switchReportType(type, btn) {
  // Toggle: clicking accuracy again returns to summary
  if (_reportType === type && type === 'accuracy') {
    _reportType = 'summary';
    document.getElementById('rpt-tab-accuracy').classList.remove('btn-primary');
    document.getElementById('rpt-tab-accuracy').classList.add('btn-secondary');
    loadCallingReports();
    return;
  }
  _reportType = type;
  document.getElementById('rpt-tab-accuracy').classList.toggle('btn-primary',   type === 'accuracy');
  document.getElementById('rpt-tab-accuracy').classList.toggle('btn-secondary',  type === 'summary');
  loadCallingReports();
}

async function _populateReportWeeks() {
  const sel = document.getElementById('calling-report-week');
  if (!sel) return;
  try {
    const weeks = await DB.getCallingWeeksList();
    if (!weeks.length) {
      sel.innerHTML = '<option value="">No data yet</option>';
      return;
    }
    const current = sel.value;
    sel.innerHTML = weeks.map(w => {
      const label = new Date(w + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
      return `<option value="${w}"${w === current ? ' selected' : ''}>${label}</option>`;
    }).join('');
    if (!sel.value) sel.value = weeks[0];
  } catch (e) {
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function loadCallingReports() {
  const sel = document.getElementById('calling-report-week');
  const week = sel?.value || '';
  if (!week) return;

  const el = document.getElementById('calling-reports-content');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  if (_reportType === 'summary') return _loadCallingSummary(week, el);
  return _loadAccuracyReport(week, el);
}

async function _loadCallingSummary(week, el) {
  try {
    const report = await DB.getCallingReport(week);
    const teams = Object.keys(report).filter(k => !k.startsWith('_'));
    if (!teams.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No calling data for this week</p></div>';
      return;
    }
    const weekLabel = formatDate(week);
    let gTotal=0, gCalled=0, gNC=0, gYes=0, gOnline=0, gFestival=0, gNI=0;
    let bodyRows = '';

    teams.forEach(team => {
      const t = report[team];
      gTotal += t.total; gCalled += t.called; gNC += t.notCalled;
      gYes += t.yes; gOnline += (t.online||0); gFestival += (t.festival||0); gNI += (t.notInterested||0);

      bodyRows += `<tr style="background:var(--accent-light);font-weight:700;font-size:.83rem">
        <td colspan="2">${teamBadge(team)}</td>
        <td style="text-align:center">${t.total}</td>
        <td style="text-align:center">${t.called}</td>
        <td style="text-align:center;color:#c62828">${t.notCalled}</td>
        <td style="text-align:center;color:var(--success)">${t.yes}</td>
        <td style="text-align:center;color:#0288d1">${t.online||0}</td>
        <td style="text-align:center;color:#f57f17">${t.festival||0}</td>
        <td style="text-align:center;color:var(--danger)">${t.notInterested||0}</td>
      </tr>`;

      const sortedCallers = Object.entries(t.callers).sort(([,a],[,b]) => {
        if (a.isCoordinator && !b.isCoordinator) return -1;
        if (!a.isCoordinator && b.isCoordinator) return 1;
        return 0;
      });
      sortedCallers.forEach(([caller, s]) => {
        const posLabel = s.isCoordinator ? 'Coordinator' : (s.position || 'Calling Facilitator');
        const posBadge = s.isCoordinator
          ? `<span style="font-size:.68rem;padding:.1rem .35rem;border-radius:.2rem;background:rgba(201,168,76,.2);color:#8B6914;font-weight:600">${posLabel}</span>`
          : `<span style="font-size:.68rem;padding:.1rem .35rem;border-radius:.2rem;background:rgba(82,183,136,.15);color:var(--primary)">${posLabel}</span>`;
        bodyRows += `<tr style="font-size:.82rem">
          <td style="padding-left:1.4rem;color:var(--text-muted)">${caller}</td>
          <td>${posBadge}</td>
          <td style="text-align:center">${s.total}</td>
          <td style="text-align:center">${s.called}</td>
          <td style="text-align:center;color:#c62828">${s.notCalled}</td>
          <td style="text-align:center;color:var(--success);font-weight:600">${s.yes}</td>
          <td style="text-align:center;color:#0288d1">${s.online||0}</td>
          <td style="text-align:center;color:#f57f17">${s.festival||0}</td>
          <td style="text-align:center;color:var(--danger)">${s.notInterested||0}</td>
        </tr>`;
      });
    });

    el.innerHTML = `<div style="font-size:.84rem;margin-bottom:.6rem">
      <strong><i class="fas fa-phone-alt"></i> Calling Summary — ${weekLabel}</strong>
    </div>
    <div style="overflow-x:auto">
    <table class="calling-table" style="margin:0">
      <thead><tr>
        <th style="min-width:160px">Team / Calling By</th>
        <th style="min-width:110px">Position</th>
        <th style="text-align:center">Total</th>
        <th style="text-align:center">Called</th>
        <th style="text-align:center;color:#c62828">Not Called</th>
        <th style="text-align:center;color:var(--success)">Yes</th>
        <th style="text-align:center;color:#0288d1">Online</th>
        <th style="text-align:center;color:#f57f17">Festival</th>
        <th style="text-align:center;color:var(--danger)">Not Interested</th>
      </tr></thead>
      <tbody>
        ${bodyRows}
        <tr style="background:#1a5c3a;color:#fff;font-weight:700;font-size:.83rem">
          <td colspan="2">Grand Total</td>
          <td style="text-align:center">${gTotal}</td>
          <td style="text-align:center">${gCalled}</td>
          <td style="text-align:center">${gNC}</td>
          <td style="text-align:center">${gYes}</td>
          <td style="text-align:center">${gOnline}</td>
          <td style="text-align:center">${gFestival}</td>
          <td style="text-align:center">${gNI}</td>
        </tr>
      </tbody>
    </table></div>`;
  } catch (e) {
    console.error('_loadCallingSummary', e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load report</p></div>';
  }
}

async function _loadAccuracyReport(week, el) {
  try {
    const report = await DB.getCallingReport(week);
    const teams = Object.keys(report).filter(k => !k.startsWith('_'));
    if (!teams.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>No calling data for this week</p></div>';
      return;
    }
    const hasSession = report._hasSession;
    const weekLabel = formatDate(week);

    if (!hasSession) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-clock"></i><p>Class not yet held for ${weekLabel} — accuracy report available after attendance is marked</p></div>`;
      return;
    }

    let grandYes=0, grandAbsent=0;
    let bodyRows = '';

    teams.forEach(team => {
      const t = report[team];
      grandYes += t.yes; grandAbsent += t.yesNotCame;
      const teamAbsent = t.yesNotCame;
      const teamAbsentBtn = teamAbsent > 0
        ? `<button style="background:#fce4ec;color:#c62828;font-weight:700;border:none;cursor:pointer;padding:.1rem .6rem;border-radius:4px;font-size:.82rem"
             onclick='openAbsentModal("${week}",null,"${team.replace(/"/g,'&quot;')}")'>${teamAbsent}</button>`
        : `<span style="color:var(--text-muted)">0</span>`;

      bodyRows += `<tr style="background:var(--accent-light);font-weight:700;font-size:.83rem">
        <td>${teamBadge(team)}</td>
        <td style="text-align:center">${t.yes}</td>
        <td style="text-align:center;color:var(--success)">${t.yesAndCame}</td>
        <td style="text-align:center">${teamAbsentBtn}</td>
      </tr>`;

      Object.entries(t.callers).forEach(([caller, s]) => {
        const absentBtn = s.yesNotCame > 0
          ? `<button style="background:#fce4ec;color:#c62828;font-weight:700;border:none;cursor:pointer;padding:.1rem .6rem;border-radius:4px;font-size:.82rem"
               onclick='openAbsentModal("${week}","${caller.replace(/"/g,'&quot;')}","${team.replace(/"/g,'&quot;')}")'>${s.yesNotCame}</button>`
          : `<span style="color:var(--text-muted)">0</span>`;
        bodyRows += `<tr style="font-size:.82rem">
          <td style="padding-left:1.4rem;color:var(--text-muted)">${caller}</td>
          <td style="text-align:center">${s.yes}</td>
          <td style="text-align:center;color:var(--success)">${s.yesAndCame}</td>
          <td style="text-align:center">${absentBtn}</td>
        </tr>`;
      });
    });

    const grandAbsentBtn = grandAbsent > 0
      ? `<button style="background:#fce4ec;color:#c62828;font-weight:700;border:none;cursor:pointer;padding:.1rem .6rem;border-radius:4px;font-size:.82rem"
           onclick='openAbsentModal("${week}",null,null)'>${grandAbsent}</button>`
      : `<span>0</span>`;

    el.innerHTML = `<div style="font-size:.84rem;margin-bottom:.6rem">
      <strong><i class="fas fa-user-times"></i> Said Coming But Absent — ${weekLabel}</strong>
      <span style="margin-left:.75rem;font-size:.8rem;color:var(--text-muted)">Click a number to see the list</span>
    </div>
    <div style="overflow-x:auto">
    <table class="calling-table" style="margin:0">
      <thead><tr>
        <th style="min-width:160px">Team / Calling By</th>
        <th style="text-align:center;color:var(--success)">Said Yes</th>
        <th style="text-align:center;color:var(--success)">Came</th>
        <th style="text-align:center;color:#c62828">Absent</th>
      </tr></thead>
      <tbody>
        ${bodyRows}
        <tr style="background:#1a5c3a;color:#fff;font-weight:700;font-size:.83rem">
          <td>Grand Total</td>
          <td style="text-align:center">${grandYes}</td>
          <td style="text-align:center">${grandYes - grandAbsent}</td>
          <td style="text-align:center">${grandAbsentBtn}</td>
        </tr>
      </tbody>
    </table>
    </div>`;
  } catch (e) {
    console.error('_loadAccuracyReport', e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load report</p></div>';
  }
}

async function openAbsentModal(week, callingBy, team) {
  const modal = document.getElementById('absent-list-modal');
  const titleEl = document.getElementById('absent-list-title');
  const contentEl = document.getElementById('absent-list-content');
  modal.classList.remove('hidden');
  contentEl.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';

  let label = 'Said Coming — Didn\'t Attend';
  if (team && callingBy) label += ` · ${callingBy} (${team})`;
  else if (team) label += ` · ${team}`;
  titleEl.textContent = label + ` · ${formatDate(week)}`;

  try {
    const { hasSession, list } = await DB.getYesAbsentList(week);
    if (!hasSession) {
      contentEl.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Class not held yet for this week.</p>';
      return;
    }
    let filtered = list;
    if (team) filtered = filtered.filter(d => d.teamName === team);
    if (callingBy) filtered = filtered.filter(d => d.callingBy === callingBy);
    if (!filtered.length) {
      contentEl.innerHTML = '<p style="text-align:center;color:var(--success)"><i class="fas fa-check-circle"></i> Everyone came!</p>';
      return;
    }
    contentEl.innerHTML = `<table class="calling-table" style="margin:0">
      <thead><tr>
        <th>#</th><th>Name</th><th>Team</th><th>Calling By</th><th>Mobile</th>
      </tr></thead>
      <tbody>${filtered.map((d,i) => `<tr>
        <td style="text-align:center;color:var(--text-muted)">${i+1}</td>
        <td style="font-weight:500">${d.name}</td>
        <td>${teamBadge(d.teamName)}</td>
        <td style="font-size:.82rem;color:var(--text-muted)">${d.callingBy||'—'}</td>
        <td style="font-size:.82rem">${d.mobile||'—'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch (e) {
    contentEl.innerHTML = '<p style="color:var(--danger)">Failed to load list.</p>';
  }
}

async function downloadCurrentReportExcel() {
  const week = document.getElementById('calling-report-week')?.value;
  if (!week) { showToast('Select a week first', 'error'); return; }
  if (_reportType === 'summary') return _downloadSummaryExcel([week], `Calling_Summary_${week}.xlsx`);
  return _downloadAccuracyExcel([week], `Accuracy_Report_${week}.xlsx`);
}

async function downloadCompleteReportExcel() {
  showToast('Preparing complete FY report…');
  const now = new Date();
  const fyStartYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = `${fyStartYear}-04-01`;
  const today = getToday();
  const csSnap = await fdb.collection('callingStatus').where('weekDate','>=',fyStart).where('weekDate','<=',today).get();
  const weeks = [...new Set(csSnap.docs.map(d => d.data().weekDate))].sort();
  if (!weeks.length) { showToast('No data found for this FY'); return; }
  const fname = `FY_${fyStartYear}-${String(fyStartYear+1).slice(-2)}_${_reportType === 'summary' ? 'Calling_Summary' : 'Accuracy_Report'}.xlsx`;
  if (_reportType === 'summary') return _downloadSummaryExcel(weeks, fname);
  return _downloadAccuracyExcel(weeks, fname);
}

async function _downloadSummaryExcel(weeks, filename) {
  showToast('Building Excel…');
  const XS = _xls();
  const wb = XLSX.utils.book_new();

  for (const week of weeks) {
    const report = await DB.getCallingReport(week);
    const teams = Object.keys(report).filter(k => !k.startsWith('_'));
    const sheetName = week.slice(5).replace('-','.');
    const HDR_S = XS.hdr('1A5C3A','FFFFFF');
    const SUB_S = XS.hdr('C8E6C9','1B5E20');
    const GRD_S = XS.hdr('0D3B22','FFFFFF');
    const headers = ['Team / Calling By','Total','Called','Not Called','Yes','Online','Festival','Not Interested'];
    const colW = [{wch:24},{wch:8},{wch:8},{wch:10},{wch:8},{wch:9},{wch:10},{wch:14}];
    const rows = [headers.map(h => ({ v:h, s:HDR_S }))];

    let gT=0,gCalled=0,gNC=0,gY=0,gOn=0,gFest=0,gNI=0;
    teams.forEach(team => {
      const t = report[team];
      gT+=t.total; gCalled+=t.called; gNC+=t.notCalled; gY+=t.yes;
      gOn+=(t.online||0); gFest+=(t.festival||0); gNI+=(t.notInterested||0);
      rows.push([team,t.total,t.called,t.notCalled,t.yes,t.online||0,t.festival||0,t.notInterested||0].map((v,i) => ({ v, s: i===0 ? SUB_S : XS.hdr('E8F5E9','1B5E20') })));
      Object.entries(t.callers).forEach(([caller, s]) => {
        rows.push([caller,s.total,s.called,s.notCalled,s.yes,s.online||0,s.festival||0,s.notInterested||0].map(v => ({ v, s:XS.cell() })));
      });
    });
    rows.push(['Grand Total',gT,gCalled,gNC,gY,gOn,gFest,gNI].map(v => ({ v, s:GRD_S })));

    const ws = _xlsSheet(rows, colW);
    ws['!freeze'] = { xSplit:0, ySplit:1, topLeftCell:'A2' };
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  XLSX.writeFile(wb, filename);
  showToast('Downloaded: ' + filename);
}

async function _downloadAccuracyExcel(weeks, filename) {
  showToast('Building Excel…');
  const XS = _xls();
  const wb = XLSX.utils.book_new();

  for (const week of weeks) {
    const report = await DB.getCallingReport(week);
    const teams = Object.keys(report).filter(k => !k.startsWith('_'));
    if (!report._hasSession) continue;
    const sheetName = week.slice(5).replace('-','.');
    const HDR_S = XS.hdr('1A5C3A','FFFFFF');
    const SUB_S = XS.hdr('FFCDD2','B71C1C');
    const GRD_S = XS.hdr('0D3B22','FFFFFF');
    const headers = ['Team / Calling By','Said Yes','Came','Absent'];
    const colW = [{wch:24},{wch:10},{wch:10},{wch:10}];
    const rows = [headers.map(h => ({ v:h, s:HDR_S }))];

    let gY=0, gAbsent=0;
    teams.forEach(team => {
      const t = report[team];
      gY += t.yes; gAbsent += t.yesNotCame;
      rows.push([team,t.yes,t.yesAndCame,t.yesNotCame].map((v,i) => ({ v, s: i===0 ? SUB_S : XS.hdr('FFCDD2','B71C1C') })));
      Object.entries(t.callers).forEach(([caller, s]) => {
        rows.push([caller,s.yes,s.yesAndCame,s.yesNotCame].map(v => ({ v, s:XS.cell() })));
      });
    });
    rows.push(['Grand Total',gY,gY-gAbsent,gAbsent].map(v => ({ v, s:GRD_S })));

    const ws = _xlsSheet(rows, colW);
    ws['!freeze'] = { xSplit:0, ySplit:1, topLeftCell:'A2' };
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  XLSX.writeFile(wb, filename);
  showToast('Downloaded: ' + filename);
}

const _lateRemarksTimers = {};
async function loadLateReports() {
  const el = document.getElementById('calling-late-content');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';
  try {
    const { fourWeeks, submMap, teamRows } = await DB.getSubmissionReport();

    // Scope to 4 calling weeks up to the selected session's date (main filter)
    const refDate = (typeof _reportActive !== 'undefined' && _reportActive?.session_date)
      ? _reportActive.session_date
      : getToday();
    const weeks = fourWeeks.filter(w => w <= refDate).slice(-4);

    if (!weeks.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No submissions yet</p></div>';
      return;
    }

    // Flatten coordinators into one list, annotate lateness per week
    const rows = [];
    teamRows.forEach(({ team, admin, coordinators }) => {
      const names = [admin, ...coordinators.filter(c => c !== admin)].filter(Boolean);
      names.forEach(name => {
        const cells = weeks.map(w => {
          const sub = submMap[w]?.[name];
          if (!sub?.initial) return { text: '—', late: null, state: 'none' };
          const t = new Date(sub.initial);
          const time = t.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
          const isLate = t.getHours() >= 21;
          return { text: time, late: isLate, state: isLate ? 'late' : 'ok' };
        });
        const lateCount = cells.filter(c => c.late === true).length;
        // Most-recent-late index (weeks are oldest → newest; higher = newer)
        let recentLateIdx = -1;
        cells.forEach((c, i) => { if (c.late) recentLateIdx = Math.max(recentLateIdx, i); });
        rows.push({ name, team, isAdmin: name === admin, cells, lateCount, recentLateIdx });
      });
    });

    // Sort: most late weeks first; tie → most recent lateness first; tie → name
    rows.sort((a, b) => {
      if (b.lateCount !== a.lateCount)          return b.lateCount - a.lateCount;
      if (b.recentLateIdx !== a.recentLateIdx)  return b.recentLateIdx - a.recentLateIdx;
      return a.name.localeCompare(b.name);
    });

    const weekHeaders = weeks.map(w => {
      const dt = new Date(w + 'T00:00:00');
      return `<th class="sr-wk-hdr">
        ${dt.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
        <br><span style="font-size:.7rem;font-weight:400;opacity:.8">${dt.toLocaleDateString('en-IN',{weekday:'short'})}</span>
      </th>`;
    }).join('');

    const body = rows.map((r, i) => {
      const rowCls = r.lateCount >= 4 ? 'sr-row-l4'
                  : r.lateCount === 3 ? 'sr-row-l3'
                  : r.lateCount === 2 ? 'sr-row-l2'
                  : r.lateCount === 1 ? 'sr-row-l1' : '';
      const badge = r.isAdmin
        ? `<span class="badge-tc" style="margin-left:.3rem;font-size:.66rem"><i class="fas fa-crown"></i> TC</span>` : '';
      return `<tr class="${rowCls}">
        <td style="text-align:center;color:var(--text-muted);font-size:.78rem">${i + 1}</td>
        <td style="font-weight:600">${r.name}${badge}</td>
        <td>${teamBadge(r.team)}</td>
        ${r.cells.map(c => {
          if (c.state === 'none') return `<td class="sr-cell sr-empty">—</td>`;
          if (c.state === 'late') return `<td class="sr-cell sr-late"><i class="fas fa-exclamation-circle"></i> ${c.text}</td>`;
          return `<td class="sr-cell sr-ok"><i class="fas fa-check-circle"></i> ${c.text}</td>`;
        }).join('')}
        <td style="text-align:center;font-weight:700;color:${r.lateCount>0 ? 'var(--danger)' : 'var(--text-muted)'}">${r.lateCount}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="sr-legend" style="margin-bottom:.6rem">
        <span class="sr-leg-ok"><i class="fas fa-check-circle"></i> On time</span>
        <span class="sr-leg-late"><i class="fas fa-exclamation-circle"></i> After 9 PM</span>
        <span style="color:var(--text-muted);font-size:.78rem"><i class="fas fa-sort-amount-down"></i> Sorted: most late first</span>
      </div>
      <div style="overflow-x:auto">
        <table class="calling-table sr-table" style="margin:0;min-width:640px">
          <thead><tr>
            <th style="min-width:36px">#</th>
            <th style="min-width:160px">Name</th>
            <th style="min-width:110px">Team</th>
            ${weekHeaders}
            <th style="min-width:60px;text-align:center">Late</th>
          </tr></thead>
          <tbody>${body || '<tr><td colspan="99" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No data</td></tr>'}</tbody>
        </table>
      </div>`;
  } catch (e) {
    console.error(e);
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>';
  }
}

function saveLateRemark(statusId, remarks) {
  clearTimeout(_lateRemarksTimers[statusId]);
  _lateRemarksTimers[statusId] = setTimeout(async () => {
    try { await DB.saveCallingRemarks(statusId, remarks); } catch (_) {}
  }, 800);
}
