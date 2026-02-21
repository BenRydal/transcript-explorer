import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import { withDimming, formatTurnPreviewLines, getCrossHighlight, getDominantCodeColor } from './draw-utils';
import { normalizeWord } from '../core/string-utils';
import { DrawContext } from './draw-context';

const LEFT_MARGIN = 60;
const BOTTOM_MARGIN = 40;
const MAX_MARGIN_RATIO = 0.3;
const BAR_PADDING = 2;
const HOVER_OUTLINE_WEIGHT = 2;
const TARGET_BIN_COUNT = 15;
const Y_TICKS = 5;

interface TurnSummary {
	speaker: string;
	wordCount: number;
	firstDataPoint: DataPoint;
	content: string;
}

interface BinTurn {
	dataPoint: DataPoint;
	content: string;
	wordCount: number;
}

interface Bin {
	minLength: number;
	maxLength: number;
	speakers: Map<string, BinTurn[]>;
	totalCount: number;
}

interface HoveredSegment {
	binIndex: number;
	speaker: string;
	y: number;
	h: number;
}

export class TurnLengthDistribution {
	private ctx: DrawContext;
	private bounds: Bounds;
	private speakers: string[];
	private fullTranscriptMaxBinCount: number;
	// Absolute grid coordinates (bounds.xy + grid offsets)
	private gx: number;
	private gy: number;
	private gw: number;
	private gh: number;

	constructor(ctx: DrawContext, bounds: Bounds) {
		this.ctx = ctx;
		this.bounds = bounds;
		this.speakers = this.ctx.users.filter((u) => u.enabled).map((u) => u.name);
		const leftMargin = Math.min(LEFT_MARGIN, bounds.width * MAX_MARGIN_RATIO);
		const bottomMargin = Math.min(BOTTOM_MARGIN, bounds.height * MAX_MARGIN_RATIO);
		this.gx = bounds.x + leftMargin;
		this.gy = bounds.y + 10;
		this.gw = bounds.width - leftMargin - 10;
		this.gh = bounds.height - bottomMargin - 10;
		// Pre-compute max bin count from full transcript for stable scaling
		this.fullTranscriptMaxBinCount = this.computeFullTranscriptMaxBinCount();
	}

	draw(turns: TurnSummary[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		if (turns.length === 0 || this.speakers.length === 0) return { snippetPoints: [], hoveredSpeaker: null };

		const bins = this.binTurns(turns);
		if (bins.length === 0) return { snippetPoints: [], hoveredSpeaker: null };

		const visibleMaxCount = Math.max(...bins.map((b) => b.totalCount));
		if (visibleMaxCount === 0) return { snippetPoints: [], hoveredSpeaker: null };

		// Use full transcript max when scaling to full transcript
		const maxCount =
			!this.ctx.config.scaleToVisibleData && this.fullTranscriptMaxBinCount > 0
				? Math.max(visibleMaxCount, this.fullTranscriptMaxBinCount)
				: visibleMaxCount;

		// Filter bin contents by search term while keeping axes stable
		if (this.ctx.config.wordToSearch) {
			const searchTerm = normalizeWord(this.ctx.config.wordToSearch);
			for (const bin of bins) {
				for (const [speaker, binTurns] of bin.speakers) {
					const filtered = binTurns.filter((t) => t.content.toLowerCase().includes(searchTerm));
					if (filtered.length === 0) {
						bin.speakers.delete(speaker);
					} else {
						bin.speakers.set(speaker, filtered);
					}
				}
				let count = 0;
				for (const t of bin.speakers.values()) count += t.length;
				bin.totalCount = count;
			}
		}

		const barWidth = this.gw / bins.length;

		const localX = this.ctx.sk.mouseX - this.gx;
		const localY = this.ctx.sk.mouseY - this.gy;
		const mouseInGrid =
			this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height) &&
			localX >= 0 &&
			localX < this.gw &&
			localY >= 0 &&
			localY < this.gh;
		const hoveredBinIndex = mouseInGrid ? Math.floor(localX / barWidth) : -1;

		this.drawYAxis(maxCount);
		const hoveredSegment = this.drawBars(bins, maxCount, barWidth, hoveredBinIndex, localY);
		this.drawXAxis(bins, barWidth);

		if (hoveredSegment) {
			this.drawHoverEffect(hoveredSegment, barWidth, bins);
			this.showSegmentTooltip(hoveredSegment, bins);
			const binTurns = bins[hoveredSegment.binIndex].speakers.get(hoveredSegment.speaker)!;
			return { snippetPoints: binTurns.map((t) => t.dataPoint), hoveredSpeaker: hoveredSegment.speaker };
		}

		return { snippetPoints: [], hoveredSpeaker: null };
	}

