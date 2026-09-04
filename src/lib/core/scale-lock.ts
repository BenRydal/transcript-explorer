/**
 * Pins every visualization's data domain to one fixed set of maxima, so figures
 * captured from different transcripts can be read against each other.
 *
 * Each viz normally scales to its own transcript: bubble height runs to that
 * file's longest turn, bloom radius to its wordiest speaker, cloud text size to
 * its most repeated word. That is the right default — it spends the full pixel
 * range on the data in front of you — but it makes two screenshots
 * incomparable. A 3,476-word turn fills the lane in `web-design-chat` and
 * reaches half height in `web-design-multi-agent`, and nothing on either image
 * says so.
 *
 * The lock is opt-in via `?lockScales`, not a change to
 * `calculateTranscriptStats`, because the per-file domain is what the app should
 * do when nobody is assembling a figure. It is a capture aid, not a setting.
 */

import type { Transcript } from '../../models/transcript';

/**
 * The pinned domain: the largest value each driver takes across the three
 * `web-design-*` sessions, which `web-design-multi-agent` holds in every case.
 *
 * Taking the maximum rather than a round number is what keeps the lock lossless
 * — every scale in the app runs to its domain max without clipping, so the
 * busiest dataset still renders exactly as it does unlocked, and the quieter two
 * shrink to their true share of it.
 *
 * These are data, not thresholds. Re-measure them when the example CSVs change:
 * a locked domain smaller than a transcript's real spread silently clamps the
 * top of that transcript's scale.
 */
export const LOCKED_SCALES = {
	/** Turn chart bubble height, question flow. */
	largestTurnLength: 6465,
	/** Speaker garden bloom radius. */
	largestNumOfWordsByASpeaker: 52478,
	/** Speaker garden stem height. */
	largestNumOfTurnsByASpeaker: 59,
	/** Word rain and contribution cloud text size. */
	maxCountOfMostRepeatedWord: 2319,
	/** Timeline span, and the heatmap's bin range. */
	totalTimeInSeconds: 2607
} as const;

/**
 * Actors in the most crowded of the three sessions.
 *
 * Pinning the domain is only half of a shared scale. The speaker garden spends
 * its bloom range inside one speaker's column, and a column is
 * `panelWidth / (actors + 1)` — so the pixels-per-word move with the size of the
 * cast even when the domain is fixed. `web-design-chat` seats two actors against
 * `web-design-multi-agent`'s 25, which drew Claude's 16k words at roughly nine
 * times the scale `Tool:Read`'s 52k got: the wordiest speaker in the corpus came
 * out the smallest bloom in the set. Fixing the divisor gives all three gardens
 * one ruler.
 *
 * This sits outside `LOCKED_SCALES` because that object is exactly the set of
 * fields `applyScaleLock` writes onto a transcript, and the size of the cast is
 * not one of them. Like the values above it is a measurement: re-take it when
 * the example CSVs change.
 */
export const LOCKED_ACTOR_COUNT = 25;

/**
 * Enlarges every locked bloom together.
 *
 * A 25-actor column is 54px on a 1400px panel, and petals reach about half a
 * radius, so pinning the divisor leaves the whole set drawing at a size that is
 * honest but hard to see. This multiplies the bloom scale — floor and ceiling
 * alike, in every session — so the figures grow without any of them moving
 * relative to the others.
 *
 * What it spends is horizontal room. At 1.0 the largest bloom is already about
 * as wide as the gap between stems, so anything above that overlaps its
 * neighbours in the crowded session; the quieter two have room to spare either
 * way. Blooms sit at the height their turn count puts them, so the overlap reads
 * as a dense bed rather than a collision. Raise it for a bigger figure, lower it
 * toward 1 to pull the multi-agent garden apart.
 */
export const LOCKED_BLOOM_GAIN = 2;

/** Whether this page load asked for the locked domain. */
export function isScaleLockEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	return new URLSearchParams(window.location.search).has('lockScales');
}

/**
 * The cast size layouts should scale against, or `undefined` when the lock is
 * off and they should use the transcript's own.
 */
export function lockedActorCount(): number | undefined {
	return isScaleLockEnabled() ? LOCKED_ACTOR_COUNT : undefined;
}

/**
 * Overwrites a transcript's scaling maxima with the pinned domain, and reports
 * the timeline end that goes with them.
 *
 * `totalTimeInSeconds` is part of the lock rather than only the timeline window,
 * since the heatmap bins against the transcript's own duration
 * (`speaker-heatmap.ts:338`) and would otherwise keep a per-file x-axis while
 * every other view moved to the shared one. The cost is that the data panel
 * reports the locked span instead of the real one for the duration of the
 * capture.
 *
 * Returns `undefined` when the lock is off, so the caller's existing
 * `timelineEndOverride` is left alone.
 */
export function applyScaleLock(transcript: Transcript): number | undefined {
	if (!isScaleLockEnabled()) return undefined;

	transcript.largestTurnLength = LOCKED_SCALES.largestTurnLength;
	transcript.largestNumOfWordsByASpeaker = LOCKED_SCALES.largestNumOfWordsByASpeaker;
	transcript.largestNumOfTurnsByASpeaker = LOCKED_SCALES.largestNumOfTurnsByASpeaker;
	transcript.maxCountOfMostRepeatedWord = LOCKED_SCALES.maxCountOfMostRepeatedWord;
	transcript.totalTimeInSeconds = LOCKED_SCALES.totalTimeInSeconds;

	return LOCKED_SCALES.totalTimeInSeconds;
}
