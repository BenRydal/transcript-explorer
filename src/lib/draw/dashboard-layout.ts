import type { Bounds } from './types/bounds';
import { CANVAS_SPACING } from '../constants/ui';

/** Smallest panel a view is asked to draw into. */
export const MIN_PANEL_SIZE = 1;

const clamp = (value: number) => Math.max(MIN_PANEL_SIZE, value);

/** Panel rectangles for a dashboard of `count` panels on a `width` x `height` canvas. */
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
