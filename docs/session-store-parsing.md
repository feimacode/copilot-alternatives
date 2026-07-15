# Chat Session Store — File Parsing Algorithm

This document specifies how VS Code's `chatSessions/*.jsonl` files are parsed
to extract per-request token usage metrics. It serves as the canonical reference
for `sessionStoreImporter.ts`.

---

## 1. ObjectMutationLog Format

Each `.jsonl` file is an append-only mutation log. Every line is a JSON object
with a `kind` field indicating the operation type.

### 1.1 Entry Kinds

| Kind | Name | Purpose | Frequency |
|------|------|---------|-----------|
| `0` | Initial | Full state snapshot. Always the first entry. | Once per file |
| `1` | Set | Replace a single property at a path. `k` = path, `v` = new value. | Most common |
| `2` | Push | Append to an array at a path. Optional `i` truncates before appending. | Array mutations |
| `3` | Delete | Remove a property at a path. | Rare |

### 1.2 Path Notation

Paths are string/number arrays. A path `["requests", 0, "completionTokens"]`
means:

```
state.requests[0].completionTokens
```

Number segments indicate array indices, string segments indicate object keys.

### 1.3 Push Semantics (kind=2)

Push entries append items to an array. When `i` is present, the array is
**first truncated** at index `i`, then new items are appended.

```
Example: {"kind":2, "k":["requests",0,"response"], "v":[...], "i":42}
→ requests[0].response.length = 42        (truncate)
→ requests[0].response.push(...newItems)  (append)
→ requests[0].response now has 42 + newItems.length items
```

This is the format used for **streaming response updates** — each tool call
round or thinking block is appended as it arrives.

When `"i":0`, the entire array is replaced:

```json
{"kind":2, "k":["requests"], "v":[{...}], "i":0}
```

This means: truncate `requests` at index 0 (empty it), then push the new request.

---

## 2. State Reconstruction Algorithm

```
let state: Record<string, unknown> | null = null;

for each line in file:
  parse JSON → entry
  switch entry.kind:
    case 0: state = entry.v
    case 1: setAtPath(state, entry.k, entry.v)
    case 2: pushToArray(state, entry.k, entry.v, entry.i)
    case 3: setAtPath(state, entry.k, undefined)

return state
```

### 2.1 setAtPath

```
function setAtPath(state, [segment0, segment1, ..., segmentN], value):
  navigate to state[segment0][segment1]...[segmentN-1]
  set [segmentN] = value
```

### 2.2 pushToArray

```
function pushToArray(state, path, items, startIndex):
  navigate to the array at path
  if startIndex is defined: array.length = startIndex
  if items is defined and non-empty: array.push(...items)
```

---

## 3. Session-Level Fields

Extracted from the reconstructed state after all mutations are applied.

| Field | Source | Type | Required |
|-------|--------|------|----------|
| `sessionId` | `state.sessionId` | UUID string | Yes |
| `creationDate` | `state.creationDate` | epoch ms | Yes |
| `initialLocation` | `state.initialLocation` | `"panel"` / `"sidebar"` / `"tab"` | No |
| `hasPendingEdits` | `state.hasPendingEdits` | boolean | No |
| `responderUsername` | `state.responderUsername` | string | No |
| `customTitle` | `state.customTitle` | string | No |

### 3.1 Selected Model Metadata (session level)

From `state.inputState.selectedModel` — this is the model the user selected
at the session level. **Individual requests may use a different model** (see §5).

| Field | Source | Type |
|-------|--------|------|
| `session_model_id` | `inputState.selectedModel.identifier` | string |
| `session_vendor` | `inputState.selectedModel.metadata.vendor` | string |
| `session_model_name` | `inputState.selectedModel.metadata.name` | string |
| `session_family` | `inputState.selectedModel.metadata.family` | string |
| `session_extension` | `inputState.selectedModel.metadata.extension.value` | string |
| `session_is_byok` | `inputState.selectedModel.metadata.isBYOK` | boolean |

---

## 4. Per-Request Fields

Each entry in `state.requests[]` represents one API call. Fields are flattened
from the JSONL source per the rules below.

### 4.1 Core Fields (always present)

| DB Column | Source | Type | Default |
|-----------|--------|------|---------|
| `request_id` | `req.requestId` | string | required |
| `timestamp` | `req.timestamp` | epoch ms | required |
| `model_id` | `req.modelId` | string | required |
| `model_state` | `req.modelState.value` | 0-4 | `1` |
| `prompt_tokens` | `req.promptTokens` | number | `0` |
| `completion_tokens` | `req.completionTokens` | number | `0` |

### 4.2 Model State Values

| Value | Enum | Meaning |
|-------|------|---------|
| `0` | Pending | Request is still in progress |
| `1` | Complete | Request finished successfully |
| `2` | Cancelled | User cancelled the request |
| `3` | Failed | Request errored out |
| `4` | NeedsInput | Waiting for user input/confirmation |

Only requests with `modelState=1` and `promptTokens>0` and `completionTokens>0`
are considered `is_complete_for_metrics = 1` for aggregation purposes.

