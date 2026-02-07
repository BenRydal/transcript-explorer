/**
 * Speaker Fingerprint Visualization
 *
 * A radar chart showing each speaker's speaking style profile across multiple dimensions:
 * - Average turn length
 * - Participation rate (% of turns)
 * - Verbosity rate (% of words)
 * - Vocabulary diversity (type-token ratio)
 * - Question rate (% of turns with questions)
 * - Interruption rate (% of turns that interrupt)
 */

import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import TranscriptStore from '../../stores/transcriptStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import type { SpeakerFingerprintData } from '../core/dynamic-data';
import { DEFAULT_SPEAKER_COLOR } from '../constants/ui';
import { toTitleCase } from '../core/string-utils';
import { createUserMap } from './draw-utils';

// --- Constants ---

const NUM_AXES = 6;
const AXIS_LABELS = ['Turn Length', 'Participation', 'Consecutive', 'Vocabulary', 'Questions', 'Interrupts'];
const AXIS_LABELS_FULL = ['Turn Length', 'Participation', 'Consecutive Turns', 'Vocabulary', 'Questions', 'Interruptions'];
const AXIS_KEYS: (keyof SpeakerFingerprintData)[] = [
	'avgTurnLength',
	'participationRate',
	'consecutiveRate',
	'vocabularyDiversity',
	'questionRate',
	'interruptionRate'
];

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

type HoveredVertex = { speaker: string; axisIndex: number } | null;

// --- Main class ---

