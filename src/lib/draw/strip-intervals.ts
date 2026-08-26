/**
 * What the strips under the turn chart should report.
 *
 * Both rows were computed pairwise over turns sorted by start time, which is
 * only sound when turns never overlap. A human conversation mostly satisfies
 * that. An agentic session does not -- the bundled multi-agent transcript runs
 * concurrent about a quarter of its length -- and the consequences were wrong
 * in both directions: a gap was measured as `next.start - previous.end`, which
 * goes negative between overlapping turns and silently skips real silence, and
 * an overlap was emitted once per PAIR of speakers, so five concurrent actors
 * drew ten stacked bars.
 *
 * Both are sweeps over intervals rather than comparisons between neighbours.
 */

export interface Span {
	start: number;
	end: number;
}

export interface ActorSpan extends Span {
	speaker: string;
}

/** Spans where at least one actor is active, merged. */
export function mergeSpans(spans: readonly Span[]): Span[] {
	const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
	const merged: Span[] = [];
	for (const span of sorted) {
		const last = merged[merged.length - 1];
		if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
		else merged.push({ start: span.start, end: span.end });
	}
	return merged;
}

/**
 * Spans where nobody is active, between `from` and `to`.
 *
 * The complement of the merged activity, which is what silence actually means.
 * Anything shorter than `minDuration` is dropped: a sub-second seam between two
 * rows is a rounding artefact of how the converter times them, not a pause.
 */
export function silentGaps(spans: readonly Span[], from: number, to: number, minDuration = 0): Span[] {
	if (!(to > from)) return [];
	const merged = mergeSpans(spans);
	const gaps: Span[] = [];
	let cursor = from;

	for (const span of merged) {
		if (span.start > cursor) gaps.push({ start: cursor, end: Math.min(span.start, to) });
		cursor = Math.max(cursor, span.end);
		if (cursor >= to) break;
	}
	if (cursor < to) gaps.push({ start: cursor, end: to });

	return gaps.filter((g) => g.end - g.start > minDuration && g.end > g.start);
}

/**
 * Spans where at least `minConcurrent` DISTINCT actors are active at once.
 *
 * One span per stretch rather than one per pair, so the row reads as "this is
 * when work was happening in parallel" instead of as a pile of rectangles
 * whose count is quadratic in how busy the moment was.
 */
export function concurrentSpans(spans: readonly ActorSpan[], minConcurrent = 2, minDuration = 0): (Span & { peak: number })[] {
	const events: { at: number; delta: number; speaker: string }[] = [];
	for (const span of spans) {
		if (span.end <= span.start) continue;
		events.push({ at: span.start, delta: 1, speaker: span.speaker });
		events.push({ at: span.end, delta: -1, speaker: span.speaker });
	}
	// Ends before starts at the same instant, so two rows that merely touch do
	// not read as a moment of concurrency.
	events.sort((a, b) => a.at - b.at || a.delta - b.delta);

	const active = new Map<string, number>();
	const out: (Span & { peak: number })[] = [];
	let open: (Span & { peak: number }) | null = null;

	for (const event of events) {
		const count = (active.get(event.speaker) ?? 0) + event.delta;
		if (count <= 0) active.delete(event.speaker);
		else active.set(event.speaker, count);

		const distinct = active.size;
		if (distinct >= minConcurrent) {
			if (!open) open = { start: event.at, end: event.at, peak: distinct };
			else open.peak = Math.max(open.peak, distinct);
		} else if (open) {
			open.end = event.at;
			out.push(open);
			open = null;
		}
	}

	return out.filter((s) => s.end - s.start > minDuration && s.end > s.start);
}
