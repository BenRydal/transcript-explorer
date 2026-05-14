# 01 - What Claude Code Tracks

A scan of every place Claude Code stores conversation data. The goal is to know what's available before we decide what to map into Transcript Explorer.

Verified empirically on 2026-05-13 against `~/.claude/` on a working install (Claude Code v2.1.119).

## Claude Code JSONL

**Path:** `~/.claude/projects/<project-slug>/<session-uuid>.jsonl`

The `<project-slug>` is the project's working directory with `/` replaced by `-`. Example: `/home/edwin/git/phd/transcript-explorer` → `-home-edwin-git-phd-transcript-explorer`.

One JSON object per line, append-only as the session runs. **This is the complete record of every conversation** - every user message, every assistant response (text + thinking + tool calls), every tool result, every system event. This is what every community analytics tool (`ccusage`, `claude-code-log`, etc.) reads.

### Entry types that are found on a typical line

| `type` field                                                                                       | What it represents                                                                                                                                                                               | How often                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `user`                                                                                             | Either a real user message (`message.content` is a string) OR a tool result wrapper (`message.content` is array containing `tool_result` blocks). The discriminator is the content shape.        | Many per session                              |
| `assistant`                                                                                        | One assistant response. Contains `message.content[]` (array of text/thinking/tool_use blocks) and `message.usage` (token counts).                                                                | Many per session                              |
| `system`                                                                                           | Out-of-band events with a `subtype`: `turn_duration` (timing), `api_error` (with retry counts), `away_summary` (resumption summary), `stop_hook_summary`, `local_command`, `scheduled_task_fire` | Sparse - present in some sessions, not others |
| `attachment`                                                                                       | Mid-session context deltas: deferred-tool registration, MCP-instruction blobs                                                                                                                    | Few per session                               |
| `permission-mode`                                                                                  | Records when permission mode changed                                                                                                                                                             | Low                                           |
| `summary`                                                                                          | Compaction marker                                                                                                                                                                                | At most one per session                       |
| `queue-operation`, `last-prompt`, `file-history-snapshot`, `pr-link`, `agent-name`, `custom-title` | Various session-state events                                                                                                                                                                     | Varies                                        |

### Useful keys on `assistant` entries

```jsonc
{
  "type": "assistant",
  "uuid": "...",                    // unique per JSONL line
  "parentUuid": "...",              // points to the user/tool entry that prompted this
  "sessionId": "...",
  "isSidechain": false,             // true for subagent activity
  "timestamp": "2026-04-26T22:51:04.163Z",
  "cwd": "...",
  "gitBranch": "feature/claude",
  "version": "2.1.119",             // Claude Code version
  "requestId": "req_01HQ...",       // Anthropic API request ID
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-7",
    "stop_reason": "tool_use",      // end_turn | tool_use | max_tokens | stop_sequence
    "content": [
      {"type": "thinking", "thinking": "..."},
      {"type": "tool_use", "id": "toolu_...", "name": "Read", "input": {...}},
      {"type": "text", "text": "..."}
    ],
    "usage": {
      "input_tokens": 6,
      "output_tokens": 803,
      "cache_read_input_tokens": 0,
      "cache_creation_input_tokens": 40288,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 40288
      },
      "service_tier": "standard",
      "server_tool_use": {           // sparse - only when web_search/web_fetch was used
        "web_search_requests": 0,
        "web_fetch_requests": 0
      }
    }
  }
}
```

The `message.usage` block is where all token-related data lives. Cost is **not** in the JSONL - Anthropic only sends raw token counts; cost has to be computed from a pricing table on our side.

### Useful keys on `user` entries

A user-origin message is `message.content` as a plain string. A tool result wrapper has `message.content` as an array containing `{type: "tool_result", tool_use_id: "...", content: "...", is_error: false}` blocks. Same envelope (uuid, parentUuid, timestamp, etc.) as assistant entries.

### Useful keys on `system` entries

```jsonc
{"type": "system", "subtype": "turn_duration", "durationMs": 5333, "messageCount": 3, "timestamp": "...", "uuid": "..."}
{"type": "system", "subtype": "api_error", "cause": {...}, "retryAttempt": 1, "maxRetries": 10, "timestamp": "..."}
```

`turn_duration` is the only honest source of "how long was the API actually busy." It's sparse - not every session emits it.

## Cross-session aggregates

**Path:** `~/.claude/stats-cache.json`