export class SpeakerFingerprint {
	private sk: p5;
	private bounds: Bounds;
	private userMap: Map<string, User>;
	private config: ConfigStoreType;
	private hasTiming: boolean;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.userMap = createUserMap(get(UserStore));
		this.config = get(ConfigStore);
		const transcript = get(TranscriptStore);
		this.hasTiming = transcript.timingMode !== 'untimed';
	}

	draw(fingerprints: SpeakerFingerprintData[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		if (fingerprints.length === 0) {
			return { snippetPoints: [], hoveredSpeaker: null };
		}

		return this.config.fingerprintOverlayMode ? this.drawOverlay(fingerprints) : this.drawSmallMultiples(fingerprints);
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

			const isInCell = this.isPointInCell(this.sk.mouseX, this.sk.mouseY, cellX, cellY, cellRadius);
			if (isInCell) {
				// Check for vertex hover within this cell
				const vertexHover = this.findHoveredVertex([fp], cellX, cellY, cellRadius);
				if (vertexHover) hoveredVertex = vertexHover;
			}

			this.drawRadarGrid(cellX, cellY, cellRadius, true);
			if (i === 0) this.drawAxisLabelsShort(cellX, cellY, cellRadius);
			this.drawSpeakerPolygon(fp, cellX, cellY, cellRadius, hoveredVertex?.speaker === fp.speaker);

			// Draw speaker name below
			const color = this.userMap.get(fp.speaker)?.color || DEFAULT_SPEAKER_COLOR;
			this.sk.fill(color);
			this.sk.noStroke();
			this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
			this.sk.textSize(11);
			this.sk.text(toTitleCase(fp.speaker), cellX, cellY + cellRadius + 5);
		}

		const hoveredSpeaker = hoveredVertex?.speaker ?? null;
		this.showTooltipIfHovered(fingerprints, hoveredSpeaker);
		const snippetPoints = this.getSnippetPointsForVertex(hoveredVertex, fingerprints);
		return { snippetPoints, hoveredSpeaker };
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

		// Concentric rings
		this.sk.noFill();
		this.sk.stroke(200, GRID_OPACITY);
		this.sk.strokeWeight(1);
		for (let r = 1; r <= rings; r++) {
			const ringRadius = (radius * r) / rings;
			this.sk.beginShape();
			for (let i = 0; i < NUM_AXES; i++) {
				const angle = getAxisAngle(i);
				this.sk.vertex(cx + Math.cos(angle) * ringRadius, cy + Math.sin(angle) * ringRadius);
			}
			this.sk.endShape(this.sk.CLOSE);
		}

		// Axis lines
		this.sk.stroke(180, AXIS_OPACITY);
		for (let i = 0; i < NUM_AXES; i++) {
			const angle = getAxisAngle(i);
			this.sk.line(cx, cy, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
		}

		// Scale labels along the top axis
		this.sk.noStroke();
		this.sk.fill(100);
		this.sk.textSize(minimal ? 8 : 9);
		this.sk.textAlign(this.sk.LEFT, this.sk.CENTER);
		const labels = minimal ? ['Low', 'Most'] : ['Low', 'Med', 'High', 'Most'];
		for (let r = 1; r <= rings; r++) {
			this.sk.text(labels[r - 1], cx + 3, cy - (radius * r) / rings);
		}
	}

	private drawAxisLabels(cx: number, cy: number, radius: number): void {
		this.drawAxisLabelsImpl(cx, cy, radius + LABEL_OFFSET, 11, 80, true);
	}

	private drawAxisLabelsShort(cx: number, cy: number, radius: number): void {
		this.drawAxisLabelsImpl(cx, cy, radius + SMALL_MULTIPLE_LABEL_OFFSET, 10, 120, false);
	}

	private drawAxisLabelsImpl(cx: number, cy: number, labelRadius: number, textSize: number, defaultFill: number, fullMode: boolean): void {
		this.sk.noStroke();
		this.sk.textSize(textSize);
		const labels = fullMode ? AXIS_LABELS_FULL : AXIS_LABELS;

		for (let i = 0; i < NUM_AXES; i++) {
			const angle = getAxisAngle(i);
			const x = cx + Math.cos(angle) * labelRadius;
			const y = cy + Math.sin(angle) * labelRadius;
			this.setTextAlignForAngle(angle);

			const isInterruptionsDisabled = AXIS_KEYS[i] === 'interruptionRate' && !this.hasTiming;
			this.sk.fill(isInterruptionsDisabled ? 180 : defaultFill);
			const label = isInterruptionsDisabled && fullMode ? labels[i] + ' (N/A)' : labels[i];
			this.sk.text(label, x, y);
		}
	}

	private setTextAlignForAngle(angle: number): void {
		if (Math.abs(angle + Math.PI / 2) < 0.1) {
			this.sk.textAlign(this.sk.CENTER, this.sk.BOTTOM);
		} else if (Math.abs(angle - Math.PI / 2) < 0.1) {
			this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
		} else if (Math.cos(angle) > 0) {
			this.sk.textAlign(this.sk.LEFT, this.sk.CENTER);
		} else {
			this.sk.textAlign(this.sk.RIGHT, this.sk.CENTER);
		}
	}

	private drawSpeakerPolygon(fp: SpeakerFingerprintData, cx: number, cy: number, radius: number, isHovered: boolean): void {
		const color = this.sk.color(this.userMap.get(fp.speaker)?.color || DEFAULT_SPEAKER_COLOR);
		const vertices = this.getPolygonVertices(fp, cx, cy, radius);

		// Draw filled polygon
		color.setAlpha(isHovered ? POLYGON_HOVER_OPACITY : POLYGON_OPACITY);
		this.sk.fill(color);
		color.setAlpha(255);
		this.sk.stroke(color);
		this.sk.strokeWeight(isHovered ? STROKE_HOVER_WEIGHT : STROKE_WEIGHT);

		this.sk.beginShape();
		for (const v of vertices) {
			this.sk.vertex(v.x, v.y);
		}
		this.sk.endShape(this.sk.CLOSE);

		// Draw vertex points
		this.sk.noStroke();
		this.sk.fill(color);
		const dotSize = isHovered ? 6 : 4;
		for (const v of vertices) {
			this.sk.ellipse(v.x, v.y, dotSize, dotSize);
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
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.sk.mouseX;
		const my = this.sk.mouseY;

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
		switch (hovered.axisIndex) {
			case 2: // Consecutive
				return fp.consecutiveTurnFirstWords || [];
			case 4: // Questions
				return fp.questionTurnFirstWords || [];
			case 5: // Interruptions
				return fp.interruptionTurnFirstWords || [];
			default: // Turn Length, Participation, Vocabulary - play all turns
				return fp.allTurnFirstWords || [];
		}
	}

	// --- Tooltip ---

	private showTooltipFor(fp: SpeakerFingerprintData): void {
		const color = this.userMap.get(fp.speaker)?.color || DEFAULT_SPEAKER_COLOR;
		const pct = (v: number) => `${Math.round(v * 100)}%`;
		const avgTurnWords = fp.totalTurns > 0 ? (fp.totalWords / fp.totalTurns).toFixed(1) : '0';
		const totalConversationTurns =
			fp.rawParticipationRate > 0 && isFinite(fp.rawParticipationRate)
				? Math.round(fp.totalTurns / fp.rawParticipationRate)
				: fp.totalTurns;

		let content = `<b>${toTitleCase(fp.speaker)}</b>\n`;
		content += `<span style="font-size: 0.85em; opacity: 0.8">`;
		content += `<b>Turn Length:</b> ${avgTurnWords} words per turn avg\n`;
		content += `<b>Participation:</b> ${fp.totalTurns} of ${totalConversationTurns} turns taken (${pct(fp.rawParticipationRate)})\n`;
		content += `<b>Consecutive:</b> ${fp.consecutiveTurns} turns followed own turn (${pct(fp.rawConsecutiveRate)})\n`;
		content += `<b>Vocabulary:</b> ${fp.uniqueWords} unique of ${fp.totalWords} words\n`;
		content += `<b>Questions:</b> ${fp.questionTurns} turns with ? or question words (${pct(fp.rawQuestionRate)})`;

		if (this.hasTiming) {
			content += `\n<b>Interruptions:</b> ${fp.interruptionTurns} overlapping previous speaker (${pct(fp.rawInterruptionRate)})`;
		}

		content += `</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, color, this.bounds.y + this.bounds.height);
	}
}
