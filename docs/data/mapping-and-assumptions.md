# 03 - Mapping and Assumptions

Defines the path from Claude Code JSONL into Transcript Explorer's CSV inputs, and isolates every place we are making something up rather than reading directly.

The architecture has two stops:

```
Claude Code JSONL
        |
        v
  Internal session JSON  (our own representation, auditable on its own)
        |
        v
  TE CSV files  (transcript + codes)
```

The internal JSON exists so the "what was actually in the log" can be inspected without reading CSV (lossy) or the original JSONL (raw). It is also the natural unit test boundary: feed in a JSONL, snapshot the JSON, and the CSV exporters become deterministic consumers of that JSON.

## Internal session JSON shape

Three top-level sections, each scoped to a different provenance class. Anyone reading the file can tell at a glance what came from Claude Code, what was computed, and what was assumed.

```jsonc
{
	"schema_version": "2.0.0",
	"session_id": "...",
	"source_file": "/home/edwin/.claude/projects/.../<sid>.jsonl",
	"claude_code_version_observed": "2.1.119",

	"direct": {
		/* facts read straight from the JSONL, no interpretation */
	},
	"computed": {
		/* values derived from direct facts plus versioned constants */
	},
	"assumed": {
		/* heuristic outputs with disclosed rules and parameters */
	}
}
```

Sections are not interleaved. A field's section determines how it can be presented and how confidently it can be compared across sessions.

## Section: direct

Read straight from the JSONL. No transformation beyond parsing (ISO timestamp to ms, etc.) and snake_case normalization.

### Session-level facts

| JSON path                    | Source in JSONL                                   |
| ---------------------------- | ------------------------------------------------- |
| `direct.session_id`          | `sessionId` (any entry)                           |
| `direct.project_path`        | `cwd` (first entry)                               |
| `direct.git_branch`          | `gitBranch` (first entry)                         |
| `direct.claude_code_version` | `version` (most common value)                     |
| `direct.started_at_iso`      | `timestamp` of first entry                        |
| `direct.ended_at_iso`        | `timestamp` of last entry                         |
| `direct.events[]`            | One element per JSONL line that produced an event |

### Event-level facts

Each `direct.events[]` element preserves what Claude Code emitted, broken down by role.

```jsonc
{
  "event_id": "<JSONL uuid>",
  "parent_event_id": "<JSONL parentUuid or null>",
  "ts_ms": 1745700001234,
  "is_sidechain": false,
  "type": "assistant" | "user" | "system" | "attachment" | "permission-mode" | "summary" | ...,

  // Present on type=assistant only:
  "model": "claude-opus-4-7",
  "request_id": "req_01HQ...",
  "stop_reason": "tool_use",
  "content_blocks": [
    {"type": "thinking", "text": "..."},
    {"type": "tool_use", "id": "toolu_...", "name": "Read", "input": {...}},
    {"type": "text", "text": "..."}
  ],
  "usage": {
    "input": 6,
    "output": 803,
    "cache_read": 0,
    "cache_write": 40288,
    "server_tool_use": {"web_search_requests": 0, "web_fetch_requests": 0}
  },

  // Present on type=user only:
  "user_content": "..." | [tool_result_blocks],

  // Present on type=system only:
  "system_subtype": "turn_duration" | "api_error" | "away_summary" | ...,
  "system_payload": { /* subtype-specific keys, captured verbatim */ },

  // Present on attachment, permission-mode, summary entries:
  "raw": { /* full original JSONL object */ }
}
```

Things deliberately not in `direct`:

| Field                                                                                       | Why omitted                                                                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `service_tier`                                                                              | Anthropic does not publish tier multipliers; capturing without applying it adds no signal |
| `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` separately       | Summed into one `cache_write` field because the split has no consumer                     |
| `iterations[]` (per-API-call breakdown when one assistant emit had multiple internal calls) | Aggregate `usage` already accounts for it correctly                                       |
| `inference_geo`, `speed`, `stop_details`                                                    | Sparse, no current consumer                                                               |

## Section: computed

Derived from `direct` plus versioned constants. Reproducible byte-for-byte from the same JSONL plus the same constants.

### Per-event

| JSON path                              | Formula                                                                                                                                                  | Inputs                                                               | Versioned constant                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `computed.events[i].session_elapsed_s` | `(ts_ms - direct.started_at_ms) / 1000` rounded to 3 dp                                                                                                  | `direct.events[i].ts_ms`, session start                              | none                                                 |
| `computed.events[i].speaker`           | Speaker label rule (table below)                                                                                                                         | `direct.events[i].type`, `tool_name`, `agent_type`, user-name config | user-name (recorded)                                 |
| `computed.events[i].cost_usd`          | Sum of `usage.<class> / 1e6 × pricing[model].<class>_per_mtok` over input, output, cache_read, cache_write. Null when model is not in the pricing table. | `direct.events[i].usage`, `direct.events[i].model`                   | `pricing.json` version + `cache_write_rate_strategy` |
| `computed.events[i].tool_duration_ms`  | `tool_result.ts_ms - tool_call.ts_ms`, paired by `tool_use_id`. Null on the call event; recorded on the result event.                                    | timestamps of paired events                                          | none                                                 |

