/**
 * The Question Flow drew a `?` inside every node, which carries nothing in a
 * view where every mark is already a question, and gave a full lane to every
 * actor even though tools never raise questions — roughly half the rows in the
 * agentic examples.
 *
 * These cover the two changes that follow: shape now encodes what kind of
 * questioning move a node is, and non-participating lanes collapse into a
 * stated count. Human transcripts must keep their existing rendering.
 */

import { describe, expect, it } from 'vitest';
import { QuestionFlow } from '../src/lib/draw/question-flow';
import { classifyQuestion, kindsPresent } from '../src/lib/draw/question-type';
import type { DrawContext } from '../src/lib/draw/draw-context';
import type { QuestionAnswerPair } from '../src/lib/core/dynamic-data';
import type { SpeakerRole } from '../src/models/user';

const BOUNDS = { x: 0, y: 0, width: 1000, height: 400 };

interface Recorder {
	texts: string[];
	ellipses: number;
	rects: number;
	triangles: number;
	noFillCalls: number;
}

function makeCtx(speakers: { name: string; role?: SpeakerRole }[], sourceKind: string, overrides: Record<string, unknown> = {}) {
	const rec: Recorder = { texts: [], ellipses: 0, rects: 0, triangles: 0, noFillCalls: 0 };
	const users = speakers.map((s) => ({ name: s.name, enabled: true, color: '#0072B2', role: s.role }));

	const sk = {
		CENTER: 'center',
		LEFT: 'left',
		RIGHT: 'right',
		TOP: 'top',
		mouseX: -999,
		mouseY: -999,
		drawingContext: { globalAlpha: 1 },
		fill: () => {},
		noFill: () => {
			rec.noFillCalls++;
		},
		noStroke: () => {},
		stroke: () => {},
		strokeWeight: () => {},
		textAlign: () => {},
		textSize: () => {},
		text: (s: string) => rec.texts.push(String(s)),
		textWidth: (s: string) => String(s).length * 6,
		line: () => {},
		bezier: () => {},
		ellipse: () => {
			rec.ellipses++;
		},
		rect: () => {
			rec.rects++;
		},
		triangle: () => {
			rec.triangles++;
		},
		push: () => {},
		pop: () => {},
		translate: () => {},
		rotate: () => {},
		color: () => ({ setAlpha: () => {} }),
		dist: () => 9999,
		overRect: () => false
	};

	const ctx = {
		sk,
		users,
		userMap: new Map(users.map((u) => [u.name, u])),
		codeColorMap: new Map(),
		hover: {},
		transcript: { sourceKind, largestTurnLength: 100 },
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
			questionFlowHideAbsent: true,
			questionFlowTypeMarks: true,
			dashboardToggle: false,
			codeColorMode: false,
			scaleToVisibleData: true,
			wordToSearch: '',
			...overrides
		}
	} as unknown as DrawContext;

	return { ctx, rec };
}

function pair(questionSpeaker: string, startTime: number, answerSpeaker: string | null = null): QuestionAnswerPair {
	return {
		questionTurn: 1,
		questionSpeaker,
		questionFirstWord: { codes: [], startTime },
		questionContent: 'what should we do?',
		answerTurn: answerSpeaker ? 2 : null,
		answerSpeaker,
		answerFirstWord: answerSpeaker ? { codes: [], startTime: startTime + 5 } : null,
		answerContent: answerSpeaker ? 'we should do this' : null,
		startTime
	} as unknown as QuestionAnswerPair;
}

