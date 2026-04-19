/* ══════════════════════════════════════
   MAIN.JS – App init, tab switching, utilities
   ══════════════════════════════════════ */

const AppState = {
  currentTab: 'devotees',
  currentSessionId: null,
  currentDevoteeId: null,
  currentEventId: null,
  trendsChart: null,
  callingData: [],
  fromAttendance: false,
  attendanceCandidates: {},   // id → devotee (for markPresent)
};

// ── INIT ───────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setTodayDate();
  await initSession();
  loadDevotees();
  loadCallingPersonsFilter();
  loadBirthdays();
  initReportDate();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});

function setTodayDate() {
  const d = new Date();
  document.getElementById('today-date').textContent = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function initSession() {
  try {
    const session = await DB.getTodaySession();
    AppState.currentSessionId = session.id;
    await loadSessionSelector();
  } catch (e) { console.error('Session init', e); }
}

async function loadSessionSelector() {
  const sel = document.getElementById('session-selector');
  try {
    const sessions = await DB.getSessions();
    sel.innerHTML = '<option value="">-- Select Date --</option>';
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = formatDate(s.session_date);
      if (s.id === AppState.currentSessionId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

async function loadCallingPersonsFilter() {
  try {
    const persons = await DB.getCallingPersons();
    const sel = document.getElementById('filter-calling-by');
    persons.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
  } catch (_) {}
}

async function loadBirthdays() {
  try {
    const bdays = await DB.getCareBirthdays();
    if (!bdays.length) return;
    const list = document.getElementById('birthday-list');
    list.innerHTML = bdays.map(d => `
      <div class="birthday-item">
        <div class="devotee-avatar" style="width:38px;height:38px;font-size:.9rem">${initials(d.name)}</div>
        <span class="birthday-name">${d.name}</span>
        <span class="birthday-date">${d.dob ? formatBirthday(d.dob) : ''}</span>
        ${contactIcons(d.mobile)}
      </div>`).join('');
    document.getElementById('birthday-popup').classList.remove('hidden');
  } catch (_) {}
}

function closeBirthdayPopup() { document.getElementById('birthday-popup').classList.add('hidden'); }

function initReportDate() { document.getElementById('report-date').value = new Date().toISOString().split('T')[0]; }

// ── TAB SWITCHING ──────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
  AppState.currentTab = tab;
  if (tab === 'calling')    loadCallingStatus();
  if (tab === 'attendance') loadAttendanceTab();
  if (tab === 'reports')    loadReports();
  if (tab === 'care')       loadCareData();
  if (tab === 'events')     loadEvents();
}

function switchSubTab(btn, id) {
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('subtab-' + id).classList.add('active');
  if (id === 'trends')             loadTrends();
  if (id === 'serious-analysis')   loadSeriousAnalysis();
  if (id === 'team-leaderboard')   loadTeamLeaderboard();
  if (id === 'attendance-detail')  loadAttendanceDetail();
}

// ── MODALS ─────────────────────────────
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function openImportModal() { openModal('import-modal'); }

// ── TOAST ──────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── DEBOUNCE ───────────────────────────
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── UTILITIES ──────────────────────────
function getToday()        { return new Date().toISOString().split('T')[0]; }
function getCurrentSunday() {
  const now = new Date(), day = now.getDay();
  const sun = new Date(now); sun.setDate(now.getDate() - day);
  return sun.toISOString().split('T')[0];
}

function initials(name = '') { return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join(''); }

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatBirthday(dob) {
  if (!dob) return '';
  const [, m, d] = dob.split('-');
  return `${parseInt(d)} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[parseInt(m)-1]}`;
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function isBirthdayWeek(dob) {
  if (!dob) return false;
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    if (dob.slice(5) === `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`) return true;
  }
  return false;
}
function statusBadge(s) {
  if (s === 'Most Serious') return `<span class="badge badge-most-serious">${s}</span>`;
  if (s === 'Serious')      return `<span class="badge badge-serious">${s}</span>`;
  return `<span class="badge badge-expected">${s || 'Expected to be Serious'}</span>`;
}
function teamBadge(t) { return t ? `<span class="badge badge-team">${t}</span>` : ''; }
function contactIcons(mobile) {
  if (!mobile) return '';
  const c = mobile.replace(/\D/g, '');
  return `<div class="contact-icons">
    <a href="tel:${c}" class="contact-icon icon-phone" onclick="event.stopPropagation()" title="Call"><i class="fas fa-phone"></i></a>
    <a href="https://wa.me/91${c}" target="_blank" class="contact-icon icon-whatsapp" onclick="event.stopPropagation()" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
  </div>`;
}

// ── EXPORT (client-side via SheetJS) ──
async function exportAttendance() {
  if (!AppState.currentSessionId) return showToast('No session selected', 'error');
  try {
    const records = await DB.getSessionAttendance(AppState.currentSessionId);
    if (!records.length) return showToast('No attendance data', 'error');
    const rows = records.map(r => ({ Name: r.name, Mobile: r.mobile || '', 'Chanting Rounds': r.chanting_rounds, Team: r.team_name || '', 'Calling By': r.calling_by || '', Type: r.is_new_devotee ? 'New' : 'Regular' }));
    downloadExcel(rows, `attendance_${getToday()}.xlsx`);
  } catch (e) { showToast('Export failed', 'error'); }
}

// ── IMPORT ─────────────────────────────
async function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const zone = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary);animation:spin 1s linear infinite"></i><p>Importing…</p>`;
  try {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const data = await DB.importDevotees(rows);
    result.className = 'import-result success';
    result.innerHTML = `<strong>Done!</strong> Imported: ${data.imported} | Skipped: ${data.skipped}${data.errors.length ? `<br><small>${data.errors.slice(0,3).join(', ')}</small>` : ''}`;
    result.classList.remove('hidden');
    loadDevotees(); loadCallingPersonsFilter();
    showToast(`Imported ${data.imported} devotees!`, 'success');
  } catch (err) {
    result.className = 'import-result error';
    result.textContent = 'Import failed: ' + (err.message || 'Unknown error');
    result.classList.remove('hidden');
    zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i><p>Click to browse or drag & drop Excel file</p><input type="file" id="import-file" accept=".xlsx,.xls" style="display:none" onchange="handleImportFile(event)">`;
  }
  e.target.value = '';
}
