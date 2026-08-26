/**
 * The Speaker Garden maps word count onto bloom area and turn count onto stem
 * height, both linearly against the largest speaker. That works for human
 * conversation and collapses on an agentic session, where one actor can hold
 * half the words and five times the turns of any other.
 *
 * Two properties matter. Human transcripts must redraw exactly as before. And
 * an AI transcript's smallest bloom has to clear the detail thresholds in
 * flower-drawing.ts, or it renders as a bare petal ring rather than a flower.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { flowerRadius, stemFraction, MIN_FLOWER_RADIUS, MIN_AI_FLOWER_RADIUS } from '../src/lib/draw/garden-scaling';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

/** Thresholds flower-drawing.ts gates leaves, centre dots and veins on. */
const DETAIL_THRESHOLDS = { leaves: 0.25, centreDots: 0.35, veins: 0.4 };
const scaleFactor = (radius: number) => radius / 100;

/** Column width the garden allows per speaker at a typical canvas size. */
const maxRadiusFor = (speakers: number, canvasWidth = 1900) => canvasWidth / (speakers + 1);

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

describe('flowerRadius', () => {
	it('is monotonic — more words never gives a smaller bloom', () => {
		let prev = 0;
		for (let n = 1; n <= 50_000; n += 137) {
			const r = flowerRadius(n, 50_000, 73, true);
			expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
			prev = r;
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

	it('honours a column narrower than the floor rather than overlapping neighbours', () => {
		expect(flowerRadius(10, 1000, 18, true)).toBe(18);
	});

	it('keeps the human map on area, as it always was', () => {
		// radius proportional to sqrt(words) is what mapping words onto area means
		const quarter = flowerRadius(2500, 10_000, 100, false);
		expect(quarter).toBeCloseTo(50);
	});

	it('holds the human floor for a very small speaker', () => {
		expect(flowerRadius(1, 100_000, 73, false)).toBe(MIN_FLOWER_RADIUS);
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

	it('the old linear map left most of the field as bare petal rings', () => {
		const { words, maxWords, speakers } = loadGarden(id);
		const maxRadius = maxRadiusFor(speakers);

		const bare = [...words.values()].filter((c) => scaleFactor(flowerRadius(c, maxWords, maxRadius, false)) <= DETAIL_THRESHOLDS.leaves);
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
		const atFloor = radii.filter((r) => r === MIN_AI_FLOWER_RADIUS).length;

		expect(atFloor).toBeLessThan(words.size * 0.1);
		expect(new Set(radii.map((r) => r.toFixed(1))).size).toBeGreaterThan(words.size * 0.5);
	});
});

describe('human transcripts are untouched', () => {
	it('reproduces the original bloom radius formula exactly', () => {
		const { words, maxWords, speakers } = loadGarden('example-1');
		const maxRadius = maxRadiusFor(speakers);
		const maxArea = Math.PI * maxRadius * maxRadius;

		for (const count of words.values()) {
			const original = Math.max(Math.sqrt(((count / maxWords) * maxArea) / Math.PI), MIN_FLOWER_RADIUS);
			expect(flowerRadius(count, maxWords, maxRadius, false)).toBeCloseTo(original, 6);
		}
	});

	it('reproduces the original stem mapping exactly', () => {
		const { turnCounts, maxTurns } = loadGarden('example-1');
		for (const t of turnCounts.values()) {
			expect(stemFraction(t, maxTurns, false)).toBeCloseTo(t / maxTurns, 9);
		}
	});
});
