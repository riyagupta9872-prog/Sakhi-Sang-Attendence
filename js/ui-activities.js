/* ══ UI-ACTIVITIES.JS – Books / Service / Registration / Donation tabs ══
   Each tab follows the same shape: [Log Entry] | [Reports] sub-tabs.
   Driven by ACTIVITY_CONFIG so adding a new activity later is a one-block edit.
*/

// One config per activity. Each entry describes:
//  - title/icon shown in the header
//  - prefix used for all DOM ids inside the tab (so multiple activities can
//    coexist without colliding)
//  - addFn / getFn names on DB
//  - whether a Devotee picker is required
//  - the activity-specific input field(s) — { id, label, type, payload, … }
//  - sumKey/sumLabel/sumPrefix for the report summary card
//  - cols for the recent-entries + report tables
const ACTIVITY_CONFIG = {
  books: {
    title: 'Books', icon: 'fa-book-open', iconClass: 'book-icon', prefix: 'tact-bd',
    addFn: 'addBookDistribution', getFn: 'getBookDistributions',
    devoteeRequired: true,
    primaryField: { id: 'qty', label: 'Quantity', type: 'number', min: 1, payload: 'quantity', required: true },
    sumKey: 'quantity', sumLabel: 'Total Books', sumPrefix: '',
    cols: [
      { key: 'devoteeName',  label: 'Devotee' },
      { key: 'quantity',     label: 'Qty', align: 'center' },
      { key: 'date',         label: 'Date', format: 'date' },
    ],
  },
  service: {
    title: 'Service', icon: 'fa-hands-helping', iconClass: 'service-icon', prefix: 'tact-srv',
    addFn: 'addService', getFn: 'getServices',
    devoteeRequired: true,
    primaryField: { id: 'desc', label: 'Service Description', type: 'textarea', payload: 'serviceDescription', required: true, placeholder: 'e.g. Distributed prasadam at temple' },
    countAsOne: true, sumLabel: 'Total Services', sumPrefix: '',
    cols: [
      { key: 'devoteeName',         label: 'Devotee' },
      { key: 'serviceDescription',  label: 'Service' },
      { key: 'date',                label: 'Date', format: 'date' },
    ],
  },
  registration: {
    title: 'Registration', icon: 'fa-id-card-alt', iconClass: 'reg-icon', prefix: 'tact-reg',
    addFn: 'addRegistration', getFn: 'getRegistrations',
    devoteeRequired: true,
    primaryField: { id: 'count', label: 'Count', type: 'number', min: 1, payload: 'count', required: true },
    sumKey: 'count', sumLabel: 'Total Registrations', sumPrefix: '',
    cols: [
      { key: 'devoteeName',  label: 'Devotee' },
      { key: 'count',        label: 'Count', align: 'center' },
      { key: 'date',         label: 'Date', format: 'date' },
    ],
  },
  donation: {
    title: 'Donation', icon: 'fa-hand-holding-heart', iconClass: 'donation-icon', prefix: 'tact-don',
    addFn: 'addDonation', getFn: 'getDonations',
    devoteeRequired: false,
    primaryField: { id: 'amt', label: 'Amount (₹)', type: 'number', min: 1, payload: 'amount', required: true },
    extraField:   { id: 'note', label: 'Note (optional)', type: 'text', payload: 'note', required: false },
    sumKey: 'amount', sumLabel: 'Total Donation', sumPrefix: '₹',
    cols: [
      { key: 'date',    label: 'Date', format: 'date' },
      { key: 'amount',  label: 'Amount (₹)', format: 'rupees', align: 'right' },
      { key: 'note',    label: 'Note' },
    ],
  },
};

// ── Tab entry point ─────────────────────────────────────
async function loadActivityTab(key) {
  _actBuildLayout(key);
  AppState._actSubTab = AppState._actSubTab || {};
  const sub = AppState._actSubTab[key] || 'log';
  _actShowSub(key, sub);
}