### Per-session

| JSON path                    | Formula                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computed.wall_clock_ms`     | `direct.ended_at_ms - direct.started_at_ms`                                                                                                                                  |
| `computed.events_total`      | `len(direct.events)`                                                                                                                                                         |
| `computed.tokens`            | Sum of `usage` across all assistant events: `{input, output, cache_read, cache_write}`                                                                                       |
| `computed.server_tool_use`   | Sum of server tool counts across assistant events. Null if all zero.                                                                                                         |
| `computed.cost_usd`          | Sum of per-event `cost_usd`. Null if any event lacked pricing.                                                                                                               |
| `computed.cache_hit_rate`    | `tokens.cache_read / (tokens.cache_read + tokens.input)`. Null if denominator is zero.                                                                                       |
| `computed.api_busy_ms`       | Sum of `direct.events[i].system_payload.durationMs` across `turn_duration` system events. **Null** when no `turn_duration` events were emitted. Never substituted with zero. |
| `computed.tool_busy_ms`      | Sum of `tool_duration_ms` across all tool_result events.                                                                                                                     |
| `computed.turns`             | Array of turn boundaries derived from event sequence (turn opens on user-origin message, closes on assistant `stop_reason in {end_turn, stop, max_tokens}`).                 |
| `computed.by_model`          | Per-model rollup of events, tokens, cost.                                                                                                                                    |
| `computed.by_tool`           | Per-tool count, busy time, error count.                                                                                                                                      |
| `computed.by_speaker`        | Per-speaker event count, content chars, and (for assistant) tokens + cost.                                                                                                   |
| `computed.by_system_subtype` | Counts of each system subtype observed (e.g., how many api_error events).                                                                                                    |
| `computed.null_field_counts` | `{field: {key_absent: int, value_null: int}}` for sparse fields. Lets readers gauge data completeness.                                                                       |

### Speaker label rule

Single mapping function. Tagged `computed` because the labels are not in the JSONL.

| Event                                           | Speaker label                              |
| ----------------------------------------------- | ------------------------------------------ |
| user message (`message.content` is string)      | The user-name config value (e.g., `Edwin`) |
| user tool_result wrapper                        | `Tool:<name>`                              |
| assistant text or thinking                      | `Claude`                                   |
| assistant `tool_use`, `name != Agent`           | `Tool:<name>`                              |
| assistant `tool_use`, `name == Agent`           | `Agent:<subagent_type>:<tool_use_id[:8]>`  |
| system / attachment / permission-mode / summary | `System`                                   |

### Versioned constants

`pricing.json` carries the per-model rates and the cache-write strategy. Every cost-bearing output records `pricing_table_version`. Reproducing a cost requires the same JSONL plus the same pricing file version.

```jsonc
// tools/claude-code-converter/pricing.json
{
	"version": "2026-05-13",
	"cache_write_rate_strategy": "1h_rate",
	"models": {
		"claude-opus-4-7": {
			"input_per_mtok": 5.0,
			"output_per_mtok": 25.0,
			"cache_read_per_mtok": 0.5,
			"cache_write_per_mtok": 10.0
		}
	}
}
```

## Section: assumed

Heuristic outputs. Rules and parameters are recorded with every record so a reader can see what assumption produced what value.

The current converter has exactly one assumption baked in:

| JSON path             | Rule                                                                                                                                                                                                                                  | Parameter                       | Source                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------- |
| `assumed.idle_rows[]` | Insert a synthetic `Idle` row when the gap between consecutive events exceeds the idle threshold. The active event gets a content-length-based estimated duration capped at 60 s and 50% of the gap; the rest becomes the `Idle` row. | `idle_threshold_s` (default 30) | convert.py current behavior |

Reasonable additional assumptions that could be added if there is a need (currently NOT in scope):

| Possible addition                                                       | Rule                                                                           | Parameter                                        | Decision                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Human-interval categories (`READING`, `COMPOSING`, `UNDEFINED`, `AWAY`) | Compare the gap between turns to character-count budgets at configurable rates | `reading_rate_cps`, `typing_rate_cps`, `away_ms` | Defer until there is a visualization that needs it; previous attempt overshipped this |
| `content_type` heuristic (text vs code vs thinking vs error)            | Pattern match on content (triple-backtick, shebang) plus tool name             | none beyond patterns                             | Defer; current converter just labels by event_type                                    |

If any are added later, they go in `assumed`, with the rule and parameters recorded on every record they produce. The default UI treatment for any `assumed` field is to surface the parameter values inline (tooltip, label suffix, or a settings panel) so a viewer can never see an assumed value without being able to discover the rule.

## CSV exporters

The CSVs are derived from the JSON. No transformation that is not declared in the JSON schema appears in the CSV.

### transcript.csv (for TE)

The TE-required first four columns are unchanged from the current v1 format.

| Column    | Source in JSON                                                             |
| --------- | -------------------------------------------------------------------------- |
| `speaker` | `computed.events[i].speaker`                                               |
| `content` | Flattened text of `direct.events[i].content_blocks` (or `user_content`)    |
| `start`   | `computed.events[i].session_elapsed_s`                                     |
| `end`     | `computed.events[i+1].session_elapsed_s`, with the idle-split rule applied |

Additive columns (TE preserves but ignores; available for future visualizations):

| Column               | Source in JSON                                                                                               | Section  |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| `event_id`           | `direct.events[i].event_id`                                                                                  | direct   |
| `event_type`         | `direct.events[i].type` plus block-derived subtype (`message`, `tool_call`, `tool_result`, `thinking`, etc.) | direct   |
| `tool_name`          | from `content_blocks[].name` for tool events                                                                 | direct   |
| `tool_use_id`        | from `content_blocks[].id` (call) or `.tool_use_id` (result)                                                 | direct   |
| `model`              | `direct.events[i].model`                                                                                     | direct   |
| `request_id`         | `direct.events[i].request_id`                                                                                | direct   |
| `stop_reason`        | `direct.events[i].stop_reason`                                                                               | direct   |
| `tokens_input`       | `direct.events[i].usage.input`                                                                               | direct   |
| `tokens_output`      | `direct.events[i].usage.output`                                                                              | direct   |
| `tokens_cache_read`  | `direct.events[i].usage.cache_read`                                                                          | direct   |
| `tokens_cache_write` | `direct.events[i].usage.cache_write`                                                                         | direct   |
| `cost_usd`           | `computed.events[i].cost_usd`                                                                                | computed |
| `tool_duration_ms`   | `computed.events[i].tool_duration_ms`                                                                        | computed |
| `is_sidechain`       | `direct.events[i].is_sidechain`                                                                              | direct   |

Empty cell when a column does not apply to the row (e.g., `tokens_input` is empty for tool rows). `api_duration_ms` and similar sparse fields stay empty when not observed; they are never zero-filled.

### codes.csv (for TE)

| Column  | Source in JSON                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start` | `computed.events[i].session_elapsed_s`                                                                                                                                                                                        |
| `end`   | the row's end (same rule as transcript.csv)                                                                                                                                                                                   |
| `code`  | Activity code derived from `direct.events[i].type` and `tool_name` (e.g., `user_message`, `assistant_message`, `assistant_thinking`, `tool_bash_call`, `tool_bash_result`, `agent_explore_spawn`, `system_api_error`, `idle`) |

