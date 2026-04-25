/* ══ EXCEL.JS – Import helpers, export functions ══ */

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
    const XS = _xls();

    // ── Column categories (label, number of cols, header bg, header fg, sub-header bg)
    const CATS = [
      { label: 'Sr.No.',              cols: 1, bg: 'ECEFF1', fg: '37474F', subBg: 'CFD8DC' },
      { label: 'Personal Identity',   cols: 5, bg: 'BBDEFB', fg: '0D47A1', subBg: 'E3F2FD' },
      { label: 'Professional',        cols: 2, bg: 'E1BEE7', fg: '4A148C', subBg: 'F3E5F5' },
      { label: 'Sadhana & Practices', cols: 6, bg: 'C8E6C9', fg: '1B5E20', subBg: 'E8F5E9' },
      { label: 'Social & Family',     cols: 2, bg: 'FFE0B2', fg: 'BF360C', subBg: 'FFF3E0' },
      { label: 'Team Management',     cols: 4, bg: 'FFF9C4', fg: '5D4037', subBg: 'FFFDE7' },
    ];

    // One column header per column, in same order as CATS
    const COL_HEADERS = [
      'Sr.No.',
      'Name', 'Contact', 'D.O.B', 'Address', 'E-Mail',
      'Education', 'Profession',
      'Chanting Rounds', 'Reading', 'Hearing', 'Tilak', 'Kanthi', 'Gopi Dress',
      'Family Favourable', 'Hobbies',
      'Date of Joining', 'Status', 'Facilitator', 'Reference By',
    ];
    const TOTAL_COLS = COL_HEADERS.length; // 20

    const colWidths = [
      { wch: 6 }, { wch: 24 }, { wch: 13 }, { wch: 12 }, { wch: 30 }, { wch: 26 },
      { wch: 18 }, { wch: 18 },
      { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 8 }, { wch: 8 }, { wch: 11 },
      { wch: 18 }, { wch: 22 },
      { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
    ];

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
      const yn = (v, yes = 'Yes', no = 'No') => v ? yes : no;
      return [
        { v: i + 1,                   s: dataCell() },
        { v: d.name || '',            s: dataCell({ left: true, bold: true }) },
        { v: d.mobile || '',          s: dataCell() },
        { v: d.dob || '',             s: dataCell() },
        { v: d.address || '',         s: dataCell({ left: true, wrap: true }) },
        { v: d.email || '',           s: dataCell({ left: true }) },
        { v: d.education || '',       s: dataCell({ left: true }) },
        { v: d.profession || '',      s: dataCell({ left: true }) },
        { v: d.chantingRounds || 0,   s: dataCell({ bold: true }) },
        { v: d.reading || '',         s: dataCell() },
        { v: d.hearing || '',         s: dataCell() },
        { v: yn(d.tilak),             s: dataCell({ bg: d.tilak    ? 'C8E6C9' : 'FFCDD2' }) },
        { v: yn(d.kanthi),            s: dataCell({ bg: d.kanthi   ? 'C8E6C9' : 'FFCDD2' }) },
        { v: yn(d.gopiDress),         s: dataCell({ bg: d.gopiDress? 'C8E6C9' : 'FFCDD2' }) },
        { v: d.familyFavourable || '', s: dataCell() },
        { v: d.hobbies || '',         s: dataCell({ left: true, wrap: true }) },
        { v: d.dateOfJoining || '',   s: dataCell() },
        { v: d.devoteeStatus || '',   s: dataCell() },
        { v: d.facilitator || '',     s: dataCell() },
        { v: d.referenceBy || '',     s: dataCell() },
      ];
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

    // ── Per-team sheets
    TEAMS.forEach(team => {
      const teamDevotees = allDevotees.filter(d => d.teamName === team && d.isActive !== false);
      if (!teamDevotees.length) return;
      const rows = [], merges = [];
      appendTeamLevels(rows, merges, teamDevotees);
      const ws = _xlsSheet(rows, colWidths);
      ws['!merges'] = merges;
      ws['!rows']   = rows.map(() => ({ hpt: 18 }));
      XLSX.utils.book_append_sheet(wb, ws, team.slice(0, 31));
    });

    // ── All Teams sheet
    {
      const rows = [], merges = [];
      TEAMS.forEach(team => {
        const teamDevotees = allDevotees.filter(d => d.teamName === team && d.isActive !== false);
        if (!teamDevotees.length) return;
        // Team banner
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

    XLSX.writeFile(wb, `sakhi_sang_database_${getToday()}.xlsx`);
    showToast('Database exported!', 'success');
  } catch (e) {
    console.error(e);
    showToast('Export failed', 'error');
  }
}

// ── DOWNLOAD IMPORT TEMPLATE ──────────────────────────
function downloadImportTemplate() {
  const teams  = TEAMS;
  const statuses = ['Expected to be Serious','Serious','Most Serious'];

  const headers = [
    'Name', 'Mobile', 'Alternate Mobile', 'Address', 'DOB',
    'Date of Joining', 'Chanting Rounds', 'Kanthi', 'Gopi Dress',
    'Team', 'Status', 'Facilitator', 'Reference', 'Calling By',
    'Education', 'Email', 'Profession', 'Family Favourable', 'Reading', 'Hearing',
    'Hobbies', 'Skills', 'Tilak',
  ];
  const sample1 = [
    'Radha Kumari', '9876543210', '9811122233', 'C-12, Sector 5, Noida',
    '2000-06-15', '2023-04-02', '16', 'Yes', 'No',
    'Champaklata', 'Serious', 'Anjali Mishra Mtg', 'Priya Devi', 'Anjali Mishra Mtg',
    'B.Com', 'radha@example.com', 'Housewife', 'Yes', 'Regular', 'Daily',
    'Singing, Cooking', 'Music, Art', 'Yes',
  ];
  const sample2 = [
    'Sita Devi', '8765432109', '', 'B-4, Govind Nagar, Mathura',
    '1998-03-22', '2024-01-07', '8', 'No', 'No',
    'Lalita', 'Expected to be Serious', 'Neha Bhandari', '', 'Neha Bhandari',
    '12th Pass', '', 'Student', 'Partial', 'Occasionally', 'Occasionally',
    'Dance', 'Teaching', 'No',
  ];

  const wsData = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  wsData['!cols'] = [
    { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 13 }, { wch: 15 },
    { wch: 15 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 22 }, { wch: 22 },
    { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
  ];

  const instrRows = [
    ['SAKHI SANG – Devotee Import Template', '', ''],
    ['', '', ''],
    ['HOW TO USE:', '', ''],
    ['1. Fill your data in the "Devotees" sheet starting from Row 2 (Row 1 = headers — do not change)', '', ''],
    ['2. Delete the 2 sample rows before importing', '', ''],
    ['3. Save the file and upload it using Import Excel button', '', ''],
    ['', '', ''],
    ['COLUMN GUIDE:', 'Allowed Values / Format', 'Required?'],
    ['Name', 'Full name of devotee', 'YES (mandatory)'],
    ['Mobile', '10-digit number only, no spaces/dashes', 'Recommended'],
    ['Alternate Mobile', '10-digit number (optional — only if a 2nd number is known)', 'Optional'],
    ['Address', 'Full address', 'Optional'],
    ['DOB', 'YYYY-MM-DD  (e.g. 2000-06-15)', 'Optional'],
    ['Date of Joining', 'YYYY-MM-DD  (e.g. 2023-04-02)', 'Optional'],
    ['Chanting Rounds', 'Number between 0 and 64', 'Optional'],
    ['Kanthi', 'Yes  or  No', 'Optional'],
    ['Gopi Dress', 'Yes  or  No', 'Optional'],
    ['Team', teams.join('  |  '), 'Optional'],
    ['Status', statuses.join('  |  '), 'Optional'],
    ['Facilitator', 'Name of facilitator (must match a devotee in database)', 'Optional'],
    ['Reference', 'Name of referring devotee (must match a devotee in database)', 'Optional'],
    ['Calling By', 'Name of caller (must match a devotee in database)', 'Optional'],
    ['Education', 'e.g. 10th, 12th Pass, B.Com, M.A., PhD…', 'Optional'],
    ['Email', 'Valid email address', 'Optional'],
    ['Profession', 'e.g. Housewife, Teacher, Student, Business…', 'Optional'],
    ['Family Favourable', 'Yes  |  Partial  |  No', 'Optional'],
    ['Reading', 'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
    ['Hearing', 'None  |  Occasionally  |  Regular  |  Daily', 'Optional'],
    ['Hobbies', 'Free text — e.g. Singing, Dance, Cooking', 'Optional'],
    ['Skills', 'Free text — e.g. Teaching, Graphic Design, Music', 'Optional'],
    ['Tilak', 'Yes  or  No', 'Optional'],
    ['', '', ''],
    ['NOTE: Duplicate mobile numbers are automatically skipped during import.', '', ''],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
  wsInstr['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 14 }];

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

    let allRows = [];
    for (const sheetName of wb.SheetNames) {
      if (sheetName.toLowerCase().includes('instruction')) continue;
      const ws = wb.Sheets[sheetName];
      let rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) continue;

      const firstKeys = Object.keys(rows[0] || {});
      const knownCols = ['Name','name','Contact','Mobile','NAAM','Devotee Name'];
      const hasHeader = firstKeys.some(k => knownCols.some(kc => k.toLowerCase() === kc.toLowerCase()));
      if (!hasHeader && rows.length > 1) {
        rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: 1 });
      }

      rows = rows.filter(r => {
        const nm = importCol(r, ['Name','name','Devotee Name','NAAM','Contact']);
        if (!nm) return false;
        if (/^(level|──|sr\.?\s*no|sno|s\.no|well wish|beginn|advanc|committ)/i.test(nm)) return false;
        return true;
      });

      allRows = allRows.concat(rows);
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

async function confirmMappingImport() {
  if (!_importRows.length) return;
  const selects = document.querySelectorAll('#col-mapping-body select');
  const colMap = {};
  selects.forEach(sel => {
    if (sel.value) colMap[sel.dataset.col] = sel.value;
  });

  closeModal('import-mapping-modal');
  const zone   = document.getElementById('import-drop-zone');
  const result = document.getElementById('import-result');
  zone.innerHTML = `<i class="fas fa-spinner" style="font-size:2rem;color:var(--secondary)"></i><p>Saving ${_importRows.length} rows…</p>`;
  result.classList.add('hidden');

  try {
    const data = await importWithMapping(_importRows, colMap, _importMode);
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
}

async function importWithMapping(rows, colMap, mode = 'add') {
  function getField(row, fieldKey) {
    const excelCol = Object.keys(colMap).find(c => colMap[c] === fieldKey);
    return excelCol ? (row[excelCol] ?? '') : '';
  }

  let imported = 0, updated = 0, skipped = [], errors = [];
  const list = await DevoteeCache.all();
  const mobileMap = {}, nameMap = {};
  list.forEach(d => {
    if (d.mobile) mobileMap[d.mobile] = { id: d.id, name: d.name };
    nameMap[d.name.toLowerCase()] = { id: d.id, name: d.name };
  });

  // Resolve a matching existing doc ID.
  // Add mode: duplicate only if BOTH name AND mobile match the SAME record.
  // Upsert mode: match by name (or by both if available).
  function resolveExistId(name, mobile) {
    const byMobile = mobile ? mobileMap[mobile] : null;
    const byName   = nameMap[name.toLowerCase()];
    if (mode === 'upsert') {
      if (byMobile && byName && byMobile.id === byName.id) return byMobile.id;
      if (byName) return byName.id;
      return null;
    }
    // Add mode: true duplicate = same name AND same mobile point to same record
    if (byMobile && byName && byMobile.id === byName.id) return byMobile.id;
    return null;
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += 20) chunks.push(rows.slice(i, i + 20));
  let globalRow = 2;

  for (const chunk of chunks) {
    const batch = fdb.batch();
    let batchHasWrites = false;

    chunk.forEach((row) => {
      const rowNum = globalRow++;
      try {
        const name   = String(getField(row, 'name')).trim();
        const mobile = String(getField(row, 'mobile')).replace(/\D/g, '').slice(0, 10);
        if (!name) { skipped.push({ row: rowNum, name: '(blank)', mobile: mobile || '', reason: 'Name is empty' }); return; }

        const rawFamM = parseInt(getField(row, 'familyMembers'));
        const rawFamP = parseInt(getField(row, 'familyParticipants'));
        const payload = {
          name,
          mobile:              mobile || null,
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
            updated++;
          } else {
            const matched = nameMap[name.toLowerCase()]?.name || mobileMap[mobile]?.name || '';
            skipped.push({ row: rowNum, name, mobile: mobile || '', reason: `Duplicate — already exists as "${matched}"`, payload });
          }
        } else {
          const ref = fdb.collection('devotees').doc();
          batch.set(ref, { ...payload, lifetimeAttendance: 0, createdAt: TS() });
          if (mobile) mobileMap[mobile] = { id: ref.id, name };
          nameMap[name.toLowerCase()] = { id: ref.id, name };
          imported++;
        }
        batchHasWrites = true;
      } catch (err) {
        errors.push({ row: rowNum, name: '', mobile: '', reason: err.message });
      }
    });

    if (batchHasWrites) await batch.commit();
  }

  DevoteeCache.bust();
  return { imported, updated, skipped, errors };
}

let _lastSkipReport = [];

function showImportReport(data, resultEl) {
  const allSkipped = [...(data.skipped || []), ...(data.errors || [])];
  _lastSkipReport = allSkipped;

  const updLine = data.updated ? ` &nbsp;|&nbsp; Updated: <b>${data.updated}</b>` : '';
  const skipCount = allSkipped.length;
  const forceableCount = allSkipped.filter(s => s.payload).length;

  let html = `<div style="margin-bottom:.5rem">
    ✅ Added: <b>${data.imported}</b>${updLine} &nbsp;|&nbsp; ⚠️ Skipped: <b>${skipCount}</b>
  </div>`;

  if (skipCount > 0) {
    html += `<details open style="margin-top:.4rem">
      <summary style="cursor:pointer;font-weight:600;font-size:.83rem;color:var(--danger)">
        ${skipCount} skipped / error rows — click to review ▾
      </summary>
      <div style="max-height:260px;overflow-y:auto;margin-top:.4rem">
        <table style="width:100%;border-collapse:collapse;font-size:.78rem" id="skip-report-table">
          <thead><tr style="background:var(--primary);color:#fff">
            <th style="padding:.3rem .5rem;text-align:left">Row</th>
            <th style="padding:.3rem .5rem;text-align:left">Name</th>
            <th style="padding:.3rem .5rem;text-align:left">Mobile</th>
            <th style="padding:.3rem .5rem;text-align:left">Issue</th>
            <th style="padding:.3rem .5rem;text-align:center">Action</th>
          </tr></thead>
          <tbody>
            ${allSkipped.map((s, i) => `<tr id="skip-row-${i}" style="background:${i%2?'#fff':'#fafafa'}">
              <td style="padding:.25rem .5rem;color:var(--text-muted)">${s.row}</td>
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
            </tr>`).join('')}
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

  resultEl.className = skipCount > 0 ? 'import-result' : 'import-result success';
  resultEl.style.cssText = skipCount > 0
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
    ['Row #', 'Name', 'Mobile', 'Reason Skipped'],
    ..._lastSkipReport.map(s => [s.row, s.name || '', s.mobile || '', s.reason])
  ]);
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 55 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Skipped Rows');
  XLSX.writeFile(wb, `import_skip_report_${getToday()}.xlsx`);
}
