import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';

function loadRows(dataset: string): Record<string, unknown>[] {
	const text = readFileSync(resolve(__dirname, `../static/data/${dataset}/conversation.csv`), 'utf8');
	const out: string[][] = [];
	let f = '', row: string[] = [], q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (q) { if (c === '"') { if (text[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
		else if (c === '"') q = true;
		else if (c === ',') { row.push(f); f = ''; }
		else if (c === '\n') { row.push(f); out.push(row); row = []; f = ''; }
		else if (c !== '\r') f += c;
	}
	if (f || row.length) { row.push(f); out.push(row); }
	const header = out[0];
	return out.slice(1).filter(r => r.length === header.length)
		.map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** Mirrors turn-chart.ts getTurnRanges: per-turn span from first/last word. */
function turnRanges(dataset: string) {
	const parsed = parseCSVRows(loadRows(dataset));
	const { transcript } = createTranscriptFromParsedText(parsed);
	const byTurn = new Map<number, { speaker: string; start: number; end: number }>();
	for (const w of transcript.wordArray) {
		const cur = byTurn.get(w.turnNumber);
		if (!cur) byTurn.set(w.turnNumber, { speaker: w.speaker, start: w.startTime, end: w.endTime });
		else { cur.start = Math.min(cur.start, w.startTime); cur.end = Math.max(cur.end, w.endTime); }
	}
	return { sourceKind: transcript.sourceKind, ranges: [...byTurn.values()].sort((a, b) => a.start - b.start) };
}

/**
 * The converter fix is only useful if the overlaps survive parsing and reach
 * the renderer. `turn-chart.ts` builds its Concurrent markers from per-turn
 * spans derived from word times, so a change to how the parser distributes
 * those times could silently drop concurrency again without any CSV changing.
 */
describe('end-to-end: overlaps reach the turn chart', () => {
	it('multi-agent produces cross-speaker overlaps after parsing', () => {
		// 948 pairs at the time of writing; asserting only that concurrency
		// survives, since the exact count moves with any timing change.
		const { sourceKind, ranges } = turnRanges('web-design-multi-agent');
		expect(sourceKind).toBe('ai');
		let overlaps = 0;
		for (let i = 0; i < ranges.length; i++)
			for (let j = i + 1; j < ranges.length; j++) {
				if (ranges[j].start >= ranges[i].end) break;
				if (ranges[j].speaker === ranges[i].speaker) continue;
				overlaps++;
			}
		expect(overlaps).toBeGreaterThan(0);
	});

	it('chat produces none', () => {
		const { ranges } = turnRanges('web-design-chat');
		let overlaps = 0;
		for (let i = 0; i < ranges.length; i++)
			for (let j = i + 1; j < ranges.length; j++) {
				if (ranges[j].start >= ranges[i].end) break;
				if (ranges[j].speaker === ranges[i].speaker) continue;
				overlaps++;
			}
		expect(overlaps).toBe(0);
	});
});
