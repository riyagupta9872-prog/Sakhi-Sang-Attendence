/* ══ EXCEL.JS – Import helpers, export functions ══ */
console.log('%c[Sakhi Sang] excel.js v136 loaded — template has Kirtan fields + grouped headers', 'background:#1A5C3A;color:#fff;padding:2px 8px;border-radius:3px');

// ── IMPORT HELPERS ────────────────────────────────────
function importCol(row, aliases) {
  for (const alias of aliases) {
    const key = Object.keys(row).find(k => k.toString().trim().toLowerCase() === alias.toLowerCase());
    if (key !== undefined && row[key] !== undefined && row[key] !== null) {
      const v = row[key].toString().trim();
      if (v) return v;
    }
  }
  return '';
}

function importDate(val) {
  if (!val) return null;
  const s = val.toString().trim();
  if (!s || s === '0') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `20${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return s;
}

function importYN(val) {
  return ['yes','y','1','true','हाँ','ha'].includes((val || '').toLowerCase()) ? 1 : 0;
}

function importStatus(val) {
  const v = (val || '').toLowerCase().trim();
  if (v === 'ets' || v.includes('expected')) return 'Expected to be Serious';
  if (v === 'ms' || v.includes('most')) return 'Most Serious';
  if (v === 's' || v === 'serious') return 'Serious';
  return val || 'Expected to be Serious';
}

// ── EXCEL HELPER ──────────────────────────────────────
function downloadExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

// ── EXCEL STYLE HELPERS ───────────────────────────────
function _xls() {
  const thin = { style: 'thin', color: { rgb: 'AAAAAA' } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const mkFill = rgb => ({ fgColor: { rgb }, patternType: 'solid' });
  const center = { horizontal: 'center', vertical: 'center', wrapText: true };
  const left   = { horizontal: 'left',   vertical: 'center', wrapText: false };
  const hdr = (bg = '1A5C3A', fg = 'FFFFFF') => ({
    font: { bold: true, color: { rgb: fg }, sz: 9 },
    fill: mkFill(bg), alignment: center, border
  });
  const cell = (opts = {}) => ({
    font: { sz: 9, bold: !!opts.bold, color: opts.fg ? { rgb: opts.fg } : undefined },
    fill: opts.bg ? mkFill(opts.bg) : undefined,
    alignment: opts.left ? left : center,
    border
  });
  return { border, center, left, hdr, cell, mkFill };
}

function _xlsSheet(data, colWidths, styleMatrix) {
  const ws = {};
  let maxC = 0;
  data.forEach((row, r) => {
    row.forEach((val, c) => {
      maxC = Math.max(maxC, c);
      const addr = XLSX.utils.encode_cell({ r, c });
      if (val !== null && val !== undefined && typeof val === 'object' && 'v' in val) {
        ws[addr] = { v: val.v, t: typeof val.v === 'number' ? 'n' : 's' };
        if (val.s) ws[addr].s = val.s;
      } else {
        ws[addr] = { v: val === null || val === undefined ? '' : val,
                     t: typeof val === 'number' ? 'n' : 's' };
        if (styleMatrix?.[r]?.[c]) ws[addr].s = styleMatrix[r][c];
      }
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: maxC } });
  if (colWidths) ws['!cols'] = colWidths;
  return ws;
}

// ── EXPORT CALLING LIST ───────────────────────────────
async function exportCallingList() {
  showToast('Preparing FY Calling & Attendance Report…');
  try {
    const today = getToday();
    const now   = new Date();
    const fyStartYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = `${fyStartYear}-04-01`;
    const fyLabel = `Apr-${String(fyStartYear).slice(-2)} to Mar-${String(fyStartYear + 1).slice(-2)}`;

    const XS = _xls();

    const fySessionSnap = await fdb.collection('sessions')
      .where('sessionDate', '>=', fyStart)
      .where('sessionDate', '<=', today)
      .orderBy('sessionDate', 'asc').get();
    const fySessions = fySessionSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isCancelled);

    // Use manually configured calling/session dates from Firestore settings
    const callingCfg = await DB.getCallingWeekConfig();
    const configCallingDate  = callingCfg?.callingDate  || null;
    const configSessionDate  = callingCfg?.sessionDate  || null;

    const includeUpcoming = !!(configCallingDate && configCallingDate > today);
    const fyCSEnd = includeUpcoming ? configCallingDate : today;
    const fyCSSnap = await fdb.collection('callingStatus')
      .where('weekDate', '>=', fyStart).where('weekDate', '<=', fyCSEnd).get();
    const fyCSByWeek = {};
    fyCSSnap.docs.forEach(d => {
      const { weekDate, devoteeId, comingStatus, callingNotes, callingReason, availableFrom } = d.data();
      if (!fyCSByWeek[weekDate]) fyCSByWeek[weekDate] = {};
      fyCSByWeek[weekDate][devoteeId] = { status: comingStatus, notes: callingNotes || '', reason: callingReason || '', availableFrom: availableFrom || '' };
    });

    const fyAttPerSession = {};
    for (let i = 0; i < fySessions.length; i += 10) {
      const batch = fySessions.slice(i, i + 10);
      const aSnap = await fdb.collection('attendanceRecords').where('sessionId', 'in', batch.map(s => s.id)).get();
      aSnap.docs.forEach(d => {
        const { sessionId, devoteeId } = d.data();
        if (!fyAttPerSession[sessionId]) fyAttPerSession[sessionId] = new Set();
        fyAttPerSession[sessionId].add(devoteeId);
      });
    }
    const sessionByDate = {};
    const sessionTopicByDate = {};
    fySessions.forEach(s => { sessionByDate[s.sessionDate] = s.id; sessionTopicByDate[s.sessionDate] = s.topic || ''; });

    const fyAttMap = {};
    Object.values(fyAttPerSession).forEach(set => set.forEach(did => { fyAttMap[did] = (fyAttMap[did]||0)+1; }));

    // Pair each calling date with its session.
    // For the configured calling date use the configured session date directly (admin-set).
    // For historical dates fall back to snapToSunday.
    const weekMap = new Map();
    fySessions.forEach(s => weekMap.set(s.sessionDate, { csDate: null, sessionDate: s.sessionDate }));
    Object.keys(fyCSByWeek).forEach(csDate => {
      if (configCallingDate && csDate === configCallingDate && configSessionDate) {
        if (weekMap.has(configSessionDate)) {
          weekMap.get(configSessionDate).csDate = csDate;
        } else {
          weekMap.set(configSessionDate, { csDate, sessionDate: configSessionDate });
        }
      } else {
        const sessDate = snapToSunday(csDate);
        if (weekMap.has(sessDate)) {
          weekMap.get(sessDate).csDate = csDate;
        } else {
          weekMap.set(sessDate, { csDate, sessionDate: null });
        }
      }
    });
    const allFyWeekPairs = [...weekMap.values()].sort((a, b) => {
      const ak = a.csDate || a.sessionDate;
      const bk = b.csDate || b.sessionDate;
      return ak.localeCompare(bk);
    });

    const allDevotees = await DevoteeCache.all();
    const activeDevotees = allDevotees.filter(d => d.callingBy && d.callingBy.trim() && !d.isNotInterested);
    const notInterestedDevotees = await DB.getNotInterestedDevotees();

    function csCell(entry) { return csEntryText(entry); }
    function csCellStyle(entry) {
      if (!entry?.status && !entry?.reason) return XS.cell();
      const bg = csEntryBg(entry) || 'FFFFFF';
      return { ...XS.cell(), fill: XS.mkFill(bg) };
    }
    const atStyle  = { ...XS.cell(), fill: XS.mkFill('BBDEFB'), font: { bold:true, sz:9, color:{rgb:'0D47A1'} } };
    const abStyle  = XS.cell();
    const snoStyle = { ...XS.cell(), font: { sz:9, color:{rgb:'888888'} } };
    const nameStyle = { ...XS.cell({ left:true }), font: { sz:9, bold:false } };
    const coordStyle = { ...XS.cell({ left:true }), font: { sz:9, color:{rgb:'444444'} } };

    const wb = XLSX.utils.book_new();

    TEAMS.forEach(team => {
      const members = activeDevotees.filter(d => d.teamName === team);
      members.sort((a,b) => (a.callingBy||'').localeCompare(b.callingBy||'') || a.name.localeCompare(b.name));
      if (!members.length) return;

      const fixedHdrs = ['#','Name','Mobile','Ref','CR','Active','Calling By',`FY Total\n(${fyLabel})`];
      const weekHdrs  = [];
      allFyWeekPairs.forEach(({ csDate, sessionDate }) => {
        const topic = sessionDate ? (sessionTopicByDate[sessionDate] || '') : '';
        const topicLine = topic ? `\n${topic.length > 20 ? topic.slice(0, 20) + '…' : topic}` : '';
        weekHdrs.push(`CS  ${csDate ? sheetFmtShortMonth(csDate) : '—'}${topicLine}`);
        weekHdrs.push(`AT  ${sessionDate ? sheetFmtShortMonth(sessionDate) : '—'}`);
      });

      const hdrRow = [...fixedHdrs, ...weekHdrs].map(h => ({ v: h, s: XS.hdr() }));
      const totalCols = fixedHdrs.length + weekHdrs.length;
      const titleRow  = [{ v: `${team} — FY ${fyLabel}`, s: XS.hdr('0D5E35') }];
      for (let i = 1; i < totalCols; i++) titleRow.push({ v: '', s: XS.hdr('0D5E35') });

      const dataRows = members.map((d, i) => {
        const even = i % 2 === 0;
        const rowBg = even ? 'F9FBF9' : 'FFFFFF';
        const baseSt = { ...XS.cell(), fill: XS.mkFill(rowBg) };
        const row = [
          { v: i+1, s: { ...snoStyle, fill: XS.mkFill(rowBg) } },
          { v: d.name, s: { ...nameStyle, fill: XS.mkFill(rowBg) } },
          { v: d.mobile||'', s: { ...baseSt, alignment:{...XS.center} } },
          { v: d.referenceBy||'', s: { ...baseSt, alignment:{...XS.left} } },
          { v: d.chantingRounds||0, s: baseSt },
          { v: d.isActive!==false?'Active':'', s: { ...baseSt, font:{sz:9,color:{rgb:d.isActive!==false?'1A5C3A':'888888'},bold:d.isActive!==false} } },
          { v: d.callingBy||'', s: { ...coordStyle, fill: XS.mkFill(rowBg) } },
          { v: fyAttMap[d.id]||0, s: { ...baseSt, font:{bold:true,sz:9} } },
        ];
        allFyWeekPairs.forEach(({ csDate, sessionDate }) => {
          const csEntry = csDate ? fyCSByWeek[csDate]?.[d.id] : null;
          const sessId  = sessionDate ? sessionByDate[sessionDate] : null;
          const came    = sessId && fyAttPerSession[sessId]?.has(d.id);
          row.push({ v: csCell(csEntry), s: { ...csCellStyle(csEntry), fill: XS.mkFill(csEntryBg(csEntry) || rowBg) } });
          row.push(sessId ? { v: came?'P':'', s: came ? atStyle : { ...abStyle, fill:XS.mkFill(rowBg) } } : { v:'—', s:{ ...baseSt, font:{sz:9,color:{rgb:'BBBBBB'}} } });
        });
        return row;
      });

      const sheetData = [titleRow, hdrRow, ...dataRows];
      const colWidths = [
        {wch:4},{wch:22},{wch:13},{wch:16},{wch:5},{wch:7},{wch:18},{wch:10},
        ...allFyWeekPairs.flatMap(()=>[{wch:22},{wch:6}])
      ];
      const ws = _xlsSheet(sheetData, colWidths);
      ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:totalCols-1} }];
      ws['!rows'] = [{ hpt:18 }, { hpt:42 }];
      ws['!views'] = [{ state:'frozen', xSplit:8, ySplit:2, topLeftCell:'I3' }];
      XLSX.utils.book_append_sheet(wb, ws, team.slice(0,31));
    });

    const niHdrs = ['#','Name','Mobile','Ref','CR','Team','Calling By','Date of Joining','Moved Not Interested On','Lifetime Att'].map(h=>({v:h,s:XS.hdr('7B3F00','FFFFFF')}));
    const niRows = notInterestedDevotees.map((d,i) => {
      const bg = i%2===0?'FFF8E1':'FFFFFF';
      const b = {...XS.cell(),fill:XS.mkFill(bg)};
      return [
        {v:i+1,s:b},{v:d.name,s:{...b,alignment:XS.left}},
        {v:d.mobile||'',s:b},{v:d.reference_by||'',s:{...b,alignment:XS.left}},
        {v:d.chanting_rounds||0,s:b},{v:d.team_name||'',s:b},
        {v:d.calling_by||'',s:{...b,alignment:XS.left}},{v:d.date_of_joining||'',s:b},
        {v:d.not_interested_at?new Date(d.not_interested_at).toLocaleDateString('en-IN'):'',s:b},
        {v:d.lifetime_attendance||0,s:{...b,font:{bold:true,sz:9}}}
      ];
    });
    const wsNI = _xlsSheet([niHdrs,...niRows],[{wch:4},{wch:22},{wch:13},{wch:16},{wch:5},{wch:13},{wch:18},{wch:13},{wch:22},{wch:10}]);
    XLSX.utils.book_append_sheet(wb, wsNI, 'Not Interested');

    XLSX.writeFile(wb, `sakhi_sang_fy${fyStartYear}_${today}.xlsx`);
    showToast(`FY ${fyLabel} export complete! ${allFyWeekPairs.length} weeks of data.`, 'success');
  } catch (e) {
    console.error('exportCallingList error', e);
    showToast('Export failed: ' + (e.message || 'Unknown error'), 'error');
  }
}

// ── EXPORT SHEET EXCEL ────────────────────────────────
async function exportSheetExcel() {
  const teamFilter = document.getElementById('sheet-team')?.value || '';
  showToast('Preparing roster Excel…');
  try {
    const devotees = await DevoteeCache.all();
    let rows = [...devotees];
    if (teamFilter) rows = rows.filter(d => d.teamName === teamFilter);
    rows.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || a.name.localeCompare(b.name));

    const headerRow = ['Sno', 'Name', 'Mobile', 'Reference', 'CR', 'Active', 'Team', 'Calling By', 'Total Attendance'];
    const dataRows = rows.map((d, i) => [
      i + 1, d.name, d.mobile || '', d.referenceBy || '',
      d.chantingRounds || 0, d.isActive !== false ? 'Active' : '',
      d.teamName || '', d.callingBy || '', d.lifetimeAttendance || 0,
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 13 }, { wch: 20 }, { wch: 5 }, { wch: 8 }, { wch: 14 }, { wch: 20 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devotee Roster');
    XLSX.writeFile(wb, 'Devotee_Roster.xlsx');
    showToast('Roster downloaded!', 'success');
  } catch (e) { console.error(e); showToast('Export failed', 'error'); }
}

async function exportYearlySheetExcel() {
  // FY now derived from the main Reports filter — no separate year dropdown.
  const refDate = (typeof _reportActive !== 'undefined' && _reportActive?.session_date) || getToday();
  const fy = (typeof _fyRangeFor === 'function')
    ? _fyRangeFor(refDate)
    : (() => {
        const [y, m] = refDate.split('-').map(Number);
        const sy = m >= 4 ? y : y - 1;
        return { start: `${sy}-04-01`, end: `${sy + 1}-03-31` };
      })();
  const start = fy.start, end = fy.end;
  const teamFilter = document.getElementById('yearly-sheet-team')?.value || '';
  showToast('Preparing Excel…');
  try {
    const { sessions, devotees, attMap, csMap } = await DB.getSheetData(start, end);
    let rows = [...devotees];
    if (teamFilter) rows = rows.filter(d => d.teamName === teamFilter);
    rows.sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || a.name.localeCompare(b.name));

    const fixedHdrs = ['Sno', 'Name', 'Mobile', 'Reference', 'CR', 'Active', 'Team', 'Calling By'];
    const headerRow1 = [...fixedHdrs];
    const headerRow2 = [...fixedHdrs.map(() => '')];
    sessions.forEach(s => {
      const label = sheetFmtDate(s.sessionDate) + (s.isCancelled ? ' [CANCELLED]' : '') + (s.topic ? ` – ${s.topic}` : '');
      headerRow1.push(label, '');
      headerRow2.push(`CS (${sheetFmtShort(shiftDateDay(s.sessionDate, -1))})`, `AT (${sheetFmtShort(s.sessionDate)})`);
    });
    headerRow1.push('TOTAL'); headerRow2.push('');

    const dataRows = rows.map((d, i) => {
      const base = [i + 1, d.name, d.mobile || '', d.referenceBy || '', d.chantingRounds || 0, d.isActive !== false ? 'Active' : '', d.teamName || '', d.callingBy || ''];
      sessions.forEach(s => {
        if (s.isCancelled) { base.push('—', '—'); return; }
        base.push(csLabel(csMap[s.sessionDate]?.[d.id] || null), attMap[s.id]?.has(d.id) ? 'P' : '');
      });
      base.push(d.lifetimeAttendance || 0);
      return base;
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Yearly Sheet');
    const yearLabel = start.slice(0, 4);
    XLSX.writeFile(wb, `Yearly_Sheet_FY${yearLabel}.xlsx`);
    showToast('Excel downloaded!', 'success');
  } catch (e) { console.error(e); showToast('Export failed', 'error'); }
}

// ── EXPORT DEVOTEE DATABASE ───────────────────────────
async function exportDevoteeDatabase() {
  showToast('Building database export…');
  try {
    const allDevotees = await DevoteeCache.all();
    return _buildAndDownloadDevoteeWorkbook({
      devotees: allDevotees,
      includeTeamCol: false,
      filename: `sakhi_sang_database_${getToday()}.xlsx`,
    });
  } catch (e) {
    console.error(e);
    showToast('Export failed', 'error');
  }
}

// Shared builder used by BOTH export AND the import template, so the two
// look identical. Differences:
//   • Export   → real devotees, per-team sheets (no Team column, implicit).
//   • Template → 2 sample rows in one sheet (Team column inside Team Management).
async function _buildAndDownloadDevoteeWorkbook({ devotees, includeTeamCol, filename }) {
  try {
    const XS = _xls();

    // ── Column categories (label, number of cols, header bg, header fg, sub-header bg)
    // ORDER: Sr.No → Personal Identity → Team Management (right after profile,
    // per user request) → Professional → Sadhana → Social & Family → Status
    // The Team Management cols differ for export vs template (template adds
    // "Team" since one sheet covers all teams; export hides it since each
    // team has its own sheet).
    const teamMgmtCols = includeTeamCol
      ? ['Team', 'Facilitator', 'Reference By', 'Calling By']
      : ['Facilitator', 'Reference By', 'Calling By'];

    const CATS = [
      { label: 'Sr.No.',              cols: 1,                       bg: 'ECEFF1', fg: '37474F', subBg: 'CFD8DC' },
      { label: 'Personal Identity',   cols: includeTeamCol ? 6 : 5,  bg: 'BBDEFB', fg: '0D47A1', subBg: 'E3F2FD' },
      { label: 'Team Management',     cols: teamMgmtCols.length,     bg: 'FFF9C4', fg: '5D4037', subBg: 'FFFDE7' },
      { label: 'Professional',        cols: 2,                       bg: 'E1BEE7', fg: '4A148C', subBg: 'F3E5F5' },
      { label: 'Sadhana & Practices', cols: 6,                       bg: 'C8E6C9', fg: '1B5E20', subBg: 'E8F5E9' },
      { label: 'Social & Family',     cols: includeTeamCol ? 4 : 3,  bg: 'FFE0B2', fg: 'BF360C', subBg: 'FFF3E0' },
      { label: 'Status',              cols: 1,                       bg: 'FFCDD2', fg: 'B71C1C', subBg: 'FFEBEE' },
    ];

    // Personal Identity adds an "Alternate Mobile" column on the import template.
    const personalCols = includeTeamCol
      ? ['Name', 'Mobile', 'Alternate Mobile', 'D.O.B', 'Address', 'E-Mail']
      : ['Name', 'Contact', 'D.O.B', 'Address', 'E-Mail'];
    const socialCols = includeTeamCol
      ? ['Family Favourable', 'Hobbies', 'Skills', 'Date of Joining']
      : ['Family Favourable', 'Hobbies', 'Date of Joining'];

    const COL_HEADERS = [
      'Sr.No.',
      ...personalCols,
      ...teamMgmtCols,
      'Education', 'Profession',
      'Chanting Rounds', 'Reading', 'Hearing', 'Tilak', 'Kanthi', 'Gopi Dress',
      ...socialCols,
      'Status',
    ];
    const TOTAL_COLS = COL_HEADERS.length;

    // Column widths — index-mapped to COL_HEADERS so adding/removing cols stays in sync.
    const widthByHeader = {
      'Sr.No.': 6,
      'Name': 24, 'Mobile': 13, 'Contact': 13, 'Alternate Mobile': 14, 'D.O.B': 12, 'Address': 30, 'E-Mail': 26,
      'Team': 14, 'Facilitator': 22, 'Reference By': 22, 'Calling By': 22,
      'Education': 18, 'Profession': 18,
      'Chanting Rounds': 10, 'Reading': 13, 'Hearing': 13, 'Tilak': 8, 'Kanthi': 8, 'Gopi Dress': 11,
      'Family Favourable': 18, 'Hobbies': 22, 'Skills': 18, 'Date of Joining': 14,
      'Status': 22,
    };
    const colWidths = COL_HEADERS.map(h => ({ wch: widthByHeader[h] || 14 }));

    const levels = [
      { label: 'Level 1  ·  0 – 4 Rounds  ·  Well Wishers  (Yet to start chanting)', min: 0, max: 4 },
      { label: 'Level 2  ·  5 – 8 Rounds  ·  Beginners  (Starting their journey)', min: 5, max: 8 },
      { label: 'Level 3  ·  9 – 15 Rounds  ·  Advancing  (Growing in practice)', min: 9, max: 15 },
      { label: 'Level 4  ·  16+ Rounds  ·  Committed Chanters  (Steady practitioners)', min: 16, max: 999 },
    ];

    // ── Style factories
    const mkFill = rgb => ({ fgColor: { rgb }, patternType: 'solid' });
    const catHdr = (bg, fg) => ({
      font: { bold: true, sz: 10, color: { rgb: fg } },
      fill: mkFill(bg),
      alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
      border: XS.border,
    });
    const colHdr = (bg, fg) => ({
      font: { bold: true, sz: 9, color: { rgb: fg } },
      fill: mkFill(bg),
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: XS.border,
    });
    const levelBanner = {
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      fill: mkFill('1A5C3A'),
      alignment: { horizontal: 'center', vertical: 'center' },
      border: XS.border,
    };
    const teamBanner = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: mkFill('0D3B22'),
      alignment: { horizontal: 'center', vertical: 'center' },
      border: XS.border,
    };
    const dataCell = (opts = {}) => ({
      font: { sz: 9, bold: !!opts.bold },
      fill: opts.bg ? mkFill(opts.bg) : mkFill('FFFFFF'),
      alignment: { horizontal: opts.left ? 'left' : 'center', vertical: 'center', wrapText: !!opts.wrap },
      border: XS.border,
    });

    // ── Row builders
    function catHeaderRow() {
      const row = [];
      CATS.forEach(cat => {
        row.push({ v: cat.label, s: catHdr(cat.bg, cat.fg) });
        for (let i = 1; i < cat.cols; i++) row.push({ v: '', s: catHdr(cat.bg, cat.fg) });
      });
      return row;
    }

    function colHeaderRow() {
      const row = [];
      let ci = 0;
      CATS.forEach(cat => {
        for (let i = 0; i < cat.cols; i++) {
          row.push({ v: COL_HEADERS[ci], s: colHdr(cat.subBg, cat.fg) });
          ci++;
        }
      });
      return row;
    }

    function catMergesAt(rowIdx) {
      const m = []; let c = 0;
      CATS.forEach(cat => {
        if (cat.cols > 1) m.push({ s: { r: rowIdx, c }, e: { r: rowIdx, c: c + cat.cols - 1 } });
        c += cat.cols;
      });
      return m;
    }

    function fullMergeAt(rowIdx) {
      return [{ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: TOTAL_COLS - 1 } }];
    }

    function emptyRow() {
      return Array.from({ length: TOTAL_COLS }, () => ({ v: '', s: dataCell() }));
    }

    function devoteeRow(d, i) {
      const yn = (v, yes = 'Yes', no = 'No') => v == null || v === '' ? '' : (v ? yes : no);
      // Build by header so reordering categories above stays in sync automatically.
      const cellByHeader = {
        'Sr.No.':            { v: i + 1,                   s: dataCell() },
        'Name':              { v: d.name || '',            s: dataCell({ left: true, bold: true }) },
        'Mobile':            { v: d.mobile || '',          s: dataCell() },
        'Contact':           { v: d.mobile || '',          s: dataCell() },
        'Alternate Mobile':  { v: d.mobileAlt || '',       s: dataCell() },
        'D.O.B':             { v: d.dob || '',             s: dataCell() },
        'Address':           { v: d.address || '',         s: dataCell({ left: true, wrap: true }) },
        'E-Mail':            { v: d.email || '',           s: dataCell({ left: true }) },
        'Team':              { v: d.teamName || '',        s: dataCell() },
        'Facilitator':       { v: d.facilitator || '',     s: dataCell() },
        'Reference By':      { v: d.referenceBy || '',     s: dataCell() },
        'Calling By':        { v: d.callingBy || '',       s: dataCell() },
        'Education':         { v: d.education || '',       s: dataCell({ left: true }) },
        'Profession':        { v: d.profession || '',      s: dataCell({ left: true }) },
        'Chanting Rounds':   { v: d.chantingRounds || 0,   s: dataCell({ bold: true }) },
        'Reading':           { v: d.reading || '',         s: dataCell() },
        'Hearing':           { v: d.hearing || '',         s: dataCell() },
        'Tilak':             { v: yn(d.tilak),             s: dataCell({ bg: d.tilak    ? 'C8E6C9' : d.tilak === false ? 'FFCDD2' : null }) },
        'Kanthi':            { v: yn(d.kanthi),            s: dataCell({ bg: d.kanthi   ? 'C8E6C9' : d.kanthi === false ? 'FFCDD2' : null }) },
        'Gopi Dress':        { v: yn(d.gopiDress),         s: dataCell({ bg: d.gopiDress? 'C8E6C9' : d.gopiDress === false ? 'FFCDD2' : null }) },
        'Family Favourable': { v: d.familyFavourable || '', s: dataCell() },
        'Hobbies':           { v: d.hobbies || '',         s: dataCell({ left: true, wrap: true }) },
        'Skills':            { v: d.skills || '',          s: dataCell({ left: true, wrap: true }) },
        'Date of Joining':   { v: d.dateOfJoining || '',   s: dataCell() },
        'Status':            { v: d.devoteeStatus || '',   s: dataCell() },
      };
      return COL_HEADERS.map(h => cellByHeader[h] || { v: '', s: dataCell() });
    }

    // ── Build one team's worth of rows + merges, appended into provided arrays
    function appendTeamLevels(rows, merges, teamDevotees) {
      levels.forEach(lvl => {
        const members = teamDevotees
          .filter(d => { const cr = d.chantingRounds || 0; return cr >= lvl.min && cr <= lvl.max; })
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!members.length) return;

        // Level banner
        const bannerRow = Array.from({ length: TOTAL_COLS }, (_, i) => ({ v: i === 0 ? lvl.label : '', s: levelBanner }));
        fullMergeAt(rows.length).forEach(m => merges.push(m));
        rows.push(bannerRow);

        // Category header row (with merges)
        catMergesAt(rows.length).forEach(m => merges.push(m));
        rows.push(catHeaderRow());

        // Column header row
        rows.push(colHeaderRow());

        // Data rows
        members.forEach((d, i) => rows.push(devoteeRow(d, i)));

        // Spacer
        rows.push(emptyRow());
      });
    }

    const wb = XLSX.utils.book_new();

    if (includeTeamCol) {
      // ── TEMPLATE MODE: one "Devotees" sheet with sectioned headers and
      // 2 sample rows so users see exactly how to fill each column.
      const rows = [], merges = [];

      // Category header row + merges
      catMergesAt(rows.length).forEach(m => merges.push(m));
      rows.push(catHeaderRow());
      // Column header row
      rows.push(colHeaderRow());
      // Sample devotee rows (act like real devotees through devoteeRow)
      const samples = (devotees && devotees.length) ? devotees : [
        {
          name: 'Radha Kumari', mobile: '9876543210', mobileAlt: '9811122233',
          dob: '2000-06-15', address: 'C-12, Sector 5, Noida', email: 'radha@example.com',
          teamName: 'Champaklata', facilitator: 'Anjali Mishra Mtg',
          referenceBy: 'Priya Devi', callingBy: 'Anjali Mishra Mtg',
          education: 'B.Com', profession: 'Housewife',
          chantingRounds: 16, reading: 'Regular', hearing: 'Daily',
          tilak: true, kanthi: true, gopiDress: false,
          familyFavourable: 'Yes', hobbies: 'Singing, Cooking', skills: 'Music, Art',
          dateOfJoining: '2023-04-02', devoteeStatus: 'Serious',
        },
        {
          name: 'Sita Devi', mobile: '8765432109', mobileAlt: '',
          dob: '1998-03-22', address: 'B-4, Govind Nagar, Mathura', email: '',
          teamName: 'Lalita', facilitator: 'Neha Bhandari',
          referenceBy: '', callingBy: 'Neha Bhandari',
          education: '12th Pass', profession: 'Student',
          chantingRounds: 8, reading: 'Occasionally', hearing: 'Occasionally',
          tilak: false, kanthi: false, gopiDress: false,
          familyFavourable: 'Partial', hobbies: 'Dance', skills: 'Teaching',
          dateOfJoining: '2024-01-07', devoteeStatus: 'Expected to be Serious',
        },
      ];
      samples.forEach((d, i) => rows.push(devoteeRow(d, i)));

      const ws = _xlsSheet(rows, colWidths);
      ws['!merges'] = merges;
      ws['!rows']   = rows.map(() => ({ hpt: 22 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Devotees');

      // Instructions sheet
      const teamList   = TEAMS.join('  |  ');
      const statusList = 'Expected to be Serious  |  Serious  |  Most Serious  |  New Devotee  |  Inactive';
      const instrRows = [
        ['SAKHI SANG – Devotee Import Template', '', ''],
        ['', '', ''],
        ['HOW TO USE:', '', ''],
        ['1. Fill data in the "Devotees" sheet starting from Row 4', '', ''],
        ['     Row 1 = section banner (blue/yellow/peach/green/orange/grey)', '', ''],
        ['     Row 2 = column headers — DO NOT change either of these rows', '', ''],
        ['2. Delete the 2 sample rows before importing', '', ''],
        ['3. Save and upload using the Import Excel button', '', ''],
        ['', '', ''],
        ['SECTIONS (in order):', '', ''],
        ['     Personal Identity   — blue', '', ''],
        ['     Team Management     — yellow  (right after profile)', '', ''],
        ['     Professional        — purple', '', ''],
        ['     Sadhana & Practices — green', '', ''],
        ['     Social & Family     — orange', '', ''],
        ['     Status              — pink', '', ''],
        ['', '', ''],
        ['COLUMN GUIDE:', 'Allowed Values / Format', 'Required?'],
        ['Name', 'Full name of devotee', 'YES'],
        ['Mobile', '10-digit number, no spaces or dashes', 'Recommended'],
        ['Alternate Mobile', '10-digit number (only if a 2nd number is known)', 'Optional'],
        ['D.O.B', 'YYYY-MM-DD  (e.g. 2000-06-15)', 'Optional'],
        ['Address', 'Full address', 'Optional'],
        ['E-Mail', 'Valid email address', 'Optional'],
        ['Team', teamList, 'Required'],
        ['Facilitator', 'Name of facilitator (must match a devotee)', 'Optional'],
        ['Reference By', 'Name of referring devotee', 'Optional'],
        ['Calling By', 'Name of caller (must match a devotee)', 'Optional'],
        ['Education', 'e.g. 10th, 12th Pass, B.Com, M.A., PhD…', 'Optional'],
        ['Profession', 'e.g. Housewife, Teacher, Student, Business…', 'Optional'],
        ['Chanting Rounds', 'Number between 0 and 64', 'Optional'],
        ['Reading',  'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
        ['Hearing',  'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
        ['Tilak',     'Yes  or  No', 'Optional'],
        ['Kanthi',    'Yes  or  No', 'Optional'],
        ['Gopi Dress','Yes  or  No', 'Optional'],
        ['Family Favourable', 'Yes  |  Partial  |  No', 'Optional'],
        ['Hobbies', 'Free text — e.g. Singing, Dance, Cooking', 'Optional'],
        ['Skills',  'Free text — e.g. Teaching, Graphic Design', 'Optional'],
        ['Date of Joining', 'YYYY-MM-DD  (e.g. 2023-04-02)', 'Optional'],
        ['Status', statusList, 'Optional'],
        ['', '', ''],
        ['NOTE: Same Name + same Mobile = duplicate (skipped during import).', '', ''],
      ];
      const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
      wsInstr['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

      XLSX.writeFile(wb, filename);
      showToast('Template downloaded!', 'success');
      return;
    }

    // ── EXPORT MODE: Per-team sheets + All Teams + Re-Import (Flat)
    TEAMS.forEach(team => {
      const teamDevotees = devotees.filter(d => d.teamName === team && d.isActive !== false);
      if (!teamDevotees.length) return;
      const rows = [], merges = [];
      appendTeamLevels(rows, merges, teamDevotees);
      const ws = _xlsSheet(rows, colWidths);
      ws['!merges'] = merges;
      ws['!rows']   = rows.map(() => ({ hpt: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, team.slice(0, 31));
    });

    // All Teams sheet
    {
      const rows = [], merges = [];
      TEAMS.forEach(team => {
        const teamDevotees = devotees.filter(d => d.teamName === team && d.isActive !== false);
        if (!teamDevotees.length) return;
        const banner = Array.from({ length: TOTAL_COLS }, (_, i) => ({ v: i === 0 ? `── ${team.toUpperCase()} ──` : '', s: teamBanner }));
        fullMergeAt(rows.length).forEach(m => merges.push(m));
        rows.push(banner);
        appendTeamLevels(rows, merges, teamDevotees);
        rows.push(emptyRow());
      });
      const ws = _xlsSheet(rows, colWidths);
      ws['!merges'] = merges;
      ws['!rows']   = rows.map(() => ({ hpt: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, 'All Teams');
    }

    // Re-Import (Flat) sheet — simple flat sheet for lossless re-import.
    {
      const flatHeaders = [
        'Name', 'Mobile', 'Alternate Mobile', 'Address', 'DOB',
        'Date of Joining', 'Chanting Rounds', 'Kanthi', 'Gopi Dress', 'Tilak',
        'Team', 'Status', 'Facilitator', 'Reference', 'Calling By',
        'Education', 'Email', 'Profession', 'Family Favourable', 'Reading', 'Hearing',
        'Hobbies',
      ];
      const yn = v => v ? 'Yes' : 'No';
      const flatRows = [flatHeaders];
      const sortedAll = [...devotees]
        .filter(d => d.isActive !== false)
        .sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || (a.name || '').localeCompare(b.name || ''));
      sortedAll.forEach(d => {
        flatRows.push([
          d.name || '', d.mobile || '', d.mobileAlt || '', d.address || '', d.dob || '',
          d.dateOfJoining || '', d.chantingRounds || 0,
          yn(d.kanthi), yn(d.gopiDress), yn(d.tilak),
          d.teamName || '', d.devoteeStatus || '',
          d.facilitator || '', d.referenceBy || '', d.callingBy || '',
          d.education || '', d.email || '', d.profession || '', d.familyFavourable || '',
          d.reading || '', d.hearing || '', d.hobbies || '',
        ]);
      });
      const wsFlat = XLSX.utils.aoa_to_sheet(flatRows);
      wsFlat['!cols'] = flatHeaders.map(() => ({ wch: 16 }));
      XLSX.utils.book_append_sheet(wb, wsFlat, 'Re-Import (Flat)');
    }

    XLSX.writeFile(wb, filename);
    showToast('Database exported!', 'success');
  } catch (e) {
    console.error(e);
    showToast(includeTeamCol ? 'Template download failed' : 'Export failed', 'error');
  }
}

// ── DOWNLOAD IMPORT TEMPLATE ──────────────────────────
function downloadImportTemplate() {
  // Plain flat template. Columns grouped by section so related fields are
  // adjacent (Sadhana fields together, Personal together, etc.) — even
  // though there are no visible section banners. Order MUST stay grouped:
  //
  //  Personal Identity → Team Management → Professional → Sadhana &
  //  Practices (incl. Kirtan questions) → Social & Family → Status
  const teams    = TEAMS;
  const statuses = ['Expected to be Serious','Serious','Most Serious','New Devotee','Inactive'];

  const headers = [
    // Personal Identity
    'Name', 'Mobile', 'Alternate Mobile', 'DOB', 'Email', 'Address',
    // Team Management
    'Team', 'Facilitator', 'Reference', 'Calling By',
    // Professional
    'Education', 'Profession',
    // Sadhana & Practices  (Kirtan questions are part of this section)
    'Chanting Rounds', 'Reading', 'Hearing',
    'Tilak', 'Kanthi', 'Gopi Dress',
    'Wants Kirtan Class', 'Instrument',
    // Social & Family
    'Family Favourable', 'Hobbies', 'Skills', 'Date of Joining',
    // Status
    'Status',
  ];
  const sample1 = [
    'Radha Kumari', '9876543210', '9811122233', '2000-06-15', 'radha@example.com', 'C-12, Sector 5, Noida',
    'Champaklata', 'Anjali Mishra Mtg', 'Priya Devi', 'Anjali Mishra Mtg',
    'B.Com', 'Housewife',
    '16', 'Regular', 'Daily',
    'Yes', 'Yes', 'No',
    'Yes', 'Harmonium',
    'Yes', 'Singing, Cooking', 'Music, Art', '2023-04-02',
    'Serious',
  ];
  const sample2 = [
    'Sita Devi', '8765432109', '', '1998-03-22', '', 'B-4, Govind Nagar, Mathura',
    'Lalita', 'Neha Bhandari', '', 'Neha Bhandari',
    '12th Pass', 'Student',
    '8', 'Occasionally', 'Occasionally',
    'No', 'No', 'No',
    'No', '',
    'Partial', 'Dance', 'Teaching', '2024-01-07',
    'Expected to be Serious',
  ];

  const wsData = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  // Column widths follow the same order as headers above.
  wsData['!cols'] = [
    { wch: 24 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 30 },
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
    { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 8 }, { wch: 8 }, { wch: 11 },
    { wch: 18 }, { wch: 16 },
    { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 14 },
    { wch: 22 },
  ];

  const instrRows = [
    ['SAKHI SANG – Devotee Import Template', '', ''],
    ['', '', ''],
    ['HOW TO USE:', '', ''],
    ['1. Fill data in "Devotees" sheet starting from Row 2 (Row 1 = headers — do not change)', '', ''],
    ['2. Delete the 2 sample rows before importing', '', ''],
    ['3. Save and upload using the Import Excel button', '', ''],
    ['', '', ''],
    ['COLUMNS ARE GROUPED BY SECTION (in order):', '', ''],
    ['Personal Identity:', 'Name, Mobile, Alternate Mobile, DOB, Email, Address', ''],
    ['Team Management:',  'Team, Facilitator, Reference, Calling By', ''],
    ['Professional:',     'Education, Profession', ''],
    ['Sadhana & Practices:', 'Chanting Rounds, Reading, Hearing, Tilak, Kanthi, Gopi Dress, Wants Kirtan Class, Instrument', ''],
    ['Social & Family:',  'Family Favourable, Hobbies, Skills, Date of Joining', ''],
    ['Status:',           'Status', ''],
    ['', '', ''],
    ['COLUMN GUIDE:', 'Allowed Values / Format', 'Required?'],
    ['Name', 'Full name of devotee', 'YES (mandatory)'],
    ['Mobile', '10-digit number, no spaces or dashes', 'Recommended'],
    ['Alternate Mobile', '10-digit number (only if a 2nd number is known)', 'Optional'],
    ['DOB', 'YYYY-MM-DD  (e.g. 2000-06-15)', 'Optional'],
    ['Email', 'Valid email address', 'Optional'],
    ['Address', 'Full address', 'Optional'],
    ['Team', teams.join('  |  '), 'Optional'],
    ['Facilitator', 'Name of facilitator (must match a devotee in DB)', 'Optional'],
    ['Reference', 'Name of referring devotee', 'Optional'],
    ['Calling By', 'Name of caller (must match a devotee in DB)', 'Optional'],
    ['Education', 'e.g. 10th, 12th Pass, B.Com, M.A., PhD…', 'Optional'],
    ['Profession', 'e.g. Housewife, Teacher, Student, Business…', 'Optional'],
    ['Chanting Rounds', 'Number between 0 and 64', 'Optional'],
    ['Reading',  'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
    ['Hearing',  'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
    ['Tilak',     'Yes  or  No', 'Optional'],
    ['Kanthi',    'Yes  or  No', 'Optional'],
    ['Gopi Dress','Yes  or  No', 'Optional'],
    ['Wants Kirtan Class', 'Yes  or  No  — interested in attending kirtan class', 'Optional'],
    ['Instrument', 'Free text — instrument played (e.g. Harmonium, Mridanga, Karatal)', 'Optional'],
    ['Family Favourable', 'Yes  |  Partial  |  No', 'Optional'],
    ['Hobbies', 'Free text — e.g. Singing, Dance, Cooking', 'Optional'],
    ['Skills',  'Free text — e.g. Teaching, Graphic Design, Music', 'Optional'],
    ['Date of Joining', 'YYYY-MM-DD  (e.g. 2023-04-02)', 'Optional'],
    ['Status', statuses.join('  |  '), 'Optional'],
    ['', '', ''],
    ['NOTE: Same Name + same Mobile = duplicate (skipped during import).', '', ''],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 26 }, { wch: 70 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData,  'Devotees');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');
  XLSX.writeFile(wb, 'sakhi_sang_devotee_template.xlsx');
  showToast('Template downloaded!', 'success');
}

// ── IMPORT FIELD DEFINITIONS ──────────────────────────
const IMPORT_FIELDS = [
  { key: 'name',               label: 'Name *',                  aliases: ['Name','name','Full Name','Devotee Name','NAAM'] },
  { key: 'dob',                label: 'Date of Birth',           aliases: ['DOB','D.O.B','Date of Birth','Birth Date','dob','D.O.B.','DOB (DD/MM/YYYY)'] },
  { key: 'mobile',             label: 'Mobile',                  aliases: ['Mobile','Contact','Phone','Mobile Number','Mobile (10 digits)','Contact Number','Mob','Ph No','mob no','contact'] },
  { key: 'mobileAlt',          label: 'Alternate Mobile',        aliases: ['Alternate Mobile','Alt Mobile','Mobile 2','Alt Number','Alternate Number','Second Mobile','Secondary Mobile','Mob 2','alt mobile','Alternate Contact'] },
  { key: 'address',            label: 'Residential Address',     aliases: ['Address','address','Addr','ADDRESS','Residential Address'] },
  { key: 'email',              label: 'Email',                   aliases: ['Email','E-Mail','email','E Mail','e-mail','EMAIL'] },
  { key: 'education',          label: 'Education / Qualification', aliases: ['Education','education','EDUCATION','Qualification'] },
  { key: 'profession',         label: 'Profession / Occupation', aliases: ['Profession','Occupation','profession','PROFESSION'] },
  { key: 'chantingRounds',     label: 'Chanting Rounds',         aliases: ['Chanting Rounds','CHANTING','Chanting','CR','chanting','Rounds','rounds','chanting rounds'] },
  { key: 'reading',            label: 'Reading',                 aliases: ['Reading','reading','READING'] },
  { key: 'hearing',            label: 'Hearing',                 aliases: ['Hearing','hearing','HEARING'] },
  { key: 'tilak',              label: 'Tilak (Y/N)',             aliases: ['Tilak','tilak','TILAK'] },
  { key: 'kanthi',             label: 'Kanthi (Y/N)',            aliases: ['Kanthi','kanthi','KANTHI'] },
  { key: 'gopiDress',          label: 'Gopi Dress (Y/N)',        aliases: ['Gopi Dress','Gopi','GOPI','gopi dress','Gopi dress'] },
  { key: 'wantsKirtanClass',   label: 'Wants Kirtan Class (Y/N)', aliases: ['Wants Kirtan Class','Wants Kirtan','Kirtan Class','Kirtan','wants_kirtan_class','wants kirtan'] },
  { key: 'instrumentName',     label: 'Instrument',              aliases: ['Instrument','Instrument Name','Plays','instrument','Instrument played','Music Instrument'] },
  { key: 'familyMembers',      label: 'Total Family Members',    aliases: ['Family Members','Total Family Members','Family Size','family members','familyMembers'] },
  { key: 'familyParticipants', label: 'Family Members in Class', aliases: ['Family in Class','Family Participants','Members in Class','familyParticipants','Family Members in Class'] },
  { key: 'familyFavourable',   label: 'Favorable to Devotion',   aliases: ['Family Favourable','Family Favorable','Family','family favourable','Family Favourable?','Favorable to Devotion'] },
  { key: 'hobbies',            label: 'Hobbies & Interests',     aliases: ['Hobbies','hobbies','Hobby','HOBBIES','Hobbies & Interests'] },
  { key: 'teamName',           label: 'Team',                    aliases: ['Team','Team Wise','Team Name','TEAM','Group','team','Team wise','Teamwise'] },
  { key: 'devoteeStatus',      label: 'Devotee Status',          aliases: ['Status','Devotee Status','Dev Status','status','ETS','devotee status'] },
  { key: 'dateOfJoining',      label: 'Date of Joining',         aliases: ['Date of Joining','Date Of Joining','Joining Date','DOJ','Date of joining'] },
  { key: 'referenceBy',        label: 'Reference By',            aliases: ['Reference','Ref','Reference By','Referred By','Ref-2','ref','Ref 2','reference'] },
  { key: 'facilitator',        label: 'Facilitator',             aliases: ['Facilitator','facilitator','Faciltr'] },
  { key: 'callingBy',          label: 'Calling By',              aliases: ['Calling By','Called By','Caller','Calling by','calling by','CallingBy'] },
];

let _importRows = [], _importMode = 'add';

async function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const zone   = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  _importMode  = document.querySelector('input[name="import-mode"]:checked')?.value || 'add';
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary)"></i><p>Reading file…</p>`;
  result.classList.add('hidden');
  e.target.value = '';
  try {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellDates: false });

    // Prefer the "Re-Import (Flat)" sheet that exportDevoteeDatabase writes
    // — it has clean headers in row 1 and no team/level banner rows. If the
    // user uploads a full export, this gives a 100% lossless re-import.
    const sheetOrder = [...wb.SheetNames].sort((a, b) => {
      const isFlatA = /re.?import|flat/i.test(a) ? 0 : 1;
      const isFlatB = /re.?import|flat/i.test(b) ? 0 : 1;
      return isFlatA - isFlatB;
    });

    let allRows = [];
    let usedFlat = false;
    for (const sheetName of sheetOrder) {
      if (sheetName.toLowerCase().includes('instruction')) continue;
      // Once we've consumed a flat sheet, skip the formatted ones — otherwise
      // we'd double-count every devotee (once in their team sheet, once in
      // "All Teams", once in the flat sheet).
      if (usedFlat) continue;
      const ws = wb.Sheets[sheetName];
      let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) continue;

      // For complex multi-section sheets (per-team export), the real header
      // row may be several rows down. Walk down looking for a row whose keys
      // include "Name" and one of the contact columns.
      const knownCols = ['Name','name','Contact','Mobile','NAAM','Devotee Name'];
      const firstKeys = Object.keys(rows[0] || {});
      const hasHeader = firstKeys.some(k => knownCols.some(kc => k.toLowerCase() === kc.toLowerCase()));
      if (!hasHeader && rows.length > 1) {
        // Try parsing with each subsequent row as the header until one fits
        for (let off = 1; off <= 6 && off < rows.length; off++) {
          const reparsed = XLSX.utils.sheet_to_json(ws, { defval: '', range: off });
          const keys = Object.keys(reparsed[0] || {});
          if (keys.some(k => knownCols.some(kc => k.toLowerCase() === kc.toLowerCase()))) {
            rows = reparsed; break;
          }
        }
      }

      rows = rows.filter(r => {
        const nm = importCol(r, ['Name','name','Devotee Name','NAAM','Contact']);
        if (!nm) return false;
        // Filter banners + level/section labels from the formatted export
        if (/^(level|──|sr\.?\s*no|sno|s\.no|well wish|beginn|advanc|committ)/i.test(nm)) return false;
        return true;
      });

      allRows = allRows.concat(rows);
      if (/re.?import|flat/i.test(sheetName) && allRows.length) usedFlat = true;
    }

    if (!allRows.length) {
      throw new Error('No data rows found. Make sure your Excel has data rows with a Name/Contact column.');
    }

    _importRows = allRows;
    zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>
      <p>Click to browse or drag & drop Excel file</p>
      <small style="color:var(--text-muted)">Supports any column names — auto-detected</small>
      <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">`;
    showColumnMappingUI(allRows);
  } catch (err) {
    result.className = 'import-result error';
    result.innerHTML = `<strong>Import failed:</strong> ${err.message || 'Unknown error'}`;
    result.classList.remove('hidden');
    console.error('Import error', err);
    zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>
      <p>Click to browse or drag & drop Excel file</p>
      <small style="color:var(--text-muted)">Supports any column names — auto-detected</small>
      <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">`;
  }
}