Idle rows from `assumed.idle_rows[]` produce `code: idle`.

### Optional sidecars

Not required for TE to function; useful for power users.

| File                 | What                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-<sid>.json` | The full internal JSON described above. Lossless, auditable, the source of truth for the CSVs.                                                                          |
| `events-<sid>.jsonl` | One line per `direct.events[i]`. Equivalent content to `session.direct.events`, just streamable. Kept for compatibility with the current converter's archival behavior. |

## What this design avoids making up

| Thing                                                | What we do                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cost when model is not in pricing table              | `cost_usd` is null, recorded in `computed.cost_caveats.missing_pricing_for_models`                                   |
| API time when `turn_duration` events are not emitted | `computed.api_busy_ms` is null, recorded in `computed.null_field_counts.api_duration_ms`                             |
| Tier-adjusted pricing                                | Not modeled; standard tier rates used unconditionally; recorded as a caveat when the JSONL shows a non-standard tier |
| Server tool cost                                     | `computed.cost_caveats.server_tool_use_not_priced` flagged when present; not added to `cost_usd`                     |
| Whether the human read a response                    | Not modeled                                                                                                          |
| Whether an answer was correct or accepted            | Not modeled                                                                                                          |
| Weekly usage %, 5h block, context window             | Not modeled (not on disk anywhere); referenced in 01-what-claude-code-tracks.md                                      |

## What this design lets us prove or disprove

A reader of `session-<sid>.json` can answer, without re-running the converter:

1. Did Claude Code emit timing data for this session (presence of `direct.events[i].system_subtype == "turn_duration"` entries)?
2. Was cost computable for every event (presence of `computed.cost_caveats`)?
3. Which assumptions were applied (`assumed` section listing rules and parameters; empty section means nothing was assumed)?
4. What tools / agents / system events appeared (`computed.by_tool`, `computed.by_agent_type`, `computed.by_system_subtype`)?
5. How complete is the data (`computed.null_field_counts`)?

Anything else a visualization wants to claim about a session needs to either map to a `direct` field, a `computed` formula, or a new entry in `assumed` with a disclosed rule. Nothing slips in without one of those three homes.
