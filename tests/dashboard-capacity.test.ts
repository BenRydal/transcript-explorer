/**
 * The dashboard draws several views at once into panels a fraction of the
 * canvas, and the word-oriented views cost by transcript rather than by panel.
 * Past a point that is more work per frame than the browser will absorb, so the
 * tile is disabled and the draw path refuses.
 *
 * The ceiling has to sit in the gap the corpus actually shows: every human and
 * single-agent transcript available, the multi-agent ones not.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { canRenderDashboard, dashboardUnavailableReason, MAX_DASHBOARD_WORDS } from '../src/lib/draw/dashboard-capacity';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

function wordCount(id: string): number {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	return createTranscriptFromParsedText(parseCSVRows(rows)).transcript.wordArray.length;
}

describe('canRenderDashboard', () => {
	it('admits an empty transcript rather than refusing on no data', () => {
		expect(canRenderDashboard(0)).toBe(true);
	});

	it('admits exactly the ceiling and refuses one past it', () => {
		expect(canRenderDashboard(MAX_DASHBOARD_WORDS)).toBe(true);
		expect(canRenderDashboard(MAX_DASHBOARD_WORDS + 1)).toBe(false);
	});
});

describe('dashboardUnavailableReason', () => {
	it('says nothing when the dashboard is available', () => {
		expect(dashboardUnavailableReason(1000)).toBeNull();
	});

	it('names the transcript size and the ceiling, so the refusal is explicable', () => {
		const reason = dashboardUnavailableReason(106_558);
		expect(reason).toContain('106,558');
		expect(reason).toContain(MAX_DASHBOARD_WORDS.toLocaleString());
	});
});

describe('against the bundled corpus', () => {
	// Word counts drift as the converter changes, so these read the real data.
	const AVAILABLE = ['example-1', 'example-5', 'web-design-chat', 'web-design-tools', 'web-design-single-agent', 'claude-agent'];
	const REFUSED = ['web-design-multi-agent', 'cs-multi-agent', 'claude-multi-agent', 'trip-multi-agent'];

	for (const id of AVAILABLE) {
		it(`${id}: the dashboard stays available`, () => {
			expect(canRenderDashboard(wordCount(id))).toBe(true);
		});
	}

	for (const id of REFUSED) {
		it(`${id}: the dashboard is refused`, () => {
			expect(canRenderDashboard(wordCount(id))).toBe(false);
		});
	}

	it('the ceiling sits in a real gap, not through the middle of the corpus', () => {
		const counts = readdirSync('static/data')
			.map((dir) => {
				try {
					return wordCount(dir);
				} catch {
					return null;
				}
			})
			.filter((n): n is number => n !== null)
			.sort((a, b) => a - b);

		const below = counts.filter((n) => n <= MAX_DASHBOARD_WORDS);
		const above = counts.filter((n) => n > MAX_DASHBOARD_WORDS);
		expect(below.length).toBeGreaterThan(0);
		expect(above.length).toBeGreaterThan(0);
		// Nothing should sit near the line, or the cutoff is arbitrary.
		expect(MAX_DASHBOARD_WORDS - below[below.length - 1]).toBeGreaterThan(5_000);
		expect(above[0] - MAX_DASHBOARD_WORDS).toBeGreaterThan(5_000);
	});
});
