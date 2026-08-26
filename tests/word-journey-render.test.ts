/**
 * Exercises WordJourney.draw against a recording stub, which covers the glue
 * the pure layout tests cannot: that lanes are trimmed, the trimmed count is
 * reported, and coincident marks arrive as one mark carrying a count rather
 * than as a row of overlapping dots.
 */

import { describe, expect, it } from 'vitest';
import { WordJourney } from '../src/lib/draw/word-journey';
import type { DrawContext } from '../src/lib/draw/draw-context';
import type { WordOccurrence } from '../src/lib/core/dynamic-data';

const BOUNDS = { x: 0, y: 0, width: 1000, height: 400 };

interface Recorder {
	texts: string[];
	ellipses: { x: number; y: number; w: number }[];
	lines: { x1: number; y1: number; x2: number; y2: number }[];
	stars: number;
	diamonds: number;
}

function makeStub() {
	const rec: Recorder = { texts: [], ellipses: [], lines: [], stars: 0, diamonds: 0 };

	const sk = {
		TWO_PI: Math.PI * 2,
		HALF_PI: Math.PI / 2,
		CENTER: 'center',
		LEFT: 'left',
		RIGHT: 'right',
		TOP: 'top',
		CLOSE: 'close',
		mouseX: -999,
		mouseY: -999,
		drawingContext: { globalAlpha: 1 },
		fill: () => {},
		noStroke: () => {},
		stroke: () => {},
		strokeWeight: () => {},
		textAlign: () => {},
		textStyle: () => {},
		BOLD: 'bold',
		NORMAL: 'normal',
		textSize: () => {},
		text: (s: string) => rec.texts.push(String(s)),
		textWidth: (s: string) => String(s).length * 6,
		line: (x1: number, y1: number, x2: number, y2: number) => rec.lines.push({ x1, y1, x2, y2 }),
		ellipse: (x: number, y: number, w: number) => rec.ellipses.push({ x, y, w }),
		rect: () => {},
		push: () => {},
		pop: () => {},
		quad: () => {
			rec.diamonds++;
		},
		beginShape: () => {
			rec.stars++;
		},
		vertex: () => {},
		endShape: () => {},
		color: () => ({ setAlpha: () => {} }),
		dist: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1),
		overRect: () => false,
		cos: Math.cos,
		sin: Math.sin
	};

	return { sk, rec };
}

function makeCtx(speakers: string[], overrides: Record<string, unknown> = {}) {
	const { sk, rec } = makeStub();
	const users = speakers.map((name) => ({ name, enabled: true, color: '#0072B2' }));

	const ctx = {
		sk,
		users,
		userMap: new Map(users.map((u) => [u.name, u])),
		codeColorMap: new Map(),
		hover: {},
		transcript: { sourceKind: 'ai' },
		timeline: { leftMarker: 0, rightMarker: 100 },
		theme: {
			bg: '#ffffff',
			fg: '#000000',
			fgMuted: '#888888',
			fgSubtle: '#bbbbbb',
			border: '#dddddd',
			borderMuted: '#eeeeee',
			accent: '#ff0000',
			danger: '#cc0000'
		},
		config: {
			wordJourneyHideAbsent: true,
			wordJourneyLaneOrder: 'uptake',
			dashboardToggle: false,
			codeColorMode: false,
			...overrides
		}
	} as unknown as DrawContext;

	return { ctx, rec };
}

function occ(speaker: string, startTime: number, turnNumber: number, flags: Partial<WordOccurrence> = {}): WordOccurrence {
	return {
		speaker,
		turnNumber,
		startTime,
		dataPoint: { codes: [] },
		isFirst: false,
		isFirstBySpeaker: false,
		matchedWord: 'ethic',
		turnContent: 'a turn mentioning ethic',
		...flags
	} as WordOccurrence;
}

