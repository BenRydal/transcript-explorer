import type { Bounds } from './types/bounds';
import { CANVAS_SPACING } from '../constants/ui';

/**
 * Smallest panel a view is asked to draw into.
 *
 * Splitting the canvas subtracts padding and gaps before halving, so a short
 * canvas drives a panel's height negative -- at the 1x1 floor `Sketch.svelte`
 * clamps to, the three-panel split yields -20 x -20. A negative size reaches
 * `createGraphics` in the contribution cloud, and the throw escapes the frame:
 * p5 requests its next animation frame only after `redraw()` returns, so one
 * bad frame ends the loop for the session.
 */
export const MIN_PANEL_SIZE = 1;

const clamp = (value: number) => Math.max(MIN_PANEL_SIZE, value);

/**
 * Panel rectangles for a dashboard of `count` panels on a `width` x `height`
 * canvas. Pure, so the degenerate sizes can be exercised without a canvas.
 *
 * Two panels sit side by side, four in a grid, and three as a full-width band
 * over two halves.
 */
export function dashboardLayout(width: number, height: number, count: number): Bounds[] {
	const padding = CANVAS_SPACING / 2;
	const gap = CANVAS_SPACING;
	const totalWidth = clamp(width - padding * 2);
	const totalHeight = clamp(height - padding * 2);
	const halfWidth = clamp((totalWidth - gap) / 2);
	const halfHeight = clamp((totalHeight - gap) / 2);

	if (count === 2) {
		return [
			{ x: padding, y: padding, width: halfWidth, height: totalHeight },
			{ x: padding + halfWidth + gap, y: padding, width: halfWidth, height: totalHeight }
		];
	}

	if (count === 4) {
		return [
			{ x: padding, y: padding, width: halfWidth, height: halfHeight },
			{ x: padding + halfWidth + gap, y: padding, width: halfWidth, height: halfHeight },
			{ x: padding, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight },
			{ x: padding + halfWidth + gap, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight }
		];
	}

	// 3 panels (default): top full-width + 2 bottom
	return [
		{ x: padding, y: padding, width: totalWidth, height: halfHeight },
		{ x: padding, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight },
		{ x: padding + halfWidth + gap, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight }
	];
}
