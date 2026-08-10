# Claude Code Session → Transcript Explorer Converter

Converts Claude Code session logs (JSONL) into CSV files that can be loaded directly into Transcript Explorer for visualization and analysis of human-AI conversations.

## How It Works

Claude Code already logs every interaction to JSONL files at:
```
~/.claude/projects/<project-slug>/<session-id>.jsonl
```

These files contain timestamped entries for every user message, assistant response, tool call, tool result, agent spawn, and agent result — **no hooks or extra configuration needed**. The converter reads these files and transforms them into Transcript Explorer's CSV format.

## Quick Start

```bash
cd transcript-explorer/tools/claude-code-converter

# List all available sessions
python3 convert.py --list-sessions

# Convert a specific session
python3 convert.py --session-id <uuid> --user-name Edwin --output-dir ./output

# Convert by file path
python3 convert.py ~/.claude/projects/-home-edwin-git-phd/<session-id>.jsonl -u Edwin -o ./output

# Include AI thinking blocks
python3 convert.py --session-id <uuid> -u Edwin -o ./output --include-thinking
```

## Output Files

Each conversion produces three files:

| File | Purpose | Format |
|------|---------|--------|
| `transcript-<id>.csv` | TE-compatible transcript | CSV with `speaker,content,start,end` + extended columns |
| `codes-<id>.csv` | Activity type overlay | CSV with `start,end,code` for TE code visualization |
| `events-<id>.jsonl` | Full canonical events | JSONL with complete metadata (for archival/reprocessing) |

### Transcript CSV Schema

**TE-required columns** (first 4):

| Column | Description | Example |
|--------|-------------|---------|
| `speaker` | Who is speaking | `Edwin`, `Claude`, `Tool:Bash`, `Agent:Explore:toolu_01H8` |
| `content` | Full text content | Message text, tool command, tool output |
| `start` | Start time (seconds, session-relative) | `0.0` |
| `end` | End time (seconds) | `7.264` |

**Extended columns** (TE preserves but ignores these):

| Column | Description | Values |
|--------|-------------|--------|
| `event_type` | What happened | `message`, `tool_call`, `tool_result`, `agent_spawn`, `agent_result`, `idle`, `thinking` |
| `role` | Speaker category | `user`, `assistant`, `tool`, `agent`, `system` |
| `tool_name` | Tool invoked | `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Agent` |
| `agent_type` | Agent specialization | `Explore`, `general-purpose`, etc. |
| `agent_id` | Agent instance ID | `toolu_01H8S2oG1n` |
| `model` | AI model used | `claude-opus-4-6` |
| `tokens_out` | Output tokens | `139` |
| `event_id` | UUID for cross-referencing | UUID string |
| `content_type` | Content format | `text`, `code`, `thinking`, `error` |

### Codes CSV Schema

| Column | Description | Example Values |
|--------|-------------|----------------|
| `start` | Start time (seconds) | `0.0` |
| `end` | End time (seconds) | `7.264` |
| `code` | Activity type | `user_message`, `assistant_message`, `tool_bash`, `tool_read_result`, `agent_explore`, `idle` |

### Speaker Types

The converter creates distinct speakers for each participant:

| Speaker Pattern | What It Represents |
|----------------|--------------------|
| `Edwin` (or custom `--user-name`) | The human user |
| `Claude` | The AI assistant |
| `Tool:Bash` | Bash command execution |
| `Tool:Read` | File read operation |
| `Tool:Write` | File write operation |
| `Tool:Edit` | File edit operation |
| `Tool:Grep` | Code search |
| `Tool:Glob` | File pattern search |
| `Agent:Explore:<id>` | Explore subagent instance |
| `Agent:general-purpose:<id>` | General-purpose subagent |
| `Idle` | Gap between active events (user thinking/reading/away) |

## Timing Model

The converter handles timing as follows:

