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

# `X | None` annotations are 3.10+ syntax and this module is full of them, so
# on 3.9 — still the system Python on current macOS — importing it failed at
# the first such signature. Deferring annotations costs nothing on newer
# interpreters and makes the converter runnable wherever it is checked out.
from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
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


# Local filesystem paths appear throughout tool inputs and results. They carry
# no interactional meaning and leak the machine layout of whoever recorded the
# session, so they are reduced to a bare filename.
_HOME_PATH = re.compile(r"(?:/tmp/[\w.-]+/|/home/[\w.-]+/|/Users/[\w.-]+/)[\w./-]*?([\w.-]+\.\w+)")
_HOME_DIR = re.compile(r"(?:/tmp/[\w.-]+/|/home/[\w.-]+/|/Users/[\w.-]+/)[\w./-]*")


# A background agent has no channel of its own to report on. When one finishes,
# the harness delivers its write-up through the same channel the person types
# into, so the completion arrives as a user message: role `user`, speaker
# `User`, stamped at the moment the agent stopped. Two of the fourteen human
# turns in the multi-agent session are these, and they carry 2,397 of its 2,667
# apparent human words — the person wrote 255. Left alone they make delegated
# work look like typing, and at a rate no typing could reach.
#
# The wrapper is unambiguous, and it names the agent twice over: `task-id`
# matches the sub-agent transcript the work was recorded in, `tool-use-id`
# matches the spawn that started it. Either one re-attributes the row.
_TASK_NOTIFICATION_OPEN = "<task-notification>"


def _has_tool_result(content) -> bool:
    """True if a message body carries a tool_result block."""
    return isinstance(content, list) and any(
        isinstance(block, dict) and block.get("type") == "tool_result"
        for block in content
    )


def _tagged(tag: str, text: str) -> str:
    """Contents of the first `<tag>...</tag>` in `text`, or empty."""
    match = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
    return match.group(1).strip() if match else ""


def parse_task_notification(text: str) -> dict | None:
    """Fields of a `<task-notification>` block, or None if `text` is not one.

    `result` is the agent's own write-up with the wrapper removed. The wrapper
    is roughly 80 words of routing metadata — ids, a status, a note about
    resumption, token counts — which belongs in the columns that exist for it
    rather than in the agent's word count.
    """
    if not text or not text.lstrip().startswith(_TASK_NOTIFICATION_OPEN):
        return None

    summary = _tagged("summary", text)
    result = _tagged("result", text)
    if not result:
        # A failed or empty agent still reported something. Keep the summary so
        # the row is not dropped for having no body.
        result = summary or text.strip()

    def _int(tag: str) -> int | None:
        raw = _tagged(tag, text)
        return int(raw) if raw.isdigit() else None

    return {
        "task_id": _tagged("task-id", text),
        "tool_use_id": _tagged("tool-use-id", text),
        "status": _tagged("status", text),
        "summary": summary,
        "result": result,
        "subagent_tokens": _int("subagent_tokens"),
        "tool_uses": _int("tool_uses"),
        "duration_ms": _int("duration_ms"),
    }


