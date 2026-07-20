# Getting Started

The **Copilot & BYOK Usage Tracker** extension helps you track token usage and costs across all your AI coding assistants — GitHub Copilot, BYOK providers, and built-in chat models — all from one place.

---

## Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=feima.copilot-alternatives)
2. After installation, the **Copilot Alternatives** icon appears in the Activity Bar (left sidebar)
3. Click the icon to open the sidebar

No additional configuration is required — the extension automatically discovers your chat session files and starts tracking immediately.

---

## Sidebar Overview

The sidebar is organized into several sections:

| Section | Description |
|---|---|
| **BYOK & Model Management** | View and manage BYOK providers and their models. Expand to see all configured providers |
| **Extensions & Plugins** | Browse AI coding extensions you can install |
| **Usage Stats** | Token consumption and request counts across vendors (last 7 days) |
| **Session Stats** | Recent chat sessions with token counts and costs |
| **More Alternative Solutions** | Full catalog of AI coding plans, IDEs, CLI agents, and more |
| **Help** | Guides and documentation (you are here) |

---

## First Steps

1. **Check your token usage** — Run `Copilot Alternatives: Show Token Usage Dashboard` from the command palette, or click a vendor under "Usage Stats" in the sidebar
2. **Track your costs** — The status bar shows today's token count and estimated cost. Hover over it to see usage for the last 24 hours, week, and month.
3. **Track your Copilot credits** — If you use GitHub Copilot, usage is shown in **AI credits** instead of dollars. Run `Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan` to resolve your plan and see quota consumption against your actual monthly allowance
4. **Add a BYOK provider** — Run `Copilot Alternatives: BYOK: Add Provider` and pick a template to add your own API keys
5. **Browse past sessions** — Expand "Session Stats" to review your chat history with full turn-by-turn detail
6. **Explore the directory** — Expand "More Alternative Solutions" to browse 100+ AI coding tools

---

## Key Commands

| Command | What it does |
|---|---|
| `Copilot Alternatives: Show Token Usage Dashboard` | Opens the main dashboard with charts |
| `Copilot Alternatives: BYOK: Add Provider` | Add a BYOK provider from templates |
| `Copilot Alternatives: Show Session Details` | Inspect a session's turns, tokens, and timing |
| `Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan` | Resolve your Copilot plan to show a monthly credit quota |
| `Copilot Alternatives: Refresh Stats DB from local sessions` | Clear database and reimport from disk |

Run any command via `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and type the command name.

---

## Tips

- **Usage data is imported automatically** on startup. The first load scans your recent chat history (configurable via `backfillDays` setting, default 60 days)
- **The status bar** shows today's tokens and estimated cost. Hover for 24h, week, and month summaries.

---

## See Also

- [Token Usage Tracking](HELP_TOKEN_USAGE.md) — Dashboards, status bar, and Copilot credit tracking in depth
- [Cost Estimates](HELP_COST_ESTIMATES.md) — How costs and Copilot credits are calculated, and their accuracy
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
- [BYOK Provider Management](HELP_BYOK_MANAGEMENT.md) — Adding and managing your own API key providers
- **GitHub Copilot usage is shown in AI credits (cr)**, not dollars, since Copilot plans are billed per-credit rather than per-token
