// background.js — Claude Usage Tracker

const NOTIFICATION_THRESHOLDS = [20, 50, 75, 90];

let scrapeTabId = null;

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    usageData: null,
    notifiedThresholds: [],
    overlayMode: 'persistent',
    lastUpdated: null
  });
});

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'scrapeComplete') {
    handleNotifications(message.data);
    // Close scrape tab if we opened it
    if (scrapeTabId && sender.tab?.id === scrapeTabId) {
      chrome.tabs.remove(scrapeTabId).catch(() => {});
      scrapeTabId = null;
    }
    sendResponse({ ok: true });
  }

  if (message.action === 'getUsage') {
    chrome.storage.local.get(['usageData', 'lastUpdated', 'overlayMode'], sendResponse);
    return true;
  }

  if (message.action === 'setOverlayMode') {
    chrome.storage.local.set({ overlayMode: message.mode });
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'overlayModeChanged', mode: message.mode }).catch(() => {});
      });
    });
    sendResponse({ ok: true });
  }

  if (message.action === 'manualRefresh') {
    openScrapeTab();
    sendResponse({ ok: true });
  }

  return true;
});

// ── Open settings tab to scrape ───────────────────────────────────────────────

async function openScrapeTab() {
  // Close existing scrape tab if any
  if (scrapeTabId !== null) {
    chrome.tabs.remove(scrapeTabId).catch(() => {});
    scrapeTabId = null;
  }

  const tab = await chrome.tabs.create({
    url: 'https://claude.ai/settings/usage',
    active: false
  });
  scrapeTabId = tab.id;

  // Safety net: close after 15s
  setTimeout(() => {
    if (scrapeTabId === tab.id) {
      chrome.tabs.remove(tab.id).catch(() => {});
      scrapeTabId = null;
    }
  }, 15000);
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function handleNotifications(data) {
  if (!data) return;
  const stored = await chrome.storage.local.get(['notifiedThresholds']);
  const notified = stored.notifiedThresholds || [];
  const pct = data.sessionPercent || 0;

  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (pct >= threshold && !notified.includes(threshold)) {
      chrome.notifications.create(`usage-${threshold}-${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `Claude Usage: ${threshold}%`,
        message: notificationMessage(threshold),
        priority: threshold >= 75 ? 2 : 1
      });
      notified.push(threshold);
    }
  }

  const filtered = notified.filter(t => t <= pct);
  chrome.storage.local.set({ notifiedThresholds: filtered });
}

function notificationMessage(threshold) {
  const map = {
    20: '20% of your Claude session used.',
    50: 'Halfway — 50% of your Claude session used.',
    75: '75% used — wrapping up soon?',
    90: '90% used — almost out.'
  };
  return map[threshold] || `${threshold}% of your session used.`;
}
