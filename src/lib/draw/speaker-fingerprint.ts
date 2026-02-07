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

// --- Constants ---

const NUM_AXES = 6;
const AXIS_LABELS = ['Turn Length', 'Participation', 'Verbosity', 'Vocab Diversity', 'Questions', 'Interruptions'];
const AXIS_KEYS: (keyof SpeakerFingerprintData)[] = [
	'avgTurnLength',
	'participationRate',
	'verbosityRate',
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
		this.userMap = new Map(get(UserStore).map((u) => [u.name, u]));
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

		// Find hovered speaker
		const hoveredSpeaker = this.findHoveredSpeaker(fingerprints, centerX, centerY, radius);

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
		return { snippetPoints: [], hoveredSpeaker };
	}

	// --- Small multiples mode (5+ speakers) ---

	private drawSmallMultiples(fingerprints: SpeakerFingerprintData[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		const cols = Math.ceil(Math.sqrt(fingerprints.length));
		const rows = Math.ceil(fingerprints.length / cols);
		const cellWidth = (this.bounds.width - SMALL_MULTIPLE_PADDING) / cols;
		const cellHeight = (this.bounds.height - SMALL_MULTIPLE_PADDING) / rows;
		const cellRadius = Math.max(30, Math.min(cellWidth, cellHeight) / 2 - SMALL_MULTIPLE_PADDING);

		let hoveredSpeaker: string | null = null;

		fingerprints.forEach((fp, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			const cellX = this.bounds.x + col * cellWidth + cellWidth / 2;
			const cellY = this.bounds.y + row * cellHeight + cellHeight / 2;

			const isHovered = this.isPointInCell(this.sk.mouseX, this.sk.mouseY, cellX, cellY, cellRadius);
			if (isHovered) hoveredSpeaker = fp.speaker;

			this.drawRadarGrid(cellX, cellY, cellRadius, true);
			if (i === 0) this.drawAxisLabelsShort(cellX, cellY, cellRadius);
			this.drawSpeakerPolygon(fp, cellX, cellY, cellRadius, isHovered);

			// Draw speaker name below
			const color = this.userMap.get(fp.speaker)?.color || DEFAULT_SPEAKER_COLOR;
			this.sk.fill(color);
			this.sk.noStroke();
			this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
			this.sk.textSize(11);
			this.sk.text(toTitleCase(fp.speaker), cellX, cellY + cellRadius + 5);
		});

		this.showTooltipIfHovered(fingerprints, hoveredSpeaker);
		return { snippetPoints: [], hoveredSpeaker };
	}

	private showTooltipIfHovered(fingerprints: SpeakerFingerprintData[], hoveredSpeaker: string | null): void {
		if (hoveredSpeaker) {
			const fp = fingerprints.find((f) => f.speaker === hoveredSpeaker);
			if (fp) this.showTooltipFor(fp);
		}
	}

	// --- Drawing helpers ---

	private drawRadarGrid(cx: number, cy: number, radius: number, minimal = false): void {
		this.sk.noFill();
		this.sk.stroke(200, GRID_OPACITY);
		this.sk.strokeWeight(1);

		// Concentric rings
		const rings = minimal ? 2 : GRID_RINGS;
		for (let r = 1; r <= rings; r++) {
			const ringRadius = (radius * r) / rings;
			this.sk.beginShape();
			for (let i = 0; i < NUM_AXES; i++) {
				const angle = (i / NUM_AXES) * Math.PI * 2 - Math.PI / 2;
				const x = cx + Math.cos(angle) * ringRadius;
				const y = cy + Math.sin(angle) * ringRadius;
				this.sk.vertex(x, y);
			}
			this.sk.endShape(this.sk.CLOSE);
		}

		// Axis lines
		this.sk.stroke(180, AXIS_OPACITY);
		for (let i = 0; i < NUM_AXES; i++) {
			const angle = (i / NUM_AXES) * Math.PI * 2 - Math.PI / 2;
			const x = cx + Math.cos(angle) * radius;
			const y = cy + Math.sin(angle) * radius;
			this.sk.line(cx, cy, x, y);
		}

		// Scale labels along the top axis
		this.sk.noStroke();
		this.sk.fill(100);
		this.sk.textSize(minimal ? 8 : 9);
		this.sk.textAlign(this.sk.LEFT, this.sk.CENTER);
		const labels = minimal ? ['Low', 'Most'] : ['Low', 'Med', 'High', 'Most'];
		for (let r = 1; r <= rings; r++) {
			const ringRadius = (radius * r) / rings;
			this.sk.text(labels[r - 1], cx + 3, cy - ringRadius);
		}
	}

	private drawAxisLabels(cx: number, cy: number, radius: number): void {
		this.sk.noStroke();
		this.sk.textSize(11);

		for (let i = 0; i < NUM_AXES; i++) {
			const { x, y, angle } = this.getAxisLabelPosition(cx, cy, radius + LABEL_OFFSET, i);
			this.setTextAlignForAngle(angle);

			const isInterruptions = AXIS_KEYS[i] === 'interruptionRate';
			this.sk.fill(isInterruptions && !this.hasTiming ? 180 : 80);
			const label = isInterruptions && !this.hasTiming ? AXIS_LABELS[i] + ' (N/A)' : AXIS_LABELS[i];
			this.sk.text(label, x, y);
		}
	}

	private drawAxisLabelsShort(cx: number, cy: number, radius: number): void {
		this.sk.noStroke();
		this.sk.textSize(10);

		for (let i = 0; i < NUM_AXES; i++) {
			const { x, y, angle } = this.getAxisLabelPosition(cx, cy, radius + SMALL_MULTIPLE_LABEL_OFFSET, i);
			this.setTextAlignForAngle(angle);

			const isInterruptions = AXIS_KEYS[i] === 'interruptionRate';
			this.sk.fill(isInterruptions && !this.hasTiming ? 180 : 120);
			this.sk.text(AXIS_LABELS[i], x, y);
		}
	}

	private getAxisLabelPosition(cx: number, cy: number, labelRadius: number, axisIndex: number): { x: number; y: number; angle: number } {
		const angle = (axisIndex / NUM_AXES) * Math.PI * 2 - Math.PI / 2;
		return {
			x: cx + Math.cos(angle) * labelRadius,
			y: cy + Math.sin(angle) * labelRadius,
			angle
		};
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
		const user = this.userMap.get(fp.speaker);
		const color = this.sk.color(user?.color || DEFAULT_SPEAKER_COLOR);
		const vertices = this.getPolygonVertices(fp, cx, cy, radius);

		// Draw filled polygon
		const fillColor = this.sk.color(color.toString());
		fillColor.setAlpha(isHovered ? POLYGON_HOVER_OPACITY : POLYGON_OPACITY);
		this.sk.fill(fillColor);
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
			const angle = (i / NUM_AXES) * Math.PI * 2 - Math.PI / 2;
			const value = Math.max(0, Math.min(1, fp[key] as number));
			const pointRadius = value * radius;
			return {
				x: cx + Math.cos(angle) * pointRadius,
				y: cy + Math.sin(angle) * pointRadius
			};
		});
	}

	// --- Hover detection ---

	private findHoveredSpeaker(fingerprints: SpeakerFingerprintData[], cx: number, cy: number, radius: number): string | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.sk.mouseX;
		const my = this.sk.mouseY;

		// First check vertex proximity (highest priority)
		let closestVertexSpeaker: string | null = null;
		let closestVertexDist = 15; // Max vertex detection radius

		for (const fp of fingerprints) {
			const vertices = this.getPolygonVertices(fp, cx, cy, radius);
			for (const v of vertices) {
				const dist = Math.sqrt((mx - v.x) ** 2 + (my - v.y) ** 2);
				if (dist < closestVertexDist) {
					closestVertexDist = dist;
					closestVertexSpeaker = fp.speaker;
				}
			}
		}

		if (closestVertexSpeaker) return closestVertexSpeaker;

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

		return containedSpeaker;
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
		const dx = px - cx;
		const dy = py - cy;
		return dx * dx + dy * dy <= (radius + 20) * (radius + 20);
	}

	// --- Tooltip ---

	private showTooltipFor(fp: SpeakerFingerprintData): void {
		const user = this.userMap.get(fp.speaker);
		const color = user?.color || DEFAULT_SPEAKER_COLOR;

		const pct = (v: number) => `${Math.round(v * 100)}%`;
		const avgTurnWords = fp.totalTurns > 0 ? (fp.totalWords / fp.totalTurns).toFixed(1) : '0';

		let content = `<b>${toTitleCase(fp.speaker)}</b>\n`;
		content += `<span style="font-size: 0.85em; opacity: 0.8">`;
		content += `Words: ${fp.totalWords} (${pct(fp.rawVerbosityRate)})\n`;
		content += `Turns: ${fp.totalTurns} (${pct(fp.rawParticipationRate)})\n`;
		content += `Avg turn: ${avgTurnWords} words\n`;
		content += `Vocabulary: ${fp.uniqueWords} unique (${pct(fp.rawVocabDiversity)} diversity)\n`;
		content += `Questions: ${fp.questionTurns} turns (${pct(fp.rawQuestionRate)})`;

		if (this.hasTiming) {
			content += `\nInterruptions: ${fp.interruptionTurns} turns (${pct(fp.rawInterruptionRate)})`;
		}

		content += `</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, color, this.bounds.y + this.bounds.height);
	}
}
