# Token Usage Tracking

The extension automatically tracks token consumption and estimated costs across all your AI chat interactions — GitHub Copilot, BYOK providers, and built-in models — by reading VS Code's chat session store.

For GitHub Copilot usage specifically, the extension also tracks **AI credits** — see [Copilot Credit Tracking](#copilot-credit-tracking) below.

---

## Dashboards

### Overview Dashboard

The main dashboard (`Show Token Usage Dashboard`) gives you a comprehensive view:

- **Today's stats** — Tokens used and estimated cost so far today
- **All-time stats** — Total tokens, total cost, days tracked, daily average
- **Usage over time** — Stacked bar chart showing input vs output tokens per day
- **Cost trend** — Line chart of daily estimated cost
- **Vendor breakdown** — Donut chart of token share by vendor, with filterable table
- **Model breakdown** — Tokens per model, colored by vendor
- **My Yearly Budget** — Your projected yearly spend vs $250K target

Switch between **7 Days**, **30 Days**, and **Since…** views using the toggle in the header.

If any Copilot usage is detected, the overview dashboard also shows the **Monthly Credit Quota** tile (see below), alongside the My Yearly Budget section for non-Copilot usage.

### Vendor Dashboard

Click a vendor under "Usage Stats" in the sidebar to open the per-vendor dashboard, which shows:

- Daily usage chart for that vendor's models
- Model breakdown table with tokens and cost
- Per-model daily stacked bar chart
- **Monthly Credit Quota** tile and full credits breakdown, when viewing the `copilot` vendor

### Model Dashboard

Click a model under a vendor to see:

- Prompt token category breakdown (pie chart)
- Model detail in the vendor context

---

## Status Bar

The status bar shows **today's** token count and estimated cost. It updates in real time as new session data arrives.

Hover over the status bar to see a breakdown for:
- **24 hours** — today's total tokens and estimate
- **A week** — sum of the last 7 days
- **A month** — sum of the last 30 days

If Copilot usage is detected, the tooltip additionally shows a **Copilot credits** breakdown across the same 24h / 7 day / month windows, plus your monthly quota percentage if your plan has been resolved (see below).

Click the status bar to open the full usage dashboard.

---

## Copilot Credit Tracking

GitHub Copilot plans (Free, Pro, Pro+, Business, Enterprise, etc.) are billed in **AI credits**, not raw tokens or dollars. Whenever a chat turn reports real GitHub-provided credit usage, the extension stores and displays that number directly. When a real figure isn't available, credits are estimated from token counts using the same model-aware heuristic as cost estimates.

### Monthly Credit Quota tile

Shown on the **Overview dashboard** (whenever any Copilot usage is detected) and on the **Vendor dashboard** (when viewing the `copilot` vendor). It shows:

- Your resolved plan name and monthly credit allowance (e.g. Pro — 1,500 credits/mo)
- Credits consumed so far in the current billing cycle, as a percentage bar
- A full credits breakdown: rolling **24h / 7 day / 30 day** windows, plus a per-model credits table for the selected time range

To resolve your plan automatically, run `Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan`. This performs a best-effort lookup via your existing GitHub authentication session — it is not a public/stable API, so results may occasionally be unavailable or drift over time. If entitlement can't be resolved, the quota tile is hidden but the credits breakdown still displays.

> 🔒 **Privacy note:** Signing in only reuses (or requests) a standard GitHub authentication session to look up your Copilot plan name and monthly credit allowance. No code, chat content, or session data is ever sent to GitHub as part of this lookup — see the Privacy & Data section in the [extension README](../EXTENSION_README.md) for the full data-handling policy.

### Why don't my credits match GitHub's own Copilot usage page?

Small differences are expected:
- **Estimate fallback** — if a turn didn't report a real credit count, the extension estimates it from tokens, which won't exactly match GitHub's billed figure
- **Rolling windows vs. billing cycle** — the extension's 24h/7d/30d windows are always rolling from "now", while GitHub's usage page resets on your billing cycle start day
- **Local-only data** — the extension only knows about sessions run from this machine's VS Code chat session store; usage from other machines or IDEs isn't included

Use the extension's numbers to track trends across your local sessions, and GitHub's own usage page as the authoritative billing source.

### Where credits appear instead of cost

For any data associated with the `copilot` vendor, the extension shows **credits (cr)** instead of an estimated dollar cost — in the status bar tooltip, dashboards, the sidebar's Session Stats tree, and the session detail view. Non-Copilot (BYOK/other vendor) usage continues to show estimated `$` cost as before. The Session Stats root node in the sidebar shows a combined `X cr + $Y.YY` label when both kinds of usage are present.

---

## Reloading Data

> ℹ️ **You normally never need this.** The live file watcher and startup backfill keep the database current automatically. Only use this if your data looks stale, missing, or out of sync — for example, after restoring a backup of your chat history, or if you suspect the database got corrupted.

If you want to force a full reimport of your chat history:

1. Run `Copilot Alternatives: Refresh Stats DB from local sessions` from the command palette
2. Confirm the warning prompt — **this clears the entire internal database** (all sessions, turns, and processed-file records, regardless of age) and reimports from disk
3. Only session files within the current `backfillDays` window (by file *last-modified time*, not session creation date) are re-imported — anything outside that window will not be restored
4. All charts and views will update with fresh data

> ⚠️ **This is a full rebuild, not a "trim to N days" operation.** If you rely on historical data older than your current `backfillDays` setting, increase `backfillDays` *before* reloading, or avoid reloading altogether — the live watcher and startup backfill already keep the database current without needing a manual reload.

---

## Configuration Reference

| Setting | Default | Range | Description |
|---|---|---|---|
| `yearlyBudgetTarget` | `250000` | number | Yearly AI token budget target (USD) |
| `backfillDays` | `60` | 1–365 | Days of history to import on first load, and re-imported on a full reload/rebuild |
| `watcherWindowDays` | `1` | 1–30 | Real-time watcher scan window (days) |

---

## See Also

- [Getting Started](HELP_GETTING_STARTED.md) — Installation, sidebar overview, and first steps
- [Cost Estimates](HELP_COST_ESTIMATES.md) — How costs and Copilot credits are calculated, and their accuracy
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
