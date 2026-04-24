/* ══ CONFIG.JS – Firebase, AppState, constants, utilities ══ */

// ── FIREBASE INIT ─────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCxxLIiOy0bGus2NkkSod7_LBVHah5-sz0",
  authDomain: "sakhi-sang-attendence-tracker.firebaseapp.com",
  projectId: "sakhi-sang-attendence-tracker",
  storageBucket: "sakhi-sang-attendence-tracker.firebasestorage.app",
  messagingSenderId: "975645795932",
  appId: "1:975645795932:web:10123086717198940b2899"
};
firebase.initializeApp(firebaseConfig);
const fdb = firebase.firestore();
const TS  = () => firebase.firestore.FieldValue.serverTimestamp();
const INC = (n) => firebase.firestore.FieldValue.increment(n);
fdb.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ── APP STATE ─────────────────────────────────────────
const AppState = {
  currentTab: 'devotees',
  currentSessionId: null,
  currentDevoteeId: null,
  currentEventId: null,
  trendsChart: null,
  callingData: [],
  fromAttendance: false,
  attendanceCandidates: {},
  sessionsCache: {},     // sessionId → session object
  // Auth
  userRole: null,       // 'superAdmin' | 'teamAdmin' | 'serviceDevotee'
  userTeam: null,       // team name for coordinators
  userPosition: null,   // free-text position from user profile (e.g. 'Facilitator')
  userName: '',
  userId: null,
  profilePic: null,            // base64 string or null
};

// ── TEAMS LIST (single source of truth) ───────────────
const TEAMS = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata','Nilachal','New Devotees'];

// ── ATTENDANCE TIME COLOUR ─────────────────────────────
function attTimeStyle(markedAtISO) {
  if (!markedAtISO) return { card: '', badge: '' };
  const d = new Date(markedAtISO);
  const mins = d.getHours() * 60 + d.getMinutes();
  const t1230 = 12 * 60 + 30, t1245 = 12 * 60 + 45, t1300 = 13 * 60;
  if (mins >= t1300) return { card: 'background:#c62828;color:#fff', badge: 'color:#fff' };
  if (mins >= t1245) return { card: 'background:#ef9a9a', badge: '' };
  if (mins >= t1230) return { card: 'background:#ffcdd2', badge: '' };
  return { card: '', badge: '' };
}

// ── DATE UTILITIES ─────────────────────────────────────
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getToday() { return localDateStr(new Date()); }
function getCurrentSunday() {
  const now = new Date(), day = now.getDay();
  const sun = new Date(now); sun.setDate(now.getDate() - day);
  return localDateStr(sun);
}
function getUpcomingSunday() {
  const now = new Date(), day = now.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const sun = new Date(now); sun.setDate(now.getDate() + daysUntilSunday);
  return localDateStr(sun);
}
function getCallingWeekDefault() {
  return getUpcomingSunday();
}
function snapToSunday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  if (day === 0) return dateStr;
  dt.setDate(dt.getDate() + (7 - day));
  return localDateStr(dt);
}
function initials(name = '') { return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join(''); }
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

// ── FORMAT HELPERS ─────────────────────────────────────
function statusBadge(s) {
  if (s === 'Most Serious') return `<span class="badge badge-most-serious">${s}</span>`;
  if (s === 'Serious')      return `<span class="badge badge-serious">${s}</span>`;
  return `<span class="badge badge-expected">${s || 'Expected to be Serious'}</span>`;
}
function teamBadge(t) { return t ? `<span class="badge badge-team">${t}</span>` : ''; }
function contactIcons(mobile) {
  if (!mobile) return '';
  const c = mobile.replace(/\D/g, '');
  // WhatsApp expects country-coded numbers. If 10 digits (IN), prefix 91.
  const wa = c.length === 10 ? '91' + c : c;
  return `<div class="contact-icons">
    <a href="tel:${c}" class="contact-icon icon-phone" onclick="event.stopPropagation()" title="Call"><i class="fas fa-phone-alt"></i></a>
    <a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="contact-icon icon-whatsapp" onclick="event.stopPropagation()" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
  </div>`;
}

// ── UI HELPERS ─────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
// Back-button support: keep one history entry while any overlay is open.
// When the user taps Back, close every open overlay at once.
let _overlayHistoryPushed = false;
function _ensureOverlayHistory() {
  if (!_overlayHistoryPushed) {
    try { history.pushState({ overlay: true }, '', location.href); } catch (_) {}
    _overlayHistoryPushed = true;
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  _ensureOverlayHistory();
}
function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}
function openImportModal() { openModal('import-modal'); }

window.addEventListener('popstate', () => {
  let closedAny = false;
  document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
    m.classList.add('hidden'); closedAny = true;
  });
  const sb = document.getElementById('app-sidebar');
  if (sb?.classList.contains('open')) {
    sb.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.add('hidden');
    closedAny = true;
  }
  if (typeof _cmSelectMode !== 'undefined' && _cmSelectMode) {
    _exitCMSelectMode?.(); closedAny = true;
  }
  _overlayHistoryPushed = false;
  // If nothing was closed, let the browser actually navigate back next time
});

// ── DEVOTEE CACHE (90-second TTL) ────────────────────
const DevoteeCache = {
  raw: [], stamp: 0, TTL: 90000,
  async refresh() {
    const snap = await fdb.collection('devotees').where('isActive', '==', true).get();
    this.raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    this.raw.sort((a, b) => a.name.localeCompare(b.name));
    this.stamp = Date.now();
    return this.raw;
  },
  async all(force = false) {
    if (force || Date.now() - this.stamp > this.TTL) return this.refresh();
    return this.raw;
  },
  bust() { this.stamp = 0; }
};
