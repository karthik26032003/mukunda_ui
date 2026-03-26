import { UltravoxSession } from './ultravox-client.js';

const BACKEND_URL = window.BACKEND_URL || 'http://localhost:8000';

// ── State ─────────────────────────────────────────────────────────────────────
let session = null;


// ── DOM — Voice ───────────────────────────────────────────────────────────────
const btnStart      = document.getElementById('btn-start');
const btnEnd        = document.getElementById('btn-end');
const btnMute       = document.getElementById('btn-mute');
const statusDot     = document.getElementById('status-dot');
const statusLabel   = document.getElementById('status-label');
const transcriptBox = document.getElementById('transcript-box');
const errorBanner   = document.getElementById('error-banner');

// ── DOM — Batches ─────────────────────────────────────────────────────────────
const btnDownloadTemplate = document.getElementById('btn-download-template');
const btnNewBatch         = document.getElementById('btn-new-batch');
const batchesGrid         = document.getElementById('batches-grid');
const batchesEmpty        = document.getElementById('batches-empty');
const batchesLoading      = document.getElementById('batches-loading');

// Upload modal
const batchUploadOverlay  = document.getElementById('batch-upload-overlay');
const batchNameInput      = document.getElementById('batch-name-input');
const batchExcelInput     = document.getElementById('batch-excel-input');
const batchUploadZone     = document.getElementById('batch-upload-zone');
const batchUploadStatus   = document.getElementById('batch-upload-status');
const batchPhoneInput     = document.getElementById('batch-phone-input');
const btnBatchAdd         = document.getElementById('btn-batch-add');
const batchPhoneList      = document.getElementById('batch-phone-list');
const batchError          = document.getElementById('batch-error');
const btnBatchSubmit      = document.getElementById('btn-batch-submit');
const btnBatchModalClose  = document.getElementById('btn-batch-modal-close');

// Detail modal
const batchDetailOverlay  = document.getElementById('batch-detail-overlay');
const batchDetailName     = document.getElementById('batch-detail-name');
const batchDetailStats    = document.getElementById('batch-detail-stats');
const batchDetailTbody    = document.getElementById('batch-detail-tbody');
const btnBatchDetailClose = document.getElementById('btn-batch-detail-close');

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

// Accepts: 10-digit Indian (9876543210), 12-digit with country code (919876543210),
// or full E.164 (+919876543210). Backend normalizes all to +91XXXXXXXXXX.
const PHONE_RE = /^(\+91|91)?\d{10}$/;

async function parseExcelFile(file) {
  const buffer   = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array' });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  const numbers = [];
  for (const row of rows) {
    const key = Object.keys(row).find(k => k.toLowerCase() === 'phone_numbers');
    if (!key) continue;
    const val = String(row[key]).trim().replace(/[\s\-]/g, '');
    if (PHONE_RE.test(val)) numbers.push(val);
  }
  return numbers;
}

// Download template CSV
btnDownloadTemplate.addEventListener('click', () => {
  const csv = 'phone_numbers,Names\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'contacts_template.csv'; a.click();
  URL.revokeObjectURL(url);
});

// ── Batch error helpers ───────────────────────────────────────────────────────
function showBatchError(msg) { batchError.textContent = msg; batchError.classList.remove('hidden'); }
function clearBatchError()   { batchError.textContent = ''; batchError.classList.add('hidden'); }

// ═════════════════════════════════════════════════════════════════════════════
//  BATCH MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

let batchPhoneNumbers = [];

// ── Status badge helper ───────────────────────────────────────────────────────
function _batchStatusBadge(status) {
  const map = {
    running:   'badge-running',
    completed: 'badge-completed',
    failed:    'badge-error',
    queued:    'badge-queued-call',
    initiated: 'badge-initiated',
    joined:    'badge-completed',
    ended:     'badge-completed',
  };
  const cls = map[status] || 'badge-other';
  return `<span class="batch-status-badge ${cls}">${status}</span>`;
}

