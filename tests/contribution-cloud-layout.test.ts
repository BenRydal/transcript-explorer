/**
 * The contribution cloud laid out every word in the transcript and drew each
 * one into its offscreen buffer, including the great majority that land below
 * the buffer's bottom edge and cannot be seen. On the bundled multi-agent
 * session that is over 106,000 `text()` calls per render, plus a hover test
 * over all of them on every later frame.
 *
 * It went unnoticed because the buffer threw on its font before reaching any
 * of this work. With the font fixed the cost became real, so layout now stops
 * at the bottom edge and reports the overflow the view already knew how to
 * show.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { ContributionCloud } from '../src/lib/draw/contribution-cloud';
import { calculateScaling, clearScalingCache } from '../src/lib/draw/contribution-cloud-scaling';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';
import type { DrawContext } from '../src/lib/draw/draw-context';
import type { DataPoint } from '../src/models/dataPoint';

const sk = {
	textSize: () => {},
	textWidth: (s: string) => String(s).length * 6,
	textAscent: () => 5,
	textDescent: () => 2
} as never;

const config = {
	separateToggle: false,
	repeatedWordsToggle: false,
	repeatWordSliderValue: 5,
	dashboardToggle: true,
	scaleToVisibleData: false,
	wordToSearch: ''
} as never;

function loadWords(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	const { transcript } = createTranscriptFromParsedText(parseCSVRows(rows));
	return { words: transcript.wordArray, maxCount: transcript.maxCountOfMostRepeatedWord };
}

function cloudFor(bounds: { x: number; y: number; width: number; height: number }, maxCount: number) {
	const ctx = {
		sk,
		config,
		users: [],
		userMap: new Map(),
		codeColorMap: new Map(),
		theme: { bg: '#ffffff' },
		transcript: { maxCountOfMostRepeatedWord: maxCount }
	} as unknown as DrawContext;
	return new ContributionCloud(ctx, bounds);
}

function layout(words: DataPoint[], maxCount: number, bounds: { x: number; y: number; width: number; height: number }) {
	clearScalingCache(true);
	const scaling = calculateScaling(sk, words, bounds, config, maxCount);
	return { ...cloudFor(bounds, maxCount).calculateWordPositions(words, scaling), scaling };
}

describe('contribution cloud layout', () => {
	// Bottom-right cell of the default three-panel dashboard on a wide canvas.
	const PANEL = { x: 0, y: 0, width: 925, height: 425 };

	it('stops once the buffer is full instead of laying out the whole transcript', () => {
		const { words, maxCount } = loadWords('web-design-multi-agent');
		const { positions, overflow } = layout(words, maxCount, PANEL);

		expect(words.length).toBeGreaterThan(100_000);
		expect(overflow).toBe(true);
		expect(positions.length).toBeLessThan(words.length / 2);
	});

	it('keeps every laid-out word within reach of the buffer', () => {
		const { words, maxCount } = loadWords('web-design-multi-agent');
		const { positions, scaling } = layout(words, maxCount, PANEL);

		for (const p of positions) {
			expect(p.y).toBeLessThanOrEqual(PANEL.height + scaling.lineHeight);
		}
	});

	it('lays out in transcript order, so what is shown is still the opening of the session', () => {
		const { words, maxCount } = loadWords('web-design-multi-agent');
		const { positions } = layout(words, maxCount, PANEL);

		expect(positions[0].word.word).toBe(words[0].word);
		for (let i = 1; i < positions.length; i++) {
			expect(positions[i].y).toBeGreaterThanOrEqual(positions[i - 1].y);
		}
	});

	it('does not flag overflow when everything fits', () => {
		const { words, maxCount } = loadWords('web-design-chat');
		const { positions, overflow } = layout(words, maxCount, { x: 0, y: 0, width: 1800, height: 1400 });

		expect(overflow).toBe(false);
		expect(positions.length).toBe(words.length);
	});

	it('survives a degenerate panel', () => {
		const { words, maxCount } = loadWords('web-design-tools');
		expect(() => layout(words, maxCount, { x: 0, y: 0, width: 1, height: 1 })).not.toThrow();
	});
});
