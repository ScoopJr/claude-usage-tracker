# Claude Usage Tracker — Chrome Extension

A lightweight Chrome extension that shows your Claude.ai usage limits inline — no more tabbing to settings to check.

## Features

- **Persistent overlay** — faint `USAGE X% ▬▬▬` indicator bottom-right of every Claude tab
- **Smart notifications** — desktop alerts at 20%, 50%, 75%, 90% used
- **Auto-refresh** — scrapes usage data every 5 minutes in the background
- **Weekly cap tracking** — separate bar for the weekly usage limit
- **Toggle modes** — switch between persistent overlay or hidden (popup only) via the extension popup
- **Manual refresh** — force a data update anytime from the popup

## Install (Developer Mode)

Chrome doesn't require publishing to the store — load it directly:

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `claude-usage-tracker` folder
5. Done — the extension is active

## How it works

- When you're on any `claude.ai` page, the overlay appears bottom-right
- Every 5 minutes, the extension fetches `claude.ai/settings/usage` in the background to scrape progress bar values
- If you visit `/settings/usage` yourself, it scrapes immediately
- Notifications fire once per threshold per session window

## Troubleshooting

**Overlay shows `—%`:**  
Visit `claude.ai/settings/usage` at least once — the extension needs to see the usage page to parse your data. After that, background refresh handles it.

**Notifications not appearing:**  
Make sure Chrome notifications are allowed for extensions in your OS notification settings.

**Usage data seems stale:**  
The status dot in the popup turns yellow if data is >15 minutes old. Click **↻ Refresh** to force an update.

## Notes

- Anthropic doesn't expose a public API for usage data — this extension scrapes the DOM/HTML of the settings page. If Claude changes their UI, the scraper may need updating.
- Works on Claude Pro and Max plans (5-hour rolling window + weekly cap).
- No data is sent anywhere — everything stays in your browser's local storage.