function _actBuildLayout(key) {
  const cfg = ACTIVITY_CONFIG[key];
  const panel = document.getElementById('tab-' + key);
  if (!panel || panel.dataset.built === 'true') return;
  panel.innerHTML = `
    <div class="panel-header">
      <h2><i class="fas ${cfg.icon}"></i> ${cfg.title}</h2>
    </div>
    <div class="att-sub-tabs">
      <button class="att-sub-tab active" onclick="switchActivitySubTab('${key}','log',this)">
        <i class="fas fa-pen"></i> Log Entry
      </button>
      <button class="att-sub-tab" onclick="switchActivitySubTab('${key}','reports',this)">
        <i class="fas fa-chart-bar"></i> Reports
      </button>
    </div>
    <div id="act-${key}-log"     class="att-sub-panel active"></div>
    <div id="act-${key}-reports" class="att-sub-panel"></div>
  `;
  panel.dataset.built = 'true';
}

function switchActivitySubTab(key, sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.att-sub-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  AppState._actSubTab = AppState._actSubTab || {};
  AppState._actSubTab[key] = sub;
  _actShowSub(key, sub);
}

function _actShowSub(key, sub) {
  document.getElementById('act-' + key + '-log').classList.toggle('active',     sub === 'log');
  document.getElementById('act-' + key + '-reports').classList.toggle('active', sub === 'reports');
  if (sub === 'log')     _actRenderLog(key);
  if (sub === 'reports') _actRenderReports(key);
}

// ── LOG ENTRY view ──────────────────────────────────────
function _actRenderLog(key) {
  const cfg = ACTIVITY_CONFIG[key];
  const wrap = document.getElementById('act-' + key + '-log');
  const today = getToday();
  const team  = AppState.userTeam || (AppState.filters?.team || '');
  const p = cfg.prefix;

  wrap.innerHTML = `
    <div class="act-form-card">
      ${cfg.devoteeRequired ? `
        <div class="form-group">
          <label>Devotee <span class="req">*</span></label>
          <div class="home-picker" id="${p}-picker">
            <input type="search" id="${p}-devotee-search" placeholder="Type name to search…" autocomplete="new-password" name="dev-search-${p}" data-lpignore="true" data-1p-ignore>
            <div class="home-picker-dropdown hidden" id="${p}-picker-dropdown"></div>
            <input type="hidden" id="${p}-devotee-id">
            <input type="hidden" id="${p}-devotee-name">
            <div class="home-picker-selected hidden" id="${p}-picker-selected">
              <span id="${p}-devotee-display"></span>
              <button type="button" class="home-picker-clear" onclick="clearActPicker('${key}')"><i class="fas fa-times"></i></button>
            </div>
          </div>
        </div>` : ''}
      <div class="form-grid-2">
        <div class="form-group">
          <label>Team <span class="req">*</span></label>
          <select id="${p}-team">${_actTeamOptions(team)}</select>
        </div>
        <div class="form-group">
          <label>Date <span class="req">*</span></label>
          <input type="date" id="${p}-date" value="${today}">
        </div>
      </div>
      ${_actFieldHTML(cfg.primaryField, p)}
      ${cfg.extraField ? _actFieldHTML(cfg.extraField, p) : ''}
      <div class="act-form-err" id="${p}-err" style="display:none"></div>
      <button class="btn btn-primary act-save-btn" onclick="saveActivityEntry('${key}')">
        <i class="fas fa-check"></i> Save Entry
      </button>
    </div>

    <div class="act-recent-head">
      <i class="fas fa-history"></i> Recent entries
    </div>
    <div id="act-${key}-recent" class="act-recent-list">
      <div class="loading"><i class="fas fa-spinner"></i> Loading…</div>
    </div>
  `;

  if (cfg.devoteeRequired) _initActDevoteePicker(key);
  _actLoadRecent(key);
}

function _actFieldHTML(f, prefix) {
  if (!f) return '';
  const id = `${prefix}-${f.id}`;
  if (f.type === 'textarea') {
    return `<div class="form-group">
      <label>${f.label}${f.required ? ' <span class="req">*</span>' : ''}</label>
      <textarea id="${id}" rows="3" placeholder="${f.placeholder || ''}"></textarea>
    </div>`;
  }
  return `<div class="form-group">
    <label>${f.label}${f.required ? ' <span class="req">*</span>' : ''}</label>
    <input type="${f.type}" id="${id}" ${f.min != null ? `min="${f.min}"` : ''} placeholder="${f.placeholder || ''}">
  </div>`;
}

