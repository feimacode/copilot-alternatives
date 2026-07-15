# Metrics Database — Schema & Type Reference

This document defines the SQLite database schema used by Copilot Alternatives
to store per-request chat metrics. It also documents the TypeScript row types,
aggregation query interfaces, and the JSONL-to-DB field mapping.

---

## 1. Tables

### 1.1 `processed_files` — Incremental Import Tracking

Tracks which `.jsonl` files have been imported. Content hash comparison
enables skip-unchanged incremental scans.

| Column | SQL Type | TS Type | Description |
|--------|----------|---------|-------------|
| `file_path` | `TEXT` | `string` | **PK.** Absolute path to the `.jsonl` file on disk. |
| `file_size` | `INTEGER` | `number` | File size in bytes at last import time. |
| `file_mtime` | `INTEGER` | `number` | File modification time (epoch ms) at last import. |
| `content_hash` | `TEXT` | `string` | SHA-256 hex digest of the full file content. |
| `last_imported` | `INTEGER` | `number` | Epoch ms when the file was last imported. |

**Incrementality check:**
1. If `file_path` not in table → import.
2. If `content_hash` differs from computed value → re-import (file changed).
3. If `content_hash` matches → skip (unchanged).

**TypeScript type:**
```typescript
interface ProcessedFileRow {
    file_path: string;
    file_size: number;
    file_mtime: number;
    content_hash: string;
    last_imported: number;
}
```

### 1.2 `sessions` — Chat Session Metadata

One row per chat session (one `.jsonl` file). Stores session-level model
metadata from `inputState.selectedModel`.

| Column | SQL Type | TS Type | Nullable | Source | Description |
|--------|----------|---------|----------|--------|-------------|
| `session_id` | `TEXT` | `string` | no | `state.sessionId` | **PK.** UUID of the session. |
| `file_path` | `TEXT` | `string` | no | disk path | **UNIQUE.** Source `.jsonl` file path. |
| `creation_date` | `INTEGER` | `number` | no | `state.creationDate` | Session creation time (epoch ms). |
| `initial_location` | `TEXT` | `string` | yes | `state.initialLocation` | `"panel"` / `"sidebar"` / `"tab"`. |
| `has_pending_edits` | `INTEGER` | `number` | no | `state.hasPendingEdits` | 0 or 1. Whether the session has uncommitted file edits. |
| `request_count` | `INTEGER` | `number` | no | `state.turns.length` | Total number of turns in this session. |
| `session_model_id` | `TEXT` | `string` | yes | `inputState.selectedModel.identifier` | Full model identifier, e.g. `"feima/deepseek-v4-pro"`. |
| `session_vendor` | `TEXT` | `string` | yes | `metadata.vendor` | Model vendor at session level. |
| `session_model_name` | `TEXT` | `string` | yes | `metadata.name` | Display name, e.g. `"[Feima] DeepSeek V4 Pro"`. |
| `session_family` | `TEXT` | `string` | yes | `metadata.family` | Model family, e.g. `"deepseek-v4"`. |
| `session_extension` | `TEXT` | `string` | yes | `metadata.extension.value` | Extension that registered the model, e.g. `"feima.copilot-more-llms"`. |
| `session_is_byok` | `INTEGER` | `number` | no | `metadata.isBYOK` | 0 or 1. Whether this is a bring-your-own-key model. |

**DDL:**
```sql
CREATE TABLE sessions (
    session_id          TEXT PRIMARY KEY,
    file_path           TEXT NOT NULL UNIQUE,
    creation_date       INTEGER NOT NULL,
    initial_location    TEXT,
    has_pending_edits   INTEGER DEFAULT 0,
    request_count       INTEGER DEFAULT 0,
    session_model_id    TEXT,
    session_vendor      TEXT,
    session_model_name  TEXT,
    session_family      TEXT,
    session_extension   TEXT,
    session_is_byok     INTEGER DEFAULT 0
);
```

**TypeScript type:**
```typescript
interface SessionRow {
    session_id: string;
    file_path: string;
    creation_date: number;
    initial_location: string | null;
    has_pending_edits: number;
    request_count: number;
    session_model_id: string | null;
    session_vendor: string | null;
    session_model_name: string | null;
    session_family: string | null;
    session_extension: string | null;
    session_is_byok: number;
}
```

### 1.3 `turns` — Per-Turn Metrics

One row per API call (turn). This is the **core metrics table**. Every column is
a scalar — no embedded objects, no JSON content stored. Array lengths are
used as proxy metrics for response complexity.

