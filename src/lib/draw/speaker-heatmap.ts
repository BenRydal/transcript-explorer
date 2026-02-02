import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import { showTooltip } from '../../stores/tooltipStore';
import { formatTimeCompact } from '../core/time-utils';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Transcript } from '../../models/transcript';
import type { Timeline } from '../../models/timeline';
import type { Bounds } from './types/bounds';
import { DEFAULT_SPEAKER_COLOR } from '../constants/ui';
import { withDimming } from './draw-utils';

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
	private sk: p5;
	private bounds: Bounds;
	private users: User[];
	private userMap: Map<string, User>;
	private timeline: Timeline;
	private transcript: Transcript;
	private config: ConfigStoreType;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.users = get(UserStore);
		this.userMap = new Map(this.users.map((user) => [user.name, user]));
		this.timeline = get(TimelineStore);
		this.transcript = get(TranscriptStore);
		this.config = get(ConfigStore);
	}

	draw(words: DataPoint[]): { hoveredCell: DataPoint | null; hoveredSpeaker: string | null } {
		const speakers = this.users.filter((u) => u.enabled).map((u) => u.name);
		const grid = this.getGridBounds();
		const numBins = Math.max(1, Math.floor(grid.width / TARGET_CELL_WIDTH));

		if (speakers.length === 0) return { hoveredCell: null, hoveredSpeaker: null };

		const searchTerm = this.config.wordToSearch?.toLowerCase() || '';
		const binnedData = this.binWords(words, numBins, speakers);
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
		this.sk.textSize(Math.min(12, cellHeight * 0.7));
		this.sk.textAlign(this.sk.RIGHT, this.sk.CENTER);
		this.sk.noStroke();
		const labelWidth = grid.x - this.bounds.x - 10;
		for (let row = 0; row < speakers.length; row++) {
			const user = this.userMap.get(speakers[row]);
			this.sk.fill(user?.color || DEFAULT_SPEAKER_COLOR);
			const label = this.truncateLabel(speakers[row], labelWidth);
			this.sk.text(label, grid.x - 8, grid.y + row * cellHeight + cellHeight / 2);
		}
	}

	private drawCells(binnedData: BinnedData, speakers: string[], grid: Bounds, cellWidth: number, cellHeight: number, searchTerm: string): void {
		const hl = this.config.dashboardHighlightSpeaker;
		const hlTurn = this.config.dashboardHighlightTurn;
		const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		const crossHighlightActive = this.config.dashboardToggle && (hl != null || hlTurn != null) && !mouseInPanel;

		this.sk.noStroke();
		for (let col = 0; col < binnedData.bins.length; col++) {
			const bin = binnedData.bins[col];
			for (let row = 0; row < speakers.length; row++) {
				const cellWords = bin.speakers[speakers[row]] || [];
				const x = grid.x + col * cellWidth + CELL_PADDING;
				const y = grid.y + row * cellHeight + CELL_PADDING;
				const cw = cellWidth - CELL_PADDING * 2;
				const ch = cellHeight - CELL_PADDING * 2;

				const shouldDim = crossHighlightActive && (
					(hl != null && speakers[row] !== hl) ||
					(hlTurn != null && !cellWords.some((w) => w.turnNumber === hlTurn))
				);
				withDimming(this.sk.drawingContext, shouldDim, () => {
					if (cellWords.length > 0) {
						const user = this.userMap.get(speakers[row]);
						let alpha = this.sk.map(cellWords.length, 0, binnedData.maxCellCount, MIN_OPACITY, MAX_OPACITY);
						if (searchTerm && !this.cellMatchesSearch(cellWords, searchTerm)) {
							alpha *= 0.2;
						}
						const c = this.sk.color(user!.color);
						c.setAlpha(alpha);
						this.sk.fill(c);
					} else {
						this.sk.fill(245);
					}
					this.sk.rect(x, y, cw, ch);
				});
			}
		}
	}

	private drawTimeLabels(binnedData: BinnedData, grid: Bounds, cellWidth: number): void {
		const numBins = binnedData.bins.length;
		if (numBins === 0) return;

		const isUntimed = this.transcript.timingMode === 'untimed';
		this.sk.textSize(Math.max(8, Math.min(10, this.bounds.height * 0.03)));
		this.sk.fill(120);
		this.sk.noStroke();

		const labelStep = Math.max(1, Math.floor(numBins / TIME_LABEL_COUNT));
		this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
		for (let col = 0; col < numBins - labelStep / 2; col += labelStep) {
			const bin = binnedData.bins[col];
			const label = isUntimed ? String(Math.round(bin.startTime)) : formatTimeCompact(bin.startTime);
			this.sk.text(label, grid.x + col * cellWidth + cellWidth / 2, grid.y + grid.height + 5);
		}

		// Always label the end
		const lastBin = binnedData.bins[numBins - 1];
		const label = isUntimed ? String(Math.round(lastBin.endTime)) : formatTimeCompact(lastBin.endTime);
		this.sk.textAlign(this.sk.RIGHT, this.sk.TOP);
		this.sk.text(label, grid.x + grid.width, grid.y + grid.height + 5);
	}

	private findHoveredCell(binnedData: BinnedData, speakers: string[], grid: Bounds, cellWidth: number, cellHeight: number, searchTerm: string): HoveredCell | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		const localX = this.sk.mouseX - grid.x;
		const localY = this.sk.mouseY - grid.y;
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
		const user = this.userMap.get(hovered.speaker);
		this.sk.noFill();
		this.sk.stroke(user?.color || DEFAULT_SPEAKER_COLOR);
		this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.sk.rect(grid.x + hovered.col * cellWidth, grid.y + hovered.row * cellHeight, cellWidth, cellHeight);
	}

	private showCellTooltip(hovered: HoveredCell, binnedData: BinnedData): void {
		const bin = binnedData.bins[hovered.col];
		const user = this.userMap.get(hovered.speaker);
		const text = hovered.words.map((w) => w.word).join(' ');
		const isUntimed = this.transcript.timingMode === 'untimed';
		const timeRange = isUntimed
			? `Words ${Math.round(bin.startTime)}-${Math.round(bin.endTime)}`
			: `${formatTimeCompact(bin.startTime)} - ${formatTimeCompact(bin.endTime)}`;

		const content = `<b>${hovered.speaker}</b>\n${text}\n<span style="font-size: 0.85em; opacity: 0.7">${timeRange}</span>`;
		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || DEFAULT_SPEAKER_COLOR, this.bounds.y + this.bounds.height);
	}

	private cellMatchesSearch(words: DataPoint[], searchTerm: string): boolean {
		return words.some((dp) => dp.word.toLowerCase().includes(searchTerm));
	}

	private truncateLabel(text: string, maxWidth: number): string {
		if (this.sk.textWidth(text) <= maxWidth) return text;
		let truncated = text;
		while (truncated.length > 0 && this.sk.textWidth(truncated + '...') > maxWidth) {
			truncated = truncated.slice(0, -1);
		}
		return truncated + '...';
	}

	private binWords(words: DataPoint[], numBins: number, speakers: string[]): BinnedData {
		const range = this.timeline.rightMarker - this.timeline.leftMarker;
		if (range <= 0) return { bins: [], maxCellCount: 0 };

		const binWidth = range / numBins;
		const bins: TimeBin[] = [];
		for (let i = 0; i < numBins; i++) {
			const speakerMap: Record<string, DataPoint[]> = {};
			for (const speaker of speakers) {
				speakerMap[speaker] = [];
			}
			bins.push({
				startTime: this.timeline.leftMarker + i * binWidth,
				endTime: this.timeline.leftMarker + (i + 1) * binWidth,
				speakers: speakerMap
			});
		}

		for (const word of words) {
			const binIndex = Math.floor((word.startTime - this.timeline.leftMarker) / binWidth);
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
}
