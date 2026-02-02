import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { User } from '../../models/user';
import type { Bounds } from './types/bounds';
import { withDimming } from './draw-utils';

const LEFT_MARGIN = 60;
const BOTTOM_MARGIN = 40;
const MAX_MARGIN_RATIO = 0.3;
const BAR_PADDING = 2;
const HOVER_OUTLINE_WEIGHT = 2;
const TARGET_BIN_COUNT = 15;
const Y_TICKS = 5;
const TOOLTIP_MAX_TURNS = 4;
const TOOLTIP_PREVIEW_WORDS = 8;

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
	private sk: p5;
	private bounds: Bounds;
	private userMap: Map<string, User>;
	private speakers: string[];
	private config: ConfigStoreType;
	// Absolute grid coordinates (bounds.xy + grid offsets)
	private gx: number;
	private gy: number;
	private gw: number;
	private gh: number;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		const users = get(UserStore);
		this.userMap = new Map(users.map((u) => [u.name, u]));
		this.speakers = users.filter((u) => u.enabled).map((u) => u.name);
		this.config = get(ConfigStore);
		const leftMargin = Math.min(LEFT_MARGIN, bounds.width * MAX_MARGIN_RATIO);
		const bottomMargin = Math.min(BOTTOM_MARGIN, bounds.height * MAX_MARGIN_RATIO);
		this.gx = bounds.x + leftMargin;
		this.gy = bounds.y + 10;
		this.gw = bounds.width - leftMargin - 10;
		this.gh = bounds.height - bottomMargin - 10;
	}

	draw(turns: TurnSummary[]): { snippetPoints: DataPoint[]; hoveredSpeaker: string | null } {
		if (turns.length === 0 || this.speakers.length === 0) return { snippetPoints: [], hoveredSpeaker: null };

		const bins = this.binTurns(turns);
		if (bins.length === 0) return { snippetPoints: [], hoveredSpeaker: null };

		const maxCount = Math.max(...bins.map((b) => b.totalCount));
		if (maxCount === 0) return { snippetPoints: [], hoveredSpeaker: null };

		const barWidth = this.gw / bins.length;

		const localX = this.sk.mouseX - this.gx;
		const localY = this.sk.mouseY - this.gy;
		const mouseInGrid = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)
			&& localX >= 0 && localX < this.gw && localY >= 0 && localY < this.gh;
		const hoveredBinIndex = mouseInGrid ? Math.floor(localX / barWidth) : -1;

		this.drawYAxis(maxCount);
		const hoveredSegment = this.drawBars(bins, maxCount, barWidth, hoveredBinIndex, localY);
		this.drawXAxis(bins, barWidth);

		if (hoveredSegment) {
			this.drawHoverEffect(hoveredSegment, barWidth);
			this.showSegmentTooltip(hoveredSegment, bins);
			const binTurns = bins[hoveredSegment.binIndex].speakers.get(hoveredSegment.speaker)!;
			return { snippetPoints: binTurns.map((t) => t.dataPoint), hoveredSpeaker: hoveredSegment.speaker };
		}

		return { snippetPoints: [], hoveredSpeaker: null };
	}

	private drawYAxis(maxCount: number): void {
		this.sk.textSize(Math.max(8, Math.min(10, this.bounds.height * 0.03)));
		this.sk.textAlign(this.sk.RIGHT, this.sk.CENTER);
		this.sk.noStroke();
		for (let i = 0; i <= Y_TICKS; i++) {
			const frac = i / Y_TICKS;
			const val = Math.round(frac * maxCount);
			const y = this.gy + this.gh - frac * this.gh;
			this.sk.fill(120);
			this.sk.text(String(val), this.gx - 8, y);
			this.sk.stroke(240);
			this.sk.strokeWeight(1);
			this.sk.line(this.gx, y, this.gx + this.gw, y);
			this.sk.noStroke();
		}
	}

	private drawBars(bins: Bin[], maxCount: number, barWidth: number, hoveredBinIndex: number, localY: number): HoveredSegment | null {
		let hoveredSegment: HoveredSegment | null = null;

		const hl = this.config.dashboardHighlightSpeaker;
		const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		const crossHighlightActive = this.config.dashboardToggle && hl != null && !mouseInPanel;

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

				withDimming(this.sk.drawingContext, crossHighlightActive && speaker !== hl, () => {
					const user = this.userMap.get(speaker);
					const c = this.sk.color(user!.color);
					c.setAlpha(200);
					this.sk.fill(c);
					this.sk.rect(x, y, w, h, 1);
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
		this.sk.textSize(fontSize);
		this.sk.fill(120);
		this.sk.noStroke();
		this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
		const labelInterval = Math.max(1, Math.floor(bins.length / 10));
		for (let b = 0; b < bins.length; b += labelInterval) {
			const bin = bins[b];
			const label = bin.minLength === bin.maxLength ? String(bin.minLength) : `${bin.minLength}-${bin.maxLength}`;
			this.sk.text(label, this.gx + b * barWidth + barWidth / 2, this.gy + this.gh + 5);
		}

		this.sk.textSize(fontSize + 1);
		this.sk.fill(100);
		this.sk.text('Words per turn', this.gx + this.gw / 2, this.gy + this.gh + 5 + fontSize + 4);
	}

	private drawHoverEffect(hovered: HoveredSegment, barWidth: number): void {
		const user = this.userMap.get(hovered.speaker);
		this.sk.noFill();
		this.sk.stroke(user?.color || '#cccccc');
		this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.sk.rect(this.gx + hovered.binIndex * barWidth + BAR_PADDING, hovered.y, barWidth - BAR_PADDING * 2, hovered.h, 1);
	}

	private showSegmentTooltip(hovered: HoveredSegment, bins: Bin[]): void {
		const bin = bins[hovered.binIndex];
		const turns = bin.speakers.get(hovered.speaker)!;
		const user = this.userMap.get(hovered.speaker);
		const multiTurn = turns.length > 1;
		const separator = '<span style="opacity: 0.2">———</span>';
		const turnLines = turns.slice(0, TOOLTIP_MAX_TURNS).map((t) => {
			let text = t.content;
			if (multiTurn) {
				const words = t.content.split(' ');
				if (words.length > TOOLTIP_PREVIEW_WORDS) {
					text = words.slice(0, TOOLTIP_PREVIEW_WORDS).join(' ') + `... (${words.length - TOOLTIP_PREVIEW_WORDS} more words)`;
				}
			}
			return `<span style="font-size: 0.85em; opacity: 0.6">${t.wordCount} words</span>\n${text}`;
		});
		const remaining = turns.length - TOOLTIP_MAX_TURNS;
		if (remaining > 0) {
			turnLines.push(`<span style="font-size: 0.85em; opacity: 0.5">...and ${remaining} more turn${remaining !== 1 ? 's' : ''}</span>`);
		}
		const content = `<b>${hovered.speaker}</b> · ${turns.length} turn${multiTurn ? 's' : ''}\n${turnLines.join('\n' + separator + '\n')}`;
		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || '#cccccc', this.bounds.y + this.bounds.height);
	}

	private binTurns(turns: TurnSummary[]): Bin[] {
		const maxWordCount = Math.max(...turns.map((t) => t.wordCount));
		const minWordCount = Math.min(...turns.map((t) => t.wordCount));
		const range = maxWordCount - minWordCount;

		let binSize: number;
		let numBins: number;

		if (range === 0) {
			binSize = 1;
			numBins = 1;
		} else {
			binSize = Math.max(1, Math.ceil(range / TARGET_BIN_COUNT));
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
}
