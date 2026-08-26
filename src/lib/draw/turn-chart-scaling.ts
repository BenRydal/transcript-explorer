/**
 * Bubble sizing for the turn chart.
 *
 * Bubble height encodes turn length. Mapping it linearly against the longest
 * turn assumes turn lengths are broadly comparable, which holds for human
 * conversation and fails badly for a human-AI session: a model turn runs to
 * thousands of words while the prompt that produced it runs to a dozen, so
 * every human turn collapses to a sub-pixel sliver that cannot be seen, let
 * alone hovered.
 *
 * AI transcripts take the square root instead, so a bubble's *area* tracks turn
 * length rather than its diameter — which is how size is actually read.
 * `turn-network.ts` makes the same choice for the same reason. Human
 * transcripts keep the linear map, since their distribution doesn't have this
 * problem and changing it would redraw existing work.
 *
 * The scale runs to the longest turn either way, so nothing is clipped or
 * clamped and height stays a monotone function of length across the range.
 * `MIN_BUBBLE_SIZE` is a guard against a turn disappearing entirely, not a
 * routine participant — if it starts firing across a transcript it is tying
 * short turns together, and the scale, not the floor, is what needs revisiting.
 */

/** No bubble renders smaller than this on either axis. */
export const MIN_BUBBLE_SIZE = 5;

/** 0.5 maps turn length onto bubble area; 1 would be the linear map. */
const SIZE_EXPONENT = 0.5;

/**
 * Maps a turn length onto a bubble height within a lane. Pure, so the scale can
 * be exercised without a canvas.
 *
 * `useAreaScaling` selects the AI square-root map. `domainMax` is the longest
 * turn in scope; it is a maximum over a superset of the turns actually drawn,
 * so the ratio is already bounded — the clamp guards that invariant rather than
 * shaping normal output.
 */
export function turnBubbleHeight(turnLength: number, domainMax: number, lane: number, useAreaScaling: boolean): number {
	if (domainMax <= 0) return useAreaScaling ? MIN_BUBBLE_SIZE : 0;
	const ratio = Math.min(1, turnLength / domainMax);
	if (!useAreaScaling) return ratio * lane;
	return Math.max(MIN_BUBBLE_SIZE, Math.pow(ratio, SIZE_EXPONENT) * lane);
}

/**
 * Widest a bubble may be relative to its height.
 *
 * A turn's height comes from its word count and its width from its duration,
 * and the two have unrelated ranges. Where the converter had no measured
 * duration it writes a 0.5s marker, so a tool returning 6,465 words draws 5px
 * wide and 800px tall -- a 160:1 needle whose most striking dimension is a
 * fallback constant. The cap keeps a mark readable as a mark; the flag lets
 * the caller show that it is off the scale rather than silently shortening it.
 */
export const MAX_BUBBLE_ASPECT = 8;

export interface CappedBubble {
	height: number;
	/** True when the true height exceeded the cap and was clipped. */
	capped: boolean;
}

/**
 * Clips a bubble's height to `maxAspect` times its width.
 *
 * Height is clipped rather than width widened: the width says the event was
 * brief, which is true even when the duration behind it was estimated, while
 * an inflated width would assert a duration nothing measured.
 */
export function capBubbleHeight(height: number, width: number, maxAspect: number = MAX_BUBBLE_ASPECT): CappedBubble {
	if (!(width > 0) || !(height > 0) || !(maxAspect > 0)) return { height, capped: false };
	const limit = width * maxAspect;
	return height > limit ? { height: limit, capped: true } : { height, capped: false };
}

export interface BubbleTick {
	/** Word count this tick stands for. */
	words: number;
	/** Half-height of a bubble of that many words, in pixels. */
	halfHeight: number;
}

/**
 * Reference marks for bubble height, so a mark's size can be read as a
 * quantity rather than only compared to its neighbours.
 *
 * Height is square-rooted for AI transcripts, so evenly spaced pixels do not
 * mean evenly spaced word counts. Powers of ten make that legible without
 * laying a grid over the marks: the gaps visibly compress toward the top,
 * which is the scale telling the truth about itself.
 */
export function bubbleScaleTicks(domainMax: number, lane: number, useAreaScaling: boolean, maxTicks = 3): BubbleTick[] {
	if (!(domainMax > 0) || !(lane > 0)) return [];

	const ticks: BubbleTick[] = [];
	for (let value = 10; value <= domainMax; value *= 10) {
		const halfHeight = turnBubbleHeight(value, domainMax, lane, useAreaScaling) / 2;
		// Below a few pixels the label collides with the axis and reads as noise.
		if (halfHeight >= 6) ticks.push({ words: value, halfHeight });
	}

	// Keep the largest, which carry the most separation.
	return ticks.slice(-maxTicks);
}
