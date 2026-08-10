/**
 * Detection must never misclassify a human transcript.
 *
 * AI handling removes rows and rescales visualizations, so a false positive
 * corrupts a researcher's own data while a false negative merely leaves it
 * rendering as it does today. These cases are drawn from shapes that appear in
 * real corpora, not hypotheticals: call-centre transcripts pair a speaker named
 * Agent with Customer, and classroom coding schemes routinely carry a `role`
 * column of teacher/student/observer.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { detectSourceKind, collectSpeakerRoles } from '../src/lib/core/source-kind';

function parseCsv(text: string): Record<string, unknown>[] {
	return Papa.parse(text, {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
}

const load = (id: string) =>
	parseCsv(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'));

describe('detectSourceKind', () => {
	const human = ['example-1', 'example-2', 'example-3', 'example-4', 'example-5'];
	const ai = ['claude-chat', 'claude-tools', 'claude-agent', 'claude-multi-agent'];

	for (const id of human) {
		it(`classifies ${id} as human`, () => {
			expect(detectSourceKind(load(id))).toBe('human');
		});
	}

	for (const id of ai) {
		it(`classifies ${id} as ai`, () => {
			expect(detectSourceKind(load(id))).toBe('ai');
		});
	}

	it('returns human for an empty file', () => {
		expect(detectSourceKind([])).toBe('human');
	});

	it('does not treat a human speaker named Agent as an AI transcript', () => {
		const rows = parseCsv(
			'speaker,content,start,end\nAgent,how can I help,0,4\nCustomer,my order is late,4,9\n'
		);
		expect(detectSourceKind(rows)).toBe('human');
	});

	it('does not treat a research role column as an AI transcript', () => {
		const rows = parseCsv(
			'speaker,content,start,end,role\nMs Diaz,turn to page four,0,3,teacher\nJamal,got it,3,5,student\n'
		);
		expect(detectSourceKind(rows)).toBe('human');
	});

	it('does not treat a speaker named Idle as an AI transcript', () => {
		const rows = parseCsv('speaker,content,start,end\nIdle,nobody spoke,0,9\nSam,back now,9,12\n');
		expect(detectSourceKind(rows)).toBe('human');
	});

	it('requires both role and event_type when no marker is present', () => {
		const rows = parseCsv(
			'speaker,content,start,end,event_type\nClaude,hello,0,2,message\nEdwin,hi,2,4,message\n'
		);
		expect(detectSourceKind(rows)).toBe('human');
	});

	it('honours an explicit marker', () => {
		const rows = parseCsv('te_source_kind,speaker,content,start,end\nai,Claude,hello,0,2\n');
		expect(detectSourceKind(rows)).toBe('ai');
	});

	it('lets a producer explicitly declare human and override inference', () => {
		const rows = parseCsv(
			'te_source_kind,speaker,content,start,end,role,event_type\nhuman,Claude,hi,0,2,assistant,message\n'
		);
		expect(detectSourceKind(rows)).toBe('human');
	});
});

describe('collectSpeakerRoles', () => {
	it('maps speakers to roles using normalised names', () => {
		const roles = collectSpeakerRoles(load('claude-tools'));
		expect(roles.get('EDWIN')).toBe('user');
		expect(roles.get('CLAUDE')).toBe('assistant');
		expect(roles.get('TOOL:WEBSEARCH')).toBe('tool');
	});

	it('ignores rows with an unrecognised role', () => {
		const rows = parseCsv('speaker,content,role\nMs Diaz,hello,teacher\n');
		expect(collectSpeakerRoles(rows).size).toBe(0);
	});
});
