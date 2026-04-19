const express = require('express');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Database
const db = new Database(path.join(__dirname, 'devotees.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// File upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ── DB INIT ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS devotees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT,
    address TEXT,
    dob TEXT,
    date_of_joining TEXT,
    chanting_rounds INTEGER DEFAULT 0,
    kanthi INTEGER DEFAULT 0,
    gopi_dress INTEGER DEFAULT 0,
    team_name TEXT,
    devotee_status TEXT DEFAULT 'Expected to be Serious',
    facilitator TEXT,
    reference_by TEXT,
    calling_by TEXT,
    lifetime_attendance INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    inactivity_flag INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL UNIQUE,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    devotee_id INTEGER NOT NULL,
    is_new_devotee INTEGER DEFAULT 0,
    marked_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
    FOREIGN KEY (devotee_id) REFERENCES devotees(id),
    UNIQUE(session_id, devotee_id)
  );

  CREATE TABLE IF NOT EXISTS calling_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devotee_id INTEGER NOT NULL,
    week_date TEXT NOT NULL,
    coming_status TEXT DEFAULT 'Maybe',
    calling_notes TEXT,
    called_by TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (devotee_id) REFERENCES devotees(id),
    UNIQUE(devotee_id, week_date)
  );

  CREATE TABLE IF NOT EXISTS profile_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devotee_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT DEFAULT 'System',
    FOREIGN KEY (devotee_id) REFERENCES devotees(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    event_date TEXT,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS event_devotees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    devotee_id INTEGER NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (devotee_id) REFERENCES devotees(id),
    UNIQUE(event_id, devotee_id)
  );
`);

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentSunday() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const sun = new Date(now);
  sun.setDate(diff);
  return sun.toISOString().split('T')[0];
}

function updateInactivityFlags() {
  const sessions = db.prepare('SELECT id FROM attendance_sessions ORDER BY session_date DESC LIMIT 3').all();
  if (sessions.length < 3) return;
  const devotees = db.prepare('SELECT id FROM devotees WHERE is_active = 1').all();
  const checkRecord = db.prepare('SELECT id FROM attendance_records WHERE session_id = ? AND devotee_id = ?');
  const updateFlag = db.prepare('UPDATE devotees SET inactivity_flag = ? WHERE id = ?');
  devotees.forEach(d => {
    const missed = sessions.every(s => !checkRecord.get(s.id, d.id));
    updateFlag.run(missed ? 1 : 0, d.id);
  });
}

// ── DEVOTEES ──────────────────────────────────────────────────────────────────
app.get('/api/devotees', (req, res) => {
  const { search, team, calling_by, status } = req.query;
  let q = 'SELECT * FROM devotees WHERE is_active = 1';
  const p = [];
  if (search) { q += ' AND (name LIKE ? OR mobile LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  if (team) { q += ' AND team_name = ?'; p.push(team); }
  if (calling_by) { q += ' AND calling_by = ?'; p.push(calling_by); }
  if (status) { q += ' AND devotee_status = ?'; p.push(status); }
  q += ' ORDER BY name ASC';
  res.json(db.prepare(q).all(...p));
});

app.get('/api/devotees/meta/calling-persons', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT calling_by FROM devotees WHERE calling_by IS NOT NULL AND calling_by != "" ORDER BY calling_by').all();
  res.json(rows.map(r => r.calling_by));
});

// IMPORTANT: import route must come before :id route
app.post('/api/devotees/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const wb = XLSX.readFile(req.file.path);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let imported = 0, skipped = 0, errors = [];
  const insert = db.prepare(`INSERT OR IGNORE INTO devotees (name,mobile,address,dob,date_of_joining,chanting_rounds,kanthi,gopi_dress,team_name,devotee_status,facilitator,reference_by,calling_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  data.forEach((row, i) => {
    try {
      const name = row.Name || row.name || '';
      const mobile = String(row.Mobile || row.mobile || row.Phone || '').trim();
      if (!name) { skipped++; return; }
      if (mobile) {
        const ex = db.prepare('SELECT id FROM devotees WHERE mobile = ?').get(mobile);
        if (ex) { skipped++; return; }
      }
      const r = insert.run(
        name, mobile,
        row.Address || '', row.DOB || row['Date of Birth'] || '',
        row['Date of Joining'] || '', parseInt(row['Chanting Rounds'] || 0),
        (row.Kanthi === 'Yes' || row.kanthi === 1) ? 1 : 0,
        (row['Gopi Dress'] === 'Yes' || row.gopi_dress === 1) ? 1 : 0,
        row.Team || row.team_name || '',
        row.Status || 'Expected to be Serious',
        row.Facilitator || '', row.Reference || '', row['Calling By'] || ''
      );
      if (r.changes) imported++; else skipped++;
    } catch (e) { errors.push(`Row ${i + 2}: ${e.message}`); }
  });
  try { fs.unlinkSync(req.file.path); } catch (_) {}
  res.json({ imported, skipped, errors });
});

