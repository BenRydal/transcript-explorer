import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import type { QuestionAnswerPair } from '../core/dynamic-data';
import { withDimming, getCrossHighlight, drawTimeAxis, getWordColor } from './draw-utils';
import { normalizeWord } from '../core/string-utils';
import { DrawContext } from './draw-context';
import { pickTextColor } from './draw-theme';
import { orderLanes, partitionLanes, truncateMiddle } from './lane-layout';
import { classifyQuestion, kindsPresent, KIND_LABELS, type QuestionKind } from './question-type';

const GUTTER_MIN = 60;
const GUTTER_MAX = 220;
const GUTTER_PAD = 14;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 30;
const BOTTOM_MARGIN = 50;
const ABSENT_ROW_HEIGHT = 24;
const LEGEND_HEIGHT = 20;
const MIN_NODE_RADIUS = 4;
const MAX_NODE_RADIUS = 24;
const ARC_CONTROL_OFFSET = 40;
const HOVER_OUTLINE_WEIGHT = 2;
const ANSWER_RING_WEIGHT = 2;

interface RenderedPair {
	pair: QuestionAnswerPair;
	kind: QuestionKind;
	qx: number;
	qy: number;
	ax: number | null;
	ay: number | null;
	qRadius: number;
	aRadius: number;
}

export class QuestionFlow {
	private ctx: DrawContext;
	private bounds: Bounds;
	private speakers: string[];
	private timeline: { leftMarker: number; rightMarker: number };
	private fullTranscriptMaxWords: number;
	private gx: number;
	private gy: number;
	private gw: number;
	private gh: number;
	private lanes: string[] = [];
	private laneHeight = 0;
	private labelSize = 10;
	private typeMarks = false;
	private isAi = false;

	constructor(ctx: DrawContext, bounds: Bounds) {
		this.ctx = ctx;
		this.bounds = bounds;
		this.speakers = this.ctx.users.filter((u) => u.enabled).map((u) => u.name);
		this.timeline = { leftMarker: this.ctx.timeline.leftMarker, rightMarker: this.ctx.timeline.rightMarker };
		// Use largest turn length as proxy for max words in Q/A pairs
		this.fullTranscriptMaxWords = this.ctx.transcript.largestTurnLength;

		this.gx = bounds.x + GUTTER_MIN;
		this.gy = bounds.y + TOP_MARGIN;
		this.gw = bounds.width - GUTTER_MIN - RIGHT_MARGIN;
		this.gh = bounds.height - TOP_MARGIN - BOTTOM_MARGIN;
	}