#### 1.3.1 Primary & Foreign Keys

| Column | Type | Description |
|--------|------|-------------|
| `request_id` | `TEXT PK` | UUID of this request. |
| `session_id` | `TEXT NOT NULL` | **FK → sessions.session_id ON DELETE CASCADE.** |

#### 1.3.2 Timing Columns

| Column | Type | Nullable | Source | Description |
|--------|------|----------|--------|-------------|
| `timestamp` | `INTEGER` | no | `req.timestamp` | When the request was sent (epoch ms). |
| `completed_at` | `INTEGER` | yes | `req.modelState.completedAt` | When the request finished (epoch ms). |
| `elapsed_ms` | `INTEGER` | yes | `req.elapsedMs` | End-to-end client-measured latency in ms. |
| `first_progress_ms` | `INTEGER` | yes | `result.timings.firstProgress` | Time to first response token in ms. Copilot-specific. |
| `total_elapsed_ms` | `INTEGER` | yes | `result.timings.totalElapsed` | Total agent-side elapsed time in ms. Copilot-specific. |
| `time_spent_waiting` | `INTEGER` | yes | `req.timeSpentWaiting` | Time waiting for user confirmation in ms. |

#### 1.3.3 Model & Vendor Columns

| Column | Type | Nullable | Source | Description |
|--------|------|----------|--------|-------------|
| `model_id` | `TEXT` | no | `req.modelId` | Full identifier, e.g. `"customendpoint/BytePlus/deepseek-v4-flash"`. |
| `vendor` | `TEXT` | no | **computed** | Resolved from `modelId` prefix. `customendpoint/X/Y` → `X`. |
| `model_name` | `TEXT` | yes | `metadata.name` | Display name from session model metadata. |
| `resolved_model` | `TEXT` | yes | `result.metadata.resolvedModel` | Actual model that served the request (e.g. `"deepseek-v4-flash"`). Copilot-specific. |

#### 1.3.4 Agent Columns

Flattened from `req.agent` — only the identifier, extension, and name are stored.
The `slashCommands`, `description`, `fullName`, and `metadata` fields are discarded.

| Column | Type | Nullable | Source | Description |
|--------|------|----------|--------|-------------|
| `agent_id` | `TEXT` | yes | `req.agent.id` | e.g. `"github.copilot.editsAgent"`. |
| `agent_extension` | `TEXT` | yes | `req.agent.extensionId.value` | e.g. `"GitHub.copilot-chat"`. |
| `agent_name` | `TEXT` | yes | `req.agent.name` | `"agent"` / `"ask"` / `"edit"`. |

#### 1.3.5 Token Columns

| Column | Type | Nullable | Default | Source | Description |
|--------|------|----------|---------|--------|-------------|
| `prompt_tokens` | `INTEGER` | no | `0` | `req.promptTokens` | Input tokens (actual API count). |
| `completion_tokens` | `INTEGER` | no | `0` | `req.completionTokens` | Output tokens (actual API count). |
| `output_buffer` | `INTEGER` | yes | — | `req.outputBuffer` | Output buffer size. |
| `copilot_credits` | `REAL` | yes | — | `req.copilotCredits` | Copilot credit consumption. |
| `system_instructions_pct` | `INTEGER` | no | `0` | `req.promptTokenDetails[*].percentageOfPrompt` where `category='System Instructions'` | Percentage of prompt consumed by system instructions. |
| `tool_definitions_pct` | `INTEGER` | no | `0` | `req.promptTokenDetails[*].percentageOfPrompt` where `category='Tool Definitions'` | Percentage of prompt consumed by tool definitions. |
| `messages_pct` | `INTEGER` | no | `0` | `req.promptTokenDetails[*].percentageOfPrompt` where `category='Messages'` | Percentage of prompt consumed by messages. |
| `files_pct` | `INTEGER` | no | `0` | `req.promptTokenDetails[*].percentageOfPrompt` where `category='Files'` | Percentage of prompt consumed by attached files. |
| `tool_results_pct` | `INTEGER` | no | `0` | `req.promptTokenDetails[*].percentageOfPrompt` where `category='Tool Results'` | Percentage of prompt consumed by tool results. |

#### 1.3.6 State & Interaction Columns

