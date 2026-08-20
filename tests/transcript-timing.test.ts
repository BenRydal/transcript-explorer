import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the timing the converter writes into the bundled AI transcripts.
 *
 * The converter used to end every row at the start of the next one. Rows
 * tiled, so nothing could overlap and parallel agent work was unrepresentable,
 * and a tool result absorbed the model's thinking time because it ran until
 * whatever happened next. These assertions fail if that behaviour returns.
 */
function readSpans(dataset: string): { start: number; end: number; type: string }[] {
	const path = resolve(__dirname, `../static/data/${dataset}/conversation.csv`);
	const text = readFileSync(path, 'utf8');

	// Minimal RFC4180 reader: content fields contain commas and newlines.
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
			} else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') { row.push(field); field = ''; }
		else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
		else if (c !== '\r') field += c;
	}
	if (field || row.length) { row.push(field); rows.push(row); }

	const header = rows[0];
	const iStart = header.indexOf('start');
	const iEnd = header.indexOf('end');
	const iType = header.indexOf('event_type');
	return rows
		.slice(1)
		.filter((r) => r.length > iEnd && r[iStart] !== '')
		.map((r) => ({ start: Number(r[iStart]), end: Number(r[iEnd]), type: r[iType] }));
}

function overlapCount(spans: { start: number; end: number }[]): number {
	const sorted = [...spans].sort((a, b) => a.start - b.start);
	let n = 0;
	for (let i = 0; i < sorted.length - 1; i++) {
		if (sorted[i].end > sorted[i + 1].start + 1e-9) n++;
	}
	return n;
}

describe('converted AI transcript timing', () => {
	// Chat is excluded: there, adjacency is the real structure, since the model
	// begins the moment the person submits. Tiling was severe in the sessions
	// that carry tool and agent activity — 78% and 93% of rows respectively.
	it('does not tile rows end-to-start', () => {
		for (const dataset of ['web-design-tools', 'web-design-multi-agent']) {
			const spans = readSpans(dataset);
			const sorted = [...spans].sort((a, b) => a.start - b.start);
			let abutting = 0;
			for (let i = 0; i < sorted.length - 1; i++) {
				if (Math.abs(sorted[i].end - sorted[i + 1].start) < 1e-9) abutting++;
			}
			// Some adjacency is real; near-total adjacency is the old artefact.
			expect(abutting).toBeLessThan(sorted.length * 0.25);
		}
	});

	it('represents concurrent work in the multi-agent session', () => {
		expect(overlapCount(readSpans('web-design-multi-agent'))).toBeGreaterThan(0);
	});

	it('reports no concurrency in a two-party chat', () => {
		expect(overlapCount(readSpans('web-design-chat'))).toBe(0);
	});

	it('preserves the two delegated agents that ran at the same time', () => {
		const spawns = readSpans('web-design-multi-agent').filter((s) => s.type === 'agent_spawn');
		const outer = spawns.find((s) => Math.round(s.start) === 771);
		const inner = spawns.find((s) => Math.round(s.start) === 780);
		expect(outer).toBeDefined();
		expect(inner).toBeDefined();
		// The second agent starts and finishes inside the first agent's span.
		expect(inner!.start).toBeGreaterThan(outer!.start);
		expect(inner!.end).toBeLessThan(outer!.end);
	});

	it('does not let tool rows absorb the model\'s thinking time', () => {
		const spans = readSpans('web-design-multi-agent');
		const toolSeconds = spans
			.filter((s) => s.type === 'tool_call' || s.type === 'tool_result')
			.reduce((sum, s) => sum + (s.end - s.start), 0);
		// Was ~635s when tool rows ran until the next event.
		expect(toolSeconds).toBeLessThan(200);
	});
});
