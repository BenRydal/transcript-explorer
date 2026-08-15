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
