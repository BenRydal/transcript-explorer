#!/usr/bin/env python3
"""
Convenience wrapper: converts the most recent Claude Code session.

Usage:
  python3 convert-latest.py [--output-dir <dir>] [--user-name <name>] [--project <path>]
  yarn convert:latest -- --user-name Edwin
"""

import argparse
import os
import subprocess
import sys

# Import from sibling module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from convert import list_sessions


def main():
    parser = argparse.ArgumentParser(description="Convert the most recent Claude Code session")
    parser.add_argument("--output-dir", "-o", default=".", help="Output directory")
    parser.add_argument("--user-name", "-u", default="User", help="Name for the human user")
    parser.add_argument("--project", "-p", help="Project path to narrow session search")
    parser.add_argument("--no-codes", action="store_true")
    parser.add_argument("--no-events", action="store_true")
    parser.add_argument("--include-thinking", action="store_true")
    parser.add_argument("--include-system", action="store_true")
    args = parser.parse_args()

    sessions = list_sessions(args.project)
    if not sessions:
        print("No sessions found.", file=sys.stderr)
        sys.exit(1)

    latest = sessions[0]
    print(f"Latest session: {latest['session_id']}")
    print(f"  Started: {latest['start']}")
    print(f"  Entries: {latest['entries']}")
    print(f"  Project: {latest['project']}")
    print()

    # Build convert.py command with explicit args
    cmd = [
        sys.executable,
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "convert.py"),
        "--session-id", latest["session_id"],
        "--output-dir", args.output_dir,
        "--user-name", args.user_name,
    ]
    if args.project:
        cmd.extend(["--project", args.project])
    if args.no_codes:
        cmd.append("--no-codes")
    if args.no_events:
        cmd.append("--no-events")
    if args.include_thinking:
        cmd.append("--include-thinking")
    if args.include_system:
        cmd.append("--include-system")

    subprocess.run(cmd)


if __name__ == "__main__":
    main()
