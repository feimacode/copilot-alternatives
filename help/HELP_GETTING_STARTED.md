# Getting Started

The **Copilot & BYOK Usage Tracker** helps you understand how much you are using GitHub Copilot, BYOK providers, and other chat models — all from one place.

![Usage dashboard overview](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/usage-dashboard.png)

*The overview dashboard shows today’s activity, rolling 7/30-day trends, vendor share, and your budget outlook.*

---

## Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=feima.copilot-alternatives)
2. Look for the **Copilot Alternatives** icon in the Activity Bar
3. Click it to open the sidebar

No extra setup is required. The extension reads your VS Code chat session store automatically and starts tracking usage on startup.

---

## Sidebar Overview

The sidebar is organized into a few practical sections:

| Section | What you’ll find there |
|---|---|
| **BYOK & Model Management** | Your configured BYOK providers and models |
| **Extensions & Plugins** | A curated list of AI coding tools you can install |
| **Usage Stats** | Recent token consumption and request volume by vendor |
| **Session Stats** | Recent chat sessions with token counts and costs |
| **More Alternative Solutions** | A directory of AI coding tools, IDEs, CLIs, and plans |
| **Help** | These guides and walkthroughs |

![Sidebar directory view](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/sidebar-directory.png)

*The sidebar gives you quick access to usage, sessions, BYOK tools, and the wider alternatives directory.*

---

## First 5 Minutes

1. **Open the dashboard** — Run `Copilot Alternatives: Show Token Usage Dashboard` or click a vendor from **Usage Stats**.
2. **Check the status bar** — The small flame icon in the status bar shows today’s tokens and estimated cost. Hover over it for 24h, week, and month summaries.
3. **Review Copilot credits** — If you use GitHub Copilot, the extension shows your usage in **AI credits (cr)**. Run `Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan` to resolve your plan and see quota usage.
4. **Add a BYOK provider** — Run `Copilot Alternatives: BYOK: Add Provider` and choose a template to add your own API keys.
5. **Browse past sessions** — Expand **Session Stats** to review chat history with turn-by-turn details.
6. **Explore the directory** — Expand **More Alternative Solutions** to browse 100+ AI coding tools.

---

## Key Commands

| Command | What it does |
|---|---|
| `Copilot Alternatives: Show Token Usage Dashboard` | Opens the main usage dashboard with charts |
| `Copilot Alternatives: BYOK: Add Provider` | Adds a BYOK provider from a template |
| `Copilot Alternatives: Show Session Details` | Inspects a session’s turns, tokens, and timing |
| `Copilot Alternatives: Sign in with GitHub to Detect Copilot Plan` | Resolves your Copilot plan and quota |
| `Copilot Alternatives: Refresh Stats DB from local sessions` | Rebuilds the local usage database from disk |

Run any command from the Command Palette with `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS).

---

## Tips

- **Usage data is imported automatically** on startup. The first import may take a moment if you have a lot of history.
- **The status bar is always live** and updates as new sessions are detected.
- **You can tune the import window** with the `backfillDays` setting if you want more or less historical data.

---

## See Also

- [Token Usage Tracking](HELP_TOKEN_USAGE.md) — Dashboards, status bar, and Copilot credit tracking in depth
- [Cost Estimates](HELP_COST_ESTIMATES.md) — How costs and Copilot credits are calculated and how accurate they are
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
- [BYOK Provider Management](HELP_BYOK_MANAGEMENT.md) — Adding and managing your own API key providers
