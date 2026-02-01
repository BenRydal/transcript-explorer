import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';
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

const BAR_SECTION_RATIO = 0.12;
const BAR_MIN_WIDTH = 2;
const BAR_MAX_WIDTH = 10;
const TEXT_MIN_SIZE = 10;
const TEXT_MAX_SIZE = 28;
const CONNECTOR_MIN_ALPHA = 40;
const CONNECTOR_MAX_ALPHA = 150;
const CONNECTOR_MIN_WEIGHT = 0.5;
const CONNECTOR_MAX_WEIGHT = 2.5;
const HOVER_OVERLAY_ALPHA = 200;
const BOTTOM_MARGIN = 20;
const TIME_LABEL_COUNT = 6;
const DOMINANCE_THRESHOLD = 0.6;
const SHARED_WORD_COLOR = '#aaaaaa';

interface AggregatedWord {
	word: string;
	count: number;
	meanTime: number;
	dominantSpeaker: string;
	dominantCount: number;
	occurrences: DataPoint[];
}

interface PlacedWord {
	agg: AggregatedWord;
	x: number;
	y: number;
	textSize: number;
	width: number;
	barY: number;
	barH: number;
	barW: number;
	countRatio: number; // 0..1, used for connector weight/alpha
	color: string;
}

export class WordRain {
	private sk: p5;
	private bounds: Bounds;
	private userMap: Map<string, User>;
	private timeline: Timeline;
	private transcript: Transcript;
	private searchTerm: string;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		const users = get(UserStore);
		this.userMap = new Map(users.map((u) => [u.name, u]));
		this.timeline = get(TimelineStore);
		this.transcript = get(TranscriptStore);
		this.searchTerm = get(ConfigStore).wordToSearch?.toLowerCase() || '';
	}

	draw(words: DataPoint[]): { hoveredOccurrences: DataPoint[] } {
		const aggregated = this.aggregateWords(words);
		const filtered = this.searchTerm
			? aggregated.filter((a) => a.word.includes(this.searchTerm))
			: aggregated;

		if (filtered.length === 0) return { hoveredOccurrences: [] };

		filtered.sort((a, b) => b.count - a.count);
		const maxCount = filtered[0].count;

		const barSectionHeight = this.bounds.height * BAR_SECTION_RATIO;
		const textAreaTop = this.bounds.y + barSectionHeight;
		const textAreaBottom = this.bounds.y + this.bounds.height - BOTTOM_MARGIN;

		const placed = this.layoutWords(filtered, maxCount, barSectionHeight, textAreaTop, textAreaBottom);
		this.renderBars(placed);
		this.renderConnectors(placed);
		this.renderWords(placed);
		this.drawTimeLabels();

		const hovered = this.findHoveredWord(placed);
		if (hovered) {
			this.drawHoverEffect(hovered);
			this.showWordTooltip(hovered);
		}

		return { hoveredOccurrences: hovered?.agg.occurrences ?? [] };
	}

	private aggregateWords(words: DataPoint[]): AggregatedWord[] {
		const map = new Map<string, AggregatedWord & { timeSum: number; speakerCounts: Map<string, number> }>();

		for (const dp of words) {
			const key = dp.word.toLowerCase();
			const existing = map.get(key);
			if (existing) {
				existing.count++;
				existing.timeSum += dp.startTime;
				existing.occurrences.push(dp);
				const sc = existing.speakerCounts;
				const newCount = (sc.get(dp.speaker) || 0) + 1;
				sc.set(dp.speaker, newCount);
				if (newCount > existing.dominantCount) {
					existing.dominantSpeaker = dp.speaker;
					existing.dominantCount = newCount;
				}
			} else {
				const sc = new Map<string, number>();
				sc.set(dp.speaker, 1);
				map.set(key, {
					word: key,
					count: 1,
					meanTime: 0,
					timeSum: dp.startTime,
					dominantSpeaker: dp.speaker,
					dominantCount: 1,
					occurrences: [dp],
					speakerCounts: sc
				});
			}
		}

		return Array.from(map.values(), (entry) => ({
			word: entry.word,
			count: entry.count,
			meanTime: entry.timeSum / entry.count,
			dominantSpeaker: entry.dominantSpeaker,
			dominantCount: entry.dominantCount,
			occurrences: entry.occurrences
		}));
	}

	private layoutWords(
		filtered: AggregatedWord[],
		maxCount: number,
		barSectionHeight: number,
		textAreaTop: number,
		textAreaBottom: number
	): PlacedWord[] {
		const pixelWidth = Math.ceil(this.bounds.width);
		const heightMap = new Float32Array(pixelWidth);

		const range = this.timeline.rightMarker - this.timeline.leftMarker;
		if (range <= 0) return [];

		const placed: PlacedWord[] = [];

		for (const agg of filtered) {
			const t = (agg.meanTime - this.timeline.leftMarker) / range;
			const x = this.bounds.x + t * this.bounds.width;

			const sizeT = maxCount > 1 ? (agg.count - 1) / (maxCount - 1) : 0;
			const textSize = TEXT_MIN_SIZE + sizeT * (TEXT_MAX_SIZE - TEXT_MIN_SIZE);

			this.sk.textSize(textSize);
			const wordWidth = this.sk.textWidth(agg.word);

			// Center word horizontally on x, clamp to bounds
			let left = Math.round(x - wordWidth / 2);
			left = Math.max(0, Math.min(pixelWidth - Math.ceil(wordWidth), left));
			const right = Math.min(pixelWidth - 1, left + Math.ceil(wordWidth));

			// Query height-map for max Y in this span
			let maxY = textAreaTop;
			for (let col = left; col <= right; col++) {
				if (heightMap[col] > maxY) maxY = heightMap[col];
			}

			const wordY = maxY + textSize;
			if (wordY > textAreaBottom) continue;

			// Update height-map
			for (let col = left; col <= right; col++) {
				heightMap[col] = wordY + 2; // 2px gap between words
			}

			const countRatio = agg.count / maxCount;
			const barH = barSectionHeight * countRatio;
			const barY = this.bounds.y + barSectionHeight - barH;
			const barW = BAR_MIN_WIDTH + countRatio * (BAR_MAX_WIDTH - BAR_MIN_WIDTH);

			const user = this.userMap.get(agg.dominantSpeaker);
			const color = agg.dominantCount / agg.count > DOMINANCE_THRESHOLD ? (user?.color || DEFAULT_SPEAKER_COLOR) : SHARED_WORD_COLOR;

			placed.push({
				agg,
				x: this.bounds.x + left,
				y: wordY,
				textSize,
				width: wordWidth,
				barY,
				barH,
				barW,
				countRatio,
				color
			});
		}

		return placed;
	}

	private renderBars(placed: PlacedWord[]): void {
		this.sk.noStroke();
		for (const pw of placed) {
			const c = this.sk.color(pw.color);
			c.setAlpha(180);
			this.sk.fill(c);
			const barX = pw.x + pw.width / 2 - pw.barW / 2;
			this.sk.rect(barX, pw.barY, pw.barW, pw.barH);
		}
	}

	private renderConnectors(placed: PlacedWord[]): void {
		for (const pw of placed) {
			const alpha = CONNECTOR_MIN_ALPHA + pw.countRatio * (CONNECTOR_MAX_ALPHA - CONNECTOR_MIN_ALPHA);
			const weight = CONNECTOR_MIN_WEIGHT + pw.countRatio * (CONNECTOR_MAX_WEIGHT - CONNECTOR_MIN_WEIGHT);
			const c = this.sk.color(pw.color);
			c.setAlpha(alpha);
			this.sk.stroke(c);
			this.sk.strokeWeight(weight);
			const centerX = pw.x + pw.width / 2;
			this.sk.line(centerX, pw.barY + pw.barH, centerX, pw.y - pw.textSize);
		}
	}

	private renderWords(placed: PlacedWord[]): void {
		this.sk.noStroke();
		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
		for (const pw of placed) {
			this.sk.textSize(pw.textSize);
			this.sk.fill(pw.color);
			this.sk.text(pw.agg.word, pw.x, pw.y);
		}
	}

	private drawTimeLabels(): void {
		const isUntimed = this.transcript.timingMode === 'untimed';
		const range = this.timeline.rightMarker - this.timeline.leftMarker;
		if (range <= 0) return;

		this.sk.textSize(10);
		this.sk.fill(120);
		this.sk.noStroke();

		const labelY = this.bounds.y + this.bounds.height - BOTTOM_MARGIN + 5;
		const step = range / TIME_LABEL_COUNT;

		for (let i = 0; i <= TIME_LABEL_COUNT; i++) {
			const time = this.timeline.leftMarker + i * step;
			const x = this.bounds.x + (i / TIME_LABEL_COUNT) * this.bounds.width;
			const label = isUntimed ? String(Math.round(time)) : formatTimeCompact(time);
			const align = i === 0 ? this.sk.LEFT : i === TIME_LABEL_COUNT ? this.sk.RIGHT : this.sk.CENTER;
			this.sk.textAlign(align, this.sk.TOP);
			this.sk.text(label, x, labelY);
		}
	}

	private findHoveredWord(placed: PlacedWord[]): PlacedWord | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}

		for (const pw of placed) {
			if (this.sk.overRect(pw.x, pw.y - pw.textSize, pw.width, pw.textSize)) {
				return pw;
			}
		}
		return null;
	}

	private drawHoverEffect(hovered: PlacedWord): void {
		const centerX = hovered.x + hovered.width / 2;

		// Semi-transparent overlay
		this.sk.noStroke();
		this.sk.fill(255, 255, 255, HOVER_OVERLAY_ALPHA);
		this.sk.rect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);

		// Hovered bar
		const barColor = this.sk.color(hovered.color);
		barColor.setAlpha(220);
		this.sk.fill(barColor);
		this.sk.rect(centerX - hovered.barW / 2, hovered.barY, hovered.barW, hovered.barH);

		// Connector
		const weight = CONNECTOR_MIN_WEIGHT + hovered.countRatio * (CONNECTOR_MAX_WEIGHT - CONNECTOR_MIN_WEIGHT);
		const connColor = this.sk.color(hovered.color);
		connColor.setAlpha(160);
		this.sk.stroke(connColor);
		this.sk.strokeWeight(weight);
		this.sk.line(centerX, hovered.barY + hovered.barH, centerX, hovered.y - hovered.textSize);

		// Word text
		this.sk.noStroke();
		this.sk.textSize(hovered.textSize);
		this.sk.fill(hovered.color);
		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
		this.sk.text(hovered.agg.word, hovered.x, hovered.y);

		// Outline box
		this.sk.noFill();
		this.sk.stroke(hovered.color);
		this.sk.strokeWeight(1.5);
		this.sk.rect(hovered.x - 2, hovered.y - hovered.textSize - 2, hovered.width + 4, hovered.textSize + 4, 2);
	}

	private showWordTooltip(hovered: PlacedWord): void {
		const agg = hovered.agg;
		const isUntimed = this.transcript.timingMode === 'untimed';
		const timestamp = isUntimed ? '' : `\n<span style="font-size: 0.85em; opacity: 0.7">${formatTimeCompact(agg.meanTime)}</span>`;
		const content = `<b>${agg.dominantSpeaker}</b>\n"${agg.word}" \u00d7${agg.count}${timestamp}`;
		showTooltip(this.sk.mouseX, this.sk.mouseY, content, hovered.color, this.sk.height);
	}
}
