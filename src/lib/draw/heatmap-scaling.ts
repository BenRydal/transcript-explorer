/**
 * Cell shading for the speaker heatmap.
 *
 * A cell's opacity encodes how many words a speaker contributed in one time
 * bin. Mapping that linearly against the busiest cell assumes cells are broadly
 * comparable, which holds for human conversation and fails for a human-AI
 * session for the same reason it failed in the turn chart: one bin carrying a
 * large tool result can hold two orders of magnitude more words than the median
 * bin, so a handful of cells own the whole scale and everything else renders at
 * a few percent alpha over the background.
 *
 * AI transcripts take a log map instead, so equal steps in opacity mean equal
 * *ratios* of words. `turn-chart-scaling.ts` reaches for a square root in the
 * same situation, and that is not enough here: opacity is a far shorter
 * perceptual runway than diameter, and sqrt still leaves the middle of a
 * hundred-fold distribution bunched near the floor. Human transcripts keep the
 * linear map, since their spread doesn't have this problem and changing it
 * would redraw existing work.
 *
 * Both maps top out at `MAX_CELL_OPACITY`, so nothing is clipped and opacity
 * stays a monotone function of word count across the range — which is what the
 * legend promises.
 *
 * `MIN_CELL_OPACITY` is a visibility guarantee, not part of the encoding: the
 * quietest real cell has to be distinguishable from empty canvas. It is a floor
 * on the range rather than a clamp, so it costs no resolution — every cell above
 * it is still ordered by word count.
 */

/** Opacity of the quietest populated cell. */
export const MIN_CELL_OPACITY = 45;

/** Opacity of the busiest cell in scope. */
export const MAX_CELL_OPACITY = 230;

/**
 * Opacity of a "no data" tile. The tile exists to keep the grid legible, not to
 * compete with the cells: it previously drew at full strength, which left it
 * reading as *more* present than a median cell. It isn't comparable to
 * `MIN_CELL_OPACITY` by number — the tile is a near-background grey while a
 * cell is a saturated speaker hue, so the same alpha buys wildly different
 * contrast.
 */
export const EMPTY_CELL_OPACITY = 60;

/**
 * Maps a cell's word count onto a fill opacity. Pure, so the scale can be
 * exercised without a canvas.
 *
 * `useLogScaling` selects the AI log map. `domainMax` is the busiest cell in
 * scope, so the ratio is already bounded — the clamp guards that invariant
 * rather than shaping normal output. Returns 0 for an empty cell; the caller
 * draws those as `EMPTY_CELL_OPACITY` tiles instead.
 */
export function cellOpacity(wordCount: number, domainMax: number, useLogScaling: boolean): number {
	if (wordCount <= 0) return 0;
	if (domainMax <= 0) return MAX_CELL_OPACITY;
	const t = useLogScaling ? Math.log1p(wordCount) / Math.log1p(domainMax) : wordCount / domainMax;
	return MIN_CELL_OPACITY + Math.min(1, t) * (MAX_CELL_OPACITY - MIN_CELL_OPACITY);
}

/** Slider position that means "let the view choose". */
export const BIN_COUNT_AUTO = 121;
export const BIN_COUNT_MIN = 4;
export const BIN_COUNT_MAX = 120;

/** True when the slider is asking the view to pick its own bin count. */
export function isAutoBinCount(value: number): boolean {
	return value >= BIN_COUNT_AUTO;
}
