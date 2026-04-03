import { UltravoxSession } from './ultravox-client.js';

const BACKEND_URL = window.BACKEND_URL || 'http://localhost:8000';

// ── State ─────────────────────────────────────────────────────────────────────
let session        = null;
let excelContacts  = [];   // [{phone_number, name}] from Excel upload
let manualContacts = [];   // [{phone_number, name}] from manual entry


// ── DOM — Voice ───────────────────────────────────────────────────────────────
const btnStart      = document.getElementById('btn-start');
const btnEnd        = document.getElementById('btn-end');
const btnMute       = document.getElementById('btn-mute');
const statusDot     = document.getElementById('status-dot');
const statusLabel   = document.getElementById('status-label');
const transcriptBox = document.getElementById('transcript-box');
const errorBanner   = document.getElementById('error-banner');

// ── DOM — Excel Upload Tab ────────────────────────────────────────────────────
const excelInput          = document.getElementById('excel-input');
const uploadZone          = document.getElementById('upload-zone');
const uploadStatus        = document.getElementById('upload-status');
const btnDownloadTemplate = document.getElementById('btn-download-template');
const excelContactList    = document.getElementById('excel-contact-list');
const excelError          = document.getElementById('excel-error');
const excelResults        = document.getElementById('excel-results');
const btnExcelCall        = document.getElementById('btn-excel-call');

// ── DOM — Manual Tab ──────────────────────────────────────────────────────────
const manualNameInput    = document.getElementById('manual-name-input');
const manualPhoneInput   = document.getElementById('manual-phone-input');
const btnManualAdd       = document.getElementById('btn-manual-add');
const manualContactList  = document.getElementById('manual-contact-list');
const manualError        = document.getElementById('manual-error');
const manualResults      = document.getElementById('manual-results');
const btnManualCall      = document.getElementById('btn-manual-call');

// ═════════════════════════════════════════════════════════════════════════════
//  MOBILE SIDEBAR TOGGLE
// ═════════════════════════════════════════════════════════════════════════════

const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const hamburger      = document.getElementById('hamburger');

function openSidebar()  { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); hamburger.classList.add('open'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); hamburger.classList.remove('open'); }

hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
sidebarOverlay.addEventListener('click', closeSidebar);

// ═════════════════════════════════════════════════════════════════════════════
//  THEME TOGGLE
// ═════════════════════════════════════════════════════════════════════════════

const themeToggle = document.getElementById('theme-toggle');
const themeLabel  = document.getElementById('theme-label');

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  themeLabel.textContent = dark ? 'Light Mode' : 'Dark Mode';
}

applyTheme(localStorage.getItem('theme') === 'dark');

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  themeLabel.textContent = isDark ? 'Light Mode' : 'Dark Mode';
});

// ═════════════════════════════════════════════════════════════════════════════
//  PAGE & TAB NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const page = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    item.classList.add('active');
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) { pageEl.classList.remove('hidden'); pageEl.classList.add('active'); }
    closeSidebar();
  });
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    btn.classList.add('active');
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  VOICE CALL
// ═════════════════════════════════════════════════════════════════════════════

function normalizeStatus(raw) {
  return String(raw).toLowerCase().split('.').pop() ?? 'disconnected';
}

function setStatus(status) {
  statusDot.className = `status-dot ${status}`;
  statusLabel.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  const isLive = ['idle', 'listening', 'thinking', 'speaking'].includes(status);
  const isBusy = status === 'connecting';
  btnStart.disabled = isLive || isBusy;
  btnEnd.disabled   = !isLive;
  btnMute.disabled  = !isLive;
}

function showError(msg) { errorBanner.textContent = msg; errorBanner.classList.remove('hidden'); }
function clearError()   { errorBanner.textContent = ''; errorBanner.classList.add('hidden'); }

