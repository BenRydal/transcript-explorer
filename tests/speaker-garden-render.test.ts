/**
 * Exercises SpeakerGarden.draw against a recording stub. The garden reserves a
 * label strip out of its own height and positions blooms against what is left,
 * so a short panel -- a dashboard tile, a small window -- can drive the
 * baseline above the top of the axis. These check it survives that rather than
 * throwing inside the p5 draw loop, which would freeze the canvas on whatever
 * it last rendered.
 */

import { describe, expect, it } from 'vitest';
import { SpeakerGarden } from '../src/lib/draw/speaker-garden';
import type { DrawContext } from '../src/lib/draw/draw-context';
import type { DataPoint } from '../src/models/dataPoint';

interface Recorder {
	texts: string[];
	beziers: number;
	pushes: number;
	pops: number;
}

function makeCtx(speakers: string[], bounds: { width: number; height: number }, sourceKind = 'ai', overrides: Record<string, unknown> = {}) {
	const rec: Recorder = { texts: [], beziers: 0, pushes: 0, pops: 0 };
	const users = speakers.map((name) => ({ name, enabled: true, color: '#0072B2' }));

	const sk = {
		LEFT: 'left',
		RIGHT: 'right',
		CENTER: 'center',
		TOP: 'top',
		BASELINE: 'baseline',
		TWO_PI: Math.PI * 2,
		mouseX: -999,
		mouseY: -999,
		drawingContext: { globalAlpha: 1 },
		fill: () => {},
		noFill: () => {},
		noStroke: () => {},
		stroke: () => {},
		strokeWeight: () => {},
		textAlign: () => {},
		textSize: () => {},
		text: (s: string) => rec.texts.push(String(s)),
		textWidth: (s: string) => String(s).length * 6,
		line: () => {},
		bezier: () => {
			rec.beziers++;
		},
		beginShape: () => {},
		vertex: () => {},
		bezierVertex: () => {},
		endShape: () => {},
		ellipse: () => {},
		circle: () => {},
		rect: () => {},
		triangle: () => {},
		push: () => {
			rec.pushes++;
		},
		pop: () => {
			rec.pops++;
		},
		translate: () => {},
		rotate: () => {},
		scale: () => {},
		color: () => ({ setAlpha: () => {} }),
		red: () => 0,
		green: () => 114,
		blue: () => 178,
		map: (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a || 1)) * (d - c),
		dist: () => 9999,
		overRect: () => false,
		overCircle: () => false
	};

	const ctx = {
		sk,
		users,
		userMap: new Map(users.map((u) => [u.name, u])),
		codeColorMap: new Map(),
		hover: {},
		transcript: {
			sourceKind,
			largestNumOfWordsByASpeaker: 5000,
			largestNumOfTurnsByASpeaker: 59,
			totalNumOfWords: 10000,
			totalConversationTurns: 200
		},
		timeline: { leftMarker: 0, rightMarker: 100 },
		theme: { bg: '#fff', fg: '#000', fgMuted: '#888', fgSubtle: '#bbb', border: '#ddd', borderMuted: '#eee', accent: '#f00', danger: '#c00' },
		config: {
			speakerGardenLabels: true,
			dashboardToggle: false,
			codeColorMode: false,
			scaleToVisibleData: false,
			wordToSearch: '',
			...overrides
		}
	} as unknown as DrawContext;

	return { ctx, rec, bounds: { x: 0, y: 0, ...bounds } };
}

function wordsFor(speaker: string, count: number, turns: number): DataPoint[] {
	return Array.from({ length: count }, (_, i) => ({
		speaker,
		word: 'w',
		turnNumber: i % turns,
		codes: [],
		startTime: i
	})) as unknown as DataPoint[];
}

const garden = (speakers: string[], counts: number[], turns: number[]) => {
	const data: Record<string, DataPoint[]> = {};
	speakers.forEach((s, i) => (data[s] = wordsFor(s, counts[i], turns[i])));
	return data;
};

