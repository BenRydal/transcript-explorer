/**
 * The strips under the turn chart were computed pairwise over turns sorted by
 * start time, which only holds when turns never overlap. The bundled
 * multi-agent session runs concurrent about a quarter of its length, and both
 * rows were wrong as a result: a gap measured as `next.start - previous.end`
 * goes negative between overlapping turns and skips real silence, and an
 * overlap was emitted once per PAIR, so five concurrent actors drew ten bars.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { mergeSpans, silentGaps, concurrentSpans } from '../src/lib/draw/strip-intervals';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

function turnSpans(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	const { transcript } = createTranscriptFromParsedText(parseCSVRows(rows));

	const byTurn = new Map<number, { speaker: string; start: number; end: number }>();
	for (const w of transcript.wordArray) {
		const existing = byTurn.get(w.turnNumber);
		if (!existing) byTurn.set(w.turnNumber, { speaker: w.speaker, start: w.startTime, end: w.endTime });
		else existing.end = Math.max(existing.end, w.endTime);
	}
	return { spans: [...byTurn.values()], duration: transcript.totalTimeInSeconds };
}

describe('mergeSpans', () => {
	it('joins overlapping spans', () => {
		expect(
			mergeSpans([
				{ start: 0, end: 5 },
				{ start: 3, end: 8 }
			])
		).toEqual([{ start: 0, end: 8 }]);
	});

	it('keeps disjoint spans apart', () => {
		expect(
			mergeSpans([
				{ start: 0, end: 2 },
				{ start: 5, end: 7 }
			])
		).toHaveLength(2);
	});

	it('drops zero-length spans rather than emitting them', () => {
		expect(mergeSpans([{ start: 3, end: 3 }])).toEqual([]);
	});

	it('does not care what order it is given', () => {
		const a = mergeSpans([
			{ start: 5, end: 7 },
			{ start: 0, end: 2 }
		]);
		const b = mergeSpans([
			{ start: 0, end: 2 },
			{ start: 5, end: 7 }
		]);
		expect(a).toEqual(b);
	});
});

describe('silentGaps', () => {
	it('finds the hole between two spans', () => {
		expect(
			silentGaps(
				[
					{ start: 0, end: 2 },
					{ start: 6, end: 8 }
				],
				0,
				8
			)
		).toEqual([{ start: 2, end: 6 }]);
	});

	it('finds silence at both ends of the window', () => {
		const gaps = silentGaps([{ start: 4, end: 6 }], 0, 10);
		expect(gaps).toEqual([
			{ start: 0, end: 4 },
			{ start: 6, end: 10 }
		]);
	});

	it('reports no gap where turns overlap — the case the pairwise version got wrong', () => {
		// Adjacent-pair arithmetic would read 3 - 5 = -2 here and skip it, while
		// missing that the interval is in fact fully covered.
		expect(
			silentGaps(
				[
					{ start: 0, end: 5 },
					{ start: 3, end: 9 }
				],
				0,
				9
			)
		).toEqual([]);
	});

	it('is not fooled by a long turn that swallows a later short one', () => {
		expect(
			silentGaps(
				[
					{ start: 0, end: 100 },
					{ start: 10, end: 20 }
				],
				0,
				100
			)
		).toEqual([]);
	});

	it('drops seams shorter than the floor', () => {
		expect(
			silentGaps(
				[
					{ start: 0, end: 2 },
					{ start: 2.05, end: 5 }
				],
				0,
				5,
				0.5
			)
		).toEqual([]);
	});

	it('returns nothing for an inverted window', () => {
		expect(silentGaps([], 10, 0)).toEqual([]);
	});
});

describe('concurrentSpans', () => {
	const s = (speaker: string, start: number, end: number) => ({ speaker, start, end });

	it('reports one span for a stretch, not one per pair', () => {
		// Three actors overlapping would have produced three pairwise markers.
		const spans = concurrentSpans([s('a', 0, 10), s('b', 1, 9), s('c', 2, 8)]);
		expect(spans).toHaveLength(1);
		expect(spans[0].peak).toBe(3);
	});

	it('ignores a single actor working alone', () => {
		expect(concurrentSpans([s('a', 0, 10)])).toEqual([]);
	});

	it('does not count one actor against itself', () => {
		expect(concurrentSpans([s('a', 0, 10), s('a', 2, 8)])).toEqual([]);
	});

	it('treats touching spans as sequential, not concurrent', () => {
		expect(concurrentSpans([s('a', 0, 5), s('b', 5, 10)])).toEqual([]);
	});

	it('honours a higher threshold', () => {
		expect(concurrentSpans([s('a', 0, 10), s('b', 1, 9)], 3)).toEqual([]);
		expect(concurrentSpans([s('a', 0, 10), s('b', 1, 9), s('c', 2, 8)], 3)).toHaveLength(1);
	});

	it('closes a span when concurrency drops', () => {
		const spans = concurrentSpans([s('a', 0, 4), s('b', 2, 6), s('c', 10, 14), s('d', 12, 16)]);
		expect(spans).toHaveLength(2);
	});
});

describe('against the bundled transcripts', () => {
	it('multi-agent: finds both silence and genuine concurrency', () => {
		const { spans, duration } = turnSpans('web-design-multi-agent');
		const gaps = silentGaps(spans, 0, duration, 0.5);
		const parallel = concurrentSpans(spans, 2, 0.5);

		expect(gaps.length).toBeGreaterThan(0);
		expect(parallel.length).toBeGreaterThan(0);
		expect(Math.max(...parallel.map((p) => p.peak))).toBeGreaterThan(2);
	});

	it('multi-agent: silence and activity never overlap, which the old version could not promise', () => {
		const { spans, duration } = turnSpans('web-design-multi-agent');
		const gaps = silentGaps(spans, 0, duration);
		const active = mergeSpans(spans);

		for (const gap of gaps) {
			for (const span of active) {
				const overlap = Math.min(gap.end, span.end) - Math.max(gap.start, span.start);
				expect(overlap).toBeLessThanOrEqual(0);
			}
		}
	});

	it('chat: a two-party conversation has little or no concurrency', () => {
		const { spans } = turnSpans('web-design-chat');
		const parallel = concurrentSpans(spans, 2, 1);
		expect(parallel.length).toBeLessThan(spans.length / 4);
	});
});