// ── Render batch cards ────────────────────────────────────────────────────────
function _renderBatchCard(batch) {
  const done    = batch.succeeded + batch.failed;
  const pct     = batch.total > 0 ? Math.round((done / batch.total) * 100) : 0;
  const displayName = batch.name || batch.batch_id.slice(0, 8) + '…';
  const isRunning   = batch.status === 'running';

  const card = document.createElement('div');
  card.className = 'batch-card';
  card.dataset.batchId = batch.batch_id;
  card.innerHTML = `
    <div class="batch-card-top">
      <div class="batch-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <div class="batch-card-info">
        <p class="batch-card-name">${displayName}</p>
        <p class="batch-card-id">Batch ID: ${batch.batch_id}</p>
      </div>
      ${_batchStatusBadge(batch.status)}
    </div>
    <div class="batch-card-progress">
      <div class="batch-progress-row">
        <span class="batch-progress-label">Contacts</span>
        <span class="batch-progress-count">${done} / ${batch.total}</span>
      </div>
      <div class="batch-progress-track"><div class="batch-progress-fill" style="width:${pct}%"></div></div>
      <p class="batch-progress-pct">${pct}% complete</p>
    </div>
    <div class="batch-card-actions">
      ${isRunning
        ? `<button class="btn-batch-stop" data-batch-id="${batch.batch_id}">⏹ Stop</button>`
        : `<button class="btn-batch-run hidden" data-batch-id="${batch.batch_id}">▶ Run</button>`
      }
      <button class="btn-batch-delete ${isRunning ? 'disabled' : ''}" data-batch-id="${batch.batch_id}" ${isRunning ? 'disabled title="Cannot delete a running batch"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
  `;

  // Click card body → open detail
  card.addEventListener('click', e => {
    if (e.target.closest('.batch-card-actions')) return;
    openBatchDetail(batch.batch_id, displayName, batch);
  });

  // Delete
  card.querySelector('.btn-batch-delete')?.addEventListener('click', e => {
    e.stopPropagation();
    if (!isRunning) deleteBatch(batch.batch_id);
  });

  return card;
}

