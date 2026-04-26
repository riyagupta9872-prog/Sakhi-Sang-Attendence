/* ══ UI-HOME.JS – Home drawers: Attendance Report, Book Dist, Donation, Registration, Service ══ */

// ── HOME INIT ─────────────────────────────────────────
function loadHome() {
  const greet = document.getElementById('home-greeting');
  if (greet) greet.textContent = `Hare Krishna, ${(AppState.userName || '').split(' ')[0] || 'Devotee'}!`;
}

// ── DEVOTEE PICKER (shared by Book Dist, Registration, Service) ──────
// Call initHomeDevoteePickers() once at app startup. Each open* function
// calls clearHomeDevoteePicker(prefix) to reset state before opening.

function initHomeDevoteePickers() {
  ['bd', 'reg', 'srv'].forEach(prefix => _initDevoteePicker(prefix));
}

function _initDevoteePicker(prefix) {
  const searchEl = document.getElementById(prefix + '-devotee-search');
  const dropdown = document.getElementById(prefix + '-picker-dropdown');
  if (!searchEl || !dropdown) return;

  searchEl.addEventListener('input', debounce(async () => {
    const q = searchEl.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }
    dropdown.innerHTML = '<div class="home-picker-no-result"><i class="fas fa-spinner fa-spin"></i></div>';
    dropdown.classList.remove('hidden');
    try {
      const all = await DevoteeCache.all();
      const matches = all.filter(d =>
        (d.name || '').toLowerCase().includes(q) || (d.mobile || '').includes(q)
      ).slice(0, 8);
      if (!matches.length) {
        dropdown.innerHTML = '<div class="home-picker-no-result">No devotee found</div>';
        return;
      }
      dropdown.innerHTML = matches.map(d => {
        const meta = [d.mobile, d.teamName, d.callingBy ? 'by ' + d.callingBy : ''].filter(Boolean).join(' · ');
        return `<div class="home-picker-option" onclick="_selectHomeDevotee('${prefix}','${d.id}')">
          <div class="home-picker-option-name">${d.name || ''}</div>
          ${meta ? `<div class="home-picker-option-meta">${meta}</div>` : ''}
        </div>`;
      }).join('');
    } catch (_) {
      dropdown.innerHTML = '<div class="home-picker-no-result">Error loading devotees</div>';
    }
  }, 200));

  document.addEventListener('click', e => {
    if (!e.target.closest('#' + prefix + '-picker')) dropdown.classList.add('hidden');
  });
}

function _selectHomeDevotee(prefix, devoteeId) {
  DevoteeCache.all().then(all => {
    const d = all.find(x => x.id === devoteeId);
    if (!d) return;
    const idEl       = document.getElementById(prefix + '-devotee-id');
    const nameEl     = document.getElementById(prefix + '-devotee-name');
    const searchEl   = document.getElementById(prefix + '-devotee-search');
    const dropdown   = document.getElementById(prefix + '-picker-dropdown');
    const selectedEl = document.getElementById(prefix + '-picker-selected');
    const displayEl  = document.getElementById(prefix + '-devotee-display');
    const teamEl     = document.getElementById(prefix + '-team');

    if (idEl)     idEl.value = d.id;
    if (nameEl)   nameEl.value = d.name || '';
    if (dropdown) dropdown.classList.add('hidden');
    if (searchEl) searchEl.style.display = 'none';

    const meta = [d.mobile, d.teamName, d.callingBy ? 'by ' + d.callingBy : ''].filter(Boolean).join(' · ');
    if (selectedEl) selectedEl.classList.remove('hidden');
    if (displayEl) displayEl.innerHTML =
      `<strong>${d.name || ''}</strong>${meta ? ` <span style="font-weight:400;color:var(--text-muted)">· ${meta}</span>` : ''}`;

    if (teamEl && d.teamName) {
      // try to set the select to the devotee's team
      if (Array.from(teamEl.options).some(o => o.value === d.teamName)) teamEl.value = d.teamName;
    }
  }).catch(() => {});
}

function clearHomeDevoteePicker(prefix) {
  const idEl       = document.getElementById(prefix + '-devotee-id');
  const nameEl     = document.getElementById(prefix + '-devotee-name');
  const searchEl   = document.getElementById(prefix + '-devotee-search');
  const selectedEl = document.getElementById(prefix + '-picker-selected');
  const dropdown   = document.getElementById(prefix + '-picker-dropdown');
  if (idEl)       idEl.value = '';
  if (nameEl)     nameEl.value = '';
  if (searchEl)   { searchEl.value = ''; searchEl.style.display = ''; }
  if (selectedEl) selectedEl.classList.add('hidden');
  if (dropdown)   { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; }
}

