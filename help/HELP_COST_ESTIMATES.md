# Cost Estimates

The extension estimates the cost of each chat interaction from token usage and bundled pricing tables. The values are best used for trends and comparisons rather than as a billing statement.

![Usage dashboard with cost trend](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/usage-dashboard.png)

*The overview dashboard shows daily cost movement, vendor share, and budget projection so you can spot expensive models or days quickly.*

---

## How Estimates Are Calculated

For each chat turn, the extension records the number of **input tokens** and **output tokens** from VS Code’s session store and applies the bundled per-token price:

```
estimated_cost = (input_tokens × input_price_per_token)
               + (output_tokens × output_price_per_token)
```

### Pricing Sources

The extension includes static pricing tables for popular providers and models:

| Provider | Models Covered |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini, o1, o3, GPT-4 series |
| Anthropic | Claude Opus, Sonnet, Haiku series |
| Google | Gemini Pro, Flash series |
| DeepSeek | V4, Flash, R1 |
| Mistral | Large, Codestral |
| Others | vendor-level average as fallback |

These prices are updated with each extension release and are not fetched live from provider APIs.

---

## GitHub Copilot: Credits, not dollars

GitHub Copilot plans are billed in **AI credits**, not a per-token dollar rate. The extension handles this differently from BYOK/API providers:

- when a turn reports a real GitHub-provided credit count, it stores that number directly
- if a real figure is missing, it falls back to an estimate derived from tokens and model-aware heuristics
- any Copilot usage shown in the UI is displayed as **credits (cr)** rather than a dollar estimate

![Copilot credits view](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/copilot-credits.png)

*The Copilot credits panel is the easiest way to see how your current cycle compares to your monthly allowance.*

---

## Model Matching

The extension tries to match each model ID to a pricing entry in layers:

1. **vendor prefix** — for IDs like `openai/gpt-4o`
2. **heuristic matching** — by model name and family
3. **vendor-level fallback** — if the exact model is unknown
4. **unknown fallback** — if the provider cannot be determined reliably

If you want to verify how a model was resolved, check the **Copilot Alternatives** output channel in the VS Code Output panel.

---

## Accuracy and Caveats

### Included in the estimate

- input token cost
- output token cost

### Not included

- cached-input discounts
- volume or enterprise discounts
- free quota that is already included in a plan
- promotional credits or special negotiated rates
- taxes or fees

### Interpretation

| Scenario | Accuracy |
|---|---|
| standard pay-as-you-go API pricing | good |
| subscription plans with included quota | may overestimate |
| enterprise agreements | may overestimate |
| cached prompt tokens | may overestimate |

**Estimates are approximate.** Use them to understand trends and compare providers, not as a billing statement.

---

## FAQ

### Why does my cost show $0.00?
This is normal for GitHub Copilot usage. Copilot is displayed in **AI credits (cr)** rather than dollars.

### Why is the estimate higher than my bill?
The estimate assumes a standard pay-as-you-go quote. If your provider includes free quota or a special plan, your actual bill may be lower.

### Why don’t my Copilot credits match GitHub’s page?
Small differences are expected because the extension uses local session data, rolling windows, and estimate fallbacks where GitHub reported credits are missing.

### Can I add custom pricing?
Not yet. Custom pricing would require editing the bundled pricing tables.

---

## See Also

- [Token Usage Tracking](HELP_TOKEN_USAGE.md) — Dashboards, status bar, and Copilot credit tracking in depth
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
- [Getting Started](HELP_GETTING_STARTED.md) — Installation, sidebar overview, and first steps