function _actTeamOptions(selected) {
  return TEAMS.map(t => `<option ${t === selected ? 'selected' : ''}>${t}</option>`).join('');
}

// Devotee picker — same pattern as ui-home.js but scoped per activity tab.
function _initActDevoteePicker(key) {
  const cfg = ACTIVITY_CONFIG[key];
  const p   = cfg.prefix;
  const searchEl = document.getElementById(p + '-devotee-search');
  const dropdown = document.getElementById(p + '-picker-dropdown');
  if (!searchEl || !dropdown) return;
  if (searchEl.dataset.pickerInit === 'true') return;
  searchEl.dataset.pickerInit = 'true';

  searchEl.addEventListener('input', debounce(async () => {
    const q = searchEl.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }
    dropdown.innerHTML = '<div class="home-picker-no-result"><i class="fas fa-spinner fa-spin"></i></div>';
    dropdown.classList.remove('hidden');
    try {
      const all = await DevoteeCache.all();
      const matches = all.filter(d =>
        (d.name || '').toLowerCase().includes(q) || (d.mobile || '').includes(q)
      ).slice(0, 20);
      if (!matches.length) {
        dropdown.innerHTML = '<div class="home-picker-no-result">No devotees found.</div>';
        return;
      }
      dropdown.innerHTML = matches.map(d => `
        <div class="home-picker-option" onclick="_selectActDevotee('${key}','${d.id}','${(d.name||'').replace(/'/g,"\\'")}','${d.teamName||''}','${d.mobile||''}')">
          <div class="home-picker-option-name">${d.name || '—'}</div>
          <div class="home-picker-option-meta">${d.teamName || ''}${d.mobile ? ' · ' + d.mobile : ''}</div>
        </div>`).join('');
    } catch (_) {
      dropdown.innerHTML = '<div class="home-picker-no-result">Search failed.</div>';
    }
  }, 250));

  // Click outside to close dropdown
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#' + p + '-picker')) {
      dropdown.classList.add('hidden');
    }
  });
}

function _selectActDevotee(key, id, name, team, mobile) {
  const p = ACTIVITY_CONFIG[key].prefix;
  document.getElementById(p + '-devotee-id').value   = id;
  document.getElementById(p + '-devotee-name').value = name;
  document.getElementById(p + '-devotee-display').textContent = name + (team ? ` · ${team}` : '');
  document.getElementById(p + '-picker-selected').classList.remove('hidden');
  document.getElementById(p + '-devotee-search').value = '';
  document.getElementById(p + '-picker-dropdown').classList.add('hidden');
  // Auto-select team to match the picked devotee for convenience
  if (team) {
    const teamSel = document.getElementById(p + '-team');
    if (teamSel && [...teamSel.options].some(o => o.value === team)) teamSel.value = team;
  }
}

function clearActPicker(key) {
  const p = ACTIVITY_CONFIG[key].prefix;
  ['devotee-id','devotee-name'].forEach(s => { const el = document.getElementById(p + '-' + s); if (el) el.value = ''; });
  document.getElementById(p + '-devotee-display').textContent = '';
  document.getElementById(p + '-picker-selected').classList.add('hidden');
  const search = document.getElementById(p + '-devotee-search'); if (search) search.value = '';
}

