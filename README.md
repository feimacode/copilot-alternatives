# Copilot Alternatives

A curated collection of GitHub Copilot alternatives for developers, teams, and organizations.

Recent changes to AI coding assistant pricing, usage limits, and licensing models have prompted many developers to re-evaluate their tooling choices. This repository aims to provide an objective reference for the growing ecosystem of AI-powered coding tools.

The focus is on solutions that support one or more of the following:

- AI-powered IDEs
- Terminal and CLI coding agents
- VS Code extensions
- JetBrains plugins
- Bring-Your-Own-Key (BYOK) solutions
- Open-source coding assistants
- Self-hosted and privacy-focused options
- Multi-model platforms
- Enterprise and team-oriented solutions

---

## Table of Contents

- [Goals](#goals)
- [Categories](#categories)
- [Contributing](#contributing)

---

## Goals

- Provide a vendor-neutral comparison of available options
- Help developers discover tools that match their workflow and budget
- Track pricing models, supported LLMs, and key capabilities
- Document migration paths away from GitHub Copilot
- Highlight open-source and self-hosted alternatives

---

## Categories

- [IDEs & Editors](#ides--editors)
- [CLI Agents](#cli-agents)
- [Extensions & Plugins](#extensions--plugins)
- [BYOK Solutions](#byok-solutions)
- [Self-Hosted Platforms](#self-hosted-platforms)
- [Open-Source Projects](#open-source-projects)
- [Enterprise Solutions](#enterprise-solutions)
- [Model Providers](#model-providers)
- [Pricing Comparisons](#pricing-comparisons)
- [Migration Guides](#migration-guides)

---

## IDEs & Editors

Full AI-native development environments — editors built around AI from the ground up rather than retrofitted with a plugin.

| Tool | Based On | Free Tier | Notable Features |
|---|---|---|---|
| [Cursor](https://cursor.sh) | VS Code fork | Yes (limited) | Agent mode, multi-file edits, BYOK, codebase indexing |
| [Antigravity](https://antigravity.google) | VS Code fork (possibly Windsurf fork) | Yes (free preview) | Google's agent-first IDE; Gemini 3.1 Pro + multi-model (Claude, GPT-OSS-120B); parallel multi-agent manager view; artifact-based task verification |
| [Kiro](https://kiro.dev) | VS Code fork | Yes (preview) | AWS's agentic IDE, spec-driven development, agent hooks, MCP support |
| [Windsurf/Devin Desktop](https://codeium.com/windsurf) | VS Code fork | Yes | Cascade agent, Codeium models + BYOK |
| [Void](https://voideditor.com) | VS Code fork | Yes (OSS) | Open-source Cursor alternative, BYOK, local models |
| [Zed](https://zed.dev) | Native (Rust) | Yes | Built-in AI panel, fast performance, multi-model |
| [PearAI](https://trypear.ai) | VS Code fork | Yes | Open-source, BYOK, Claude/GPT/local model support |

---

## CLI Agents

Terminal-based and agentic coding tools that operate in your shell, often capable of multi-step autonomous tasks.

| Tool | License | Free Tier | Notable Features |
|---|---|---|---|
| [Claude Code](https://claude.ai/code) | Proprietary | No (API usage) | Anthropic's official CLI agent, strong agentic reasoning |
| [Aider](https://aider.chat) | Apache 2.0 | Yes (BYOK) | Git-aware, multi-file edits, supports many models |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | MIT | Yes (BYOK) | Formerly OpenDevin, browser + terminal agent |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Apache 2.0 | Yes (free quota) | Google's official CLI agent, 1M token context |
| [Codex CLI](https://github.com/openai/codex) | Apache 2.0 | No (API usage) | OpenAI's open-source CLI agent |
| [Amazon Q Developer CLI](https://aws.amazon.com/q/developer/) | Proprietary | Yes | AWS-integrated, free for individual use |
| [Goose](https://github.com/block/goose) | Apache 2.0 | Yes (BYOK) | Block's open-source autonomous dev agent |
| [Amp](https://ampcode.com) | Proprietary | Yes (beta) | Sourcegraph's terminal-first agent |

---

## Extensions & Plugins

AI coding assistants delivered as extensions for existing editors — VS Code, JetBrains, Neovim, Emacs, and others.

| Tool | Editors | Free Tier | Notable Features |
|---|---|---|---|
| [Codeium](https://codeium.com) | VS Code, JetBrains, Neovim, + more | Yes (generous) | Fast autocomplete, chat, free for individuals |
| [Continue](https://continue.dev) | VS Code, JetBrains | Yes (OSS) | Open-source, BYOK, local model support |
| [Tabnine](https://tabnine.com) | VS Code, JetBrains, + more | Yes (limited) | Privacy-focused, local inference option |
| [Amazon Q Developer](https://aws.amazon.com/q/developer/) | VS Code, JetBrains | Yes | Free tier, AWS integration, security scanning |
| [Google Gemini Code Assist](https://cloud.google.com/products/gemini/code-assist) | VS Code, JetBrains | Yes (free tier) | Gemini models, GCP integration |
| [Supermaven](https://supermaven.com) | VS Code, JetBrains, Neovim | Yes | Very fast autocomplete, 1M token context |
| [Cody](https://sourcegraph.com/cody) | VS Code, JetBrains | Yes | Sourcegraph-powered codebase context |
| [Pieces for Developers](https://pieces.app) | VS Code, JetBrains, + more | Yes | Snippet management + AI, works offline |
| [Avante.nvim](https://github.com/yetone/avante.nvim) | Neovim | Yes (OSS) | Cursor-like experience in Neovim, BYOK |

---

## BYOK Solutions

Bring-Your-Own-Key tools that use API keys you supply, giving you full control over model choice and cost.

| Tool | Type | Supported Models |
|---|---|---|
| [Continue](https://continue.dev) | Extension | Anthropic, OpenAI, Gemini, Ollama, any OpenAI-compatible endpoint |
| [Aider](https://aider.chat) | CLI Agent | Anthropic, OpenAI, Gemini, Groq, Ollama, DeepSeek, + more |
| [Cursor](https://cursor.sh) | IDE | Anthropic, OpenAI, Gemini (via API key mode) |
| [Void](https://voideditor.com) | IDE | Any OpenAI-compatible endpoint, Ollama |
| [Avante.nvim](https://github.com/yetone/avante.nvim) | Neovim extension | Anthropic, OpenAI, Gemini, Groq, Ollama |
| [Jan](https://jan.ai) | Desktop app | Local models (llama.cpp), remote API endpoints |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | CLI Agent | Anthropic, OpenAI, Gemini, Ollama, LiteLLM-compatible |

---

## Self-Hosted Platforms

On-premise and self-hosted options that keep code and data within your own infrastructure.

| Tool | License | Deployment | Notable Features |
|---|---|---|---|
| [Tabby](https://tabbyml.com) | Apache 2.0 | Docker / Kubernetes | Self-hosted code completion server, VS Code + JetBrains clients |
| [Ollama](https://ollama.com) | MIT | Local binary | Run LLMs locally, OpenAI-compatible API, used by many tools |
| [LM Studio](https://lmstudio.ai) | Proprietary (free) | Local desktop app | GUI for local models, OpenAI-compatible server |
| [LocalAI](https://localai.io) | MIT | Docker | Drop-in OpenAI API replacement, runs local models |
| [Continue](https://continue.dev) + Ollama | Apache 2.0 | Local | VS Code/JetBrains extension + local model backend |
| [Codeium Enterprise](https://codeium.com/enterprise) | Proprietary | On-prem / VPC | Enterprise self-hosted deployment of Codeium |
| [Gitea + Copilot-like backend](https://gitea.com) | MIT | Self-hosted | Gitea has LSP + AI integrations for self-hosted git workflows |

---

## Open-Source Projects

Community-maintained tools with open licenses — auditable, forkable, and free to self-host or modify.

| Tool | License | Stars (approx.) | Language |
|---|---|---|---|
| [Aider](https://github.com/paul-gauthier/aider) | Apache 2.0 | 25k+ | Python |
| [Continue](https://github.com/continuedev/continue) | Apache 2.0 | 20k+ | TypeScript |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | MIT | 40k+ | Python |
| [Void](https://github.com/voideditor/void) | Apache 2.0 | 15k+ | TypeScript |
| [Tabby](https://github.com/TabbyML/tabby) | Apache 2.0 | 22k+ | Rust |
| [Ollama](https://github.com/ollama/ollama) | MIT | 100k+ | Go |
| [LocalAI](https://github.com/mudler/LocalAI) | MIT | 25k+ | Go |
| [Goose](https://github.com/block/goose) | Apache 2.0 | 12k+ | Rust |
| [Avante.nvim](https://github.com/yetone/avante.nvim) | Apache 2.0 | 10k+ | Lua |
| [PearAI](https://github.com/trypear/pearai-app) | Apache 2.0 | 5k+ | TypeScript |

---

## Enterprise Solutions

AI coding platforms designed for teams and organizations, with features like SSO, audit logs, policy controls, and on-prem options.

| Tool | Vendor | Deployment | Notable Features |
|---|---|---|---|
| [GitHub Copilot Enterprise](https://github.com/features/copilot) | GitHub / Microsoft | Cloud | Codebase context, PR summaries, knowledge bases |
| [Amazon Q Developer Pro](https://aws.amazon.com/q/developer/) | AWS | Cloud | Code reviews, security scanning, AWS integration |
| [Google Gemini Code Assist Enterprise](https://cloud.google.com/products/gemini/code-assist) | Google | Cloud | GCP integration, custom model tuning |
| [Codeium Enterprise](https://codeium.com/enterprise) | Codeium | Cloud / On-prem | Self-hosted option, SOC 2, custom models |
| [Tabnine Enterprise](https://tabnine.com/enterprise) | Tabnine | Cloud / On-prem | Private model training on your codebase |
| [GitLab Duo](https://about.gitlab.com/gitlab-duo/) | GitLab | Cloud / Self-hosted | Integrated into GitLab DevSecOps platform |
| [Sourcegraph Cody Enterprise](https://sourcegraph.com/cody) | Sourcegraph | Cloud / On-prem | Codebase-aware context via Sourcegraph index |
| [JetBrains AI Pro](https://www.jetbrains.com/ai/) | JetBrains | Cloud | Native JetBrains IDE integration, team plans |

---

## Model Providers

Underlying LLM providers that power coding assistants. Many BYOK tools let you plug in any of these directly.

| Provider | Key Models (coding) | Free Tier | Notes |
|---|---|---|---|
| [Anthropic](https://anthropic.com) | Claude Sonnet, Claude Opus | No (API) | Strong at reasoning and long-context tasks |
| [OpenAI](https://openai.com) | GPT-4o, o3, o4-mini | No (API) | Widely supported across all tools |
| [Google DeepMind](https://deepmind.google) | Gemini 2.5 Pro, Flash | Yes (AI Studio) | 1M+ token context, free quota via AI Studio |
| [Mistral AI](https://mistral.ai) | Codestral, Mistral Large | No (API) | Codestral specialized for code; EU-based |
| [DeepSeek](https://deepseek.com) | DeepSeek V3, R1 | No (API) | Very cost-effective, strong code performance |
| [Meta](https://llama.meta.com) | Llama 3.x, Llama 4 | Yes (weights) | Open weights, runs locally via Ollama / LM Studio |
| [Qwen (Alibaba)](https://qwen.readthedocs.io) | Qwen2.5-Coder, Qwen3 | Yes (weights) | Strong coding models, open weights available |
| [Groq](https://groq.com) | Llama, Mixtral (hosted) | Yes (limited) | Extremely fast inference via custom hardware |
| [Fireworks AI](https://fireworks.ai) | Llama, DeepSeek, Qwen | No (API) | Fast inference, competitive pricing |
| [Together AI](https://together.ai) | Many open models | No (API) | Broad open-model support, fine-tuning |

---

## Pricing Comparisons

> Prices as of mid-2026. Always verify with the vendor — pricing changes frequently.

### Individual / Developer Plans

| Tool | Free Tier | Paid Tier | Notes |
|---|---|---|---|
| GitHub Copilot | No (removed) | $10/mo (Individual), $19/mo (Pro+) | Free tier discontinued; triggered many departures |
| Cursor | Yes (2-week trial) | $20/mo (Pro) | 500 fast requests/mo on Pro |
| Codeium / Windsurf | Yes (generous) | $15/mo (Pro) | Free tier includes unlimited autocomplete |
| Tabnine | Yes (limited) | $12/mo (Pro) | |
| Amazon Q Developer | Yes | $19/mo (Pro) | Free tier covers most individual use |
| Continue | Free (OSS) | — | Pay only for API usage to your chosen provider |
| Aider | Free (OSS) | — | Pay only for API usage |
| Claude Code | No | Pay-per-use (API) | ~$3–15/mo typical usage at current API rates |
| Gemini CLI | Yes (free quota) | Pay-per-use beyond quota | Generous free quota via Google AI Studio |

### Team / Enterprise Plans

| Tool | Per-Seat Price | Min Seats | Notes |
|---|---|---|---|
| GitHub Copilot Business | $19/seat/mo | 1 | |
| GitHub Copilot Enterprise | $39/seat/mo | 1 | |
| Amazon Q Developer Pro | $19/seat/mo | 1 | |
| Google Gemini Code Assist Enterprise | $19/seat/mo | 1 | |
| Codeium Enterprise | Custom | — | Contact sales |
| Tabnine Enterprise | Custom | — | Includes private model training |
| GitLab Duo Pro | $19/seat/mo | — | Bundled with GitLab tiers |

---

## Migration Guides

### From GitHub Copilot to Cursor
1. Install [Cursor](https://cursor.sh) — it's a VS Code fork, so your extensions and settings transfer
2. Sign in and choose your preferred model (Claude, GPT-4o, or BYOK)
3. Cursor imports your VS Code `keybindings.json` and `settings.json` automatically

### From GitHub Copilot to Continue (VS Code, BYOK)
1. Install the [Continue extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue)
2. Add your API key (Anthropic, OpenAI, Gemini, or point to a local Ollama instance)
3. Configure `~/.continue/config.json` to set your preferred model and context providers
4. Inline completions replace Copilot's tab-complete; `Ctrl+I` opens the chat panel

### From GitHub Copilot to Aider (CLI)
1. `pip install aider-chat`
2. Set your API key: `export ANTHROPIC_API_KEY=...` or `export OPENAI_API_KEY=...`
3. Run `aider` in your repo — it reads your git history for context
4. Use `/add <file>` to include files in context, then describe changes in plain English

### From GitHub Copilot to Codeium (drop-in free replacement)
1. Uninstall the GitHub Copilot extension
2. Install [Codeium for VS Code](https://marketplace.visualstudio.com/items?itemName=Codeium.codeium) or the JetBrains plugin
3. Sign up for a free account — no credit card required
4. Autocomplete and chat work out of the box with no API key needed

### Going fully local (privacy-first)
1. Install [Ollama](https://ollama.com) and pull a coding model: `ollama pull qwen2.5-coder:7b`
2. Install [Continue](https://continue.dev) in VS Code
3. Point Continue at `http://localhost:11434` (Ollama's default endpoint)
4. All inference runs on your machine — no data leaves your network

---

## Contributing

Contributions are welcome. Please help keep information accurate, current, and vendor-neutral.

- Open a pull request to add or update a tool
- Include pricing tier, supported models, and key capabilities where known
- Flag outdated entries with an issue rather than deleting them
- Avoid promotional language — describe what a tool does, not how great it is

> **Note:** This repository has no affiliation with any of the tools listed. All trademarks belong to their respective owners.
