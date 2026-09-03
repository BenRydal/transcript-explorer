import type { Timeline } from '../../models/timeline';

/** The window and playhead a transcript apply should land on. Pure, so it can be tested without stores. */
export interface TimelineView {
	currTime: number;
	leftMarker: number;
	rightMarker: number;
}

/**
 * Loading a session starts from the whole span. Re-deriving one, which is what a
 * lens or grouping change does, keeps where the analyst was.
 */
export function nextTimelineView(timeline: Timeline, timelineEnd: number, keepView: boolean): TimelineView {
	const full = { currTime: 0, leftMarker: 0, rightMarker: timelineEnd };
	if (!keepView) return full;

	const clamp = (value: number) => Math.min(Math.max(value, 0), timelineEnd);
	const left = clamp(timeline.leftMarker);
	const right = timeline.rightMarker > timeline.leftMarker ? clamp(timeline.rightMarker) : timelineEnd;
	if (right <= left) return full;

	return { currTime: Math.min(Math.max(timeline.currTime, left), right), leftMarker: left, rightMarker: right };
}