| Column | Type | Nullable | Default | Source | Description |
|--------|------|----------|---------|--------|-------------|
| `model_state` | `INTEGER` | no | `1` | `req.modelState.value` | 0=Pending, 1=Complete, 2=Cancelled, 3=Failed, 4=NeedsInput. |
| `vote` | `INTEGER` | yes | — | `req.vote` | User vote: +1=up, -1=down, null=none. |
| `user_message_length` | `INTEGER` | yes | — | `req.message.text.length` | Char count of user prompt. Proxy for input complexity. |
| `user_message_parts` | `INTEGER` | no | `1` | `req.message.parts.length` | Number of parsed message parts. |
| `mode_kind` | `TEXT` | yes | — | `req.modeInfo.kind` | `"agent"` / `"ask"` / `"edit"`. |
| `is_system_initiated` | `INTEGER` | no | `0` | `req.isSystemInitiated` | 0 or 1. |

#### 1.3.7 Array Count Columns (States, Not Content)

Arrays are **not stored** — only their lengths. This enforces the
"store states, not content" principle.

| Column | Type | Default | Source Array | Description |
|--------|------|---------|-------------|-------------|
| `response_part_count` | `INTEGER` | `0` | `req.response` | Number of response parts (markdown, tool invocations, etc.). |
| `content_ref_count` | `INTEGER` | `0` | `req.contentReferences` | Number of files referenced in context. |
| `code_citation_count` | `INTEGER` | `0` | `req.codeCitations` | Number of code citations. |
| `edited_file_count` | `INTEGER` | `0` | `req.editedFileEvents` | Number of files edited by this request. |
| `followup_count` | `INTEGER` | `0` | `req.followups` | Number of suggested followup questions. |
| `variable_count` | `INTEGER` | `0` | `req.variableData.variables` | Number of variable attachments. |

#### 1.3.8 Tool Call Columns (Copilot-specific)

Extracted from `result.metadata.toolCallRounds[]`. These are only populated
for Copilot models that report tool execution details.

| Column | Type | Default | Source | Description |
|--------|------|---------|--------|-------------|
| `tool_call_rounds` | `INTEGER` | `0` | `toolCallRounds.length` | Total number of tool call rounds. |
| `tool_call_count` | `INTEGER` | `0` | `Σ toolCalls.length` | Total number of individual tool calls across all rounds. |
| `thinking_tokens` | `INTEGER` | `0` | `Σ thinking.tokens` | Total thinking tokens across all rounds. |

#### 1.3.9 Cost Column

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `estimated_cost_usd` | `REAL` | yes | Estimated USD cost computed from `TokenCostEstimator` pricing tables. |

#### 1.3.10 Complete DDL

```sql
CREATE TABLE turns (
    request_id          TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    -- timing
    timestamp           INTEGER NOT NULL,
    completed_at        INTEGER,
    elapsed_ms          INTEGER,
    first_progress_ms   INTEGER,
    total_elapsed_ms    INTEGER,
    time_spent_waiting  INTEGER,
    -- model
    model_id            TEXT NOT NULL,
    vendor              TEXT NOT NULL,
    model_name          TEXT,
    resolved_model      TEXT,
    -- agent
    agent_id            TEXT,
    agent_extension     TEXT,
    agent_name          TEXT,
    -- tokens
    prompt_tokens       INTEGER DEFAULT 0,
    completion_tokens   INTEGER DEFAULT 0,
    output_buffer       INTEGER,
    copilot_credits     REAL,
    system_instructions_pct INTEGER DEFAULT 0,
    tool_definitions_pct    INTEGER DEFAULT 0,
    messages_pct            INTEGER DEFAULT 0,
    files_pct               INTEGER DEFAULT 0,
    tool_results_pct        INTEGER DEFAULT 0,
    -- state
    model_state         INTEGER DEFAULT 1,
    vote                INTEGER,
    user_message_length INTEGER,
    user_message_parts  INTEGER DEFAULT 1,
    mode_kind           TEXT,
    is_system_initiated INTEGER DEFAULT 0,
    -- array counts (states, not content)
    response_part_count INTEGER DEFAULT 0,
    content_ref_count   INTEGER DEFAULT 0,
    code_citation_count INTEGER DEFAULT 0,
    edited_file_count   INTEGER DEFAULT 0,
    followup_count      INTEGER DEFAULT 0,
    variable_count      INTEGER DEFAULT 0,
    -- tool calls (Copilot-specific)
    tool_call_rounds    INTEGER DEFAULT 0,
    tool_call_count     INTEGER DEFAULT 0,
    thinking_tokens     INTEGER DEFAULT 0,
    -- cost
    estimated_cost_usd  REAL
);
```

