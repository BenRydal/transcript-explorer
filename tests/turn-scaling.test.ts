/**
 * The turn chart sizes bubbles by turn length. A linear map against the longest
 * turn works for human conversation and fails for AI sessions, where one turn
 * carrying a large tool result can be an order of magnitude longer than any
 * other and flattens every ordinary turn into an invisible sliver.
 *
 * AI transcripts take a square-root map instead, so bubble area rather than
 * diameter tracks turn length. The properties that matter are that nothing is
 * clipped, ordering is never violated, and no real turn lands on the minimum —
 * a floor that fires routinely would tie the short turns together and reproduce
 * the problem it exists to prevent.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { MIN_BUBBLE_SIZE, turnBubbleHeight, capBubbleHeight } from '../src/lib/draw/turn-chart-scaling';
import { calculateTranscriptStats } from '../src/lib/core/transcript-stats';
import { splitIntoWordTokens } from '../src/lib/core/string-utils';
import { DataPoint } from '../src/models/dataPoint';

const LANE = 600;

const AI_FIXTURES = ['web-design-chat', 'web-design-tools', 'web-design-single-agent', 'web-design-multi-agent'];

function loadTurnLengths(id: string): number[] {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, string>[];

	const lengths: number[] = [];
	for (const row of rows) {
		const tokens = splitIntoWordTokens(String(row.content ?? ''));
		if (tokens.length > 0) lengths.push(tokens.length);
	}
	return lengths;
}

describe('turnBubbleHeight — human transcripts', () => {
	it('is linear against the longest turn', () => {
		expect(turnBubbleHeight(50, 100, LANE, false)).toBeCloseTo(LANE / 2);
		expect(turnBubbleHeight(25, 100, LANE, false)).toBeCloseTo(LANE / 4);
	});

	it('does not apply the floor, leaving existing rendering untouched', () => {
		expect(turnBubbleHeight(1, 100_000, LANE, false)).toBeLessThan(MIN_BUBBLE_SIZE);
	});

	it('returns 0 for an empty scale rather than a floored bubble', () => {
		expect(turnBubbleHeight(10, 0, LANE, false)).toBe(0);
	});
});

describe('turnBubbleHeight — AI transcripts', () => {
	it('fills the lane at the top of the scale, so nothing is clipped', () => {
		expect(turnBubbleHeight(100, 100, LANE, true)).toBeCloseTo(LANE);
	});

	it('never exceeds the lane, even if a turn somehow runs past the scale', () => {
		expect(turnBubbleHeight(10_000, 100, LANE, true)).toBeCloseTo(LANE);
	});

	it('tracks area rather than diameter', () => {
		// a quarter of the longest turn should be half the height
		expect(turnBubbleHeight(25, 100, LANE, true)).toBeCloseTo(LANE / 2);
	});

	it('gives a short turn far more height than the linear map', () => {
		const short = 12;
		const max = 4000;
		expect(turnBubbleHeight(short, max, LANE, true)).toBeGreaterThan(10 * turnBubbleHeight(short, max, LANE, false));
	});

	it('applies the floor so no turn is invisible', () => {
		expect(turnBubbleHeight(1, 10_000_000, LANE, true)).toBe(MIN_BUBBLE_SIZE);
	});

	it('is monotonic — a taller bubble always means a longer turn', () => {
		let prev = 0;
		for (let n = 0; n <= 5000; n += 7) {
			const h = turnBubbleHeight(n, 5000, LANE, true);
			expect(h).toBeGreaterThanOrEqual(prev);
			prev = h;
		}
	});
});

describe('turnBubbleHeight — against the real AI fixtures', () => {
	for (const id of AI_FIXTURES) {
		it(`renders every turn of ${id} visibly, without the floor binding`, () => {
			const lengths = loadTurnLengths(id);
			const max = Math.max(...lengths);
			const heights = lengths.map((n) => turnBubbleHeight(n, max, LANE, true));

			// Every turn visible on its own merits, not because the floor caught
			// it — strictly above the floor means the clamp never engaged.
			expect(Math.min(...heights)).toBeGreaterThan(MIN_BUBBLE_SIZE);
			// And the floor isn't tying short turns together: distinct lengths
			// still read as distinct sizes. This is the property the floor
			// threatens, stated without restating the formula under test.
			expect(new Set(heights).size).toBe(new Set(lengths).size);
			// Nothing clipped at the top.
			expect(Math.max(...heights)).toBeCloseTo(LANE);
		});

		it(`would leave most of ${id} invisible under the linear map`, () => {
			const lengths = loadTurnLengths(id);
			const max = Math.max(...lengths);
			const invisible = lengths.filter((n) => turnBubbleHeight(n, max, LANE, false) < MIN_BUBBLE_SIZE);
			expect(invisible.length).toBeGreaterThan(0);
		});
	}
});

describe('transcript stats', () => {
	it('still reports the longest turn, which is what the scale runs to', () => {
		const wordArray = [
			new DataPoint('A', 0, 'one', 0, 1),
			new DataPoint('B', 1, 'a', 1, 2),
			new DataPoint('B', 1, 'b', 1, 2),
			new DataPoint('B', 1, 'c', 1, 2)
		];
		expect(calculateTranscriptStats(wordArray).largestTurnLength).toBe(3);
	});
});

/**
 * A turn's height comes from its word count and its width from its duration,
 * and the two have unrelated ranges. Where the converter had no measured
 * duration it writes a 0.5s marker, so a tool returning thousands of words
 * draws a few pixels wide and the full lane tall -- a needle whose most
 * striking dimension is a fallback constant rather than anything measured.
 */
describe('capBubbleHeight', () => {
	it('leaves a mark already inside the cap alone', () => {
		expect(capBubbleHeight(40, 20, 8)).toEqual({ height: 40, capped: false });
	});

	it('clips a needle and says so', () => {
		// The worst real case: 6,465 words in a 0.5s marker duration.
		const { height, capped } = capBubbleHeight(800, 5, 8);
		expect(capped).toBe(true);
		expect(height).toBe(40);
	});

	it('never returns more than the cap allows', () => {
		for (let w = 1; w <= 200; w += 7) {
			for (let h = 1; h <= 2000; h += 91) {
				expect(capBubbleHeight(h, w, 8).height).toBeLessThanOrEqual(w * 8 + 1e-9);
			}
		}
	});

	it('never grows a mark', () => {
		for (let w = 1; w <= 200; w += 13) {
			for (let h = 1; h <= 900; h += 47) {
				expect(capBubbleHeight(h, w, 8).height).toBeLessThanOrEqual(h);
			}
		}
	});

	it('is monotonic, so a longer turn is never drawn shorter', () => {
		let prev = 0;
		for (let h = 1; h <= 500; h++) {
			const capped = capBubbleHeight(h, 12, 8).height;
			expect(capped).toBeGreaterThanOrEqual(prev);
			prev = capped;
		}
	});

	it('leaves degenerate input untouched rather than producing NaN', () => {
		expect(capBubbleHeight(100, 0, 8)).toEqual({ height: 100, capped: false });
		expect(capBubbleHeight(0, 10, 8)).toEqual({ height: 0, capped: false });
		expect(capBubbleHeight(100, 10, 0)).toEqual({ height: 100, capped: false });
	});
});