function showColumnMappingUI(rows) {
  const headerSet = new Set();
  rows.forEach(r => Object.keys(r).forEach(k => { if (k && !k.startsWith('__')) headerSet.add(k); }));
  const headers = [...headerSet];

  const tbody = document.getElementById('col-mapping-body');
  tbody.innerHTML = '';

  const fieldOptions = IMPORT_FIELDS.map(f => `<option value="${f.key}">${f.label}</option>`).join('');

  headers.forEach(col => {
    let autoMatch = '';
    for (const field of IMPORT_FIELDS) {
      if (field.aliases.some(a => a.toLowerCase() === col.toString().trim().toLowerCase())) {
        autoMatch = field.key;
        break;
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="excel-col" title="${col}">${col}</td>
      <td>
        <select data-col="${col}" onchange="this.classList.toggle('mapped', this.value !== '')">
          <option value="">(Ignore)</option>
          ${fieldOptions}
        </select>
      </td>`;
    tbody.appendChild(tr);

    const sel = tr.querySelector('select');
    if (autoMatch) { sel.value = autoMatch; sel.classList.add('mapped'); }
  });

  openModal('import-mapping-modal');
}

let _importColMap = {};
let _importCallingByMap = {};

async function confirmMappingImport() {
  if (!_importRows.length) return;
  const selects = document.querySelectorAll('#col-mapping-body select');
  const colMap = {};
  selects.forEach(sel => {
    if (sel.value) colMap[sel.dataset.col] = sel.value;
  });
  _importColMap = colMap;
  closeModal('import-mapping-modal');

  // Step 2: collect unique calling-by names from the file. If any of them
  // don't exactly match a system user, ask the importer to map them.
  const callingByExcelCol = Object.keys(colMap).find(c => colMap[c] === 'callingBy');
  if (!callingByExcelCol) {
    return _runImportNow();      // No calling-by column → import as-is
  }

  const excelNames = [...new Set(
    _importRows.map(r => String(r[callingByExcelCol] ?? '').trim()).filter(Boolean)
  )];
  if (!excelNames.length) return _runImportNow();

  let users = [];
  try { users = await DB.getUsersForTeam(''); } catch (_) {}
  const userByLower = {};
  users.forEach(u => { if (u.name) userByLower[u.name.trim().toLowerCase()] = u.name; });

  // Auto-match where exact (case-insensitive) match exists
  _importCallingByMap = {};
  const unmatched = [];
  excelNames.forEach(n => {
    const exact = userByLower[n.toLowerCase()];
    if (exact) _importCallingByMap[n] = exact;
    else       unmatched.push(n);
  });

  // If everything auto-matched, skip the modal
  if (!unmatched.length) return _runImportNow();

  // Render mapping rows
  const userOptions = '<option value="">— Keep Excel name as-is —</option>' +
    users.map(u => `<option value="${(u.name||'').replace(/"/g,'&quot;')}">${u.name}${u.teamName ? ' (' + u.teamName + ')' : ''}</option>`).join('');
  const tbody = document.getElementById('callingby-mapping-body');
  tbody.innerHTML = excelNames.map(n => {
    const auto = _importCallingByMap[n] || '';
    const isUnmatched = !auto;
    return `<tr>
      <td><strong>${n}</strong>${isUnmatched ? ' <span style="font-size:.7rem;color:var(--warning);font-weight:600">⚠ no match</span>' : ' <span style="font-size:.7rem;color:var(--success);font-weight:600">✓ auto</span>'}</td>
      <td>
        <select data-excel-name="${n.replace(/"/g,'&quot;')}" class="filter-select" style="width:100%">
          ${userOptions.replace(`value="${auto.replace(/"/g,'&quot;')}"`, `value="${auto.replace(/"/g,'&quot;')}" selected`)}
        </select>
      </td>
    </tr>`;
  }).join('');
  openModal('import-callingby-modal');
}

async function confirmCallingByMapping() {
  document.querySelectorAll('#callingby-mapping-body select').forEach(sel => {
    const excelName = sel.dataset.excelName;
    const sysName   = sel.value || '';
    if (sysName) _importCallingByMap[excelName] = sysName;
    else delete _importCallingByMap[excelName];   // empty → keep original Excel value
  });
  closeModal('import-callingby-modal');
  return _runImportNow();
}

async function _runImportNow() {
  const zone   = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary)"></i><p>Saving ${_importRows.length} rows…</p>`;
  result.classList.add('hidden');

  // Apply calling-by mapping to rows in-place before import
  const cbCol = Object.keys(_importColMap).find(c => _importColMap[c] === 'callingBy');
  if (cbCol && Object.keys(_importCallingByMap).length) {
    _importRows = _importRows.map(r => {
      const orig = String(r[cbCol] ?? '').trim();
      if (orig && _importCallingByMap[orig]) {
        return { ...r, [cbCol]: _importCallingByMap[orig] };
      }
      return r;
    });
  }

  try {
    const data = await importWithMapping(_importRows, _importColMap, _importMode);
    showImportReport(data, result);
    loadDevotees(); loadCallingPersonsFilter();
    showToast(`Import complete — ${data.imported} added${data.updated ? ', ' + data.updated + ' updated' : ''}`, 'success');
  } catch (err) {
    result.className = 'import-result error';
    result.innerHTML = `<strong>Import failed:</strong> ${err.message || 'Unknown error'}`;
    result.classList.remove('hidden');
    console.error('Import error', err);
  }
  zone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>
    <p>Click to browse or drag & drop Excel file</p>
    <small style="color:var(--text-muted)">Supports any column names — auto-detected</small>
    <input type="file" id="import-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">`;
  _importRows = [];
  _importColMap = {};
  _importCallingByMap = {};
}

async function importWithMapping(rows, colMap, mode = 'add') {
  function getField(row, fieldKey) {
    const excelCol = Object.keys(colMap).find(c => colMap[c] === fieldKey);
    return excelCol ? (row[excelCol] ?? '') : '';
  }

  let imported = 0, updated = 0, skipped = [], errors = [];
  const list = await DevoteeCache.all();
  // Single duplicate key = (name + mobile). Same name with a different number,
  // or same number with a different name, are NOT duplicates.
  const pairKey = (n, m) => `${(n || '').trim().toLowerCase()}|${(m || '').trim()}`;
  const pairMap = {};
  list.forEach(d => { pairMap[pairKey(d.name, d.mobile)] = { id: d.id, name: d.name }; });
  function resolveExistId(name, mobile) {
    const ex = pairMap[pairKey(name, mobile)];
    return ex ? ex.id : null;
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += 20) chunks.push(rows.slice(i, i + 20));
  let globalRow = 2;

  for (const chunk of chunks) {
    const batch = fdb.batch();
    let batchHasWrites = false;
    // Track rows queued in this batch so we ONLY count them as imported/updated
    // AFTER batch.commit() actually succeeds. Previous version incremented
    // counters before the commit, so failed commits caused the report to
    // overcount (rows shown as imported but never saved).
    const pendingImports = [];
    const pendingUpdates = [];

    chunk.forEach((row) => {
      const rowNum = globalRow++;
      let name = '', mobile = '';
      try {
        name   = String(getField(row, 'name')).trim();
        mobile = String(getField(row, 'mobile')).replace(/\D/g, '').slice(0, 10);
        if (!name) { skipped.push({ row: rowNum, name: '(blank)', mobile: mobile || '', reason: 'Name is empty' }); return; }

        const rawFamM = parseInt(getField(row, 'familyMembers'));
        const rawFamP = parseInt(getField(row, 'familyParticipants'));
        const mobileAlt = String(getField(row, 'mobileAlt')).replace(/\D/g, '').slice(0, 10);
        const payload = {
          name,
          mobile:              mobile || null,
          mobileAlt:           mobileAlt || null,
          address:             String(getField(row, 'address')) || null,
          dob:                 importDate(getField(row, 'dob')) || null,
          email:               String(getField(row, 'email')) || null,
          education:           String(getField(row, 'education')) || null,
          profession:          String(getField(row, 'profession')) || null,
          chantingRounds:      Math.abs(parseInt(getField(row, 'chantingRounds')) || 0),
          reading:             String(getField(row, 'reading')) || null,
          hearing:             String(getField(row, 'hearing')) || null,
          tilak:               importYN(getField(row, 'tilak')),
          kanthi:              importYN(getField(row, 'kanthi')),
          gopiDress:           importYN(getField(row, 'gopiDress')),
          wants_kirtan_class:  ((v) => v === 'Yes' || v === 'No' ? v : null)(getField(row, 'wantsKirtanClass') ? (importYN(getField(row, 'wantsKirtanClass')) ? 'Yes' : 'No') : ''),
          instrument_name:     String(getField(row, 'instrumentName')) || null,
          familyMembers:       isNaN(rawFamM) ? null : rawFamM,
          familyParticipants:  isNaN(rawFamP) ? null : rawFamP,
          familyFavourable:    String(getField(row, 'familyFavourable')) || null,
          hobbies:             String(getField(row, 'hobbies')) || null,
          teamName:            String(getField(row, 'teamName')) || null,
          devoteeStatus:       importStatus(getField(row, 'devoteeStatus')),
          dateOfJoining:       importDate(getField(row, 'dateOfJoining')) || null,
          referenceBy:         String(getField(row, 'referenceBy')) || null,
          facilitator:         String(getField(row, 'facilitator')) || null,
          callingBy:           String(getField(row, 'callingBy')) || null,
          isActive: true, inactivityFlag: false, updatedAt: TS(),
        };
        Object.keys(payload).forEach(k => { if (payload[k] === 'null' || payload[k] === '') payload[k] = null; });

        const existId = resolveExistId(name, mobile);

        if (existId) {
          if (mode === 'upsert') {
            batch.update(fdb.collection('devotees').doc(existId), payload);
            pendingUpdates.push({ row: rowNum, name, mobile, payload });
          } else {
            skipped.push({ row: rowNum, name, mobile: mobile || '', reason: `Duplicate — same name + mobile already exists`, payload });
          }
        } else {
          const ref = fdb.collection('devotees').doc();
          batch.set(ref, { ...payload, lifetimeAttendance: 0, createdAt: TS() });
          pairMap[pairKey(name, mobile)] = { id: ref.id, name };
          pendingImports.push({ row: rowNum, name, mobile, payload });
        }
        batchHasWrites = true;
      } catch (err) {
        errors.push({ row: rowNum, name, mobile, reason: err.message || 'Failed to build row' });
      }
    });

    if (batchHasWrites) {
      try {
        await batch.commit();
        // Commit succeeded → only NOW promote pending → imported/updated
        imported += pendingImports.length;
        updated  += pendingUpdates.length;
      } catch (commitErr) {
        // Commit failed → none of these rows actually saved. Move them to
        // errors so the report shows accurate counts and lists each failed row.
        const reason = `Save failed: ${commitErr.message || commitErr.code || 'Firestore error'}`;
        [...pendingImports, ...pendingUpdates].forEach(p => {
          errors.push({ row: p.row, name: p.name, mobile: p.mobile, reason, payload: p.payload });
        });
        // Roll back the pairMap so duplicates aren't accidentally suppressed
        pendingImports.forEach(p => { delete pairMap[pairKey(p.name, p.mobile)]; });
      }
    }
  }

  DevoteeCache.bust();
  return { imported, updated, skipped, errors };
}

let _lastSkipReport = [];

function showImportReport(data, resultEl) {
  // Errors = rows that FAILED to save (data loss). Skipped = intentional
  // (duplicates, blank names). User needs to clearly see the difference so
  // they know if they actually lost data vs. just had duplicates.
  const errors  = data.errors  || [];
  const skipped = data.skipped || [];
  const allIssues = [...errors, ...skipped];
  _lastSkipReport = allIssues;

  const updLine = data.updated ? ` &nbsp;|&nbsp; Updated: <b>${data.updated}</b>` : '';
  const errCount  = errors.length;
  const skipCount = skipped.length;
  const totalIssues = allIssues.length;
  const forceableCount = allIssues.filter(s => s.payload).length;

  // Big red banner if any rows actually failed to save (data loss).
  let html = '';
  if (errCount > 0) {
    html += `<div style="background:#ffebee;border:2px solid #c62828;border-radius:6px;padding:.7rem .9rem;margin-bottom:.6rem;font-size:.88rem">
      <div style="font-weight:700;color:#c62828;margin-bottom:.2rem">
        <i class="fas fa-exclamation-triangle"></i> ${errCount} row${errCount > 1 ? 's' : ''} FAILED to save
      </div>
      <div style="font-size:.78rem;color:#5d4037">
        These rows are <strong>not in the database</strong>. Review the issues below and use "Add Anyway" or fix the Excel and re-import.
      </div>
    </div>`;
  }

  html += `<div style="margin-bottom:.5rem">
    ✅ Added: <b>${data.imported}</b>${updLine}
    &nbsp;|&nbsp; ${errCount > 0 ? `❌ Failed: <b style="color:#c62828">${errCount}</b> &nbsp;|&nbsp;` : ''}
    ⚠️ Skipped (duplicates): <b>${skipCount}</b>
  </div>`;
  // Use this combined count for the rest of the rendering logic below.
  const allSkipped = allIssues;

  if (totalIssues > 0) {
    // Errors are sorted FIRST so the user sees real failures before duplicates.
    const errorSet = new Set(errors);
    const sortedIssues = [...errors, ...skipped];
    _lastSkipReport = sortedIssues; // keep in same order as table for force-add indexing
    html += `<details open style="margin-top:.4rem">
      <summary style="cursor:pointer;font-weight:600;font-size:.83rem;color:var(--danger)">
        ${totalIssues} issue${totalIssues > 1 ? 's' : ''} — click to review ▾
      </summary>
      <div style="max-height:260px;overflow-y:auto;margin-top:.4rem">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem" id="skip-report-table">
          <thead><tr style="background:var(--primary);color:#fff">
            <th style="padding:.3rem .5rem;text-align:left">Row</th>
            <th style="padding:.3rem .5rem;text-align:left">Type</th>
            <th style="padding:.3rem .5rem;text-align:left">Name</th>
            <th style="padding:.3rem .5rem;text-align:left">Mobile</th>
            <th style="padding:.3rem .5rem;text-align:left">Issue</th>
            <th style="padding:.3rem .5rem;text-align:center">Action</th>
          </tr></thead>
          <tbody>
            ${sortedIssues.map((s, i) => {
              const isErr = errorSet.has(s);
              const rowBg = isErr ? '#ffebee' : (i%2?'#fff':'#fafafa');
              const typeBadge = isErr
                ? '<span style="background:#c62828;color:#fff;padding:.05rem .4rem;border-radius:3px;font-size:.7rem;font-weight:700">FAILED</span>'
                : '<span style="background:#f9a825;color:#fff;padding:.05rem .4rem;border-radius:3px;font-size:.7rem;font-weight:700">DUPLICATE</span>';
              return `<tr id="skip-row-${i}" style="background:${rowBg}">
              <td style="padding:.25rem .5rem;color:var(--text-muted)">${s.row}</td>
              <td style="padding:.25rem .5rem">${typeBadge}</td>
              <td style="padding:.25rem .5rem;font-weight:600">${s.name || ''}</td>
              <td style="padding:.25rem .5rem">${s.mobile || ''}</td>
              <td style="padding:.25rem .5rem;color:var(--danger);font-size:.75rem">${s.reason}</td>
              <td style="padding:.25rem .5rem;text-align:center">
                ${s.payload
                  ? `<button onclick="forceAddSkipped(${i})" id="force-btn-${i}"
                       style="font-size:.72rem;padding:.2rem .55rem;background:#e8f5e9;color:#1b5e20;border:1px solid #a5d6a7;border-radius:4px;cursor:pointer;white-space:nowrap">
                       <i class="fas fa-plus-circle"></i> Add Anyway
                     </button>`
                  : `<span style="color:var(--text-muted);font-size:.72rem">—</span>`}
              </td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">
        ${forceableCount > 1
          ? `<button class="btn btn-secondary" style="font-size:.8rem;padding:.35rem .75rem;background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7"
               onclick="forceAddAllSkipped()">
               <i class="fas fa-layer-plus"></i> Add All ${forceableCount} Anyway
             </button>`
          : ''}
        <button class="btn btn-secondary" style="font-size:.8rem;padding:.35rem .75rem"
          onclick="downloadSkipReport()"><i class="fas fa-download"></i> Download Skip Report (.xlsx)</button>
      </div>
    </details>`;
  }

  // Background: red if any actual failures, yellow if just duplicates, green if clean.
  resultEl.className = (errCount > 0 || skipCount > 0) ? 'import-result' : 'import-result success';
  resultEl.style.cssText = errCount > 0
    ? 'background:#ffebee;border:2px solid #c62828;color:#5d4037'
    : skipCount > 0
      ? 'background:#fff8e1;border:1.5px solid #f9a825;color:#5d4037'
      : '';
  resultEl.innerHTML = html;
  resultEl.classList.remove('hidden');
}

async function forceAddSkipped(index) {
  const item = _lastSkipReport[index];
  if (!item || !item.payload) return;
  const btn = document.getElementById(`force-btn-${index}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner"></i>'; }
  try {
    await fdb.collection('devotees').add({ ...item.payload, lifetimeAttendance: 0, createdAt: TS() });
    DevoteeCache.bust();
    const row = document.getElementById(`skip-row-${index}`);
    if (row) { row.style.background = '#e8f5e9'; row.style.opacity = '.7'; }
    if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Added'; btn.style.background = '#c8e6c9'; }
    showToast(`"${item.name}" added!`, 'success');
    loadDevotees?.();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Anyway'; }
    showToast('Failed: ' + (e.message || 'Error'), 'error');
  }
}

async function forceAddAllSkipped() {
  const forceable = _lastSkipReport.map((s, i) => ({ ...s, _idx: i })).filter(s => s.payload);
  if (!forceable.length) return;
  showToast(`Adding ${forceable.length} rows…`);
  let done = 0;
  for (const item of forceable) {
    try {
      const btn = document.getElementById(`force-btn-${item._idx}`);
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner"></i>'; }
      await fdb.collection('devotees').add({ ...item.payload, lifetimeAttendance: 0, createdAt: TS() });
      done++;
      const row = document.getElementById(`skip-row-${item._idx}`);
      if (row) { row.style.background = '#e8f5e9'; row.style.opacity = '.7'; }
      if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> Added'; btn.style.background = '#c8e6c9'; }
    } catch(e) { /* skip errors silently */ }
  }
  DevoteeCache.bust();
  loadDevotees?.();
  showToast(`${done} rows added!`, 'success');
}

function downloadSkipReport() {
  if (!_lastSkipReport.length) return;
  const ws = XLSX.utils.aoa_to_sheet([
    ['Row #', 'Type', 'Name', 'Mobile', 'Reason'],
    ..._lastSkipReport.map(s => [
      s.row,
      // "Save failed:" prefix is set when a batch.commit() fails — that's a real
      // data-loss issue. Anything else is a duplicate-skip.
      /^Save failed/i.test(s.reason || '') || /Failed to build/.test(s.reason || '') ? 'FAILED' : 'DUPLICATE',
      s.name || '',
      s.mobile || '',
      s.reason,
    ])
  ]);
  ws['!cols'] = [{ wch: 6 }, { wch: 11 }, { wch: 30 }, { wch: 14 }, { wch: 55 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Skipped Rows');
  XLSX.writeFile(wb, `import_skip_report_${getToday()}.xlsx`);
}

// ══ MONTHLY ATTENDANCE SHEET ══════════════════════════════════
// One sheet, all teams A–Z. Each team gets a distinct base color;
// within a team each calling coordinator gets a lighter/darker shade.
// New devotees (created this month) get a yellow highlight on their name cell.
// Columns: Sno | Name | Mobile | Calling By | [CS | AT per session] | Total AT
const _MONTHLY_TEAM_PALETTES = {
  'Champaklata': ['C8E6C9','A5D6A7','81C784','66BB6A','4CAF50','388E3C'],
  'Chitralekha': ['BBDEFB','90CAF9','64B5F6','42A5F5','1E88E5','1565C0'],
  'Indulekha':   ['E1BEE7','CE93D8','BA68C8','AB47BC','8E24AA','6A1B9A'],
  'Lalita':      ['FFE0B2','FFCC80','FFB74D','FFA726','FB8C00','E65100'],
  'Nilachal':    ['B2EBF2','80DEEA','4DD0E1','26C6DA','00ACC1','00838F'],
  'Other':       ['F5F5F5','EEEEEE','E0E0E0','BDBDBD','9E9E9E','757575'],
  'Rangadevi':   ['F8BBD0','F48FB1','F06292','EC407A','D81B60','AD1457'],
  'Sudevi':      ['FFF9C4','FFF59D','FFF176','FFEE58','FDD835','F9A825'],
  'Tungavidya':  ['FFCDD2','EF9A9A','E57373','EF5350','E53935','B71C1C'],
  'Vishakha':    ['C5CAE9','9FA8DA','7986CB','5C6BC0','3949AB','283593'],
};

function _monthBounds(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2,'0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end   = `${y}-${String(m).padStart(2,'0')}-${lastDay}`;
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevLastDay = new Date(prevY, prevM, 0).getDate();
  const prevStart = `${prevY}-${String(prevM).padStart(2,'0')}-01`;
  const prevEnd   = `${prevY}-${String(prevM).padStart(2,'0')}-${prevLastDay}`;
  const label = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  return { start, end, prevStart, prevEnd, label, y, m };
}

function _shiftDay(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function _fmtShort(dateStr) {
  if (!dateStr) return '';
  const [,m,d] = dateStr.split('-');
  return `${d}.${m}`;
}

// ── FY bounds helper ─────────────────────────────────
function _fyBounds(fyStartYear) {
  const y = parseInt(fyStartYear);
  return {
    start:     `${y}-04-01`,
    end:       `${y+1}-03-31`,
    prevStart: `${y-1}-04-01`,
    prevEnd:   `${y}-03-31`,
    label:     `FY ${y}-${String(y+1).slice(-2)}`,
  };
}

// ── Shared attendance-sheet builder ──────────────────
// bounds: { start, end, label }
// newSince: cutoff date string — devotees created on/after this are highlighted yellow
async function _doExportAttSheet(bounds, newSince, filename) {
  const XS = _xls();

  const sessSnap = await fdb.collection('sessions')
    .where('sessionDate', '>=', bounds.start)
    .where('sessionDate', '<=', bounds.end)
    .orderBy('sessionDate', 'asc').get();
  const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!sessions.length) { showToast('No sessions found for that period', 'error'); return; }

  const [atSnaps, csSnaps] = await Promise.all([
    Promise.all(sessions.map(s => fdb.collection('attendanceRecords').where('sessionId', '==', s.id).get())),
    Promise.all(sessions.map(s => fdb.collection('callingStatus').where('weekDate', '==', _shiftDay(s.sessionDate, -1)).get())),
  ]);

  const attMap = {};
  sessions.forEach((s, i) => { attMap[s.id] = new Set(atSnaps[i].docs.map(d => d.data().devoteeId)); });
  const csMap = {};
  sessions.forEach((s, i) => {
    const wd = _shiftDay(s.sessionDate, -1);
    csMap[wd] = {};
    csSnaps[i].docs.forEach(d => { csMap[wd][d.data().devoteeId] = d.data(); });
  });

  const allDevotees = await DevoteeCache.all();
  const devotees = allDevotees
    .filter(d => d.isActive !== false && !d.isNotInterested && d.callingMode !== 'not_interested')
    .sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || (a.name || '').localeCompare(b.name || ''));

  const newSinceDate = new Date(newSince);
  const newInPeriod = new Set(devotees
    .filter(d => d.createdAt && (d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt)) >= newSinceDate)
    .map(d => d.id));

  const coordShadeIdx = {};
  TEAMS.forEach(team => {
    const coords = [...new Set(devotees.filter(d => d.teamName === team).map(d => d.callingBy || ''))];
    coordShadeIdx[team] = {};
    coords.forEach((c, i) => { coordShadeIdx[team][c] = i; });
  });

  const hdrStyle  = XS.hdr();
  const hdrStyle2 = XS.hdr('166534');
  const FIXED_COLS = 6;
  const colWidths = [{ wch: 4 }, { wch: 24 }, { wch: 13 }, { wch: 4 }, { wch: 20 }, { wch: 20 }];
  sessions.forEach(() => { colWidths.push({ wch: 9 }, { wch: 4 }); });
  colWidths.push({ wch: 7 });

  const hdr1 = ['Sno', 'Name', 'Mobile', 'CR', 'Reference', 'Calling By'];
  const hdr2 = ['', '', '', '', '', ''];
  const hdr3 = ['', '', '', '', '', ''];
  sessions.forEach(s => {
    hdr1.push(_fmtShort(s.sessionDate), '');
    hdr2.push(s.topic ? s.topic.slice(0, 18) : '', '');
    hdr3.push('CS', 'AT');
  });
  hdr1.push('Total'); hdr2.push('AT'); hdr3.push('');

  const dataRows = [];
  const styleMatrix = [
    hdr1.map(() => hdrStyle),
    hdr2.map(() => hdrStyle2),
    hdr3.map((v, i) => i < FIXED_COLS ? hdrStyle : XS.hdr('0D4728')),
  ];

  let sno = 1;
  let currentTeam = null;

  devotees.forEach(d => {
    const team = d.teamName || 'Other';
    const palette = _MONTHLY_TEAM_PALETTES[team] || _MONTHLY_TEAM_PALETTES['Other'];
    const shadeIdx = Math.min((coordShadeIdx[team]?.[d.callingBy || ''] || 0), palette.length - 1);
    const teamColor = palette[shadeIdx];
    const isNew = newInPeriod.has(d.id);

    if (team !== currentTeam) {
      currentTeam = team;
      const sepRow = [{ v: team, s: XS.hdr('2E7D32') }];
      for (let c = 1; c < hdr1.length; c++) sepRow.push({ v: '', s: XS.hdr('2E7D32') });
      dataRows.push(sepRow);
      styleMatrix.push(sepRow.map(c => c.s));
    }

    const baseStyle = XS.cell({ bg: teamColor });
    const nameStyle = isNew ? XS.cell({ bg: 'FFF176', bold: true }) : XS.cell({ bg: teamColor, bold: true });

    const row = [
      { v: sno++, s: baseStyle },
      { v: d.name || '', s: nameStyle },
      { v: d.mobile || '', s: baseStyle },
      { v: d.chantingRounds || 0, s: baseStyle },
      { v: d.referenceBy || '', s: baseStyle },
      { v: d.callingBy || '', s: baseStyle },
    ];
    const rowStyles = [baseStyle, nameStyle, baseStyle, baseStyle, baseStyle, baseStyle];

    let totalAT = 0;
    sessions.forEach(s => {
      const wd = _shiftDay(s.sessionDate, -1);
      const cs = csMap[wd]?.[d.id];
      const attended = attMap[s.id]?.has(d.id);
      if (attended) totalAT++;
      const csText = cs ? (cs.comingStatus || '') : '';
      const csStyle = XS.cell({ bg: cs ? (cs.comingStatus === 'Yes' ? 'C8E6C9' : cs.comingStatus === 'No' ? 'FFCDD2' : teamColor) : 'F5F5F5' });
      const atStyle = XS.cell({ bg: attended ? 'A5D6A7' : 'F5F5F5', bold: attended });
      row.push({ v: csText, s: csStyle }, { v: attended ? 'P' : '', s: atStyle });
      rowStyles.push(csStyle, atStyle);
    });

    const totalStyle = XS.cell({ bg: totalAT >= 3 ? 'B2EBF2' : totalAT >= 1 ? 'C8E6C9' : 'F5F5F5', bold: totalAT > 0 });
    row.push({ v: totalAT, s: totalStyle });
    rowStyles.push(totalStyle);
    dataRows.push(row);
    styleMatrix.push(rowStyles);
  });

  const allRows = [hdr1, hdr2, hdr3, ...dataRows];
  const ws = {};
  let maxC = 0;
  allRows.forEach((row, r) => {
    row.forEach((val, c) => {
      maxC = Math.max(maxC, c);
      const addr = XLSX.utils.encode_cell({ r, c });
      if (val && typeof val === 'object' && 'v' in val) {
        ws[addr] = { v: val.v, t: typeof val.v === 'number' ? 'n' : 's' };
        if (val.s) ws[addr].s = val.s;
      } else {
        ws[addr] = { v: val ?? '', t: typeof val === 'number' ? 'n' : 's' };
      }
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: allRows.length - 1, c: maxC } });
  ws['!cols'] = colWidths;
  ws['!merges'] = [];
  let mc = FIXED_COLS;
  sessions.forEach(() => {
    ws['!merges'].push({ s: { r: 0, c: mc }, e: { r: 0, c: mc + 1 } });
    ws['!merges'].push({ s: { r: 1, c: mc }, e: { r: 1, c: mc + 1 } });
    mc += 2;
  });
  for (let c = 0; c < FIXED_COLS; c++) ws['!merges'].push({ s: { r: 0, c }, e: { r: 2, c } });
  ws['!merges'].push({ s: { r: 0, c: mc }, e: { r: 1, c: mc } });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, bounds.label.replace(/[:\\/?*[\]]/g, '').slice(0, 31));
  XLSX.writeFile(wb, filename);
  showToast('Downloaded!', 'success');
}

// ── Shared overall-report builder ────────────────────
async function _doExportOverallReport(bounds, prevBounds, prevLabel, filename) {
  const XS = _xls();

  const [sessSnap, prevSessSnap, allDevotees, books, services, regs, donations] = await Promise.all([
    fdb.collection('sessions').where('sessionDate', '>=', bounds.start).where('sessionDate', '<=', bounds.end).orderBy('sessionDate', 'asc').get(),
    fdb.collection('sessions').where('sessionDate', '>=', prevBounds.start).where('sessionDate', '<=', prevBounds.end).orderBy('sessionDate', 'asc').get(),
    DevoteeCache.all(),
    DB.getBookDistributions({ startDate: bounds.start, endDate: bounds.end }),
    DB.getServices(         { startDate: bounds.start, endDate: bounds.end }),
    DB.getRegistrations(    { startDate: bounds.start, endDate: bounds.end }),
    DB.getDonations(        { startDate: bounds.start, endDate: bounds.end }),
  ]);

  const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const prevSessions = prevSessSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isCancelled);
  if (!sessions.length) { showToast('No sessions found for that period', 'error'); return; }

  const [atSnaps, prevAtSnaps] = await Promise.all([
    Promise.all(sessions.map(s => fdb.collection('attendanceRecords').where('sessionId', '==', s.id).get())),
    Promise.all(prevSessions.map(s => fdb.collection('attendanceRecords').where('sessionId', '==', s.id).get())),
  ]);

  const attMap = {};
  sessions.forEach((s, i) => { attMap[s.id] = new Set(atSnaps[i].docs.map(d => d.data().devoteeId)); });
  const prevAttMap = {};
  prevSessions.forEach((s, i) => { prevAttMap[s.id] = new Set(prevAtSnaps[i].docs.map(d => d.data().devoteeId)); });

  const thisCount = {};
  const prevCount = {};
  sessions.forEach(s => attMap[s.id].forEach(id => { thisCount[id] = (thisCount[id] || 0) + 1; }));
  prevSessions.forEach(s => prevAttMap[s.id].forEach(id => { prevCount[id] = (prevCount[id] || 0) + 1; }));

  const activeDevotees = allDevotees.filter(d => d.isActive !== false && !d.isNotInterested && d.callingMode !== 'not_interested');
  const careList = activeDevotees
    .filter(d => (prevCount[d.id] || 0) >= 1 && (thisCount[d.id] || 0) === 0)
    .sort((a, b) => (a.teamName || '').localeCompare(b.teamName || '') || (a.name || '').localeCompare(b.name || ''));

  const teamAgg = {};
  TEAMS.forEach(t => { teamAgg[t] = { books: 0, services: 0, regs: 0, donation: 0, attended: 0 }; });
  books.forEach(b => { if (teamAgg[b.teamName]) teamAgg[b.teamName].books += parseInt(b.quantity) || 0; });
  services.forEach(s => { if (teamAgg[s.teamName]) teamAgg[s.teamName].services += 1; });
  regs.forEach(r => { if (teamAgg[r.teamName]) teamAgg[r.teamName].regs += parseInt(r.count) || 1; });
  donations.forEach(d => { if (teamAgg[d.teamName]) teamAgg[d.teamName].donation += parseFloat(d.amount) || 0; });
  activeDevotees.forEach(d => { if (thisCount[d.id] && teamAgg[d.teamName]) teamAgg[d.teamName].attended += thisCount[d.id]; });

  const hdrS = XS.hdr();
  const hdrSub = XS.hdr('166534');
  const numCell = (v, bg) => ({ v, s: XS.cell({ bg, bold: !!bg }) });
  const txtCell = (v, bg) => ({ v, s: XS.cell({ bg, left: true }) });

  const sumRows = [
    [{ v: `Report – ${bounds.label}`, s: hdrS }],
    [],
    [{ v: 'SESSION ATTENDANCE', s: hdrSub }, '', '', ''],
    [{ v: 'Date', s: hdrS }, { v: 'Topic', s: hdrS }, { v: 'Cancelled?', s: hdrS }, { v: 'Attendance', s: hdrS }],
  ];
  let totalAtt = 0;
  sessions.forEach(s => {
    const count = attMap[s.id]?.size || 0;
    if (!s.isCancelled) totalAtt += count;
    sumRows.push([
      txtCell(_fmtShort(s.sessionDate)),
      txtCell(s.topic || ''),
      txtCell(s.isCancelled ? 'Yes' : ''),
      numCell(s.isCancelled ? '' : count, s.isCancelled ? 'FFCDD2' : count > 0 ? 'C8E6C9' : ''),
    ]);
  });
  sumRows.push([{ v: 'Total', s: hdrS }, '', '', numCell(totalAtt, 'B2EBF2')]);

  sumRows.push([], [{ v: 'ACTIVITIES BY TEAM', s: hdrSub }, '', '', '', '', '']);
  sumRows.push([
    { v: 'Team', s: hdrS }, { v: 'Attendance', s: hdrS }, { v: 'Books', s: hdrS },
    { v: 'Registrations', s: hdrS }, { v: 'Services', s: hdrS }, { v: 'Donations (₹)', s: hdrS },
  ]);
  TEAMS.forEach(t => {
    const a = teamAgg[t];
    sumRows.push([
      txtCell(t), numCell(a.attended || ''), numCell(a.books || ''),
      numCell(a.regs || ''), numCell(a.services || ''), numCell(a.donation || ''),
    ]);
  });
  const totals = TEAMS.reduce((acc, t) => {
    const a = teamAgg[t];
    return { att: acc.att + a.attended, books: acc.books + a.books, regs: acc.regs + a.regs, svc: acc.svc + a.services, don: acc.don + a.donation };
  }, { att: 0, books: 0, regs: 0, svc: 0, don: 0 });
  sumRows.push([
    { v: 'Grand Total', s: hdrS },
    numCell(totals.att, 'B2EBF2'), numCell(totals.books, 'B2EBF2'),
    numCell(totals.regs, 'B2EBF2'), numCell(totals.svc, 'B2EBF2'), numCell(totals.don, 'B2EBF2'),
  ]);

  const careHdr    = [{ v: `Care List – ${bounds.label}`, s: hdrS }];
  const careSubHdr = [
    { v: 'Sno', s: hdrS }, { v: 'Name', s: hdrS }, { v: 'Mobile', s: hdrS },
    { v: 'Team', s: hdrS }, { v: 'Calling By', s: hdrS },
    { v: `${prevLabel} AT`, s: hdrS }, { v: 'Note', s: hdrS },
  ];
  const careDataRows = careList.map((d, i) => [
    numCell(i + 1), txtCell(d.name), txtCell(d.mobile || ''),
    txtCell(d.teamName || ''), txtCell(d.callingBy || ''),
    numCell(prevCount[d.id] || 0, 'C8E6C9'),
    txtCell(`Regular in ${prevLabel}, absent this period`, 'FFF9C4'),
  ]);

  const wsSummary = _xlsSheet(
    sumRows.map(r => r.map(c => c && typeof c === 'object' && 'v' in c ? c : { v: c ?? '', s: null })),
    [{ wch: 10 }, { wch: 28 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]
  );
  sumRows.forEach((row, r) => row.forEach((cell, c) => {
    if (cell && typeof cell === 'object' && cell.s) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (wsSummary[addr]) wsSummary[addr].s = cell.s;
    }
  }));

  const careRows = [careHdr, careSubHdr, ...careDataRows];
  const wsCare = _xlsSheet(
    careRows.map(r => r.map(c => (c && 'v' in c) ? c : { v: c ?? '' })),
    [{ wch: 4 }, { wch: 26 }, { wch: 13 }, { wch: 14 }, { wch: 20 }, { wch: 13 }, { wch: 38 }]
  );
  careRows.forEach((row, r) => row.forEach((cell, c) => {
    if (cell?.s) { const addr = XLSX.utils.encode_cell({ r, c }); if (wsCare[addr]) wsCare[addr].s = cell.s; }
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsCare, 'Care List');
  XLSX.writeFile(wb, filename);
  showToast('Downloaded!', 'success');
}

// ── Public Monthly wrappers ───────────────────────────
async function exportMonthlyAttSheet() {
  const monthEl = document.getElementById('monthly-report-month');
  if (!monthEl?.value) { showToast('Please select a month', 'error'); return; }
  showToast('Preparing monthly attendance sheet…');
  try {
    const b = _monthBounds(monthEl.value);
    await _doExportAttSheet(b, b.start, `Monthly_Attendance_${monthEl.value}.xlsx`);
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

async function downloadOverallMonthlyReport() {
  const monthEl = document.getElementById('monthly-report-month');
  if (!monthEl?.value) { showToast('Please select a month', 'error'); return; }
  showToast('Preparing overall monthly report…');
  try {
    const b = _monthBounds(monthEl.value);
    const prevLabel = new Date(b.prevStart + 'T00:00:00').toLocaleString('default', { month: 'long', year: 'numeric' });
    await _doExportOverallReport(b, { start: b.prevStart, end: b.prevEnd }, prevLabel, `Overall_Monthly_Report_${monthEl.value}.xlsx`);
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

// ── Public FY wrappers ────────────────────────────────
async function exportFYAttSheet() {
  const fyEl = document.getElementById('fy-report-year');
  if (!fyEl?.value) { showToast('Please select a financial year', 'error'); return; }
  showToast('Preparing FY attendance sheet — this may take a moment…');
  try {
    const b = _fyBounds(fyEl.value);
    await _doExportAttSheet(b, b.start, `FY_Attendance_${b.label.replace(/\s/g,'_')}.xlsx`);
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

async function downloadFYOverallReport() {
  const fyEl = document.getElementById('fy-report-year');
  if (!fyEl?.value) { showToast('Please select a financial year', 'error'); return; }
  showToast('Preparing FY overall report…');
  try {
    const b = _fyBounds(fyEl.value);
    const prevB = _fyBounds(parseInt(fyEl.value) - 1);
    await _doExportOverallReport(b, prevB, prevB.label, `FY_Overall_Report_${b.label.replace(/\s/g,'_')}.xlsx`);
  } catch (e) { showToast('Failed: ' + (e.message || 'Error'), 'error'); }
}

