# BYOK Templates

This folder contains pre-configured provider templates in the **same format as VS Code's `chatLanguageModels.json`**. They can be used in two ways:

1. **Copy-paste manually** — Open a `.chatLanguageModels.json` file, copy its contents (a pure JSON array), and paste into your `chatLanguageModels.json`. Then enter keys via VS Code's **Chat: Manage Language Models** UI.
2. **Import via extension** — Run `BYOK: Add Provider` from the command palette; the extension collects API keys and adds them programmatically.

## File Structure

Templates come in **paired files** per provider:

| File | Purpose |
|---|---|
| `<name>.byok.json` | UI metadata (display name, description, keyUrl, keyInstructions) used by the extension |
| `<name>.chatLanguageModels.json` | A pure JSON array in chatLanguageModels.json format, ready for copy-paste. API keys are `"YOUR_API_KEY_HERE"` placeholders. |

Example (OpenCode Go, single key):

```
byok-templates/
├── opencode-go.single.byok.json              # UI metadata
├── opencode-go.single.chatLanguageModels.json  # copy-paste ready array
├── opencode-go.multi.byok.json               # multi-key metadata
├── opencode-go.multi.chatLanguageModels.json   # multi-key array (6 groups)
├── clinepass.single.byok.json                  # ClinePass single-key metadata
├── clinepass.single.chatLanguageModels.json     # ClinePass single-key array
├── clinepass.multi.byok.json                   # ClinePass multi-key metadata
├── clinepass.multi.chatLanguageModels.json      # ClinePass multi-key array (3 groups)
├── ali-coding-plan.cn.byok.json               # Alibaba Coding Plan (CN) metadata
├── ali-coding-plan.cn.single.chatLanguageModels.json
├── ali-coding-plan.cn.multi.chatLanguageModels.json
├── ali-coding-plan.global.byok.json            # Alibaba Coding Plan (Global) metadata
├── ali-coding-plan.global.single.chatLanguageModels.json
├── ali-coding-plan.global.multi.chatLanguageModels.json
├── ali-token-plan.cn.byok.json                # Alibaba Token Plan (CN) metadata
├── ali-token-plan.cn.single.chatLanguageModels.json
├── ali-token-plan.cn.multi.chatLanguageModels.json
├── ali-token-plan.global.byok.json             # Alibaba Token Plan (Global) metadata
├── ali-token-plan.global.single.chatLanguageModels.json
├── ali-token-plan.global.multi.chatLanguageModels.json
├── feimacode.byok.json                          # Feima Code metadata
├── feimacode.chatLanguageModels.json            # Feima Code model array
├── deepseek.byok.json
├── deepseek.chatLanguageModels.json
├── mistral.byok.json
├── mistral.chatLanguageModels.json
├── openrouter.byok.json
├── openrouter.chatLanguageModels.json
├── byteplus.single.byok.json
├── byteplus.single.chatLanguageModels.json
├── byteplus.multi.byok.json
└── byteplus.multi.chatLanguageModels.json
```

## How to Use Manually

1. Open a `.chatLanguageModels.json` file in any editor
2. Copy the entire contents (a JSON array `[...]`)
3. Paste it into your `chatLanguageModels.json` (append to existing array, or replace it entirely)
4. Open VS Code's **Chat: Manage Language Models** command
5. For each group, click the gear icon and enter your API key
6. VS Code encrypts the key in the OS keystore and replaces `"YOUR_API_KEY_HERE"` with `"${input:chat.lm.secret.xxx}"`

## How the Extension Imports

When you run `BYOK: Add Provider` in VS Code:

1. The extension scans this folder for `*.byok.json` templates
2. You pick a template from the quick pick
3. The extension reads the linked `.chatLanguageModels.json` file
4. The extension collects API key(s) via password input
5. Each group is added via `lm.addLanguageModelsProviderGroup` (VS Code encrypts the key in the OS keystore)
6. Groups appear in VS Code's chat model picker

## File Format

### `.byok.json` (metadata)

```json
{
  "name": "opencode-go",
  "displayName": "OpenCode Go (single key)",
  "description": "OpenCode Go — $5 first month, $10/month.",
  "keyUrl": "https://opencode.ai/auth",
  "keyInstructions": "Subscribe to OpenCode Go at https://opencode.ai/auth, then copy your API key.",
  "keyCount": 1,
  "keyLabels": ["OpenCode Go API Key"],
  "chatLanguageModelsFile": "opencode-go.single.chatLanguageModels.json"
}
```

### `.chatLanguageModels.json` (array, ready to copy-paste)

