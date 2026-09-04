/**
 * Guards for the figure-capture scale lock.
 *
 * The load-bearing test is the first one: `LOCKED_SCALES` is a hand-copied
 * measurement, and every scale in the app runs to its domain max. A locked
 * value that drifts below a real transcript's spread clamps the top of that
 * transcript's scale and shows up as flat-topped bubbles or identically sized
 * blooms — visible only if you already suspected it. Re-measuring here means
 * editing the example CSVs fails the suite instead.
 */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';
import { LOCKED_SCALES, LOCKED_ACTOR_COUNT, applyScaleLock, isScaleLockEnabled, lockedActorCount } from '../src/lib/core/scale-lock';
import { groupsPresent, ACTOR_GROUP_ORDER } from '../src/lib/draw/actor-groups';
import { Transcript } from '../src/models/transcript';

/** The sessions the lock was measured across. */
const LOCKED_EXAMPLES = ['web-design-chat', 'web-design-tools', 'web-design-multi-agent'];

/** Mirrors the Papa configuration the app uses when importing a CSV. */
function load(id: string) {
	const rows = Papa.parse(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'), {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
	return createTranscriptFromParsedText(parseCSVRows(rows));
}

/** Stands in for a `?lockScales` page load. */
function withSearch(search: string, run: () => void) {
	(globalThis as { window?: unknown }).window = { location: { search } };
	try {
		run();
	} finally {
		delete (globalThis as { window?: unknown }).window;
	}
}

afterEach(() => {
	delete (globalThis as { window?: unknown }).window;
});

describe('the locked domain covers the sessions it was measured from', () => {
	const transcripts = LOCKED_EXAMPLES.map((id) => load(id).transcript);

	// Every driver except duration; `totalTimeInSeconds` is re-derived from the
	// word array on apply, so it is checked against the real spans separately.
	const drivers = ['largestTurnLength', 'largestNumOfWordsByASpeaker', 'largestNumOfTurnsByASpeaker', 'maxCountOfMostRepeatedWord'] as const;

	for (const driver of drivers) {
		it(`${driver} is the maximum across the three sessions, so nothing clips`, () => {
			expect(LOCKED_SCALES[driver]).toBe(Math.max(...transcripts.map((t) => t[driver])));
		});
	}

	it('spans at least the longest session', () => {
		expect(LOCKED_SCALES.totalTimeInSeconds).toBeGreaterThanOrEqual(Math.max(...transcripts.map((t) => Math.round(t.totalTimeInSeconds))));
	});

	it('counts the largest cast, so no garden is squeezed below its own column', () => {
		expect(LOCKED_ACTOR_COUNT).toBe(Math.max(...LOCKED_EXAMPLES.map((id) => load(id).users.length)));
	});
});

describe('the lock is off unless asked for', () => {
	it('is off with no query string', () => {
		withSearch('', () => expect(isScaleLockEnabled()).toBe(false));
	});

	it('is off during server-side rendering, where there is no window', () => {
		expect(isScaleLockEnabled()).toBe(false);
	});

	it('leaves a transcript untouched and reports no timeline override', () => {
		const { transcript } = load('web-design-chat');
		const before = transcript.largestTurnLength;
		withSearch('', () => {
			expect(applyScaleLock(transcript)).toBeUndefined();
			expect(transcript.largestTurnLength).toBe(before);
		});
	});

	it('leaves the cast size to the transcript', () => {
		withSearch('', () => expect(lockedActorCount()).toBeUndefined());
	});
});

describe('the lock replaces every driver when asked for', () => {
	it('pins all five and hands back the timeline end', () => {
		const transcript = new Transcript();
		transcript.largestTurnLength = 12;
		transcript.largestNumOfWordsByASpeaker = 34;
		transcript.largestNumOfTurnsByASpeaker = 5;
		transcript.maxCountOfMostRepeatedWord = 7;
		transcript.totalTimeInSeconds = 90;

		withSearch('?lockScales', () => {
			expect(applyScaleLock(transcript)).toBe(LOCKED_SCALES.totalTimeInSeconds);
		});

		expect(transcript).toMatchObject(LOCKED_SCALES);
	});

	it('applies to every session identically, which is the point', () => {
		withSearch('?lockScales', () => {
			for (const id of LOCKED_EXAMPLES) {
				const { transcript } = load(id);
				applyScaleLock(transcript);
				expect(transcript).toMatchObject(LOCKED_SCALES);
			}
		});
	});

	it('reports the pinned cast size', () => {
		withSearch('?lockScales', () => expect(lockedActorCount()).toBe(LOCKED_ACTOR_COUNT));
	});
});

describe('locked actor grouping fixes the lane count', () => {
	it('keeps all four groups regardless of who is present', () => {
		const chat = groupsPresent(['Person', 'Claude'], new Map(), true);
		expect(chat).toEqual([...ACTOR_GROUP_ORDER]);
		expect(groupsPresent([], new Map(), true)).toEqual(chat);
	});

	it('still drops empty groups by default', () => {
		expect(groupsPresent(['Person'], new Map())).toEqual(['person']);
	});
});
