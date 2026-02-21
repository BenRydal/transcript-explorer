import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import type { WordOccurrence } from '../core/dynamic-data';
import { withDimming, getCrossHighlight, drawTimeAxis, getWordColor } from './draw-utils';
import { DrawContext } from './draw-context';

const LEFT_MARGIN = 80;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 30;
const BOTTOM_MARGIN = 50;
const DOT_RADIUS = 6;
const FIRST_DOT_RADIUS = 10;
const LANE_LINE_WEIGHT = 2;
const HOVER_OUTLINE_WEIGHT = 2;

interface RenderedOccurrence {
	occurrence: WordOccurrence;
	x: number;
	y: number;
	radius: number;
}

export class WordJourney {
	private ctx: DrawContext;
	private bounds: Bounds;
	private speakers: string[];
	private timeline: { leftMarker: number; rightMarker: number };
	// Grid coordinates
	private gx: number;
	private gy: number;
	private gw: number;
	private gh: number;

	constructor(ctx: DrawContext, bounds: Bounds) {
		this.ctx = ctx;
		this.bounds = bounds;
		this.speakers = this.ctx.users.filter((u) => u.enabled).map((u) => u.name);
		this.timeline = { leftMarker: this.ctx.timeline.leftMarker, rightMarker: this.ctx.timeline.rightMarker };

		this.gx = bounds.x + LEFT_MARGIN;
		this.gy = bounds.y + TOP_MARGIN;
		this.gw = bounds.width - LEFT_MARGIN - RIGHT_MARGIN;
		this.gh = bounds.height - TOP_MARGIN - BOTTOM_MARGIN;
	}

	draw(data: { word: string; occurrences: WordOccurrence[] }): { hoveredDataPoint: DataPoint | null; hoveredSpeaker: string | null } {
		if (!data.word || this.speakers.length === 0) {
			this.drawCenteredMessage(data.word ? 'No matching words found' : 'Type a word in the search box to see its journey');
			return { hoveredDataPoint: null, hoveredSpeaker: null };
		}

		if (data.occurrences.length === 0) {
			this.drawCenteredMessage(`No occurrences of "${data.word}" found in transcript`);
			return { hoveredDataPoint: null, hoveredSpeaker: null };
		}

		// Draw title
		this.drawTitle(data.word, data.occurrences.length);

		// Draw speaker lanes
		this.drawSpeakerLanes();

		// Draw timeline axis
		drawTimeAxis(this.ctx.sk, this.bounds, this, this.timeline);

		// Render occurrences
		const rendered = this.renderOccurrences(data.occurrences);

		// Find hovered occurrence
		const hoveredOcc = this.findHoveredOccurrence(rendered);

		// Draw connecting lines and dots
		this.drawOccurrences(rendered, hoveredOcc);

		if (hoveredOcc) {
			this.showOccurrenceTooltip(hoveredOcc.occurrence);
			return {
				hoveredDataPoint: hoveredOcc.occurrence.dataPoint,
				hoveredSpeaker: hoveredOcc.occurrence.speaker
			};
		}

		return { hoveredDataPoint: null, hoveredSpeaker: null };
	}

