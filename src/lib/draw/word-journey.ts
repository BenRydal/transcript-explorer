import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import type { WordOccurrence } from '../core/dynamic-data';
import { withDimming, getCrossHighlight, drawTimeAxis, getWordColor } from './draw-utils';
import { DrawContext } from './draw-context';
import { orderLanes, partitionLanes, truncateMiddle, clusterByLane, clusterRadius, type Cluster } from './lane-layout';

const GUTTER_MIN = 60;
const GUTTER_MAX = 220;
const GUTTER_PAD = 14;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 30;
const BOTTOM_MARGIN = 50;
const ABSENT_ROW_HEIGHT = 24;

const DOT_RADIUS = 6;
const FIRST_DOT_RADIUS = 10;
const MAX_CLUSTER_RADIUS = 15;
const LANE_LINE_WEIGHT = 2;
const HOVER_OUTLINE_WEIGHT = 2;

// The thread is the argument of this view, so it outranks the lane lines it
// crosses. It was previously a muted hairline behind everything.
const THREAD_WEIGHT = 1.9;
const THREAD_ALPHA = 170;

interface RenderedOccurrence {
	occurrence: WordOccurrence;
	x: number;
	speaker: string;
}

interface RenderedCluster extends Cluster<RenderedOccurrence> {
	y: number;
	radius: number;
	time: number;
	isFirst: boolean;
	isFirstBySpeaker: boolean;
}

export class WordJourney {
	private ctx: DrawContext;
	private bounds: Bounds;
	private speakers: string[];
	private timeline: { leftMarker: number; rightMarker: number };
	private gx: number;
	private gy: number;
	private gw: number;
	private gh: number;
	private laneHeight = 0;
	private labelSize = 10;

	constructor(ctx: DrawContext, bounds: Bounds) {
		this.ctx = ctx;
		this.bounds = bounds;
		this.speakers = this.ctx.users.filter((u) => u.enabled).map((u) => u.name);
		this.timeline = { leftMarker: this.ctx.timeline.leftMarker, rightMarker: this.ctx.timeline.rightMarker };

		this.gx = bounds.x + GUTTER_MIN;
		this.gy = bounds.y + TOP_MARGIN;
		this.gw = bounds.width - GUTTER_MIN - RIGHT_MARGIN;
		this.gh = bounds.height - TOP_MARGIN - BOTTOM_MARGIN;
	}

	draw(data: { word: string; occurrences: WordOccurrence[] }): { hoveredDataPoint: DataPoint | null; hoveredSpeaker: string | null } {
		if (!data.word || this.speakers.length === 0) {
			this.drawCenteredMessage(data.word ? 'No matching words found' : 'Type a word in the Filter search box to see its journey');
			return { hoveredDataPoint: null, hoveredSpeaker: null };
		}

		if (data.occurrences.length === 0) {
			this.drawCenteredMessage(`No occurrences of "${data.word}" found in transcript`);
			return { hoveredDataPoint: null, hoveredSpeaker: null };
		}

		const counts = new Map<string, number>();
		for (const occ of data.occurrences) counts.set(occ.speaker, (counts.get(occ.speaker) ?? 0) + 1);

		const ordered = orderLanes(this.speakers, counts, this.ctx.config.wordJourneyLaneOrder);
		const { present, absent } = partitionLanes(ordered, counts);
		const hideAbsent = this.ctx.config.wordJourneyHideAbsent && present.length > 0;
		const lanes = hideAbsent ? present : ordered;
		const hiddenCount = hideAbsent ? absent.length : 0;

		this.layout(lanes, hiddenCount > 0);
		this.drawTitle(data.word, data.occurrences.length, present.length, ordered.length);
		this.drawSpeakerLanes(lanes, counts);
		drawTimeAxis(this.ctx.sk, this.bounds, this, this.timeline, this.ctx.theme);

		const clusters = this.buildClusters(data.occurrences, lanes);
		const hovered = this.findHoveredCluster(clusters);
		this.drawThread(clusters);
		this.drawClusters(clusters, hovered);

		if (hiddenCount > 0) this.drawAbsentRow(hiddenCount, data.word);

		if (hovered) {
			this.showClusterTooltip(hovered);
			const lead = hovered.members[0].occurrence;
			return { hoveredDataPoint: lead.dataPoint, hoveredSpeaker: lead.speaker };
		}

		return { hoveredDataPoint: null, hoveredSpeaker: null };
	}