1. **Event start times** come directly from the JSONL timestamps (millisecond precision)
2. **Event end times** are set to the start of the next event, unless the gap exceeds the idle threshold (default: 30s)
3. **Large gaps** (>30s) are split: the event gets an estimated duration based on content length, and an `Idle` row is inserted for the remainder
4. **Estimated durations** are capped at 60s max and 50% of the gap, whichever is smaller
5. All times are normalized to session-relative seconds (session start = 0)

## What Data Is Captured

### Already in the JSONL (no configuration needed)

| Data | Source |
|------|--------|
| User message text + timestamp | `type: "user"` entries |
| Assistant text + timestamp | `type: "assistant"` entries with `text` blocks |
| AI thinking content | `type: "assistant"` entries with `thinking` blocks (opt-in via `--include-thinking`) |
| Tool calls (name, params) | `type: "assistant"` entries with `tool_use` blocks |
| Tool results (output, errors) | `type: "user"` entries with `tool_result` blocks |
| Agent spawning (type, prompt) | `tool_use` with `name: "Agent"` |
| Agent results | `tool_result` matching agent `tool_use_id` |
| Token usage (input/output/cache) | `message.usage` on assistant entries |
| Model identifier | `message.model` on assistant entries |
| Session ID, project path, git branch | Metadata on every entry |
| Turn duration | `type: "system"`, `subtype: "turn_duration"` |

### Not captured (limitations)

| Data | Why | Workaround |
|------|-----|-----------|
| User typing start time | Claude Code logs when Enter is pressed, not when typing begins | `UserPromptSubmit` hook could add this |
| Subagent internal tool calls | Agent progress entries are streamed but not fully structured | Parse `agent_progress` data (future enhancement) |
| File contents read by tools | Tool results contain the output but very large reads may be truncated | Use `events.jsonl` for full content |

## Loading in Transcript Explorer

1. Run the converter to produce `transcript-*.csv` and `codes-*.csv`
2. Open Transcript Explorer
3. Upload `transcript-*.csv` as the transcript file
4. Upload `codes-*.csv` as a code file (time-based codes)
5. Explore using any visualization:
   - **Turn Chart**: See the conversation flow between human, AI, tools, and agents
   - **Speaker Garden**: Compare activity levels across all participants
   - **Turn Network**: See transition patterns (who talks after whom)
   - **Contribution Cloud**: Analyze word patterns per speaker
   - **Speaker Heatmap**: See activity density over time

## CLI Reference

```
usage: convert.py [-h] [--session-id SESSION_ID] [--list-sessions]
                  [--output-dir OUTPUT_DIR] [--user-name USER_NAME]
                  [--project PROJECT] [--no-codes] [--no-events]
                  [--include-thinking] [--include-system]
                  [jsonl_file]

Options:
  jsonl_file              Path to session JSONL file
  --session-id, -s        Session UUID to find and convert
  --list-sessions, -l     List available sessions
  --output-dir, -o        Output directory (default: current dir)
  --user-name, -u         Name for the human user (default: User)
  --project, -p           Project path to narrow session search
  --no-codes              Skip generating codes.csv
  --no-events             Skip generating events.jsonl
  --include-thinking      Include AI thinking blocks in transcript
  --include-system        Include system events (turn_duration, etc.)
```

## Schema Version

Current schema version: `1.0.0`

The `events.jsonl` canonical format includes a `schema_version` field for forward compatibility. The CSV format is designed to be extensible — new columns can be added without breaking Transcript Explorer (which ignores unknown columns).

## Future Enhancements

- [ ] Parse `agent_progress` entries to extract subagent internal tool calls
- [ ] Support ChatGPT JSON export → same CSV format
- [ ] Support Claude.ai conversation export → same CSV format
- [ ] Add `--compress-idles` flag to collapse long idle periods
- [ ] Add `--merge-tool-pairs` flag to combine tool_call + tool_result into single rows
- [ ] Web UI for drag-and-drop JSONL → CSV conversion
