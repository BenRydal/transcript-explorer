/**
 * Bloom size and stem height for the Speaker Garden. Pure, so the scales can be
 * exercised without a canvas.
 */

/** Unchanged from the original garden, so existing work redraws identically. */
export const MIN_FLOWER_RADIUS = 25;

/** Floor for an AI transcript's bloom. */
export const MIN_AI_FLOWER_RADIUS = 40;

/** Radius of a speaker's bloom. */
export function flowerRadius(wordCount: number, domainMax: number, maxRadius: number, useLogScaling: boolean): number {
	const floor = useLogScaling ? MIN_AI_FLOWER_RADIUS : MIN_FLOWER_RADIUS;
	// Less room per speaker than the floor asks for: honour the space.
	if (maxRadius <= floor) return maxRadius;
	if (domainMax <= 0 || wordCount <= 0) return floor;

	if (!useLogScaling) {
		return Math.max(floor, maxRadius * Math.sqrt(Math.min(1, wordCount / domainMax)));
	}

	const t = Math.min(1, Math.log1p(wordCount) / Math.log1p(domainMax));
	return floor + t * (maxRadius - floor);
}

/** Where a speaker's bloom sits between the baseline (0) and the top of the axis (1), from its turn count. */
export function stemFraction(turnCount: number, domainMax: number, useSqrtScaling: boolean): number {
	if (domainMax <= 0) return 0;
	const ratio = Math.min(1, Math.max(0, turnCount / domainMax));
	return useSqrtScaling ? Math.sqrt(ratio) : ratio;
}