describe('SpeakerGarden rendering', () => {
	const speakers = ['Ben', 'Claude', 'Agent:general-purpose:a2b12912'];
	const data = () => garden(speakers, [500, 5000, 80], [10, 59, 4]);

	it('names every flower at the baseline', () => {
		const { ctx, rec, bounds } = makeCtx(speakers, { width: 1200, height: 600 });
		new SpeakerGarden(ctx, bounds).draw(data());

		expect(rec.texts).toContain('Ben');
		expect(rec.texts).toContain('Claude');
	});

	it('middle-truncates a label too long for its column', () => {
		// 25 actors on a 1200px canvas leaves ~46px per column, well under the
		// width of a delegated agent's name.
		const many = [...Array.from({ length: 24 }, (_, i) => `Actor${i}`), 'Agent:general-purpose:a2b12912'];
		const { ctx, rec, bounds } = makeCtx(many, { width: 1200, height: 600 });
		new SpeakerGarden(ctx, bounds).draw(
			garden(
				many,
				many.map(() => 100),
				many.map(() => 3)
			)
		);

		const agentLabel = rec.texts.find((t) => t.includes('…'));
		expect(agentLabel).toBeDefined();
		expect(agentLabel!.startsWith('A')).toBe(true);
	});

	it('draws no labels when the toggle is off', () => {
		const { ctx, rec, bounds } = makeCtx(speakers, { width: 1200, height: 600 }, 'ai', { speakerGardenLabels: false });
		new SpeakerGarden(ctx, bounds).draw(data());

		expect(rec.texts).not.toContain('Ben');
		expect(rec.texts).not.toContain('Claude');
	});

	it('keeps push and pop balanced, so the canvas transform does not drift', () => {
		const { ctx, rec, bounds } = makeCtx(speakers, { width: 1200, height: 600 });
		new SpeakerGarden(ctx, bounds).draw(data());

		expect(rec.pushes).toBe(rec.pops);
	});

	it('survives a panel shorter than the label strip it reserves', () => {
		// A dashboard tile is a fraction of the canvas; 40px is below the 58px strip.
		const { ctx, bounds } = makeCtx(speakers, { width: 400, height: 40 });
		expect(() => new SpeakerGarden(ctx, bounds).draw(data())).not.toThrow();
	});

	it('survives a zero-height panel', () => {
		const { ctx, bounds } = makeCtx(speakers, { width: 400, height: 0 });
		expect(() => new SpeakerGarden(ctx, bounds).draw(data())).not.toThrow();
	});

	it('survives a very narrow panel with many speakers', () => {
		const many = Array.from({ length: 25 }, (_, i) => `Actor${i}`);
		const { ctx, bounds } = makeCtx(many, { width: 300, height: 300 });
		expect(() =>
			new SpeakerGarden(ctx, bounds).draw(
				garden(
					many,
					many.map(() => 100),
					many.map(() => 3)
				)
			)
		).not.toThrow();
	});

	it('survives an empty transcript', () => {
		const { ctx, bounds } = makeCtx([], { width: 1200, height: 600 });
		expect(() => new SpeakerGarden(ctx, bounds).draw({})).not.toThrow();
	});

	it('survives scaleToVisibleData before any maxima are known', () => {
		const { ctx, bounds } = makeCtx(speakers, { width: 1200, height: 600 }, 'ai', { scaleToVisibleData: true });
		expect(() => new SpeakerGarden(ctx, bounds).draw(data())).not.toThrow();
	});

	it('drops labels rather than eating a small dashboard tile', () => {
		// A 3-panel dashboard tile is roughly this tall; a fixed 58px strip
		// would take a third of it.
		const { ctx, rec, bounds } = makeCtx(speakers, { width: 1200, height: 130 });
		new SpeakerGarden(ctx, bounds).draw(data());

		expect(rec.texts).not.toContain('Ben');
	});

	it('scales the strip to the panel rather than using a fixed height', () => {
		const full = makeCtx(speakers, { width: 1200, height: 600 });
		const fullGarden = new SpeakerGarden(full.ctx, full.bounds);

		const tile = makeCtx(speakers, { width: 1200, height: 260 });
		const tileGarden = new SpeakerGarden(tile.ctx, tile.bounds);

		const fullStrip = full.bounds.y + 600 - fullGarden.yPosBottom;
		const tileStrip = tile.bounds.y + 260 - tileGarden.yPosBottom;
		expect(tileStrip).toBeGreaterThan(0);
		expect(tileStrip).toBeLessThan(fullStrip);
		// The strip never takes more than its share of the panel.
		expect(tileStrip / 260).toBeLessThanOrEqual(0.18 + 1e-9);
	});

	it('keeps every bloom inside the plotting area, above the label strip', () => {
		const { ctx, bounds } = makeCtx(speakers, { width: 1200, height: 600 });
		const g = new SpeakerGarden(ctx, bounds);
		g.draw(data());

		// The baseline must leave room for the strip and stay below the top.
		expect(g.yPosBottom).toBeLessThan(bounds.y + 600);
		expect(g.yPosBottom).toBeGreaterThan(g.yPosTop);
	});
});
