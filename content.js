// content.js — Claude Usage Tracker
// Fully self-contained. No dependency on background script for refresh.

let overlayEl = null;
let currentMode = 'persistent';
let refreshInterval = null;

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function init() {
  const stored = await getStorage(['overlayMode', 'usageData']);
  currentMode = stored.overlayMode || 'persistent';

  if (window.location.href.includes('claude.ai/settings')) {
    // On settings page — scrape and report, then done
    setTimeout(scrapeAndSave, 2000);
    return;
  }

  // On chat page — create overlay and start auto-refresh
  createOverlay();
  if (stored.usageData) updateOverlay(stored.usageData);

  // Listen for storage changes — updates overlay the instant new data is saved
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.usageData?.newValue) {
      updateOverlay(changes.usageData.newValue);
    }
    if (changes.overlayMode?.newValue) {
      currentMode = changes.overlayMode.newValue;
      applyMode();
    }
  });

  // Auto-refresh: open settings in background tab every 5 minutes
  // First refresh after 60 seconds, then every 5 minutes
  setTimeout(() => {
    triggerBackgroundScrape();
    refreshInterval = setInterval(triggerBackgroundScrape, REFRESH_MS);
  }, 60 * 1000);

  observeNavigation();
})();

// ── Storage ───────────────────────────────────────────────────────────────────

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function saveUsageData(data) {
  chrome.storage.local.set({ usageData: data, lastUpdated: Date.now() });
}

// ── Scrape (on settings page) ─────────────────────────────────────────────────

function scrapeAndSave() {
  const data = scrapeCurrentPage();
  if (data) {
    saveUsageData(data);
    // Tell background to handle notifications + close this tab if it opened it
    chrome.runtime.sendMessage({ action: 'scrapeComplete', data }).catch(() => {});
  } else {
    // Retry once
    setTimeout(() => {
      const retry = scrapeCurrentPage();
      if (retry) {
        saveUsageData(retry);
        chrome.runtime.sendMessage({ action: 'scrapeComplete', data: retry }).catch(() => {});
      }
    }, 2000);
  }
}

function scrapeCurrentPage() {
  // Strategy 1: aria progressbars
  const bars = document.querySelectorAll('[role="progressbar"]');
  if (bars.length > 0) {
    const vals = [];
    bars.forEach(bar => {
      const now = parseFloat(bar.getAttribute('aria-valuenow') || 0);
      const max = parseFloat(bar.getAttribute('aria-valuemax') || 100);
      vals.push(max > 0 ? Math.round((now / max) * 100) : now);
    });
    if (vals[0] > 0 || vals.length > 1) return buildResult(vals);
  }

  // Strategy 2: <progress> elements
  const progEls = document.querySelectorAll('progress');
  if (progEls.length > 0) {
    const vals = [];
    progEls.forEach(p => {
      vals.push(Math.round((parseFloat(p.value || 0) / parseFloat(p.max || 100)) * 100));
    });
    return buildResult(vals);
  }

  // Strategy 3: divs with % width
  const pctDivs = [];
  document.querySelectorAll('[style*="width"]').forEach(el => {
    const w = el.style.width;
    if (w?.endsWith('%')) {
      const n = parseFloat(w);
      if (n >= 0 && n <= 100) pctDivs.push(n);
    }
  });
  if (pctDivs.length > 0) return buildResult(pctDivs);

  return null;
}

function buildResult(vals) {
  return {
    sessionPercent: Math.min(Math.round(vals[0] || 0), 100),
    weeklyPercent: vals[1] !== undefined ? Math.min(Math.round(vals[1]), 100) : null,
    resetTime: extractResetTime(),
    scrapedAt: Date.now()
  };
}

function extractResetTime() {
  const m = (document.body?.innerText || '').match(/resets?\s+(in\s+[\d\w ]+|at\s+[\d:apm ]+)/i);
  return m ? m[0] : null;
}

// ── Background scrape trigger ─────────────────────────────────────────────────

function triggerBackgroundScrape() {
  // Ask background to open a settings tab
  // If background fails, fall back to opening it ourselves
  chrome.runtime.sendMessage({ action: 'manualRefresh' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      // Background not available — open tab directly from content script context
      // This won't work from content script, so we do nothing and rely on manual clicks
      console.log('[Claude Tracker] Background unavailable, skipping auto-refresh');
    }
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'overlayModeChanged') {
    currentMode = msg.mode;
    applyMode();
  }
  if (msg.action === 'overlayUpdate' && msg.data) {
    updateOverlay(msg.data);
  }
  sendResponse({ ok: true });
  return true;
});

// ── Overlay ───────────────────────────────────────────────────────────────────

function createOverlay() {
  document.getElementById('claude-usage-overlay')?.remove();

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
    window.location.href = 'https://claude.ai/settings/usage';
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
  overlayEl.setAttribute('data-pct', pct);

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
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    setTimeout(async () => {
      if (location.href.includes('/settings')) {
        scrapeAndSave();
        return;
      }
      // Back on chat — ensure overlay exists
      if (!document.getElementById('claude-usage-overlay')) {
        createOverlay();
        const s = await getStorage(['usageData']);
        if (s.usageData) updateOverlay(s.usageData);
      }
    }, 1000);
  }).observe(document, { subtree: true, childList: true });
}