### 4.3 Timing Fields

| DB Column | Source | Type | Notes |
|-----------|--------|------|-------|
| `completed_at` | `req.modelState.completedAt` | epoch ms | When the request finished |
| `elapsed_ms` | `req.elapsedMs` | ms | End-to-end client-measured latency |
| `time_spent_waiting` | `req.timeSpentWaiting` | ms | Time waiting for user confirmation |

### 4.4 Timing from `result` (Copilot-specific)

The `result` object arrives near the end of a request via a `kind=1` mutation:

```json
{"kind":1, "k":["requests",0,"result"], "v":{
  "timings":{"firstProgress":35353, "totalElapsed":97748},
  "metadata":{
    "resolvedModel":"deepseek-v4-flash",
    "toolCallRounds":[...]
  }
}}
```

| DB Column | Source | Type | Notes |
|-----------|--------|------|-------|
| `first_progress_ms` | `result.timings.firstProgress` | ms | Time to first response character |
| `total_elapsed_ms` | `result.timings.totalElapsed` | ms | Total agent-side elapsed time |
| `resolved_model` | `result.metadata.resolvedModel` | string | Actual model that served the request |

`result` can be **empty** `{}` for cancelled or errored requests. Extraction
must not throw — leave timing columns null.

### 4.5 Tool Call Rounds from `result.metadata` (Copilot-specific)

```json
"toolCallRounds": [{
  "id": "fd806444-2458-4b81-ad8a-bca29f3aead6",
  "response": "...",
  "toolCalls": [
    {"name": "read_file", "arguments": "{...}", "id": "call_..."}
  ],
  "thinking": {"id": "...", "text": "...", "tokens": 64},
  "timestamp": 1783686749411,
  "modelId": "deepseek-v4-flash"
}]
```

| DB Column | Extraction | Type |
|-----------|-----------|------|
| `tool_call_rounds` | `toolCallRounds.length` | number |
| `tool_call_count` | Sum of `toolCalls.length` across all rounds | number |
| `thinking_tokens` | Sum of `thinking.tokens` across all rounds | number |

### 4.6 Agent Fields

From `req.agent`. This is a rich object; only the ID and extension are extracted.

| DB Column | Source | Type | Example |
|-----------|--------|------|---------|
| `agent_id` | `req.agent.id` | string | `"github.copilot.editsAgent"` |
| `agent_extension` | `req.agent.extensionId.value` | string | `"GitHub.copilot-chat"` |
| `agent_name` | `req.agent.name` | string | `"agent"` / `"ask"` / `"edit"` |

Note: some agents (system agents) have `extensionId.value = "nullExtensionDescription"`.
Fall back to session-level extension in that case.

### 4.7 Mode Fields

| DB Column | Source | Type | Example |
|-----------|--------|------|---------|
| `mode_kind` | `req.modeInfo.kind` | string | `"agent"` / `"ask"` / `"edit"` |
| `is_system_initiated` | `req.isSystemInitiated` | boolean | `false` |

### 4.8 Array → Scalar Count Fields

Arrays are NOT stored as content. Only their lengths are recorded.

| DB Column | Source Array | Extraction |
|-----------|-------------|------------|
| `response_part_count` | `req.response` | `response.length` |
| `content_ref_count` | `req.contentReferences` | `contentReferences.length` |
| `code_citation_count` | `req.codeCitations` | `codeCitations.length` |
| `edited_file_count` | `req.editedFileEvents` | `editedFileEvents.length` |
| `followup_count` | `req.followups` | `followups.length` |
| `variable_count` | `req.variableData.variables` | `variables.length` |

### 4.9 User Message Fields

| DB Column | Source | Extraction | Type |
|-----------|--------|-----------|------|
| `user_message_length` | `req.message.text` | `text.length` (char count) | number |
| `user_message_parts` | `req.message.parts` | `parts.length` (parsed parts) | number |

The actual message text is NOT stored — only its length as a proxy for input complexity.

### 4.10 Token Breakdown (debug-only)

| DB Column | Source | Type | Notes |
|-----------|--------|------|-------|
| `prompt_token_details` | `req.promptTokenDetails` | JSON string | `JSON.stringify()` of the array |

### 4.11 Cost Estimation

| DB Column | Source | Type | Notes |
|-----------|--------|------|-------|
| `estimated_cost_usd` | Computed | number | Via `TokenCostEstimator` based on model pricing |

---

## 5. Model Switching Mid-Session

A session may change its active model via `kind=1` mutations on `inputState.selectedModel`.
Each request records its own `modelId`, which takes priority over the session-level model.

### Example from attached session file:

```
Line 1:  kind=0:   selectedModel = feima/deepseek-v4-pro
Line 5:  kind=1:   selectedModel → customendpoint/BytePlus/deepseek-v4-flash   ← SWITCH
Line 6:  kind=2:   requests[0] modelId = customendpoint/BytePlus/deepseek-v4-flash
Line 24: kind=1:   selectedModel → customendpoint/Feima Code/qwen3.6-plus      ← SWITCH AGAIN
Line 26: kind=2:   requests[1] modelId = customendpoint/Feima Code/qwen3.6-plus
```