// ── Save handler ────────────────────────────────────────
async function saveActivityEntry(key) {
  const cfg = ACTIVITY_CONFIG[key];
  const p   = cfg.prefix;
  const errEl = document.getElementById(p + '-err');
  errEl.style.display = 'none';

  const teamName = document.getElementById(p + '-team').value;
  const date     = document.getElementById(p + '-date').value;
  let devoteeId = '', devoteeName = '';
  if (cfg.devoteeRequired) {
    devoteeId   = document.getElementById(p + '-devotee-id').value;
    devoteeName = document.getElementById(p + '-devotee-name').value.trim();
    if (!devoteeName) return _actErr(errEl, 'Please select a devotee.');
  }
  if (!teamName) return _actErr(errEl, 'Team is required.');
  if (!date)     return _actErr(errEl, 'Date is required.');

  // Primary field
  const pf = cfg.primaryField;
  const pVal = document.getElementById(p + '-' + pf.id).value;
  let primaryValue = pf.type === 'number' ? (parseFloat(pVal) || 0) : (pVal || '').trim();
  if (pf.required) {
    if (pf.type === 'number' && primaryValue < (pf.min || 1)) return _actErr(errEl, `${pf.label} must be at least ${pf.min || 1}.`);
    if (pf.type !== 'number' && !primaryValue) return _actErr(errEl, `${pf.label} is required.`);
  }

  // Optional extra field (donation note)
  let extraPayload = {};
  if (cfg.extraField) {
    const v = document.getElementById(p + '-' + cfg.extraField.id).value.trim();
    extraPayload[cfg.extraField.payload] = v;
  }

  const payload = {
    teamName, date,
    [pf.payload]: primaryValue,
    ...extraPayload,
  };
  if (cfg.devoteeRequired) { payload.devoteeId = devoteeId; payload.devoteeName = devoteeName; }

  try {
    await DB[cfg.addFn](payload);
    showToast(`${cfg.title} entry saved! Hare Krishna 🙏`, 'success');
    // Reset form for the next entry — keep team/date so rapid entry feels natural.
    document.getElementById(p + '-' + pf.id).value = '';
    if (cfg.extraField) document.getElementById(p + '-' + cfg.extraField.id).value = '';
    if (cfg.devoteeRequired) clearActPicker(key);
    _actLoadRecent(key);
    // Re-fetch the Reports panel too if it's already been built once. Without
    // this the user could switch to Reports and (briefly) see stale numbers.
    _actLoadReport(key);
  } catch (e) {
    _actErr(errEl, 'Save failed: ' + (e.message || 'Check connection'));
  }
}
function _actErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }

// ── Recent entries (last 10) ────────────────────────────
async function _actLoadRecent(key) {
  const cfg  = ACTIVITY_CONFIG[key];
  const wrap = document.getElementById('act-' + key + '-recent');
  if (!wrap) return;
  try {
    // Pull last 14 days; show 10 most recent.
    const today = getToday();
    const start = (() => {
      const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 14);
      return d.toISOString().slice(0, 10);
    })();
    const all = await DB[cfg.getFn]({ startDate: start, endDate: today });
    const teamFilter = AppState.filters?.team || '';
    const list = (teamFilter ? all.filter(e => e.teamName === teamFilter) : all).slice(0, 10);
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-state-sm"><i class="fas fa-inbox"></i> No recent entries</div>';
      return;
    }
    wrap.innerHTML = `
      <table class="report-table">
        <thead><tr>${cfg.cols.map(c => `<th>${c.label}</th>`).join('')}<th>Team</th></tr></thead>
        <tbody>${list.map(e => `<tr>
          ${cfg.cols.map(c => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${_actFmt(e[c.key], c.format)}</td>`).join('')}
          <td><span class="team-badge-sm">${e.teamName || '—'}</span></td>
        </tr>`).join('')}</tbody>
      </table>`;
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state-sm">Error: ${e.message}</div>`;
  }
}

function _actFmt(v, fmt) {
  if (v == null || v === '') return '—';
  if (fmt === 'date')   return formatDate(v);
  if (fmt === 'rupees') return '₹' + Number(v).toLocaleString('en-IN');
  return String(v);
}

