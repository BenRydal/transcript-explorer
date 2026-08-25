/**
 * Bloom size and stem height for the Speaker Garden. Pure, so the scales can be
 * exercised without a canvas.
 */

/**
 * Floor for a human transcript's bloom. Small speakers stay visible; the value
 * is unchanged from the original garden so existing work redraws identically.
 */
export const MIN_FLOWER_RADIUS = 25;

/**
 * Floor for an AI transcript's bloom.
 *
 * `flower-drawing.ts` gates leaves, centre dots and petal veins on
 * `scaledWordArea / 100` clearing 0.25, 0.35 and 0.4. A bloom at the human
 * floor sits exactly on the lowest of those, so it renders as a bare petal ring
 * -- an asterisk rather than a flower. This floor clears all three.
 */
export const MIN_AI_FLOWER_RADIUS = 40;

/**
 * Radius of a speaker's bloom.
 *
 * Human transcripts map word count onto bloom *area*, which is the right
 * default and is how the garden has always drawn. It fails on an agentic
 * session for the reason the heatmap documents: one actor can hold half the
 * words in the transcript, so every other bloom lands on the floor and the
 * field becomes uniform.
 *
 * AI transcripts take a log map instead, so equal steps in radius mean equal
 * ratios of words. Both maps are monotone across the range and neither clips.
 */
export function flowerRadius(wordCount: number, domainMax: number, maxRadius: number, useLogScaling: boolean): number {
	const floor = useLogScaling ? MIN_AI_FLOWER_RADIUS : MIN_FLOWER_RADIUS;
	// A crowded canvas can leave less room per speaker than the floor asks for.
	// Honour the space rather than overlapping the neighbours.
	if (maxRadius <= floor) return maxRadius;
	if (domainMax <= 0 || wordCount <= 0) return floor;

	if (!useLogScaling) {
		return Math.max(floor, maxRadius * Math.sqrt(Math.min(1, wordCount / domainMax)));
	}

	const t = Math.min(1, Math.log1p(wordCount) / Math.log1p(domainMax));
	return floor + t * (maxRadius - floor);
}

/**
 * Where a speaker's bloom sits between the baseline (0) and the top of the
 * axis (1), from its turn count.
 *
 * The linear map spends the axis on its largest contributor: in the bundled
 * multi-agent session the top speaker takes 59 turns against a median of 5, so
 * 22 of 25 flowers sit in the bottom quarter and the upper three-quarters of
 * the canvas holds three. AI transcripts take a square root, matching the turn
 * chart and turn network.
 */
export function stemFraction(turnCount: number, domainMax: number, useSqrtScaling: boolean): number {
	if (domainMax <= 0) return 0;
	const ratio = Math.min(1, Math.max(0, turnCount / domainMax));
	return useSqrtScaling ? Math.sqrt(ratio) : ratio;
}
