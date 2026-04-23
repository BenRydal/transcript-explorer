/**
 * Speaker Fingerprint Visualization
 *
 * A radar chart showing each speaker's speaking style profile across multiple dimensions:
 * - Average turn length (max-normalized across speakers)
 * - Participation rate (max-normalized across speakers)
 * - Consecutive rate (raw 0-1, % of own turns that follow own previous turn)
 * - Question rate (raw 0-1, % of own turns with questions)
 * - Interruption rate (raw 0-1, % of own turns that interrupt)
 */

import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import type { SpeakerFingerprintData } from '../core/dynamic-data';
import { DEFAULT_SPEAKER_COLOR } from '../constants/ui';
import { toTitleCase } from '../core/string-utils';
import { getDominantCodeColor } from './draw-utils';
import { DrawContext } from './draw-context';

// --- Constants ---

const NUM_AXES = 5;
const AXIS_LABELS = ['Turn Length', 'Participation', 'Consecutive', 'Questions', 'Interrupts'];
const AXIS_LABELS_FULL = ['Turn Length', 'Participation', 'Consecutive Turns', 'Questions', 'Interruptions'];
const AXIS_KEYS: (keyof SpeakerFingerprintData)[] = ['avgTurnLength', 'participationRate', 'consecutiveRate', 'questionRate', 'interruptionRate'];

const MIN_RADAR_RADIUS = 60;
const RADAR_PADDING = 50;
const LABEL_OFFSET = 20;
const POLYGON_OPACITY = 100;
const POLYGON_HOVER_OPACITY = 180;
const STROKE_WEIGHT = 2;
const STROKE_HOVER_WEIGHT = 3;
const GRID_RINGS = 4;
const GRID_OPACITY = 40;
const AXIS_OPACITY = 80;
const SMALL_MULTIPLE_PADDING = 30;
const SMALL_MULTIPLE_LABEL_OFFSET = 16;

// Helper to calculate angle for a given axis index
const getAxisAngle = (axisIndex: number): number => (axisIndex / NUM_AXES) * Math.PI * 2 - Math.PI / 2;

// Perpendicular distance from point (px, py) to segment (ax, ay) → (bx, by).
// Used by the parallel-coordinates hover hit-test to pick the closest polyline.
function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) {
		return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
	}
	let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

type HoveredVertex = { speaker: string; axisIndex: number } | null;

// --- Main class ---

export class SpeakerFingerprint {
	private ctx: DrawContext;
	private bounds: Bounds;
	private hasTiming: boolean;

	constructor(ctx: DrawContext, bounds: Bounds) {
		this.ctx = ctx;
		this.bounds = bounds;
		this.hasTiming = this.ctx.transcript.timingMode !== 'untimed';
	}

