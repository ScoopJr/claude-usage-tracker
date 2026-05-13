// background.js — Claude Usage Tracker

const NOTIFICATION_THRESHOLDS = [20, 50, 75, 90];
const CHECK_INTERVAL_MINUTES = 5;

let scrapeTabId = null; // track the hidden scrape tab

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    usageData: null,
    notifiedThresholds: [],
    overlayMode: 'persistent',
    lastUpdated: null
  });
  setupAlarm();
});

// Re-setup alarm on service worker restart
chrome.runtime.onStartup.addListener(setupAlarm);

function setupAlarm() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create('checkUsage', {
      delayInMinutes: 0.5, // first check after 30 seconds
      periodInMinutes: CHECK_INTERVAL_MINUTES
    });
  });
}

// ── Alarm → open settings tab to scrape ──────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUsage') {
    openScrapeTab();
  }
});

async function openScrapeTab() {
  // Don't stack up scrape tabs
  if (scrapeTabId !== null) {
    try {
      await chrome.tabs.remove(scrapeTabId);
    } catch (_) {}
    scrapeTabId = null;
  }

  try {
    // Open settings page — hidden as much as possible (active: false)
    const tab = await chrome.tabs.create({
      url: 'https://claude.ai/settings/usage',
      active: false
    });
    scrapeTabId = tab.id;

    // Safety net: close the tab after 15 seconds regardless
    setTimeout(async () => {
      if (scrapeTabId === tab.id) {
        try { await chrome.tabs.remove(tab.id); } catch (_) {}
        scrapeTabId = null;
      }
    }, 15000);

  } catch (e) {
    console.log('[Claude Tracker] Could not open scrape tab:', e.message);
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script on settings page finished scraping → close the tab
  if (message.action === 'scrapeComplete') {
    handleUsageUpdate(message.data);
    // Close the scrape tab
    if (sender.tab && sender.tab.id === scrapeTabId) {
      chrome.tabs.remove(sender.tab.id).catch(() => {});
      scrapeTabId = null;
    }
    sendResponse({ ok: true });
  }

  // Popup asking for current data
  if (message.action === 'getUsage') {
    chrome.storage.local.get(['usageData', 'lastUpdated', 'overlayMode'], (data) => {
      sendResponse(data);
    });
    return true; // async
  }

  // Popup toggling overlay mode
  if (message.action === 'setOverlayMode') {
    chrome.storage.local.set({ overlayMode: message.mode });
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'overlayModeChanged', mode: message.mode })
          .catch(() => {});
      });
    });
    sendResponse({ ok: true });
  }

  // Popup hitting manual refresh
  if (message.action === 'manualRefresh') {
    openScrapeTab();
    sendResponse({ ok: true });
  }

  return true;
});

// ── Handle incoming usage data ────────────────────────────────────────────────

async function handleUsageUpdate(data) {
  if (!data) return;

  const stored = await chrome.storage.local.get(['notifiedThresholds']);
  const notifiedThresholds = stored.notifiedThresholds || [];

  await chrome.storage.local.set({
    usageData: data,
    lastUpdated: Date.now()
  });

  // Push updated overlay to any open Claude chat tabs
  chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
    tabs.forEach(tab => {
      // Don't message the scrape tab (already closing)
      if (tab.id !== scrapeTabId) {
        chrome.tabs.sendMessage(tab.id, { action: 'overlayUpdate', data })
          .catch(() => {});
      }
    });
  });

  // Threshold notifications
  const pct = data.sessionPercent || 0;
  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (pct >= threshold && !notifiedThresholds.includes(threshold)) {
      sendUsageNotification(threshold);
      notifiedThresholds.push(threshold);
    }
  }

  // Reset thresholds if session rolled over (usage dropped)
  const filtered = notifiedThresholds.filter(t => t <= pct);
  await chrome.storage.local.set({ notifiedThresholds: filtered });
}

function sendUsageNotification(threshold) {
  const messages = {
    20: '20% of your Claude session used.',
    50: 'Halfway — 50% of your Claude session used.',
    75: '75% used — wrapping up soon?',
    90: '90% used — almost out of Claude session.'
  };
  chrome.notifications.create(`usage-${threshold}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: `Claude Usage: ${threshold}%`,
    message: messages[threshold],
    priority: threshold >= 75 ? 2 : 1
  });
}
