#!/usr/bin/env python3
"""
Claude Code Session → Transcript Explorer CSV Converter

Reads a Claude Code session JSONL file and produces:
  1. transcript.csv  — TE-compatible (speaker, content, start, end + extended columns)
  2. codes.csv        — Activity type overlay for TE code visualization
  3. events.jsonl     — Normalized canonical events (full detail, for archival/reprocessing)

Usage:
  python3 convert.py <session.jsonl> [--output-dir <dir>] [--user-name <name>]
  python3 convert.py --session-id <uuid> [--project <path>] [--output-dir <dir>]
  python3 convert.py --list-sessions [--project <path>]

The session JSONL files live at:
  ~/.claude/projects/<project-slug>/<session-id>.jsonl
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Schema version — bump when output format changes
# ---------------------------------------------------------------------------
SCHEMA_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def iso_to_ms(iso_str: str) -> float:
    """Convert ISO 8601 timestamp to Unix milliseconds."""
    if not iso_str:
        return 0.0
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return dt.timestamp() * 1000


def ms_to_seconds_relative(ms: float, session_start_ms: float) -> float:
    """Convert absolute ms to session-relative seconds."""
    return round((ms - session_start_ms) / 1000, 3)


def sanitize_content(text: str) -> str:
    """Clean content for CSV output — remove null bytes, normalize whitespace."""
    if not text:
        return ""
    return text.replace("\x00", "").strip()


def slugify_project_path(project_path: str) -> str:
    """Convert /home/edwin/git/phd to -home-edwin-git-phd (Claude Code convention)."""
    return project_path.replace("/", "-").lstrip("-")


def find_session_file(session_id: str, project_path: str | None = None) -> Path | None:
    """Locate a session JSONL file by session ID (supports partial UUID match)."""
    claude_dir = Path.home() / ".claude"
    projects_dir = claude_dir / "projects"

    if project_path:
        search_dirs = [claude_dir / "projects" / slugify_project_path(project_path)]
    else:
        search_dirs = [d for d in projects_dir.iterdir() if d.is_dir()] if projects_dir.exists() else []

    # Try exact match first
    for d in search_dirs:
        exact = d / f"{session_id}.jsonl"
        if exact.exists():
            return exact

    # Try partial match (prefix)
    matches = []
    for d in search_dirs:
        for f in d.glob("*.jsonl"):
            if f.stem.startswith(session_id):
                matches.append(f)

    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        print(f"Ambiguous session ID '{session_id}' matches {len(matches)} sessions:", file=sys.stderr)
        for m in matches:
            print(f"  {m.stem}", file=sys.stderr)
        return None

    return None


def list_sessions(project_path: str | None = None) -> list[dict]:
    """List available sessions with metadata."""
    claude_dir = Path.home() / ".claude"
    sessions = []

    if project_path:
        slug = slugify_project_path(project_path)
        search_dirs = [claude_dir / "projects" / slug]
    else:
        search_dirs = list((claude_dir / "projects").iterdir()) if (claude_dir / "projects").exists() else []

    for proj_dir in search_dirs:
        if not proj_dir.is_dir():
            continue
        for jsonl_file in proj_dir.glob("*.jsonl"):
            try:
                with open(jsonl_file) as f:
                    first_line = None
                    entry_count = 0
                    last_timestamp = None
                    for line in f:
                        entry_count += 1
                        obj = json.loads(line.strip())
                        if first_line is None and obj.get("type") in ("user", "assistant"):
                            first_line = obj
                        if obj.get("timestamp"):
                            last_timestamp = obj["timestamp"]

                if first_line:
                    sessions.append({
                        "session_id": jsonl_file.stem,
                        "project": proj_dir.name,
                        "start": first_line.get("timestamp", ""),
                        "end": last_timestamp or "",
                        "entries": entry_count,
                        "path": str(jsonl_file),
                    })
            except (json.JSONDecodeError, KeyError):
                continue

    sessions.sort(key=lambda s: s.get("start", ""), reverse=True)
    return sessions


# ---------------------------------------------------------------------------
# JSONL Parser → Canonical Events
# ---------------------------------------------------------------------------

class SessionParser:
    """Parse a Claude Code session JSONL into canonical ConversationEvents."""

    def __init__(self, jsonl_path: str, user_name: str = "User"):
        self.jsonl_path = jsonl_path
        self.user_name = user_name
        self.entries: list[dict] = []
        self.events: list[dict] = []
        self.session_id: str = ""
        self.session_start_ms: float = 0.0
        self.project_path: str = ""
        self.git_branch: str = ""

    def parse(self) -> list[dict]:
        """Main entry point: read JSONL, produce canonical events."""
        self._load_entries()
        self._extract_session_metadata()
        self._walk_entries()
        return self.events

    def _load_entries(self):
        with open(self.jsonl_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        self.entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    def _extract_session_metadata(self):
        """Pull session-level info from first meaningful entry."""
        for entry in self.entries:
            if entry.get("sessionId"):
                self.session_id = entry["sessionId"]
            if entry.get("cwd"):
                self.project_path = entry["cwd"]
            if entry.get("gitBranch"):
                self.git_branch = entry["gitBranch"]
            if entry.get("timestamp") and entry.get("type") in ("user", "assistant"):
                self.session_start_ms = iso_to_ms(entry["timestamp"])
                break

        # Emit session_start event
        self.events.append({
            "event_id": f"session_start_{self.session_id[:8]}",
            "session_id": self.session_id,
            "parent_event_id": None,
            "timestamp_iso": datetime.fromtimestamp(
                self.session_start_ms / 1000, tz=timezone.utc
            ).isoformat() if self.session_start_ms else "",
            "timestamp_ms": self.session_start_ms,
            "session_elapsed_s": 0.0,
            "duration_ms": None,
            "speaker": "System",
            "role": "system",
            "event_type": "session_start",
            "content": f"Session started: {self.session_id}",
            "content_type": "text",
            "tool_name": None,
            "tool_params": None,
            "tool_use_id": None,
            "agent_type": None,
            "agent_id": None,
            "agent_description": None,
            "invoked_by": None,
            "model": None,
            "token_usage": None,
            "git_branch": self.git_branch,
            "project_path": self.project_path,
            "metadata": {"schema_version": SCHEMA_VERSION},
        })

    def _make_event(self, **kwargs) -> dict:
        """Create a canonical event with defaults."""
        ts_ms = kwargs.get("timestamp_ms", 0)
        base = {
            "event_id": kwargs.get("event_id", ""),
            "session_id": self.session_id,
            "parent_event_id": kwargs.get("parent_event_id"),
            "timestamp_iso": kwargs.get("timestamp_iso", ""),
            "timestamp_ms": ts_ms,
            "session_elapsed_s": ms_to_seconds_relative(ts_ms, self.session_start_ms) if ts_ms else 0.0,
            "duration_ms": kwargs.get("duration_ms"),
            "speaker": kwargs.get("speaker", ""),
            "role": kwargs.get("role", ""),
            "event_type": kwargs.get("event_type", ""),
            "content": kwargs.get("content", ""),
            "content_type": kwargs.get("content_type", "text"),
            "tool_name": kwargs.get("tool_name"),
            "tool_params": kwargs.get("tool_params"),
            "tool_use_id": kwargs.get("tool_use_id"),
            "agent_type": kwargs.get("agent_type"),
            "agent_id": kwargs.get("agent_id"),
            "agent_description": kwargs.get("agent_description"),
            "invoked_by": kwargs.get("invoked_by"),
            "model": kwargs.get("model"),
            "token_usage": kwargs.get("token_usage"),
            "git_branch": self.git_branch,
            "project_path": self.project_path,
            "metadata": kwargs.get("metadata", {}),
        }
        return base

    def _walk_entries(self):
        """Walk JSONL entries and emit canonical events."""
        # Track active agent tool_use_ids to identify agent results
        active_agents: dict[str, dict] = {}  # tool_use_id -> agent info
        # Track tool_use entries to pair with results
        pending_tools: dict[str, dict] = {}  # tool_use_id -> tool info

        for entry in self.entries:
            entry_type = entry.get("type")
            timestamp_iso = entry.get("timestamp", "")
            timestamp_ms = iso_to_ms(timestamp_iso) if timestamp_iso else 0
            uuid = entry.get("uuid", "")
            parent_uuid = entry.get("parentUuid")

            # ----- USER MESSAGE -----
            if entry_type == "user":
                message = entry.get("message", {})
                content = message.get("content", "")

                # Plain text user message
                if isinstance(content, str):
                    cleaned = sanitize_content(content)
                    if cleaned:
                        self.events.append(self._make_event(
                            event_id=uuid,
                            parent_event_id=parent_uuid,
                            timestamp_iso=timestamp_iso,
                            timestamp_ms=timestamp_ms,
                            speaker=self.user_name,
                            role="user",
                            event_type="message",
                            content=cleaned,
                            content_type="text",
                            metadata={
                                "permission_mode": entry.get("permissionMode"),
                                "version": entry.get("version"),
                            },
                        ))

                # Tool result (returned to assistant)
                elif isinstance(content, list):
                    for block in content:
                        if block.get("type") == "tool_result":
                            tool_use_id = block.get("tool_use_id", "")
                            result_content = block.get("content", "")

                            # Extract text from content blocks
                            if isinstance(result_content, list):
                                texts = [b.get("text", "") for b in result_content if b.get("type") == "text"]
                                result_text = "\n".join(texts)
                            elif isinstance(result_content, str):
                                result_text = result_content
                            else:
                                result_text = str(result_content)

                            is_error = block.get("is_error", False)

                            # Determine speaker based on what tool this is a result for
                            tool_info = pending_tools.pop(tool_use_id, {})
                            tool_name = tool_info.get("tool_name", "Unknown")
                            agent_info = active_agents.get(tool_use_id)

                            if agent_info:
                                # This is an agent result
                                speaker = f"Agent:{agent_info['agent_type']}:{agent_info.get('agent_id', tool_use_id[:8])}"
                                self.events.append(self._make_event(
                                    event_id=uuid,
                                    parent_event_id=parent_uuid,
                                    timestamp_iso=timestamp_iso,
                                    timestamp_ms=timestamp_ms,
                                    speaker=speaker,
                                    role="agent",
                                    event_type="agent_result",
                                    content=sanitize_content(result_text),
                                    content_type="error" if is_error else "text",
                                    tool_name="Agent",
                                    tool_use_id=tool_use_id,
                                    agent_type=agent_info.get("agent_type"),
                                    agent_id=agent_info.get("agent_id"),
                                    agent_description=agent_info.get("description"),
                                    invoked_by="Claude",
                                ))
                                del active_agents[tool_use_id]
                            else:
                                # Regular tool result
                                speaker = f"Tool:{tool_name}"
                                self.events.append(self._make_event(
                                    event_id=uuid,
                                    parent_event_id=parent_uuid,
                                    timestamp_iso=timestamp_iso,
                                    timestamp_ms=timestamp_ms,
                                    speaker=speaker,
                                    role="tool",
                                    event_type="tool_result",
                                    content=sanitize_content(result_text),
                                    content_type="error" if is_error else "text",
                                    tool_name=tool_name,
                                    tool_use_id=tool_use_id,
                                ))

            # ----- ASSISTANT MESSAGE -----
            elif entry_type == "assistant":
                message = entry.get("message", {})
                model = message.get("model", "")
                usage = message.get("usage")
                content_blocks = message.get("content", [])

                token_usage = None
                if usage:
                    token_usage = {
                        "input": usage.get("input_tokens", 0),
                        "output": usage.get("output_tokens", 0),
                        "cache_read": usage.get("cache_read_input_tokens", 0),
                        "cache_write": usage.get("cache_creation_input_tokens", 0),
                    }

                for block in content_blocks:
                    block_type = block.get("type")

                    # Thinking block
                    if block_type == "thinking":
                        thinking_text = block.get("thinking", "")
                        if thinking_text:
                            self.events.append(self._make_event(
                                event_id=uuid,
                                parent_event_id=parent_uuid,
                                timestamp_iso=timestamp_iso,
                                timestamp_ms=timestamp_ms,
                                speaker="Claude",
                                role="assistant",
                                event_type="thinking",
                                content=sanitize_content(thinking_text),
                                content_type="thinking",
                                model=model,
                                token_usage=token_usage,
                            ))

                    # Text response
                    elif block_type == "text":
                        self.events.append(self._make_event(
                            event_id=uuid,
                            parent_event_id=parent_uuid,
                            timestamp_iso=timestamp_iso,
                            timestamp_ms=timestamp_ms,
                            speaker="Claude",
                            role="assistant",
                            event_type="message",
                            content=sanitize_content(block.get("text", "")),
                            content_type="text",
                            model=model,
                            token_usage=token_usage,
                        ))

                    # Tool use (call)
                    elif block_type == "tool_use":
                        tool_name = block.get("name", "")
                        tool_id = block.get("id", "")
                        tool_input = block.get("input", {})

                        # Track for pairing with result
                        pending_tools[tool_id] = {
                            "tool_name": tool_name,
                            "tool_input": tool_input,
                        }

                        if tool_name == "Agent":
                            # Agent invocation
                            agent_type = tool_input.get("subagent_type", "general-purpose")
                            description = tool_input.get("description", "")
                            prompt = tool_input.get("prompt", "")
                            agent_id_str = tool_id[:12]

                            active_agents[tool_id] = {
                                "agent_type": agent_type,
                                "agent_id": agent_id_str,
                                "description": description,
                            }

                            speaker = f"Agent:{agent_type}:{agent_id_str}"
                            self.events.append(self._make_event(
                                event_id=uuid,
                                parent_event_id=parent_uuid,
                                timestamp_iso=timestamp_iso,
                                timestamp_ms=timestamp_ms,
                                speaker=speaker,
                                role="agent",
                                event_type="agent_spawn",
                                content=f"[Agent spawned: {agent_type}] {description}\n\nPrompt: {prompt}",
                                content_type="text",
                                tool_name="Agent",
                                tool_use_id=tool_id,
                                agent_type=agent_type,
                                agent_id=agent_id_str,
                                agent_description=description,
                                invoked_by="Claude",
                                model=model,
                            ))
                        else:
                            # Regular tool call
                            # Format params for readability
                            if tool_name == "Bash":
                                param_summary = tool_input.get("command", "")
                                desc = tool_input.get("description", "")
                                content = f"$ {param_summary}"
                                if desc:
                                    content = f"[{desc}]\n{content}"
                            elif tool_name == "Read":
                                content = f"[Read file: {tool_input.get('file_path', '')}]"
                            elif tool_name == "Write":
                                fp = tool_input.get("file_path", "")
                                content_text = tool_input.get("content", "")
                                content = f"[Write file: {fp}]\n{content_text}"
                            elif tool_name == "Edit":
                                fp = tool_input.get("file_path", "")
                                old = tool_input.get("old_string", "")
                                new = tool_input.get("new_string", "")
                                content = f"[Edit file: {fp}]\n- {old[:200]}\n+ {new[:200]}"
                            elif tool_name == "Grep":
                                content = f"[Grep: {tool_input.get('pattern', '')}]"
                            elif tool_name == "Glob":
                                content = f"[Glob: {tool_input.get('pattern', '')}]"
                            else:
                                content = f"[{tool_name}] {json.dumps(tool_input)[:500]}"

                            self.events.append(self._make_event(
                                event_id=uuid,
                                parent_event_id=parent_uuid,
                                timestamp_iso=timestamp_iso,
                                timestamp_ms=timestamp_ms,
                                speaker=f"Tool:{tool_name}",
                                role="tool",
                                event_type="tool_call",
                                content=sanitize_content(content),
                                content_type="code" if tool_name in ("Bash", "Write", "Edit") else "text",
                                tool_name=tool_name,
                                tool_params=tool_input,
                                tool_use_id=tool_id,
                                model=model,
                            ))

            # ----- PROGRESS (agent streaming) -----
            elif entry_type == "progress":
                data = entry.get("data", {})
                progress_type = data.get("type", "")

                # We skip individual agent_progress entries to avoid noise.
                # The agent_spawn + agent_result events capture the boundaries.
                # But we track timing from first/last progress for duration calc.
                pass

            # ----- SYSTEM (turn_duration, stop_hook) -----
            elif entry_type == "system":
                subtype = entry.get("subtype", "")

                if subtype == "turn_duration":
                    duration_ms = entry.get("durationMs", 0)
                    self.events.append(self._make_event(
                        event_id=uuid,
                        parent_event_id=parent_uuid,
                        timestamp_iso=timestamp_iso,
                        timestamp_ms=timestamp_ms,
                        speaker="System",
                        role="system",
                        event_type="turn_duration",
                        content=f"Turn completed in {duration_ms}ms ({duration_ms/1000:.1f}s)",
                        content_type="text",
                        duration_ms=duration_ms,
                    ))

        # Emit session_end event
        if self.entries:
            last_ts = ""
            for e in reversed(self.entries):
                if e.get("timestamp"):
                    last_ts = e["timestamp"]
                    break
            last_ms = iso_to_ms(last_ts) if last_ts else 0

            self.events.append(self._make_event(
                event_id=f"session_end_{self.session_id[:8]}",
                parent_event_id=None,
                timestamp_iso=last_ts,
                timestamp_ms=last_ms,
                speaker="System",
                role="system",
                event_type="session_end",
                content=f"Session ended: {self.session_id}",
                content_type="text",
                metadata={
                    "total_events": len(self.events),
                    "total_jsonl_entries": len(self.entries),
                },
            ))


# ---------------------------------------------------------------------------
# Event → CSV converters
# ---------------------------------------------------------------------------

# Transcript CSV columns (TE required + extended)
TRANSCRIPT_COLUMNS = [
    "speaker",          # TE required
    "content",          # TE required
    "start",            # TE optional (seconds, session-relative)
    "end",              # TE optional (seconds, session-relative)
    "event_type",       # Extended: message, tool_call, tool_result, agent_spawn, etc.
    "role",             # Extended: user, assistant, agent, tool, system
    "tool_name",        # Extended: Bash, Read, Agent, etc.
    "agent_type",       # Extended: Explore, general-purpose, etc.
    "agent_id",         # Extended: agent instance identifier
    "model",            # Extended: claude-opus-4-6, etc.
    "tokens_out",       # Extended: output token count
    "event_id",         # Extended: UUID for cross-referencing
    "content_type",     # Extended: text, code, thinking, error
]

# Codes CSV columns
CODES_COLUMNS = ["start", "end", "code"]


def events_to_transcript_csv(events: list[dict], idle_threshold_s: float = 30.0) -> list[dict]:
    """Convert canonical events to TE-compatible CSV rows.

    Timing strategy:
    - Each event starts at its timestamp
    - End time = start of next event by the SAME speaker or next event overall,
      whichever is sooner, UNLESS the gap exceeds idle_threshold_s
    - Gaps longer than idle_threshold_s are split: the event gets a short end time
      (based on content length heuristic) and an "Idle" row is inserted
    """
    rows = []

    # Filter to meaningful events (skip session_start/end system noise)
    meaningful = [
        e for e in events
        if e["event_type"] not in ("session_start", "session_end", "turn_duration")
        and e["content"]  # skip empty
    ]

    for i, event in enumerate(meaningful):
        start = event["session_elapsed_s"]

        # Determine natural end time from next event
        if i + 1 < len(meaningful):
            next_start = meaningful[i + 1]["session_elapsed_s"]
        else:
            next_start = start + 1.0

        gap = next_start - start

        # Estimate a reasonable duration for this event based on its type
        if event["event_type"] in ("tool_call", "tool_result"):
            # Tool calls/results are near-instant from the log perspective
            estimated_duration = min(gap, 2.0)
        elif event["event_type"] in ("agent_spawn",):
            # Agent spawn is logged at invocation, result comes later
            estimated_duration = min(gap, 1.0)
        elif event["event_type"] == "message" and event["role"] == "assistant":
            # Estimate speaking time from content length (~3 words/sec for reading)
            word_count = len(event["content"].split())
            estimated_duration = min(gap, max(word_count / 3.0, 2.0))
        elif event["event_type"] == "message" and event["role"] == "user":
            # User message: the timestamp is when they hit Enter
            # Content was composed before this moment
            word_count = len(event["content"].split())
            estimated_duration = min(gap, max(word_count / 5.0, 1.0))
        else:
            estimated_duration = min(gap, 5.0)

        # If the gap is large, use estimated duration and insert idle
        if gap > idle_threshold_s:
            # Cap estimated duration so there's always a meaningful idle gap
            capped_duration = min(estimated_duration, gap * 0.5, 60.0)
            end = start + capped_duration
            rows.append(_make_csv_row(event, start, end))

            # Insert idle gap
            idle_start = end
            idle_end = next_start
            idle_duration = idle_end - idle_start
            rows.append({
                "speaker": "Idle",
                "content": f"[Gap: {idle_duration:.0f}s — user reading/thinking/away]",
                "start": round(idle_start, 3),
                "end": round(idle_end, 3),
                "event_type": "idle",
                "role": "system",
                "tool_name": "",
                "agent_type": "",
                "agent_id": "",
                "model": "",
                "tokens_out": "",
                "event_id": f"idle_{i}",
                "content_type": "text",
            })
        else:
            # Normal case: event spans until next event
            end = next_start
            if end <= start:
                end = start + 0.1
            rows.append(_make_csv_row(event, start, end))

    return rows


def _make_csv_row(event: dict, start: float, end: float) -> dict:
    """Build a single CSV row from a canonical event."""
    tokens_out = ""
    if event.get("token_usage") and event["token_usage"].get("output"):
        tokens_out = event["token_usage"]["output"]

    return {
        "speaker": event["speaker"],
        "content": event["content"],
        "start": round(start, 3),
        "end": round(end, 3),
        "event_type": event["event_type"],
        "role": event["role"],
        "tool_name": event.get("tool_name") or "",
        "agent_type": event.get("agent_type") or "",
        "agent_id": event.get("agent_id") or "",
        "model": event.get("model") or "",
        "tokens_out": tokens_out,
        "event_id": event["event_id"],
        "content_type": event.get("content_type", "text"),
    }


def events_to_codes_csv(transcript_rows: list[dict]) -> list[dict]:
    """Generate activity-type codes from transcript CSV rows.

    Uses the already-computed start/end times from the transcript rows,
    ensuring codes and transcript are perfectly aligned.
    """
    rows = []

    for row in transcript_rows:
        event_type = row["event_type"]
        role = row["role"]
        tool = (row.get("tool_name") or "unknown").lower()
        agent = (row.get("agent_type") or "unknown").lower()

        code_map = {
            "message": f"{role}_message",
            "thinking": "ai_thinking",
            "tool_call": f"tool_{tool}",
            "tool_result": f"tool_{tool}_result",
            "agent_spawn": f"agent_{agent}",
            "agent_result": f"agent_{agent}_result",
            "idle": "idle",
        }
        code = code_map.get(event_type, event_type)

        rows.append({
            "start": row["start"],
            "end": row["end"],
            "code": code,
        })

    return rows


# ---------------------------------------------------------------------------
# File writers
# ---------------------------------------------------------------------------

def write_csv(rows: list[dict], columns: list[str], output_path: str):
    """Write rows to CSV file."""
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Wrote {len(rows)} rows → {output_path}")


def write_events_jsonl(events: list[dict], output_path: str):
    """Write canonical events to JSONL."""
    with open(output_path, "w", encoding="utf-8") as f:
        for event in events:
            # Convert non-serializable fields
            cleaned = {}
            for k, v in event.items():
                if v is None:
                    cleaned[k] = None
                else:
                    cleaned[k] = v
            f.write(json.dumps(cleaned, default=str, ensure_ascii=False) + "\n")
    print(f"  Wrote {len(events)} events → {output_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert Claude Code session JSONL to Transcript Explorer CSV",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Input source (mutually exclusive)
    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument("jsonl_file", nargs="?", help="Path to session JSONL file")
    input_group.add_argument("--session-id", "-s", help="Session UUID to find and convert")
    input_group.add_argument("--list-sessions", "-l", action="store_true", help="List available sessions")

    # Options
    parser.add_argument("--output-dir", "-o", default=".", help="Output directory (default: current)")
    parser.add_argument("--user-name", "-u", default="User", help="Name for the human user (default: User)")
    parser.add_argument("--project", "-p", help="Project path to search for sessions")
    parser.add_argument("--no-codes", action="store_true", help="Skip generating codes.csv")
    parser.add_argument("--no-events", action="store_true", help="Skip generating events.jsonl")
    parser.add_argument("--include-thinking", action="store_true", help="Include AI thinking blocks in transcript")
    parser.add_argument("--include-system", action="store_true", help="Include system events in transcript")

    args = parser.parse_args()

    # --- List sessions ---
    if args.list_sessions:
        sessions = list_sessions(args.project)
        if not sessions:
            print("No sessions found.")
            return

        print(f"{'Session ID':<40} {'Start':<22} {'Entries':>8}  Project")
        print("-" * 100)
        for s in sessions:
            print(f"{s['session_id']:<40} {s['start'][:19]:<22} {s['entries']:>8}  {s['project']}")
        return

    # --- Resolve input file ---
    jsonl_path = None
    if args.jsonl_file:
        jsonl_path = args.jsonl_file
    elif args.session_id:
        found = find_session_file(args.session_id, args.project)
        if found:
            jsonl_path = str(found)
        else:
            print(f"Error: Could not find session {args.session_id}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()
        sys.exit(1)

    if not os.path.exists(jsonl_path):
        print(f"Error: File not found: {jsonl_path}", file=sys.stderr)
        sys.exit(1)

    # --- Parse ---
    print(f"Parsing: {jsonl_path}")
    session_parser = SessionParser(jsonl_path, user_name=args.user_name)
    events = session_parser.parse()
    print(f"  Extracted {len(events)} canonical events")

    # --- Filter ---
    if not args.include_thinking:
        events_for_csv = [e for e in events if e["event_type"] != "thinking"]
    else:
        events_for_csv = events

    if not args.include_system:
        events_for_csv = [e for e in events_for_csv if e["role"] != "system"]

    # --- Output ---
    os.makedirs(args.output_dir, exist_ok=True)

    # Derive output filenames from session ID
    sid = session_parser.session_id[:8] if session_parser.session_id else "unknown"

    # Transcript CSV
    transcript_rows = events_to_transcript_csv(events_for_csv)
    transcript_path = os.path.join(args.output_dir, f"transcript-{sid}.csv")
    write_csv(transcript_rows, TRANSCRIPT_COLUMNS, transcript_path)

    # Codes CSV
    if not args.no_codes:
        codes_rows = events_to_codes_csv(transcript_rows)
        codes_path = os.path.join(args.output_dir, f"codes-{sid}.csv")
        write_csv(codes_rows, CODES_COLUMNS, codes_path)

    # Canonical events JSONL
    if not args.no_events:
        events_path = os.path.join(args.output_dir, f"events-{sid}.jsonl")
        write_events_jsonl(events, events_path)

    # --- Summary ---
    print(f"\nSession: {session_parser.session_id}")
    print(f"Project: {session_parser.project_path}")

    # Count by role
    role_counts = {}
    for r in transcript_rows:
        role = r["role"]
        role_counts[role] = role_counts.get(role, 0) + 1
    print(f"Events by role: {role_counts}")

    # Count unique speakers
    speakers = sorted(set(r["speaker"] for r in transcript_rows))
    print(f"Speakers ({len(speakers)}): {', '.join(speakers)}")

    if transcript_rows:
        duration = transcript_rows[-1]["end"]
        print(f"Duration: {duration:.1f}s ({duration/60:.1f}min)")


if __name__ == "__main__":
    main()
