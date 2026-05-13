# Claude Usage Tracker — Chrome Extension

A lightweight Chrome extension that shows your Claude.ai usage limits inline — no more tabbing to settings to check.

## Features

- **Persistent overlay** — `USAGE X%` indicator in the bottom-right corner of every Claude tab
- **Desktop notifications** — alerts at 20%, 50%, 75%, 90% used (requires Chrome notification permissions)
- **Auto-refresh** — scrapes usage data every 5 minutes in the background
- **Weekly cap tracking** — separate bar for the weekly usage limit
- **Toggle** — show or hide the corner indicator via the extension popup
- **Manual refresh** — force a data update anytime from the popup

## Install

**Step 1 — Download**
Click the green **Code** button at the top of this page → **Download ZIP** → unzip the folder somewhere on your computer

**Step 2 — Open Chrome extensions**
Paste this into your Chrome address bar and hit enter:
`chrome://extensions`

**Step 3 — Enable Developer Mode**
Toggle it on in the top-right corner

**Step 4 — Load the extension**
Click **Load unpacked** → select the `claude-usage-tracker` folder you just unzipped

**Step 5 — Seed your data**
Visit [claude.ai/settings/usage](https://claude.ai/settings/usage) once. The extension reads your usage from that page. After that it updates automatically every 5 minutes.

Done. You'll see your usage % in the bottom-right corner of Claude.

---

Then keep your original How it works, Troubleshooting, and Notes sections exactly as they were.