	draw(pairs: QuestionAnswerPair[]): { hoveredDataPoint: DataPoint | null; hoveredSpeaker: string | null } {
		if (pairs.length === 0 || this.speakers.length === 0) {
			this.drawEmptyState();
			return { hoveredDataPoint: null, hoveredSpeaker: null };
		}

		// Filter pairs by search term
		if (this.ctx.config.wordToSearch) {
			const searchTerm = normalizeWord(this.ctx.config.wordToSearch);
			pairs = pairs.filter(
				(p) =>
					normalizeWord(p.questionContent).includes(searchTerm) || (p.answerContent != null && normalizeWord(p.answerContent).includes(searchTerm))
			);
			if (pairs.length === 0) {
				this.drawEmptyState();
				return { hoveredDataPoint: null, hoveredSpeaker: null };
			}
		}

		// Calculate word counts for sizing
		const wordCounts = pairs.map((p) => {
			const qWords = p.questionContent.split(' ').length;
			const aWords = p.answerContent ? p.answerContent.split(' ').length : 0;
			return { qWords, aWords };
		});
		const visibleMaxWords = Math.max(...wordCounts.flatMap((w) => [w.qWords, w.aWords]));
		// Use full transcript max when scaling to full transcript
		const maxWords =
			!this.ctx.config.scaleToVisibleData && this.fullTranscriptMaxWords > 0
				? Math.max(visibleMaxWords, this.fullTranscriptMaxWords)
				: visibleMaxWords;

		this.isAi = this.ctx.transcript.sourceKind === 'ai';
		this.typeMarks = this.ctx.config.questionFlowTypeMarks !== false && this.isAi;

		// An actor needs a lane if it asks or if it answers; either puts a node
		// on that row.
		const participating = new Map<string, number>();
		for (const pair of pairs) {
			participating.set(pair.questionSpeaker, (participating.get(pair.questionSpeaker) ?? 0) + 1);
			if (pair.answerSpeaker) participating.set(pair.answerSpeaker, (participating.get(pair.answerSpeaker) ?? 0) + 1);
		}

		const ordered = orderLanes(this.speakers, participating, 'default');
		const { present, absent } = partitionLanes(ordered, participating);
		const hideAbsent = this.ctx.config.questionFlowHideAbsent !== false && present.length > 0;
		this.lanes = hideAbsent ? present : ordered;
		const hiddenCount = hideAbsent ? absent.length : 0;

		const kinds = kindsPresent(pairs.map((p) => classifyQuestion(p.questionSpeaker, this.ctx.userMap.get(p.questionSpeaker)?.role, this.isAi)));
		const showLegend = this.typeMarks && kinds.length > 1;

		this.layout(hiddenCount > 0, showLegend);
		this.drawSpeakerLabels();
		drawTimeAxis(this.ctx.sk, this.bounds, this, this.timeline, this.ctx.theme);

		// Render all pairs
		const rendered = this.renderPairs(pairs, wordCounts, maxWords);

		// Find hovered pair
		const hoveredPair = this.findHoveredPair(rendered);

		// Draw arcs and nodes
		this.drawArcsAndNodes(rendered, hoveredPair);

		if (hiddenCount > 0) this.drawAbsentRow(hiddenCount);
		if (showLegend) this.drawKindLegend(kinds);

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
		this.ctx.sk.fill(this.ctx.theme.fgMuted);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.CENTER);
		this.ctx.sk.textSize(14);
		this.ctx.sk.text('No questions detected in transcript', this.bounds.x + this.bounds.width / 2, this.bounds.y + this.bounds.height / 2);
	}

	/** Sizes the label gutter to the labels actually being drawn, then the grid. */
	private layout(reserveAbsentRow: boolean, reserveLegend: boolean): void {
		this.labelSize = Math.max(9, Math.min(11, this.bounds.height * 0.025));
		this.ctx.sk.textSize(this.labelSize);

		let widest = 0;
		for (const speaker of this.lanes) widest = Math.max(widest, this.ctx.sk.textWidth(speaker));

		const available = this.bounds.width * 0.28;
		const gutter = Math.min(GUTTER_MAX, Math.max(GUTTER_MIN, Math.min(widest + GUTTER_PAD, available)));

		this.gx = this.bounds.x + gutter;
		this.gy = this.bounds.y + TOP_MARGIN;
		this.gw = this.bounds.width - gutter - RIGHT_MARGIN;
		this.gh = this.bounds.height - TOP_MARGIN - BOTTOM_MARGIN - (reserveAbsentRow ? ABSENT_ROW_HEIGHT : 0) - (reserveLegend ? LEGEND_HEIGHT : 0);
		this.laneHeight = this.gh / Math.max(1, this.lanes.length);
	}

	private laneY(index: number): number {
		return this.gy + this.laneHeight * index + this.laneHeight / 2;
	}

	private drawSpeakerLabels(): void {
		this.ctx.sk.textSize(this.labelSize);
		this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.CENTER);
		this.ctx.sk.noStroke();

		const maxLabelWidth = this.gx - this.bounds.x - 10;

		for (let i = 0; i < this.lanes.length; i++) {
			const y = this.laneY(i);

			// Speaker label sits in the left margin over the canvas
			// background. Use theme.fg so pale speaker colors stay readable.
			this.ctx.sk.fill(this.ctx.theme.fg);
			this.ctx.sk.text(
				truncateMiddle(this.lanes[i], maxLabelWidth, (t) => this.ctx.sk.textWidth(t)),
				this.gx - 10,
				y
			);

			this.ctx.sk.stroke(this.ctx.theme.borderMuted);
			this.ctx.sk.strokeWeight(1);
			this.ctx.sk.line(this.gx, y, this.gx + this.gw, y);
		}
	}

	/** Reports the lanes trimmed from the view. */
	private drawAbsentRow(hiddenCount: number): void {
		const y = this.gy + this.gh + ABSENT_ROW_HEIGHT / 2;

		const rule = this.ctx.sk.color(this.ctx.theme.fgMuted);
		rule.setAlpha(45);
		this.ctx.sk.stroke(rule);
		this.ctx.sk.strokeWeight(1);
		this.ctx.sk.line(this.gx, y, this.gx + this.gw, y);

		this.ctx.sk.noStroke();
		this.ctx.sk.textSize(this.labelSize);
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.CENTER);

		const label = `${hiddenCount} actor${hiddenCount !== 1 ? 's' : ''} neither asked nor answered`;
		const pad = 6;
		this.ctx.sk.fill(this.ctx.theme.bg);
		this.ctx.sk.rect(this.gx - pad, y - this.labelSize, this.ctx.sk.textWidth(label) + pad * 2, this.labelSize * 2);
		this.ctx.sk.fill(this.ctx.theme.fgMuted);
		this.ctx.sk.text(label, this.gx, y);
	}

	/** Shape key, drawn only when more than one kind is on screen. */
	private drawKindLegend(kinds: QuestionKind[]): void {
		const y = this.bounds.y + this.bounds.height - LEGEND_HEIGHT / 2;
		const r = 5;
		let x = this.gx;

		this.ctx.sk.textSize(this.labelSize);
		this.ctx.sk.textAlign(this.ctx.sk.LEFT, this.ctx.sk.CENTER);

		for (const kind of kinds) {
			this.ctx.sk.noStroke();
			this.ctx.sk.fill(this.ctx.theme.fgMuted);
			this.drawKindShape(kind, x + r, y, r);

			const label = KIND_LABELS[kind];
			this.ctx.sk.fill(this.ctx.theme.fgMuted);
			this.ctx.sk.text(label, x + r * 2 + 6, y);
			x += r * 2 + 6 + this.ctx.sk.textWidth(label) + 18;
		}
	}

	/** Circle, square, triangle for conversational, elicitation, inter-agent. */
	private drawKindShape(kind: QuestionKind, x: number, y: number, r: number): void {
		if (kind === 'elicitation') this.ctx.sk.rect(x - r, y - r, r * 2, r * 2, 1);
		else if (kind === 'inter-agent') this.ctx.sk.triangle(x, y - r, x + r, y + r * 0.8, x - r, y + r * 0.8);
		else this.ctx.sk.ellipse(x, y, r * 2, r * 2);
	}

	private renderPairs(pairs: QuestionAnswerPair[], wordCounts: { qWords: number; aWords: number }[], maxWords: number): RenderedPair[] {
		const duration = this.timeline.rightMarker - this.timeline.leftMarker;
		const speakerIndex = new Map(this.lanes.map((s, i) => [s, i]));
		const atTime = (t: number) => this.gx + (duration > 0 ? ((t - this.timeline.leftMarker) / duration) * this.gw : 0);

		return pairs.map((pair, i) => {
			const qx = atTime(pair.startTime);
			const qy = this.laneY(speakerIndex.get(pair.questionSpeaker) ?? 0);
			const qRadius = this.scaleRadius(wordCounts[i].qWords, maxWords);
			const kind = classifyQuestion(pair.questionSpeaker, this.ctx.userMap.get(pair.questionSpeaker)?.role, this.isAi);

			let ax: number | null = null;
			let ay: number | null = null;
			let aRadius = 0;

			if (pair.answerSpeaker && pair.answerFirstWord) {
				ax = atTime(pair.answerFirstWord.startTime);
				ay = this.laneY(speakerIndex.get(pair.answerSpeaker) ?? 0);
				aRadius = this.scaleRadius(wordCounts[i].aWords, maxWords);
			}

			return { pair, kind, qx, qy, ax, ay, qRadius, aRadius };
		});
	}

	private scaleRadius(wordCount: number, maxWords: number): number {
		if (maxWords <= 0) return MIN_NODE_RADIUS;
		const scale = Math.sqrt(wordCount / maxWords);
		return MIN_NODE_RADIUS + scale * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);
	}

	private findHoveredPair(rendered: RenderedPair[]): RenderedPair | null {
		if (!this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const mx = this.ctx.sk.mouseX;
		const my = this.ctx.sk.mouseY;

		for (const rp of rendered) {
			// Check question node
			if (this.ctx.sk.dist(mx, my, rp.qx, rp.qy) <= rp.qRadius + 4) {
				return rp;
			}
			// Check answer node
			if (rp.ax !== null && rp.ay !== null) {
				if (this.ctx.sk.dist(mx, my, rp.ax, rp.ay) <= rp.aRadius + 4) {
					return rp;
				}
			}
		}

		return null;
	}

	private drawArcsAndNodes(rendered: RenderedPair[], hoveredPair: RenderedPair | null): void {
		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);

		// Draw arcs first (behind nodes)
		for (const rp of rendered) {
			if (rp.ax === null || rp.ay === null) continue;

			const isHovered = hoveredPair === rp;
			const shouldDim =
				crossHighlight.active &&
				((crossHighlight.speaker != null && rp.pair.questionSpeaker !== crossHighlight.speaker && rp.pair.answerSpeaker !== crossHighlight.speaker) ||
					(crossHighlight.turn != null && rp.pair.questionTurn !== crossHighlight.turn && rp.pair.answerTurn !== crossHighlight.turn));

			withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
				const user = this.ctx.userMap.get(rp.pair.questionSpeaker);
				const color = getWordColor(rp.pair.questionFirstWord.codes, user?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode);
				this.ctx.sk.noFill();
				this.ctx.sk.stroke(color);
				this.ctx.sk.strokeWeight(isHovered ? 2 : 1);

				// Draw curved arc between question and answer
				const controlY = Math.min(rp.qy, rp.ay) - ARC_CONTROL_OFFSET;
				this.ctx.sk.bezier(rp.qx, rp.qy, rp.qx, controlY, rp.ax, controlY, rp.ax, rp.ay);

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
			withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
				const qUser = this.ctx.userMap.get(rp.pair.questionSpeaker);
				// Keep the base speaker color as a parseable string for
				// pickTextColor; `this.ctx.sk.color(...)` only consumes it
				// for the alpha'd fill below.
				const qBaseColor = getWordColor(
					rp.pair.questionFirstWord.codes,
					qUser?.color || '#999999',
					this.ctx.codeColorMap,
					this.ctx.config.codeColorMode
				);
				const qColor = this.ctx.sk.color(qBaseColor);

				if (isHovered) {
					this.ctx.sk.stroke(qColor);
					this.ctx.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
				} else {
					this.ctx.sk.noStroke();
				}

				qColor.setAlpha(200);
				this.ctx.sk.fill(qColor);

				if (this.typeMarks) {
					this.drawKindShape(rp.kind, rp.qx, rp.qy, rp.qRadius);
					return;
				}

				this.ctx.sk.ellipse(rp.qx, rp.qy, rp.qRadius * 2, rp.qRadius * 2);

				// Question mark indicator  -  pick a contrasting text color
				// against the speaker-colored circle (was hardcoded white,
				// which vanished on pale speaker colors in both themes).
				this.ctx.sk.fill(pickTextColor(qBaseColor, this.ctx.theme));
				this.ctx.sk.noStroke();
				this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.CENTER);
				const fontSize = Math.max(8, rp.qRadius);
				this.ctx.sk.textSize(fontSize);
				this.ctx.sk.text('?', rp.qx, rp.qy - fontSize * 0.1);
			});

			// Answer node
			if (rp.ax !== null && rp.ay !== null && rp.pair.answerSpeaker) {
				withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
					const aUser = this.ctx.userMap.get(rp.pair.answerSpeaker!);
					const aColor = this.ctx.sk.color(
						getWordColor(rp.pair.answerFirstWord!.codes, aUser?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode)
					);

					// With the `?` retired, fill is what separates a question
					// from an answer: questions are solid, answers are rings.
					if (this.typeMarks) {
						aColor.setAlpha(230);
						this.ctx.sk.noFill();
						this.ctx.sk.stroke(aColor);
						this.ctx.sk.strokeWeight(isHovered ? HOVER_OUTLINE_WEIGHT + 1 : ANSWER_RING_WEIGHT);
						this.ctx.sk.ellipse(rp.ax!, rp.ay!, rp.aRadius * 2, rp.aRadius * 2);
						return;
					}

					if (isHovered) {
						this.ctx.sk.stroke(aColor);
						this.ctx.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
					} else {
						this.ctx.sk.noStroke();
					}

					aColor.setAlpha(200);
					this.ctx.sk.fill(aColor);
					this.ctx.sk.ellipse(rp.ax!, rp.ay!, rp.aRadius * 2, rp.aRadius * 2);
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

		this.ctx.sk.fill(color);
		this.ctx.sk.noStroke();
		this.ctx.sk.push();
		this.ctx.sk.translate(px, py);
		this.ctx.sk.rotate(angle);
		this.ctx.sk.triangle(4, 0, -4, -3, -4, 3);
		this.ctx.sk.pop();
	}

	private static readonly TOOLTIP_MAX_WORDS = 50;

	private truncateText(text: string): string {
		const words = text.split(/\s+/);
		if (words.length <= QuestionFlow.TOOLTIP_MAX_WORDS) return text;
		const remaining = words.length - QuestionFlow.TOOLTIP_MAX_WORDS;
		return words.slice(0, QuestionFlow.TOOLTIP_MAX_WORDS).join(' ') + `... (${remaining} more words)`;
	}

	private showPairTooltip(pair: QuestionAnswerPair): void {
		const qUser = this.ctx.userMap.get(pair.questionSpeaker);
		const qColor = getWordColor(pair.questionFirstWord.codes, qUser?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode);

		let content = `<span style="color: ${qColor}"><b>${pair.questionSpeaker}</b> asks:\n"${this.truncateText(pair.questionContent)}"</span>`;

		if (pair.answerSpeaker && pair.answerContent) {
			const aUser = this.ctx.userMap.get(pair.answerSpeaker);
			const aColor = pair.answerFirstWord
				? getWordColor(pair.answerFirstWord.codes, aUser?.color || '#999999', this.ctx.codeColorMap, this.ctx.config.codeColorMode)
				: aUser?.color || '#999999';
			content += `\n\n<span style="color: ${aColor}"><b>${pair.answerSpeaker}</b> responds:\n"${this.truncateText(pair.answerContent)}"</span>`;
		} else {
			content += '\n\n<span style="opacity: 0.6">(No immediate answer)</span>';
		}

		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, content, qColor, this.bounds.y + this.bounds.height);
	}
}
