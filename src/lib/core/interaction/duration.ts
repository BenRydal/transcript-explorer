import { computed, inferred, type Tagged } from '../../../models/interaction/tagged';

/**
 * Duration derivations for interaction events.
 *
 * Two flavours of derivation live here:
 *   - `computed`  — exact deltas between observed timestamps.
 *   - `inferred`  — heuristic estimates (idle time) that are fully parameterized
 *                   so every estimate is auditable from its recorded params.
 */

function deltaMs(fromIso: string, toIso: string): number {
	return new Date(toIso).getTime() - new Date(fromIso).getTime();
}

/**
 * Duration of an event derived from the gap to the next adjacent event.
 * Null when there is no next event (`nextIso === null`).
 */
export function computeAdjacentDurationMs(
	thisIso: string,
	nextIso: string | null
): Tagged<number | null> {
	const formula = 'duration_adjacent_v1';
	if (nextIso === null) {
		return computed(null, formula, undefined, {
			thisIso,
			nextIso: null,
			reason: 'no_next_event'
		});
	}
	return computed(deltaMs(thisIso, nextIso), formula, undefined, {
		thisIso,
		nextIso
	});
}

/**
 * Duration of a tool invocation derived from the call → result timestamp pair.
 */
export function pairToolDurationMs(
	callIso: string,
	resultIso: string
): Tagged<number | null> {
	const formula = 'duration_tool_pair_v1';
	return computed(deltaMs(callIso, resultIso), formula, undefined, {
		callIso,
		resultIso
	});
}

export interface IdleOpts {
	/** Gaps shorter than this (seconds) are not considered idle at all. */
	thresholdS?: number;
	/** Estimated reading speed, ms per character of the PRECEDING content. */
	avgReadMsPerChar?: number;
	/** Estimated typing speed, ms per character of the NEXT content. */
	avgTypeMsPerChar?: number;
	/** Char count of the preceding content (what the user was reading). */
	precedingChars?: number;
	/** Char count of the next content (what the user typed). */
	nextChars?: number;
}

const IDLE_DEFAULTS: Required<IdleOpts> = {
	thresholdS: 30,
	avgReadMsPerChar: 20, // ~50 chars/sec reading (placeholder, auditable)
	avgTypeMsPerChar: 50, // ~20 chars/sec typing (placeholder, auditable)
	precedingChars: 0,
	nextChars: 0
};

/**
 * Estimate genuine idle (user away / thinking) time inside a wall-clock gap.
 *
 * Heuristic: subtract an estimated reading allowance (preceding content) and an
 * estimated typing allowance (next content) from the raw gap. If the gap is
 * below `thresholdS` the result is `null` (we don't treat short gaps as idle).
 * The estimate is clamped at 0. All rates/params are recorded so the inference
 * is fully auditable.
 */
export function inferIdleMs(
	gapMs: number,
	opts: IdleOpts = {}
): Tagged<number | null> {
	const formula = 'idle_v1';
	const p = { ...IDLE_DEFAULTS, ...opts };

	const thresholdMs = p.thresholdS * 1000;

	if (gapMs <= thresholdMs) {
		return inferred(null, formula, {
			...p,
			gapMs,
			thresholdMs,
			reason: 'gap_below_threshold'
		});
	}

	const readMs = p.precedingChars * p.avgReadMsPerChar;
	const typeMs = p.nextChars * p.avgTypeMsPerChar;
	const idleMs = Math.max(0, gapMs - readMs - typeMs);

	return inferred(idleMs, formula, {
		...p,
		gapMs,
		thresholdMs,
		estReadMs: readMs,
		estTypeMs: typeMs
	});
}
