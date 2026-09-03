/**
 * Re-deriving a session (a lens or grouping change) reset the zoom window to the
 * whole timeline, so changing any setting threw away where the analyst was.
 */

import { describe, expect, it } from 'vitest';
import { nextTimelineView } from '../src/lib/timeline/timeline-view';
import type { Timeline } from '../src/models/timeline';

function timeline(leftMarker: number, rightMarker: number, currTime: number): Timeline {
	return { leftMarker, rightMarker, currTime, startTime: 0, endTime: 100, isAnimating: false };
}

describe('the view a transcript apply lands on', () => {
	it('starts from the whole span when loading a session', () => {
		expect(nextTimelineView(timeline(20, 40, 30), 100, false)).toEqual({ currTime: 0, leftMarker: 0, rightMarker: 100 });
	});

	it('keeps the window and playhead when re-deriving one', () => {
		expect(nextTimelineView(timeline(20, 40, 30), 100, true)).toEqual({ currTime: 30, leftMarker: 20, rightMarker: 40 });
	});

	it('keeps the window when the span is unchanged, which is the grouping case', () => {
		expect(nextTimelineView(timeline(1200, 1800, 1500), 2607, true)).toEqual({ currTime: 1500, leftMarker: 1200, rightMarker: 1800 });
	});

	it('clamps a window that now runs past the end', () => {
		const view = nextTimelineView(timeline(30, 90, 70), 50, true);
		expect(view.rightMarker).toBe(50);
		expect(view.leftMarker).toBe(30);
		expect(view.currTime).toBeGreaterThanOrEqual(view.leftMarker);
		expect(view.currTime).toBeLessThanOrEqual(view.rightMarker);
	});

	it('falls back to the whole span when clamping would invert the window', () => {
		expect(nextTimelineView(timeline(80, 95, 90), 40, true)).toEqual({ currTime: 0, leftMarker: 0, rightMarker: 40 });
	});

	it('falls back when no window was set, so a fresh session is not pinned to zero width', () => {
		expect(nextTimelineView(timeline(0, 0, 0), 100, true)).toEqual({ currTime: 0, leftMarker: 0, rightMarker: 100 });
	});
});
