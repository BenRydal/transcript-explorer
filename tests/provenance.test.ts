/**
 * The converter records how it arrived at each row's timing -- measured from
 * the log, estimated from content length, or a fixed stub for an event the log
 * treats as instantaneous -- and writes it to a `provenance` column. Nothing
 * read that column, so a mark whose width came from a constant was drawn
 * identically to one that was measured.
 *
 * That matters at agentic scale: in the bundled multi-agent session only a
 * twentieth of the rows carry a measured duration, so a view drawing width
 * without qualification asserts far more than it knows.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';
import type { TimingProvenance } from '../src/models/dataPoint';

function load(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	return createTranscriptFromParsedText(parseCSVRows(rows)).transcript;
}

function share(id: string): Map<TimingProvenance | 'none', number> {
	const counts = new Map<TimingProvenance | 'none', number>();
	const seen = new Set<number>();
	for (const w of load(id).wordArray) {
		if (seen.has(w.turnNumber)) continue;
		seen.add(w.turnNumber);
		const key = w.provenance ?? 'none';
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

describe('provenance reaches the words', () => {
	it('multi-agent: every turn carries one, and most are not measured', () => {
		const counts = share('web-design-multi-agent');
		expect(counts.get('none') ?? 0).toBe(0);

		const total = [...counts.values()].reduce((a, b) => a + b, 0);
		const measured = counts.get('measured') ?? 0;
		expect(measured).toBeGreaterThan(0);
		expect(measured / total).toBeLessThan(0.2);
	});

	it('tools: same, so the qualification is not specific to one transcript', () => {
		const counts = share('web-design-tools');
		expect(counts.get('none') ?? 0).toBe(0);
		expect((counts.get('marker') ?? 0) + (counts.get('estimated') ?? 0)).toBeGreaterThan(counts.get('measured') ?? 0);
	});

	it('chat: carries provenance too, and is measured far more often', () => {
		const counts = share('web-design-chat');
		const total = [...counts.values()].reduce((a, b) => a + b, 0);
		expect((counts.get('measured') ?? 0) / total).toBeGreaterThan(0.3);
	});

	it('only ever holds values the converter defines', () => {
		const allowed = new Set(['measured', 'estimated', 'marker']);
		for (const w of load('web-design-multi-agent').wordArray) {
			if (w.provenance !== undefined) expect(allowed.has(w.provenance)).toBe(true);
		}
	});
});

describe('human transcripts are unaffected', () => {
	it('declares nothing, so nothing is drawn as unmeasured', () => {
		for (const w of load('example-1').wordArray) {
			expect(w.provenance).toBeUndefined();
		}
	});
});

describe('a copied word keeps its provenance', () => {
	it('survives copyWith, which the timing lenses use', () => {
		const [first] = load('web-design-multi-agent').wordArray;
		expect(first.copyWith({ startTime: 99 }).provenance).toBe(first.provenance);
	});
});