```json
[
  {
    "name": "OpenCode Go - OpenAI",
    "vendor": "customendpoint",
    "apiType": "chat-completions",
    "apiKey": "YOUR_API_KEY_HERE",
    "models": [
      { "id": "kimi-k2.7-code", "name": "Kimi K2.7 Code", "url": "https://opencode.ai/zen/go/v1/chat/completions", "toolCalling": true, "vision": false, "maxInputTokens": 200000, "maxOutputTokens": 64000 }
    ]
  },
  {
    "name": "OpenCode Go - Anthropic",
    "vendor": "customendpoint",
    "apiType": "messages",
    "apiKey": "YOUR_API_KEY_HERE",
    "models": [ ... ]
  }
]
```

This format **exactly matches** what VS Code's `chatLanguageModels.json` schema expects — see `src/vs/workbench/contrib/chat/common/languageModelsConfiguration.ts` in the VS Code source for the official schema.

## Multi-Key Support

For multi-key templates (e.g. `opencode-go.multi`, `clinepass.multi`), add `keyCount` and `keyLabels` to the `.byok.json` file.

### OpenCode Go — Two Groups Per Key (Anthropic + OpenAI API)

OpenCode Go models use two different API formats:
- **Chat Completions** (`/v1/chat/completions`) — for Kimi, DeepSeek, MiMo
- **Messages** (`/v1/messages`) — for MiniMax, Qwen

Since VS Code's `customendpoint` vendor requires a single `apiType` per group, each key/account is split into two groups. **You only enter the key once** — the extension applies it to both groups.

Example: `opencode-go.multi` creates 6 groups (2 per account):
- `OpenCode Go 1 - OpenAI` (key 1, chat-completions)
- `OpenCode Go 1 - Anthropic` (key 1, messages)
- `OpenCode Go 2 - OpenAI` (key 2, chat-completions)
- `OpenCode Go 2 - Anthropic` (key 2, messages)
- `OpenCode Go 3 - OpenAI` (key 3, chat-completions)
- `OpenCode Go 3 - Anthropic` (key 3, messages)

### ClinePass — One Group Per Key

ClinePass uses a single OpenAI-compatible endpoint (`https://api.cline.bot/api/v1/chat/completions`) for all models. Each API key gets its own group with all 10 models. The multi-key template creates 3 groups:

- `ClinePass 1` (key 1)
- `ClinePass 2` (key 2)
- `ClinePass 3` (key 3)

Model IDs use the `cline-pass/` prefix (e.g. `cline-pass/glm-5.2`, `cline-pass/kimi-k2.7-code`).

### Feima Code — One Group Per Key

Feima Code uses a single OpenAI-compatible endpoint (`https://api.feimacode.com/v1/chat/completions`) for all models. Each API key gets its own group with all 15 models. The multi-key template creates 3 groups:

- `Feima Code 1` (key 1)
- `Feima Code 2` (key 2)
- `Feima Code 3` (key 3)

Model IDs have no prefix (e.g. `qwen3.6-flash`, `glm-5.2`, `deepseek-v4-pro`).

## Adding a New Template

1. Create `<name>.byok.json` with the metadata fields
2. Create `<name>.chatLanguageModels.json` with the array (set `apiKey: "YOUR_API_KEY_HERE"`)
3. Set `chatLanguageModelsFile` in the `.byok.json` to reference the array file
4. Run `BYOK: Add Provider` from the command palette — your template will appear

## Model Endpoint Reference

### OpenCode Go

The official endpoints table is at:
- <https://opencode.ai/docs/go/#endpoints>

Models that use the **Messages** API (`apiType: "messages"`):
- minimax-*, qwen*

Models that use the **Chat Completions** API (`apiType: "chat-completions"`):
- kimi-*, deepseek-*, mimo-*

### ClinePass

The official models list is at:
- <https://docs.cline.bot/getting-started/clinepass#models>

All models use the **Chat Completions** API (`apiType: "chat-completions"`) at:
- `https://api.cline.bot/api/v1/chat/completions`

Model IDs use the `cline-pass/` prefix:
- `cline-pass/glm-5.2`, `cline-pass/kimi-k2.7-code`, `cline-pass/kimi-k2.6`
- `cline-pass/deepseek-v4-pro`, `cline-pass/deepseek-v4-flash`
- `cline-pass/mimo-v2.5-pro`, `cline-pass/mimo-v2.5`
- `cline-pass/minimax-m3`
- `cline-pass/qwen3.7-max`, `cline-pass/qwen3.7-plus`

### Feima Code

All models use the **Chat Completions** API (`apiType: "chat-completions"`) at:
- `https://api.feimacode.com/v1/chat/completions`

Model IDs have no prefix:
- `qwen3.6-flash`, `qwen3.6-plus`, `qwen3.7-plus`, `qwen3.7-max`
- `deepseek-v4-flash`, `deepseek-v4-pro`
- `minimax-m2.5`, `minimax-m3`
- `kimi-k2.6`, `kimi-k2.7-code`
- `mimo-v2.5`, `mimo-v2.5-pro`
- `glm-5`, `glm-5.1`, `glm-5.2`
