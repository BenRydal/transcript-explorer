import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import HoverStore, { type HoverState } from '../../stores/hoverStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import type { QuestionAnswerPair } from '../core/dynamic-data';
import { withDimming, createUserMap, getCrossHighlight } from './draw-utils';

const LEFT_MARGIN = 80;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 30;
const BOTTOM_MARGIN = 50;
const MIN_NODE_RADIUS = 4;
const MAX_NODE_RADIUS = 24;
const ARC_CONTROL_OFFSET = 40;
const HOVER_OUTLINE_WEIGHT = 2;

interface RenderedPair {
	pair: QuestionAnswerPair;
	qx: number;
	qy: number;
	ax: number | null;
	ay: number | null;
	qRadius: number;
	aRadius: number;
}

export class QuestionFlow {
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

	draw(pairs: QuestionAnswerPair[]): { hoveredDataPoint: DataPoint | null; hoveredSpeaker: string | null } {
		if (pairs.length === 0 || this.speakers.length === 0) {
			this.drawEmptyState();
			return { hoveredDataPoint: null, hoveredSpeaker: null };
		}

		// Calculate word counts for sizing
		const wordCounts = pairs.map((p) => {
			const qWords = p.questionContent.split(' ').length;
			const aWords = p.answerContent ? p.answerContent.split(' ').length : 0;
			return { qWords, aWords };
		});
		const maxWords = Math.max(...wordCounts.flatMap((w) => [w.qWords, w.aWords]));

		// Draw speaker labels on Y axis
		this.drawSpeakerLabels();

		// Draw timeline axis
		this.drawTimeAxis();

		// Render all pairs
		const rendered = this.renderPairs(pairs, wordCounts, maxWords);

		// Find hovered pair
		const hoveredPair = this.findHoveredPair(rendered);

		// Draw arcs and nodes
		this.drawArcsAndNodes(rendered, hoveredPair);

		// Handle hover
		if (hoveredPair) {
			this.showPairTooltip(hoveredPair.pair);
			return {
				hoveredDataPoint: hoveredPair.pair.questionFirstWord,
				hoveredSpeaker: hoveredPair.pair.questionSpeaker
			};
		}

		return { hoveredDataPoint: null, hoveredSpeaker: null };
	}