**TypeScript type:**
```typescript
interface TurnRow {
    request_id: string;
    session_id: string;
    // timing
    timestamp: number;
    completed_at: number | null;
    elapsed_ms: number | null;
    first_progress_ms: number | null;
    total_elapsed_ms: number | null;
    time_spent_waiting: number | null;
    // model
    model_id: string;
    vendor: string;
    model_name: string | null;
    resolved_model: string | null;
    // agent
    agent_id: string | null;
    agent_extension: string | null;
    agent_name: string | null;
    // tokens
    prompt_tokens: number;
    completion_tokens: number;
    output_buffer: number | null;
    copilot_credits: number | null;
    system_instructions_pct: number;
    tool_definitions_pct: number;
    messages_pct: number;
    files_pct: number;
    tool_results_pct: number;
    // state
    model_state: number;
    vote: number | null;
    user_message_length: number | null;
    user_message_parts: number;
    // mode
    mode_kind: string | null;
    is_system_initiated: number;
    // counts (states, not arrays)
    response_part_count: number;
    content_ref_count: number;
    code_citation_count: number;
    edited_file_count: number;
    followup_count: number;
    variable_count: number;
    // tool calls
    tool_call_rounds: number;
    tool_call_count: number;
    thinking_tokens: number;
    // cost
    estimated_cost_usd: number | null;
}
```

---

## 2. Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_turn_session   ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turn_timestamp ON turns(timestamp);
CREATE INDEX IF NOT EXISTS idx_turn_vendor    ON turns(vendor);
CREATE INDEX IF NOT EXISTS idx_turn_model     ON turns(model_id);
CREATE INDEX IF NOT EXISTS idx_turn_agent     ON turns(agent_id);
```

| Index | Purpose |
|-------|---------|
| `idx_turn_session` | Join with `sessions`; cascade delete. |
| `idx_turn_timestamp` | Date-range queries (daily/weekly/monthly aggregation). |
| `idx_turn_vendor` | `GROUP BY vendor` aggregation queries. |
| `idx_turn_model` | Per-model drill-down queries. |
| `idx_turn_agent` | Per-agent analytics. |

---

## 3. Quality Filter (Logical)

Only turns meeting ALL of these conditions are included in aggregation:

- `model_state = 1` (Complete — not Pending, Cancelled, Failed, or NeedsInput)
- `prompt_tokens > 0` (has measurable input)
- `completion_tokens > 0` (has measurable output)

This is enforced by a `WHERE` clause in all aggregation queries, not by a table-level constraint:

```sql
WHERE model_state = 1 AND prompt_tokens > 0 AND completion_tokens > 0
```

---

## 4. Aggregation Query Types

### 4.1 DayTotal

Day-by-day token and cost rollup. Used for line/bar charts.

```typescript
interface DayTotal {
    date: string;               // "YYYY-MM-DD"
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;        // prompt + completion
    estimatedCostUsd: number;
    requestCount: number;
}
```

Query:
```sql
SELECT
    date(timestamp / 1000, 'unixepoch') AS date,
    SUM(prompt_tokens) AS totalPromptTokens,
    SUM(completion_tokens) AS totalCompletionTokens,
    SUM(prompt_tokens + completion_tokens) AS totalTokens,
    COALESCE(SUM(estimated_cost_usd), 0) AS estimatedCostUsd,
    COUNT(*) AS requestCount
FROM turns
WHERE model_state = 1 AND prompt_tokens > 0 AND completion_tokens > 0
  AND timestamp >= ?
