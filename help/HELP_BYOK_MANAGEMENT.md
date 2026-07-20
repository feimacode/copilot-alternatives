# BYOK Provider Management

Bring Your Own Key (BYOK) — add, edit, and remove chat language model providers without touching JSON files.

---

## What is BYOK?

BYOK (**B**ring **Y**our **O**wn **K**ey) lets you use your own API keys from supported AI providers directly in VS Code's chat interface. Instead of using GitHub Copilot's built-in models, you can route chat requests through providers like DeepSeek, Mistral, OpenRouter, Alibaba, Feima Code, and others.

The extension stores these provider configurations in VS Code's `chatLanguageModels.json` file — the same file VS Code reads to populate the model picker in chat.

---

## Adding a Provider

### From the Sidebar

1. In the sidebar, click the **+** icon next to "BYOK & Model Management", or right-click it and choose "Add BYOK Provider (Single Key)" or "Add BYOK Provider (Multi Key)"
2. Pick a provider template from the list
3. If the template has required API keys, enter them when prompted
4. The provider appears in the sidebar under "BYOK & Model Management"

### From the Command Palette

1. Run `Copilot Alternatives: BYOK: Add Provider`
2. Choose a template
3. Enter your API key(s)
4. The provider is added and ready to use

### Single vs Multi-Key Providers

Some providers support multiple API formats:

- **Single key** — One API key for all models (e.g., DeepSeek, Mistral)
- **Multi key** — Separate keys for different endpoint types (e.g., one for OpenAI-compatible models, one for Anthropic-compatible models)

The extension handles both. Choose the appropriate option when adding.

---

## Managing Providers

### View Providers

All configured providers appear under **BYOK & Model Management** in the sidebar. Expand a provider to see its models.

### Edit a Provider

Right-click a provider in the sidebar and choose **Edit Provider**. The editor lets you change:
- Provider name
- Vendor
- API type

### Delete a Provider

Right-click a provider and choose **Delete Provider** to remove it and all its models.

### Managing Models

Expand a provider to see its models. Each model shows:
- Model name and ID
- Capabilities (tools, vision, thinking)
- Context window size

Right-click a model to:
- **Edit Model** — Change model name, ID, endpoint, or capabilities
- **Delete Model** — Remove the model from the provider

---

## Template Catalog

The extension ships with pre-configured templates for popular providers:

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

Templates include automatically populated model IDs and endpoint URLs — just paste your API key.

---

## Opening the JSON File

If you prefer to edit the configuration directly, click the **{}** icon in the sidebar title bar, or run `Copilot Alternatives: Open chatLanguageModels.json`. This opens the raw JSON file for manual editing.

---

## Troubleshooting

**Provider not appearing in chat?**
- Open VS Code's **Chat: Manage Language Models** command
- Check that your provider is listed and the key is set
- If the key shows `YOUR_API_KEY_HERE`, you need to configure it via the gear icon

**Models not showing up?**
- Ensure the provider has at least one model defined
- Check that the model's `id` matches what the provider expects

**API key not working?**
- Verify the key is valid and has not expired
- Check the provider's status page for service outages
- Try removing and re-adding the provider

---

## See Also

- [Getting Started](HELP_GETTING_STARTED.md) — Installation, sidebar overview, and first steps
- [Token Usage Tracking](HELP_TOKEN_USAGE.md) — Dashboards, status bar, and Copilot credit tracking in depth
- [Session Analytics](HELP_SESSION_ANALYTICS.md) — Browsing and filtering your chat session history