	draw(fingerprints: SpeakerFingerprintData[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		if (fingerprints.length === 0) {
			return { snippetPoints: [], hoveredSpeaker: null };
		}

		// Parallel coordinates sidesteps radar's quadratic-area artifact entirely
		// (Few 2005, "Keep Radar Graphs Below the Radar"; Munzner 2014 ch. 12).
		// It renders all speakers in a single shared frame without occlusion.
		if (this.ctx.config.fingerprintChartMode === 'parallel') {
			return this.drawParallelCoords(fingerprints);
		}

		// Resolve the overlay mode:
		//   'overlay'         — always a single shared radar
		//   'small-multiples' — always one radar per speaker
		//   'auto' (default)  — small-multiples once occlusion bites (>3 speakers)
		const mode = this.ctx.config.fingerprintOverlayMode;
		const useOverlay = mode === 'overlay' || (mode === 'auto' && fingerprints.length <= 3);
		return useOverlay ? this.drawOverlay(fingerprints) : this.drawSmallMultiples(fingerprints);
	}

	// --- Overlay mode (2-4 speakers) ---

	private drawOverlay(fingerprints: SpeakerFingerprintData[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		const centerX = this.bounds.x + this.bounds.width / 2;
		const centerY = this.bounds.y + this.bounds.height / 2;
		const radius = Math.max(MIN_RADAR_RADIUS, Math.min(this.bounds.width, this.bounds.height) / 2 - RADAR_PADDING);

		// Draw grid and axes
		this.drawRadarGrid(centerX, centerY, radius);
		this.drawAxisLabels(centerX, centerY, radius);

		// Find hovered vertex (speaker + axis)
		const hoveredVertex = this.findHoveredVertex(fingerprints, centerX, centerY, radius);
		const hoveredSpeaker = hoveredVertex?.speaker ?? null;

		// Draw all speaker polygons (hovered one last for visibility)
		const sortedFingerprints = [...fingerprints].sort((a, b) => {
			if (a.speaker === hoveredSpeaker) return 1;
			if (b.speaker === hoveredSpeaker) return -1;
			return 0;
		});

		for (const fp of sortedFingerprints) {
			const isHovered = fp.speaker === hoveredSpeaker;
			this.drawSpeakerPolygon(fp, centerX, centerY, radius, isHovered);
		}

		this.showTooltipIfHovered(fingerprints, hoveredSpeaker);
		const snippetPoints = this.getSnippetPointsForVertex(hoveredVertex, fingerprints);
		return { snippetPoints, hoveredSpeaker };
	}

	// --- Small multiples mode (5+ speakers) ---

	private drawSmallMultiples(fingerprints: SpeakerFingerprintData[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		const cols = Math.ceil(Math.sqrt(fingerprints.length));
		const rows = Math.ceil(fingerprints.length / cols);
		const cellWidth = (this.bounds.width - SMALL_MULTIPLE_PADDING) / cols;
		const cellHeight = (this.bounds.height - SMALL_MULTIPLE_PADDING) / rows;
		const cellRadius = Math.max(30, Math.min(cellWidth, cellHeight) / 2 - SMALL_MULTIPLE_PADDING);

		let hoveredVertex: HoveredVertex = null;

		for (let i = 0; i < fingerprints.length; i++) {
			const fp = fingerprints[i];
			const col = i % cols;
			const row = Math.floor(i / cols);
			const cellX = this.bounds.x + col * cellWidth + cellWidth / 2;
			const cellY = this.bounds.y + row * cellHeight + cellHeight / 2;

			const isInCell = this.isPointInCell(this.ctx.sk.mouseX, this.ctx.sk.mouseY, cellX, cellY, cellRadius);
			if (isInCell) {
				// Check for vertex hover within this cell
				const vertexHover = this.findHoveredVertex([fp], cellX, cellY, cellRadius);
				if (vertexHover) hoveredVertex = vertexHover;
			}

			this.drawRadarGrid(cellX, cellY, cellRadius, true);
			if (i === 0) this.drawAxisLabelsShort(cellX, cellY, cellRadius);
			this.drawSpeakerPolygon(fp, cellX, cellY, cellRadius, hoveredVertex?.speaker === fp.speaker);

			// Draw speaker name below. Drawn over the canvas background (not
			// a speaker-colored shape), so we use theme.fg — speaker identity
			// is already carried by the radar polygon above, and pale
			// speaker colors were unreadable on the dark canvas.
			this.ctx.sk.fill(this.ctx.theme.fg);
			this.ctx.sk.noStroke();
			this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.TOP);
			this.ctx.sk.textSize(11);
			this.ctx.sk.text(toTitleCase(fp.speaker), cellX, cellY + cellRadius + 5);
		}

		const hoveredSpeaker = hoveredVertex?.speaker ?? null;
		this.showTooltipIfHovered(fingerprints, hoveredSpeaker);
		const snippetPoints = this.getSnippetPointsForVertex(hoveredVertex, fingerprints);
		return { snippetPoints, hoveredSpeaker };
	}

	// --- Parallel coordinates mode ---
	//
	// 5 vertical axes (one per dimension). Each speaker = one polyline across
	// all 5 axes. No shape/area involved, so the radar's quadratic-area and
	// "closing the loop across unrelated axes" artifacts don't apply.
	//
	// Normalization: max-normalized per axis across the visible speakers. The
	// radar's mixed normalization (max-norm on two axes, raw-rate on three)
	// was one of the issues the viz memo flagged; here we do the right thing
	// in the new mode. For axes that are already rates (consecutive, question,
	// interruption), we max-normalize among visible speakers so the displayed
	// lines use the full chart height.
	private drawParallelCoords(fingerprints: SpeakerFingerprintData[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		const padLeft = 60;
		const padRight = 40;
		const padTop = 40;
		const padBottom = 40;

		const innerX = this.bounds.x + padLeft;
		const innerY = this.bounds.y + padTop;
		const innerW = Math.max(40, this.bounds.width - padLeft - padRight);
		const innerH = Math.max(40, this.bounds.height - padTop - padBottom);

		// X positions of the 5 axes (evenly spaced left→right).
		const axisXs: number[] = [];
		for (let i = 0; i < NUM_AXES; i++) {
			axisXs.push(innerX + (i / (NUM_AXES - 1)) * innerW);
		}

		// Rebuild raw per-speaker values (pre-normalization) using the raw
		// fields on fingerprint data. We then max-normalize each axis across
		// the currently visible speakers for consistent scaling.
		const rawByAxis: number[][] = AXIS_KEYS.map((key, axisIndex) => {
			return fingerprints.map((fp) => {
				if (axisIndex === 0) {
					// Turn Length — avg words per turn (speaker-level raw).
					return fp.totalTurns > 0 ? fp.totalWords / fp.totalTurns : 0;
				}
				if (axisIndex === 1) return fp.rawParticipationRate;
				if (axisIndex === 2) return fp.rawConsecutiveRate;
				if (axisIndex === 3) return fp.rawQuestionRate;
				if (axisIndex === 4) return fp.rawInterruptionRate;
				return fp[key] as number;
			});
		});

		const axisMax: number[] = rawByAxis.map((values) => {
			const max = Math.max(...values, 0);
			return max > 0 ? max : 1;
		});

		// Draw the axes + endpoint labels.
		this.drawParallelAxes(axisXs, innerY, innerH, axisMax);

		// Hover detection: closest polyline to the mouse (within a small
		// pixel threshold). Falls back to per-axis point hover on the
		// speaker's vertex.
		const hoveredSpeaker = this.findHoveredParallelSpeaker(fingerprints, axisXs, innerY, innerH, axisMax);

		// Draw polylines. Hovered speaker last + emphasized.
		const order = [...fingerprints].sort((a, b) => {
			if (a.speaker === hoveredSpeaker) return 1;
			if (b.speaker === hoveredSpeaker) return -1;
			return 0;
		});

		for (const fp of order) {
			const isHovered = fp.speaker === hoveredSpeaker;
			this.drawParallelPolyline(fp, axisXs, innerY, innerH, axisMax, isHovered, hoveredSpeaker != null);
		}

		if (hoveredSpeaker) {
			const fp = fingerprints.find((f) => f.speaker === hoveredSpeaker);
			if (fp) this.showTooltipFor(fp);
		}

		// Snippet points: whole-speaker turns when hovered (parallel-coords
		// doesn't expose per-axis drill-down the way radar vertex-hover does).
		const snippetPoints = hoveredSpeaker
			? fingerprints.find((f) => f.speaker === hoveredSpeaker)?.allTurnFirstWords ?? []
			: [];

		return { snippetPoints, hoveredSpeaker };
	}

	private drawParallelAxes(axisXs: number[], innerY: number, innerH: number, axisMax: number[]): void {
		const theme = this.ctx.theme;

		// Vertical axis lines.
		const axisStroke = this.ctx.sk.color(theme.fgMuted);
		axisStroke.setAlpha(AXIS_OPACITY);
		this.ctx.sk.stroke(axisStroke);
		this.ctx.sk.strokeWeight(1);
		for (const x of axisXs) {
			this.ctx.sk.line(x, innerY, x, innerY + innerH);
		}

		// Axis endpoint labels: top (max value), bottom (0), and the axis name
		// above the top tick.
		this.ctx.sk.noStroke();
		this.ctx.sk.textSize(11);
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.BOTTOM);
		const labelFill = theme.fg;
		const disabledFill = theme.fgSubtle;

		for (let i = 0; i < NUM_AXES; i++) {
			const x = axisXs[i];
			const isInterruptionsDisabled = AXIS_KEYS[i] === 'interruptionRate' && !this.hasTiming;
			this.ctx.sk.fill(isInterruptionsDisabled ? disabledFill : labelFill);
			const label = AXIS_LABELS[i] + (isInterruptionsDisabled ? ' (N/A)' : '');
			this.ctx.sk.text(label, x, innerY - 18);

			// Value ticks at bottom (0) and top (max).
			this.ctx.sk.fill(theme.fgMuted);
			this.ctx.sk.textSize(9);
			this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.TOP);
			// Dimension 0 (turn length) is a word-count scale; others are rates.
			const topLabel = i === 0 ? `${axisMax[i].toFixed(0)}w` : `${Math.round(axisMax[i] * 100)}%`;
			this.ctx.sk.text(topLabel, x, innerY - 2);
			this.ctx.sk.text('0', x, innerY + innerH + 4);
			this.ctx.sk.textSize(11);
			this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.BOTTOM);
		}
	}

