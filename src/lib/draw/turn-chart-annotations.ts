/**
 * Turn Chart Annotation Strip
 *
 * A narrow strip rendered below the turn chart showing overlap regions (red)
 * and silence gaps (gray) on the same time axis. Only shown for timed transcripts.
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import TimelineStore from '../../stores/timelineStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import type { OverlapInfo, GapInfo } from '../core/dynamic-data';

export const ANNOTATION_STRIP_HEIGHT = 28;

const OVERLAP_COLOR = '#ef4444';
const GAP_COLOR = '#94a3b8';
const MARKER_HEIGHT = 8;
const ROW_GAP = 2;
const MIN_MARKER_WIDTH = 2;
const LEGEND_DOT_RADIUS = 5;
const LEGEND_DOT_LEFT_OFFSET = 8;
const SEPARATOR_COLOR = 200;

interface PlacedMarker {
	x: number;
	w: number;
	y: number;
	h: number;
	color: string;
	firstDataPoint: DataPoint;
	tooltipContent: string;
}

export class TurnChartAnnotations {
	sk: p5;
	bounds: Bounds;
	private placedMarkers: PlacedMarker[] = [];
	private topRowY: number;
	private bottomRowY: number;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.topRowY = bounds.y + (ANNOTATION_STRIP_HEIGHT - MARKER_HEIGHT * 2 - ROW_GAP) / 2;
		this.bottomRowY = this.topRowY + MARKER_HEIGHT + ROW_GAP;
	}

	draw(overlaps: OverlapInfo[], gaps: GapInfo[]): DataPoint | null {
		this.drawSeparator();
		this.placeMarkers(overlaps, gaps);
		this.drawLegendDots();
		this.drawMarkers();
		return this.handleHover();
	}

	private drawSeparator(): void {
		this.sk.stroke(SEPARATOR_COLOR);
		this.sk.strokeWeight(1);
		this.sk.line(this.bounds.x, this.bounds.y, this.bounds.x + this.bounds.width, this.bounds.y);
	}

	private placeMarkers(overlaps: OverlapInfo[], gaps: GapInfo[]): void {
		this.placedMarkers = [];

		const timeline = get(TimelineStore);
		const timeRange = timeline.rightMarker - timeline.leftMarker;
		if (timeRange <= 0) return;

		for (const overlap of overlaps) {
			if (overlap.endTime < timeline.leftMarker || overlap.startTime > timeline.rightMarker) continue;
			const { x, w } = this.timeSpanToPixels(overlap.startTime, overlap.endTime, timeline.leftMarker, timeRange);
			const duration = overlap.endTime - overlap.startTime;
			this.placedMarkers.push({
				x, w, y: this.topRowY, h: MARKER_HEIGHT,
				color: OVERLAP_COLOR,
				firstDataPoint: overlap.firstDataPoint,
				tooltipContent: `<b>Overlap</b>\n<span style="font-size: 0.85em; opacity: 0.7">${overlap.speakers.join(' & ')}\n${formatTimeCompact(duration)} overlap  ·  ${formatTimeCompact(overlap.startTime)} - ${formatTimeCompact(overlap.endTime)}</span>`
			});
		}

		for (const gap of gaps) {
			if (gap.endTime < timeline.leftMarker || gap.startTime > timeline.rightMarker) continue;
			const { x, w } = this.timeSpanToPixels(gap.startTime, gap.endTime, timeline.leftMarker, timeRange);
			this.placedMarkers.push({
				x, w, y: this.bottomRowY, h: MARKER_HEIGHT,
				color: GAP_COLOR,
				firstDataPoint: gap.firstDataPoint,
				tooltipContent: `<b>Silence Gap</b>\n<span style="font-size: 0.85em; opacity: 0.7">${formatTimeCompact(gap.duration)} gap  ·  ${formatTimeCompact(gap.startTime)}\n${gap.speakerBefore} → ${gap.speakerAfter}</span>`
			});
		}
	}

	private drawLegendDots(): void {
		const dotX = this.bounds.x + LEGEND_DOT_LEFT_OFFSET;
		this.sk.noStroke();

		this.sk.fill(OVERLAP_COLOR);
		this.sk.ellipse(dotX, this.topRowY + MARKER_HEIGHT / 2, LEGEND_DOT_RADIUS, LEGEND_DOT_RADIUS);

		this.sk.fill(GAP_COLOR);
		this.sk.ellipse(dotX, this.bottomRowY + MARKER_HEIGHT / 2, LEGEND_DOT_RADIUS, LEGEND_DOT_RADIUS);
	}

	private drawMarkers(): void {
		this.sk.noStroke();
		for (const marker of this.placedMarkers) {
			const c = this.sk.color(marker.color);
			c.setAlpha(180);
			this.sk.fill(c);
			this.sk.rect(marker.x, marker.y, marker.w, marker.h, 2);
		}
	}

	private handleHover(): DataPoint | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		for (const marker of this.placedMarkers) {
			if (this.sk.overRect(marker.x, marker.y, marker.w, marker.h)) {
				this.sk.noFill();
				this.sk.stroke(marker.color);
				this.sk.strokeWeight(2);
				this.sk.rect(marker.x - 1, marker.y - 1, marker.w + 2, marker.h + 2, 2);
				showTooltip(this.sk.mouseX, this.sk.mouseY, marker.tooltipContent, marker.color, this.sk.height);
				return marker.firstDataPoint;
			}
		}

		return null;
	}

	private timeSpanToPixels(start: number, end: number, leftMarker: number, timeRange: number): { x: number; w: number } {
		const x = this.bounds.x + ((start - leftMarker) / timeRange) * this.bounds.width;
		const xEnd = this.bounds.x + ((end - leftMarker) / timeRange) * this.bounds.width;
		return { x, w: Math.max(MIN_MARKER_WIDTH, xEnd - x) };
	}
}
