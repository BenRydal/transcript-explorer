/**
 * The Speaker Garden maps word count onto bloom area and turn count onto stem
 * height. One scale serves every transcript: whether a session declares itself
 * AI says nothing about how lopsided its word counts are — the flattest
 * transcript bundled here is an AI chat (leader 1.7x the median) and two of the
 * most lopsided are human classroom recordings (25x and 14x).
 *
 * Three properties matter. Bloom area tracks word count, so a speaker holding a
 * sixth of the words does not read as an equal. The floor is the bottom of the
 * scale rather than a clamp on it, so quiet speakers stay distinguishable
 * instead of collapsing onto one size. And a column narrower than the floor
 * shrinks the floor rather than flattening the whole field.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { flowerRadius, stemFraction, bloomFloor, MIN_FLOWER_RADIUS, MIN_AI_FLOWER_RADIUS, FLOOR_MAX_SHARE } from '../src/lib/draw/garden-scaling';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

/** Thresholds flower-drawing.ts gates leaves, centre dots and veins on. */
const DETAIL_THRESHOLDS = { leaves: 0.25, centreDots: 0.35, veins: 0.4 };
const scaleFactor = (radius: number) => radius / 100;

/** Column width the garden allows per speaker: `width / (speakers + 1)`. */
const maxRadiusFor = (speakers: number, canvasWidth = 1900) => canvasWidth / (speakers + 1);

/** Width of a garden drawn as one tile of the default dashboard rather than full screen. */
const TILE_WIDTH = 700;

/**
 * The map this replaced: the floor applied as a clamp, and a log curve for AI.
 * Kept here so the regressions it caused stay pinned to a number.
 */
function legacyRadius(wordCount: number, domainMax: number, maxRadius: number, isAi: boolean): number {
	const floor = isAi ? MIN_AI_FLOWER_RADIUS : MIN_FLOWER_RADIUS;
	if (maxRadius <= floor) return maxRadius;
	if (domainMax <= 0 || wordCount <= 0) return floor;
	if (!isAi) return Math.max(floor, maxRadius * Math.sqrt(Math.min(1, wordCount / domainMax)));
	return floor + Math.min(1, Math.log1p(wordCount) / Math.log1p(domainMax)) * (maxRadius - floor);
}

function loadGarden(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	const { transcript } = createTranscriptFromParsedText(parseCSVRows(rows));

	const words = new Map<string, number>();
	const turns = new Map<string, Set<number>>();
	for (const w of transcript.wordArray) {
		words.set(w.speaker, (words.get(w.speaker) ?? 0) + 1);
		if (!turns.has(w.speaker)) turns.set(w.speaker, new Set());
		turns.get(w.speaker)!.add(w.turnNumber);
	}
	const turnCounts = new Map([...turns].map(([s, set]) => [s, set.size]));
	return {
		words,
		turnCounts,
		maxWords: Math.max(...words.values()),
		maxTurns: Math.max(...turnCounts.values()),
		speakers: words.size
	};
}

const distinct = (radii: number[]) => new Set(radii.map((r) => r.toFixed(1))).size;
const atMin = (radii: number[]) => radii.filter((r) => Math.abs(r - Math.min(...radii)) < 0.01).length;