	private drawParallelPolyline(
		fp: SpeakerFingerprintData,
		axisXs: number[],
		innerY: number,
		innerH: number,
		axisMax: number[],
		isHovered: boolean,
		someoneHovered: boolean
	): void {
		const color = this.ctx.sk.color(this.resolveSpeakerColor(fp));
		const alpha = isHovered ? 255 : someoneHovered ? 60 : 180;
		color.setAlpha(alpha);
		this.ctx.sk.stroke(color);
		this.ctx.sk.strokeWeight(isHovered ? STROKE_HOVER_WEIGHT : STROKE_WEIGHT);
		this.ctx.sk.noFill();

		const points = this.getParallelPoints(fp, axisXs, innerY, innerH, axisMax);
		this.ctx.sk.beginShape();
		for (const p of points) {
			this.ctx.sk.vertex(p.x, p.y);
		}
		this.ctx.sk.endShape();

		// Vertex dots so readers can see each axis value distinctly.
		this.ctx.sk.noStroke();
		color.setAlpha(alpha);
		this.ctx.sk.fill(color);
		const dotSize = isHovered ? 6 : 4;
		for (const p of points) {
			this.ctx.sk.ellipse(p.x, p.y, dotSize, dotSize);
		}
	}

	private getParallelPoints(
		fp: SpeakerFingerprintData,
		axisXs: number[],
		innerY: number,
		innerH: number,
		axisMax: number[]
	): { x: number; y: number }[] {
		const rawValueAt = (axisIndex: number): number => {
			if (axisIndex === 0) return fp.totalTurns > 0 ? fp.totalWords / fp.totalTurns : 0;
			if (axisIndex === 1) return fp.rawParticipationRate;
			if (axisIndex === 2) return fp.rawConsecutiveRate;
			if (axisIndex === 3) return fp.rawQuestionRate;
			if (axisIndex === 4) return fp.rawInterruptionRate;
			return 0;
		};

		return axisXs.map((x, i) => {
			const raw = rawValueAt(i);
			const normalized = Math.max(0, Math.min(1, axisMax[i] > 0 ? raw / axisMax[i] : 0));
			// Y flips so 1 = top, 0 = bottom (standard parallel-coords layout).
			return { x, y: innerY + innerH - normalized * innerH };
		});
	}

