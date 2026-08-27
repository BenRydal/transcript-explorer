/**
 * Bloom size and stem height for the Speaker Garden. Pure, so the scales can be
 * exercised without a canvas.
 */

/** Floor for a human transcript's bloom. A near-silent participant is a finding, so it is allowed to read small. */
export const MIN_FLOWER_RADIUS = 25;

/** Floor for an AI transcript's bloom, clearing every detail threshold in flower-drawing.ts. A near-silent tool is plumbing, and only has to be identifiable. */
export const MIN_AI_FLOWER_RADIUS = 40;

/**
 * Most of the column a floor may claim.
 *
 * Without this the floor can swallow the scale whole: the garden gives each
 * speaker `width / (speakers + 1)`, so past ~35 actors on a full canvas — or ~12
 * in a dashboard tile — the column is narrower than the floor itself and every
 * bloom comes out the same size, saying nothing about word count. Capping the
 * floor at a share of the column leaves the largest bloom at least 1/0.6 of the
 * smallest in radius, near triple in area, however crowded the field gets.
 */
export const FLOOR_MAX_SHARE = 0.6;

/** The floor actually in force, once the column has had its say. */
export function bloomFloor(maxRadius: number, isAi: boolean): number {
	return Math.min(isAi ? MIN_AI_FLOWER_RADIUS : MIN_FLOWER_RADIUS, maxRadius * FLOOR_MAX_SHARE);
}

/**
 * Radius of a speaker's bloom, mapping word count onto bloom area above the floor.
 *
 * The floor is the bottom of the scale rather than a clamp applied to it. Clamping
 * flattened everyone below the floor onto a single size — 5 of the 10 speakers in
 * example-1, 8 of 10 in a dashboard tile — which erased exactly the quiet
 * participants the view exists to surface.
 */
export function flowerRadius(wordCount: number, domainMax: number, maxRadius: number, isAi: boolean): number {
	if (maxRadius <= 0) return 0;

	const floor = bloomFloor(maxRadius, isAi);
	if (domainMax <= 0 || wordCount <= 0) return floor;

	// Radius on the root of the ratio is what mapping words onto area means.
	const t = Math.sqrt(Math.min(1, wordCount / domainMax));
	return floor + t * (maxRadius - floor);
}

/** Where a speaker's bloom sits between the baseline (0) and the top of the axis (1), from its turn count. */
export function stemFraction(turnCount: number, domainMax: number, useSqrtScaling: boolean): number {
	if (domainMax <= 0) return 0;
	const ratio = Math.min(1, Math.max(0, turnCount / domainMax));
	return useSqrtScaling ? Math.sqrt(ratio) : ratio;
}