function renderTranscripts(transcripts) {
  if (!transcripts?.length) {
    transcriptBox.innerHTML = `
      <div class="transcript-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="36" height="36">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Transcript will appear here once the call starts</p>
      </div>`;
    return;
  }
  transcriptBox.innerHTML = '';
  for (const t of transcripts) {
    if (!t.text?.trim()) continue;
    const speaker = String(t.speaker).toLowerCase().split('.').pop();
    const msgEl  = document.createElement('div');  msgEl.className  = `message ${speaker}`;
    const roleEl = document.createElement('span'); roleEl.className = 'role'; roleEl.textContent = speaker;
    const textEl = document.createElement('span'); textEl.className = `text${t.isFinal ? '' : ' partial'}`; textEl.textContent = t.text;
    msgEl.appendChild(roleEl);
    msgEl.appendChild(textEl);
    transcriptBox.appendChild(msgEl);
  }
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}

async function startCall() {
  clearError();
  setStatus('connecting');
  try {
    const res = await fetch(`${BACKEND_URL}/call/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Backend returned ${res.status}`);
    }
    const { callId, joinUrl } = await res.json();
    console.log(`[UV] Call created — callId: ${callId}`);
    session = new UltravoxSession();
    session.addEventListener('status',      () => setStatus(normalizeStatus(session.status)));
    session.addEventListener('transcripts', () => renderTranscripts(session.transcripts));
    session.joinCall(joinUrl);
  } catch (err) {
    console.error('[UV] Failed to start call:', err);
    showError(`Failed to start call: ${err.message}`);
    setStatus('disconnected');
    session = null;
  }
}

async function endCall() {
  if (!session) return;
  try { await session.leaveCall(); } catch (_) {}
  session = null;
  setStatus('disconnected');
}

function toggleMute() {
  if (!session) return;
  session.toggleMicMute();
  const muted = session.isMicMuted;
  btnMute.classList.toggle('muted', muted);
  btnMute.title = muted ? 'Unmute' : 'Mute';
}

btnStart.addEventListener('click', startCall);
btnEnd.addEventListener('click', endCall);
btnMute.addEventListener('click', toggleMute);

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const PHONE_RE = /^(\+91|91)?\d{10}$/;

function normalizePhone(raw) {
  return raw.trim().replace(/[\s\-]/g, '');
}

function renderContactTags(contacts, container, onRemove) {
  if (contacts.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = '';
  for (const c of contacts) {
    const tag       = document.createElement('div');    tag.className = 'phone-tag';
    const label     = document.createElement('span');
    label.textContent = c.name ? `${c.name} · ${c.phone_number}` : c.phone_number;
    const removeBtn = document.createElement('button'); removeBtn.className = 'phone-tag-remove'; removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => onRemove(c));
    tag.appendChild(label);
    tag.appendChild(removeBtn);
    container.appendChild(tag);
  }
}

