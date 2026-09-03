/**
 * No bundled CSV carries `tool_use_id`, so these exercise the order fallback,
 * which is the path that runs on every existing session.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { groupAiTurns, type AiTurnEntry } from '../src/lib/core/ai-turn-merge';
import type { AiTurnGrouping } from '../src/lib/core/ai-turn-merge';

const AI_SESSIONS = ['web-design-tools', 'web-design-multi-agent', 'cs-multi-agent', 'trip-multi-agent'];

function rowsOf(id: string): Record<string, unknown>[] {
	return Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
}

function turnsOf(id: string, mode: AiTurnGrouping) {
	return parseCSVRows(rowsOf(id), 3, 'work', mode).turns;
}

function countEvents(id: string, types: string[]): number {
	return rowsOf(id).filter((r) => types.includes(String(r['event_type'] ?? ''))).length;
}

function entry(speaker: string, eventType: string, toolName: string, toolUseId = '', content = 'x'): AiTurnEntry {
	return { turn: { speaker, content, startTime: 0, endTime: 1 }, eventType, toolName, toolUseId };
}

describe('grouping a call with its result', () => {
	it('draws one node per logged event at none', () => {
		for (const id of AI_SESSIONS) {
			const logged = rowsOf(id).filter((r) => String(r['content'] ?? '').trim()).length;
			expect(turnsOf(id, 'none').length, id).toBe(logged);
			expect(turnsOf(id, 'tool-uses').length, id).toBeLessThan(logged);
		}
	});

	it('removes exactly one node per result, so no result is left unpaired', () => {
		for (const id of AI_SESSIONS) {
			const results = countEvents(id, ['tool_result', 'agent_result']);
			expect(turnsOf(id, 'none').length - turnsOf(id, 'tool-uses').length, id).toBe(results);
		}
	});

	it('keeps every word, so a merged node is the whole action', () => {
		for (const id of AI_SESSIONS) {
			const words = (turns: { content: string }[]) => turns.reduce((n, t) => n + t.content.split(/\s+/).filter(Boolean).length, 0);
			expect(words(turnsOf(id, 'tool-uses')), id).toBe(words(turnsOf(id, 'none')));
		}
	});

	it('never leaves a merged node ending before it starts', () => {
		for (const id of AI_SESSIONS) {
			for (const turn of turnsOf(id, 'tool-uses')) {
				if (turn.startTime === null || turn.endTime === null) continue;
				expect(turn.endTime, `${id} ${turn.speaker}`).toBeGreaterThanOrEqual(turn.startTime);
			}
		}
	});

	it('prefers the provider id over order when the converter emits one', () => {
		const entries = [
			entry('Tool:Read', 'tool_call', 'Read', 'toolu_b'),
			entry('Tool:Read', 'tool_call', 'Read', 'toolu_a'),
			entry('Tool:Read', 'tool_result', 'Read', 'toolu_a', 'first'),
			entry('Tool:Read', 'tool_result', 'Read', 'toolu_b', 'second')
		];
		const turns = groupAiTurns(entries, 'tool-uses');
		expect(turns.map((t) => t.content)).toEqual(['x\nfirst', 'x\nsecond']);
	});

	it('speaks as the tool and records the agent that called it', () => {
		const entries = [entry('Agent:general-purpose:a1', 'tool_call', 'Bash'), entry('Tool:Bash', 'tool_result', 'Bash')];
		const [merged] = groupAiTurns(entries, 'tool-uses');
		expect(merged.speaker).toBe('Tool:Bash');
		expect(merged.caller).toBe('Agent:general-purpose:a1');
	});
});

describe('collapsing a delegated agent', () => {
	it('leaves one node per agent, covering the work it did through tools', () => {
		const entries = [
			entry('Claude', 'message', ''),
			entry('Agent:general-purpose:a1', 'message', ''),
			entry('Agent:general-purpose:a1', 'tool_call', 'Bash'),
			entry('Tool:Bash', 'tool_result', 'Bash'),
			entry('Agent:general-purpose:a2', 'message', '')
		];
		const turns = groupAiTurns(entries, 'agents');
		expect(turns.map((t) => t.speaker)).toEqual(['Claude', 'Agent:general-purpose:a1', 'Agent:general-purpose:a2']);
	});

	it('drops the transcript to one node per actor that is an agent', () => {
		const collapsed = turnsOf('web-design-multi-agent', 'agents');
		const agents = collapsed.filter((t) => t.speaker.toUpperCase().startsWith('AGENT:'));
		expect(agents.length).toBe(new Set(agents.map((t) => t.speaker)).size);
		expect(collapsed.length).toBeLessThan(turnsOf('web-design-multi-agent', 'tool-uses').length);
	});
});

describe('human transcripts', () => {
	it('are unaffected whatever the grouping is set to', () => {
		for (const id of ['example-1', 'example-2', 'example-3']) {
			const base = turnsOf(id, 'none').length;
			expect(turnsOf(id, 'tool-uses').length, id).toBe(base);
			expect(turnsOf(id, 'agents').length, id).toBe(base);
		}
	});
});