// ── Load & render batches ─────────────────────────────────────────────────────
async function loadBatches() {
  batchesLoading.classList.remove('hidden');
  batchesEmpty.classList.add('hidden');
  batchesGrid.innerHTML = '';

  try {
    const res = await fetch(`${BACKEND_URL}/outbound/batches`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const batches = await res.json();

    batchesLoading.classList.add('hidden');
    if (batches.length === 0) {
      batchesEmpty.classList.remove('hidden');
      return;
    }
    for (const b of batches) batchesGrid.appendChild(_renderBatchCard(b));
  } catch (err) {
    batchesLoading.classList.add('hidden');
    batchesEmpty.classList.remove('hidden');
    batchesEmpty.querySelector('p').textContent = `Failed to load batches: ${err.message}`;
  }
}

// ── Delete batch ──────────────────────────────────────────────────────────────
async function deleteBatch(batchId) {
  if (!confirm('Delete this batch and all its call records?')) return;
  try {
    const res = await fetch(`${BACKEND_URL}/outbound/batch/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      alert(err.detail || 'Delete failed');
      return;
    }
    loadBatches();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

// ── Upload Batch Modal ────────────────────────────────────────────────────────
function openBatchModal() {
  // Auto-name: count existing cards + 1
  const count = batchesGrid.querySelectorAll('.batch-card').length + 1;
  batchNameInput.value = `Batch ${count}`;
  batchPhoneNumbers = [];
  batchPhoneList.innerHTML = '';
  batchPhoneList.classList.add('hidden');
  batchUploadStatus.classList.add('hidden');
  batchUploadStatus.textContent = '';
  batchExcelInput.value = '';
  batchPhoneInput.value = '';
  btnBatchAdd.disabled  = true;
  btnBatchSubmit.disabled = true;
  clearBatchError();
  batchUploadOverlay.classList.remove('hidden');
}

function closeBatchModal() {
  batchUploadOverlay.classList.add('hidden');
}

function _renderBatchPhoneList() {
  if (batchPhoneNumbers.length === 0) {
    batchPhoneList.classList.add('hidden');
    batchPhoneList.innerHTML = '';
    btnBatchSubmit.disabled = true;
    return;
  }
  batchPhoneList.classList.remove('hidden');
  batchPhoneList.innerHTML = '';
  for (const num of batchPhoneNumbers) {
    const tag       = document.createElement('div');    tag.className = 'phone-tag';
    const numSpan   = document.createElement('span');   numSpan.textContent = num;
    const removeBtn = document.createElement('button'); removeBtn.className = 'phone-tag-remove'; removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      batchPhoneNumbers = batchPhoneNumbers.filter(n => n !== num);
      _renderBatchPhoneList();
    });
    tag.appendChild(numSpan);
    tag.appendChild(removeBtn);
    batchPhoneList.appendChild(tag);
  }
  btnBatchSubmit.disabled = false;
}

batchPhoneInput.addEventListener('input', () => {
  const val = batchPhoneInput.value.trim().replace(/[\s\-]/g, '');
  btnBatchAdd.disabled = !PHONE_RE.test(val);
  clearBatchError();
});
batchPhoneInput.addEventListener('keydown', e => { if (e.key === 'Enter') _addBatchNumber(); });
btnBatchAdd.addEventListener('click', _addBatchNumber);

function _addBatchNumber() {
  const val = batchPhoneInput.value.trim().replace(/[\s\-]/g, '');
  if (!PHONE_RE.test(val)) { showBatchError('Enter a valid 10-digit number'); return; }
  if (batchPhoneNumbers.includes(val)) { showBatchError(`${val} is already in the list.`); return; }
  clearBatchError();
  batchPhoneNumbers.push(val);
  batchPhoneInput.value = '';
  btnBatchAdd.disabled = true;
  _renderBatchPhoneList();
}

// Excel upload in modal
batchUploadZone.addEventListener('click', e => { if (e.target.tagName !== 'LABEL') batchExcelInput.click(); });
batchUploadZone.addEventListener('dragover',  e => { e.preventDefault(); batchUploadZone.classList.add('drag-over'); });
batchUploadZone.addEventListener('dragleave', () => batchUploadZone.classList.remove('drag-over'));
batchUploadZone.addEventListener('drop', async e => {
  e.preventDefault();
  batchUploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) await _handleBatchExcel(file);
});
batchExcelInput.addEventListener('change', async () => {
  const file = batchExcelInput.files[0];
  if (file) await _handleBatchExcel(file);
  batchExcelInput.value = '';
});

async function _handleBatchExcel(file) {
  clearBatchError();
  batchUploadStatus.classList.add('hidden');
  try {
    const numbers = await parseExcelFile(file);
    if (numbers.length === 0) {
      showBatchError('No valid numbers found. Ensure the column is named "phone_numbers".');
      return;
    }
    let added = 0;
    for (const n of numbers) {
      if (!batchPhoneNumbers.includes(n)) { batchPhoneNumbers.push(n); added++; }
    }
    batchUploadStatus.textContent = `${added} number${added !== 1 ? 's' : ''} loaded from "${file.name}"`;
    batchUploadStatus.classList.remove('hidden');
    _renderBatchPhoneList();
  } catch (err) {
    showBatchError(`Failed to read file: ${err.message}`);
  }
}

// Submit batch
btnBatchSubmit.addEventListener('click', async () => {
  if (batchPhoneNumbers.length === 0) return;
  clearBatchError();
  btnBatchSubmit.disabled = true;
  btnBatchSubmit.textContent = 'Starting…';

  try {
    const res = await fetch(`${BACKEND_URL}/outbound/calls/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_numbers: batchPhoneNumbers, name: batchNameInput.value.trim() || `Batch` }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Server returned ${res.status}`);
    }
    closeBatchModal();
    loadBatches();
  } catch (err) {
    showBatchError(`Failed: ${err.message}`);
    btnBatchSubmit.disabled = false;
    btnBatchSubmit.textContent = 'Start Batch';
  }
});

btnNewBatch.addEventListener('click', openBatchModal);
btnBatchModalClose.addEventListener('click', closeBatchModal);
batchUploadOverlay.addEventListener('click', e => { if (e.target === batchUploadOverlay) closeBatchModal(); });

// ── Batch Detail Modal ────────────────────────────────────────────────────────
async function openBatchDetail(batchId, displayName, batch) {
  batchDetailName.textContent = displayName;
  batchDetailStats.textContent = `${batch.succeeded + batch.failed} completed / ${batch.total} total · status: ${batch.status}`;
  batchDetailTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)">Loading…</td></tr>';
  batchDetailOverlay.classList.remove('hidden');

  try {
    const res = await fetch(`${BACKEND_URL}/outbound/batch/${encodeURIComponent(batchId)}/calls`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const calls = await res.json();

    batchDetailTbody.innerHTML = '';
    if (calls.length === 0) {
      batchDetailTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)">No calls found</td></tr>';
      return;
    }
    calls.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td>${c.phone_number}</td>
        <td>${_batchStatusBadge(c.status)}</td>
      `;
      batchDetailTbody.appendChild(tr);
    });
  } catch (err) {
    batchDetailTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)">Error: ${err.message}</td></tr>`;
  }
}

btnBatchDetailClose.addEventListener('click', () => batchDetailOverlay.classList.add('hidden'));
batchDetailOverlay.addEventListener('click', e => { if (e.target === batchDetailOverlay) batchDetailOverlay.classList.add('hidden'); });

// Load batches when Calls page / Outbound tab is activated
document.querySelectorAll('.nav-item').forEach(item => {
  if (item.dataset.page === 'calls') item.addEventListener('click', loadBatches);
});
document.querySelectorAll('.tab-btn').forEach(btn => {
  if (btn.dataset.tab === 'outbound') btn.addEventListener('click', loadBatches);
});

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
const btnPlayRecording      = document.getElementById('btn-play-recording');
const btnDownloadRecording  = document.getElementById('btn-download-recording');
const recordingPlayer       = document.getElementById('recording-player');
const recordingAudio        = document.getElementById('recording-audio');
const recordingError        = document.getElementById('recording-error');

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
const btnFilterLogs    = document.getElementById('btn-filter-logs');
const filterDropdown   = document.getElementById('filter-dropdown');
const filterBadge      = document.getElementById('filter-badge');
const filterDateFrom   = document.getElementById('filter-date-from');
const filterDateTo     = document.getElementById('filter-date-to');
const filterMediumSel  = document.getElementById('filter-medium-select');
const btnFilterApply   = document.getElementById('btn-filter-apply');
const btnFilterClear   = document.getElementById('btn-filter-clear');
const btnExportExcel   = document.getElementById('btn-export-excel');

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

