# 02 - What We Have

Audit of the existing converter and docs that touch Claude Code data. Goal: decide what to keep, extend, or replace before adding anything new.

Verified against the repo state on 2026-05-13.

## Files in scope

| Path                                                   | Purpose                                                 | Status                          |
| ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------- |
| `tools/claude-code-converter/convert.py`               | Main converter, JSONL → CSV + events.jsonl              | 856 lines, schema v1.0.0        |
| `tools/claude-code-converter/convert-latest.py`        | Wrapper that runs convert.py on the most recent session | 66 lines                        |
| `tools/claude-code-converter/README.md`                | Converter usage docs                                    | Accurate to v1.0.0              |
| `tools/claude-code-converter/output-v1/`, `output-v2/` | Old generated CSV/JSONL output samples                  | Generated artifacts, not source |
| `docs/claude-code-converter/setup.md`                  | User-facing runbook (`yarn convert:list`, etc.)         | Accurate to v1.0.0              |
| `docs/qa.md`                                           | Yarn install troubleshooting note                       | Off-topic, recommend delete     |
| `docs/claude-code-mapping/`                            | (empty)                                                 | Recommend delete the folder     |

## What convert.py reads from the JSONL

| JSONL source                                                                       | Captured? | Notes                                                       |
| ---------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `user` entries (string content)                                                    | yes       | Becomes a row with `speaker = <user-name>`, `role = user`   |
| `user` entries (tool_result content)                                               | yes       | Becomes a `Tool:<name>` row with `event_type = tool_result` |
| `assistant` text blocks                                                            | yes       | Becomes a `Claude` row, `event_type = message`              |
| `assistant` thinking blocks                                                        | opt-in    | Only with `--include-thinking` flag                         |
| `assistant` tool_use blocks                                                        | yes       | Becomes a `Tool:<name>` row, `event_type = tool_call`       |
| `tool_use` with `name = Agent`                                                     | yes       | Becomes `Agent:<type>:<id>` rows                            |
| `message.usage.input_tokens`                                                       | NO        | Not output to CSV                                           |
| `message.usage.output_tokens`                                                      | yes       | Output as `tokens_out` column only                          |
| `message.usage.cache_read_input_tokens`                                            | NO        | Not output to CSV                                           |
| `message.usage.cache_creation_input_tokens`                                        | NO        | Not output to CSV                                           |
| `message.usage.cache_creation.ephemeral_5m / 1h`                                   | NO        | Not captured                                                |
| `message.usage.service_tier`                                                       | NO        | Not captured                                                |
| `message.usage.server_tool_use.*`                                                  | NO        | Not captured                                                |
| `message.model`                                                                    | yes       | Output as `model` column                                    |
| `message.stop_reason`                                                              | NO        | Not captured                                                |
| `system` / `turn_duration`                                                         | yes       | Stored as a synthetic event, not aggregated                 |
| `system` / other subtypes (`api_error`, `away_summary`, `stop_hook_summary`, etc.) | NO        | Dropped on read                                             |
| `attachment` entries                                                               | NO        | Dropped on read                                             |
| `permission-mode` entries                                                          | NO        | Dropped on read                                             |
| `summary` entries (compaction)                                                     | NO        | Dropped on read                                             |

## What convert.py outputs

Three files per session:

1. `transcript-<sid>.csv` - `speaker, content, start, end, event_type, role, tool_name, agent_type, agent_id, model, tokens_out, event_id, content_type`
2. `codes-<sid>.csv` - `start, end, code` (one of `user_message`, `assistant_message`, `tool_<name>`, `agent_<type>`, `idle`)
3. `events-<sid>.jsonl` - full canonical events with the metadata captured above

No session-level summary file. No cost. No pricing table.

## What works well and should be kept

- Reading JSONL directly with no hooks or extra config. The "find session by partial UUID" and "list sessions" UX in `convert.py` is solid.
- The speaker-mapping convention (`<user-name>`, `Claude`, `Tool:<name>`, `Agent:<type>:<id>`, `Idle`). Maps cleanly to TE's existing speaker model.
- The TE-required four columns (`speaker, content, start, end`). Lines up with TE's CSV contract.
- The `codes.csv` overlay mechanism. Already supported by TE's existing code-overlay loader.
- The `events.jsonl` archival output. Foundation for any future re-derivation.
- `convert-latest.py` as a one-command UX for the common case.
- `tools/claude-code-converter/README.md` and `docs/claude-code-converter/setup.md`. Both accurate for v1.0.0.

## What is missing or wrong

Gaps that block any "data clarity" work on top of the current converter:

- The CSV drops most token data. Only `tokens_out` makes it through. Cost is not even computable downstream because `input`, `cache_read`, and `cache_write` are gone by the time CSV is written.
- No cost computation anywhere. No pricing table file. The README mentions cost is not captured but doesn't say what to do about it.
- No session-level summary. Nothing aggregates tokens or duration across the session.
- `turn_duration` is captured as a synthetic event row but never used. The actual API time information goes nowhere downstream.
- System subtypes other than `turn_duration` are silently dropped. `api_error` retry counts in particular are the only window onto reliability and they vanish.
- `attachment`, `permission-mode`, `summary` entries are dropped. These do appear in real sessions (verified). Whether they belong in the CSV is a judgment call, but right now they are simply gone.
- `stop_reason` is not captured. This is needed to know whether a turn ended naturally, hit a token cap, or was interrupted.
- The `events.jsonl` schema is loosely defined. Field names are documented in the README table but there is no separate schema file declaring required vs optional fields, types, or invariants. Re-derivation is not currently possible without reading the converter source.

## Recommendation

Keep convert.py as the foundation. The JSONL parsing, session discovery, speaker mapping, idle handling, and CSV+codes+events output structure are all worth preserving.

Three additions are needed before anything downstream can do useful "data clarity" work:

1. Capture full token breakdown (`input`, `output`, `cache_read`, `cache_write`) on every assistant row. Add as additional CSV columns.
2. A pricing table file (versioned, separate from the converter) plus cost derivation per assistant row. Output as a `cost_usd` column. Per-session pricing version recorded somewhere durable.
3. A session-level summary file (`session-<sid>.json`) with totals: token sums, cost sum, wall-clock, turn count, plus capture flags for what was and wasn't observed (e.g., did `turn_duration` events appear at all).

Two further additions are worth doing if the answer to "should we visualize system events / errors / context changes" is yes:

4. Capture remaining system subtypes (`api_error`, `away_summary`, etc.), `attachment` entries, and `permission-mode` entries as synthetic event rows or as a separate sidecar. Default to off in the CSV; expose in `events.jsonl` for power users.
5. Capture `stop_reason` per assistant row.

Two cleanups:

- Delete `docs/qa.md` (off-topic).
- Delete `docs/claude-code-mapping/` (empty).

If the additions in 1-3 happen, the schema version bumps to v2.0.0 and the README needs a small update. The user-facing setup runbook in `docs/claude-code-converter/setup.md` does not need to change for additions 1-3 because the CLI surface stays the same.

The next file (03) defines exactly how each captured field maps from JSONL into the CSV columns, and which ones are direct reads vs computed vs assumed.