	private drawCenteredMessage(message: string): void {
		this.ctx.sk.fill(120);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.CENTER);
		this.ctx.sk.textSize(20);
		this.ctx.sk.text(message, this.bounds.x + this.bounds.width / 2, this.bounds.y + this.bounds.height / 2);
	}

	private drawTitle(word: string, count: number): void {
		this.ctx.sk.fill(80);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.TOP);
		this.ctx.sk.textSize(Math.max(10, Math.min(14, this.bounds.height * 0.03)));
		this.ctx.sk.text(`"${word}" - ${count} occurrence${count !== 1 ? 's' : ''}`, this.bounds.x + 10, this.bounds.y + 8);
	}

	private drawSpeakerLanes(): void {
		const laneHeight = this.gh / this.speakers.length;

		for (let i = 0; i < this.speakers.length; i++) {
			const speaker = this.speakers[i];
			const user = this.ctx.userMap.get(speaker);
			const y = this.gy + laneHeight * i + laneHeight / 2;

			// Speaker label
			this.ctx.sk.textSize(Math.max(9, Math.min(11, this.bounds.height * 0.025)));
			this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.CENTER);
			this.ctx.sk.noStroke();
			this.ctx.sk.fill(user?.color || '#666666');
			this.ctx.sk.text(speaker, this.gx - 10, y);

			// Lane line (horizontal track)
			this.ctx.sk.stroke(user?.color || '#cccccc');
			this.ctx.sk.strokeWeight(LANE_LINE_WEIGHT);
			const c = this.ctx.sk.color(user?.color || '#cccccc');
			c.setAlpha(60);
			this.ctx.sk.stroke(c);
			this.ctx.sk.line(this.gx, y, this.gx + this.gw, y);
		}
	}

	private renderOccurrences(occurrences: WordOccurrence[]): RenderedOccurrence[] {
		const duration = this.timeline.rightMarker - this.timeline.leftMarker;
		const laneHeight = this.gh / this.speakers.length;
		const speakerIndex = new Map(this.speakers.map((s, i) => [s, i]));

		return occurrences.map((occ) => {
			const idx = speakerIndex.get(occ.speaker) ?? 0;
			const x = this.gx + ((occ.startTime - this.timeline.leftMarker) / duration) * this.gw;
			const y = this.gy + laneHeight * idx + laneHeight / 2;
			const radius = occ.isFirst ? FIRST_DOT_RADIUS : DOT_RADIUS;

			return { occurrence: occ, x, y, radius };
		});
	}

	private findHoveredOccurrence(rendered: RenderedOccurrence[]): RenderedOccurrence | null {
		if (!this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.ctx.sk.mouseX;
		const my = this.ctx.sk.mouseY;

		for (const ro of rendered) {
			if (this.ctx.sk.dist(mx, my, ro.x, ro.y) <= ro.radius + 4) {
				return ro;
			}
		}

		return null;
	}

	private drawOccurrences(rendered: RenderedOccurrence[], hoveredOcc: RenderedOccurrence | null): void {
		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);

		// Draw connecting lines between consecutive occurrences
		this.ctx.sk.strokeWeight(1);
		for (let i = 1; i < rendered.length; i++) {
			const prev = rendered[i - 1];
			const curr = rendered[i];

			const shouldDim =
				crossHighlight.active &&
				crossHighlight.speaker != null &&
				prev.occurrence.speaker !== crossHighlight.speaker &&
				curr.occurrence.speaker !== crossHighlight.speaker;

			withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
				const c = this.ctx.sk.color(150);
				c.setAlpha(80);
				this.ctx.sk.stroke(c);
				this.ctx.sk.line(prev.x, prev.y, curr.x, curr.y);
			});
		}

		// Draw dots
		for (const ro of rendered) {
			const isHovered = hoveredOcc === ro;
			const user = this.ctx.userMap.get(ro.occurrence.speaker);
			const color = this.ctx.sk.color(getWordColor(ro.occurrence.dataPoint.codes, user?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode));

			const shouldDim = crossHighlight.active && crossHighlight.speaker != null && ro.occurrence.speaker !== crossHighlight.speaker;

			withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
				// Draw dot
				if (isHovered) {
					this.ctx.sk.stroke(color);
					this.ctx.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
				} else {
					this.ctx.sk.noStroke();
				}

				color.setAlpha(220);
				this.ctx.sk.fill(color);

				if (ro.occurrence.isFirst) {
					// First overall occurrence: star shape
					this.drawStar(ro.x, ro.y, ro.radius);
				} else if (ro.occurrence.isFirstBySpeaker) {
					// First by speaker: diamond
					this.drawDiamond(ro.x, ro.y, ro.radius);
				} else {
					// Regular occurrence: circle
					this.ctx.sk.ellipse(ro.x, ro.y, ro.radius * 2, ro.radius * 2);
				}
			});
		}
	}

	private drawStar(x: number, y: number, radius: number): void {
		const points = 5;
		const outerRadius = radius;
		const innerRadius = radius * 0.5;

		this.ctx.sk.beginShape();
		for (let i = 0; i < points * 2; i++) {
			const angle = (this.ctx.sk.TWO_PI * i) / (points * 2) - this.ctx.sk.HALF_PI;
			const r = i % 2 === 0 ? outerRadius : innerRadius;
			this.ctx.sk.vertex(x + this.ctx.sk.cos(angle) * r, y + this.ctx.sk.sin(angle) * r);
		}
		this.ctx.sk.endShape(this.ctx.sk.CLOSE);
	}

	private drawDiamond(x: number, y: number, radius: number): void {
		this.ctx.sk.quad(x, y - radius, x + radius, y, x, y + radius, x - radius, y);
	}

	private showOccurrenceTooltip(occ: WordOccurrence): void {
		const user = this.ctx.userMap.get(occ.speaker);
		const turnText = this.highlightWordInText(occ.turnContent, occ.matchedWord);

		let content = `<b>${occ.speaker}</b>\n${turnText}`;

		if (occ.isFirst) {
			content += '\n<span style="color: gold">First occurrence</span>';
		} else if (occ.isFirstBySpeaker) {
			content += '\n<span style="opacity: 0.7">First by this speaker</span>';
		}

		content += `\n<span style="font-size: 0.85em; opacity: 0.6">Turn ${occ.turnNumber} · ${formatTimeCompact(occ.startTime)}</span>`;

		const tooltipColor = getWordColor(occ.dataPoint.codes, user?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode);
		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, content, tooltipColor, this.bounds.y + this.bounds.height);
	}

	private highlightWordInText(text: string, matchedWord: string): string {
		const escaped = matchedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escaped})`, 'gi');
		return text.replace(regex, '<b>$1</b>');
	}
}