// ── REPORTS view ────────────────────────────────────────
function _actRenderReports(key) {
  const cfg  = ACTIVITY_CONFIG[key];
  const wrap = document.getElementById('act-' + key + '-reports');
  const today = getToday();
  // Default to a 30-day window ending today — much more inclusive than month-start,
  // so an entry just logged today or last week is always visible by default.
  const rangeStart = (() => {
    const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const p = cfg.prefix;
  wrap.innerHTML = `
    <div class="act-rpt-controls">
      <div class="form-group">
        <label>From</label>
        <input type="date" id="${p}-rep-from" value="${rangeStart}" onchange="_actLoadReport('${key}')">
      </div>
      <div class="form-group">
        <label>To</label>
        <input type="date" id="${p}-rep-to" value="${today}" onchange="_actLoadReport('${key}')">
      </div>
      <button class="btn btn-secondary act-rpt-refresh" onclick="_actLoadReport('${key}')" title="Refresh from server">
        <i class="fas fa-sync-alt"></i>
      </button>
      <button class="btn btn-secondary act-rpt-export" onclick="_actExportExcel('${key}')">
        <i class="fas fa-file-excel"></i> Excel
      </button>
    </div>
    <div id="${p}-rep-filter-note" class="act-rpt-filter-note" style="display:none"></div>
    <div id="${p}-rep-summary" class="act-rpt-summary"></div>
    <div id="${p}-rep-body"    class="act-rpt-body">
      <div class="loading"><i class="fas fa-spinner"></i> Loading…</div>
    </div>`;
  _actLoadReport(key);
}

async function _actLoadReport(key) {
  const cfg = ACTIVITY_CONFIG[key];
  const p   = cfg.prefix;
  const fromEl = document.getElementById(p + '-rep-from');
  const toEl   = document.getElementById(p + '-rep-to');
  // Bail quietly if the Reports panel isn't built yet — guards against the
  // filtersChanged listener firing before the user has opened Reports.
  if (!fromEl || !toEl) return;
  const from = fromEl.value;
  const to   = toEl.value;
  const body = document.getElementById(p + '-rep-body');
  const sum  = document.getElementById(p + '-rep-summary');
  const note = document.getElementById(p + '-rep-filter-note');
  body.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Loading…</div>';

  // Visible notice when the master Team chip is filtering this report.
  // Without this the user has no way to tell why their entry is "missing".
  const teamFilter = AppState.filters?.team || '';
  if (note) {
    if (teamFilter) {
      note.style.display = '';
      note.innerHTML = `
        <i class="fas fa-filter"></i>
        Showing only <strong>${teamFilter}</strong> team entries.
        <a href="javascript:void(0)" onclick="_frClearTeam(event)">Show all teams</a>`;
    } else {
      note.style.display = 'none';
      note.innerHTML = '';
    }
  }

  try {
    let entries = await DB[cfg.getFn]({ startDate: from || undefined, endDate: to || undefined });
    const totalFromDb = entries.length;
    if (teamFilter) entries = entries.filter(e => e.teamName === teamFilter);
    AppState._actReport = AppState._actReport || {};
    AppState._actReport[key] = entries;

    if (!entries.length) {
      sum.innerHTML = '';
      // Tell the user *why* it's empty — different message if the team filter is the cause.
      const hiddenByFilter = totalFromDb > 0 && teamFilter;
      body.innerHTML = `<div class="empty-state">
        <i class="fas ${cfg.icon}"></i>
        ${hiddenByFilter
          ? `<p>${totalFromDb} ${cfg.title.toLowerCase()} entries exist in this range, but none for <strong>${teamFilter}</strong>.<br><a href="javascript:void(0)" onclick="_frClearTeam(event)">Show all teams</a></p>`
          : `<p>No ${cfg.title.toLowerCase()} entries in this range.<br>Try widening the date range above.</p>`}
      </div>`;
      return;
    }
    // Summary tiles
    const grand = cfg.countAsOne ? entries.length : entries.reduce((s, e) => s + (parseFloat(e[cfg.sumKey]) || 0), 0);
    sum.innerHTML = `
      <div class="act-sum-tile">
        <div class="act-sum-num">${cfg.sumPrefix || ''}${grand.toLocaleString('en-IN')}</div>
        <div class="act-sum-lbl">${cfg.sumLabel}</div>
      </div>
      <div class="act-sum-tile">
        <div class="act-sum-num">${entries.length}</div>
        <div class="act-sum-lbl">Entries</div>
      </div>
      <div class="act-sum-tile">
        <div class="act-sum-num">${formatDate(from)} → ${formatDate(to)}</div>
        <div class="act-sum-lbl">Range${teamFilter ? ' · ' + teamFilter : ''}</div>
      </div>`;

    // Per-team breakdown
    const teamMap = {};
    entries.forEach(e => {
      const t = e.teamName || 'Other';
      if (!teamMap[t]) teamMap[t] = { total: 0, list: [] };
      teamMap[t].total += cfg.countAsOne ? 1 : (parseFloat(e[cfg.sumKey]) || 0);
      teamMap[t].list.push(e);
    });
    const teams = Object.keys(teamMap).sort();

    body.innerHTML = `
      <table class="report-table">
        <thead><tr><th>Team</th><th class="num-th">${cfg.sumLabel.replace('Total ','')}</th><th class="num-th">Entries</th></tr></thead>
        <tbody>${teams.map(t => `
          <tr class="team-row" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <td><span class="team-badge-sm">${t}</span> <i class="fas fa-chevron-down" style="font-size:.65rem;color:var(--text-muted)"></i></td>
            <td class="num-cell"><strong>${cfg.sumPrefix || ''}${teamMap[t].total.toLocaleString('en-IN')}</strong></td>
            <td class="num-cell">${teamMap[t].list.length}</td>
          </tr>
          <tr class="detail-rows hidden"><td colspan="3" style="padding:0">
            <table class="inner-table">
              <thead><tr>${cfg.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
              <tbody>${teamMap[t].list.map(e => `<tr>
                ${cfg.cols.map(c => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${_actFmt(e[c.key], c.format)}</td>`).join('')}
              </tr>`).join('')}</tbody>
            </table>
          </td></tr>`).join('')}
          <tr class="totals-row">
            <td><strong>TOTAL</strong></td>
            <td class="num-cell"><strong>${cfg.sumPrefix || ''}${grand.toLocaleString('en-IN')}</strong></td>
            <td class="num-cell"><strong>${entries.length}</strong></td>
          </tr>
        </tbody>
      </table>`;
  } catch (e) {
    body.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function _actExportExcel(key) {
  const cfg = ACTIVITY_CONFIG[key];
  const entries = AppState._actReport?.[key] || [];
  if (!entries.length) { showToast('No data to export', 'error'); return; }
  const p = cfg.prefix;
  const from = document.getElementById(p + '-rep-from').value;
  const to   = document.getElementById(p + '-rep-to').value;
  const teamFilter = AppState.filters?.team || '';
  try {
    const XS = _xls();
    const wb = XLSX.utils.book_new();
    const HDR_S = XS.hdr('1A5C3A','FFFFFF');
    const headers = ['Team', ...cfg.cols.map(c => c.label)];
    const rows = [headers.map(h => ({ v: h, s: HDR_S }))];
    entries.forEach(e => {
      rows.push([
        { v: e.teamName || '—', s: XS.cell() },
        ...cfg.cols.map(c => ({ v: _actFmt(e[c.key], c.format), s: XS.cell() })),
      ]);
    });
    const colW = [{ wch: 16 }, ...cfg.cols.map(() => ({ wch: 22 }))];
    const ws = _xlsSheet(rows, colW);
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2' };
    const sheet = `${cfg.title}${teamFilter ? '_' + teamFilter : ''}`;
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
    const fname = `${cfg.title}_${from}_to_${to}${teamFilter ? '_' + teamFilter : ''}.xlsx`;
    XLSX.writeFile(wb, fname);
    showToast('Downloaded: ' + fname);
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

// ── React to filter ribbon changes ──────────────────────
window.addEventListener('filtersChanged', () => {
  const tab = AppState.currentTab;
  if (['books','service','registration','donation'].includes(tab)) {
    const sub = AppState._actSubTab?.[tab] || 'log';
    if (sub === 'log')     _actLoadRecent(tab);
    if (sub === 'reports') _actLoadReport(tab);
  }
});