async function initiateCallsFor(contacts, resultsEl, errorEl, btn) {
  if (contacts.length === 0) return;
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Calling…';
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';

  try {
    const res = await fetch(`${BACKEND_URL}/outbound/calls/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    const data = await res.json();
    resultsEl.classList.remove('hidden');
    const summary = document.createElement('div');
    summary.className = 'call-result-item success';
    summary.innerHTML =
      `<span class="call-result-icon">✓</span>` +
      `<span class="call-result-number">${data.message}</span>` +
      `<span class="call-result-detail">Batch ID: ${data.batch_id}</span>`;
    resultsEl.appendChild(summary);
    btn.textContent = `${data.started} Active · ${data.queued} Queued`;
  } catch (err) {
    errorEl.textContent = `Call failed: ${err.message}`;
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Initiate Calls';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXCEL UPLOAD TAB
// ═════════════════════════════════════════════════════════════════════════════

async function parseExcelFile(file) {
  const buffer   = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array' });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  const contacts = [];
  for (const row of rows) {
    const phoneKey = Object.keys(row).find(k => k.toLowerCase().replace(/[_\s]/g, '') === 'phonenumber' || k.toLowerCase() === 'phone_numbers');
    const nameKey  = Object.keys(row).find(k => k.toLowerCase() === 'name' || k.toLowerCase() === 'names');
    if (!phoneKey) continue;
    const rawPhone = String(row[phoneKey]).trim().replace(/[\s\-]/g, '');
    if (!PHONE_RE.test(rawPhone)) continue;
    const name = nameKey ? String(row[nameKey]).trim() : '';
    contacts.push({ phone_number: rawPhone, name });
  }
  return contacts;
}

async function handleExcelFile(file) {
  excelError.classList.add('hidden');
  uploadStatus.classList.add('hidden');
  try {
    const parsed = await parseExcelFile(file);
    if (parsed.length === 0) {
      excelError.textContent = 'No valid contacts found. Ensure columns are named "name" and "phone_number".';
      excelError.classList.remove('hidden');
      return;
    }
    let added = 0;
    for (const c of parsed) {
      if (!excelContacts.find(e => e.phone_number === c.phone_number)) {
        excelContacts.push(c);
        added++;
      }
    }
    uploadStatus.textContent = `${added} contact${added !== 1 ? 's' : ''} loaded from "${file.name}"`;
    uploadStatus.classList.remove('hidden');
    renderExcelContacts();
  } catch (err) {
    excelError.textContent = `Failed to read file: ${err.message}`;
    excelError.classList.remove('hidden');
  }
}

function renderExcelContacts() {
  renderContactTags(excelContacts, excelContactList, c => {
    excelContacts = excelContacts.filter(e => e.phone_number !== c.phone_number);
    renderExcelContacts();
    btnExcelCall.disabled = excelContacts.length === 0;
  });
  btnExcelCall.disabled = excelContacts.length === 0;
}

// Download template CSV
btnDownloadTemplate.addEventListener('click', () => {
  const csv = 'name,phone_number\nRamesh Kumar,9876543210\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'contacts_template.csv'; a.click();
  URL.revokeObjectURL(url);
});

uploadZone.addEventListener('click', e => { if (e.target.tagName !== 'LABEL') excelInput.click(); });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', async e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) await handleExcelFile(file);
});
excelInput.addEventListener('change', async () => {
  const file = excelInput.files[0];
  if (file) await handleExcelFile(file);
  excelInput.value = '';
});

btnExcelCall.addEventListener('click', () => initiateCallsFor(excelContacts, excelResults, excelError, btnExcelCall));

// ═════════════════════════════════════════════════════════════════════════════
//  MANUAL TAB
// ═════════════════════════════════════════════════════════════════════════════

function validateManualForm() {
  const phone = normalizePhone(manualPhoneInput.value);
  btnManualAdd.disabled = !PHONE_RE.test(phone);
}

manualPhoneInput.addEventListener('input', () => { validateManualForm(); manualError.classList.add('hidden'); });
manualNameInput.addEventListener('input', validateManualForm);
manualPhoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') addManualContact(); });

function addManualContact() {
  const phone = normalizePhone(manualPhoneInput.value);
  const name  = manualNameInput.value.trim();
  if (!PHONE_RE.test(phone)) { manualError.textContent = 'Enter a valid 10-digit number.'; manualError.classList.remove('hidden'); return; }
  if (manualContacts.find(c => c.phone_number === phone)) { manualError.textContent = `${phone} is already in the list.`; manualError.classList.remove('hidden'); return; }
  manualError.classList.add('hidden');
  manualContacts.push({ phone_number: phone, name });
  manualPhoneInput.value = '';
  manualNameInput.value  = '';
  btnManualAdd.disabled  = true;
  renderManualContacts();
}

function renderManualContacts() {
  renderContactTags(manualContacts, manualContactList, c => {
    manualContacts = manualContacts.filter(e => e.phone_number !== c.phone_number);
    renderManualContacts();
    btnManualCall.disabled = manualContacts.length === 0;
  });
  btnManualCall.disabled = manualContacts.length === 0;
}

btnManualAdd.addEventListener('click', addManualContact);
btnManualCall.addEventListener('click', () => initiateCallsFor(manualContacts, manualResults, manualError, btnManualCall));

// ═════════════════════════════════════════════════════════════════════════════
//  LOGS
// ═════════════════════════════════════════════════════════════════════════════

const logsLoading    = document.getElementById('logs-loading');
const logsEmpty      = document.getElementById('logs-empty');
const logsError      = document.getElementById('logs-error');
const logsTableWrap  = document.getElementById('logs-table-wrap');
const logsTbody      = document.getElementById('logs-tbody');
const logsPagination = document.getElementById('logs-pagination');
const btnLogMore     = document.getElementById('btn-logs-more');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');

// Transcript modal
const drawerOverlay         = document.getElementById('drawer-overlay');
const drawerCallId          = document.getElementById('drawer-callid');
const drawerLoading         = document.getElementById('drawer-loading');
const drawerEmpty           = document.getElementById('drawer-empty');
const drawerMessages        = document.getElementById('drawer-messages');
const drawerClose           = document.getElementById('drawer-close');
const btnPlayRecording      = document.getElementById('btn-play-recording');
const btnDownloadRecording  = document.getElementById('btn-download-recording');
const recordingPlayer       = document.getElementById('recording-player');
const recordingAudio        = document.getElementById('recording-audio');
const recordingError        = document.getElementById('recording-error');

let currentTranscriptCallId = null;
let logsCursor  = null;
let logsHasMore = false;
let colResizeInit = false;
let allCalls    = [];

// ── Column resize ─────────────────────────────────────────────────────────────
function initColResize() {
  if (colResizeInit) return;
  colResizeInit = true;
  const defaults = { 'col-date': '10%', 'col-time': '8%', 'col-customer': '13%', 'col-dur': '7%', 'col-status': '8%', 'col-sentiment': '9%', 'col-takeaway': '31%', 'col-callback': '8%', 'col-action': '6%' };
  Object.entries(defaults).forEach(([id, w]) => {
    const col = document.getElementById(id);
    if (col) col.style.width = w;
  });
  const table = document.getElementById('logs-table');
  table.querySelectorAll('th').forEach((th, i, ths) => {
    if (i === ths.length - 1) return;
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    th.style.position = 'relative';
    th.appendChild(resizer);
    resizer.addEventListener('mousedown', e => {
      const startX = e.clientX, startW = th.offsetWidth;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = e => {
        const newW = Math.max(60, startW + e.clientX - startX);
        th.style.width = newW + 'px';
        const col = document.getElementById(th.dataset.col);
        if (col) col.style.width = newW + 'px';
      };
      const onUp = () => {
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  });
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTranscript(); });

// ── Helpers ───────────────────────────────────────────────────────────────────
function _formatDate(iso) {
  if (!iso) return { date: '—', time: '—' };
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  } catch (_) { return { date: iso, time: '' }; }
}

function _statusBadge(reason) {
  if (!reason) return '<span class="badge badge-other">—</span>';
  const r = reason.toLowerCase();
  if (r.includes('error') || r.includes('fail'))
    return `<span class="badge badge-error">${reason}</span>`;
  if (r === 'hangup' || r === 'hang_up')
    return `<span class="badge badge-hangup">hangup</span>`;
  return `<span class="badge badge-other">${reason}</span>`;
}

function _sentimentBadge(sentiment) {
  if (!sentiment) return '<span class="badge badge-other">—</span>';
  const cls = sentiment === 'positive' ? 'badge-positive'
            : sentiment === 'negative' ? 'badge-negative'
            : 'badge-neutral';
  return `<span class="badge ${cls}">${sentiment}</span>`;
}

function _callbackBadge(callback) {
  if (callback === null || callback === undefined) return '<span class="badge badge-other">—</span>';
  return callback
    ? '<span class="badge badge-cb-yes">Yes</span>'
    : '<span class="badge badge-cb-no">No</span>';
}

function _setLogsView(view) {
  logsLoading.classList.toggle('hidden', view !== 'loading');
  logsEmpty.classList.toggle('hidden', view !== 'empty');
  logsError.classList.toggle('hidden', view !== 'error');
  logsTableWrap.classList.toggle('hidden', view !== 'table');
}

function _escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _renderRow(call) {
  const tr = document.createElement('tr');
  const { date, time } = _formatDate(call.created);
  const customerName = call.customer_name || '—';
  const takeawayText = call.takeaway || '—';
  tr.innerHTML = `
    <td class="log-date">${date}</td>
    <td class="log-time">${time}</td>
    <td class="log-customer">${_escHtml(customerName)}</td>
    <td class="log-dur">${call.duration || '—'}</td>
    <td>${_statusBadge(call.endReason)}</td>
    <td>${_sentimentBadge(call.sentiment)}</td>
    <td class="log-takeaway" title="${_escHtml(takeawayText)}">${_escHtml(takeawayText)}</td>
    <td>${_callbackBadge(call.callback)}</td>
    <td class="td-action"><button class="btn-view">View</button></td>
  `;
  tr.querySelector('.btn-view').addEventListener('click', () => openTranscript(call.callId));
  return tr;
}

function _appendLogRows(results) {
  for (const call of results) logsTbody.appendChild(_renderRow(call));
}

// ── Filter state & logic ───────────────────────────────────────────────────────
const btnFilterLogs   = document.getElementById('btn-filter-logs');
const filterDropdown  = document.getElementById('filter-dropdown');
const filterBadge     = document.getElementById('filter-badge');
const filterDateFrom  = document.getElementById('filter-date-from');
const filterDateTo    = document.getElementById('filter-date-to');
const filterMediumSel = document.getElementById('filter-medium-select');
const btnFilterApply  = document.getElementById('btn-filter-apply');
const btnFilterClear  = document.getElementById('btn-filter-clear');
const btnExportExcel  = document.getElementById('btn-export-excel');

let activeFilters = { dateFrom: '', dateTo: '', medium: '' };

function _countActiveFilters() {
  return [activeFilters.dateFrom, activeFilters.dateTo, activeFilters.medium].filter(Boolean).length;
}
function _updateFilterBadge() {
  const n = _countActiveFilters();
  filterBadge.textContent = n;
  filterBadge.classList.toggle('hidden', n === 0);
  btnFilterLogs.classList.toggle('active', n > 0 || !filterDropdown.classList.contains('hidden'));
}
function _isFiltering() {
  return !!(activeFilters.dateFrom || activeFilters.dateTo || activeFilters.medium);
}

btnFilterLogs.addEventListener('click', () => {
  filterDropdown.classList.toggle('hidden');
  btnFilterLogs.classList.toggle('active', !filterDropdown.classList.contains('hidden') || _countActiveFilters() > 0);
});
btnFilterApply.addEventListener('click', () => {
  activeFilters.dateFrom = filterDateFrom.value;
  activeFilters.dateTo   = filterDateTo.value;
  activeFilters.medium   = filterMediumSel.value;
  _updateFilterBadge();
  loadLogs(true);
});
btnFilterClear.addEventListener('click', () => {
  filterDateFrom.value  = '';
  filterDateTo.value    = '';
  filterMediumSel.value = '';
  activeFilters = { dateFrom: '', dateTo: '', medium: '' };
  filterDropdown.classList.add('hidden');
  _updateFilterBadge();
  loadLogs(true);
});

// Export Excel
btnExportExcel.addEventListener('click', () => {
  if (!allCalls.length) return;
  const rows = [['Date', 'Time', 'Customer', 'Duration', 'Status', 'Sentiment', 'Takeaway', 'Callback']];
  for (const c of allCalls) {
    const { date, time } = _formatDate(c.created);
    rows.push([
      date,
      time,
      c.customer_name || '',
      c.duration      || '',
      c.endReason     || '',
      c.sentiment     || '',
      c.takeaway      || '',
      c.callback === true ? 'Yes' : c.callback === false ? 'No' : '',
    ]);
  }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url;
  a.download = `call_logs_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
});

// ── Load logs ─────────────────────────────────────────────────────────────────
async function loadLogs(reset = true) {
  if (reset) { logsCursor = null; allCalls = []; logsTbody.innerHTML = ''; colResizeInit = false; }
  btnRefreshLogs.classList.add('spinning');
  _setLogsView('loading');
  try {
    const filtering = _isFiltering();
    const params = new URLSearchParams({ page_size: 20 });
    if (!filtering && logsCursor)    params.set('cursor',    logsCursor);
    if (activeFilters.dateFrom)      params.set('date_from', activeFilters.dateFrom);
    if (activeFilters.dateTo)        params.set('date_to',   activeFilters.dateTo);
    if (activeFilters.medium)        params.set('medium',    activeFilters.medium);

    const res = await fetch(`${BACKEND_URL}/logs/calls?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    const data = await res.json();

    if (reset && data.results.length === 0) {
      _setLogsView('empty');
      logsPagination.classList.add('hidden');
      _updateFilterBadge();
      return;
    }
    if (filtering || reset) allCalls = data.results;
    else allCalls.push(...data.results);

    _setLogsView('table');
    if (reset || filtering) { logsTbody.innerHTML = ''; _appendLogRows(allCalls); }
    else _appendLogRows(data.results);
    initColResize();

    logsHasMore = !filtering && !!data.next;
    logsCursor  = data.next || null;
    logsPagination.classList.toggle('hidden', !logsHasMore);
    _updateFilterBadge();
  } catch (err) {
    logsError.textContent = `Failed to load logs: ${err.message}`;
    _setLogsView(logsTbody.children.length ? 'table' : 'error');
    logsError.classList.remove('hidden');
  } finally {
    btnRefreshLogs.classList.remove('spinning');
  }
}

// ── Transcript modal ──────────────────────────────────────────────────────────
function _resetRecordingPlayer() {
  recordingPlayer.classList.add('hidden');
  recordingError.classList.add('hidden');
  recordingAudio.pause();
  recordingAudio.removeAttribute('src');
  recordingAudio.load();
  btnPlayRecording.classList.remove('loading', 'playing');
}

async function openTranscript(callId) {
  currentTranscriptCallId = callId;
  drawerOverlay.classList.remove('hidden');
  drawerCallId.textContent = callId;
  drawerLoading.classList.remove('hidden');
  drawerEmpty.classList.add('hidden');
  drawerMessages.innerHTML = '';
  _resetRecordingPlayer();
  btnDownloadRecording.href = `${BACKEND_URL}/logs/calls/${encodeURIComponent(callId)}/recording?download=1`;
  btnDownloadRecording.setAttribute('download', '');
  btnDownloadRecording.classList.remove('hidden');
  try {
    const res = await fetch(`${BACKEND_URL}/logs/calls/${encodeURIComponent(callId)}/messages`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    const data = await res.json();
    drawerLoading.classList.add('hidden');
    if (!data.messages.length) { drawerEmpty.classList.remove('hidden'); return; }
    for (const msg of data.messages) {
      const msgEl  = document.createElement('div');  msgEl.className  = `message ${msg.role}`;
      const roleEl = document.createElement('span'); roleEl.className = 'role'; roleEl.textContent = msg.role;
      const textEl = document.createElement('span'); textEl.className = 'text'; textEl.textContent = msg.text;
      msgEl.appendChild(roleEl);
      msgEl.appendChild(textEl);
      drawerMessages.appendChild(msgEl);
    }
    drawerMessages.scrollTop = drawerMessages.scrollHeight;
  } catch (err) {
    drawerLoading.classList.add('hidden');
    drawerEmpty.textContent = `Error loading transcript: ${err.message}`;
    drawerEmpty.classList.remove('hidden');
  }
}

function closeTranscript() {
  drawerOverlay.classList.add('hidden');
  drawerMessages.innerHTML = '';
  drawerCallId.textContent = '';
  currentTranscriptCallId = null;
  _resetRecordingPlayer();
  btnDownloadRecording.classList.add('hidden');
  btnDownloadRecording.removeAttribute('href');
}

// ── Play Recording ────────────────────────────────────────────────────────────
btnPlayRecording.addEventListener('click', () => {
  if (!currentTranscriptCallId) return;
  if (!recordingPlayer.classList.contains('hidden')) { _resetRecordingPlayer(); return; }
  recordingPlayer.classList.remove('hidden');
  recordingError.classList.add('hidden');
  btnPlayRecording.classList.add('loading');
  recordingAudio.src = `${BACKEND_URL}/logs/calls/${encodeURIComponent(currentTranscriptCallId)}/recording`;
  recordingAudio.load();
});

recordingAudio.addEventListener('canplay',  () => { btnPlayRecording.classList.remove('loading'); btnPlayRecording.classList.add('playing'); recordingAudio.play().catch(() => {}); });
recordingAudio.addEventListener('error',    () => { btnPlayRecording.classList.remove('loading', 'playing'); recordingAudio.removeAttribute('src'); recordingError.textContent = 'Recording not available for this call.'; recordingError.classList.remove('hidden'); });
recordingAudio.addEventListener('ended',    () => { btnPlayRecording.classList.remove('playing'); });

drawerClose.addEventListener('click', closeTranscript);
drawerOverlay.addEventListener('click', e => { if (e.target === drawerOverlay) closeTranscript(); });
btnRefreshLogs.addEventListener('click', () => loadLogs(true));
btnLogMore.addEventListener('click',     () => loadLogs(false));

document.querySelectorAll('.nav-item').forEach(item => {
  if (item.dataset.page === 'logs')  item.addEventListener('click', () => loadLogs(true));
  if (item.dataset.page === 'usage') item.addEventListener('click', () => loadUsage());
});

// ═════════════════════════════════════════════════════════════════════════════
//  USAGE
// ═════════════════════════════════════════════════════════════════════════════

const usageLoading    = document.getElementById('usage-loading');
const usageMonthLabel = document.getElementById('usage-month-label');
const usagePrevBtn    = document.getElementById('usage-prev-month');
const usageNextBtn    = document.getElementById('usage-next-month');
const usageSubtitle   = document.getElementById('usage-subtitle');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let usageYear  = new Date().getFullYear();
let usageMonth = new Date().getMonth() + 1;

function _drawChart(lineId, areaId, axisId, values, color) {
  const line = document.getElementById(lineId);
  const area = document.getElementById(areaId);
  const axis = document.getElementById(axisId);
  if (!line || !area) return;
  const n = values.length;
  if (n === 0 || values.every(v => v === 0)) {
    line.setAttribute('points', `0,75 300,75`);
    area.setAttribute('points', `0,80 0,75 300,75 300,80`);
    return;
  }
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => {
    const x = n === 1 ? 150 : (i / (n - 1)) * 300;
    const y = 10 + (1 - v / max) * 65;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  line.setAttribute('stroke', color);
  line.setAttribute('points', pts.join(' '));
  area.setAttribute('points', `0,80 ${pts.join(' ')} 300,80`);
  const spans = axis.querySelectorAll('span');
  const indices = [0, Math.floor(n / 3), Math.floor(2 * n / 3), n - 1];
  indices.forEach((idx, i) => {
    if (spans[i]) {
      const d = new Date(values._dates[idx] + 'T00:00:00Z');
      spans[i].textContent = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }
  });
}

async function loadUsage() {
  usageLoading.classList.remove('hidden');
  const monthName = MONTH_NAMES[usageMonth - 1];
  usageMonthLabel.textContent = `${monthName} ${usageYear}`;
  usageSubtitle.textContent   = `Analytics for ${monthName} ${usageYear}`;
  const now = new Date();
  const isCurrentMonth = usageYear === now.getFullYear() && usageMonth === (now.getMonth() + 1);
  usageNextBtn.disabled = isCurrentMonth;
  usageNextBtn.style.opacity = isCurrentMonth ? '0.35' : '1';
  try {
    const res = await fetch(`${BACKEND_URL}/logs/usage?year=${usageYear}&month=${usageMonth}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const d = await res.json();
    document.getElementById('usage-total-calls').textContent = d.total_calls;
    document.getElementById('usage-join-rate').innerHTML     = `${d.join_rate}<span class="usage-stat-unit">%</span>`;
    document.getElementById('usage-billed-min').innerHTML    = `${d.total_billed_min}<span class="usage-stat-unit">m</span>`;
    const avgMin = d.avg_dur_secs ? (d.avg_dur_secs / 60).toFixed(1) : '0';
    document.getElementById('usage-avg-dur').innerHTML       = `${avgMin}<span class="usage-stat-unit">m</span>`;
    document.getElementById('usage-chart-calls-big').textContent = d.total_calls;
    document.getElementById('usage-chart-min-big').textContent   = `${d.total_billed_min}m`;
    const totalSecs = Math.round(d.total_billed_min * 60);
    const hrs = Math.floor(totalSecs / 3600), mins = Math.floor((totalSecs % 3600) / 60);
    document.getElementById('usage-summary-hrs').textContent   = `${hrs} hrs ${mins} min`;
    document.getElementById('usage-summary-label').textContent = `Billed Duration — ${monthName} ${usageYear}`;
    document.getElementById('usage-sum-calls').textContent     = d.total_calls;
    document.getElementById('usage-sum-min').textContent       = `${d.total_billed_min}m`;
    document.getElementById('usage-sum-avg').textContent       = avgMin + 'm';
    const daysTotal   = d.days_in_month;
    const daysElapsed = isCurrentMonth ? now.getDate() : daysTotal;
    const pct = Math.round((daysElapsed / daysTotal) * 100);
    document.getElementById('usage-days-bar').style.width    = `${pct}%`;
    document.getElementById('usage-days-caption').textContent =
      isCurrentMonth ? `${daysElapsed} of ${daysTotal} days elapsed this month` : `${monthName} ${usageYear} — full month`;
    const callVals = d.daily.map(x => x.calls);
    const minVals  = d.daily.map(x => x.billed_min);
    callVals._dates = d.daily.map(x => x.date);
    minVals._dates  = d.daily.map(x => x.date);
    _drawChart('usage-calls-line', 'usage-calls-area', 'usage-calls-axis', callVals, '#C8A951');
    _drawChart('usage-min-line',   'usage-min-area',   'usage-min-axis',   minVals,  '#C8A951');
  } catch (err) {
    document.getElementById('usage-summary-hrs').textContent = 'Error loading data';
    console.error('Usage load error:', err);
  } finally {
    usageLoading.classList.add('hidden');
  }
}

usagePrevBtn.addEventListener('click', () => { usageMonth--; if (usageMonth < 1) { usageMonth = 12; usageYear--; } loadUsage(); });
usageNextBtn.addEventListener('click', () => {
  const now = new Date();
  if (usageYear === now.getFullYear() && usageMonth === now.getMonth() + 1) return;
  usageMonth++;
  if (usageMonth > 12) { usageMonth = 1; usageYear++; }
  loadUsage();
});

// ── Init ──────────────────────────────────────────────────────────────────────
setStatus('disconnected');
