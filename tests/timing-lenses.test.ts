import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The converter emits one `end` and three candidate starts, so a published
 * transcript is not locked to a single reading of when a contribution began.
 * These assertions pin the property that distinguishes each lens.
 */
function load(dataset: string): Record<string, string>[] {
	const text = readFileSync(resolve(__dirname, `../static/data/${dataset}/conversation.csv`), 'utf8');
	const out: string[][] = [];
	let f = '', row: string[] = [], q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
		else if (c === '"') q = true;
		else if (c === ',') { row.push(f); f = ''; }
		else if (c === '\n') { row.push(f); out.push(row); row = []; f = ''; }
		else if (c !== '\r') f += c;
	}
	if (f || row.length) { row.push(f); out.push(row); }
	const h = out[0];
	return out.slice(1).filter((r) => r.length === h.length && r[h.indexOf('start')] !== '')
		.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}

const SETS = ['web-design-chat', 'web-design-tools', 'web-design-multi-agent'];

function gapCount(rows: Record<string, string>[], startKey: string): number {
	const sp = rows.map((r) => [Number(r[startKey]), Number(r.end)] as const).sort((a, b) => a[0] - b[0]);
	let gaps = 0, mark = 0;
	for (const [s, e] of sp) { if (s > mark + 1e-6) gaps++; mark = Math.max(mark, e); }
	return gaps;
}

describe('timing lenses', () => {
	it('every row carries all three starts and a provenance', () => {
		for (const d of SETS) {
			for (const r of load(d)) {
				for (const k of ['start_record', 'start_work', 'start_floor']) {
					expect(Number.isFinite(Number(r[k]))).toBe(true);
					expect(Number(r[k])).toBeGreaterThanOrEqual(0);
				}
				expect(['measured', 'estimated', 'marker']).toContain(r.provenance);
			}
		}
	});

	it('record is a tick, never a duration derived from length', () => {
		// A row whose start equals its end reads as zero-width downstream and is
		// re-expanded from its word count, which drew a tool result holding a
		// 3,000-word file as a 1,000-second contribution.
		for (const d of SETS) {
			for (const r of load(d)) {
				const width = Number(r.end) - Number(r.start_record);
				expect(width).toBeGreaterThan(0);
				expect(width).toBeLessThanOrEqual(0.11);
			}
		}
	});

	it('floor leaves no gaps in any session', () => {
		for (const d of SETS) expect(gapCount(load(d), 'start_floor')).toBe(0);
	});

	it('floor accounts for the whole session, leaving no gaps', () => {
		for (const d of SETS) expect(gapCount(load(d), 'start_floor')).toBeLessThanOrEqual(1);
	});

	it('work leaves gaps, which is what makes idle time visible', () => {
		expect(gapCount(load('web-design-chat'), 'start_work')).toBeGreaterThan(0);
	});

	it('no row is zero-width, which downstream would re-expand from a word count', () => {
		for (const d of SETS) {
			for (const r of load(d)) expect(Number(r.end) - Number(r.start)).toBeGreaterThan(0);
		}
	});

	it('classifies human turns as composed, brought or unknown, and only human turns', () => {
		for (const d of SETS) {
			for (const r of load(d)) {
				if (r.human_text) {
					expect(['composed', 'brought', 'unknown']).toContain(r.human_text);
					expect(r.role).toBe('user');
				}
			}
		}

		const count = (d: string, label: string) => load(d).filter((r) => r.human_text === label).length;

		// Bringing text is commonest in the chat session, and rare elsewhere.
		// This assertion used to run the other way, on two artefacts. A finished
		// background agent reports through the human's channel, so its write-up
		// was recorded as a human turn — at 1,058 and 1,339 words those could
		// only ever classify as brought, though nobody typed them. And a turn
		// whose preceding gap is unmeasurable was convicted of the same, since
		// words over a gap of nothing implies infinite speed. Between them the
		// multi-agent session looked like the one full of pasting. It has one
		// real instance; the chat session, where a syllabus and an HTML file
		// were genuinely pasted in, has three.
		expect(count('web-design-chat', 'brought')).toBeGreaterThan(count('web-design-multi-agent', 'brought'));
		expect(count('web-design-multi-agent', 'brought')).toBeGreaterThan(count('web-design-tools', 'brought'));

		// Unmeasurable gaps concentrate where events land on top of each other,
		// which is the agentic session. Reporting them as their own value is
		// what keeps them out of the count above.
		const unknownShare = (d: string) => count(d, 'unknown') / load(d).filter((r) => r.human_text).length;
		expect(unknownShare('web-design-multi-agent')).toBeGreaterThan(unknownShare('web-design-chat'));
		expect(unknownShare('web-design-multi-agent')).toBeGreaterThan(unknownShare('web-design-tools'));
	});

	it('never extends a session past its last recorded event', () => {
		// A row whose reach-back was consumed used to push its end forward. The
		// inflated end became the next row's floor, and the multi-agent session
		// reported 3,616s against a source that ran 2,607s.
		const SOURCE_END: Record<string, number> = {
			'web-design-chat': 1990.0,
			'web-design-tools': 2495.5,
			'web-design-multi-agent': 2607.3
		};
		for (const d of SETS) {
			const maxEnd = Math.max(...load(d).map((r) => Number(r.end)));
			expect(maxEnd).toBeLessThanOrEqual(SOURCE_END[d] + 1);
		}
	});

	it('keeps the floor lens summing to the session, so shares are meaningful', () => {
		for (const d of SETS) {
			const rows = load(d);
			const spans = rows.map((r) => [Number(r.start_floor), Number(r.end)] as const).sort((a, b) => a[0] - b[0]);
			let covered = 0, mark = 0;
			for (const [s, e] of spans) {
				const from = Math.max(s, mark);
				if (e > from) { covered += e - from; mark = e; }
			}
			const maxEnd = Math.max(...rows.map((r) => Number(r.end)));
			expect(covered / maxEnd).toBeGreaterThan(0.99);
		}
	});
});
