// ==========================================================================
// CHANGE HISTORY — read-only list of auditLog entries written by logChange()
// (core.js). Only the lecturer can read it (see firestore.rules).
// ==========================================================================

let entries = [];

requireAdmin(async (user, adminData) => {
  setUserChip((adminData && adminData.name) || user.email);
  await load();
});

async function load() {
  const body = document.getElementById('hs-body');
  const n = Number(document.getElementById('hs-limit').value) || 300;
  try {
    const snap = await db.collection('auditLog').orderBy('atLocal', 'desc').limit(n).get();
    entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const types = [...new Set(entries.map(e => e.action))].sort();
    const sel = document.getElementById('hs-type'), keep = sel.value;
    sel.innerHTML = '<option value="">Everything</option>' + types.map(t => `<option>${h(t)}</option>`).join('');
    if (types.includes(keep)) sel.value = keep;
    draw();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="4"><div class="empty-state">Could not load the history: ${h(e.message)}${e.code === 'permission-denied' ? ' — publish the v4 security rules (README → Upgrading to v4).' : ''}</div></td></tr>`;
  }
}

function shown() {
  const q = document.getElementById('hs-search').value.trim().toLowerCase();
  const t = document.getElementById('hs-type').value;
  return entries.filter(e => (!t || e.action === t) &&
    (!q || [e.action, e.detail, e.byName, ...(e.changes || [])].join(' ').toLowerCase().includes(q)));
}

function when(e) {
  const d = new Date(e.atLocal || 0);
  return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function draw() {
  const list = shown();
  document.getElementById('hs-body').innerHTML = list.length ? list.map(e => `<tr>
    <td class="mono nowrap">${h(when(e))}</td>
    <td><b>${h(e.action)}</b>${e.byName ? `<div class="small muted">${h(e.byName)}</div>` : ''}</td>
    <td>${h(e.detail || '')}${(e.changes || []).length ? `<details class="small"><summary>${e.changes.length} change${e.changes.length === 1 ? '' : 's'}</summary><div class="history-list">${e.changes.map(c => `<div>${h(c)}</div>`).join('')}</div></details>` : ''}</td>
    <td class="small muted">${h((e.page || '').replace('.html', ''))}</td>
  </tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">${entries.length ? 'Nothing matches your search.' : 'No changes recorded yet. From now on, every change you make is listed here.'}</div></td></tr>`;
}

document.getElementById('hs-search').addEventListener('input', draw);
document.getElementById('hs-type').addEventListener('change', draw);
document.getElementById('hs-limit').addEventListener('change', load);

document.getElementById('hs-export').addEventListener('click', () => {
  const rows = shown().map(e => ({ When: when(e), Action: e.action, Details: e.detail || '', Changes: (e.changes || []).join('\n'), By: e.byName || '', Page: e.page || '' }));
  downloadWorkbook({ 'Change History': rows }, `change-history-${localToday()}.xlsx`);
});

document.getElementById('hs-clear').addEventListener('click', async () => {
  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
  if (!confirm('Delete history entries older than one year? This cannot be undone.')) return;
  try {
    const snap = await db.collection('auditLog').where('atLocal', '<=', cutoff).get();
    await writeInBatches(snap.docs.map(d => b => b.delete(d.ref)));
    toast(`${snap.size} old entr${snap.size === 1 ? 'y' : 'ies'} deleted.`, 'info');
    await load();
  } catch (e) { toast('Could not delete: ' + e.message, 'error'); }
});
