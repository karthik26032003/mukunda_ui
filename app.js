import { UltravoxSession } from './ultravox-client.js';

const BACKEND_URL = window.BACKEND_URL || 'http://localhost:8000';

// ── State ─────────────────────────────────────────────────────────────────────
let session      = null;
let phoneNumbers = [];


// ── DOM — Voice ───────────────────────────────────────────────────────────────
const btnStart      = document.getElementById('btn-start');
const btnEnd        = document.getElementById('btn-end');
const btnMute       = document.getElementById('btn-mute');
const statusDot     = document.getElementById('status-dot');
const statusLabel   = document.getElementById('status-label');
const transcriptBox = document.getElementById('transcript-box');
const errorBanner   = document.getElementById('error-banner');

// ── DOM — Outbound ────────────────────────────────────────────────────────────
const phoneInput    = document.getElementById('phone-input');
const btnAddNumber  = document.getElementById('btn-add-number');
const phoneList     = document.getElementById('phone-list');
const btnCall       = document.getElementById('btn-call');
const outboundError = document.getElementById('outbound-error');
const callResults   = document.getElementById('call-results');
const excelInput    = document.getElementById('excel-input');
const uploadZone    = document.getElementById('upload-zone');
const uploadStatus  = document.getElementById('upload-status');

// ═════════════════════════════════════════════════════════════════════════════
//  MOBILE SIDEBAR TOGGLE
// ═════════════════════════════════════════════════════════════════════════════

const sidebar         = document.getElementById('sidebar');
const sidebarOverlay  = document.getElementById('sidebar-overlay');
const hamburger       = document.getElementById('hamburger');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  hamburger.classList.add('open');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
  hamburger.classList.remove('open');
}

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

// Restore saved preference
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

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
}
function clearError() {
  errorBanner.textContent = '';
  errorBanner.classList.add('hidden');
}

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
//  EXCEL PARSING
// ═════════════════════════════════════════════════════════════════════════════

const E164_RE = /^\+\d{7,15}$/;

async function parseExcelFile(file) {
  const buffer   = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array' });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const numbers = [];
  for (const row of rows) {
    const key = Object.keys(row).find(k => k.toLowerCase() === 'phone_numbers');
    if (!key) continue;
    const val = String(row[key]).trim().replace(/[\s\-]/g, '');
    if (E164_RE.test(val)) numbers.push(val);
  }
  return numbers;
}

async function handleExcelFile(file) {
  clearOutboundError();
  uploadStatus.classList.add('hidden');
  try {
    const numbers = await parseExcelFile(file);
    if (numbers.length === 0) {
      showOutboundError('No valid numbers found. Ensure the column is named "phone_numbers" with E.164 format (+91...).');
      return;
    }
    let added = 0;
    for (const n of numbers) {
      if (!phoneNumbers.includes(n)) { phoneNumbers.push(n); added++; }
    }
    uploadStatus.textContent = `${added} number${added !== 1 ? 's' : ''} loaded from "${file.name}"`;
    uploadStatus.classList.remove('hidden');
    renderPhoneList();
  } catch (err) {
    showOutboundError(`Failed to read file: ${err.message}`);
  }
}

// Click on zone (but not on the label — label opens file dialog natively)
uploadZone.addEventListener('click', e => {
  if (e.target.tagName !== 'LABEL') excelInput.click();
});

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

// ═════════════════════════════════════════════════════════════════════════════
//  MANUAL NUMBER ENTRY
// ═════════════════════════════════════════════════════════════════════════════

phoneInput.addEventListener('input', () => {
  const val = phoneInput.value.trim().replace(/[\s\-]/g, '');
  btnAddNumber.disabled = !E164_RE.test(val);
  clearOutboundError();
});
phoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') addNumber(); });
btnAddNumber.addEventListener('click', addNumber);

function addNumber() {
  const val = phoneInput.value.trim().replace(/[\s\-]/g, '');
  if (!E164_RE.test(val)) { showOutboundError('Enter a valid E.164 number, e.g. +919876543210'); return; }
  if (phoneNumbers.includes(val)) { showOutboundError(`${val} is already in the list.`); return; }
  clearOutboundError();
  phoneNumbers.push(val);
  phoneInput.value = '';
  btnAddNumber.disabled = true;
  renderPhoneList();
}

function removeNumber(num) {
  phoneNumbers = phoneNumbers.filter(n => n !== num);
  renderPhoneList();
}

