import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import HoverStore, { type HoverState } from '../../stores/hoverStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import type { WordOccurrence } from '../core/dynamic-data';
import { withDimming, createUserMap, getCrossHighlight, drawTimeAxis } from './draw-utils';

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
	private sk: p5;
	private bounds: Bounds;
	private userMap: Map<string, User>;
	private speakers: string[];
	private config: ConfigStoreType;
	private hover: HoverState;
	private timeline: { leftMarker: number; rightMarker: number };
	// Grid coordinates
	private gx: number;
	private gy: number;
	private gw: number;
	private gh: number;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		const users = get(UserStore);
		this.userMap = createUserMap(users);
		this.speakers = users.filter((u) => u.enabled).map((u) => u.name);
		this.config = get(ConfigStore);
		this.hover = get(HoverStore);
		const tl = get(TimelineStore);
		this.timeline = { leftMarker: tl.leftMarker, rightMarker: tl.rightMarker };

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
		drawTimeAxis(this.sk, this.bounds, this, this.timeline);

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
		this.sk.fill(120);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.CENTER, this.sk.CENTER);
		this.sk.textSize(20);
		this.sk.text(message, this.bounds.x + this.bounds.width / 2, this.bounds.y + this.bounds.height / 2);
	}

	private drawTitle(word: string, count: number): void {
		this.sk.fill(80);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.LEFT, this.sk.TOP);
		this.sk.textSize(Math.max(10, Math.min(14, this.bounds.height * 0.03)));
		this.sk.text(`"${word}" - ${count} occurrence${count !== 1 ? 's' : ''}`, this.bounds.x + 10, this.bounds.y + 8);
	}

	private drawSpeakerLanes(): void {
		const laneHeight = this.gh / this.speakers.length;

		for (let i = 0; i < this.speakers.length; i++) {
			const speaker = this.speakers[i];
			const user = this.userMap.get(speaker);
			const y = this.gy + laneHeight * i + laneHeight / 2;

			// Speaker label
			this.sk.textSize(Math.max(9, Math.min(11, this.bounds.height * 0.025)));
			this.sk.textAlign(this.sk.RIGHT, this.sk.CENTER);
			this.sk.noStroke();
			this.sk.fill(user?.color || '#666666');
			this.sk.text(speaker, this.gx - 10, y);

			// Lane line (horizontal track)
			this.sk.stroke(user?.color || '#cccccc');
			this.sk.strokeWeight(LANE_LINE_WEIGHT);
			const c = this.sk.color(user?.color || '#cccccc');
			c.setAlpha(60);
			this.sk.stroke(c);
			this.sk.line(this.gx, y, this.gx + this.gw, y);
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
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.sk.mouseX;
		const my = this.sk.mouseY;

		for (const ro of rendered) {
			if (this.sk.dist(mx, my, ro.x, ro.y) <= ro.radius + 4) {
				return ro;
			}
		}

		return null;
	}

	private drawOccurrences(rendered: RenderedOccurrence[], hoveredOcc: RenderedOccurrence | null): void {
		const crossHighlight = getCrossHighlight(this.sk, this.bounds, this.config.dashboardToggle, this.hover);

		// Draw connecting lines between consecutive occurrences
		this.sk.strokeWeight(1);
		for (let i = 1; i < rendered.length; i++) {
			const prev = rendered[i - 1];
			const curr = rendered[i];

			const shouldDim =
				crossHighlight.active &&
				crossHighlight.speaker != null &&
				prev.occurrence.speaker !== crossHighlight.speaker &&
				curr.occurrence.speaker !== crossHighlight.speaker;

			withDimming(this.sk.drawingContext, shouldDim, () => {
				const c = this.sk.color(150);
				c.setAlpha(80);
				this.sk.stroke(c);
				this.sk.line(prev.x, prev.y, curr.x, curr.y);
			});
		}

		// Draw dots
		for (const ro of rendered) {
			const isHovered = hoveredOcc === ro;
			const user = this.userMap.get(ro.occurrence.speaker);
			const color = this.sk.color(user?.color || '#999999');

			const shouldDim = crossHighlight.active && crossHighlight.speaker != null && ro.occurrence.speaker !== crossHighlight.speaker;

			withDimming(this.sk.drawingContext, shouldDim, () => {
				// Draw dot
				if (isHovered) {
					this.sk.stroke(color);
					this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
				} else {
					this.sk.noStroke();
				}

				color.setAlpha(220);
				this.sk.fill(color);

				if (ro.occurrence.isFirst) {
					// First overall occurrence: star shape
					this.drawStar(ro.x, ro.y, ro.radius);
				} else if (ro.occurrence.isFirstBySpeaker) {
					// First by speaker: diamond
					this.drawDiamond(ro.x, ro.y, ro.radius);
				} else {
					// Regular occurrence: circle
					this.sk.ellipse(ro.x, ro.y, ro.radius * 2, ro.radius * 2);
				}
			});
		}
	}

	private drawStar(x: number, y: number, radius: number): void {
		const points = 5;
		const outerRadius = radius;
		const innerRadius = radius * 0.5;

		this.sk.beginShape();
		for (let i = 0; i < points * 2; i++) {
			const angle = (this.sk.TWO_PI * i) / (points * 2) - this.sk.HALF_PI;
			const r = i % 2 === 0 ? outerRadius : innerRadius;
			this.sk.vertex(x + this.sk.cos(angle) * r, y + this.sk.sin(angle) * r);
		}
		this.sk.endShape(this.sk.CLOSE);
	}

	private drawDiamond(x: number, y: number, radius: number): void {
		this.sk.quad(x, y - radius, x + radius, y, x, y + radius, x - radius, y);
	}

	private showOccurrenceTooltip(occ: WordOccurrence): void {
		const user = this.userMap.get(occ.speaker);
		const turnText = this.highlightWordInText(occ.turnContent, occ.matchedWord);

		let content = `<b>${occ.speaker}</b>\n${turnText}`;

		if (occ.isFirst) {
			content += '\n<span style="color: gold">First occurrence</span>';
		} else if (occ.isFirstBySpeaker) {
			content += '\n<span style="opacity: 0.7">First by this speaker</span>';
		}

		content += `\n<span style="font-size: 0.85em; opacity: 0.6">Turn ${occ.turnNumber} · ${formatTimeCompact(occ.startTime)}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || '#999999', this.bounds.y + this.bounds.height);
	}

	private highlightWordInText(text: string, matchedWord: string): string {
		const escaped = matchedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escaped})`, 'gi');
		return text.replace(regex, '<b>$1</b>');
	}
}
