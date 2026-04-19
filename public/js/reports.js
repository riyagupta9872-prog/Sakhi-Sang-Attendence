/* ══ REPORTS.JS – Tab 4 ══ */

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

// ── A: ATTENDANCE DETAIL ──────────────
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

// ── B: SERIOUS ANALYSIS ───────────────
async function loadSeriousAnalysis() {
  const c = document.getElementById('serious-analysis-content');
  c.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';
  try {
    const week = getWeekDate();
    const data = await DB.getSeriousReport(week, AppState.currentSessionId);
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

// ── C: TEAM LEADERBOARD ───────────────
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

// ── D: TRENDS ─────────────────────────
async function loadTrends() {
  try {
    const period = document.getElementById('trend-period').value;
    const team   = document.getElementById('trend-team').value;
    const data   = await DB.getTrends(period, team);
    renderTrendsChart(data, period);
  } catch (e) { console.error('Trends', e); }
}

function renderTrendsChart(data, period) {
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
    data: {
      labels,
      datasets: [{ label: 'Devotees Present', data: data.map(d => d.count), borderColor: '#2d7a52', backgroundColor: 'rgba(82,183,136,0.15)', borderWidth: 2.5, pointBackgroundColor: '#2d7a52', pointRadius: 5, fill: true, tension: 0.4 }]
    },
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
}
