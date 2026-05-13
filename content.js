// content.js — Claude Usage Tracker
// Injected into every claude.ai page

let overlayEl = null;
let currentMode = 'persistent';

// ── Boot ──────────────────────────────────────────────────────────────────────

(async function init() {
  // Load saved mode and data
  const stored = await getStorage(['overlayMode', 'usageData']);
  currentMode = stored.overlayMode || 'persistent';

  // Always create the overlay immediately
  createOverlay();

  // Apply any cached data right away
  if (stored.usageData) {
    updateOverlay(stored.usageData);
  }

  // If we're on the settings/usage page, scrape it
  if (window.location.href.includes('/settings')) {
    setTimeout(scrapeAndReport, 1800);
  }

  // Self-contained auto-refresh — don't rely on background messaging
  // First hit after 30s, then every 5 minutes
  setTimeout(() => {
    navigateToUsageAndScrape();
    setInterval(navigateToUsageAndScrape, 5 * 60 * 1000);
  }, 30 * 1000);

  // Watch for SPA navigation
  observeNavigation();
})();

// ── Storage helper ────────────────────────────────────────────────────────────

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

// ── Messages from background / popup ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'scrapeUsage') {
    navigateToUsageAndScrape();
    sendResponse({ ok: true });
  }
  if (msg.action === 'overlayModeChanged') {
    currentMode = msg.mode;
    applyMode();
    sendResponse({ ok: true });
  }
  return true;
});

// ── Overlay: create ───────────────────────────────────────────────────────────

function createOverlay() {
  // Remove stale overlay if it exists
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

  // Click opens settings
  overlayEl.addEventListener('click', () => {
    window.location.href = 'https://claude.ai/settings/usage';
  });

  document.body.appendChild(overlayEl);
  applyMode();
}

// ── Overlay: update ───────────────────────────────────────────────────────────

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

// ── Overlay: show/hide ────────────────────────────────────────────────────────

function applyMode() {
  if (!overlayEl) return;
  if (currentMode === 'hidden') {
    overlayEl.classList.add('cut-hidden');
  } else {
    overlayEl.classList.remove('cut-hidden');
  }
}

// ── Scraping ──────────────────────────────────────────────────────────────────

function scrapeAndReport() {
  const data = scrapeCurrentPage();
  if (data) {
    chrome.runtime.sendMessage({ action: 'usageUpdate', data });
    updateOverlay(data);
  }
}

function scrapeCurrentPage() {
  // Strategy 1: aria progress bars
  const bars = document.querySelectorAll('[role="progressbar"]');
  if (bars.length > 0) {
    const results = [];
    bars.forEach(bar => {
      const now = parseFloat(bar.getAttribute('aria-valuenow') || 0);
      const max = parseFloat(bar.getAttribute('aria-valuemax') || 100);
      results.push(max > 0 ? Math.round((now / max) * 100) : now);
    });
    return {
      sessionPercent: Math.min(results[0] || 0, 100),
      weeklyPercent: results[1] !== undefined ? Math.min(results[1], 100) : null,
      resetTime: extractResetTime(),
      scrapedAt: Date.now()
    };
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
    return {
      sessionPercent: Math.min(results[0] || 0, 100),
      weeklyPercent: results[1] !== undefined ? Math.min(results[1], 100) : null,
      resetTime: extractResetTime(),
      scrapedAt: Date.now()
    };
  }

  // Strategy 3: inline style width on div bars
  const divBars = document.querySelectorAll('[style*="width"]');
  const pctBars = [];
  divBars.forEach(el => {
    const w = el.style.width;
    if (w && w.endsWith('%')) {
      const n = parseFloat(w);
      if (n >= 0 && n <= 100) pctBars.push(n);
    }
  });
  if (pctBars.length > 0) {
    return {
      sessionPercent: Math.round(pctBars[0]),
      weeklyPercent: pctBars[1] !== undefined ? Math.round(pctBars[1]) : null,
      resetTime: extractResetTime(),
      scrapedAt: Date.now()
    };
  }

  return null;
}

function extractResetTime() {
  const text = document.body?.innerText || '';
  const m = text.match(/resets?\s+(in\s+[\d\w ]+|at\s+[\d:apm ]+)/i);
  return m ? m[0] : null;
}

// ── Background fetch of settings page ────────────────────────────────────────

async function navigateToUsageAndScrape() {
  // Already there — just scrape
  if (window.location.href.includes('/settings')) {
    setTimeout(scrapeAndReport, 800);
    return;
  }

  // Fetch settings page HTML without navigating
  try {
    const resp = await fetch('https://claude.ai/settings/usage', { credentials: 'include' });
    const html = await resp.text();
    const data = parseUsageFromHTML(html);
    if (data) {
      chrome.runtime.sendMessage({ action: 'usageUpdate', data });
      updateOverlay(data);
    }
  } catch (e) {
    console.log('[Claude Tracker] Fetch error:', e.message);
  }
}

function parseUsageFromHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const bars = doc.querySelectorAll('[role="progressbar"]');
  if (!bars.length) return null;
  const results = [];
  bars.forEach(bar => {
    const now = parseFloat(bar.getAttribute('aria-valuenow') || 0);
    const max = parseFloat(bar.getAttribute('aria-valuemax') || 100);
    results.push(max > 0 ? Math.round((now / max) * 100) : now);
  });
  return {
    sessionPercent: Math.min(results[0] || 0, 100),
    weeklyPercent: results[1] !== undefined ? Math.min(results[1], 100) : null,
    scrapedAt: Date.now()
  };
}

// ── SPA navigation observer ───────────────────────────────────────────────────

function observeNavigation() {
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Re-inject overlay after navigation (SPA destroys body content)
      setTimeout(() => {
        if (!document.getElementById('claude-usage-overlay')) {
          createOverlay();
          getStorage(['usageData']).then(s => {
            if (s.usageData) updateOverlay(s.usageData);
          });
        }
      }, 800);

      if (location.href.includes('/settings')) {
        setTimeout(scrapeAndReport, 1800);
      }
    }
  }).observe(document, { subtree: true, childList: true });
}
