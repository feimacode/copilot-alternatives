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
This is normal if you're using GitHub Copilot with a subscription plan — the extension tracks tokens but can only estimate cost for known pricing. Copilot usage shows estimated cost based on what equivalent API usage would cost.

### Why is the estimated cost higher than my bill?
The estimate always assumes pay-as-you-go API pricing. If you're on a subscription plan with included quota, your actual cost may be lower.

### Can I add custom pricing?
Not currently. Custom pricing would require editing the bundled pricing tables. This is a planned feature.