GROUP BY date
ORDER BY date DESC
LIMIT ?
```

### 4.2 VendorAgg

Per-vendor aggregation for donut charts and vendor breakdown tables.

```typescript
interface VendorAgg {
    vendor: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    requestCount: number;
}
```

### 4.3 ModelAgg

Per-model (within a vendor) aggregation for drill-down.

```typescript
interface ModelAgg {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    requestCount: number;
}
```

### 4.4 DashboardSummary

Top-level summary returned to the dashboard webview.

```typescript
interface DashboardSummary {
    today: DayTotal;
    thisWeek: DayTotal[];       // 7 days, most recent first
    thisMonth: DayTotal[];      // 30 days, most recent first
    allTime: {
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalCostUsd: number;
        firstTrackedDate: string;
        daysTracked: number;
        sessionCount: number;
        requestCount: number;
    };
    vendorBreakdown: VendorAgg[];
    modelBreakdown: ModelAgg[];
}
```

---

## 5. JSONL → DB Field Mapping

How each JSONL source field maps to a database column. See
`docs/session-store-parsing.md` for the full parsing algorithm.

### 5.1 Session-Level Mapping

| JSONL Path | DB Column |
|---|---|
| `state.sessionId` | `sessions.session_id` |
| `state.creationDate` | `sessions.creation_date` |
| `state.initialLocation` | `sessions.initial_location` |
| `state.hasPendingEdits` | `sessions.has_pending_edits` |
| `state.turns.length` | `sessions.request_count` |
| `inputState.selectedModel.identifier` | `sessions.session_model_id` |
| `inputState.selectedModel.metadata.vendor` | `sessions.session_vendor` |
| `inputState.selectedModel.metadata.name` | `sessions.session_model_name` |
| `inputState.selectedModel.metadata.family` | `sessions.session_family` |
| `inputState.selectedModel.metadata.extension.value` | `sessions.session_extension` |
| `inputState.selectedModel.metadata.isBYOK` | `sessions.session_is_byok` |

### 5.2 Per-Request Mapping

| JSONL Path | DB Column |
|---|---|
| `req.requestId` | `turns.request_id` |
| `req.timestamp` | `turns.timestamp` |
| `req.modelState.completedAt` | `turns.completed_at` |
| `req.elapsedMs` | `turns.elapsed_ms` |
| `result.timings.firstProgress` | `turns.first_progress_ms` |
| `result.timings.totalElapsed` | `turns.total_elapsed_ms` |
| `req.timeSpentWaiting` | `turns.time_spent_waiting` |
| `req.modelId` | `turns.model_id` |
| **computed** from modelId prefix | `turns.vendor` |
| `metadata.name` | `turns.model_name` |
| `result.metadata.resolvedModel` | `turns.resolved_model` |
| `req.agent.id` | `turns.agent_id` |
| `req.agent.extensionId.value` | `turns.agent_extension` |
| `req.agent.name` | `turns.agent_name` |
| `req.promptTokens` | `turns.prompt_tokens` |
| `req.completionTokens` | `turns.completion_tokens` |
| `req.outputBuffer` | `turns.output_buffer` |
| `req.copilotCredits` | `turns.copilot_credits` |
| `req.promptTokenDetails[*].percentageOfPrompt` where `category='System Instructions'` | `turns.system_instructions_pct` |
| `req.promptTokenDetails[*].percentageOfPrompt` where `category='Tool Definitions'` | `turns.tool_definitions_pct` |
| `req.promptTokenDetails[*].percentageOfPrompt` where `category='Messages'` | `turns.messages_pct` |
| `req.promptTokenDetails[*].percentageOfPrompt` where `category='Files'` | `turns.files_pct` |
| `req.promptTokenDetails[*].percentageOfPrompt` where `category='Tool Results'` | `turns.tool_results_pct` |
| `req.modelState.value` | `turns.model_state` |
| `req.vote` | `turns.vote` |
| `req.message.text.length` | `turns.user_message_length` |
| `req.message.parts.length` | `turns.user_message_parts` |
| `req.modeInfo.kind` | `turns.mode_kind` |
| `req.isSystemInitiated` | `turns.is_system_initiated` |
| `req.response.length` | `turns.response_part_count` |
| `req.contentReferences.length` | `turns.content_ref_count` |
| `req.codeCitations.length` | `turns.code_citation_count` |
| `req.editedFileEvents.length` | `turns.edited_file_count` |
| `req.followups.length` | `turns.followup_count` |
| `req.variableData.variables.length` | `turns.variable_count` |
| `result.metadata.toolCallRounds.length` | `turns.tool_call_rounds` |
| `Σ toolCallRounds[*].toolCalls.length` | `turns.tool_call_count` |
| `Σ toolCallRounds[*].thinking.tokens` | `turns.thinking_tokens` |
| **computed** via `TokenCostEstimator` | `turns.estimated_cost_usd` |

---

## 6. Housekeeping

| Operation | Effect |
|-----------|--------|
| `clearAllData()` | Deletes all rows from `turns`, `sessions`, and `processed_files`. Use before a full rebuild. |
| `vacuum()` | Reclaims unused space after large DELETE operations. |
| `close()` | Closes the database connection. Subsequent calls throw. |

### WAL Mode

The database uses Write-Ahead Logging (`PRAGMA journal_mode = WAL`) to allow
concurrent reads (dashboard queries) during writes (imports).

### Synchronous Setting

`PRAGMA synchronous = NORMAL` — balances safety with import performance. In the
event of a crash during import, the WAL journal is replayed on next open.
