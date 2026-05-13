// background.js - Service worker for Claude Usage Tracker

const NOTIFICATION_THRESHOLDS = [20, 50, 75, 90];
const CHECK_INTERVAL_MINUTES = 5;

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    usageData: null,
    notifiedThresholds: [],
    overlayMode: 'persistent', // 'persistent' | 'popup-only'
    lastUpdated: null
  });
  setupAlarm();
});

function setupAlarm() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create('checkUsage', {
      periodInMinutes: CHECK_INTERVAL_MINUTES
    });
  });
}

// Alarm fires → trigger content script to scrape usage
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUsage') {
    triggerUsageScrape();
  }
});

async function triggerUsageScrape() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scrapeUsage' });
    }
  } catch (e) {
    console.log('No Claude tab open, skipping scrape');
  }
}

// Receive usage data from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'usageUpdate') {
    handleUsageUpdate(message.data);
    sendResponse({ ok: true });
  }
  if (message.action === 'getUsage') {
    chrome.storage.local.get(['usageData', 'lastUpdated', 'overlayMode'], (data) => {
      sendResponse(data);
    });
    return true; // async
  }
  if (message.action === 'setOverlayMode') {
    chrome.storage.local.set({ overlayMode: message.mode });
    // Notify all Claude tabs to update their overlay
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'overlayModeChanged', mode: message.mode });
      });
    });
  }
  if (message.action === 'manualRefresh') {
    triggerUsageScrape();
    sendResponse({ ok: true });
  }
});

async function handleUsageUpdate(data) {
  const stored = await chrome.storage.local.get(['notifiedThresholds']);
  const notifiedThresholds = stored.notifiedThresholds || [];

  // Store the usage data
  await chrome.storage.local.set({
    usageData: data,
    lastUpdated: Date.now()
  });

  // Check if we crossed any thresholds
  const currentPct = data.sessionPercent || 0;

  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (currentPct >= threshold && !notifiedThresholds.includes(threshold)) {
      sendUsageNotification(threshold, currentPct, data);
      notifiedThresholds.push(threshold);
    }
  }

  // Reset notified thresholds if usage dropped (new session)
  const filteredThresholds = notifiedThresholds.filter(t => t <= currentPct);
  await chrome.storage.local.set({ notifiedThresholds: filteredThresholds });
}

function sendUsageNotification(threshold, actual, data) {
  const messages = {
    20: "Just getting started — 20% of your session used.",
    50: "Halfway there — 50% of your session used.",
    75: "⚠️ 75% used — consider wrapping up or starting fresh.",
    90: "🔴 Nearly out — 90% of your session used!"
  };

  chrome.notifications.create(`usage-${threshold}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: `Claude Usage: ${threshold}%`,
    message: messages[threshold] || `${actual}% of your session limit used.`,
    priority: threshold >= 75 ? 2 : 1
  });
}
