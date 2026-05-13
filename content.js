// content.js — Claude Usage Tracker

let overlayEl = null;
let currentMode = 'persistent';

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function init() {
  const stored = await getStorage(['overlayMode', 'usageData']);
  currentMode = stored.overlayMode || 'persistent';

  const onSettingsPage = window.location.href.includes('claude.ai/settings');

  if (onSettingsPage) {
    // This tab was opened by the background scraper — scrape and report back
    setTimeout(scrapeAndReport, 2000);
  } else {
    // Regular Claude chat tab — show overlay with cached data
    createOverlay();
    if (stored.usageData) {
      updateOverlay(stored.usageData);
    }
    observeNavigation();
  }
})();

// ── Storage helper ────────────────────────────────────────────────────────────

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'overlayModeChanged') {
    currentMode = msg.mode;
    applyMode();
    sendResponse({ ok: true });
  }
  if (msg.action === 'overlayUpdate') {
    // Background just got fresh data — update overlay immediately
    updateOverlay(msg.data);
    sendResponse({ ok: true });
  }
  return true;
});

// ── Scrape (runs on settings page only) ──────────────────────────────────────

function scrapeAndReport() {
  const data = scrapeCurrentPage();
  if (data) {
    // Tell background: here's the data, you can close this tab now
    chrome.runtime.sendMessage({ action: 'scrapeComplete', data });
  } else {
    // Retry once more after 2s if page hadn't fully loaded
    setTimeout(() => {
      const retryData = scrapeCurrentPage();
      if (retryData) {
        chrome.runtime.sendMessage({ action: 'scrapeComplete', data: retryData });
      }
    }, 2000);
  }
}

function scrapeCurrentPage() {
  // Strategy 1: aria progressbars
  const bars = document.querySelectorAll('[role="progressbar"]');
  if (bars.length > 0) {
    const results = [];
    bars.forEach(bar => {
      const now = parseFloat(bar.getAttribute('aria-valuenow') || 0);
      const max = parseFloat(bar.getAttribute('aria-valuemax') || 100);
      results.push(max > 0 ? Math.round((now / max) * 100) : now);
    });
    return buildData(results);
  }

  // Strategy 2: <progress> elements
  const progEls = document.querySelectorAll('progress');
  if (progEls.length > 0) {
    const results = [];
    progEls.forEach(p => {
      const val = parseFloat(p.value || 0);
      const max = parseFloat(p.max || 100);
      results.push(Math.round((val / max) * 100));
    });
    return buildData(results);
  }

  // Strategy 3: divs with inline % width (common pattern for custom progress bars)
  const allEls = document.querySelectorAll('[style*="width"]');
  const pctBars = [];
  allEls.forEach(el => {
    const w = el.style.width;
    if (w && w.endsWith('%')) {
      const n = parseFloat(w);
      if (n >= 0 && n <= 100) pctBars.push(n);
    }
  });
  if (pctBars.length > 0) {
    return buildData(pctBars);
  }

  return null;
}

function buildData(results) {
  return {
    sessionPercent: Math.min(Math.round(results[0] || 0), 100),
    weeklyPercent: results[1] !== undefined ? Math.min(Math.round(results[1]), 100) : null,
    resetTime: extractResetTime(),
    scrapedAt: Date.now()
  };
}

function extractResetTime() {
  const text = document.body?.innerText || '';
  const m = text.match(/resets?\s+(in\s+[\d\w ]+|at\s+[\d:apm ]+)/i);
  return m ? m[0] : null;
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function createOverlay() {
  const existing = document.getElementById('claude-usage-overlay');
  if (existing) existing.remove();

  overlayEl = document.createElement('div');
  overlayEl.id = 'claude-usage-overlay';
  overlayEl.innerHTML = `
    <div class="cut-overlay-inner">
      <span class="cut-label">Usage</span>
      <span class="cut-pct" id="cut-pct">—%</span>
      <div class="cut-bar-track">
        <div class="cut-bar-fill" id="cut-bar"></div>
      </div>
    </div>
  `;

  overlayEl.addEventListener('click', () => {
    window.open('https://claude.ai/settings/usage', '_blank');
  });

  document.body.appendChild(overlayEl);
  applyMode();
}

function updateOverlay(data) {
  if (!overlayEl) createOverlay();

  const pct = typeof data.sessionPercent === 'number' ? data.sessionPercent : 0;
  const pctEl = document.getElementById('cut-pct');
  const barEl = document.getElementById('cut-bar');
  if (!pctEl || !barEl) return;

  pctEl.textContent = `${pct}%`;
  barEl.style.width = `${pct}%`;

  const state = pct >= 75 ? 'cut-danger' : pct >= 50 ? 'cut-warn' : '';
  pctEl.className = `cut-pct ${state}`.trim();
  barEl.className = `cut-bar-fill ${state}`.trim();
}

function applyMode() {
  if (!overlayEl) return;
  overlayEl.classList.toggle('cut-hidden', currentMode === 'hidden');
}

// ── SPA navigation ────────────────────────────────────────────────────────────

function observeNavigation() {
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => {
        if (!document.getElementById('claude-usage-overlay')) {
          createOverlay();
          getStorage(['usageData']).then(s => {
            if (s.usageData) updateOverlay(s.usageData);
          });
        }
        // If user manually navigated to settings, scrape it
        if (location.href.includes('/settings')) {
          setTimeout(scrapeAndReport, 1800);
        }
      }, 800);
    }
  }).observe(document, { subtree: true, childList: true });
}
