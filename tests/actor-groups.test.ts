/**
 * A multi-agent transcript carries 25 actors, and nine of those lanes hold
 * their whole activity inside 100 pixels at figure width -- they cannot render
 * their own content, so a per-actor lane shows the reader less than a grouped
 * one. Grouping also answers a question the per-actor view cannot: how work
 * divides across KINDS of participant rather than across individuals that are
 * hard to tell apart.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { actorGroupOf, groupsPresent, groupSizes, ACTOR_GROUP_ORDER, ACTOR_GROUP_LABELS, ACTOR_GROUP_COLORS } from '../src/lib/draw/actor-groups';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';
import type { SpeakerRole } from '../src/models/user';

function loadSpeakers(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	const { users } = createTranscriptFromParsedText(parseCSVRows(rows));
	return {
		speakers: users.map((u) => u.name),
		roles: new Map(users.map((u) => [u.name, u.role as SpeakerRole | undefined]))
	};
}

describe('actorGroupOf', () => {
	it('reads a delegated agent as an agent, not as the primary AI', () => {
		// An agent's own rows are recorded as `assistant`, so the name decides.
		expect(actorGroupOf('Agent:general-purpose:a2b12912', 'assistant')).toBe('agents');
		expect(actorGroupOf('someone', 'agent')).toBe('agents');
	});

	it('reads a tool as a tool', () => {
		expect(actorGroupOf('Tool:Read', 'tool')).toBe('tools');
		expect(actorGroupOf('Tool:AskUserQuestion', undefined)).toBe('tools');
	});

	it('reads the primary AI and the person apart', () => {
		expect(actorGroupOf('Claude', 'assistant')).toBe('primary');
		expect(actorGroupOf('Ben', 'user')).toBe('person');
	});

	it('treats an undeclared speaker as the person, which is what a human transcript has', () => {
		expect(actorGroupOf('Ada', undefined)).toBe('person');
	});
});

describe('groupsPresent', () => {
	it('returns display order, not encounter order', () => {
		const speakers = ['Tool:Read', 'Ben', 'Claude'];
		const roles = new Map<string, SpeakerRole | undefined>([
			['Tool:Read', 'tool'],
			['Ben', 'user'],
			['Claude', 'assistant']
		]);
		expect(groupsPresent(speakers, roles)).toEqual(['person', 'primary', 'tools']);
	});

	it('drops groups with no members, so a chat does not draw empty lanes', () => {
		const roles = new Map<string, SpeakerRole | undefined>([
			['Ben', 'user'],
			['Claude', 'assistant']
		]);
		expect(groupsPresent(['Ben', 'Claude'], roles)).toEqual(['person', 'primary']);
	});
});

describe('every group is drawable', () => {
	it('has a label and a colour', () => {
		for (const group of ACTOR_GROUP_ORDER) {
			expect(ACTOR_GROUP_LABELS[group]).toBeTruthy();
			expect(ACTOR_GROUP_COLORS[group]).toMatch(/^#[0-9A-Fa-f]{6}$/);
		}
	});

	it('gives each group a distinct colour', () => {
		const colors = ACTOR_GROUP_ORDER.map((g) => ACTOR_GROUP_COLORS[g]);
		expect(new Set(colors).size).toBe(colors.length);
	});
});

describe('against the bundled transcripts', () => {
	it('multi-agent: collapses 25 actors onto four lanes', () => {
		const { speakers, roles } = loadSpeakers('web-design-multi-agent');
		expect(speakers.length).toBeGreaterThan(20);

		const present = groupsPresent(speakers, roles);
		expect(present).toEqual(['person', 'primary', 'agents', 'tools']);

		const sizes = groupSizes(speakers, roles);
		// Exactly one person and one primary AI; the rest are agents and tools.
		expect(sizes.get('person')).toBe(1);
		expect(sizes.get('primary')).toBe(1);
		expect(sizes.get('agents')).toBeGreaterThan(1);
		expect(sizes.get('tools')).toBeGreaterThan(1);
		expect([...sizes.values()].reduce((a, b) => a + b, 0)).toBe(speakers.length);
	});

	it('tools: has no agent lane to draw', () => {
		const { speakers, roles } = loadSpeakers('web-design-tools');
		expect(groupsPresent(speakers, roles)).toEqual(['person', 'primary', 'tools']);
	});

	it('chat: collapses to the two actors it already had', () => {
		const { speakers, roles } = loadSpeakers('web-design-chat');
		expect(groupsPresent(speakers, roles)).toEqual(['person', 'primary']);
		expect(groupSizes(speakers, roles).get('person')).toBe(1);
	});
});