def sanitize_content(text: str) -> str:
    """Clean content for CSV output — remove null bytes, strip local paths."""
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = _HOME_PATH.sub(r"\1", text)
    text = _HOME_DIR.sub("<path>", text)
    return text.strip()


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

    def __init__(self, jsonl_path: str, user_name: str = "User",
                 include_subagents: bool = True):
        self.jsonl_path = jsonl_path
        self.user_name = user_name
        self.include_subagents = include_subagents
        self.subagent_files = 0
        # Short agent id -> agent type, for every sub-agent transcript loaded.
        # A task notification names its agent by id alone; this is what turns
        # that id back into the speaker the agent's own rows already use.
        self.agent_types: dict[str, str] = {}
        # Task notifications seen: those dropped as a redelivery of the agent's
        # own message, and those kept because nothing else recorded them.
        self.notifications_deduped = 0
        self.notifications_kept = 0
        # Harness-injected `user` entries dropped: image attachment notes, skill
        # preambles, install declines. See the isMeta skip in _walk_entries.
        self.meta_skipped = 0
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
        if self.include_subagents:
            self._load_subagent_entries()
        # Single chronological stream across main session and sub-agents.
        self.entries.sort(key=lambda e: e.get("timestamp") or "")

    def _load_subagent_entries(self):
        """Load sub-agent transcripts from <session-id>/subagents/agent-*.jsonl.

        These events do not appear in the main session log. Each entry is
        tagged with `_agent_label` so `_spk()` attributes it to the sub-agent.
        """
        main = Path(self.jsonl_path)
        subdir = main.parent / main.stem / "subagents"
        if not subdir.is_dir():
            return
        for path in sorted(subdir.glob("agent-*.jsonl")):
            agent_id = path.stem.replace("agent-", "")
            agent_type = "general-purpose"
            loaded = []
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if rec.get("attributionAgent"):
                        agent_type = rec["attributionAgent"]
                    loaded.append(rec)
            label = f"Agent:{agent_type}:{agent_id[:8]}"
            self.agent_types[agent_id[:8]] = agent_type
            for rec in loaded:
                rec["_agent_label"] = label
            self.entries.extend(loaded)
            self.subagent_files += 1

    @staticmethod
    def _spk(entry: dict, default: str) -> str:
        """Sub-agent label if the entry came from a sub-agent file, else default."""
        return entry.get("_agent_label") or default

    def _already_recorded(self, speaker: str, content: str) -> bool:
        """Whether `speaker` already has an event holding exactly `content`.

        A sub-agent's closing report is written to its own transcript and again
        into the notification, so with sub-agent files loaded both copies are
        present. Ordering makes this a backward look: entries are merged into
        one chronological stream, and the agent finishes before the harness can
        announce that it finished.
        """
        if not content:
            return False
        needle = content.strip()
        return any(
            e["speaker"] == speaker and e["content"].strip() == needle
            for e in self.events
        )

    def _resolve_notified_agent(
        self, notification: dict, active_agents: dict[str, dict]
    ) -> tuple[str, str]:
        """Agent type and id a task notification should be attributed to.

        The `task-id` is preferred: it keys the sub-agent transcript, so the
        result joins the rows the agent produced and inherits their speaker
        name — which is what `actor-colors.ts` colours by, and so what makes
        the report render in the same shade as the work it reports on.

        Failing that, the `tool-use-id` finds the spawn, which is how a session
        recorded without sub-agent files is still attributed. Only when neither
        resolves is the type left unknown, and even then the `Agent:` prefix
        keeps the row out of the person's lane.
        """
        short_id = notification["task_id"][:8]
        if short_id and short_id in self.agent_types:
            return self.agent_types[short_id], short_id

        spawn = active_agents.get(notification["tool_use_id"])
        if spawn:
            return spawn["agent_type"], spawn["agent_id"]

        return "unknown", short_id or "unknown"

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

                # The harness speaks through the person's channel: an image
                # attachment note for a screenshot Claude itself read, a skill's
                # base directory, a declined install. `isMeta` is how Claude
                # Code marks those, and it is the only thing separating them
                # from a typed prompt — without this they land in the transcript
                # as human turns nobody took.
                #
                # Only in the main session, though. A sub-agent file marks the
                # coordinator's mid-flight instructions isMeta too, and those
                # are real: Claude wrote them and the agent acted on them. They
                # arrive on the agent's own channel, not the person's, which is
                # what isSidechain distinguishes. Tool results are never isMeta,
                # but check for one anyway rather than trust that.
                if (entry.get("isMeta") and not entry.get("isSidechain")
                        and not _has_tool_result(content)):
                    self.meta_skipped += 1
                    continue

                # Plain text user message
                if isinstance(content, str):
                    cleaned = sanitize_content(content)
                    notification = parse_task_notification(cleaned)
                    if notification:
                        # A finished background agent reporting in. Attribute it
                        # to the agent that did the work, not to the person it
                        # was delivered to.
                        agent_type, agent_id = self._resolve_notified_agent(
                            notification, active_agents
                        )
                        speaker = f"Agent:{agent_type}:{agent_id}"
                        # The wrapper escapes the body for transport, so `<div>`
                        # arrives as `&lt;div&gt;`. Undo it before comparing or
                        # emitting, or an agent that wrote about HTML is
                        # recorded saying something it did not write.
                        body = sanitize_content(html.unescape(notification["result"]))
                        if self._already_recorded(speaker, body):
                            # The agent's own transcript already holds this
                            # report as a message of its own; the notification
                            # is the same text delivered a second time, through
                            # the person's channel. Keeping it would double the
                            # agent's word count and invent a contribution it
                            # never made twice.
                            self.notifications_deduped += 1
                            continue
                        self.notifications_kept += 1
                        self.events.append(self._make_event(
                            event_id=uuid,
                            parent_event_id=parent_uuid,
                            timestamp_iso=timestamp_iso,
                            timestamp_ms=timestamp_ms,
                            speaker=speaker,
                            role="agent",
                            event_type="agent_result",
                            content=body,
                            content_type=(
                                "text" if notification["status"] == "completed" else "error"
                            ),
                            tool_name="Agent",
                            tool_use_id=notification["tool_use_id"] or None,
                            agent_type=agent_type,
                            agent_id=agent_id,
                            agent_description=notification["summary"],
                            invoked_by="Claude",
                            duration_ms=notification["duration_ms"],
                            metadata={
                                "task_id": notification["task_id"],
                                "status": notification["status"],
                                "subagent_tokens": notification["subagent_tokens"],
                                "tool_uses": notification["tool_uses"],
                                "delivered_as": "user_message",
                            },
                        ))
                    elif cleaned:
                        self.events.append(self._make_event(
                            event_id=uuid,
                            parent_event_id=parent_uuid,
                            timestamp_iso=timestamp_iso,
                            timestamp_ms=timestamp_ms,
                            speaker=self._spk(entry, self.user_name),
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
                                # See spawn site above.
                                speaker = (
                                    "Tool:Agent" if self.subagent_files
                                    else f"Agent:{agent_info['agent_type']}:{agent_info.get('agent_id', tool_use_id[:8])}"
                                )
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
                                speaker=self._spk(entry, "Claude"),
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
                            speaker=self._spk(entry, "Claude"),
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

                            # With sub-agent files loaded, the agent already
                            # has an Agent: identity; label the spawn as a tool
                            # call so it does not get a second one.
                            speaker = (
                                "Tool:Agent" if self.subagent_files
                                else f"Agent:{agent_type}:{agent_id_str}"
                            )
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
                                speaker=self._spk(entry, f"Tool:{tool_name}"),
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
# Declares the transcript's provenance to consumers rather than leaving them to
# infer it from speaker names or column shape, both of which produce false
# positives on human corpora (a speaker called "Agent", a "role" column holding
# teacher/student).
SOURCE_KIND_COLUMN = "te_source_kind"
SOURCE_KIND_VALUE = "ai"

TRANSCRIPT_COLUMNS = [
    SOURCE_KIND_COLUMN,
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
    # Pairing keys. A tool use is one action recorded as two rows, and a
    # consumer cannot rejoin them without the id the provider issued.
    "tool_use_id",      # Extended: joins a call to its result
    "parent_event_id",  # Extended: the event this one answers or follows
    "content_type",     # Extended: text, code, thinking, error
    # Timing lenses. `end` never varies: a contribution ends when the log says
    # it concluded. Only the start is contested, and these are the three
    # answers. `start` above stays the work lens so existing readers, which
    # take start and end by column position, are unaffected.
    "start_record",     # what was logged: equals end, a tick
    "start_work",       # who was busy: measured span, or an estimate
    "start_floor",      # whose turn it was: from the previous conclusion
    "provenance",       # measured | estimated | marker
    "human_text",       # composed | brought | unknown, on human messages only
]

# Codes CSV columns
CODES_COLUMNS = ["start", "end", "code"]


# Fastest a person is taken to type. Above it the text was brought rather than
# composed. Set generously: a strong typist sustains about 80wpm, so 120 clears
# real typing while still catching a paste, which typically implies thousands.
HUMAN_WPM_CEILING = 120

# Width given to a human turn whose text was brought rather than composed.
# There is no composition to measure, so this is a visible marker, not a claim.
HUMAN_MARKER_S = 1.0

# Narrowest a row may be. Below this the row is treated as zero-width
# downstream and re-expanded from a word count.
MIN_ROW_WIDTH_S = 0.1

# Shortest silence before a human turn that a typing rate may be computed from.
# The rate is words over the preceding gap, so a gap of nothing implies a speed
# of infinity and would convict every turn of having been pasted — a nine-word
# instruction as readily as a thousand-word transcript. The first turn of a
# session has nothing before it at all and so always lands here.
MIN_TYPING_WINDOW_S = 0.5


# Shortest span accepted as a delegated agent actually running. Below this an
# `agent_result` is a launch acknowledgement, not a completion.
MIN_AGENT_SPAN_S = 1.0


def _collect_real_durations(events: list[dict]) -> dict[str, float]:
    """Map event_id -> measured duration in seconds.

    `turn_duration` events are the only records in a Claude session log that
    carry a *measured* `duration_ms`. Each one points at the event it timed via
    `parent_event_id`. They were previously filtered out with session noise,
    which discarded the only real timing in the file.
    """
    durations: dict[str, float] = {}
    for e in events:
        if e.get("event_type") != "turn_duration":
            continue
        parent = e.get("parent_event_id")
        ms = e.get("duration_ms")
        if parent and ms:
            durations[parent] = ms / 1000.0
    return durations


def _collect_agent_spans(events: list[dict]) -> dict[str, float]:
    """Map agent_id -> the session-elapsed time its result came back.

    A delegated agent's real span is spawn -> result. Both ends are recorded,
    so the span is recoverable even though neither event carries a duration.
    This is where genuine concurrency lives: agents launched before an earlier
    one returned overlap in wall-clock time.
    """
    spans: dict[str, float] = {}
    for e in events:
        if e.get("event_type") == "agent_result" and e.get("agent_id"):
            spans[e["agent_id"]] = e["session_elapsed_s"]
    return spans


def _floor_start(floor_mark: float, end: float) -> float:
    """Where a contribution begins under the floor lens.

    The floor is single-threaded: a contribution holds it from the moment the
    previous one released it, so the session tiles and participation shares sum
    to it. Keeping a row's own start where that start preceded the mark left
    the lens half-tiled and half-overlapping, which is neither readable nor
    countable.

    Concurrency is flattened here by design. Two agents running at once cannot
    both hold a single floor, and the work lens is where that overlap is read.
    """
    return max(min(floor_mark, end - MIN_ROW_WIDTH_S), 0.0)


def _reach_back_floor(end: float) -> tuple[float, float]:
    """Span for a contribution whose reach-back was fully consumed.

    Two failures to avoid. A zero-width row is re-expanded downstream from a
    word count, which would reinstate an estimate the converter deliberately
    did not make. And pushing `end` forward cascades: the inflated end becomes
    the next row's floor, and a session that ran 2,607s reports 3,616s once
    enough rows have shifted.

    So `end` stays pinned to the timestamp and the row keeps a sliver of width
    by reaching back into its predecessor. The resulting overlap is a
    millisecond artefact of two contributions abutting, which is a far smaller
    lie than a session a thousand seconds too long. The one exception is a
    session that opens on a submit, where there is nothing behind it to reach
    into: that row alone falls forward, and being first it cannot cascade.
    """
    if end <= MIN_ROW_WIDTH_S:
        return 0.0, max(end, HUMAN_MARKER_S)
    return max(end - MIN_ROW_WIDTH_S, 0.0), end


def events_to_transcript_csv(
    events: list[dict],
    idle_threshold_s: float = 30.0,
    emit_idle: bool = False,
) -> list[dict]:
    """Convert canonical events to TE-compatible CSV rows.

    Timing strategy:
    - Each event starts at its timestamp.
    - End time is the first of these that is available:
        1. spawn -> result, for a delegated agent;
        2. a measured `duration_ms` recorded against this event;
        3. a duration estimated from the event's type and content length.
    - Rows are never stretched to meet the next row. A row's width is how long
      that contribution actually took, so a quiet stretch stays visibly quiet
      and work that genuinely ran at the same time genuinely overlaps.

    Ending each row at the next row's start (the previous strategy) made every
    row abut its neighbour. Two things followed: nothing could overlap, so
    parallel agent work was unrepresentable; and a tool result absorbed the
    model's thinking time, so "tools vs. model" read wrong. Both are timing the
    log already carried.

    Idle rows are off by default. They are an inferred quantity rather than an
    observed one, and as a separate speaker they add a participant to every
    visualization: a two-party chat renders as a three-node cycle routed through
    Idle. The gap itself is not lost when they are omitted, since consecutive
    events retain their real timestamps and the silence is derivable from them.
    """
    rows = []
    # End of the most recent human message. A measured turn begins when the
    # person submits, so that is what the reach-back is clamped to.
    last_human_end = 0.0
    # Running maximum end across everything emitted so far. The floor lens
    # starts each contribution where the last one concluded, so the session
    # tiles with no unaccounted time.
    floor_mark = 0.0
    # End of the last thing to conclude, whoever produced it. Used to size the
    # window a human turn had available, which is what makes a paste detectable.
    prev_any_end = 0.0

    real_durations = _collect_real_durations(events)
    agent_spans = _collect_agent_spans(events)

    # Filter to meaningful events (skip session_start/end system noise).
    # `turn_duration` is consumed above for its timing, not emitted as a row.
    meaningful = [
        e for e in events
        if e["event_type"] not in ("session_start", "session_end", "turn_duration")
        and e["content"]  # skip empty
    ]

    for i, event in enumerate(meaningful):
        start = event["session_elapsed_s"]

        # Distance to the next event overall, used only to size an idle row.
        if i + 1 < len(meaningful):
            next_start = meaningful[i + 1]["session_elapsed_s"]
        else:
            next_start = start + 1.0
        gap = next_start - start


        # 1. A delegated agent runs from spawn until its result returns.
        #
        # An asynchronously launched agent returns a few milliseconds later
        # with "Async agent launched successfully" — a launch acknowledgement
        # rather than a completion. Its real work is recorded against the
        # agent's own speaker rows, so treat a sub-second span as a launch and
        # let the spawn render as the marker it is.
        measured = None
        if event["event_type"] == "agent_spawn" and event.get("agent_id"):
            result_at = agent_spans.get(event["agent_id"])
            if result_at is not None and result_at - start >= MIN_AGENT_SPAN_S:
                measured = result_at - start

        # 2. Otherwise, a duration measured against this event. A
        # `turn_duration` measures *backwards*: an assistant message is stamped
        # when it finished, and the duration reaches back to the moment the
        # person submitted. Verified against the chat session, where every
        # implied start lands on the preceding human message to within 0.1s.
        # That span is measured model-working time, so the row covers it
        # instead of starting at the completion and running forward over
        # whatever came next.
        turn_measured = real_durations.get(event["event_id"])
        if measured is None and turn_measured is not None:
            # The turn cannot have begun before the person submitted, so the
            # reach-back stops at the end of the last human message. Clamping
            # to the previous row instead would destroy the measurement in an
            # agentic session, where many rows sit inside a single turn: one
            # 436.8s turn was cut to 28s because the row before it was a tool
            # call from within the same turn.
            turn_start = max(start - turn_measured, 0.0, last_human_end)
            if turn_start >= start:
                turn_start = max(start - turn_measured, 0.0)
            rows.append(_make_csv_row(
                event, turn_start, start,
                start_floor=_floor_start(floor_mark, start),
                provenance="measured",
            ))
            floor_mark = max(floor_mark, start)
            prev_any_end = max(prev_any_end, start)
            continue

        reaches_back = False
        is_human_message = (
            event["event_type"] == "message"
            and event["role"] == "user"
            and not str(event.get("speaker") or "").startswith(("Agent:", "Tool:"))
        )

        if measured is not None:
            # A measured duration is used as recorded. Only measured spans may
            # overlap: concurrency the log actually witnessed is a finding,
            # whereas concurrency produced by an estimate is an artefact.
            duration = measured
            provenance = "measured"
        else:
            provenance = "estimated" if event["event_type"] == "message" else "marker"

            # 3. Otherwise, estimate from event type and content length, capped
            # at this speaker's own next contribution.
            #
            # These are widths in *time*. How much was said is encoded by bar
            # height (see turn-chart-scaling.ts), so a long prompt does not
            # need a long bar. Estimates are not stretched to meet the next
            # event: that is what flattened the timeline in the first place.
            if event["event_type"] in ("tool_call", "tool_result"):
                # Near-instant from the log's perspective. The seconds that
                # follow a tool result belong to the model composing its next
                # move, not to the tool.
                duration = 0.5
            elif event["event_type"] in ("agent_spawn",):
                duration = 1.0
            elif event["event_type"] == "message" and event["role"] == "user":
                # The timestamp is when they hit Enter, so this is a point
                # event. Composition happened before it and is not measured;
                # the preceding gap is what carries it.
                duration = 2.0
            elif event["event_type"] == "message" and event["role"] == "assistant":
                # Reached when no turn_duration covers this message. The
                # message is still stamped when it finished, so it reaches
                # back like a measured turn does; running it forward would
                # place the model's work after it had already finished and
                # leave the time it was actually generating as a gap.
                word_count = len(event["content"].split())
                duration = max(word_count / 3.0, 2.0)
                reaches_back = True
            else:
                duration = 2.0

        human_text = ""
        if reaches_back and not is_human_message:
            # Same reasoning as a human submit: the stamp is the conclusion.
            end = start
            start = max(end - duration, prev_any_end)
            if start >= end:
                start, end = _reach_back_floor(end)
        elif is_human_message:
            # A person cannot type faster than HUMAN_WPM_CEILING. Above it the
            # text was brought rather than composed: pasted, or prepared
            # elsewhere. Estimating every human turn from a typing rate is
            # impossible for 71% of turns in the multi-agent session, and this
            # is why. The distinction is worth recording in its own right.
            #
            # Only when the rate can be computed, though. Treating an
            # unmeasurable gap as infinite speed collapsed two questions into
            # one answer, and `brought` came to mean both "this was pasted" and
            # "no idea": of the twelve such labels across the bundled sessions
            # only four were detections, and `web-design-tools` had none at all
            # behind its single one. An unknown is reported as an unknown.
            words = len(event["content"].split())
            window = start - prev_any_end
            if window > MIN_TYPING_WINDOW_S:
                implied = words / (window / 60.0)
                human_text = "composed" if implied <= HUMAN_WPM_CEILING else "brought"
            else:
                human_text = "unknown"
            # The submit timestamp is when composing finished, so a human turn
            # reaches back exactly as an AI turn does.
            end = start
            if human_text == "composed":
                start = max(end - (words / (HUMAN_WPM_CEILING / 60.0)), prev_any_end)
                provenance = "estimated"
            else:
                start = max(end - HUMAN_MARKER_S, prev_any_end)
                provenance = "marker"
            if start >= end:
                start, end = _reach_back_floor(end)
        else:
            end = start + duration
            if end <= start:
                end = start + 0.1

        rows.append(_make_csv_row(
            event, start, end,
            start_floor=min(floor_mark, start) if floor_mark else start,
            provenance=provenance,
            human_text=human_text,
        ))
        floor_mark = max(floor_mark, end)
        prev_any_end = max(prev_any_end, end)
        # A delegated agent is also recorded as `user` on the row holding the
        # brief it was handed, so role alone would treat a delegation as a
        # human submit. The speaker prefix separates them.
        if (
            event["event_type"] == "message"
            and event["role"] == "user"
            and not str(event.get("speaker") or "").startswith(("Agent:", "Tool:"))
        ):
            last_human_end = max(last_human_end, end)

        # An idle row fills a long quiet stretch that this row does not cover.
        if emit_idle and gap > idle_threshold_s and end < next_start:
            idle_duration = next_start - end
            rows.append({
                SOURCE_KIND_COLUMN: SOURCE_KIND_VALUE,
                "speaker": "Idle",
                "content": f"[Gap: {idle_duration:.0f}s — user reading/thinking/away]",
                "start": round(end, 3),
                "end": round(next_start, 3),
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

    return rows


def _agent_identity(event: dict) -> tuple[str, str]:
    """Agent type and id for a row, falling back to the speaker name.

    Only the spawn and result markers carry `agent_type`/`agent_id` directly.
    The rows a delegated agent actually produces carry neither, so its own work
    could not be attributed back to it: 86 rows in the multi-agent session name
    an agent as speaker while leaving both identity columns empty. The speaker
    is written as `Agent:<type>:<id>`, so the identity is recoverable from it.
    """
    agent_type = event.get("agent_type") or ""
    agent_id = event.get("agent_id") or ""
    if agent_type and agent_id:
        return agent_type, agent_id

    speaker = str(event.get("speaker") or "")
    if speaker.startswith("Agent:"):
        parts = speaker.split(":")
        if len(parts) >= 3:
            return agent_type or parts[1], agent_id or parts[2]
    return agent_type, agent_id


def _make_csv_row(
    event: dict,
    start: float,
    end: float,
    start_floor: float | None = None,
    provenance: str = "",
    human_text: str = "",
) -> dict:
    """Build a single CSV row from a canonical event."""
    tokens_out = ""
    if event.get("token_usage") and event["token_usage"].get("output"):
        tokens_out = event["token_usage"]["output"]

    agent_type, agent_id = _agent_identity(event)

    return {
        SOURCE_KIND_COLUMN: SOURCE_KIND_VALUE,
        "speaker": event["speaker"],
        "content": event["content"],
        "start": round(start, 3),
        "end": round(end, 3),
        "event_type": event["event_type"],
        "role": event["role"],
        "tool_name": event.get("tool_name") or "",
        "agent_type": agent_type,
        "agent_id": agent_id,
        "model": event.get("model") or "",
        "tokens_out": tokens_out,
        "event_id": event["event_id"],
        "tool_use_id": event.get("tool_use_id") or "",
        "parent_event_id": event.get("parent_event_id") or "",
        # An instant, carried at the narrowest width a row may have. A row
        # whose start equals its end reads as zero-width downstream and is
        # re-expanded from its word count, which would draw a tool result
        # holding a 3,000-word file as a 1,000-second contribution.
        "start_record": round(max(end - MIN_ROW_WIDTH_S, 0.0), 3),
        "start_work": round(start, 3),
        "start_floor": round(start_floor if start_floor is not None else start, 3),
        "provenance": provenance,
        "human_text": human_text,
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

def _emit_outputs(
    events: list[dict],
    args: Any,
    session_id: str | None,
    project_path: str | None = None,
    write_events: bool = True,
) -> None:
    """Write the CSV, codes and events outputs, then print a summary.

    Shared by both input paths so that rebuilding from a canonical events file
    produces byte-identical output to converting the original session log.
    """
    if not args.include_thinking:
        events_for_csv = [e for e in events if e["event_type"] != "thinking"]
    else:
        events_for_csv = events

    if not args.include_system:
        # `turn_duration` is system-role but it is timing metadata, not a system
        # message: it carries the only measured duration in the file and is
        # consumed rather than emitted as a row. Dropping it here would silently
        # revert every turn to an estimated width.
        events_for_csv = [
            e for e in events_for_csv
            if e["role"] != "system" or e["event_type"] == "turn_duration"
        ]

    os.makedirs(args.output_dir, exist_ok=True)
    sid = session_id[:8] if session_id else "unknown"

    transcript_rows = events_to_transcript_csv(events_for_csv, emit_idle=args.emit_idle)
    transcript_path = os.path.join(args.output_dir, f"transcript-{sid}.csv")
    write_csv(transcript_rows, TRANSCRIPT_COLUMNS, transcript_path)

    if not args.no_codes:
        codes_rows = events_to_codes_csv(transcript_rows)
        codes_path = os.path.join(args.output_dir, f"codes-{sid}.csv")
        write_csv(codes_rows, CODES_COLUMNS, codes_path)

    if write_events and not args.no_events:
        events_path = os.path.join(args.output_dir, f"events-{sid}.jsonl")
        write_events_jsonl(events, events_path)

    print(f"\nSession: {session_id}")
    if project_path:
        print(f"Project: {project_path}")

    role_counts: dict[str, int] = {}
    for r in transcript_rows:
        role_counts[r["role"]] = role_counts.get(r["role"], 0) + 1
    print(f"Events by role: {role_counts}")

    speakers = sorted(set(r["speaker"] for r in transcript_rows))
    print(f"Speakers ({len(speakers)}): {', '.join(speakers)}")

    if transcript_rows:
        # Rows are ordered by start and may now overlap, so the last row is not
        # necessarily the one that ends latest.
        duration = max(r["end"] for r in transcript_rows)
        print(f"Duration: {duration:.1f}s ({duration/60:.1f}min)")


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
    input_group.add_argument(
        "--from-events",
        metavar="EVENTS_JSONL",
        help="Rebuild the CSVs from a canonical events JSONL this tool wrote "
             "earlier, instead of from a raw session log. Lets bundled sample "
             "data be regenerated after a timing or formatting change without "
             "needing the original session, which may no longer exist.",
    )

    # Options
    parser.add_argument("--output-dir", "-o", default=".", help="Output directory (default: current)")
    parser.add_argument("--user-name", "-u", default="User", help="Name for the human user (default: User)")
    parser.add_argument("--project", "-p", help="Project path to search for sessions")
    parser.add_argument("--no-codes", action="store_true", help="Skip generating codes.csv")
    parser.add_argument("--no-events", action="store_true", help="Skip generating events.jsonl")
    parser.add_argument("--include-thinking", action="store_true", help="Include AI thinking blocks in transcript")
    parser.add_argument("--include-system", action="store_true", help="Include system events in transcript")

    parser.add_argument(
        "--emit-idle",
        action="store_true",
        help="Insert a separate 'Idle' speaker row for gaps longer than the idle "
             "threshold. Off by default: idle is inferred, and as its own speaker "
             "it adds a participant to every visualization.",
    )

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

    # --- Rebuild from canonical events ---
    if args.from_events:
        if not os.path.exists(args.from_events):
            print(f"Error: File not found: {args.from_events}", file=sys.stderr)
            sys.exit(1)
        print(f"Rebuilding from events: {args.from_events}")
        with open(args.from_events, encoding="utf-8") as f:
            events = [json.loads(line) for line in f if line.strip()]
        print(f"  Loaded {len(events)} canonical events")
        session_id = next((e.get("session_id") for e in events if e.get("session_id")), None)
        _emit_outputs(events, args, session_id, write_events=False)
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
    # Reported rather than silent: these rows would otherwise be counted as
    # human turns, and the counts are the evidence that they were not.
    if session_parser.notifications_deduped or session_parser.notifications_kept:
        print(f"  Task notifications: {session_parser.notifications_deduped} dropped as "
              f"redelivery, {session_parser.notifications_kept} kept as agent results")
    if session_parser.meta_skipped:
        print(f"  Harness-injected user entries: {session_parser.meta_skipped} skipped "
              f"(isMeta — image notes, skill preambles)")

    _emit_outputs(events, args, session_parser.session_id,
                  project_path=session_parser.project_path)


if __name__ == "__main__":
    main()
