# BYOK Provider Management

Bring Your Own Key (BYOK) lets you plug your own API keys into VS Code’s chat experience without editing JSON by hand.

![BYOK editor screenshot](https://raw.githubusercontent.com/feimacode/copilot-alternatives/master/assets/screenshots/byok-editor.png)

*The BYOK editor makes provider setup visual and guided instead of error-prone.*

---

## What BYOK Gives You

BYOK lets you use supported providers such as DeepSeek, Mistral, OpenRouter, Alibaba, Feima Code, and others directly in chat. The extension writes the provider config into VS Code’s `chatLanguageModels.json` file so the model picker can discover it.

---

## Adding a Provider

### From the Sidebar

1. In the sidebar, click the **+** icon next to **BYOK & Model Management**
2. Choose **Add BYOK Provider (Single Key)** or **Add BYOK Provider (Multi Key)**
3. Pick a template from the list
4. Enter your API key(s) when prompted
5. The provider appears under **BYOK & Model Management**

### From the Command Palette

1. Run `Copilot Alternatives: BYOK: Add Provider`
2. Choose a template
3. Enter the key(s)
4. Confirm and use the provider immediately

### Single vs Multi-Key Providers

- **Single key** — one key for all models, ideal for providers like DeepSeek or Mistral
- **Multi key** — separate keys for different endpoint types or model families

The extension handles both patterns and pre-populates model IDs and endpoints for you.

---

## Managing Providers and Models

After a provider is added, you can:

- expand it in the sidebar to see its models
- edit the provider name, vendor, or API type
- edit or remove individual models
- delete the provider entirely when you no longer need it

Right-click a provider or model for the available actions.

---

## Template Catalog

The extension ships with templates for popular providers:

| Provider | Key Type |
|---|---|
| DeepSeek | Single key |
| Mistral | Single key |
| OpenRouter | Single key |
| Alibaba Coding Plan | Multi key |
| Alibaba Token Plan | Multi key |
| Feima Code | Single key |
| BytePlus | Multi key |
| ClinePass | Multi key |
| OpenCode Go | Multi key |

Templates include model IDs and endpoint URLs so you can get started quickly.

---

## Opening the Raw JSON

If you prefer a manual edit, click the **{}** icon in the sidebar title bar or run `Copilot Alternatives: Open chatLanguageModels.json`.

---

## Troubleshooting

**Provider not appearing in chat?**
- open VS Code’s **Chat: Manage Language Models** command
- confirm the provider is present and the key is filled in
- if the key still says `YOUR_API_KEY_HERE`, update it from the editor

**Models not showing up?**
- make sure the provider has at least one model defined
- check that the model `id` matches the provider’s expected identifier

**API key not working?**
- verify the key is still valid
- check the provider’s service status page
- remove and re-add the provider if needed

---

## See Also

- [Getting Started](HELP_GETTING_STARTED.md) — Installation, sidebar overview, and first steps
- [Token Usage Tracking](HELP_TOKEN_USAGE.md) — Dashboards, status bar, and Copilot credit tracking in depth
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