	private findHoveredParallelSpeaker(
		fingerprints: SpeakerFingerprintData[],
		axisXs: number[],
		innerY: number,
		innerH: number,
		axisMax: number[]
	): string | null {
		if (!this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.ctx.sk.mouseX;
		const my = this.ctx.sk.mouseY;
		const hitThreshold = 8; // pixels

		let bestSpeaker: string | null = null;
		let bestDist = hitThreshold;

		for (const fp of fingerprints) {
			const points = this.getParallelPoints(fp, axisXs, innerY, innerH, axisMax);
			// Check distance to each polyline segment.
			for (let i = 0; i < points.length - 1; i++) {
				const dist = pointSegmentDistance(mx, my, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
				if (dist < bestDist) {
					bestDist = dist;
					bestSpeaker = fp.speaker;
				}
			}
			// Also check vertex proximity so narrow peaks are grabbable.
			for (const p of points) {
				const d = Math.sqrt((mx - p.x) ** 2 + (my - p.y) ** 2);
				if (d < bestDist) {
					bestDist = d;
					bestSpeaker = fp.speaker;
				}
			}
		}

		return bestSpeaker;
	}

	private showTooltipIfHovered(fingerprints: SpeakerFingerprintData[], hoveredSpeaker: string | null): void {
		if (hoveredSpeaker) {
			const fp = fingerprints.find((f) => f.speaker === hoveredSpeaker);
			if (fp) this.showTooltipFor(fp);
		}
	}

	// --- Drawing helpers ---

	private drawRadarGrid(cx: number, cy: number, radius: number, minimal = false): void {
		const rings = minimal ? 2 : GRID_RINGS;
		const theme = this.ctx.theme;

		// Concentric rings — grid tone with fixed alpha so opacity feels
		// identical in light/dark (token handles hue inversion).
		this.ctx.sk.noFill();
		const gridStroke = this.ctx.sk.color(theme.border);
		gridStroke.setAlpha(GRID_OPACITY);
		this.ctx.sk.stroke(gridStroke);
		this.ctx.sk.strokeWeight(1);
		for (let r = 1; r <= rings; r++) {
			const ringRadius = (radius * r) / rings;
			this.ctx.sk.beginShape();
			for (let i = 0; i < NUM_AXES; i++) {
				const angle = getAxisAngle(i);
				this.ctx.sk.vertex(cx + Math.cos(angle) * ringRadius, cy + Math.sin(angle) * ringRadius);
			}
			this.ctx.sk.endShape(this.ctx.sk.CLOSE);
		}

		// Axis lines
		const axisStroke = this.ctx.sk.color(theme.fgMuted);
		axisStroke.setAlpha(AXIS_OPACITY);
		this.ctx.sk.stroke(axisStroke);
		for (let i = 0; i < NUM_AXES; i++) {
			const angle = getAxisAngle(i);
			this.ctx.sk.line(cx, cy, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
		}

		// Scale labels along the top axis
		this.ctx.sk.noStroke();
		this.ctx.sk.fill(theme.fgMuted);
		this.ctx.sk.textSize(minimal ? 8 : 9);
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.CENTER);
		const labels = minimal ? ['Low', 'Most'] : ['Low', 'Med', 'High', 'Most'];
		for (let r = 1; r <= rings; r++) {
			this.ctx.sk.text(labels[r - 1], cx + 3, cy - (radius * r) / rings);
		}
	}

	private drawAxisLabels(cx: number, cy: number, radius: number): void {
		// Full mode labels read on both themes — use primary fg.
		this.drawAxisLabelsImpl(cx, cy, radius + LABEL_OFFSET, 11, this.ctx.theme.fg, true);
	}

	private drawAxisLabelsShort(cx: number, cy: number, radius: number): void {
		// Small-multiples labels are secondary — use muted fg.
		this.drawAxisLabelsImpl(cx, cy, radius + SMALL_MULTIPLE_LABEL_OFFSET, 10, this.ctx.theme.fgMuted, false);
	}

	private drawAxisLabelsImpl(cx: number, cy: number, labelRadius: number, textSize: number, defaultFill: string, fullMode: boolean): void {
		this.ctx.sk.noStroke();
		this.ctx.sk.textSize(textSize);
		const labels = fullMode ? AXIS_LABELS_FULL : AXIS_LABELS;
		const disabledFill = this.ctx.theme.fgSubtle;

		for (let i = 0; i < NUM_AXES; i++) {
			const angle = getAxisAngle(i);
			const x = cx + Math.cos(angle) * labelRadius;
			const y = cy + Math.sin(angle) * labelRadius;
			this.setTextAlignForAngle(angle);

			const isInterruptionsDisabled = AXIS_KEYS[i] === 'interruptionRate' && !this.hasTiming;
			this.ctx.sk.fill(isInterruptionsDisabled ? disabledFill : defaultFill);
			const label = isInterruptionsDisabled && fullMode ? labels[i] + ' (N/A)' : labels[i];
			this.ctx.sk.text(label, x, y);
		}
	}

	private setTextAlignForAngle(angle: number): void {
		if (Math.abs(angle + Math.PI / 2) < 0.1) {
			this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.BOTTOM);
		} else if (Math.abs(angle - Math.PI / 2) < 0.1) {
			this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.TOP);
		} else if (Math.cos(angle) > 0) {
			this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.CENTER);
		} else {
			this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.CENTER);
		}
	}

	private drawSpeakerPolygon(fp: SpeakerFingerprintData, cx: number, cy: number, radius: number, isHovered: boolean): void {
		const color = this.ctx.sk.color(this.resolveSpeakerColor(fp));
		const vertices = this.getPolygonVertices(fp, cx, cy, radius);

		// Draw filled polygon
		color.setAlpha(isHovered ? POLYGON_HOVER_OPACITY : POLYGON_OPACITY);
		this.ctx.sk.fill(color);
		color.setAlpha(255);
		this.ctx.sk.stroke(color);
		this.ctx.sk.strokeWeight(isHovered ? STROKE_HOVER_WEIGHT : STROKE_WEIGHT);

		this.ctx.sk.beginShape();
		for (const v of vertices) {
			this.ctx.sk.vertex(v.x, v.y);
		}
		this.ctx.sk.endShape(this.ctx.sk.CLOSE);

		// Draw vertex points
		this.ctx.sk.noStroke();
		this.ctx.sk.fill(color);
		const dotSize = isHovered ? 6 : 4;
		for (const v of vertices) {
			this.ctx.sk.ellipse(v.x, v.y, dotSize, dotSize);
		}
	}

	private getPolygonVertices(fp: SpeakerFingerprintData, cx: number, cy: number, radius: number): { x: number; y: number }[] {
		return AXIS_KEYS.map((key, i) => {
			const angle = getAxisAngle(i);
			const value = Math.max(0, Math.min(1, fp[key] as number));
			return {
				x: cx + Math.cos(angle) * value * radius,
				y: cy + Math.sin(angle) * value * radius
			};
		});
	}

	// --- Hover detection ---

	private findHoveredVertex(fingerprints: SpeakerFingerprintData[], cx: number, cy: number, radius: number): HoveredVertex {
		if (!this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.ctx.sk.mouseX;
		const my = this.ctx.sk.mouseY;

		// Check vertex proximity (highest priority)
		let closestVertex: HoveredVertex = null;
		let closestVertexDist = 15; // Max vertex detection radius

		for (const fp of fingerprints) {
			const vertices = this.getPolygonVertices(fp, cx, cy, radius);
			for (let i = 0; i < vertices.length; i++) {
				const v = vertices[i];
				const dist = Math.sqrt((mx - v.x) ** 2 + (my - v.y) ** 2);
				if (dist < closestVertexDist) {
					closestVertexDist = dist;
					closestVertex = { speaker: fp.speaker, axisIndex: i };
				}
			}
		}

		if (closestVertex) return closestVertex;

		// Fall back to polygon containment (prefer smaller polygons)
		let smallestArea = Infinity;
		let containedSpeaker: string | null = null;

		for (const fp of fingerprints) {
			const vertices = this.getPolygonVertices(fp, cx, cy, radius);
			if (this.isPointInPolygon(mx, my, vertices)) {
				const area = this.getPolygonArea(vertices);
				if (area < smallestArea) {
					smallestArea = area;
					containedSpeaker = fp.speaker;
				}
			}
		}

		// Return with axisIndex -1 to indicate polygon hover (not vertex)
		return containedSpeaker ? { speaker: containedSpeaker, axisIndex: -1 } : null;
	}

	private isPointInPolygon(px: number, py: number, vertices: { x: number; y: number }[]): boolean {
		let inside = false;
		for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			const { x: xi, y: yi } = vertices[i];
			const { x: xj, y: yj } = vertices[j];
			if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}

	private getPolygonArea(vertices: { x: number; y: number }[]): number {
		// Shoelace formula for polygon area
		let area = 0;
		for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			area += (vertices[j].x + vertices[i].x) * (vertices[j].y - vertices[i].y);
		}
		return Math.abs(area / 2);
	}

	private isPointInCell(px: number, py: number, cx: number, cy: number, radius: number): boolean {
		const expandedRadius = radius + 20;
		return (px - cx) ** 2 + (py - cy) ** 2 <= expandedRadius ** 2;
	}

	// --- Snippet points for video playback ---

	private getSnippetPointsForVertex(hovered: HoveredVertex, fingerprints: SpeakerFingerprintData[]): DataPoint[] {
		if (!hovered) return [];

		const fp = fingerprints.find((f) => f.speaker === hovered.speaker);
		if (!fp) return [];

		// If hovering polygon (not vertex), return all turns
		if (hovered.axisIndex === -1) {
			return fp.allTurnFirstWords || [];
		}

		// Return dimension-specific turns (pre-computed in dynamic-data.ts)
		// Axes: 0=Turn Length, 1=Participation, 2=Consecutive, 3=Questions, 4=Interruptions
		switch (hovered.axisIndex) {
			case 2: // Consecutive
				return fp.consecutiveTurnFirstWords || [];
			case 3: // Questions
				return fp.questionTurnFirstWords || [];
			case 4: // Interruptions
				return fp.interruptionTurnFirstWords || [];
			default: // Turn Length, Participation - play all turns
				return fp.allTurnFirstWords || [];
		}
	}

	private resolveSpeakerColor(fp: SpeakerFingerprintData): string {
		const baseColor = this.ctx.userMap.get(fp.speaker)?.color || DEFAULT_SPEAKER_COLOR;
		return getDominantCodeColor(fp.allTurnFirstWords || [], baseColor, this.ctx.codeColorMap, this.ctx.config.codeColorMode);
	}

	// --- Tooltip ---

	private showTooltipFor(fp: SpeakerFingerprintData): void {
		const color = this.resolveSpeakerColor(fp);
		const pct = (v: number) => `${Math.round(v * 100)}%`;
		const avgTurnWords = fp.totalTurns > 0 ? (fp.totalWords / fp.totalTurns).toFixed(1) : '0';
		const totalConversationTurns =
			fp.rawParticipationRate > 0 && isFinite(fp.rawParticipationRate) ? Math.round(fp.totalTurns / fp.rawParticipationRate) : fp.totalTurns;

		let content = `<b>${toTitleCase(fp.speaker)}</b>\n`;
		content += `<span style="font-size: 0.85em; opacity: 0.8">`;
		content += `<b>Turn Length:</b> ${avgTurnWords} words per turn avg\n`;
		content += `<b>Participation:</b> ${fp.totalTurns} of ${totalConversationTurns} turns taken (${pct(fp.rawParticipationRate)})\n`;
		content += `<b>Consecutive:</b> ${fp.consecutiveTurns} turns followed own turn (${pct(fp.rawConsecutiveRate)})\n`;
		content += `<b>Questions:</b> ${fp.questionTurns} turns with ? or question words (${pct(fp.rawQuestionRate)})`;

		if (this.hasTiming) {
			content += `\n<b>Interruptions:</b> ${fp.interruptionTurns} overlapping previous speaker (${pct(fp.rawInterruptionRate)})`;
		}

		content += `</span>`;

		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, content, color, this.bounds.y + this.bounds.height);
	}
}