app.get('/api/devotees/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM devotees WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});

app.post('/api/devotees', (req, res) => {
  const { name, mobile, address, dob, date_of_joining, chanting_rounds, kanthi, gopi_dress, team_name, devotee_status, facilitator, reference_by, calling_by } = req.body;
  if (mobile && mobile.trim()) {
    const ex = db.prepare('SELECT id, name FROM devotees WHERE mobile = ?').get(mobile.trim());
    if (ex) return res.status(409).json({ error: 'Duplicate', message: `Mobile already registered to ${ex.name}`, existingId: ex.id });
  }
  if (name) {
    const exn = db.prepare('SELECT id, name FROM devotees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name);
    if (exn) return res.status(409).json({ error: 'DuplicateName', message: `Name already exists: ${exn.name}`, existingId: exn.id, confirm: true });
  }
  const r = db.prepare(`INSERT INTO devotees (name,mobile,address,dob,date_of_joining,chanting_rounds,kanthi,gopi_dress,team_name,devotee_status,facilitator,reference_by,calling_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    name, mobile || null, address || null, dob || null, date_of_joining || null,
    chanting_rounds || 0, kanthi || 0, gopi_dress || 0,
    team_name || null, devotee_status || 'Expected to be Serious',
    facilitator || null, reference_by || null, calling_by || null
  );
  res.status(201).json(db.prepare('SELECT * FROM devotees WHERE id = ?').get(r.lastInsertRowid));
});

app.post('/api/devotees/force', (req, res) => {
  const { name, mobile, address, dob, date_of_joining, chanting_rounds, kanthi, gopi_dress, team_name, devotee_status, facilitator, reference_by, calling_by } = req.body;
  const r = db.prepare(`INSERT INTO devotees (name,mobile,address,dob,date_of_joining,chanting_rounds,kanthi,gopi_dress,team_name,devotee_status,facilitator,reference_by,calling_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    name, mobile || null, address || null, dob || null, date_of_joining || null,
    chanting_rounds || 0, kanthi || 0, gopi_dress || 0,
    team_name || null, devotee_status || 'Expected to be Serious',
    facilitator || null, reference_by || null, calling_by || null
  );
  res.status(201).json(db.prepare('SELECT * FROM devotees WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/devotees/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM devotees WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const u = req.body;
  const tracked = ['name','mobile','chanting_rounds','kanthi','gopi_dress','team_name','devotee_status','facilitator','reference_by','calling_by'];
  const logChange = db.prepare('INSERT INTO profile_changes (devotee_id,field_name,old_value,new_value,changed_by) VALUES (?,?,?,?,?)');
  tracked.forEach(f => {
    if (u[f] !== undefined && String(u[f]) !== String(existing[f] ?? '')) {
      logChange.run(req.params.id, f, existing[f], u[f], u._changed_by || 'Coordinator');
    }
  });
  db.prepare(`UPDATE devotees SET name=?,mobile=?,address=?,dob=?,date_of_joining=?,chanting_rounds=?,kanthi=?,gopi_dress=?,team_name=?,devotee_status=?,facilitator=?,reference_by=?,calling_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    u.name ?? existing.name, u.mobile ?? existing.mobile, u.address ?? existing.address,
    u.dob ?? existing.dob, u.date_of_joining ?? existing.date_of_joining,
    u.chanting_rounds ?? existing.chanting_rounds,
    u.kanthi !== undefined ? u.kanthi : existing.kanthi,
    u.gopi_dress !== undefined ? u.gopi_dress : existing.gopi_dress,
    u.team_name ?? existing.team_name, u.devotee_status ?? existing.devotee_status,
    u.facilitator ?? existing.facilitator, u.reference_by ?? existing.reference_by,
    u.calling_by ?? existing.calling_by, req.params.id
  );
  res.json(db.prepare('SELECT * FROM devotees WHERE id = ?').get(req.params.id));
});

app.delete('/api/devotees/:id', (req, res) => {
  db.prepare('UPDATE devotees SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/devotees/:id/history', (req, res) => {
  res.json(db.prepare('SELECT * FROM profile_changes WHERE devotee_id = ? ORDER BY changed_at DESC').all(req.params.id));
});

// ── SESSIONS / ATTENDANCE ─────────────────────────────────────────────────────
app.get('/api/sessions/today', (req, res) => {
  const today = getToday();
  let s = db.prepare('SELECT * FROM attendance_sessions WHERE session_date = ?').get(today);
  if (!s) {
    const r = db.prepare('INSERT INTO attendance_sessions (session_date) VALUES (?)').run(today);
    s = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(r.lastInsertRowid);
  }
  res.json(s);
});

app.get('/api/sessions', (req, res) => {
  res.json(db.prepare('SELECT * FROM attendance_sessions ORDER BY session_date DESC LIMIT 30').all());
});

app.get('/api/sessions/:id/stats', (req, res) => {
  const weekDate = getCurrentSunday();
  const target = db.prepare('SELECT COUNT(*) as c FROM calling_status WHERE week_date = ? AND coming_status = "Yes"').get(weekDate);
  const present = db.prepare('SELECT COUNT(*) as c FROM attendance_records WHERE session_id = ?').get(req.params.id);
  const newD = db.prepare('SELECT COUNT(*) as c FROM attendance_records WHERE session_id = ? AND is_new_devotee = 1').get(req.params.id);
  res.json({ target: target.c, present: present.c, newDevotees: newD.c, totalPresent: present.c });
});

app.get('/api/sessions/:id/attendance', (req, res) => {
  res.json(db.prepare(`SELECT ar.*,d.name,d.mobile,d.team_name,d.reference_by,d.calling_by,d.chanting_rounds,d.dob,d.devotee_status FROM attendance_records ar JOIN devotees d ON ar.devotee_id=d.id WHERE ar.session_id=? ORDER BY ar.marked_at DESC`).all(req.params.id));
});

app.get('/api/sessions/:id/candidates', (req, res) => {
  const { search } = req.query;
  const weekDate = getCurrentSunday();
  let q = `SELECT d.*,cs.coming_status,cs.calling_notes,ar.id as attendance_id FROM devotees d LEFT JOIN calling_status cs ON d.id=cs.devotee_id AND cs.week_date=? LEFT JOIN attendance_records ar ON d.id=ar.devotee_id AND ar.session_id=? WHERE d.is_active=1 AND (cs.coming_status IS NULL OR cs.coming_status NOT IN ('Shifted','Not Interested'))`;
  const p = [weekDate, req.params.id];
  if (search) { q += ' AND (d.name LIKE ? OR d.mobile LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  q += ' ORDER BY d.name ASC';
  res.json(db.prepare(q).all(...p));
});

app.post('/api/sessions/:id/attend', (req, res) => {
  const { devotee_id, is_new_devotee } = req.body;
  try {
    db.prepare('INSERT INTO attendance_records (session_id,devotee_id,is_new_devotee) VALUES (?,?,?)').run(req.params.id, devotee_id, is_new_devotee ? 1 : 0);
    db.prepare('UPDATE devotees SET lifetime_attendance=lifetime_attendance+1, inactivity_flag=0 WHERE id=?').run(devotee_id);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Already marked present' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sessions/:sessionId/attend/:devoteeId', (req, res) => {
  const r = db.prepare('DELETE FROM attendance_records WHERE session_id=? AND devotee_id=?').run(req.params.sessionId, req.params.devoteeId);
  if (r.changes) db.prepare('UPDATE devotees SET lifetime_attendance=MAX(0,lifetime_attendance-1) WHERE id=?').run(req.params.devoteeId);
  res.json({ success: true });
});

// ── CALLING STATUS ────────────────────────────────────────────────────────────
app.get('/api/calling', (req, res) => {
  const weekDate = req.query.week || getCurrentSunday();
  const devotees = db.prepare(`SELECT d.*,cs.coming_status,cs.calling_notes,cs.called_by,cs.id as calling_id FROM devotees d LEFT JOIN calling_status cs ON d.id=cs.devotee_id AND cs.week_date=? WHERE d.is_active=1 ORDER BY d.name ASC`).all(weekDate);
  res.json({ weekDate, devotees });
});

app.put('/api/calling/:devoteeId', (req, res) => {
  const { week_date, coming_status, calling_notes, called_by } = req.body;
  const weekDate = week_date || getCurrentSunday();
  const ex = db.prepare('SELECT id FROM calling_status WHERE devotee_id=? AND week_date=?').get(req.params.devoteeId, weekDate);
  if (ex) {
    db.prepare('UPDATE calling_status SET coming_status=?,calling_notes=?,called_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(coming_status, calling_notes, called_by, ex.id);
  } else {
    db.prepare('INSERT INTO calling_status (devotee_id,week_date,coming_status,calling_notes,called_by) VALUES (?,?,?,?,?)').run(req.params.devoteeId, weekDate, coming_status, calling_notes, called_by);
  }
  res.json({ success: true });
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
app.get('/api/reports/attendance', (req, res) => {
  const { session_id, week, month } = req.query;
  let ids = [];
  if (session_id) ids = [session_id];
  else if (week) {
    const end = new Date(week); end.setDate(end.getDate() + 6);
    ids = db.prepare('SELECT id FROM attendance_sessions WHERE session_date BETWEEN ? AND ?').all(week, end.toISOString().split('T')[0]).map(s => s.id);
  } else if (month) {
    ids = db.prepare("SELECT id FROM attendance_sessions WHERE strftime('%Y-%m',session_date)=?").all(month).map(s => s.id);
  }
  if (!ids.length) {
    const s = db.prepare('SELECT id FROM attendance_sessions WHERE session_date=?').get(getToday());
    if (s) ids = [s.id];
  }
  if (!ids.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');
  res.json(db.prepare(`SELECT d.name,d.mobile,d.chanting_rounds,d.team_name,d.calling_by,ar.is_new_devotee,ar.marked_at,s.session_date FROM attendance_records ar JOIN devotees d ON ar.devotee_id=d.id JOIN attendance_sessions s ON ar.session_id=s.id WHERE ar.session_id IN (${ph}) ORDER BY s.session_date DESC,d.name ASC`).all(...ids));
});

app.get('/api/reports/serious', (req, res) => {
  const weekDate = req.query.week || getCurrentSunday();
  const session = db.prepare('SELECT id FROM attendance_sessions WHERE session_date=?').get(req.query.session_date || getToday());
  const sid = session?.id;
  const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
  const statuses = ['Expected to be Serious','Serious','Most Serious'];
  const data = [];
  teams.forEach(team => {
    statuses.forEach(status => {
      const promised = db.prepare(`SELECT COUNT(*) as c FROM devotees d JOIN calling_status cs ON d.id=cs.devotee_id WHERE d.team_name=? AND d.devotee_status=? AND cs.week_date=? AND cs.coming_status='Yes'`).get(team, status, weekDate);
      const arrived = sid ? db.prepare(`SELECT COUNT(*) as c FROM attendance_records ar JOIN devotees d ON ar.devotee_id=d.id WHERE d.team_name=? AND d.devotee_status=? AND ar.session_id=?`).get(team, status, sid) : { c: 0 };
      data.push({ team, status, promised: promised.c, arrived: arrived.c });
    });
  });
  res.json(data);
});

app.get('/api/reports/teams', (req, res) => {
  const weekDate = req.query.week || getCurrentSunday();
  const session = db.prepare('SELECT id FROM attendance_sessions WHERE session_date=?').get(req.query.session_date || getToday());
  const sid = session?.id;
  const teams = ['Lalita','Vishakha','Tungavidya','Indulekha','Sudevi','Rangadevi','Chitralekha','Champaklata'];
  res.json(teams.map(team => {
    const total = db.prepare('SELECT COUNT(*) as c FROM devotees WHERE team_name=? AND is_active=1').get(team);
    const calling = db.prepare(`SELECT COUNT(*) as c FROM devotees d LEFT JOIN calling_status cs ON d.id=cs.devotee_id AND cs.week_date=? WHERE d.team_name=? AND d.is_active=1 AND (cs.coming_status IS NULL OR cs.coming_status NOT IN ('Shifted','Not Interested'))`).get(weekDate, team);
    const target = db.prepare(`SELECT COUNT(*) as c FROM devotees d JOIN calling_status cs ON d.id=cs.devotee_id WHERE d.team_name=? AND cs.week_date=? AND cs.coming_status='Yes'`).get(team, weekDate);
    const actual = sid ? db.prepare(`SELECT COUNT(*) as c FROM attendance_records ar JOIN devotees d ON ar.devotee_id=d.id WHERE d.team_name=? AND ar.session_id=?`).get(team, sid) : { c: 0 };
    return { team, total: total.c, callingList: calling.c, target: target.c, actualPresent: actual.c, percentage: target.c > 0 ? Math.round((actual.c / target.c) * 100) : 0 };
  }));
});

app.get('/api/reports/trends', (req, res) => {
  const { period, team } = req.query;
  let q, p = [];
  if (period === 'monthly') {
    q = `SELECT strftime('%Y-%m',s.session_date) as period, COUNT(DISTINCT ar.devotee_id) as count FROM attendance_sessions s LEFT JOIN attendance_records ar ON s.id=ar.session_id`;
    if (team) { q += ' LEFT JOIN devotees d ON ar.devotee_id=d.id WHERE d.team_name=?'; p.push(team); }
    q += ` GROUP BY strftime('%Y-%m',s.session_date) ORDER BY period ASC LIMIT 12`;
  } else {
    q = `SELECT s.session_date as period, COUNT(DISTINCT ar.devotee_id) as count FROM attendance_sessions s LEFT JOIN attendance_records ar ON s.id=ar.session_id`;
    if (team) { q += ' LEFT JOIN devotees d ON ar.devotee_id=d.id WHERE d.team_name=?'; p.push(team); }
    q += ' GROUP BY s.session_date ORDER BY period ASC LIMIT 24';
  }
  res.json(db.prepare(q).all(...p));
});

app.get('/api/reports/export', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id=?').get(session_id);
  const records = db.prepare(`SELECT d.name as 'Name',d.mobile as 'Mobile',d.chanting_rounds as 'Chanting Rounds',d.team_name as 'Team',d.calling_by as 'Calling By', CASE WHEN ar.is_new_devotee=1 THEN 'New' ELSE 'Regular' END as 'Type' FROM attendance_records ar JOIN devotees d ON ar.devotee_id=d.id WHERE ar.session_id=? ORDER BY d.name ASC`).all(session_id);
  const ws = XLSX.utils.json_to_sheet(records);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="attendance_${session?.session_date || 'report'}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── DEVOTEE CARE ──────────────────────────────────────────────────────────────
app.get('/api/care/absent', (req, res) => {
  const sessions = db.prepare('SELECT id,session_date FROM attendance_sessions ORDER BY session_date DESC LIMIT 5').all();
  if (sessions.length < 2) return res.json({ absentThisWeek: [], absentPast2Weeks: [] });
  const [latest, ...prev] = sessions;
  const prev2 = prev.slice(0, 2);
  const prev4 = prev.slice(0, 4);
  const devotees = db.prepare('SELECT * FROM devotees WHERE is_active=1').all();
  const check = db.prepare('SELECT id FROM attendance_records WHERE session_id=? AND devotee_id=?');
  const absentThisWeek = [], absentPast2Weeks = [];
  devotees.forEach(d => {
    if (check.get(latest.id, d.id)) return;
    const attendedBefore = prev4.some(s => check.get(s.id, d.id));
    if (!attendedBefore) return;
    const missingPrev2 = prev2.every(s => !check.get(s.id, d.id));
    (missingPrev2 ? absentPast2Weeks : absentThisWeek).push(d);
  });
  res.json({ absentThisWeek, absentPast2Weeks });
});

app.get('/api/care/newcomers', (req, res) => {
  const sessions = db.prepare('SELECT id FROM attendance_sessions ORDER BY session_date DESC LIMIT 2').all();
  if (sessions.length < 2) return res.json([]);
  const [latest, prev] = sessions;
  res.json(db.prepare(`SELECT d.* FROM devotees d JOIN attendance_records ar1 ON d.id=ar1.devotee_id AND ar1.session_id=? AND ar1.is_new_devotee=1 JOIN attendance_records ar2 ON d.id=ar2.devotee_id AND ar2.session_id=?`).all(prev.id, latest.id));
});

app.get('/api/care/birthdays', (req, res) => {
  const now = new Date();
  const results = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    results.push(md);
  }
  const devotees = db.prepare('SELECT * FROM devotees WHERE is_active=1 AND dob IS NOT NULL AND dob != ""').all();
  const bdays = devotees.filter(d => d.dob && results.includes(d.dob.slice(5)));
  res.json(bdays);
});

app.get('/api/care/inactive', (req, res) => {
  updateInactivityFlags();
  res.json(db.prepare('SELECT * FROM devotees WHERE inactivity_flag=1 AND is_active=1 ORDER BY name').all());
});

// ── EVENTS ────────────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => res.json(db.prepare('SELECT * FROM events ORDER BY event_date ASC').all()));

app.post('/api/events', (req, res) => {
  const { event_name, event_date, description } = req.body;
  const r = db.prepare('INSERT INTO events (event_name,event_date,description) VALUES (?,?,?)').run(event_name, event_date, description);
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/events/:id', (req, res) => {
  const { event_name, event_date, description } = req.body;
  db.prepare('UPDATE events SET event_name=?,event_date=?,description=? WHERE id=?').run(event_name, event_date, description, req.params.id);
  res.json({ success: true });
});

app.delete('/api/events/:id', (req, res) => {
  db.prepare('DELETE FROM event_devotees WHERE event_id=?').run(req.params.id);
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/events/:id/devotees', (req, res) => {
  res.json(db.prepare(`SELECT d.*,ed.added_at FROM devotees d JOIN event_devotees ed ON d.id=ed.devotee_id WHERE ed.event_id=? ORDER BY d.name ASC`).all(req.params.id));
});

app.post('/api/events/:id/devotees', (req, res) => {
  try {
    db.prepare('INSERT INTO event_devotees (event_id,devotee_id) VALUES (?,?)').run(req.params.id, req.body.devotee_id);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Already added' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/events/:eventId/devotees/:devoteeId', (req, res) => {
  db.prepare('DELETE FROM event_devotees WHERE event_id=? AND devotee_id=?').run(req.params.eventId, req.params.devoteeId);
  res.json({ success: true });
});

app.get('/api/events/:id/export', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  const devotees = db.prepare(`SELECT d.name as 'Name',d.mobile as 'Mobile',d.team_name as 'Team' FROM devotees d JOIN event_devotees ed ON d.id=ed.devotee_id WHERE ed.event_id=? ORDER BY d.name ASC`).all(req.params.id);
  const ws = XLSX.utils.json_to_sheet(devotees);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Devotees');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${(event?.event_name || 'event').replace(/[^a-z0-9]/gi, '_')}_devotees.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

app.listen(PORT, () => {
  console.log(`\n🪷  Sakhi Sang Attendance System`);
  console.log(`   Running at http://localhost:${PORT}\n`);
});
