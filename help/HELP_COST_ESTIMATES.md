# Cost Estimates

The extension estimates the cost of each chat interaction based on token usage and bundled pricing tables. Here's how it works.

---

## How Estimates Are Calculated

For each chat turn, the extension records the number of **input tokens** and **output tokens** from VS Code's session store. It then multiplies the token counts by the per-token price from a bundled pricing table:

```
estimated_cost = (input_tokens × input_price_per_token) 
               + (output_tokens × output_price_per_token)
```

### Pricing Sources

The extension includes **static pricing tables** for popular models from major providers:

| Provider | Models Covered |
|---|---|
| OpenAI | GPT-4o, GPT-4o-mini, o1, o3, GPT-4 series |
| Anthropic | Claude Opus, Sonnet, Haiku series |
| Google | Gemini Pro, Flash series |
| DeepSeek | V4, Flash, R1 |
| Mistral | Large, Codestral |
| Others | General vendor-level average as fallback |

Pricing data is updated with each extension release. It does not fetch live pricing from provider APIs.

---

## GitHub Copilot: Credits, not dollars

GitHub Copilot plans are billed in **AI credits**, not a per-token dollar rate, so Copilot usage is handled differently from BYOK/API providers:

- When a chat turn reports a **real, GitHub-provided credit count**, the extension stores and displays that number as-is — it is not an estimate.
- When a real figure isn't available for a turn, the extension falls back to an **estimated** credit count derived from token usage and a model-aware heuristic (`estimateCopilotCredits`). Real reported credits always take priority and are never overwritten by an estimate.
- Anywhere Copilot usage is shown — status bar, dashboards, sidebar tree, session details — the extension displays **credits (cr)** instead of a `$` estimate for Copilot-vendor data.
- If you've resolved your Copilot plan (`Sign in with GitHub to Detect Copilot Plan`), the Monthly Credit Quota tile shows consumption against your actual monthly allowance instead of a token-based cost projection.

Because credit-to-dollar conversion rates aren't public/stable, the extension does **not** attempt to translate Copilot credits into a dollar figure — credits are shown on their own scale.

---

## Model Matching

The extension uses a layered resolver to match your model ID to a pricing entry:

1. **Vendor prefix** — Models with a vendor prefix (e.g., `openai/gpt-4o`) are matched by the vendor portion
2. **Heuristic matching** — Model names are fuzzy-matched against known pricing entries (e.g., `claude-sonnet-4-20250514` matches `Claude Sonnet 4`)
3. **Vendor-level fallback** — If no specific match is found, a vendor-level average price is used
4. **Unknown fallback** — If the vendor can't be determined, a conservative default rate is applied

### Check Your Model's Resolution

If you're unsure how your model was priced:
1. Open the **Output** panel (`Ctrl+Shift+U`)
2. Select **Copilot Alternatives** from the dropdown
3. Look for log messages showing model → pricing key resolution

---

## Accuracy

### What's Included
- Input token costs
- Output token costs

### What's NOT Included
- **Cached input** — Some providers offer discounted pricing for cached/repeated input tokens. The extension doesn't track cache hit rates and always prices at full rate
- **Batch/API discounts** — Volume discounts, reserved capacity, or enterprise agreements are not reflected
- **Free quota** — If your provider offers free included quota, estimates may show costs for usage that was actually free
- **Special pricing** — Promotional credits, student plans, or custom negotiated rates
- **Taxes and fees** — Only the raw per-token cost is estimated

### Interpretation

| Scenario | Accuracy |
|---|---|
| Standard API pricing (pay-as-you-go) | Good — matches published rates |
| Subscription plans with included quota | Overestimate — doesn't account for included free usage |
| Enterprise agreements | Overestimate — doesn't reflect custom rates |
| Cached prompt tokens | Overestimate — always prices as full-rate input |

**Estimates are approximate.** Use them to understand trends and compare providers, not as a billing statement.


---

## FAQ

### Why does my cost show $0.00?
This is normal if you're using GitHub Copilot with a subscription plan — Copilot usage is tracked and displayed in **AI credits (cr)** instead of a dollar estimate, since Copilot plans aren't billed per-token. Look for the credits figure alongside or in place of cost in dashboards and the sidebar.

### Why is the estimated cost higher than my bill?
The estimate always assumes pay-as-you-go API pricing. If you're on a subscription plan with included quota, your actual cost may be lower. For GitHub Copilot specifically, see the credits figure instead — it does not use dollar-based pricing at all.

### Why don't my Copilot credits match GitHub's own usage page?
Small differences are expected:
- **Estimate fallback** — if a turn didn't report a real credit count, the extension estimates it from tokens, which won't exactly match GitHub's billed figure
- **Rolling windows vs. billing cycle** — the extension's 24h/7d/30d windows are always rolling from "now", while GitHub's usage page resets on your billing cycle start day
- **Local-only data** — the extension only sees sessions run from this machine's VS Code chat session store; usage from other machines or IDEs isn't included

Treat the extension's numbers as a local trend indicator, and GitHub's own usage page as the authoritative billing source.

### Can I add custom pricing?
Not currently. Custom pricing would require editing the bundled pricing tables. This is a planned feature.

---

## See Also

- [Token Usage Tracking](HELP_TOKEN_USAGE.md) — Dashboards, status bar, and Copilot credit tracking in depth
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
- [Getting Started](HELP_GETTING_STARTED.md) — Installation, sidebar overview, and first steps
