/**
 * The Word Journey traces one token across every actor. At agentic scale most
 * actors never carry the token at all, so the view spends a third to a half of
 * its vertical space on lanes that hold nothing, and coincident marks in a busy
 * lane fuse into a bar that reads as one long event.
 *
 * These tests cover the layout decisions that follow: which lanes are worth a
 * row, how a lane is labelled when the gutter is tight, and when two marks
 * become one.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { orderLanes, partitionLanes, truncateMiddle, clusterByLane, clusterRadius } from '../src/lib/draw/word-journey-layout';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

/** Proportional-ish width so truncation tests don't depend on a canvas. */
const measure = (text: string) => text.length * 6;

function loadOccurrenceCounts(id: string, token: string): { speakers: string[]; counts: Map<string, number> } {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	const { transcript } = createTranscriptFromParsedText(parseCSVRows(rows));

	const speakers: string[] = [];
	const counts = new Map<string, number>();
	for (const word of transcript.wordArray) {
		if (!speakers.includes(word.speaker)) speakers.push(word.speaker);
		if (word.word.toLowerCase().includes(token)) {
			counts.set(word.speaker, (counts.get(word.speaker) ?? 0) + 1);
		}
	}
	return { speakers, counts };
}

describe('orderLanes', () => {
	const speakers = ['Ben', 'Claude', 'Tool:Read', 'Tool:Bash'];
	const counts = new Map([
		['Ben', 3],
		['Claude', 12],
		['Tool:Read', 0],
		['Tool:Bash', 12]
	]);

	it('ranks by uptake so the lanes carrying the token come first', () => {
		expect(orderLanes(speakers, counts, 'uptake')).toEqual(['Claude', 'Tool:Bash', 'Ben', 'Tool:Read']);
	});

	it('breaks uptake ties on transcript order, so the result is stable', () => {
		// Claude and Tool:Bash both have 12; Claude appears first in the transcript.
		const reversed = ['Tool:Bash', 'Claude'];
		expect(orderLanes(reversed, counts, 'uptake')).toEqual(['Tool:Bash', 'Claude']);
	});

	it('leaves transcript order untouched under "default"', () => {
		expect(orderLanes(speakers, counts, 'default')).toEqual(speakers);
	});

	it('sorts alphabetically under "alpha"', () => {
		expect(orderLanes(speakers, counts, 'alpha')).toEqual(['Ben', 'Claude', 'Tool:Bash', 'Tool:Read']);
	});

	it('does not mutate the input', () => {
		const input = [...speakers];
		orderLanes(input, counts, 'uptake');
		expect(input).toEqual(speakers);
	});
});

describe('partitionLanes', () => {
	it('separates lanes carrying the token from those that do not', () => {
		const counts = new Map([
			['a', 2],
			['b', 0],
			['c', 5]
		]);
		expect(partitionLanes(['c', 'a', 'b'], counts)).toEqual({ present: ['c', 'a'], absent: ['b'] });
	});

	it('treats an unlisted speaker as absent rather than throwing', () => {
		expect(partitionLanes(['ghost'], new Map())).toEqual({ present: [], absent: ['ghost'] });
	});
});

describe('truncateMiddle', () => {
	it('leaves a label that already fits', () => {
		expect(truncateMiddle('Claude', 200, measure)).toBe('Claude');
	});

	it('keeps both the actor-kind prefix and the identifying suffix', () => {
		const result = truncateMiddle('Agent:general-purpose:a2b12912', 90, measure);
		expect(result).toContain('…');
		expect(result.startsWith('A')).toBe(true);
		expect(result.endsWith('2')).toBe(true);
		expect(measure(result)).toBeLessThanOrEqual(90);
	});

	it('never exceeds the width it was given', () => {
		for (let w = 8; w <= 180; w += 4) {
			expect(measure(truncateMiddle('Agent:general-purpose:ae7ca78f', w, measure))).toBeLessThanOrEqual(w);
		}
	});

	it('degrades to an ellipsis rather than an empty label', () => {
		expect(truncateMiddle('Tool:WebSearch', 8, measure)).toBe('…');
	});

	it('returns nothing when even an ellipsis will not fit', () => {
		expect(truncateMiddle('Tool:WebSearch', 2, measure)).toBe('');
	});
});

describe('clusterByLane', () => {
	it('merges marks closer than the gap, in the same lane', () => {
		const items = [
			{ x: 100, speaker: 'a' },
			{ x: 103, speaker: 'a' },
			{ x: 106, speaker: 'a' }
		];
		const clusters = clusterByLane(items, 6);
		expect(clusters).toHaveLength(1);
		expect(clusters[0].members).toHaveLength(3);
		expect(clusters[0].x).toBe(103);
	});

	it('keeps marks in different lanes apart even at the same x', () => {
		const clusters = clusterByLane(
			[
				{ x: 100, speaker: 'a' },
				{ x: 100, speaker: 'b' }
			],
			6
		);
		expect(clusters).toHaveLength(2);
	});

	it('splits when the gap is exceeded', () => {
		const clusters = clusterByLane(
			[
				{ x: 100, speaker: 'a' },
				{ x: 120, speaker: 'a' }
			],
			6
		);
		expect(clusters).toHaveLength(2);
	});

	it('preserves every input mark exactly once', () => {
		const items = Array.from({ length: 50 }, (_, i) => ({ x: i * 3, speaker: i % 3 === 0 ? 'a' : 'b' }));
		const total = clusterByLane(items, 6).reduce((n, c) => n + c.members.length, 0);
		expect(total).toBe(items.length);
	});

	it('handles an empty input', () => {
		expect(clusterByLane([], 6)).toEqual([]);
	});
});

describe('clusterRadius', () => {
	it('leaves a single mark at its base size', () => {
		expect(clusterRadius(1, 6, 15)).toBe(6);
	});

	it('grows by area, matching the turn chart and turn network convention', () => {
		expect(clusterRadius(4, 6, 100)).toBeCloseTo(12);
	});

	it('never exceeds the cap', () => {
		expect(clusterRadius(400, 6, 15)).toBe(15);
	});
});

describe('against the bundled AI transcripts', () => {
	// The figures in the paper trace "ethic" through the website-building task.
	const cases = [
		{ id: 'web-design-tools', minAbsent: 1 },
		{ id: 'web-design-multi-agent', minAbsent: 1 }
	];

	for (const { id, minAbsent } of cases) {
		it(`${id}: trimming absent lanes recovers real vertical space`, () => {
			const { speakers, counts } = loadOccurrenceCounts(id, 'ethic');
			const ordered = orderLanes(speakers, counts, 'uptake');
			const { present, absent } = partitionLanes(ordered, counts);

			expect(present.length).toBeGreaterThan(0);
			expect(absent.length).toBeGreaterThanOrEqual(minAbsent);
			expect(present.length + absent.length).toBe(speakers.length);
		});

		it(`${id}: uptake order puts a carrying lane first`, () => {
			const { speakers, counts } = loadOccurrenceCounts(id, 'ethic');
			const ordered = orderLanes(speakers, counts, 'uptake');
			expect(counts.get(ordered[0]) ?? 0).toBeGreaterThan(0);
		});

		it(`${id}: every absent lane really carries nothing`, () => {
			const { speakers, counts } = loadOccurrenceCounts(id, 'ethic');
			const { absent } = partitionLanes(orderLanes(speakers, counts, 'uptake'), counts);
			for (const speaker of absent) expect(counts.get(speaker) ?? 0).toBe(0);
		});
	}
});