### Vendor Resolution Rule

Vendor is resolved per-request from `req.modelId`:

```
modelId = "feima/deepseek-v4-pro"                      → vendor = "feima"
modelId = "customendpoint/BytePlus/deepseek-v4-flash"  → vendor = "BytePlus"     (see §5.1)
modelId = "customendpoint/Feima Code/qwen3.6-plus"     → vendor = "Feima Code"   (see §5.1)
modelId = "copilot/claude-sonnet-4.6"                  → vendor = "copilot"
```

### 5.1 Custom Endpoint Vendor Resolution

When `modelId` starts with `customendpoint/`, the second segment is the actual
provider name. The format is:

```
customendpoint/<providerName>/<modelName>
```

| Model ID | Vendor |
|----------|--------|
| `customendpoint/BytePlus/deepseek-v4-flash` | `BytePlus` |
| `customendpoint/Feima Code/qwen3.6-plus` | `Feima Code` |

If there are fewer than 3 segments (`customendpoint/OnlyTwoParts`), fall back
to `detail` from session metadata, then to `"customendpoint"` as-is.

---

## 6. Streaming Updates

During an active request, token counts are updated incrementally via `kind=1`
mutations. The final state after all mutations should be used.

### Example (attached sample, request 0):

| Mutation | completionTokens | promptTokens |
|----------|-----------------|-------------|
| Initial in request | — | — |
| kind=1 update | 281 | 39,869 |
| kind=1 update | 1,412 | 43,157 |
| kind=1 update | 1,989 | 43,401 |
| kind=1 update | 2,675 | 44,071 |
| kind=1 update | 2,946 | 44,525 |

After all mutations, the final values are: `completionTokens=2946, promptTokens=44525`.

Note that `promptTokens` can also change mid-stream as the system recalculates
the total context size. The **last** value wins for both fields.

---

## 7. Incomplete and Failed States

### 7.1 Pending (modelState=0)

Request was started but never completed. Example: request with
`modelState: {value:0}` and no token data → `is_complete_for_metrics = 0`.

### 7.2 Empty result (result={})

Cancelled or errored requests may have an empty `result` object:

```json
{"kind":1, "k":["requests",2,"result"], "v":{}}
```

Extraction must handle this gracefully:
- `result.timings` → undefined (not present)
- `result.metadata` → undefined (not present)
- Do NOT throw; leave timing/tool-call columns as NULL

### 7.3 NeedsInput (modelState=4)

The model requested user input/confirmation. Request is not complete.
`is_complete_for_metrics = 0` until `modelState` transitions to `1`.

---

## 8. isBYOK Handling

`isBYOK` is extracted from session-level `selectedModel.metadata.isBYOK`. This
field may be **absent** from the metadata for some providers (observed with
feima-managed models). When absent, default to `false`.

```json
// Present: {"isBYOK": true}  → true
// Absent:  {}                → false (default)
```

---

## 9. Edge Cases Summary

| # | Edge Case | Example | Handling |
|---|-----------|---------|----------|
| 1 | Model switches mid-session | See §5 | Per-request `modelId` takes priority |
| 2 | `customendpoint` vendor prefix | `customendpoint/BytePlus/...` | Extract 2nd segment as vendor |
| 3 | `isBYOK` absent from metadata | No `isBYOK` key | Default to `false` |
| 4 | `modelState` stays Pending (0) | `modelState: {value:0}` | `is_complete_for_metrics = 0` |
| 5 | Streaming `completionTokens` updates | 281→4005 | Last value wins after all mutations |
| 6 | `promptTokens` revised mid-stream | 39869→44525 | Last value wins |
| 7 | `result` is empty `{}` | `{"kind":1,"k":["requests",N,"result"],"v":{}}` | No throw; leave timing null |
| 8 | Push truncation `"i":N` | `k=["requests",0,"response"], i=42` | Truncate at index N, then append |
| 9 | Push full replace `"i":0` | `k=["requests"], i=0` | Empty the array, then push |
| 10 | System agent with null extension | `extensionId.value = "nullExtensionDescription"` | Fall back to session extension |
| 11 | Session starts with empty `responderUsername` | `responderUsername: ""` | Later mutation sets it; final state wins |

---

## 10. File Tracking (processed_files)

Each file is tracked by content hash for incremental processing.

| Column | Source | Type |
|--------|--------|------|
| `file_path` | Absolute path on disk | TEXT (PK) |
| `file_size` | `fs.statSync().size` | INTEGER |
| `file_mtime` | `fs.statSync().mtimeMs` | INTEGER |
| `content_hash` | SHA-256 hex digest of file content | TEXT |
| `last_imported` | `Date.now()` at import time | INTEGER |

On each scan:

1. Enumerate all `.jsonl` files in chatSessions directories
2. For each file, check `processed_files` table
3. If file not in table → import
4. If file in table but `content_hash` differs → re-import (file changed)
5. If file in table and hash matches → skip (unchanged)

This enables fast incremental scans: only changed files are re-parsed and re-imported.
