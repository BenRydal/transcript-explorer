/**
 * The speaker heatmap shades each cell by the number of words a speaker
 * contributed in one time bin. A linear map against the busiest cell works for
 * human conversation and fails for AI sessions, where a bin carrying a large
 * tool result holds two orders of magnitude more words than the median bin and
 * flattens the rest of the grid into the background.
 *
 * AI transcripts take a log map instead. The properties that matter are that
 * nothing is clipped, ordering is never violated, and the middle of a real
 * transcript's distribution actually reads as shaded — a scale where the median
 * cell is invisible is not encoding anything.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { cellOpacity, MAX_CELL_OPACITY, MIN_CELL_OPACITY } from '../src/lib/draw/heatmap-scaling';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

const AI_FIXTURES = ['web-design-chat', 'web-design-tools', 'web-design-single-agent', 'web-design-multi-agent'];

/**
 * Roughly the number of columns the heatmap lands on at a typical panel width
 * (`grid.width / TARGET_CELL_WIDTH`). The exact figure doesn't matter — the
 * properties under test hold across bin counts — but a fixed one keeps the
 * fixture numbers reproducible.
 */
const BIN_COUNT = 53;

/**
 * Word counts of every populated (bin, speaker) cell, ascending. Mirrors
 * `SpeakerHeatmap.binWords` over the full transcript: bin by word start time,
 * group by speaker, count.
 */
function loadCellCounts(id: string): number[] {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	const { transcript } = createTranscriptFromParsedText(parseCSVRows(rows));

	const binWidth = transcript.totalTimeInSeconds / BIN_COUNT;
	const counts = new Map<string, number>();
	for (const word of transcript.wordArray) {
		const bin = Math.max(0, Math.min(BIN_COUNT - 1, Math.floor(word.startTime / binWidth)));
		const key = `${bin}\0${word.speaker}`;
		counts.set(key, (counts.get(key) || 0) + 1);
	}
	return [...counts.values()].sort((a, b) => a - b);
}

const median = (sorted: number[]) => sorted[Math.floor((sorted.length - 1) / 2)];

describe('cellOpacity — shared behaviour', () => {
	for (const useLog of [false, true]) {
		const label = useLog ? 'log' : 'linear';

		it(`${label}: the busiest cell fills the range, so nothing is clipped`, () => {
			expect(cellOpacity(100, 100, useLog)).toBeCloseTo(MAX_CELL_OPACITY);
		});

		it(`${label}: never exceeds the range, even past the scale`, () => {
			expect(cellOpacity(10_000, 100, useLog)).toBeCloseTo(MAX_CELL_OPACITY);
		});

		it(`${label}: the quietest populated cell still clears the floor`, () => {
			expect(cellOpacity(1, 1_000_000, useLog)).toBeGreaterThanOrEqual(MIN_CELL_OPACITY);
		});

		it(`${label}: an empty cell is not shaded at all — the caller draws those`, () => {
			expect(cellOpacity(0, 100, useLog)).toBe(0);
		});

		it(`${label}: is monotonic — a darker cell always means more words`, () => {
			let prev = 0;
			for (let n = 1; n <= 5000; n += 7) {
				const alpha = cellOpacity(n, 5000, useLog);
				expect(alpha).toBeGreaterThanOrEqual(prev);
				prev = alpha;
			}
		});
	}

	it('falls back to full opacity rather than a division by zero on an empty scale', () => {
		expect(cellOpacity(10, 0, false)).toBe(MAX_CELL_OPACITY);
		expect(cellOpacity(10, 0, true)).toBe(MAX_CELL_OPACITY);
	});
});

describe('cellOpacity — human transcripts stay linear', () => {
	it('places the midpoint of the scale at the midpoint of the range', () => {
		expect(cellOpacity(50, 100, false)).toBeCloseTo((MIN_CELL_OPACITY + MAX_CELL_OPACITY) / 2);
		expect(cellOpacity(25, 100, false)).toBeCloseTo(MIN_CELL_OPACITY + (MAX_CELL_OPACITY - MIN_CELL_OPACITY) / 4);
	});
});

describe('cellOpacity — against the real AI fixtures', () => {
	for (const id of AI_FIXTURES) {
		it(`shades the body of ${id} legibly`, () => {
			const counts = loadCellCounts(id);
			const max = counts[counts.length - 1];

			// The median cell is the one the eye reads as "typical activity". It
			// has to be plainly visible, not a hint above the background.
			expect(cellOpacity(median(counts), max, true)).toBeGreaterThan(100);
			// And the grid still separates quiet from busy across its whole
			// range, rather than collapsing onto the floor.
			expect(cellOpacity(counts[0], max, true)).toBeLessThan(cellOpacity(median(counts), max, true));
			expect(new Set(counts.map((n) => cellOpacity(n, max, true))).size).toBe(new Set(counts).size);
		});

		it(`would wash ${id} out under the linear map`, () => {
			const counts = loadCellCounts(id);
			const max = counts[counts.length - 1];

			// The bug this scale exists to fix: a few outlier cells own the
			// range, so the typical cell renders barely above the floor.
			expect(cellOpacity(median(counts), max, false)).toBeLessThan(MIN_CELL_OPACITY + 25);
			// It isn't a handful of cells either — most of the grid goes with it.
			const washedOut = counts.filter((n) => cellOpacity(n, max, false) < MIN_CELL_OPACITY + 25);
			expect(washedOut.length).toBeGreaterThan(counts.length / 2);
		});
	}
});