	private drawYAxis(maxCount: number): void {
		this.ctx.sk.textSize(Math.max(8, Math.min(10, this.bounds.height * 0.03)));
		this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.CENTER);
		this.ctx.sk.noStroke();
		for (let i = 0; i <= Y_TICKS; i++) {
			const frac = i / Y_TICKS;
			const val = Math.round(frac * maxCount);
			const y = this.gy + this.gh - frac * this.gh;
			this.ctx.sk.fill(120);
			this.ctx.sk.text(String(val), this.gx - 8, y);
			this.ctx.sk.stroke(240);
			this.ctx.sk.strokeWeight(1);
			this.ctx.sk.line(this.gx, y, this.gx + this.gw, y);
			this.ctx.sk.noStroke();
		}
	}

	private drawBars(bins: Bin[], maxCount: number, barWidth: number, hoveredBinIndex: number, localY: number): HoveredSegment | null {
		let hoveredSegment: HoveredSegment | null = null;

		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);

		for (let b = 0; b < bins.length; b++) {
			const bin = bins[b];
			const x = this.gx + b * barWidth + BAR_PADDING;
			const w = barWidth - BAR_PADDING * 2;
			let yOffset = 0;

			for (const speaker of this.speakers) {
				const turns = bin.speakers.get(speaker);
				if (!turns || turns.length === 0) continue;

				const h = (turns.length / maxCount) * this.gh;
				const y = this.gy + this.gh - yOffset - h;

				const shouldDim =
					crossHighlight.active &&
					((crossHighlight.turns != null && !turns.some((t) => crossHighlight.turns!.includes(t.dataPoint.turnNumber))) ||
						(crossHighlight.speaker != null && speaker !== crossHighlight.speaker));
				withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
					const user = this.ctx.userMap.get(speaker);
					const barColor = getDominantCodeColor(turns.map((t) => t.dataPoint), user!.color, this.ctx.codeColorMap, this.ctx.config.codeColorMode);
					const c = this.ctx.sk.color(barColor);
					c.setAlpha(200);
					this.ctx.sk.fill(c);
					this.ctx.sk.rect(x, y, w, h, 1);
				});

				if (b === hoveredBinIndex) {
					const segTop = this.gh - yOffset - h;
					const segBottom = this.gh - yOffset;
					if (localY >= segTop && localY < segBottom) {
						hoveredSegment = { binIndex: b, speaker, y, h };
					}
				}

				yOffset += h;
			}
		}

		return hoveredSegment;
	}

	private drawXAxis(bins: Bin[], barWidth: number): void {
		const fontSize = Math.max(8, Math.min(10, this.bounds.height * 0.03));
		this.ctx.sk.textSize(fontSize);
		this.ctx.sk.fill(120);
		this.ctx.sk.noStroke();
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.TOP);
		const labelInterval = Math.max(1, Math.floor(bins.length / 10));
		for (let b = 0; b < bins.length; b += labelInterval) {
			const bin = bins[b];
			const label = bin.minLength === bin.maxLength ? String(bin.minLength) : `${bin.minLength}-${bin.maxLength}`;
			this.ctx.sk.text(label, this.gx + b * barWidth + barWidth / 2, this.gy + this.gh + 5);
		}

		this.ctx.sk.textSize(fontSize + 1);
		this.ctx.sk.fill(100);
		this.ctx.sk.text('Words per turn', this.gx + this.gw / 2, this.gy + this.gh + 5 + fontSize + 4);
	}

	private drawHoverEffect(hovered: HoveredSegment, barWidth: number, bins: Bin[]): void {
		const user = this.ctx.userMap.get(hovered.speaker);
		const hoverTurns = bins[hovered.binIndex].speakers.get(hovered.speaker);
		const hoverColor = hoverTurns && hoverTurns.length > 0 ? getDominantCodeColor(hoverTurns.map((t) => t.dataPoint), user?.color || '#cccccc', this.ctx.codeColorMap, this.ctx.config.codeColorMode) : user?.color || '#cccccc';
		this.ctx.sk.noFill();
		this.ctx.sk.stroke(hoverColor);
		this.ctx.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.ctx.sk.rect(this.gx + hovered.binIndex * barWidth + BAR_PADDING, hovered.y, barWidth - BAR_PADDING * 2, hovered.h, 1);
	}

	private showSegmentTooltip(hovered: HoveredSegment, bins: Bin[]): void {
		const bin = bins[hovered.binIndex];
		const turns = bin.speakers.get(hovered.speaker)!;
		const user = this.ctx.userMap.get(hovered.speaker);
		const multiTurn = turns.length > 1;
		const content = `<b>${hovered.speaker}</b> · ${turns.length} turn${multiTurn ? 's' : ''}\n${formatTurnPreviewLines(turns)}`;
		const tooltipColor = turns.length > 0 ? getDominantCodeColor(turns.map((t) => t.dataPoint), user?.color || '#cccccc', this.ctx.codeColorMap, this.ctx.config.codeColorMode) : user?.color || '#cccccc';
		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, content, tooltipColor, this.bounds.y + this.bounds.height);
	}

	private binTurns(turns: TurnSummary[]): Bin[] {
		const maxWordCount = Math.max(...turns.map((t) => t.wordCount));
		const minWordCount = Math.min(...turns.map((t) => t.wordCount));
		const range = maxWordCount - minWordCount;

		let binSize: number;
		let numBins: number;

		const targetBins = this.ctx.config.turnLengthBinCount > 0 ? this.ctx.config.turnLengthBinCount : TARGET_BIN_COUNT;

		if (range === 0) {
			binSize = 1;
			numBins = 1;
		} else {
			binSize = Math.max(1, Math.ceil(range / targetBins));
			numBins = Math.ceil(range / binSize) + 1;
		}

		const bins: Bin[] = [];
		for (let i = 0; i < numBins; i++) {
			bins.push({
				minLength: minWordCount + i * binSize,
				maxLength: minWordCount + (i + 1) * binSize - 1,
				speakers: new Map(),
				totalCount: 0
			});
		}

		for (const turn of turns) {
			const binIndex = Math.min(numBins - 1, Math.floor((turn.wordCount - minWordCount) / binSize));
			const bin = bins[binIndex];
			const binTurn: BinTurn = { dataPoint: turn.firstDataPoint, content: turn.content, wordCount: turn.wordCount };
			const existing = bin.speakers.get(turn.speaker);
			if (existing) {
				existing.push(binTurn);
			} else {
				bin.speakers.set(turn.speaker, [binTurn]);
			}
			bin.totalCount++;
		}

		return bins;
	}

	/**
	 * Computes the max bin count from the full transcript for stable scaling.
	 */
	private computeFullTranscriptMaxBinCount(): number {
		if (this.ctx.transcript.wordArray.length === 0) return 0;

		// Build turn summaries from full transcript
		const turnMap = new Map<number, { wordCount: number }>();
		for (const word of this.ctx.transcript.wordArray) {
			const existing = turnMap.get(word.turnNumber);
			if (existing) {
				existing.wordCount++;
			} else {
				turnMap.set(word.turnNumber, { wordCount: 1 });
			}
		}

		const turns = Array.from(turnMap.values());
		if (turns.length === 0) return 0;

		const wordCounts = turns.map((t) => t.wordCount);
		const maxWordCount = Math.max(...wordCounts);
		const minWordCount = Math.min(...wordCounts);
		const range = maxWordCount - minWordCount;

		const targetBins = this.ctx.config.turnLengthBinCount > 0 ? this.ctx.config.turnLengthBinCount : TARGET_BIN_COUNT;
		const binSize = range === 0 ? 1 : Math.max(1, Math.ceil(range / targetBins));
		const numBins = range === 0 ? 1 : Math.ceil(range / binSize) + 1;

		const binCounts = new Array(numBins).fill(0);
		for (const turn of turns) {
			const binIndex = Math.min(numBins - 1, Math.floor((turn.wordCount - minWordCount) / binSize));
			binCounts[binIndex]++;
		}

		return Math.max(...binCounts);
	}
}