	/** Sizes the label gutter to the labels actually being drawn, then the grid. */
	private layout(lanes: string[], reserveAbsentRow: boolean): void {
		this.labelSize = Math.max(9, Math.min(11, this.bounds.height * 0.025));
		this.ctx.sk.textSize(this.labelSize);

		let widest = 0;
		for (const speaker of lanes) widest = Math.max(widest, this.ctx.sk.textWidth(speaker));

		const available = this.bounds.width * 0.28;
		const gutter = Math.min(GUTTER_MAX, Math.max(GUTTER_MIN, Math.min(widest + GUTTER_PAD, available)));

		this.gx = this.bounds.x + gutter;
		this.gy = this.bounds.y + TOP_MARGIN;
		this.gw = this.bounds.width - gutter - RIGHT_MARGIN;
		this.gh = this.bounds.height - TOP_MARGIN - BOTTOM_MARGIN - (reserveAbsentRow ? ABSENT_ROW_HEIGHT : 0);
		this.laneHeight = this.gh / Math.max(1, lanes.length);
	}

	private drawCenteredMessage(message: string): void {
		this.ctx.sk.fill(this.ctx.theme.fgMuted);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.CENTER);
		this.ctx.sk.textSize(20);
		this.ctx.sk.text(message, this.bounds.x + this.bounds.width / 2, this.bounds.y + this.bounds.height / 2);
	}

	private drawTitle(word: string, count: number, carrying: number, total: number): void {
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.TOP);
		this.ctx.sk.textSize(Math.max(10, Math.min(14, this.bounds.height * 0.03)));

		const headline = `"${word}" - ${count} occurrence${count !== 1 ? 's' : ''}`;
		this.ctx.sk.fill(this.ctx.theme.fg);
		this.ctx.sk.text(headline, this.bounds.x + 10, this.bounds.y + 8);

		if (total > 1) {
			const width = this.ctx.sk.textWidth(headline);
			this.ctx.sk.fill(this.ctx.theme.fgMuted);
			this.ctx.sk.text(`· carried by ${carrying} of ${total} actors`, this.bounds.x + 18 + width, this.bounds.y + 8);
		}
	}

	private drawSpeakerLanes(lanes: string[], counts: ReadonlyMap<string, number>): void {
		this.ctx.sk.textSize(this.labelSize);
		const maxLabelWidth = this.gx - this.bounds.x - 10;

		for (let i = 0; i < lanes.length; i++) {
			const speaker = lanes[i];
			const user = this.ctx.userMap.get(speaker);
			const y = this.laneY(i);
			const carries = (counts.get(speaker) ?? 0) > 0;

			this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.CENTER);
			this.ctx.sk.noStroke();
			this.ctx.sk.fill(carries ? this.ctx.theme.fg : this.ctx.theme.fgMuted);
			this.ctx.sk.text(
				truncateMiddle(speaker, maxLabelWidth, (t) => this.ctx.sk.textWidth(t)),
				this.gx - 10,
				y
			);

			const c = this.ctx.sk.color(user?.color || '#cccccc');
			c.setAlpha(carries ? 60 : 22);
			this.ctx.sk.stroke(c);
			this.ctx.sk.strokeWeight(LANE_LINE_WEIGHT);
			this.ctx.sk.line(this.gx, y, this.gx + this.gw, y);
		}
	}

	private laneY(index: number): number {
		return this.gy + this.laneHeight * index + this.laneHeight / 2;
	}

	private buildClusters(occurrences: WordOccurrence[], lanes: string[]): RenderedCluster[] {
		const duration = this.timeline.rightMarker - this.timeline.leftMarker;
		const laneIndex = new Map(lanes.map((s, i) => [s, i]));

		const rendered: RenderedOccurrence[] = [];
		for (const occ of occurrences) {
			if (!laneIndex.has(occ.speaker)) continue;
			const x = this.gx + (duration > 0 ? ((occ.startTime - this.timeline.leftMarker) / duration) * this.gw : 0);
			rendered.push({ occurrence: occ, x, speaker: occ.speaker });
		}

		const base = Math.max(3, Math.min(DOT_RADIUS, this.laneHeight * 0.35));
		const firstBase = Math.max(base + 2, Math.min(FIRST_DOT_RADIUS, this.laneHeight * 0.5));

		const clusters = clusterByLane(rendered, base).map((cluster): RenderedCluster => {
			const isFirst = cluster.members.some((m) => m.occurrence.isFirst);
			const isFirstBySpeaker = cluster.members.some((m) => m.occurrence.isFirstBySpeaker);
			const radius = isFirst ? firstBase : clusterRadius(cluster.members.length, base, MAX_CLUSTER_RADIUS);
			return {
				...cluster,
				y: this.laneY(laneIndex.get(cluster.speaker) ?? 0),
				radius,
				time: Math.min(...cluster.members.map((m) => m.occurrence.startTime)),
				isFirst,
				isFirstBySpeaker
			};
		});

		clusters.sort((a, b) => a.time - b.time);
		return clusters;
	}

	private findHoveredCluster(clusters: RenderedCluster[]): RenderedCluster | null {
		if (!this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) return null;

		const mx = this.ctx.sk.mouseX;
		const my = this.ctx.sk.mouseY;
		for (const cluster of clusters) {
			if (this.ctx.sk.dist(mx, my, cluster.x, cluster.y) <= cluster.radius + 4) return cluster;
		}
		return null;
	}

	/**
	 * Draws the trail linking consecutive occurrences. Each leg is split at its
	 * midpoint and coloured from each end, so a handoff between actors reads as
	 * a colour change rather than as undifferentiated grey.
	 */
	private drawThread(clusters: RenderedCluster[]): void {
		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);
		this.ctx.sk.strokeWeight(THREAD_WEIGHT);

		for (let i = 1; i < clusters.length; i++) {
			const prev = clusters[i - 1];
			const curr = clusters[i];

			const shouldDim =
				crossHighlight.active && crossHighlight.speaker != null && prev.speaker !== crossHighlight.speaker && curr.speaker !== crossHighlight.speaker;

			withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
				const midX = (prev.x + curr.x) / 2;
				const midY = (prev.y + curr.y) / 2;
				this.strokeLeg(prev.speaker, prev.x, prev.y, midX, midY);
				this.strokeLeg(curr.speaker, midX, midY, curr.x, curr.y);
			});
		}
	}

	private strokeLeg(speaker: string, x1: number, y1: number, x2: number, y2: number): void {
		const c = this.ctx.sk.color(this.ctx.userMap.get(speaker)?.color || this.ctx.theme.fgMuted);
		c.setAlpha(THREAD_ALPHA);
		this.ctx.sk.stroke(c);
		this.ctx.sk.line(x1, y1, x2, y2);
	}

	private drawClusters(clusters: RenderedCluster[], hovered: RenderedCluster | null): void {
		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);

		for (const cluster of clusters) {
			const lead = cluster.members[0].occurrence;
			const user = this.ctx.userMap.get(cluster.speaker);
			const color = this.ctx.sk.color(
				getWordColor(lead.dataPoint.codes, user?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode)
			);
			const shouldDim = crossHighlight.active && crossHighlight.speaker != null && cluster.speaker !== crossHighlight.speaker;

			withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
				if (cluster === hovered) {
					this.ctx.sk.stroke(color);
					this.ctx.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
				} else {
					this.ctx.sk.noStroke();
				}

				color.setAlpha(220);
				this.ctx.sk.fill(color);

				if (cluster.isFirst) this.drawStar(cluster.x, cluster.y, cluster.radius);
				else if (cluster.isFirstBySpeaker) this.drawDiamond(cluster.x, cluster.y, cluster.radius);
				else this.ctx.sk.ellipse(cluster.x, cluster.y, cluster.radius * 2, cluster.radius * 2);

				if (cluster.members.length > 1) this.drawClusterCount(cluster);
			});
		}
	}

	/** A merged mark states how many occurrences it stands for. */
	private drawClusterCount(cluster: RenderedCluster): void {
		const size = cluster.radius * 1.1;
		if (size < 8) return;

		this.ctx.sk.noStroke();
		this.ctx.sk.fill(this.ctx.theme.bg);
		this.ctx.sk.textSize(size);
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.CENTER);
		this.ctx.sk.text(String(cluster.members.length), cluster.x, cluster.y + 0.5);
	}

	/**
	 * Reports the lanes trimmed from the view. The count is a finding about the
	 * token, so it is stated rather than left as an absence.
	 */
	private drawAbsentRow(hiddenCount: number, word: string): void {
		const y = this.gy + this.gh + ABSENT_ROW_HEIGHT / 2;

		const rule = this.ctx.sk.color(this.ctx.theme.fgMuted);
		rule.setAlpha(45);
		this.ctx.sk.stroke(rule);
		this.ctx.sk.strokeWeight(1);
		this.ctx.sk.line(this.gx, y, this.gx + this.gw, y);

		this.ctx.sk.noStroke();
		this.ctx.sk.fill(this.ctx.theme.fgMuted);
		this.ctx.sk.textSize(this.labelSize);
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.CENTER);

		const label = `${hiddenCount} actor${hiddenCount !== 1 ? 's' : ''} never used "${word}"`;
		const pad = 6;
		const width = this.ctx.sk.textWidth(label) + pad * 2;
		this.ctx.sk.fill(this.ctx.theme.bg);
		this.ctx.sk.rect(this.gx - pad, y - this.labelSize, width, this.labelSize * 2);
		this.ctx.sk.fill(this.ctx.theme.fgMuted);
		this.ctx.sk.text(label, this.gx, y);
	}

	private drawStar(x: number, y: number, radius: number): void {
		const points = 5;
		this.ctx.sk.beginShape();
		for (let i = 0; i < points * 2; i++) {
			const angle = (this.ctx.sk.TWO_PI * i) / (points * 2) - this.ctx.sk.HALF_PI;
			const r = i % 2 === 0 ? radius : radius * 0.5;
			this.ctx.sk.vertex(x + this.ctx.sk.cos(angle) * r, y + this.ctx.sk.sin(angle) * r);
		}
		this.ctx.sk.endShape(this.ctx.sk.CLOSE);
	}

	private drawDiamond(x: number, y: number, radius: number): void {
		this.ctx.sk.quad(x, y - radius, x + radius, y, x, y + radius, x - radius, y);
	}

	private showClusterTooltip(cluster: RenderedCluster): void {
		const lead = cluster.members[0].occurrence;
		const user = this.ctx.userMap.get(lead.speaker);
		const merged = cluster.members.length > 1;

		let content = `<b>${lead.speaker}</b>`;
		if (merged) {
			content += `<span style="opacity: 0.7"> · ${cluster.members.length} occurrences</span>`;
		}
		content += `\n${this.highlightWordInText(lead.turnContent, lead.matchedWord)}`;

		if (cluster.isFirst) content += '\n<span style="color: gold">First occurrence</span>';
		else if (cluster.isFirstBySpeaker) content += '\n<span style="opacity: 0.7">First by this speaker</span>';

		const last = cluster.members[cluster.members.length - 1].occurrence;
		const span = merged
			? `Turns ${lead.turnNumber}–${last.turnNumber} · ${formatTimeCompact(cluster.time)}`
			: `Turn ${lead.turnNumber} · ${formatTimeCompact(lead.startTime)}`;
		content += `\n<span style="font-size: 0.85em; opacity: 0.6">${span}</span>`;

		const tooltipColor = getWordColor(lead.dataPoint.codes, user?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode);
		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, content, tooltipColor, this.bounds.y + this.bounds.height);
	}

	private highlightWordInText(text: string, matchedWord: string): string {
		const escaped = matchedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escaped})`, 'gi');
		return text.replace(regex, '<b>$1</b>');
	}
}