function renderPhoneList() {
  if (phoneNumbers.length === 0) {
    phoneList.classList.add('hidden');
    phoneList.innerHTML = '';
    btnCall.disabled = true;
    return;
  }
  phoneList.classList.remove('hidden');
  phoneList.innerHTML = '';
  for (const num of phoneNumbers) {
    const tag       = document.createElement('div');    tag.className = 'phone-tag';
    const numSpan   = document.createElement('span');   numSpan.textContent = num;
    const removeBtn = document.createElement('button'); removeBtn.className = 'phone-tag-remove'; removeBtn.textContent = '×'; removeBtn.title = `Remove ${num}`;
    removeBtn.addEventListener('click', () => removeNumber(num));
    tag.appendChild(numSpan);
    tag.appendChild(removeBtn);
    phoneList.appendChild(tag);
  }
  btnCall.disabled = false;
}

// ── Outbound error helpers ────────────────────────────────────────────────────
function showOutboundError(msg) { outboundError.textContent = msg; outboundError.classList.remove('hidden'); }
function clearOutboundError()   { outboundError.textContent = ''; outboundError.classList.add('hidden'); }

// ═════════════════════════════════════════════════════════════════════════════
//  BATCH OUTBOUND CALL
// ═════════════════════════════════════════════════════════════════════════════

