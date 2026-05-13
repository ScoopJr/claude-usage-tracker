# Claude Usage Tracker

Shows your Claude.ai usage limit in the corner of your screen while you chat. Get desktop notifications at 20%, 50%, 75% and 90% so you never get cut off mid-flow.

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

## Troubleshooting

**Shows —% and won't update**
Go to claude.ai/settings/usage — the extension needs to visit that page at least once to read your data.

**Notifications not showing**
Check that Chrome is allowed to send notifications in your Mac/Windows notification settings.

**Data looks old**
The dot in the popup goes yellow if data is stale. Hit ↻ Refresh.

## Notes

- Works on Claude Pro and Max plans
- No data leaves your browser — everything is stored locally
- If Claude updates their UI the scraper may need a patch — raise an issue if that happens
