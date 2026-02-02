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
import { normalizeWord, toTitleCase } from '../core/string-utils';

const BAR_SECTION_RATIO = 0.12;
const BAR_MIN_WIDTH = 2;
const BAR_MAX_WIDTH = 10;
const TEXT_MIN_RATIO = 0.03;
const TEXT_MAX_RATIO = 0.09;
const CONNECTOR_MIN_ALPHA = 40;
const CONNECTOR_MAX_ALPHA = 150;
const CONNECTOR_MIN_WEIGHT = 0.5;
const CONNECTOR_MAX_WEIGHT = 2.5;
const HOVER_OVERLAY_ALPHA = 200;
const BOTTOM_MARGIN_RATIO = 0.05;
const TIME_LABEL_COUNT = 6;
const DOMINANCE_THRESHOLD = 0.6;
const SHARED_WORD_COLOR = '#aaaaaa';
const SPEAKER_LABEL_SIZE = 10;
const SPEAKER_BAND_BG_ALPHA = 15;
const SPEAKER_BAND_DIVIDER_ALPHA = 40;

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
	ascent: number;
	descent: number;
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
	private config: ConfigStoreType;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		const users = get(UserStore);
		this.userMap = new Map(users.map((u) => [u.name, u]));
		this.timeline = get(TimelineStore);
		this.transcript = get(TranscriptStore);
		this.config = get(ConfigStore);
		this.searchTerm = this.config.wordToSearch ? normalizeWord(this.config.wordToSearch) : '';
	}

	private getCrossHighlight(): { active: boolean; speaker: string } {
		const hl = this.config.dashboardHighlightSpeaker;
		if (!hl || !this.config.dashboardToggle) return { active: false, speaker: '' };
		const mouseInPanel = this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
		return { active: !mouseInPanel, speaker: hl };
	}

	draw(words: DataPoint[]): { hoveredOccurrences: DataPoint[]; hoveredSpeaker: string | null } {
		if (this.config.separateToggle) {
			return this.drawSeparate(words);
		}
		return this.drawCombined(words);
	}

	private drawCombined(words: DataPoint[]): { hoveredOccurrences: DataPoint[]; hoveredSpeaker: string | null } {
		const visibleWords = words.filter((w) => this.userMap.get(w.speaker)?.enabled !== false);
		const aggregated = this.aggregateWords(visibleWords);
		const filtered = this.filterAndSort(aggregated);
		if (filtered.length === 0) return { hoveredOccurrences: [], hoveredSpeaker: null };

		const placed = this.placeWordsInRegion(filtered, this.bounds, null);
		return this.renderAndHandleHover(placed);
	}

	private drawSeparate(words: DataPoint[]): { hoveredOccurrences: DataPoint[]; hoveredSpeaker: string | null } {
		const enabledUsers = get(UserStore).filter((u) => u.enabled);
		if (enabledUsers.length === 0) return { hoveredOccurrences: [], hoveredSpeaker: null };

		const bySpeaker = this.aggregateWordsBySpeaker(words, enabledUsers);
		const bandHeight = this.bounds.height / enabledUsers.length;
		const xhl = this.getCrossHighlight();
		const allPlaced: PlacedWord[] = [];

		for (let i = 0; i < enabledUsers.length; i++) {
			const user = enabledUsers[i];
			const bandY = this.bounds.y + i * bandHeight;

			this.drawBandChrome(i, bandY, bandHeight, user);

			const filtered = this.filterAndSort(bySpeaker.get(user.name) ?? []);
			if (filtered.length === 0) continue;

			const bandBounds: Bounds = { x: this.bounds.x, y: bandY, width: this.bounds.width, height: bandHeight };
			const placed = this.placeWordsInRegion(filtered, bandBounds, user.color);
			allPlaced.push(...placed);

			this.renderBars(placed, xhl);
			this.renderConnectors(placed, xhl);
			this.renderWords(placed, xhl);
		}

		this.drawTimeLabels();

		return this.handleHover(allPlaced);
	}

	private filterAndSort(aggregated: AggregatedWord[]): AggregatedWord[] {
		const filtered = this.searchTerm
			? aggregated.filter((a) => a.word.includes(this.searchTerm))
			: aggregated;
		filtered.sort((a, b) => b.count - a.count);
		return filtered;
	}

	private renderAndHandleHover(placed: PlacedWord[]): { hoveredOccurrences: DataPoint[]; hoveredSpeaker: string | null } {
		const xhl = this.getCrossHighlight();
		this.renderBars(placed, xhl);
		this.renderConnectors(placed, xhl);
		this.renderWords(placed, xhl);
		this.drawTimeLabels();
		return this.handleHover(placed);
	}

	private handleHover(placed: PlacedWord[]): { hoveredOccurrences: DataPoint[]; hoveredSpeaker: string | null } {
		const hovered = this.findHoveredWord(placed);
		if (hovered) {
			this.drawHoverEffect(hovered);
			this.showWordTooltip(hovered);
		}
		return { hoveredOccurrences: hovered?.agg.occurrences ?? [], hoveredSpeaker: hovered?.agg.dominantSpeaker ?? null };
	}

	private drawBandChrome(index: number, bandY: number, bandHeight: number, user: User): void {
		if (index % 2 === 1) {
			this.sk.noStroke();
			const bgColor = this.sk.color(user.color);
			bgColor.setAlpha(SPEAKER_BAND_BG_ALPHA);
			this.sk.fill(bgColor);
			this.sk.rect(this.bounds.x, bandY, this.bounds.width, bandHeight);
		}

		if (index > 0) {
			const divColor = this.sk.color(150);
			divColor.setAlpha(SPEAKER_BAND_DIVIDER_ALPHA);
			this.sk.stroke(divColor);
			this.sk.strokeWeight(0.5);
			this.sk.line(this.bounds.x, bandY, this.bounds.x + this.bounds.width, bandY);
		}

		this.sk.noStroke();
		this.sk.fill(user.color);
		this.sk.textSize(SPEAKER_LABEL_SIZE);
		this.sk.textAlign(this.sk.LEFT, this.sk.TOP);
		this.sk.text(toTitleCase(user.name), this.bounds.x + 4, bandY + 2);
	}

	private aggregateWordsBySpeaker(words: DataPoint[], enabledUsers: User[]): Map<string, AggregatedWord[]> {
		const enabledNames = new Set(enabledUsers.map((u) => u.name));
		const speakerMaps = new Map<string, Map<string, { count: number; timeSum: number; occurrences: DataPoint[] }>>();

		for (const name of enabledNames) {
			speakerMaps.set(name, new Map());
		}

		for (const dp of words) {
			if (!enabledNames.has(dp.speaker)) continue;
			const speakerMap = speakerMaps.get(dp.speaker)!;
			const key = normalizeWord(dp.word);
			const existing = speakerMap.get(key);
			if (existing) {
				existing.count++;
				existing.timeSum += dp.startTime;
				existing.occurrences.push(dp);
			} else {
				speakerMap.set(key, { count: 1, timeSum: dp.startTime, occurrences: [dp] });
			}
		}

		const result = new Map<string, AggregatedWord[]>();
		for (const [speaker, wordMap] of speakerMaps) {
			result.set(speaker, Array.from(wordMap, ([word, entry]) => ({
				word,
				count: entry.count,
				meanTime: entry.timeSum / entry.count,
				dominantSpeaker: speaker,
				dominantCount: entry.count,
				occurrences: entry.occurrences
			})));
		}
		return result;
	}

	/**
	 * Places words within a region. When speakerColor is provided (separate mode),
	 * all words use that color; otherwise color is determined by speaker dominance.
	 */
	private placeWordsInRegion(filtered: AggregatedWord[], region: Bounds, speakerColor: string | null): PlacedWord[] {
		if (filtered.length === 0) return [];

		const maxCount = filtered[0].count;
		const isSeparate = speakerColor !== null;
		const labelOffset = isSeparate ? SPEAKER_LABEL_SIZE + 4 : 0;
		const barSectionHeight = region.height * BAR_SECTION_RATIO;
		const textAreaTop = region.y + barSectionHeight + labelOffset;
		const bottomMargin = Math.max(isSeparate ? 8 : 15, region.height * BOTTOM_MARGIN_RATIO);
		const textAreaBottom = region.y + region.height - bottomMargin;
		if (textAreaTop >= textAreaBottom) return [];

		const pixelWidth = Math.ceil(region.width);
		const heightMap = new Float32Array(pixelWidth);
		const range = this.timeline.rightMarker - this.timeline.leftMarker;
		if (range <= 0) return [];

		const minFloor = isSeparate ? 7 : 8;
		const maxFloor = isSeparate ? 10 : 12;
		const placed: PlacedWord[] = [];

		for (const agg of filtered) {
			const t = (agg.meanTime - this.timeline.leftMarker) / range;
			const x = region.x + t * region.width;

			const sizeT = maxCount > 1 ? (agg.count - 1) / (maxCount - 1) : 0;
			const minSize = Math.max(minFloor, region.height * TEXT_MIN_RATIO);
			const maxSize = Math.max(maxFloor, region.height * TEXT_MAX_RATIO);
			const textSize = minSize + sizeT * (maxSize - minSize);

			this.sk.textSize(textSize);
			const wordWidth = this.sk.textWidth(agg.word);

			let left = Math.round(x - region.x - wordWidth / 2);
			left = Math.max(0, Math.min(pixelWidth - Math.ceil(wordWidth), left));
			const right = Math.min(pixelWidth - 1, left + Math.ceil(wordWidth));

			let maxY = textAreaTop;
			for (let col = left; col <= right; col++) {
				if (heightMap[col] > maxY) maxY = heightMap[col];
			}

			const wordY = maxY + textSize;
			if (wordY > textAreaBottom) continue;

			for (let col = left; col <= right; col++) {
				heightMap[col] = wordY + 2;
			}

			const countRatio = agg.count / maxCount;
			const barH = barSectionHeight * countRatio;
			const barY = region.y + barSectionHeight - barH;
			const barW = BAR_MIN_WIDTH + countRatio * (BAR_MAX_WIDTH - BAR_MIN_WIDTH);

			let color: string;
			if (speakerColor) {
				color = speakerColor;
			} else {
				const user = this.userMap.get(agg.dominantSpeaker);
				color = agg.dominantCount / agg.count > DOMINANCE_THRESHOLD ? (user?.color || DEFAULT_SPEAKER_COLOR) : SHARED_WORD_COLOR;
			}

			placed.push({
				agg,
				x: region.x + left,
				y: wordY,
				textSize,
				width: wordWidth,
				ascent: this.sk.textAscent(),
				descent: this.sk.textDescent(),
				barY, barH, barW,
				countRatio,
				color
			});
		}

		return placed;
	}

	private aggregateWords(words: DataPoint[]): AggregatedWord[] {
		const map = new Map<string, AggregatedWord & { timeSum: number; speakerCounts: Map<string, number> }>();

		for (const dp of words) {
			const key = normalizeWord(dp.word);
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

	private renderBars(placed: PlacedWord[], xhl: { active: boolean; speaker: string }): void {
		this.sk.noStroke();
		for (const pw of placed) {
			withDimming(this.sk.drawingContext, xhl.active && pw.agg.dominantSpeaker !== xhl.speaker, () => {
				const c = this.sk.color(pw.color);
				c.setAlpha(180);
				this.sk.fill(c);
				const barX = pw.x + pw.width / 2 - pw.barW / 2;
				this.sk.rect(barX, pw.barY, pw.barW, pw.barH);
			});
		}
	}

	private renderConnectors(placed: PlacedWord[], xhl: { active: boolean; speaker: string }): void {
		for (const pw of placed) {
			withDimming(this.sk.drawingContext, xhl.active && pw.agg.dominantSpeaker !== xhl.speaker, () => {
				const alpha = CONNECTOR_MIN_ALPHA + pw.countRatio * (CONNECTOR_MAX_ALPHA - CONNECTOR_MIN_ALPHA);
				const weight = CONNECTOR_MIN_WEIGHT + pw.countRatio * (CONNECTOR_MAX_WEIGHT - CONNECTOR_MIN_WEIGHT);
				const c = this.sk.color(pw.color);
				c.setAlpha(alpha);
				this.sk.stroke(c);
				this.sk.strokeWeight(weight);
				const centerX = pw.x + pw.width / 2;
				this.sk.line(centerX, pw.barY + pw.barH, centerX, pw.y - pw.textSize);
			});
		}
	}

	private renderWords(placed: PlacedWord[], xhl: { active: boolean; speaker: string }): void {
		this.sk.noStroke();
		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
		for (const pw of placed) {
			withDimming(this.sk.drawingContext, xhl.active && pw.agg.dominantSpeaker !== xhl.speaker, () => {
				this.sk.textSize(pw.textSize);
				this.sk.fill(pw.color);
				this.sk.text(pw.agg.word, pw.x, pw.y);
			});
		}
	}

	private drawTimeLabels(): void {
		const isUntimed = this.transcript.timingMode === 'untimed';
		const range = this.timeline.rightMarker - this.timeline.leftMarker;
		if (range <= 0) return;

		const bottomMargin = Math.max(15, this.bounds.height * BOTTOM_MARGIN_RATIO);
		this.sk.textSize(Math.max(8, bottomMargin * 0.5));
		this.sk.fill(120);
		this.sk.noStroke();

		const labelY = this.bounds.y + this.bounds.height - bottomMargin + 5;
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
			if (this.sk.overRect(pw.x, pw.y - pw.ascent, pw.width, pw.ascent + pw.descent)) {
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
		this.sk.rect(hovered.x - 2, hovered.y - hovered.ascent - 2, hovered.width + 4, hovered.ascent + hovered.descent + 4, 2);
	}

	private showWordTooltip(hovered: PlacedWord): void {
		const agg = hovered.agg;
		const isUntimed = this.transcript.timingMode === 'untimed';
		const timestamp = isUntimed ? '' : `\n<span style="font-size: 0.85em; opacity: 0.7">${formatTimeCompact(agg.meanTime)}</span>`;
		const content = `<b>${agg.dominantSpeaker}</b>\n"${agg.word}" \u00d7${agg.count}${timestamp}`;
		showTooltip(this.sk.mouseX, this.sk.mouseY, content, hovered.color, this.bounds.y + this.bounds.height);
	}
}
