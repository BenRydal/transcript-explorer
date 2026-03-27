# Claude Code → Transcript Explorer: Setup & Runbook

## Overview

This tool converts Claude Code conversation logs into CSV files you can load directly into Transcript Explorer. It lets you visualize and analyze human-AI coding sessions using the same tools you'd use for classroom transcripts.

**There is nothing extra to install or configure.** Claude Code already logs every interaction to JSONL files automatically. This converter reads those logs and outputs CSV.

## Prerequisites

- Python 3.10+ (check with `python3 --version`)
- An existing Claude Code session (any past conversation works)
- That's it. No pip packages, no config files, no hooks.

## Where Are My Session Logs?

Claude Code stores session transcripts at:

```
~/.claude/projects/<project-slug>/<session-id>.jsonl
```

The `<project-slug>` is your working directory with `/` replaced by `-`. For example:
- `/home/edwin/git/phd` → `-home-edwin-git-phd`
- `/home/edwin` → `-home-edwin`

Each session gets a UUID filename like `d6901932-39ca-43ab-9203-2a9fd30774c2.jsonl`.

You never need to touch these files directly — the converter finds them for you.

---

## Runbook: Converting a Session

### Step 1: List Available Sessions

```bash
# From the transcript-explorer directory:
yarn convert:list

# Or directly:
python3 tools/claude-code-converter/convert.py --list-sessions
```

Output:
```
Session ID                               Start                   Entries  Project
----------------------------------------------------------------------------------------------------
d6901932-39ca-43ab-9203-2a9fd30774c2     2026-03-27T07:14:59         251  -home-edwin-git-phd
e7b7a457-f6ac-4a2b-b958-b141648dd39d     2026-03-03T16:38:52         324  -home-edwin-git-phd
...
```

### Step 2: Convert a Session

**Convert the most recent session:**
```bash
yarn convert:latest -u Edwin
```

**Convert a specific session by ID:**
```bash
yarn convert:session -s d6901932 -u Edwin
```

**Convert by full file path:**
```bash
python3 tools/claude-code-converter/convert.py \
  ~/.claude/projects/-home-edwin-git-phd/d6901932-39ca-43ab-9203-2a9fd30774c2.jsonl \
  --user-name Edwin \
  --output-dir tools/claude-code-converter/output
```

### Step 3: Load in Transcript Explorer

1. Start Transcript Explorer (`yarn dev`)
2. Click the upload button
3. Upload the **transcript CSV** (`transcript-<id>.csv`)
   - Map `speaker` → Speaker, `content` → Content, `start` → Start, `end` → End
4. Optionally upload the **codes CSV** (`codes-<id>.csv`) as a code file
   - Select "Time-based codes" when prompted
5. Explore with any visualization

### Step 4: Explore Your Session

Recommended visualizations for AI conversations:

| Visualization | What It Shows |
|---------------|---------------|
| **Turn Chart** | Timeline of who spoke when — see the back-and-forth between you, Claude, tools, and agents |
| **Speaker Garden** | Compare word counts and turn counts across all participants |
| **Turn Network** | Transition patterns — e.g., "Claude always calls Tool:Bash after Tool:Read" |
| **Speaker Heatmap** | Activity density over time — see bursts of tool calls vs. idle periods |
| **Turn Length Distribution** | Which participants produce the longest turns? |

---

## Output Files Explained

Each conversion creates three files in the output directory:

### `transcript-<id>.csv`
The main transcript file. Columns:

| Column | TE Uses? | Description |
|--------|----------|-------------|
| `speaker` | Yes | Who is speaking (Edwin, Claude, Tool:Bash, Agent:Explore:..., Idle) |
| `content` | Yes | Full text of the turn |
| `start` | Yes | Start time in seconds (session-relative, 0 = session start) |
| `end` | Yes | End time in seconds |
| `event_type` | No (preserved) | `message`, `tool_call`, `tool_result`, `agent_spawn`, `agent_result`, `idle` |
| `role` | No (preserved) | `user`, `assistant`, `tool`, `agent`, `system` |
| `tool_name` | No (preserved) | `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Agent` |
| `agent_type` | No (preserved) | `Explore`, `general-purpose`, etc. |
| `agent_id` | No (preserved) | Unique agent instance identifier |
| `model` | No (preserved) | `claude-opus-4-6`, etc. |
| `tokens_out` | No (preserved) | Output token count for this API call |
| `event_id` | No (preserved) | UUID for cross-referencing with events.jsonl |
| `content_type` | No (preserved) | `text`, `code`, `thinking`, `error` |

