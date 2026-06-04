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

- [Coding Plans](#coding-plans)
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

## Coding Plans

Subscription-based AI coding services that provide access to coding-capable models through IDE integrations, CLI tools, or API endpoints. These plans typically offer fixed monthly pricing with usage quotas, distinct from pay-per-use API billing. Ideal for developers who want predictable costs and generous quotas for agent-based coding workflows.

### IDE-Native Coding Plans

Subscriptions tied to specific AI-powered IDEs, often including model access and agent features.

| Plan | Price | Included Quota | Notable Features |
|---|---|---|---|
| [Cursor Pro](https://cursor.com/pricing) | $20/mo | Usage-based allowance | Agent mode, frontier models (Claude, GPT, Gemini), MCP support, cloud agents |
| [Cursor Pro+](https://cursor.com/pricing) | $40/mo | Extended limits | Everything in Pro + higher quotas |
| [Cursor Ultra](https://cursor.com/pricing) | Custom | Maximum limits | Enterprise features, pooled usage |
| [Devin Pro](https://devin.ai/pricing) | $20/mo | Daily/weekly quota | Devin Cloud agents, full model access, unlimited Tab completions |
| [Devin Max](https://devin.ai/pricing) | $200/mo | Significantly higher | Power user quotas, all premium models |
| [Devin Teams](https://devin.ai/pricing) | $80/mo + $40/user | Shared quotas | Unlimited team members, collaboration, centralized billing |
| [Kiro Pro](https://kiro.dev/pricing) | $20/mo | 1,000 credits | AWS's agentic IDE, premium models, pay-per-use overage ($0.04/credit) |
| [Kiro Pro+](https://kiro.dev/pricing) | $40/mo | 2,000 credits | Higher quota, same premium model access |
| [Kiro Power](https://kiro.dev/pricing) | $200/mo | 10,000 credits | Maximum individual quota |
| [Amazon Q Developer Pro](https://aws.amazon.com/q/developer/pricing/) | $19/mo | Increased agentic requests | Claude models, IDE + CLI, admin controls, IP indemnity |
| [Zed Pro](https://zed.dev/pricing) | $10/mo | $5 of tokens included | Unlimited edit predictions, usage-based beyond included |
| [Trae Pro](https://trae.ai/pricing) | $10/mo | $20 basic + bonus usage | Unlimited autocomplete, 7-day free trial |

### CLI-Native Coding Plans

Subscriptions designed for terminal-based coding agents and CLI workflows.

| Plan | Price | Included Quota | Notable Features |
|---|---|---|---|
| [Codex (ChatGPT Go)](https://chatgpt.com/codex/pricing/) | $10/mo | Limited trial access | GPT-5.5 access, more messages/uploads than free, latest models |
| [Codex (ChatGPT Plus)](https://chatgpt.com/codex/pricing/) | $20/mo | 30-150 local messages/5h, 10-60 cloud tasks/5h | GPT-5.3-Codex, code reviews, macOS/Windows app, plugin integrations |
| [Codex (ChatGPT Pro)](https://chatgpt.com/codex/pricing/) | $100/mo | 5x-20x Plus usage, maximum Codex tasks | GPT-5.5 Pro, unlimited GPT-5.5, maximum cloud tasks |
| [Codex Business](https://chatgpt.com/codex/pricing/) | Pay-as-you-go | No fixed seat fee | Multi-agent workflows, worktrees, cloud environments, SAML SSO |
| [Google AI Pro](https://geminicli.com/plans/) | $19.99/mo | Higher usage limits | Gemini CLI, Antigravity IDE, Gemini Code Assist, Gemini in Gmail/Docs |
| [Google AI Ultra](https://geminicli.com/plans/) | $249.99/mo | Highest usage limits | Deep Think for complex reasoning, maximum quotas |
| [Claude Pro](https://claude.ai) | $20/mo | Claude Code CLI access | Claude Opus 4.7, Sonnet 4.6, strong reasoning, 1M context |
| [Claude Pro Max 5X](https://claude.ai) | $100/mo | 5x Pro usage | Everything in Pro, expanded limits |
| [Claude Pro Max 20X](https://claude.ai) | $200/mo | 20x Pro usage | Everything in Pro, maximum limits |

### Multi-Model Coding Plans (BYOK-Friendly)

Subscriptions that provide access to multiple models through OpenAI/Anthropic-compatible APIs, usable with various coding tools (Claude Code, Cursor, Cline, Roo Code, etc.).

> **Note:** Quota comparisons to "Claude Pro" are vendor-provided benchmarks for equivalent usage value — these plans do **not** include Claude model access.

| Plan | Price | Quota | Models | Notable Features |
|---|---|---|---|---|
| [BytePlus ModelArk Lite](https://www.byteplus.com/en/activity/codingplan) | $10/mo ($30/quarter) | ~3x Claude Pro equivalent | DeepSeek-V4, GLM-5.1, Kimi-K2.5, GPT-OSS, Dola-Seed-2.0-pro | Claude Code, Cursor, Roo Code support; flexible model selection |
| [BytePlus ModelArk Pro](https://www.byteplus.com/en/activity/codingplan) | $50/mo ($150/quarter) | 5x Lite usage | Same as Lite | ArkClaw AI companion (Lark integration), large-scale programming |
| [Alibaba Coding Plan Pro](https://www.alibabacloud.com/help/en/model-studio/coding-plan) | $50/mo | 6,000 req/5h, 45,000 req/week, 90,000 req/mo | Qwen3.7-plus, Kimi-K2.5, GLM-5, MiniMax-M2.5 | Claude Code, Cursor, OpenCode, Cline support; limited slots, daily restock |
| [Z.ai GLM Lite](https://z.ai/subscribe) | $18/mo ($16.2/mo quarterly) | ~3x Claude Pro equivalent | GLM-5.1, plus other flagship models | 20+ coding tools support, MCP tools included |
| [Z.ai GLM Pro](https://z.ai/subscribe) | $72/mo ($64.8/mo quarterly) | 5x Lite usage | Same as Lite | Priority model access, faster generation, curated MCP tools |
| [Z.ai GLM Max](https://z.ai/subscribe) | $160/mo ($144/mo quarterly) | 20x Lite usage | Same as Lite | First access to new features, dedicated peak-time resources |
| [MiniMax Token Plan Lite](https://platform.minimax.io/docs/guides/pricing-token-plan) | $20/mo | 3-4 agents/5h window | MiniMax-M3, M2.7, all platform models | Agent workflows, multimodal support |
| [MiniMax Token Plan Standard](https://platform.minimax.io/docs/guides/pricing-token-plan) | $50/mo | 4-5 agents/5h window | Same as Lite | Daily coding with agents, multimodal work |
| [MiniMax Token Plan Pro](https://platform.minimax.io/docs/guides/pricing-token-plan) | $120/mo | 6-7 agents/5h window | Same as Lite | Heavy agent workflows, extended sessions |
| [Feima Copilot Starter Pack](https://feimacode.com/pricing) | $10 (pay-as-you-go) | 500 weighted requests | Qwen3 Flash, Qwen3 Coder Plus, Qwen3 Max, Qwen3.5 Plus, MiniMax M2.5, Kimi K2.5, +2 more | VS Code extension, weighted request billing, 1M context on select models |
| [Feima Copilot Value Pack](https://feimacode.com/pricing) | $20 (pay-as-you-go) | 1100 weighted requests (10% bonus) | Same as Starter | Higher quota, all models available |
| [Feima Copilot Pro Pack](https://feimacode.com/pricing) | $50 (pay-as-you-go) | 3000 weighted requests (20% bonus) | Same as Starter | Maximum quota, premium model access |
| [Kimi Moderato](https://www.kimi.com/membership/pricing) | $15/mo (annual) / $19/mo (monthly) | 1x Kimi Code credits | Kimi-K2.5 | Kimi Code access, agent multi-tasking, deep research |
| [Kimi Allegretto](https://www.kimi.com/membership/pricing) | $31/mo (annual) / $39/mo (monthly) | 5x Kimi Code credits | Kimi-K2.5 | Kimi Claw exclusive, 2x agent credits |
| [Kimi Allegro](https://www.kimi.com/membership/pricing) | $79/mo (annual) / $99/mo (monthly) | 15x Kimi Code credits | Kimi-K2.5 | 5x agent credits, Agent Swarm, Kimi Work scheduled tasks |
| [Kimi Vivace](https://www.kimi.com/membership/pricing) | $159/mo (annual) / $199/mo (monthly) | 30x Kimi Code credits | Kimi-K2.5 | 10x agent credits, maximum concurrent tasks |

### Free Coding Options

No-cost options with usage limits, suitable for light coding tasks or experimentation.

| Option | Price | Limits | Notable Features |
|---|---|---|---|
| [Feima Copilot](https://feimacode.com/pricing) | Free | 700 weighted requests (1st month), 300/month thereafter | Weighted request-based billing, multiple model tiers |
| [Codex Free](https://chatgpt.com/codex/pricing/) | Free | Limited trial access | Test Codex capabilities, GPT-5.5 limited |
| [Google AI Free](https://geminicli.com/plans/) | Free | 1000 req/day (Code Assist), 50 credits/day (Antigravity) | Gemini CLI, Gemini Code Assist IDE extension; transitions to Antigravity CLI on June 18, 2026 |
| [Amazon Q Developer Free](https://aws.amazon.com/q/developer/) | Free | 50 agentic requests/month | Claude models, IDE + CLI access |
| [Kiro Free](https://kiro.dev/pricing) | Free | 50 credits/month | Open-weight models + Claude Sonnet 4.5 |
| [Devin Free](https://devin.ai/pricing) | Free | Light quota | Limited models, unlimited Tab completions |
| [Cursor Hobby](https://cursor.com/pricing) | Free | Limited Agent/Tab | No credit card required |
| [NVIDIA NIM](https://build.nvidia.com) | Free | Up to 40 rpm | DeepSeek V4, GLM, MiniMax models — rate-limited, no stability guarantee |
| [Ollama](https://ollama.com) | Free | Unlimited local | Run open-weight models locally (llama.cpp) |


### Choosing a Coding Plan

**Consider these factors when selecting a plan:**

1. **Usage intensity** — Light users may find free tiers sufficient; heavy users often benefit from subscriptions or pay-per-use APIs
2. **Model preference** — Different plans emphasize different models (Claude vs GPT vs Gemini vs GLM vs DeepSeek)
3. **Integration needs** — IDE-native plans vs. CLI tools vs. multi-model API plans for BYOK tools
4. **Privacy requirements** — Some plans train on user data; check data policies for sensitive codebases
5. **Budget predictability** — Fixed subscriptions vs. variable API costs

**Cost optimization tips:**

- Use smaller/faster models (Haiku, GPT-5.2 Mini, DeepSeek Flash, Qwen-Coder) for routine tasks
- Be precise with prompts to reduce token consumption
- Monitor usage dashboards to avoid unexpected charges
- Multi-model plans (BytePlus, Alibaba, Z.ai) offer high quotas at competitive prices
- Local models via Ollama eliminate per-token costs entirely (requires capable hardware)

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
| [OpenCode](https://opencode.ai) | MIT | Yes (open source) | 170k+ GitHub stars, LSP-enabled, multi-session, share links, desktop app available, 75+ LLM providers |
| [Cline](https://cline.bot) | Apache 2.0 | Yes (open source) | 62.7k+ GitHub stars, multi-agent teams, scheduled agents, MCP marketplace, Slack/Telegram/Discord connectors |
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
| [Feima Copilot](https://marketplace.visualstudio.com/items?itemName=feima.copilot-more-llms) | VS Code | Yes (700 weighted requests 1st mo, 300/mo thereafter) | Weighted request-based billing, multiple model tiers (Qwen, MiniMax, Kimi), 1M context on select models |
| [Cline](https://cline.bot/ide) | VS Code, JetBrains | Yes (open source) | Plan/Act modes, multi-agent teams, MCP servers, .clinerules for project-specific guidance |
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
| [Cline](https://cline.bot) | CLI Agent / Extension | Anthropic, OpenAI, Google, OpenRouter, AWS Bedrock, Azure/GCP Vertex, Ollama, any OpenAI-compatible API |
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
| [OpenCode](https://github.com/anomalyco/opencode) | MIT | 170k+ | TypeScript |
| [Ollama](https://github.com/ollama/ollama) | MIT | 100k+ | Go |
| [Cline](https://github.com/cline/cline) | Apache 2.0 | 62.7k+ | TypeScript |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | MIT | 40k+ | Python |
| [Tabby](https://github.com/TabbyML/tabby) | Apache 2.0 | 22k+ | Rust |
| [Aider](https://github.com/paul-gauthier/aider) | Apache 2.0 | 25k+ | Python |
| [Continue](https://github.com/continuedev/continue) | Apache 2.0 | 20k+ | TypeScript |
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

## Model → Plan Mapping

Which coding plans include access to specific models. BYOK tools (Cursor, Cline, Continue, Aider, etc.) can use any model via API key.

### Claude Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| Claude Opus 4.7 | Claude Pro, Claude Pro Max 5X, Claude Pro Max 20X | Cursor, Cline, Continue, Aider, Amazon Q Developer Pro |
| Claude Sonnet 4.6 | Claude Pro, Claude Pro Max 5X, Claude Pro Max 20X | Cursor, Cline, Continue, Aider, Amazon Q Developer Pro, Kiro Free |
| Claude (general) | Cursor Pro/Pro+/Ultra, Devin Pro/Max/Teams, Kiro Pro/Pro+/Power, Amazon Q Developer Pro | All BYOK tools |

### GPT Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| GPT-5.5 | Codex (ChatGPT Go), Codex (ChatGPT Pro) | Cursor, Cline, Continue, Aider |
| GPT-5.3-Codex | Codex (ChatGPT Plus) | Cursor, Cline, Continue, Aider |
| GPT-5.5 Pro | Codex (ChatGPT Pro) | Cursor, Cline, Continue, Aider |
| GPT-4o | Cursor Pro/Pro+/Ultra, Devin Pro/Max/Teams, Kiro Pro/Pro+/Power | All BYOK tools |

### Gemini Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| Gemini 2.5 Pro | Google AI Pro, Google AI Ultra, Antigravity IDE | Cursor, Cline, Continue, Aider, Google Gemini Code Assist |
| Gemini 2.5 Flash | Google AI Pro, Google AI Ultra | Cursor, Cline, Continue, Aider |
| Gemini (general) | Google AI Free (limited), Google Gemini Code Assist Enterprise | All BYOK tools |

### DeepSeek Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| DeepSeek V4 | BytePlus ModelArk (Lite/Pro), NVIDIA NIM (free tier) | Cursor, Cline, Continue, Aider, Fireworks AI, Together AI |
| DeepSeek V3 | Alibaba Coding Plan Pro | Cursor, Cline, Continue, Aider |
| DeepSeek R1 | Alibaba Coding Plan Pro | Cursor, Cline, Continue, Aider |

### Qwen Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| Qwen3.7-plus | Alibaba Coding Plan Pro | Cursor, Cline, Continue, Aider |
| Qwen3 Coder Plus | Feima Copilot (Starter/Value/Pro) | Cursor, Cline, Continue, Aider |
| Qwen3 Flash | Feima Copilot (Starter/Value/Pro) | Cursor, Cline, Continue, Aider |
| Qwen3 Max | Feima Copilot (Starter/Value/Pro) | Cursor, Cline, Continue, Aider |
| Qwen3.5 Plus | Feima Copilot (Starter/Value/Pro) | Cursor, Cline, Continue, Aider |
| Qwen2.5-Coder | Ollama (local), Fireworks AI, Together AI | Cursor, Cline, Continue, Aider |

### GLM Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| GLM-5.1 | BytePlus ModelArk (Lite/Pro), Z.ai GLM (Lite/Pro/Max) | Cursor, Cline, Continue, Aider |
| GLM-5 | Alibaba Coding Plan Pro | Cursor, Cline, Continue, Aider |

### Kimi Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| Kimi-K2.5 | BytePlus ModelArk (Lite/Pro), Alibaba Coding Plan Pro, Feima Copilot (Starter/Value/Pro) | Cursor, Cline, Continue, Aider |
| Kimi-K2.5 (Kimi Code) | Kimi Moderato, Kimi Allegretto, Kimi Allegro, Kimi Vivace | Cursor, Cline, Continue, Aider |

### MiniMax Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| MiniMax-M3 | MiniMax Token Plan (Lite/Standard/Pro) | Cursor, Cline, Continue, Aider |
| MiniMax-M2.7 | MiniMax Token Plan (Lite/Standard/Pro) | Cursor, Cline, Continue, Aider |
| MiniMax-M2.5 | Alibaba Coding Plan Pro, Feima Copilot (Starter/Value/Pro) | Cursor, Cline, Continue, Aider |

### Llama Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| Llama 3.x | Ollama (local), Groq (hosted), Fireworks AI, Together AI | All BYOK tools |
| Llama 4 | Ollama (local), Fireworks AI, Together AI | All BYOK tools |

### Other Models

| Model | Coding Plans | BYOK Tools |
|---|---|---|
| GPT-OSS | BytePlus ModelArk (Lite/Pro) | Cursor, Cline, Continue, Aider |
| Dola-Seed-2.0-pro | BytePlus ModelArk (Lite/Pro) | Cursor, Cline, Continue, Aider |
| Mixtral | Groq (hosted), Fireworks AI, Together AI | Cursor, Cline, Continue, Aider |
| Codestral | Mistral AI (API) | Cursor, Cline, Continue, Aider |
| Mistral Large | Mistral AI (API) | Cursor, Cline, Continue, Aider |

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