// Toggle filter panel
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
  const rows = [['Date', 'Duration', 'Medium', 'End Reason', 'Summary']];
  for (const c of allCalls) {
    rows.push([
      c.created ? new Date(c.created).toLocaleString('en-IN') : '',
      c.duration || '',
      c.medium   || '',
      c.endReason || '',
      c.shortSummary || '',
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
    if (activeFilters.medium) params.set('medium', activeFilters.medium);

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

  // Wire up download button
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
  btnDownloadRecording.classList.add('hidden');
  btnDownloadRecording.removeAttribute('href');
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

// ── Usage ─────────────────────────────────────────────────────────────────────
const usageLoading       = document.getElementById('usage-loading');
const usageMonthLabel    = document.getElementById('usage-month-label');
const usagePrevBtn       = document.getElementById('usage-prev-month');
const usageNextBtn       = document.getElementById('usage-next-month');
const usageSubtitle      = document.getElementById('usage-subtitle');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let usageYear  = new Date().getFullYear();
let usageMonth = new Date().getMonth() + 1; // 1-based

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

  // Axis labels: show 4 evenly spaced dates
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

  // Disable next button if already on current month
  const now = new Date();
  const isCurrentMonth = usageYear === now.getFullYear() && usageMonth === (now.getMonth() + 1);
  usageNextBtn.disabled = isCurrentMonth;
  usageNextBtn.style.opacity = isCurrentMonth ? '0.35' : '1';

  try {
    const res = await fetch(`${BACKEND_URL}/logs/usage?year=${usageYear}&month=${usageMonth}`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const d = await res.json();

    // Stat cards
    document.getElementById('usage-total-calls').textContent = d.total_calls;
    document.getElementById('usage-join-rate').innerHTML     = `${d.join_rate}<span class="usage-stat-unit">%</span>`;
    document.getElementById('usage-billed-min').innerHTML    = `${d.total_billed_min}<span class="usage-stat-unit">m</span>`;
    const avgMin = d.avg_dur_secs ? (d.avg_dur_secs / 60).toFixed(1) : '0';
    document.getElementById('usage-avg-dur').innerHTML       = `${avgMin}<span class="usage-stat-unit">m</span>`;

    // Chart big numbers
    document.getElementById('usage-chart-calls-big').textContent = d.total_calls;
    document.getElementById('usage-chart-min-big').textContent   = `${d.total_billed_min}m`;

    // Summary card
    const totalSecs = Math.round(d.total_billed_min * 60);
    const hrs = Math.floor(totalSecs / 3600), mins = Math.floor((totalSecs % 3600) / 60);
    document.getElementById('usage-summary-hrs').textContent   = `${hrs} hrs ${mins} min`;
    document.getElementById('usage-summary-label').textContent = `Billed Duration — ${monthName} ${usageYear}`;
    document.getElementById('usage-sum-calls').textContent     = d.total_calls;
    document.getElementById('usage-sum-min').textContent       = `${d.total_billed_min}m`;
    document.getElementById('usage-sum-avg').textContent       = avgMin + 'm';

    // Days elapsed progress bar
    const today      = new Date();
    const daysTotal  = d.days_in_month;
    const daysElapsed = isCurrentMonth
      ? today.getDate()
      : daysTotal;
    const pct = Math.round((daysElapsed / daysTotal) * 100);
    document.getElementById('usage-days-bar').style.width    = `${pct}%`;
    document.getElementById('usage-days-caption').textContent =
      isCurrentMonth
        ? `${daysElapsed} of ${daysTotal} days elapsed this month`
        : `${monthName} ${usageYear} — full month`;

    // Charts
    const callVals  = d.daily.map(x => x.calls);
    const minVals   = d.daily.map(x => x.billed_min);
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

usagePrevBtn.addEventListener('click', () => {
  usageMonth--;
  if (usageMonth < 1) { usageMonth = 12; usageYear--; }
  loadUsage();
});

usageNextBtn.addEventListener('click', () => {
  const now = new Date();
  if (usageYear === now.getFullYear() && usageMonth === now.getMonth() + 1) return;
  usageMonth++;
  if (usageMonth > 12) { usageMonth = 1; usageYear++; }
  loadUsage();
});

document.querySelectorAll('.nav-item').forEach(item => {
  if (item.dataset.page === 'usage') {
    item.addEventListener('click', () => loadUsage());
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
setStatus('disconnected');
