import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import { DEFAULT_SPEAKER_COLOR } from '../constants/ui';
import { withDimming, formatTurnPreviewLines, getCrossHighlight, getDominantCodeColor } from './draw-utils';
import { normalizeWord } from '../core/string-utils';
import { DrawContext } from './draw-context';

const LEFT_MARGIN = 100;
const BOTTOM_MARGIN = 30;
const MAX_MARGIN_RATIO = 0.3;
const CELL_PADDING = 1;
const MIN_OPACITY = 10;
const MAX_OPACITY = 230;
const HOVER_OUTLINE_WEIGHT = 2;
const TIME_LABEL_COUNT = 6;
const TARGET_CELL_WIDTH = 15;

interface TimeBin {
	startTime: number;
	endTime: number;
	speakers: Record<string, DataPoint[]>;
}

interface BinnedData {
	bins: TimeBin[];
	maxCellCount: number;
}

interface HoveredCell {
	col: number;
	row: number;
	words: DataPoint[];
	speaker: string;
}

export class SpeakerHeatmap {
	private ctx: DrawContext;
	private bounds: Bounds;
	private fullTranscriptMaxCellCount: number | null = null;

	constructor(ctx: DrawContext, bounds: Bounds) {
		this.ctx = ctx;
		this.bounds = bounds;
	}

	draw(words: DataPoint[]): { hoveredCell: DataPoint | null; hoveredSpeaker: string | null } {
		const speakers = this.ctx.users.filter((u) => u.enabled).map((u) => u.name);
		const grid = this.getGridBounds();
		const numBins = this.ctx.config.heatmapBinCount > 0 ? this.ctx.config.heatmapBinCount : Math.max(1, Math.floor(grid.width / TARGET_CELL_WIDTH));

		if (speakers.length === 0) return { hoveredCell: null, hoveredSpeaker: null };

		const searchTerm = this.ctx.config.wordToSearch ? normalizeWord(this.ctx.config.wordToSearch) : '';
		const binnedData = this.binWords(words, numBins, speakers);

		// When scaling to full transcript, use the global max cell count
		if (!this.ctx.config.scaleToVisibleData) {
			if (this.fullTranscriptMaxCellCount === null) {
				this.fullTranscriptMaxCellCount = this.binFullTranscript(numBins, speakers).maxCellCount;
			}
			binnedData.maxCellCount = Math.max(binnedData.maxCellCount, this.fullTranscriptMaxCellCount);
		}
		const cellWidth = grid.width / numBins;
		const cellHeight = grid.height / speakers.length;

		this.drawSpeakerLabels(speakers, grid, cellHeight);
		this.drawCells(binnedData, speakers, grid, cellWidth, cellHeight, searchTerm);
		this.drawTimeLabels(binnedData, grid, cellWidth);

		const hovered = this.findHoveredCell(binnedData, speakers, grid, cellWidth, cellHeight, searchTerm);
		if (hovered) {
			this.drawHoverEffect(hovered, grid, cellWidth, cellHeight);
			this.showCellTooltip(hovered, binnedData);
		}

		return { hoveredCell: hovered?.words[0] || null, hoveredSpeaker: hovered?.speaker || null };
	}

	private getGridBounds(): Bounds {
		const leftMargin = Math.min(LEFT_MARGIN, this.bounds.width * MAX_MARGIN_RATIO);
		const bottomMargin = Math.min(BOTTOM_MARGIN, this.bounds.height * MAX_MARGIN_RATIO);
		return {
			x: this.bounds.x + leftMargin,
			y: this.bounds.y,
			width: this.bounds.width - leftMargin,
			height: this.bounds.height - bottomMargin
		};
	}

