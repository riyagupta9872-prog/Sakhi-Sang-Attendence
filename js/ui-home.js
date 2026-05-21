/* ══ UI-HOME.JS – Home tab ══ */

// ── HOME INIT ─────────────────────────────────────────
function loadHome() {
  const greet = document.getElementById('home-greeting');
  if (greet) greet.textContent = `Hare Krishna, ${(AppState.userName || '').split(' ')[0] || 'Devotee'}!`;
}

// ── ATTENDANCE SESSION REPORT ─────────────────────────
async function openAttendanceReport() {
  openModal('home-att-report-modal');
  await loadAttendanceReport();
}

async function loadAttendanceReport() {
  const body        = document.getElementById('att-report-body');
  const label       = document.getElementById('att-report-session-label');
  const sessionId   = AppState.currentSessionId;
  const sessionDate = getFilterSessionId();

  if (!sessionId || !sessionDate) {
    body.innerHTML = '<tr><td colspan="6" class="empty-cell">No session selected. Use the Session filter to pick one.</td></tr>';
    if (label) label.textContent = '—';
    return;
  }
  body.innerHTML = '<tr><td colspan="6" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
  if (label) label.textContent = formatDate(sessionDate);

  // Derive calling week date: prefer config match, else session-date minus 1 day.
  let callingDate = '';
  try {
    const cfg = await DB.getCallingWeekConfig();
    if (cfg?.sessionDate === sessionDate && cfg?.callingDate) {
      callingDate = cfg.callingDate;
    } else {
      const d = new Date(sessionDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      callingDate = localDateStr(d);
    }
  } catch (_) {
    const d = new Date(sessionDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    callingDate = localDateStr(d);
  }

  try {
    const rows = await DB.getAttendanceSessionReport(sessionId, callingDate);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty-cell">No data found for this session.</td></tr>';
      return;
    }
    const tot = rows.reduce((a, r) => ({
      total: a.total + r.total, called: a.called + r.called,
      saidComing: a.saidComing + r.saidComing,
      actuallyCame: a.actuallyCame + r.actuallyCame,
      saidComingNotCame: a.saidComingNotCame + r.saidComingNotCame,
    }), { total: 0, called: 0, saidComing: 0, actuallyCame: 0, saidComingNotCame: 0 });

    body.innerHTML = rows.map(r => `
      <tr>
        <td><span class="team-badge-sm">${r.team}</span></td>
        <td class="num-cell">${r.total}</td>
        <td class="num-cell">${r.called}</td>
        <td class="num-cell coming-cell">${r.saidComing}</td>
        <td class="num-cell came-cell">${r.actuallyCame}</td>
        <td class="num-cell notcame-cell">${r.saidComingNotCame}</td>
      </tr>`).join('') + `
      <tr class="totals-row">
        <td><strong>TOTAL</strong></td>
        <td class="num-cell"><strong>${tot.total}</strong></td>
        <td class="num-cell"><strong>${tot.called}</strong></td>
        <td class="num-cell coming-cell"><strong>${tot.saidComing}</strong></td>
        <td class="num-cell came-cell"><strong>${tot.actuallyCame}</strong></td>
        <td class="num-cell notcame-cell"><strong>${tot.saidComingNotCame}</strong></td>
      </tr>`;
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="empty-cell">Error: ${e.message}</td></tr>`;
  }
}

// ── CALLING REPORT → Calling tab → Reports sub-tab ────
function openCallingReport() {
  switchTab('calling', document.querySelector('[data-tab="calling"]'));
  setTimeout(() => {
    const reportsBtn = document.querySelector('#tab-calling .att-sub-tab:nth-child(2)');
    if (reportsBtn && typeof switchCallingSubTab === 'function') switchCallingSubTab(reportsBtn, 'reports');
  }, 100);
}