describe('flowerRadius', () => {
	it('is monotonic — more words never gives a smaller bloom', () => {
		for (const isAi of [true, false]) {
			let prev = 0;
			for (let n = 1; n <= 50_000; n += 137) {
				const r = flowerRadius(n, 50_000, 73, isAi);
				expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
				prev = r;
			}
		}
	});

	it('reaches the full radius at the top of the scale', () => {
		expect(flowerRadius(50_000, 50_000, 73, true)).toBeCloseTo(73);
		expect(flowerRadius(50_000, 50_000, 73, false)).toBeCloseTo(73);
	});

	it('never exceeds the column, even past the scale', () => {
		expect(flowerRadius(1_000_000, 50_000, 73, true)).toBeLessThanOrEqual(73);
		expect(flowerRadius(1_000_000, 50_000, 73, false)).toBeLessThanOrEqual(73);
	});

	it('maps words onto bloom area above the floor', () => {
		// Radius on the root of the ratio is what mapping words onto area means:
		// a quarter of the words takes half the range above the floor.
		const floor = bloomFloor(100, false);
		expect(flowerRadius(2500, 10_000, 100, false)).toBeCloseTo(floor + 0.5 * (100 - floor));
	});

	it('sets a speaker with no words on the floor', () => {
		expect(flowerRadius(0, 100_000, 73, false)).toBe(MIN_FLOWER_RADIUS);
		expect(flowerRadius(0, 100_000, 73, true)).toBe(MIN_AI_FLOWER_RADIUS);
	});

	it('lets a quiet human read quieter than a near-silent tool', () => {
		// A near-silent participant is a finding; a near-silent tool only has to
		// be identifiable. The floor is the only thing that still varies by kind.
		expect(flowerRadius(1, 100_000, 200, false)).toBeLessThan(flowerRadius(1, 100_000, 200, true));
	});

	it('degrades rather than throwing on a panel with no width', () => {
		expect(flowerRadius(500, 1000, 0, true)).toBe(0);
		expect(flowerRadius(500, 1000, -10, true)).toBe(0);
	});
});

describe('a column narrower than the floor', () => {
	it('shrinks the floor rather than flattening every bloom onto one size', () => {
		const words = [1000, 500, 250, 60, 10];
		const maxRadius = 18;

		expect(distinct(words.map((w) => legacyRadius(w, 1000, maxRadius, true)))).toBe(1);
		expect(distinct(words.map((w) => flowerRadius(w, 1000, maxRadius, true)))).toBe(words.length);
	});

	it('never lets the floor take more than its share of the column', () => {
		for (const maxRadius of [5, 18, 40, 73, 633]) {
			expect(bloomFloor(maxRadius, true)).toBeLessThanOrEqual(maxRadius * FLOOR_MAX_SHARE + 1e-9);
			expect(bloomFloor(maxRadius, false)).toBeLessThanOrEqual(maxRadius * FLOOR_MAX_SHARE + 1e-9);
		}
	});

	it('keeps the largest bloom well clear of the smallest however crowded the field', () => {
		// 41 actors in a dashboard tile is the worst case the bundled data reaches.
		const maxRadius = maxRadiusFor(41, TILE_WIDTH);
		const ratio = flowerRadius(1000, 1000, maxRadius, true) / flowerRadius(1, 1000, maxRadius, true);
		expect(ratio).toBeGreaterThan(1.5);
	});
});

describe('two speakers, one holding most of the words', () => {
	const id = 'web-design-chat';

	it('sizes the quiet speaker by its share rather than flattering it', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers);
		const [user, claude] = [...words.values()].sort((a, b) => a - b);

		// 14% of the words against 86%, at equal turn counts, so bloom size is
		// the only channel carrying the gap.
		const share = user / (user + claude);
		expect(share).toBeLessThan(0.2);

		const area = (r: number) => r * r;
		const legacy = area(legacyRadius(user, maxWords, maxRadius, true)) / area(legacyRadius(claude, maxWords, maxRadius, true));
		const current = area(flowerRadius(user, maxWords, maxRadius, true)) / area(flowerRadius(claude, maxWords, maxRadius, true));

		// The log map drew a sixth of the words at two thirds of the ink.
		expect(legacy).toBeGreaterThan(0.6);
		expect(current).toBeLessThan(0.25);
		expect(current).toBeGreaterThan(share);
	});
});

