# Token Usage Tracking

The extension automatically tracks token consumption and estimated costs across all your AI chat interactions — GitHub Copilot, BYOK providers, and built-in models — by reading VS Code's chat session store.

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
- **Jensen Benchmark** — Your projected yearly spend vs $250K target

Switch between **7 Days**, **30 Days**, and **Since…** views using the toggle in the header.

### Vendor Dashboard

Click a vendor under "Usage Stats" in the sidebar to open the per-vendor dashboard, which shows:

- Daily usage chart for that vendor's models
- Model breakdown table with tokens and cost
- Per-model daily stacked bar chart

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

Click the status bar to open the full usage dashboard.

---

## Reloading Data

If you want to force a full reimport of your chat history:

1. Run `Copilot Alternatives: Reload Token Usage Data` from the command palette
2. This clears the internal database and reimports from disk
3. All charts and views will update with fresh data

---

## Configuration Reference

| Setting | Default | Range | Description |
|---|---|---|---|
| `yearlyBudgetTarget` | `250000` | number | Yearly AI token budget target (USD) |
| `backfillDays` | `60` | 1–365 | Days of history to import on first load |
| `watcherWindowDays` | `1` | 1–30 | Real-time watcher scan window (days) |