	private drawEmptyState(): void {
		this.sk.fill(150);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.CENTER, this.sk.CENTER);
		this.sk.textSize(14);
		this.sk.text('No questions detected in transcript', this.bounds.x + this.bounds.width / 2, this.bounds.y + this.bounds.height / 2);
	}

	private drawSpeakerLabels(): void {
		this.sk.textSize(Math.max(9, Math.min(11, this.bounds.height * 0.025)));
		this.sk.textAlign(this.sk.RIGHT, this.sk.CENTER);
		this.sk.noStroke();

		const laneHeight = this.gh / this.speakers.length;

		for (let i = 0; i < this.speakers.length; i++) {
			const speaker = this.speakers[i];
			const user = this.userMap.get(speaker);
			const y = this.gy + laneHeight * i + laneHeight / 2;

			this.sk.fill(user?.color || '#666666');
			this.sk.text(speaker, this.gx - 10, y);

			// Draw lane line
			this.sk.stroke(230);
			this.sk.strokeWeight(1);
			this.sk.line(this.gx, y, this.gx + this.gw, y);
		}
	}

	private drawTimeAxis(): void {
		const fontSize = Math.max(8, Math.min(10, this.bounds.height * 0.025));
		this.sk.textSize(fontSize);
		this.sk.fill(120);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.CENTER, this.sk.TOP);

		const duration = this.timeline.rightMarker - this.timeline.leftMarker;
		const numTicks = Math.min(8, Math.floor(this.gw / 60));

		for (let i = 0; i <= numTicks; i++) {
			const frac = i / numTicks;
			const time = this.timeline.leftMarker + frac * duration;
			const x = this.gx + frac * this.gw;

			// Tick mark
			this.sk.stroke(200);
			this.sk.strokeWeight(1);
			this.sk.line(x, this.gy + this.gh, x, this.gy + this.gh + 5);

			// Time label
			this.sk.noStroke();
			this.sk.fill(120);
			this.sk.text(this.formatTime(time), x, this.gy + this.gh + 8);
		}
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	private renderPairs(pairs: QuestionAnswerPair[], wordCounts: { qWords: number; aWords: number }[], maxWords: number): RenderedPair[] {
		const duration = this.timeline.rightMarker - this.timeline.leftMarker;
		const laneHeight = this.gh / this.speakers.length;
		const speakerIndex = new Map(this.speakers.map((s, i) => [s, i]));

		return pairs.map((pair, i) => {
			const qSpeakerIdx = speakerIndex.get(pair.questionSpeaker) ?? 0;
			const qx = this.gx + ((pair.startTime - this.timeline.leftMarker) / duration) * this.gw;
			const qy = this.gy + laneHeight * qSpeakerIdx + laneHeight / 2;
			const qRadius = this.scaleRadius(wordCounts[i].qWords, maxWords);

			let ax: number | null = null;
			let ay: number | null = null;
			let aRadius = 0;

			if (pair.answerSpeaker && pair.answerFirstWord) {
				const aSpeakerIdx = speakerIndex.get(pair.answerSpeaker) ?? 0;
				ax = this.gx + ((pair.answerFirstWord.startTime - this.timeline.leftMarker) / duration) * this.gw;
				ay = this.gy + laneHeight * aSpeakerIdx + laneHeight / 2;
				aRadius = this.scaleRadius(wordCounts[i].aWords, maxWords);
			}

			return { pair, qx, qy, ax, ay, qRadius, aRadius };
		});
	}

	private scaleRadius(wordCount: number, maxWords: number): number {
		if (maxWords <= 0) return MIN_NODE_RADIUS;
		const scale = Math.sqrt(wordCount / maxWords);
		return MIN_NODE_RADIUS + scale * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
	}

	private findHoveredPair(rendered: RenderedPair[]): RenderedPair | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.sk.mouseX;
		const my = this.sk.mouseY;

		for (const rp of rendered) {
			// Check question node
			if (this.sk.dist(mx, my, rp.qx, rp.qy) <= rp.qRadius + 4) {
				return rp;
			}
			// Check answer node
			if (rp.ax !== null && rp.ay !== null) {
				if (this.sk.dist(mx, my, rp.ax, rp.ay) <= rp.aRadius + 4) {
					return rp;
				}
			}
		}

		return null;
	}

	private drawArcsAndNodes(rendered: RenderedPair[], hoveredPair: RenderedPair | null): void {
		const crossHighlight = getCrossHighlight(this.sk, this.bounds, this.config.dashboardToggle, this.hover);

		// Draw arcs first (behind nodes)
		for (const rp of rendered) {
			if (rp.ax === null || rp.ay === null) continue;

			const isHovered = hoveredPair === rp;
			const shouldDim =
				crossHighlight.active &&
				((crossHighlight.speaker != null && rp.pair.questionSpeaker !== crossHighlight.speaker && rp.pair.answerSpeaker !== crossHighlight.speaker) ||
					(crossHighlight.turn != null && rp.pair.questionTurn !== crossHighlight.turn && rp.pair.answerTurn !== crossHighlight.turn));

			withDimming(this.sk.drawingContext, shouldDim, () => {
				const user = this.userMap.get(rp.pair.questionSpeaker);
				const color = user?.color || '#999999';
				this.sk.noFill();
				this.sk.stroke(color);
				this.sk.strokeWeight(isHovered ? 2 : 1);

				// Draw curved arc between question and answer
				const controlY = Math.min(rp.qy, rp.ay) - ARC_CONTROL_OFFSET;
				this.sk.bezier(rp.qx, rp.qy, rp.qx, controlY, rp.ax, controlY, rp.ax, rp.ay);

				// Draw arrowhead along the curve near the answer node
				this.drawArrowhead(rp.qx, rp.qy, rp.ax, rp.ay, controlY, color);
			});
		}

		// Draw nodes on top
		for (const rp of rendered) {
			const isHovered = hoveredPair === rp;
			const shouldDim =
				crossHighlight.active &&
				crossHighlight.speaker != null &&
				rp.pair.questionSpeaker !== crossHighlight.speaker &&
				rp.pair.answerSpeaker !== crossHighlight.speaker;

			// Question node
			withDimming(this.sk.drawingContext, shouldDim, () => {
				const qUser = this.userMap.get(rp.pair.questionSpeaker);
				const qColor = this.sk.color(qUser?.color || '#999999');

				if (isHovered) {
					this.sk.stroke(qColor);
					this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
				} else {
					this.sk.noStroke();
				}

				qColor.setAlpha(200);
				this.sk.fill(qColor);
				this.sk.ellipse(rp.qx, rp.qy, rp.qRadius * 2, rp.qRadius * 2);

				// Question mark indicator
				this.sk.fill(255);
				this.sk.noStroke();
				this.sk.textAlign(this.sk.CENTER, this.sk.CENTER);
				const fontSize = Math.max(8, rp.qRadius);
				this.sk.textSize(fontSize);
				this.sk.text('?', rp.qx, rp.qy - fontSize * 0.1);
			});

			// Answer node
			if (rp.ax !== null && rp.ay !== null && rp.pair.answerSpeaker) {
				withDimming(this.sk.drawingContext, shouldDim, () => {
					const aUser = this.userMap.get(rp.pair.answerSpeaker!);
					const aColor = this.sk.color(aUser?.color || '#999999');

					if (isHovered) {
						this.sk.stroke(aColor);
						this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
					} else {
						this.sk.noStroke();
					}

					aColor.setAlpha(200);
					this.sk.fill(aColor);
					this.sk.ellipse(rp.ax!, rp.ay!, rp.aRadius * 2, rp.aRadius * 2);
				});
			}
		}
	}

	private drawArrowhead(qx: number, qy: number, ax: number, ay: number, controlY: number, color: string): void {
		// Position arrow along the bezier curve near the end (t = 0.85)
		const t = 0.85;
		const mt = 1 - t;
		const mt2 = mt * mt;
		const t2 = t * t;

		// Cubic bezier position: B(t) for control points (qx,qy), (qx,controlY), (ax,controlY), (ax,ay)
		const px = mt2 * mt * qx + 3 * mt2 * t * qx + 3 * mt * t2 * ax + t2 * t * ax;
		const py = mt2 * mt * qy + 3 * mt2 * t * controlY + 3 * mt * t2 * controlY + t2 * t * ay;

		// Tangent direction (simplified since some control point differences are zero)
		const tx = 6 * mt * t * (ax - qx);
		const ty = 3 * mt2 * (controlY - qy) + 3 * t2 * (ay - controlY);
		const angle = Math.atan2(ty, tx);

		this.sk.fill(color);
		this.sk.noStroke();
		this.sk.push();
		this.sk.translate(px, py);
		this.sk.rotate(angle);
		this.sk.triangle(4, 0, -4, -3, -4, 3);
		this.sk.pop();
	}

	private showPairTooltip(pair: QuestionAnswerPair): void {
		const qUser = this.userMap.get(pair.questionSpeaker);
		const qColor = qUser?.color || '#999999';

		let content = `<span style="color: ${qColor}"><b>${pair.questionSpeaker}</b> asks:\n"${pair.questionContent}"</span>`;

		if (pair.answerSpeaker && pair.answerContent) {
			const aUser = this.userMap.get(pair.answerSpeaker);
			const aColor = aUser?.color || '#999999';
			content += `\n\n<span style="color: ${aColor}"><b>${pair.answerSpeaker}</b> responds:\n"${pair.answerContent}"</span>`;
		} else {
			content += '\n\n<span style="opacity: 0.6">(No immediate answer)</span>';
		}

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, qColor, this.bounds.y + this.bounds.height);
	}
}