Single JSON file Claude Code maintains itself. Updates incrementally as sessions run.

```jsonc
{
	"version": 2,
	"lastComputedDate": "2026-02-16",
	"dailyActivity": [
		{ "date": "2026-01-06", "messageCount": 23, "sessionCount": 1, "toolCallCount": 4 }
		// ... one per day
	],
	"dailyModelTokens": [{ "date": "2026-01-06", "tokensByModel": { "claude-opus-4-5-20251101": 3930 } }],
	"modelUsage": {
		"claude-opus-4-7": {
			"inputTokens": 886750,
			"outputTokens": 555758,
			"cacheReadInputTokens": 846115301,
			"cacheCreationInputTokens": 51158861,
			"webSearchRequests": 0,
			"costUSD": 0, // ⚠ always 0 - Claude Code doesn't compute cost for subscribers
			"contextWindow": 0 // ⚠ always 0 - not populated
		}
	},
	"totalSessions": 164,
	"totalMessages": 42964,
	"longestSession": { "sessionId": "...", "duration": 119487945, "messageCount": 402 },
	"hourCounts": { "0": 12, "1": 4 /* ... 24 entries */ },
	"firstSessionDate": "2026-01-06T18:32:21.475Z"
}
```

Useful for: daily activity timelines, hour-of-day patterns, longest sessions, lifetime totals.
Not useful for: cost (always zero), context window (always zero).

## Other local files in `~/.claude/`

| Path                                             | What's there                                                      | Worth ingesting?                                            |
| ------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `~/.claude/sessions/<pid>.json`                  | Per-process metadata: pid, cwd, startedAt, kind, entrypoint       | No - process tracking, not conversation data                |
| `~/.claude/telemetry/*.json`                     | Internal failed-event queue (e.g., `tengu_api_cache_breakpoints`) | No - internal, not user-facing                              |
| `~/.claude/file-history/`                        | Pre-edit file backups                                             | Maybe future - useful for "what did the AI actually change" |
| `~/.claude/todos/`                               | Per-task scratch state                                            | No - already in JSONL via TaskCreate tool calls             |
| `~/.claude/cache/`, `paste-cache/`, `statsig/`   | Implementation caches                                             | No                                                          |
| `~/.claude/settings.json`, `settings.local.json` | User config                                                       | No                                                          |

## What is NOT stored on disk

Common ask, common surprise: these are not in any local file.

| Data                                                 | Where it actually is                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Weekly usage % (Pro/Max plan cap)                    | API response headers (`anthropic-ratelimit-*`) and `/usage` slash command - terminal output only                                             |
| 5-hour rolling block ID + remaining budget           | Same - API headers + `/usage` command                                                                                                        |
| Context window % used                                | Computed live by Claude Code; visible in `/status` and the statusline; not persisted                                                         |
| Per-session cost in USD                              | Anthropic does not send it; must be computed from tokens × pricing table                                                                     |
| AI confidence / answer correctness / user acceptance | Not emitted by the model. The OTEL exporter (opt-in) emits `claude_code.code_edit_tool.decision` for accept/reject - not on disk by default. |

## Documentation links

Anthropic does **not** publish a JSONL schema. Closest official references:

- **OTEL semantic conventions** (the only official documentation of Claude Code's data emission, but only for the OpenTelemetry path): https://code.claude.com/docs/en/monitoring-usage
- **Models, usage, limits**: https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code
- **Pricing**: https://www.anthropic.com/pricing
- **Prompt caching** (documents `cache_creation` / `cache_read` token shapes): https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Community reverse-engineering:

- https://databunny.medium.com/inside-claude-code-the-session-file-format-and-how-to-inspect-it-b9998e66d56b
- https://piebald.ai/blog/messages-as-commits-claude-codes-git-like-dag-of-conversations
- https://github.com/ryoppippi/ccusage - most-used analytics tool that parses the JSONL

## Bottom line for our purposes

For Transcript Explorer:

- **Tier A (per-session JSONL)** is where everything we need lives. Every chat, every token count, every tool call. This is what we should be reading.
- **Tier B (stats-cache.json)** is a useful free aggregate for cross-session views, but we said cross-session is out of scope, so park it.
- Out-of-disk data (weekly %, 5h block, context window) is **off the table** unless we add a manual sidecar import - defer.

The next question (file 02) is what our existing code already does with this, and whether it's accurate.