describe('WordJourney rendering', () => {
	const speakers = ['Ben', 'Claude', 'Tool:Read', 'Tool:Bash', 'Tool:Skill'];

	it('draws a lane only for actors that carry the word', () => {
		const { ctx, rec } = makeCtx(speakers);
		new WordJourney(ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Ben', 10, 1, { isFirst: true, isFirstBySpeaker: true }), occ('Claude', 20, 2, { isFirstBySpeaker: true })]
		});

		expect(rec.texts).toContain('Ben');
		expect(rec.texts).toContain('Claude');
		expect(rec.texts).not.toContain('Tool:Read');
		expect(rec.texts).not.toContain('Tool:Skill');
	});

	it('states how many actors were trimmed rather than leaving a silent gap', () => {
		const { ctx, rec } = makeCtx(speakers);
		new WordJourney(ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Ben', 10, 1, { isFirst: true, isFirstBySpeaker: true })]
		});

		expect(rec.texts.some((t) => t.includes('4 never used "ethic"'))).toBe(true);
	});

	it('reports carriage in the title', () => {
		const { ctx, rec } = makeCtx(speakers);
		new WordJourney(ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Ben', 10, 1, { isFirst: true, isFirstBySpeaker: true }), occ('Claude', 20, 2, { isFirstBySpeaker: true })]
		});

		expect(rec.texts.some((t) => t.includes('carried by 2 of 5 actors'))).toBe(true);
	});

	it('keeps every lane when hiding is turned off', () => {
		const { ctx, rec } = makeCtx(speakers, { wordJourneyHideAbsent: false });
		new WordJourney(ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Ben', 10, 1, { isFirst: true, isFirstBySpeaker: true })]
		});

		for (const speaker of speakers) expect(rec.texts).toContain(speaker);
	});

	it('merges coincident marks into one mark carrying the count', () => {
		const { ctx, rec } = makeCtx(['Claude']);
		// Three occurrences inside a fraction of a second on a 100s timeline.
		new WordJourney(ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Claude', 50.0, 1, { isFirst: true, isFirstBySpeaker: true }), occ('Claude', 50.05, 2), occ('Claude', 50.1, 3)]
		});

		// The first occurrence renders as a star, and all three collapse into it.
		expect(rec.stars).toBe(1);
		expect(rec.ellipses).toHaveLength(0);
		expect(rec.texts).toContain('3');
	});

	it('keeps well-separated marks distinct', () => {
		const { ctx, rec } = makeCtx(['Claude']);
		new WordJourney(ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Claude', 10, 1, { isFirst: true, isFirstBySpeaker: true }), occ('Claude', 50, 2), occ('Claude', 90, 3)]
		});

		expect(rec.stars).toBe(1);
		expect(rec.ellipses).toHaveLength(2);
		expect(rec.texts).not.toContain('3');
	});

	it('draws one thread leg per consecutive pair', () => {
		// Both renders show the same two lanes and the same absent count, so the
		// lane lines and axis ticks cancel and the difference is the thread.
		const two = makeCtx(['Ben', 'Claude'], { wordJourneyHideAbsent: false });
		new WordJourney(two.ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Ben', 10, 1, { isFirst: true, isFirstBySpeaker: true }), occ('Claude', 50, 2, { isFirstBySpeaker: true })]
		});

		const three = makeCtx(['Ben', 'Claude'], { wordJourneyHideAbsent: false });
		new WordJourney(three.ctx, BOUNDS).draw({
			word: 'ethic',
			occurrences: [occ('Ben', 10, 1, { isFirst: true, isFirstBySpeaker: true }), occ('Claude', 50, 2, { isFirstBySpeaker: true }), occ('Ben', 90, 3)]
		});

		expect(three.rec.lines.length - two.rec.lines.length).toBe(1);
	});

	it('falls back to a message when the word is absent entirely', () => {
		const { ctx, rec } = makeCtx(speakers);
		new WordJourney(ctx, BOUNDS).draw({ word: 'ethic', occurrences: [] });

		expect(rec.texts.some((t) => t.includes('No occurrences'))).toBe(true);
		expect(rec.ellipses).toHaveLength(0);
	});

	it('does not divide by zero on a collapsed timeline', () => {
		const { ctx } = makeCtx(['Claude']);
		(ctx.timeline as { leftMarker: number; rightMarker: number }).rightMarker = 0;

		expect(() =>
			new WordJourney(ctx, BOUNDS).draw({
				word: 'ethic',
				occurrences: [occ('Claude', 0, 1, { isFirst: true, isFirstBySpeaker: true })]
			})
		).not.toThrow();
	});
});
