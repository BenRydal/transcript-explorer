/**
 * The scrubber already drives `leftMarker`/`rightMarker` and every view reads
 * them, so brushing a range works. What it could not tell you is WHERE to
 * brush: the track was blank, so finding the busy minute in a 43-minute
 * session meant dragging and watching. These bands are the context half of
 * overview-and-detail.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { activityDensity, DENSITY_BAND_COUNT } from '../src/lib/timeline/activity-density';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';
import type { DataPoint } from '../src/models/dataPoint';

const ACCENT = '#2563eb';

function load(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	return createTranscriptFromParsedText(parseCSVRows(rows)).transcript;
}

const at = (t: number) => ({ startTime: t }) as DataPoint;

describe('activityDensity', () => {
	it('returns nothing for an empty transcript rather than a blank band', () => {
		expect(activityDensity([], 100, ACCENT)).toEqual([]);
	});

	it('returns nothing for a zero-length timeline', () => {
		expect(activityDensity([at(0)], 0, ACCENT)).toEqual([]);
	});

	it('omits silent stretches rather than drawing them at zero alpha', () => {
		// Everything in the first tenth of the timeline.
		const words = Array.from({ length: 50 }, (_, i) => at(i * 0.1));
		const bands = activityDensity(words, 100, ACCENT, 10);
		expect(bands.length).toBe(1);
		expect(bands[0].start).toBe(0);
	});

	it('covers the timeline, and never past its end', () => {
		const words = Array.from({ length: 200 }, (_, i) => at((i / 200) * 100));
		for (const band of activityDensity(words, 100, ACCENT)) {
			expect(band.start).toBeGreaterThanOrEqual(0);
			expect(band.end).toBeLessThanOrEqual(100 + 1e-9);
			expect(band.end).toBeGreaterThan(band.start);
		}
	});

	it('shades a busier band more strongly than a quieter one', () => {
		const words = [...Array.from({ length: 100 }, () => at(1)), at(51)];
		const bands = activityDensity(words, 100, ACCENT, 2);
		const alpha = (c: string) => Number(c.match(/\/ ([\d.]+)\)/)?.[1] ?? 0);
		expect(alpha(bands[0].color)).toBeGreaterThan(alpha(bands[1].color));
	});

	it('gives every band a unique id, so nothing is dropped as a duplicate key', () => {
		const words = Array.from({ length: 500 }, (_, i) => at((i / 500) * 100));
		const bands = activityDensity(words, 100, ACCENT);
		expect(new Set(bands.map((b) => b.id)).size).toBe(bands.length);
	});

	it('passes a colour the browser can parse', () => {
		const bands = activityDensity([at(1), at(2)], 10, ACCENT, 4);
		for (const band of bands) expect(band.color).toMatch(/^rgb\(\d+ \d+ \d+ \/ [\d.]+\)$/);
	});

	it('leaves an unparseable accent alone rather than emitting broken css', () => {
		const bands = activityDensity([at(1)], 10, 'tomato', 2);
		expect(bands[0].color).toBe('tomato');
	});
});

describe('against the bundled multi-agent session', () => {
	it('finds activity without covering the whole track', () => {
		const transcript = load('web-design-multi-agent');
		const bands = activityDensity(transcript.wordArray, transcript.totalTimeInSeconds, ACCENT);

		expect(bands.length).toBeGreaterThan(0);
		expect(bands.length).toBeLessThanOrEqual(DENSITY_BAND_COUNT);
	});

	it('separates busy from quiet, which is the whole point of drawing it', () => {
		const transcript = load('web-design-multi-agent');
		const bands = activityDensity(transcript.wordArray, transcript.totalTimeInSeconds, ACCENT);
		const alphas = bands.map((b) => Number(b.color.match(/\/ ([\d.]+)\)/)?.[1] ?? 0));

		expect(Math.max(...alphas)).toBeGreaterThan(Math.min(...alphas) * 1.5);
	});
});