	private drawSpeakerLabels(speakers: string[], grid: Bounds, cellHeight: number): void {
		this.ctx.sk.textSize(Math.min(12, cellHeight * 0.7));
		this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.CENTER);
		this.ctx.sk.noStroke();
		const labelWidth = grid.x - this.bounds.x - 10;
		for (let row = 0; row < speakers.length; row++) {
			const user = this.ctx.userMap.get(speakers[row]);
			this.ctx.sk.fill(user?.color || DEFAULT_SPEAKER_COLOR);
			const label = this.truncateLabel(speakers[row], labelWidth);
			this.ctx.sk.text(label, grid.x - 8, grid.y + row * cellHeight + cellHeight / 2);
		}
	}

	private drawCells(binnedData: BinnedData, speakers: string[], grid: Bounds, cellWidth: number, cellHeight: number, searchTerm: string): void {
		const crossHighlight = getCrossHighlight(this.ctx.sk, this.bounds, this.ctx.config.dashboardToggle, this.ctx.hover);

		this.ctx.sk.noStroke();
		for (let col = 0; col < binnedData.bins.length; col++) {
			const bin = binnedData.bins[col];
			for (let row = 0; row < speakers.length; row++) {
				const cellWords = bin.speakers[speakers[row]] || [];
				const x = grid.x + col * cellWidth + CELL_PADDING;
				const y = grid.y + row * cellHeight + CELL_PADDING;
				const cw = cellWidth - CELL_PADDING * 2;
				const ch = cellHeight - CELL_PADDING * 2;

				const shouldDim =
					crossHighlight.active &&
					((crossHighlight.turns != null && !cellWords.some((w) => crossHighlight.turns!.includes(w.turnNumber))) ||
						(crossHighlight.speaker != null && speakers[row] !== crossHighlight.speaker) ||
						(crossHighlight.turn != null && !cellWords.some((w) => w.turnNumber === crossHighlight.turn)));
				withDimming(this.ctx.sk.drawingContext, shouldDim, () => {
					if (cellWords.length > 0) {
						const user = this.ctx.userMap.get(speakers[row]);
						const cellColor = getDominantCodeColor(cellWords, user?.color || DEFAULT_SPEAKER_COLOR, this.ctx.codeColorMap, this.ctx.config.codeColorMode);
						let alpha = this.ctx.sk.map(cellWords.length, 0, binnedData.maxCellCount, MIN_OPACITY, MAX_OPACITY);
						if (searchTerm && !this.cellMatchesSearch(cellWords, searchTerm)) {
							alpha *= 0.2;
						}
						const c = this.ctx.sk.color(cellColor);
						c.setAlpha(alpha);
						this.ctx.sk.fill(c);
					} else {
						this.ctx.sk.fill(245);
					}
					this.ctx.sk.rect(x, y, cw, ch);
				});
			}
		}
	}

	private drawTimeLabels(binnedData: BinnedData, grid: Bounds, cellWidth: number): void {
		const numBins = binnedData.bins.length;
		if (numBins === 0) return;

		const isUntimed = this.ctx.transcript.timingMode === 'untimed';
		this.ctx.sk.textSize(Math.max(8, Math.min(10, this.bounds.height * 0.03)));
		this.ctx.sk.fill(120);
		this.ctx.sk.noStroke();

		const labelStep = Math.max(1, Math.floor(numBins / TIME_LABEL_COUNT));
		this.ctx.sk.textAlign(this.ctx.sk.CENTER, this.ctx.sk.TOP);
		for (let col = 0; col < numBins - labelStep / 2; col += labelStep) {
			const bin = binnedData.bins[col];
			const label = isUntimed ? String(Math.round(bin.startTime)) : formatTimeCompact(bin.startTime);
			this.ctx.sk.text(label, grid.x + col * cellWidth + cellWidth / 2, grid.y + grid.height + 5);
		}

		// Always label the end
		const lastBin = binnedData.bins[numBins - 1];
		const label = isUntimed ? String(Math.round(lastBin.endTime)) : formatTimeCompact(lastBin.endTime);
		this.ctx.sk.textAlign(this.ctx.sk.RIGHT, this.ctx.sk.TOP);
		this.ctx.sk.text(label, grid.x + grid.width, grid.y + grid.height + 5);
	}

	private findHoveredCell(
		binnedData: BinnedData,
		speakers: string[],
		grid: Bounds,
		cellWidth: number,
		cellHeight: number,
		searchTerm: string
	): HoveredCell | null {
		if (!this.ctx.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const localX = this.ctx.sk.mouseX - grid.x;
		const localY = this.ctx.sk.mouseY - grid.y;
		if (localX < 0 || localX >= grid.width || localY < 0 || localY >= grid.height) {
			return null;
		}

		const col = Math.floor(localX / cellWidth);
		const row = Math.floor(localY / cellHeight);
		if (col < 0 || col >= binnedData.bins.length || row < 0 || row >= speakers.length) {
			return null;
		}

		const speaker = speakers[row];
		const words = binnedData.bins[col].speakers[speaker] || [];
		if (words.length === 0) return null;
		if (searchTerm && !this.cellMatchesSearch(words, searchTerm)) return null;
		return { col, row, words, speaker };
	}

	private drawHoverEffect(hovered: HoveredCell, grid: Bounds, cellWidth: number, cellHeight: number): void {
		const user = this.ctx.userMap.get(hovered.speaker);
		this.ctx.sk.noFill();
		this.ctx.sk.stroke(user?.color || DEFAULT_SPEAKER_COLOR);
		this.ctx.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.ctx.sk.rect(grid.x + hovered.col * cellWidth, grid.y + hovered.row * cellHeight, cellWidth, cellHeight);
	}

	private showCellTooltip(hovered: HoveredCell, binnedData: BinnedData): void {
		const bin = binnedData.bins[hovered.col];
		const user = this.ctx.userMap.get(hovered.speaker);
		const isUntimed = this.ctx.transcript.timingMode === 'untimed';
		const timeRange = isUntimed
			? `Words ${Math.round(bin.startTime)}-${Math.round(bin.endTime)}`
			: `${formatTimeCompact(bin.startTime)} - ${formatTimeCompact(bin.endTime)}`;

		// Group words by turn into TurnPreview format
		const turnMap = new Map<number, DataPoint[]>();
		for (const w of hovered.words) {
			const arr = turnMap.get(w.turnNumber);
			if (arr) arr.push(w);
			else turnMap.set(w.turnNumber, [w]);
		}
		const turns = [...turnMap.values()].map((words) => ({
			wordCount: words.length,
			content: words.map((w) => w.word).join(' ')
		}));
		const multiTurn = turns.length > 1;

		const content = `<b>${hovered.speaker}</b> · ${turns.length} turn${multiTurn ? 's' : ''} · ${timeRange}\n${formatTurnPreviewLines(turns)}`;
		const tooltipColor = getDominantCodeColor(hovered.words, user?.color || DEFAULT_SPEAKER_COLOR, this.ctx.codeColorMap, this.ctx.config.codeColorMode);
		showTooltip(this.ctx.sk.mouseX, this.ctx.sk.mouseY, content, tooltipColor, this.bounds.y + this.bounds.height);
	}

	private cellMatchesSearch(words: DataPoint[], searchTerm: string): boolean {
		return words.some((dp) => normalizeWord(dp.word).includes(searchTerm));
	}

	private truncateLabel(text: string, maxWidth: number): string {
		if (this.ctx.sk.textWidth(text) <= maxWidth) return text;
		let truncated = text;
		while (truncated.length > 0 && this.ctx.sk.textWidth(truncated + '...') > maxWidth) {
			truncated = truncated.slice(0, -1);
		}
		return truncated + '...';
	}

	private binWords(words: DataPoint[], numBins: number, speakers: string[]): BinnedData {
		const range = this.ctx.timeline.rightMarker - this.ctx.timeline.leftMarker;
		if (range <= 0) return { bins: [], maxCellCount: 0 };

		const binWidth = range / numBins;
		const bins: TimeBin[] = [];
		for (let i = 0; i < numBins; i++) {
			const speakerMap: Record<string, DataPoint[]> = {};
			for (const speaker of speakers) {
				speakerMap[speaker] = [];
			}
			bins.push({
				startTime: this.ctx.timeline.leftMarker + i * binWidth,
				endTime: this.ctx.timeline.leftMarker + (i + 1) * binWidth,
				speakers: speakerMap
			});
		}

		for (const word of words) {
			const binIndex = Math.floor((word.startTime - this.ctx.timeline.leftMarker) / binWidth);
			const clampedIndex = Math.max(0, Math.min(numBins - 1, binIndex));
			const bin = bins[clampedIndex];
			if (!bin.speakers[word.speaker]) bin.speakers[word.speaker] = [];
			bin.speakers[word.speaker].push(word);
		}

		let maxCellCount = 0;
		for (const bin of bins) {
			for (const speaker of speakers) {
				const count = bin.speakers[speaker]?.length || 0;
				if (count > maxCellCount) maxCellCount = count;
			}
		}

		return { bins, maxCellCount };
	}

	/**
	 * Bins the full transcript wordArray to find the global max cell count.
	 */
	private binFullTranscript(numBins: number, speakers: string[]): { maxCellCount: number } {
		const fullRange = this.ctx.transcript.totalTimeInSeconds || this.ctx.timeline.endTime;
		if (fullRange <= 0) return { maxCellCount: 0 };

		const binWidth = fullRange / numBins;
		const cellCounts = new Map<string, number>();

		for (const word of this.ctx.transcript.wordArray) {
			const binIndex = Math.min(numBins - 1, Math.max(0, Math.floor(word.startTime / binWidth)));
			const key = `${binIndex}-${word.speaker}`;
			cellCounts.set(key, (cellCounts.get(key) || 0) + 1);
		}

		let maxCellCount = 0;
		for (const count of cellCounts.values()) {
			if (count > maxCellCount) maxCellCount = count;
		}

		return { maxCellCount };
	}
}
