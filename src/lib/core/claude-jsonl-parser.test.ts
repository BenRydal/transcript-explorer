import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseClaudeJsonl } from './claude-jsonl-parser';
import { INTERACTION_SCHEMA_VERSION } from '../../models/interaction/schema';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
	here,
	'../../../test-data/claude-code/sample-session.jsonl'
);
const fixture = readFileSync(fixturePath, 'utf-8');

describe('parseClaudeJsonl', () => {
	const session = parseClaudeJsonl(fixture, { sourceUri: fixturePath });

	it('sets canonical envelope fields', () => {
		expect(session.schemaVersion).toBe(INTERACTION_SCHEMA_VERSION);
		expect(session.sourceFormat).toBe('claude_code_jsonl');
		expect(session.sourceUri).toBe(fixturePath);
		expect(session.categorizations).toEqual({
			computed: expect.any(Object),
			inferred: {}
		});
		expect(session.outputs).toEqual({});
	});

	it('emits one event per non-system line (system turn_duration excluded)', () => {
		// Fixture has 11 lines; the trailing line is a system turn_duration.
		expect(session.events.length).toBe(10);
		// Sequence reflects original file index, so the last event keeps index 9.
		expect(session.events.map((e) => e.sequence)).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9
		]);
	});

	it('derives participant roles correctly', () => {
		const roleById = new Map(session.participants.map((p) => [p.id, p.role]));

		// Human user.
		expect(roleById.get('user:main')).toBe('user');

		// Principal agent (assistant text/thinking).
		const principal = session.participants.find(
			(p) => p.role === 'principal_agent'
		);
		expect(principal).toBeDefined();
		expect(principal?.id).toBe('claude:claude-opus-4-8:main');
		expect(principal?.label).toBe('Claude');

		// Tool actor for the Read tool (from the tool_result attribution).
		const readTool = session.participants.find((p) => p.id === 'tool:Read');
		expect(readTool?.role).toBe('tool_actor');
		expect(readTool?.label).toBe('Tool:Read');

		// Delegated agent for the Agent/Explore spawn.
		const agent = session.participants.find(
			(p) => p.role === 'delegated_agent'
		);
		expect(agent).toBeDefined();
		expect(agent?.id.startsWith('agent:Explore:')).toBe(true);
		expect(agent?.label).toBe('Agent:Explore');
	});

	it('parses thinking, text, tool_use and tool_result content blocks', () => {
		const types = new Set(
			session.events.flatMap((e) => e.contentBlocks.map((b) => b.type))
		);
		expect(types).toContain('text');
		expect(types).toContain('thinking');
		expect(types).toContain('tool_use');
		expect(types).toContain('tool_result');

		// thinking is normalized from `thinking` → `text`.
		const thinking = session.events
			.flatMap((e) => e.contentBlocks)
			.find((b) => b.type === 'thinking');
		expect(thinking).toMatchObject({ type: 'thinking' });
		expect((thinking as { text: string }).text.length).toBeGreaterThan(0);

		// tool_use Read carries its name and input.
		const read = session.events
			.flatMap((e) => e.contentBlocks)
			.find((b) => b.type === 'tool_use' && b.name === 'Read');
		expect(read).toBeDefined();

		// tool_result normalizes snake_case → camelCase and stringifies content.
		const result = session.events
			.flatMap((e) => e.contentBlocks)
			.find((b) => b.type === 'tool_result');
		expect(result).toMatchObject({ type: 'tool_result', isError: false });
		expect(typeof (result as { content: unknown }).content).toBe('string');
		expect((result as { toolUseId: string }).toolUseId).toBe(
			'toolu_01aaaaaaaaaaaaaaaaaaaaaa'
		);
	});

	it('flags sidechain events on delegation', () => {
		const sidechain = session.events.filter((e) => e.delegation.isSidechain);
		expect(sidechain.length).toBeGreaterThan(0);
		// Sidechain events belong to the delegated_agent participant.
		const agent = session.participants.find(
			(p) => p.role === 'delegated_agent'
		);
		for (const e of sidechain) {
			expect(e.participantId).toBe(agent?.id);
		}

		// Non-sidechain events are not flagged.
		const user = session.events.find((e) => e.participantId === 'user:main');
		expect(user?.delegation.isSidechain).toBe(false);
	});

	it('maps usage tokens snake_case → camelCase', () => {
		// Line 2: assistant with input 1200 / output 48 / cacheRead 8000 / cacheWrite 300.
		const assistant = session.events.find(
			(e) => e.tokens && e.tokens.input === 1200
		);
		expect(assistant?.tokens).toEqual({
			input: 1200,
			output: 48,
			cacheRead: 8000,
			cacheWrite: 300
		});
		// User string messages have no usage.
		const user = session.events.find((e) => e.participantId === 'user:main');
		expect(user?.tokens).toBeNull();
	});

	it('produces computed Tagged cost and duration', () => {
		for (const e of session.events) {
			expect(e.costUsd.provenance).toBe('computed');
			expect(
				e.costUsd.value === null || typeof e.costUsd.value === 'number'
			).toBe(true);

			expect(e.durationMs.provenance).toBe('computed');
			expect(
				e.durationMs.value === null || typeof e.durationMs.value === 'number'
			).toBe(true);
		}

		// The assistant turn with real tokens gets a non-null cost.
		const assistant = session.events.find(
			(e) => e.tokens && e.tokens.input === 1200
		);
		expect(typeof assistant?.costUsd.value).toBe('number');
	});

	it('uses the system turn_duration for the turn it concludes', () => {
		// The final assistant text turn (uuid ...000a) is concluded by the
		// system turn_duration line (durationMs 11550).
		const finalTurn = session.events.find(
			(e) => e.eventId === '00000000-0000-0000-0000-00000000000a'
		);
		expect(finalTurn?.durationMs.value).toBe(11550);
		expect(finalTurn?.durationMs.formula).toBe('turn_duration_observed_v1');
	});

	it('builds session meta with inventories', () => {
		expect(session.session.sessionId).toBe(
			'11111111-2222-3333-4444-555555555555'
		);
		expect(session.session.startedAtIso).toBe('2026-06-01T10:00:00.000Z');
		expect(session.session.endedAtIso).toBe('2026-06-01T10:00:16.050Z');
		expect(session.session.durationMs.value).toBe(16050);
		expect(new Set(session.session.modelInventory)).toEqual(
			new Set(['claude-opus-4-8', 'claude-sonnet-4-6'])
		);
		expect(new Set(session.session.toolInventory)).toEqual(
			new Set(['Read', 'Agent', 'Grep'])
		);
	});

	it('tolerates blank lines, a trailing newline and malformed lines', () => {
		const withJunk = `\n${fixture}\n{not json}\n\n`;
		const parsed = parseClaudeJsonl(withJunk);
		// Same valid events as the clean fixture.
		expect(parsed.events.length).toBe(10);
		expect(parsed.categorizations.computed.malformedLines).toBe(1);
		expect(parsed.sourceUri).toBeNull();
	});
});