describe('classifyQuestion', () => {
	it('calls everything conversational in a human transcript', () => {
		expect(classifyQuestion('Tool:AskUserQuestion', 'tool', false)).toBe('conversational');
		expect(classifyQuestion('Agent:general-purpose:abc', 'agent', false)).toBe('conversational');
	});

	it('reads a tool question as a structured elicitation', () => {
		expect(classifyQuestion('Tool:AskUserQuestion', 'tool', true)).toBe('elicitation');
	});

	it('reads a delegated agent as inter-agent', () => {
		expect(classifyQuestion('Agent:general-purpose:a2b12912', 'assistant', true)).toBe('inter-agent');
		expect(classifyQuestion('someone', 'agent', true)).toBe('inter-agent');
	});

	it('leaves the person and the primary AI conversational', () => {
		expect(classifyQuestion('Ben', 'user', true)).toBe('conversational');
		expect(classifyQuestion('Claude', 'assistant', true)).toBe('conversational');
	});

	it('orders kinds stably for the legend and drops absent ones', () => {
		expect(kindsPresent(['inter-agent', 'conversational', 'inter-agent'])).toEqual(['conversational', 'inter-agent']);
	});
});

describe('QuestionFlow rendering', () => {
	const aiSpeakers = [
		{ name: 'Ben', role: 'user' as SpeakerRole },
		{ name: 'Claude', role: 'assistant' as SpeakerRole },
		{ name: 'Tool:AskUserQuestion', role: 'tool' as SpeakerRole },
		{ name: 'Tool:Read', role: 'tool' as SpeakerRole },
		{ name: 'Tool:Bash', role: 'tool' as SpeakerRole }
	];

	it('gives a lane to actors that ask or answer, and no others', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		expect(rec.texts).toContain('Ben');
		expect(rec.texts).toContain('Claude');
		expect(rec.texts).not.toContain('Tool:Read');
		expect(rec.texts).not.toContain('Tool:Bash');
	});

	it('states the trimmed count rather than drawing empty rows', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		expect(rec.texts.some((t) => t.includes('3 actors neither asked nor answered'))).toBe(true);
	});

	it('keeps every lane when hiding is turned off', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai', { questionFlowHideAbsent: false });
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		for (const s of aiSpeakers) expect(rec.texts).toContain(s.name);
	});

	it('draws a square for a structured elicitation and a triangle for an inter-agent question', () => {
		// Arrowheads and the absent-row background are drawn either way, so the
		// two renders are compared and the constants cancel.
		const speakers = [...aiSpeakers, { name: 'Agent:general-purpose:abc', role: 'assistant' as SpeakerRole }];
		const pairs = [pair('Tool:AskUserQuestion', 10, 'Ben'), pair('Agent:general-purpose:abc', 40, 'Claude')];

		const on = makeCtx(speakers, 'ai');
		new QuestionFlow(on.ctx, BOUNDS).draw(pairs);

		const off = makeCtx(speakers, 'ai', { questionFlowTypeMarks: false });
		new QuestionFlow(off.ctx, BOUNDS).draw(pairs);

		expect(on.rec.rects - off.rec.rects).toBeGreaterThanOrEqual(1);
		expect(on.rec.triangles - off.rec.triangles).toBeGreaterThanOrEqual(1);
	});

	it('retires the question mark when type marks are on', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		expect(rec.texts).not.toContain('?');
	});

	it('draws answers as rings so they stay distinct from questions', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		expect(rec.noFillCalls).toBeGreaterThan(0);
	});

	it('leaves a human transcript exactly as it was', () => {
		const humans = [{ name: 'Ada' }, { name: 'Grace' }];
		const { ctx, rec } = makeCtx(humans, 'human');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ada', 10, 'Grace')]);

		expect(rec.texts).toContain('?');
		expect(rec.texts).not.toContain('Structured elicitation');
	});

	it('restores the question mark when the toggle is off', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai', { questionFlowTypeMarks: false });
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		expect(rec.texts).toContain('?');
		expect(rec.texts).not.toContain('Structured elicitation');
	});

	it('does not draw a legend when only one kind is present', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude')]);

		expect(rec.texts).not.toContain('Structured elicitation');
	});

	it('draws a legend once more than one kind is on screen', () => {
		const { ctx, rec } = makeCtx(aiSpeakers, 'ai');
		new QuestionFlow(ctx, BOUNDS).draw([pair('Ben', 10, 'Claude'), pair('Tool:AskUserQuestion', 40, 'Ben')]);

		expect(rec.texts).toContain('Conversational');
		expect(rec.texts).toContain('Structured elicitation');
	});
});
