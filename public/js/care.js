/* ══ CARE.JS – Tab 5 ══ */

async function loadCareData() {
  await Promise.all([loadAbsentDevotees(), loadReturningNewcomers(), loadInactiveDevotees()]);
}

async function loadAbsentDevotees() {
  try {
    const { absentThisWeek, absentPast2Weeks } = await DB.getCareAbsent();
    document.getElementById('absent-week-count').textContent   = absentThisWeek.length;
    document.getElementById('absent-2weeks-count').textContent = absentPast2Weeks.length;
    renderCareList('absent-week-list', absentThisWeek);
    renderCareList('absent-2weeks-list', absentPast2Weeks);
  } catch (_) {}
}

async function loadReturningNewcomers() {
  try {
    const devotees = await DB.getCareNewcomers();
    document.getElementById('newcomers-count').textContent = devotees.length;
    renderCareList('newcomers-list', devotees);
  } catch (_) {}
}

async function loadInactiveDevotees() {
  try {
    const devotees = await DB.getCareInactive();
    document.getElementById('inactive-count').textContent = devotees.length;
    renderCareList('inactive-list', devotees);
  } catch (_) {}
}

function renderCareList(containerId, devotees) {
  const c = document.getElementById(containerId);
  if (!devotees.length) { c.innerHTML = '<div style="text-align:center;padding:.75rem;color:var(--text-muted);font-size:.82rem"><i class="fas fa-check-circle" style="color:var(--success)"></i> All clear!</div>'; return; }
  c.innerHTML = devotees.map(d => `
    <div class="care-item" onclick="openProfileModal('${d.id}')" style="cursor:pointer">
      <div class="devotee-avatar" style="width:30px;height:30px;font-size:.7rem;flex-shrink:0">${initials(d.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="care-item-name">${d.name}</div>
        <div class="care-item-meta">${d.team_name || ''}${d.calling_by ? ' · ' + d.calling_by : ''}</div>
      </div>
      ${contactIcons(d.mobile)}
    </div>`).join('');
}
