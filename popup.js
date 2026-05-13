// popup.js

async function loadData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getUsage' }, resolve);
  });
}

function formatAge(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function render(data) {
  const { usageData, lastUpdated, overlayMode } = data || {};

  // Status dot
  const dot = document.getElementById('status-dot');
  const noDataEl = document.getElementById('no-data');
  const sessionPctEl = document.getElementById('session-pct');
  const sessionBar = document.getElementById('session-bar');
  const resetTimeEl = document.getElementById('reset-time');
  const weeklyRow = document.getElementById('weekly-row');
  const weeklyBar = document.getElementById('weekly-bar');
  const weeklyPct = document.getElementById('weekly-pct');
  const updatedRow = document.getElementById('updated-row');

  if (!usageData) {
    dot.className = 'header-dot offline';
    noDataEl.style.display = 'block';
    sessionPctEl.textContent = '—';
    return;
  }

  const stale = lastUpdated && (Date.now() - lastUpdated) > 15 * 60 * 1000;
  dot.className = stale ? 'header-dot stale' : 'header-dot';

  noDataEl.style.display = 'none';

  const pct = usageData.sessionPercent ?? 0;
  sessionPctEl.textContent = `${pct}%`;
  sessionBar.style.width = `${pct}%`;

  // Color states
  const state = pct >= 75 ? 'danger' : pct >= 50 ? 'warn' : '';
  sessionPctEl.className = `usage-pct ${state}`;
  sessionBar.className = `bar-fill ${state}`;

  if (usageData.resetTime) {
    resetTimeEl.textContent = usageData.resetTime;
  }

  // Weekly
  if (usageData.weeklyPercent !== null && usageData.weeklyPercent !== undefined) {
    weeklyRow.style.display = 'flex';
    weeklyBar.style.width = `${usageData.weeklyPercent}%`;
    weeklyPct.textContent = `${usageData.weeklyPercent}%`;
  }

  updatedRow.textContent = lastUpdated ? `Updated ${formatAge(lastUpdated)}` : '';

  // Mode buttons
  const mode = overlayMode || 'persistent';
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    chrome.runtime.sendMessage({ action: 'setOverlayMode', mode });
    document.querySelectorAll('.toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode)
    );
  });
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'manualRefresh' });
  setTimeout(() => loadData().then(render), 2000);
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadData().then(render);