describe('against the bundled multi-agent transcript', () => {
	const id = 'web-design-multi-agent';

	it('every bloom clears the thresholds that make it read as a flower', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers);

		for (const [speaker, count] of words) {
			const sf = scaleFactor(flowerRadius(count, maxWords, maxRadius, true));
			expect(sf, `${speaker} renders without petal detail`).toBeGreaterThan(DETAIL_THRESHOLDS.veins);
		}
	});

	it('the clamped map left most of the field as bare petal rings', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers);

		const bare = [...words.values()].filter((c) => scaleFactor(legacyRadius(c, maxWords, maxRadius, false)) <= DETAIL_THRESHOLDS.leaves);
		expect(bare.length / words.size).toBeGreaterThan(0.5);
	});

	it('lifts the field out of the bottom quarter of the axis', () => {
		const { turnCounts, maxTurns } = loadGarden(id);
		const inBottomQuarter = (useSqrt: boolean) => [...turnCounts.values()].filter((t) => stemFraction(t, maxTurns, useSqrt) < 0.25).length;

		// 16 of 25 linearly, 3 of 25 by root, on this transcript.
		const linear = inBottomQuarter(false);
		const rooted = inBottomQuarter(true);
		expect(linear / turnCounts.size).toBeGreaterThan(0.6);
		expect(rooted).toBeLessThan(linear);
		expect(rooted / turnCounts.size).toBeLessThan(0.2);
	});

	it('keeps blooms distinguishable rather than flattening them onto the floor', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers);
		const radii = [...words.values()].map((c) => flowerRadius(c, maxWords, maxRadius, true));

		expect(atMin(radii)).toBeLessThan(words.size * 0.1);
		expect(distinct(radii)).toBeGreaterThan(words.size * 0.5);
	});

	it('still says something about word count in a dashboard tile', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers, TILE_WIDTH);

		// The column is narrower than the AI floor here, which the clamped map
		// answered by drawing all 25 actors at exactly the same size.
		expect(distinct([...words.values()].map((c) => legacyRadius(c, maxWords, maxRadius, true)))).toBe(1);
		expect(distinct([...words.values()].map((c) => flowerRadius(c, maxWords, maxRadius, true)))).toBeGreaterThan(words.size * 0.5);
	});
});

describe('a human classroom transcript', () => {
	const id = 'example-1';

	it('separates the quiet students the clamp used to flatten in a dashboard tile', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers, TILE_WIDTH);

		// Eight of the ten — every student but the most talkative — landed on the
		// floor together, which is the finding this view exists to report.
		const legacy = [...words.values()].map((c) => legacyRadius(c, maxWords, maxRadius, false));
		expect(atMin(legacy)).toBe(8);

		const current = [...words.values()].map((c) => flowerRadius(c, maxWords, maxRadius, false));
		expect(atMin(current)).toBe(1);
		expect(distinct(current)).toBeGreaterThanOrEqual(8);
	});

	it('keeps the quietest student off the floor at full width', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers);
		const floor = bloomFloor(maxRadius, false);

		const current = [...words.values()].map((c) => flowerRadius(c, maxWords, maxRadius, false));
		expect(Math.min(...current)).toBeGreaterThan(floor);
		expect(distinct(current)).toBeGreaterThanOrEqual(8);
	});

	it('reproduces the original stem mapping exactly', () => {
		const { turnCounts, maxTurns } = loadGarden(id);
		for (const t of turnCounts.values()) {
			expect(stemFraction(t, maxTurns, false)).toBeCloseTo(t / maxTurns, 9);
		}
	});
});

describe('stemFraction', () => {
	it('puts the top speaker at the top of the axis under either map', () => {
		expect(stemFraction(59, 59, true)).toBe(1);
		expect(stemFraction(59, 59, false)).toBe(1);
	});

	it('is monotonic', () => {
		let prev = -1;
		for (let n = 0; n <= 59; n++) {
			const f = stemFraction(n, 59, true);
			expect(f).toBeGreaterThanOrEqual(prev);
			prev = f;
		}
	});

	it('leaves the human map linear', () => {
		expect(stemFraction(30, 60, false)).toBeCloseTo(0.5);
	});

	it('lifts a median speaker off the floor under the AI map', () => {
		// 5 turns against a 59-turn leader: 8% of the axis linearly, 29% by root.
		expect(stemFraction(5, 59, false)).toBeCloseTo(0.085, 2);
		expect(stemFraction(5, 59, true)).toBeCloseTo(0.291, 2);
	});

	it('does not divide by zero on an empty transcript', () => {
		expect(stemFraction(0, 0, true)).toBe(0);
	});
});