async function initiateOutboundCall() {
  if (phoneNumbers.length === 0) return;
  clearOutboundError();
  btnCall.disabled = true;
  btnCall.textContent = 'Calling…';
  callResults.classList.add('hidden');
  callResults.innerHTML = '';

  try {
    const res = await fetch(`${BACKEND_URL}/outbound/calls/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_numbers: phoneNumbers }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    const data = await res.json();
    callResults.classList.remove('hidden');

    for (const r of data.results) {
      const item   = document.createElement('div');  item.className = `call-result-item ${r.success ? 'success' : 'failure'}`;
      const icon   = document.createElement('span'); icon.className = 'call-result-icon';   icon.textContent = r.success ? '✓' : '✗';
      const num    = document.createElement('span'); num.className  = 'call-result-number'; num.textContent  = r.phone_number;
      const detail = document.createElement('span'); detail.className = 'call-result-detail'; detail.textContent = r.success ? `ID: ${r.callId}` : r.error;
      item.appendChild(icon); item.appendChild(num); item.appendChild(detail);
      callResults.appendChild(item);
    }
    btnCall.textContent = `${data.succeeded}/${data.total} Calls Placed`;
  } catch (err) {
    showOutboundError(`Call failed: ${err.message}`);
    btnCall.disabled = false;
    btnCall.textContent = 'Initiate Calls';
  }
}

btnCall.addEventListener('click', initiateOutboundCall);

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
const summaryPopup   = document.getElementById('summary-popup');

// Transcript modal
const drawerOverlay      = document.getElementById('drawer-overlay');
const drawerCallId       = document.getElementById('drawer-callid');
const drawerLoading      = document.getElementById('drawer-loading');
const drawerEmpty        = document.getElementById('drawer-empty');
const drawerMessages     = document.getElementById('drawer-messages');
const drawerClose        = document.getElementById('drawer-close');
const btnPlayRecording   = document.getElementById('btn-play-recording');
const recordingPlayer    = document.getElementById('recording-player');
const recordingAudio     = document.getElementById('recording-audio');
const recordingError     = document.getElementById('recording-error');

let currentTranscriptCallId = null;  // call ID currently shown in the modal

let logsCursor  = null;
let logsHasMore = false;
let colResizeInit = false;
let allCalls    = [];   // full loaded dataset for client-side filtering

// ── Column resize ─────────────────────────────────────────────────────────────
function initColResize() {
  if (colResizeInit) return;
  colResizeInit = true;

  // Percentage-based initial widths so View column is always proportionally placed
  const defaults = { 'col-date': '16%', 'col-dur': '9%', 'col-medium': '9%', 'col-reason': '10%', 'col-summary': '50%', 'col-action': '6%' };
  Object.entries(defaults).forEach(([id, w]) => {
    const col = document.getElementById(id);
    if (col) col.style.width = w;
  });

  const table = document.getElementById('logs-table');
  table.querySelectorAll('th').forEach((th, i, ths) => {
    if (i === ths.length - 1) return; // no resizer on last (action) col
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    th.style.position = 'relative';
    th.appendChild(resizer);

    resizer.addEventListener('mousedown', e => {
      const startX   = e.clientX;
      const startW   = th.offsetWidth;
      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = e => {
        const newW = Math.max(60, startW + e.clientX - startX);
        th.style.width = newW + 'px';
        // mirror onto the corresponding <col>
        const colId = th.dataset.col;
        if (colId) { const col = document.getElementById(colId); if (col) col.style.width = newW + 'px'; }
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

// ── Summary popup ─────────────────────────────────────────────────────────────
function showSummaryPopup(td, fullText) {
  summaryPopup.textContent = fullText;
  summaryPopup.classList.remove('hidden');
  const rect = td.getBoundingClientRect();
  let top  = rect.bottom + 6;
  let left = rect.left;
  // keep within viewport
  if (left + 360 > window.innerWidth)  left = window.innerWidth - 370;
  if (top + 160  > window.innerHeight) top  = rect.top - summaryPopup.offsetHeight - 6;
  summaryPopup.style.top  = top  + 'px';
  summaryPopup.style.left = left + 'px';
}

function hideSummaryPopup() {
  summaryPopup.classList.add('hidden');
}

document.addEventListener('click', e => {
  if (!summaryPopup.classList.contains('hidden') && !summaryPopup.contains(e.target) && !e.target.classList.contains('log-summary'))
    hideSummaryPopup();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideSummaryPopup(); closeTranscript(); } });

// ── Helpers ───────────────────────────────────────────────────────────────────
function _formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (_) { return iso; }
}

function _mediumBadge(medium) {
  if (!medium) return '<span class="badge badge-other">—</span>';
  if (['plivo','twilio','telnyx','exotel'].includes(medium))
    return `<span class="badge badge-phone">${medium}</span>`;
  if (medium === 'webRtc' || medium === 'webSocket')
    return `<span class="badge badge-web">Web</span>`;
  return `<span class="badge badge-other">${medium}</span>`;
}

function _endReasonBadge(reason) {
  if (!reason) return '<span class="badge badge-other">—</span>';
  if (reason.toLowerCase().includes('error') || reason.toLowerCase().includes('fail'))
    return `<span class="badge badge-error">${reason}</span>`;
  return `<span class="badge badge-hangup">${reason}</span>`;
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
  const summaryText = call.shortSummary || '';
  tr.innerHTML = `
    <td class="log-date">${_formatDate(call.created)}</td>
    <td class="log-dur">${call.duration || '—'}</td>
    <td>${_mediumBadge(call.medium)}</td>
    <td>${_endReasonBadge(call.endReason)}</td>
    <td class="log-summary" title="${_escHtml(summaryText)}">${summaryText ? _escHtml(summaryText) : '<span style="color:var(--muted)">—</span>'}</td>
    <td class="td-action"><button class="btn-view">View</button></td>
  `;
  const summaryTd = tr.querySelector('.log-summary');
  if (summaryText) {
    summaryTd.addEventListener('click', e => {
      e.stopPropagation();
      if (!summaryPopup.classList.contains('hidden') && summaryPopup.textContent === summaryText) {
        hideSummaryPopup();
      } else {
        showSummaryPopup(summaryTd, summaryText);
      }
    });
  }
  tr.querySelector('.btn-view').addEventListener('click', () => openTranscript(call.callId));
  return tr;
}

function _appendLogRows(results) {
  for (const call of results) logsTbody.appendChild(_renderRow(call));
}

// ── Filter state & logic ───────────────────────────────────────────────────────
const btnFilterLogs  = document.getElementById('btn-filter-logs');
const filterDropdown = document.getElementById('filter-dropdown');
const filterBadge    = document.getElementById('filter-badge');
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo   = document.getElementById('filter-date-to');
const btnFilterApply = document.getElementById('btn-filter-apply');
const btnFilterClear = document.getElementById('btn-filter-clear');
const filterCheckboxes = filterDropdown.querySelectorAll('input[type="checkbox"]');

let activeFilters = { dateFrom: '', dateTo: '', mediums: new Set() };

function _countActiveFilters() {
  let n = 0;
  if (activeFilters.dateFrom || activeFilters.dateTo) n++;
  if (activeFilters.mediums.size > 0) n++;
  return n;
}

function _updateFilterBadge() {
  const n = _countActiveFilters();
  filterBadge.textContent = n;
  filterBadge.classList.toggle('hidden', n === 0);
  btnFilterLogs.classList.toggle('active', n > 0);
}

function _isFiltering() {
  return !!(activeFilters.dateFrom || activeFilters.dateTo || activeFilters.mediums.size > 0);
}

// Toggle filter dropdown
btnFilterLogs.addEventListener('click', e => {
  e.stopPropagation();
  filterDropdown.classList.toggle('hidden');
  btnFilterLogs.classList.toggle('active', !filterDropdown.classList.contains('hidden') || _countActiveFilters() > 0);
});

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!filterDropdown.classList.contains('hidden') && !document.getElementById('filter-wrap').contains(e.target)) {
    filterDropdown.classList.add('hidden');
  }
});

btnFilterApply.addEventListener('click', () => {
  activeFilters.dateFrom = filterDateFrom.value;
  activeFilters.dateTo   = filterDateTo.value;
  activeFilters.mediums  = new Set(
    [...filterCheckboxes].filter(cb => cb.checked).map(cb => cb.value)
  );
  filterDropdown.classList.add('hidden');
  loadLogs(true);  // re-fetch from server with filters
});

btnFilterClear.addEventListener('click', () => {
  filterDateFrom.value = '';
  filterDateTo.value   = '';
  filterCheckboxes.forEach(cb => { cb.checked = false; });
  activeFilters = { dateFrom: '', dateTo: '', mediums: new Set() };
  filterDropdown.classList.add('hidden');
  _updateFilterBadge();
  loadLogs(true);  // re-fetch without filters
});

// ── Load logs ─────────────────────────────────────────────────────────────────
async function loadLogs(reset = true) {
  if (reset) {
    logsCursor = null;
    allCalls   = [];
    logsTbody.innerHTML = '';
    colResizeInit = false;
  }
  btnRefreshLogs.classList.add('spinning');
  _setLogsView('loading');

  try {
    const filtering = _isFiltering();
    const params = new URLSearchParams({ page_size: 20 });
    if (!filtering && logsCursor) params.set('cursor', logsCursor);
    if (activeFilters.dateFrom)       params.set('date_from', activeFilters.dateFrom);
    if (activeFilters.dateTo)         params.set('date_to',   activeFilters.dateTo);
    if (activeFilters.mediums.size === 1) params.set('medium', [...activeFilters.mediums][0]);

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

    if (filtering || reset) {
      // Filtered results or fresh load: replace, don't accumulate
      allCalls = data.results;
    } else {
      // "Load more" without filters: append
      allCalls.push(...data.results);
    }

    _setLogsView('table');
    if (reset || filtering) {
      logsTbody.innerHTML = '';
      _appendLogRows(allCalls);
    } else {
      _appendLogRows(data.results);
    }
    initColResize();

    // Hide "Load more" when filters are active (server already returned all matches)
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

  try {
    const res = await fetch(`${BACKEND_URL}/logs/calls/${encodeURIComponent(callId)}/messages`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    const data = await res.json();
    drawerLoading.classList.add('hidden');

    if (!data.messages.length) {
      drawerEmpty.classList.remove('hidden');
      return;
    }

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
}

// ── Play Recording ────────────────────────────────────────────────────────────
btnPlayRecording.addEventListener('click', () => {
  if (!currentTranscriptCallId) return;

  // Toggle: if already showing player, hide it
  if (!recordingPlayer.classList.contains('hidden')) {
    _resetRecordingPlayer();
    return;
  }

  recordingPlayer.classList.remove('hidden');
  recordingError.classList.add('hidden');
  btnPlayRecording.classList.add('loading');

  const src = `${BACKEND_URL}/logs/calls/${encodeURIComponent(currentTranscriptCallId)}/recording`;
  recordingAudio.src = src;
  recordingAudio.load();
});

recordingAudio.addEventListener('canplay', () => {
  btnPlayRecording.classList.remove('loading');
  btnPlayRecording.classList.add('playing');
  recordingAudio.play().catch(() => {});  // auto-play best-effort
});

recordingAudio.addEventListener('error', () => {
  btnPlayRecording.classList.remove('loading', 'playing');
  recordingAudio.removeAttribute('src');
  recordingError.textContent = 'Recording not available for this call.';
  recordingError.classList.remove('hidden');
});

recordingAudio.addEventListener('ended', () => {
  btnPlayRecording.classList.remove('playing');
});

drawerClose.addEventListener('click', closeTranscript);
drawerOverlay.addEventListener('click', e => { if (e.target === drawerOverlay) closeTranscript(); });

btnRefreshLogs.addEventListener('click', () => loadLogs(true));
btnLogMore.addEventListener('click', () => loadLogs(false));

// ── Trigger loadLogs when Logs nav item is clicked ───────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  if (item.dataset.page === 'logs') {
    item.addEventListener('click', () => loadLogs(true));
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
setStatus('disconnected');
