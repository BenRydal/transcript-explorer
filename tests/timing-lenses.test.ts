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

const SETS = ['web-design-chat', 'web-design-tools', 'web-design-single-agent', 'web-design-multi-agent'];

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

	it('record is a tick: its start equals the end', () => {
		for (const d of SETS) {
			for (const r of load(d)) expect(Number(r.start_record)).toBeCloseTo(Number(r.end), 3);
		}
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

	it('classifies human turns as composed or brought, and only human turns', () => {
		for (const d of SETS) {
			for (const r of load(d)) {
				if (r.human_text) {
					expect(['composed', 'brought']).toContain(r.human_text);
					expect(r.role).toBe('user');
				}
			}
		}
		// The multi-agent session is where bringing text dominates.
		const multi = load('web-design-multi-agent').filter((r) => r.human_text);
		expect(multi.filter((r) => r.human_text === 'brought').length)
			.toBeGreaterThan(multi.filter((r) => r.human_text === 'composed').length);
	});

	it('never extends a session past its last recorded event', () => {
		// A row whose reach-back was consumed used to push its end forward. The
		// inflated end became the next row's floor, and the multi-agent session
		// reported 3,616s against a source that ran 2,607s.
		const SOURCE_END: Record<string, number> = {
			'web-design-chat': 1990.0,
			'web-design-tools': 2495.5,
			'web-design-single-agent': 2065.6,
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