TE only requires `speaker` and `content`. The `start`/`end` columns enable time-based visualizations. The remaining columns are preserved in the CSV but ignored by TE — they exist for future analysis or if you process the CSV yourself.

### `codes-<id>.csv`
Activity type codes, aligned 1:1 with transcript rows. Load this as a "time-based code file" in TE to color-code the timeline by activity type.

Code values: `user_message`, `assistant_message`, `tool_bash`, `tool_read`, `tool_read_result`, `agent_explore`, `idle`, etc.

### `events-<id>.jsonl`
The full canonical event log with all metadata. One JSON object per line. Use this if you want to do custom analysis beyond what TE provides — it contains token usage, parent-child event chains, tool parameters, and everything else from the raw session log.

---

## Speaker Types

Each participant in the conversation becomes a distinct speaker in TE:

| Speaker | What It Is |
|---------|-----------|
| `Edwin` (configurable via `--user-name`) | You, the human |
| `Claude` | The AI assistant's text responses |
| `Tool:Bash` | Shell commands and their output |
| `Tool:Read` | File reads |
| `Tool:Write` | File creates |
| `Tool:Edit` | File edits |
| `Tool:Grep` | Code searches |
| `Tool:Glob` | File pattern searches |
| `Agent:<type>:<id>` | Subagent instances (e.g., `Agent:Explore:toolu_01H8`) |
| `Idle` | Gaps > 30s where no one is active (you reading/thinking/away) |

Tool calls and tool results appear as **separate turns** so you can see the full workflow: Claude decides to call a tool → tool executes → result returns → Claude responds.

---

## How Timing Works

Claude Code timestamps every entry to the millisecond. The converter normalizes these to session-relative seconds:

- **Session start (0s)** = timestamp of the first user message
- **Event start** = exact timestamp from the JSONL
- **Event end** = start of the next event, OR estimated duration if there's a long gap
- **Idle detection** = any gap > 30 seconds is split into the event's estimated duration + an Idle row

The Idle speaker captures time you spent reading Claude's response, thinking, or being away from the keyboard. This gives you an accurate picture of where time was spent.

---

## CLI Reference

```
python3 tools/claude-code-converter/convert.py [OPTIONS] [JSONL_FILE]

Input (pick one):
  JSONL_FILE                Direct path to a session .jsonl file
  -s, --session-id UUID     Find and convert a session by UUID (partial prefix works, e.g. "d6901932")
  -l, --list-sessions       List all available sessions

Options:
  -o, --output-dir DIR      Where to write output files (default: current directory)
  -u, --user-name NAME      Your name in the transcript (default: "User")
  -p, --project PATH        Narrow session search to a specific project path
  --no-codes                Skip generating the codes CSV
  --no-events               Skip generating the events JSONL
  --include-thinking        Include Claude's internal thinking blocks as turns
  --include-system          Include system events (turn_duration markers, etc.)
```

**Yarn shortcuts:**
```bash
yarn convert:list                           # List sessions
yarn convert:session -s <uuid> -u Edwin     # Convert specific session (partial UUID works)
yarn convert:latest -u Edwin                # Convert most recent session
```

Output files land in `tools/claude-code-converter/output/`.

---

## FAQ

### Do I need to set up hooks or add anything to CLAUDE.md?
No. Claude Code already logs everything automatically. The converter reads the existing log files.

### What about subagent (Agent tool) internal actions?
The converter captures when agents are spawned (with their full prompt) and their final result. The individual tool calls inside agents are logged as streaming `agent_progress` entries in the JSONL — a future enhancement could parse those into individual turns, but the spawn + result already gives you the boundaries and content.

### Can I convert old sessions?
Yes. Any session JSONL that still exists in `~/.claude/projects/` can be converted. Run `--list-sessions` to see what's available.

### Can I convert a session that's still running?
Yes. The converter reads a snapshot of the JSONL file at the moment you run it. Run it again later to get the full session.

### What if I want to compare multiple sessions?
Convert each session separately, then load them into TE one at a time. A future enhancement could merge multiple sessions into one transcript.

### The transcript is very long with all the tool calls. Can I simplify it?
Use TE's speaker toggle to hide speakers you don't need (e.g., hide all `Tool:*` speakers to see just the human-AI conversation). The codes overlay also lets you filter by activity type.

### Does this work with ChatGPT or Claude.ai web exports?
Not yet — this converter only handles Claude Code session JSONL files. The schema is designed to be a universal format though, so converters for other platforms can produce the same CSV structure. See the future enhancements section.
