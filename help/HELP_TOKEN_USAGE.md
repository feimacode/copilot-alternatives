# Token Usage Tracking

The extension automatically tracks token consumption and estimated costs across your AI chat activity — GitHub Copilot, BYOK providers, and built-in models — by reading VS Code’s chat session store.

![Usage dashboard overview](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/usage-dashboard.png)

*The main dashboard gives you a high-level view of today’s activity, recent trends, and vendor balance.*

For GitHub Copilot usage specifically, the extension also tracks **AI credits** — see [Copilot Credit Tracking](#copilot-credit-tracking) below.

---

## Overview Dashboard

Open the main dashboard with `Copilot Alternatives: Show Token Usage Dashboard`.

You’ll see:

- **Today’s stats** — tokens used and the estimated cost so far today
- **Rolling windows** — 7-day and 30-day views with an easy date-range switcher
- **Vendor breakdown** — a donut chart showing token share by vendor
- **Model breakdown** — a detailed table of tokens and cost by model
- **Budget outlook** — a yearly budget projection against your configured target

The dashboard also supports a **Since…** view so you can focus on a custom date range.

---

## Status Bar

The small flame icon in the status bar shows **today’s** token count and cost. It updates in real time as session data arrives.

Hover over it to see:

- **24 hours** — today’s token total and estimate
- **A week** — the last 7 days
- **A month** — the last 30 days

If Copilot usage is detected, the tooltip also shows a **Copilot credits** breakdown across those same windows.

Click the status bar item to open the full usage dashboard.

---

## Copilot Credit Tracking

GitHub Copilot plans are billed in **AI credits**, not raw tokens or dollars. Whenever VS Code reports a real GitHub-provided credit count, the extension stores and displays it directly. If a real value is not available, it falls back to an estimate based on token usage.

![Copilot credits view](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/copilot-credits.png)

*The Copilot credits panel makes it easy to compare your current cycle against your monthly allowance.*

### Monthly Credit Quota tile

This appears on the Overview and Vendor dashboards whenever Copilot usage is detected. It shows:

- your resolved plan name and monthly allowance
- credits consumed so far in the current billing cycle
- a rolling **24h / 7 day / 30 day** breakdown and per-model credits table

To resolve your plan automatically, run `Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan`.

### Why the numbers may differ from GitHub

Small differences are expected:

- some turns fall back to an estimate instead of a real GitHub-reported credit count
- the extension uses rolling windows from “now” rather than your billing-cycle start day
- the extension only sees sessions from the current machine’s VS Code chat store

Use the extension to monitor local usage trends, and GitHub’s page as the authoritative billing source.

---

## Vendor and Model Views

Click a vendor in the sidebar to open a deeper view:

- daily usage charts for that vendor’s models
- model-level token and cost tables
- per-model charts when available

If you open the `copilot` vendor view, the dashboard switches to **credits** instead of dollar estimates.

---

## Reloading Data

You normally do not need to do this manually. The live watcher and startup backfill keep the database current automatically.

If your data looks stale or missing:

1. Run `Copilot Alternatives: Refresh Stats DB from local sessions`
2. Confirm the rebuild prompt
3. Wait for the data to be reimported from disk

> This is a full rebuild, not a small trim. If you rely on older history, increase `backfillDays` before reloading.

---

## Configuration Reference

| Setting | Default | Description |
|---|---|---|
| `yearlyBudgetTarget` | `250000` | Yearly budget target shown on the overview dashboard |
| `backfillDays` | `60` | How far back to import history on first load or rebuild |
| `watcherWindowDays` | `1` | How far back the live watcher scans for new session files |

---

## See Also

- [Getting Started](HELP_GETTING_STARTED.md) — Installation, sidebar overview, and first steps
- [Cost Estimates](HELP_COST_ESTIMATES.md) — How costs and Copilot credits are calculated and how accurate they are
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