// ── TEAM OPTIONS HELPER ───────────────────────────────
function _homeTeamOptions(selected) {
  const locked = AppState.userRole !== 'superAdmin' && AppState.userTeam;
  if (locked) return `<option value="${AppState.userTeam}">${AppState.userTeam}</option>`;
  return `<option value="">— Select Team —</option>` +
    TEAMS.map(t => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join('');
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

// ── CALLING REPORT → existing Reports tab ────────────
function openCallingReport() {
  switchTab('reports', document.querySelector('[data-tab="reports"]'));
  setTimeout(() => {
    const callingBtn = document.querySelectorAll('#tab-reports .att-sub-tab')[1];
    if (callingBtn && typeof switchReportsCategory === 'function') switchReportsCategory('calling', callingBtn);
  }, 150);
}

// ── BOOK DISTRIBUTION ─────────────────────────────────
function openBookDistAdd() {
  clearHomeDevoteePicker('bd');
  document.getElementById('bd-team').innerHTML    = _homeTeamOptions(AppState.userTeam || '');
  document.getElementById('bd-date').value        = getToday();
  document.getElementById('bd-quantity').value    = '';
  document.getElementById('bd-err').style.display = 'none';
  openModal('home-book-add-modal');
}

async function saveBookDistEntry() {
  const devoteeId   = document.getElementById('bd-devotee-id').value;
  const devoteeName = document.getElementById('bd-devotee-name').value.trim();
  const teamName    = document.getElementById('bd-team').value;
  const date        = document.getElementById('bd-date').value;
  const quantity    = parseInt(document.getElementById('bd-quantity').value) || 0;
  const errEl       = document.getElementById('bd-err');
  errEl.style.display = 'none';
  if (!devoteeName) { errEl.textContent = 'Please select a devotee.'; errEl.style.display = 'block'; return; }
  if (!date)        { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }
  if (quantity < 1) { errEl.textContent = 'Quantity must be at least 1.'; errEl.style.display = 'block'; return; }
  try {
    await DB.addBookDistribution({ devoteeId, devoteeName, teamName, date, quantity });
    closeModal('home-book-add-modal');
    showToast('Book distribution saved! Hare Krishna 🙏', 'success');
  } catch (e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function openBookDistReport() {
  const today = getToday();
  document.getElementById('bd-rep-from').value = today.slice(0, 7) + '-01';
  document.getElementById('bd-rep-to').value   = today;
  openModal('home-book-report-modal');
  await loadBookDistReport();
}

async function loadBookDistReport() {
  const from = document.getElementById('bd-rep-from').value;
  const to   = document.getElementById('bd-rep-to').value;
  const body = document.getElementById('bd-report-body');
  body.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const entries = await DB.getBookDistributions({ startDate: from || undefined, endDate: to || undefined });
    if (!entries.length) {
      body.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><p>No entries for this period.</p></div>';
      return;
    }
    const teamMap = {};
    entries.forEach(e => {
      const t = e.teamName || 'Other';
      if (!teamMap[t]) teamMap[t] = { total: 0, entries: [] };
      teamMap[t].total += e.quantity;
      teamMap[t].entries.push(e);
    });
    const teams = Object.keys(teamMap).sort();
    const grand = teams.reduce((s, t) => s + teamMap[t].total, 0);
    body.innerHTML = `<table class="report-table">
      <thead><tr><th>Team</th><th class="num-th">Books</th></tr></thead>
      <tbody>
        ${teams.map(t => `
          <tr class="team-row" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <td><span class="team-badge-sm">${t}</span> <i class="fas fa-chevron-down" style="font-size:.65rem;color:var(--text-muted)"></i></td>
            <td class="num-cell"><strong>${teamMap[t].total}</strong></td>
          </tr>
          <tr class="detail-rows hidden"><td colspan="2" style="padding:0">
            <table class="inner-table">
              <thead><tr><th>Devotee</th><th>Qty</th><th>Date</th></tr></thead>
              <tbody>${teamMap[t].entries.map(e => `<tr><td>${e.devoteeName}</td><td>${e.quantity}</td><td>${formatDate(e.date)}</td></tr>`).join('')}</tbody>
            </table>
          </td></tr>`).join('')}
        <tr class="totals-row"><td><strong>TOTAL</strong></td><td class="num-cell"><strong>${grand}</strong></td></tr>
      </tbody></table>`;
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

// ── DONATION ─────────────────────────────────────────
function openDonationAdd() {
  document.getElementById('don-date').value        = getToday();
  document.getElementById('don-team').innerHTML    = _homeTeamOptions(AppState.userTeam || '');
  document.getElementById('don-amount').value      = '';
  document.getElementById('don-note').value        = '';
  document.getElementById('don-err').style.display = 'none';
  openModal('home-donation-add-modal');
}

async function saveDonationEntry() {
  const teamName = document.getElementById('don-team').value;
  const amount   = parseFloat(document.getElementById('don-amount').value) || 0;
  const date     = document.getElementById('don-date').value;
  const note     = document.getElementById('don-note').value.trim();
  const errEl    = document.getElementById('don-err');
  errEl.style.display = 'none';
  if (!teamName)   { errEl.textContent = 'Team is required.'; errEl.style.display = 'block'; return; }
  if (!date)       { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }
  if (amount <= 0) { errEl.textContent = 'Amount must be greater than 0.'; errEl.style.display = 'block'; return; }
  try {
    await DB.addDonation({ teamName, amount, date, note });
    closeModal('home-donation-add-modal');
    showToast('Donation saved! Hare Krishna 🙏', 'success');
  } catch (e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function openDonationReport() {
  const today = getToday();
  document.getElementById('don-rep-from').value = today.slice(0, 7) + '-01';
  document.getElementById('don-rep-to').value   = today;
  openModal('home-donation-report-modal');
  await loadDonationReport();
}

async function loadDonationReport() {
  const from = document.getElementById('don-rep-from').value;
  const to   = document.getElementById('don-rep-to').value;
  const body = document.getElementById('don-report-body');
  body.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const entries = await DB.getDonations({ startDate: from || undefined, endDate: to || undefined });
    if (!entries.length) {
      body.innerHTML = '<div class="empty-state"><i class="fas fa-hand-holding-heart"></i><p>No entries for this period.</p></div>';
      return;
    }
    const teamMap = {};
    entries.forEach(e => { const t = e.teamName || 'Other'; teamMap[t] = (teamMap[t] || 0) + e.amount; });
    const teams = Object.keys(teamMap).sort();
    const grand = teams.reduce((s, t) => s + teamMap[t], 0);
    body.innerHTML = `<table class="report-table">
      <thead><tr><th>Team</th><th class="num-th">Amount (₹)</th></tr></thead>
      <tbody>
        ${teams.map(t => `<tr><td><span class="team-badge-sm">${t}</span></td><td class="num-cell">₹${teamMap[t].toLocaleString('en-IN')}</td></tr>`).join('')}
        <tr class="totals-row"><td><strong>TOTAL</strong></td><td class="num-cell"><strong>₹${grand.toLocaleString('en-IN')}</strong></td></tr>
      </tbody></table>`;
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

// ── REGISTRATION ─────────────────────────────────────
function openRegistrationAdd() {
  clearHomeDevoteePicker('reg');
  document.getElementById('reg-date').value        = getToday();
  document.getElementById('reg-team').innerHTML    = _homeTeamOptions(AppState.userTeam || '');
  document.getElementById('reg-count').value       = '';
  document.getElementById('reg-err').style.display = 'none';
  openModal('home-reg-add-modal');
}

async function saveRegistrationEntry() {
  const devoteeId   = document.getElementById('reg-devotee-id').value;
  const devoteeName = document.getElementById('reg-devotee-name').value.trim();
  const teamName    = document.getElementById('reg-team').value;
  const date        = document.getElementById('reg-date').value;
  const count       = parseInt(document.getElementById('reg-count').value) || 0;
  const errEl       = document.getElementById('reg-err');
  errEl.style.display = 'none';
  if (!devoteeName) { errEl.textContent = 'Please select a devotee.'; errEl.style.display = 'block'; return; }
  if (!date)        { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }
  if (count < 1)    { errEl.textContent = 'Count must be at least 1.'; errEl.style.display = 'block'; return; }
  try {
    await DB.addRegistration({ devoteeId, devoteeName, teamName, date, count });
    closeModal('home-reg-add-modal');
    showToast('Registration entry saved! Hare Krishna 🙏', 'success');
  } catch (e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function openRegistrationReport() {
  const today = getToday();
  document.getElementById('reg-rep-from').value = today.slice(0, 7) + '-01';
  document.getElementById('reg-rep-to').value   = today;
  openModal('home-reg-report-modal');
  await loadRegistrationReport();
}

async function loadRegistrationReport() {
  const from = document.getElementById('reg-rep-from').value;
  const to   = document.getElementById('reg-rep-to').value;
  const body = document.getElementById('reg-report-body');
  body.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const entries = await DB.getRegistrations({ startDate: from || undefined, endDate: to || undefined });
    if (!entries.length) {
      body.innerHTML = '<div class="empty-state"><i class="fas fa-id-card-alt"></i><p>No entries for this period.</p></div>';
      return;
    }
    const teamMap = {};
    entries.forEach(e => {
      const t = e.teamName || 'Other';
      if (!teamMap[t]) teamMap[t] = { total: 0, entries: [] };
      teamMap[t].total += e.count;
      teamMap[t].entries.push(e);
    });
    const teams = Object.keys(teamMap).sort();
    const grand = teams.reduce((s, t) => s + teamMap[t].total, 0);
    body.innerHTML = `<table class="report-table">
      <thead><tr><th>Team</th><th class="num-th">Registrations</th></tr></thead>
      <tbody>
        ${teams.map(t => `
          <tr class="team-row" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <td><span class="team-badge-sm">${t}</span> <i class="fas fa-chevron-down" style="font-size:.65rem;color:var(--text-muted)"></i></td>
            <td class="num-cell"><strong>${teamMap[t].total}</strong></td>
          </tr>
          <tr class="detail-rows hidden"><td colspan="2" style="padding:0">
            <table class="inner-table">
              <thead><tr><th>Devotee</th><th>Count</th><th>Date</th></tr></thead>
              <tbody>${teamMap[t].entries.map(e => `<tr><td>${e.devoteeName}</td><td>${e.count}</td><td>${formatDate(e.date)}</td></tr>`).join('')}</tbody>
            </table>
          </td></tr>`).join('')}
        <tr class="totals-row"><td><strong>TOTAL</strong></td><td class="num-cell"><strong>${grand}</strong></td></tr>
      </tbody></table>`;
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

// ── SERVICE ───────────────────────────────────────────
function openServiceAdd() {
  clearHomeDevoteePicker('srv');
  document.getElementById('srv-date').value         = getToday();
  document.getElementById('srv-team').innerHTML     = _homeTeamOptions(AppState.userTeam || '');
  document.getElementById('srv-description').value  = '';
  document.getElementById('srv-err').style.display  = 'none';
  openModal('home-service-add-modal');
}

async function saveServiceEntry() {
  const devoteeId          = document.getElementById('srv-devotee-id').value;
  const devoteeName        = document.getElementById('srv-devotee-name').value.trim();
  const teamName           = document.getElementById('srv-team').value;
  const date               = document.getElementById('srv-date').value;
  const serviceDescription = document.getElementById('srv-description').value.trim();
  const errEl              = document.getElementById('srv-err');
  errEl.style.display = 'none';
  if (!devoteeName)        { errEl.textContent = 'Please select a devotee.'; errEl.style.display = 'block'; return; }
  if (!date)               { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }
  if (!serviceDescription) { errEl.textContent = 'Service description is required.'; errEl.style.display = 'block'; return; }
  try {
    await DB.addService({ devoteeId, devoteeName, teamName, date, serviceDescription });
    closeModal('home-service-add-modal');
    showToast('Service logged! Hare Krishna 🙏', 'success');
  } catch (e) {
    errEl.textContent = 'Save failed: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function openServiceReport() {
  const today = getToday();
  document.getElementById('srv-rep-from').value = today.slice(0, 7) + '-01';
  document.getElementById('srv-rep-to').value   = today;
  openModal('home-service-report-modal');
  await loadServiceReport();
}

async function loadServiceReport() {
  const from = document.getElementById('srv-rep-from').value;
  const to   = document.getElementById('srv-rep-to').value;
  const body = document.getElementById('srv-report-body');
  body.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
  try {
    const entries = await DB.getServices({ startDate: from || undefined, endDate: to || undefined });
    if (!entries.length) {
      body.innerHTML = '<div class="empty-state"><i class="fas fa-hands-helping"></i><p>No entries for this period.</p></div>';
      return;
    }
    const teamMap = {};
    entries.forEach(e => {
      const t = e.teamName || 'Other';
      if (!teamMap[t]) teamMap[t] = { total: 0, entries: [] };
      teamMap[t].total++;
      teamMap[t].entries.push(e);
    });
    const teams = Object.keys(teamMap).sort();
    const grand = teams.reduce((s, t) => s + teamMap[t].total, 0);
    body.innerHTML = `<table class="report-table">
      <thead><tr><th>Team</th><th class="num-th">Services</th></tr></thead>
      <tbody>
        ${teams.map(t => `
          <tr class="team-row" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <td><span class="team-badge-sm">${t}</span> <i class="fas fa-chevron-down" style="font-size:.65rem;color:var(--text-muted)"></i></td>
            <td class="num-cell"><strong>${teamMap[t].total}</strong></td>
          </tr>
          <tr class="detail-rows hidden"><td colspan="2" style="padding:0">
            <table class="inner-table">
              <thead><tr><th>Devotee</th><th>Service Done</th><th>Date</th></tr></thead>
              <tbody>${teamMap[t].entries.map(e =>
                `<tr><td>${e.devoteeName}</td><td style="white-space:pre-wrap;word-break:break-word;max-width:200px">${e.serviceDescription || ''}</td><td>${formatDate(e.date)}</td></tr>`
              ).join('')}</tbody>
            </table>
          </td></tr>`).join('')}
        <tr class="totals-row"><td><strong>TOTAL</strong></td><td class="num-cell"><strong>${grand}</strong></td></tr>
      </tbody></table>`;
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}
