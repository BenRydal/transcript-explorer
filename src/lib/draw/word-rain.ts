import type p5 from 'p5';
import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import HoverStore, { type HoverState } from '../../stores/hoverStore';
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
import { withDimming, createUserMap, getCrossHighlight, type CrossHighlight } from './draw-utils';
import { normalizeWord, toTitleCase } from '../core/string-utils';

const MAX_SAMPLE_TURNS = 4;
const CONTEXT_WORDS_BEFORE = 4;
const CONTEXT_WORDS_AFTER = 6;

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
const BIN_DIVIDER_ALPHA = 35;
const BIN_DIVIDER_DASH = [4, 4];

interface AggregatedWord {
	word: string;
	count: number;
	meanTime: number;
	dominantSpeaker: string;
	dominantCount: number;
	occurrences: DataPoint[];
	binRange?: [number, number];
}

interface WordRainResult {
	hoveredOccurrences: DataPoint[];
	hoveredSpeaker: string | null;
	hasOverflow: boolean;
}

const EMPTY_RAIN_RESULT: WordRainResult = { hoveredOccurrences: [], hoveredSpeaker: null, hasOverflow: false };

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
	private hover: HoverState;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.userMap = createUserMap(get(UserStore));
		this.timeline = get(TimelineStore);
		this.transcript = get(TranscriptStore);
		this.config = get(ConfigStore);
		this.hover = get(HoverStore);
		this.searchTerm = this.config.wordToSearch ? normalizeWord(this.config.wordToSearch) : '';
	}

	draw(words: DataPoint[]): WordRainResult {
		if (this.config.separateToggle) {
			return this.drawSeparate(words);
		}
		return this.drawCombined(words);
	}

	private drawCombined(words: DataPoint[]): WordRainResult {
		const visibleWords = words.filter((w) => this.userMap.get(w.speaker)?.enabled !== false);
		const aggregated = this.config.wordRainTemporalBinning ? this.aggregateWordsInBins(visibleWords) : this.aggregateWords(visibleWords);
		const filtered = this.filterAndSort(aggregated);
		if (filtered.length === 0) return EMPTY_RAIN_RESULT;

		const placed = this.placeWordsInRegion(filtered, this.bounds, null);
		if (this.config.wordRainTemporalBinning) {
			this.drawBinDividers(this.bounds);
		}
		return this.renderAndHandleHover(placed, filtered.length > placed.length);
	}

	private drawSeparate(words: DataPoint[]): WordRainResult {
		const enabledUsers = get(UserStore).filter((u) => u.enabled);
		if (enabledUsers.length === 0) return EMPTY_RAIN_RESULT;

		const useBinning = this.config.wordRainTemporalBinning;
		const bySpeaker = useBinning ? this.aggregateWordsBySpeakerInBins(words, enabledUsers) : this.aggregateWordsBySpeaker(words, enabledUsers);
		const bandHeight = this.bounds.height / enabledUsers.length;
		const xhl = getCrossHighlight(this.sk, this.bounds, this.config.dashboardToggle, this.hover);
		const allPlaced: PlacedWord[] = [];
		let hasOverflow = false;

		for (let i = 0; i < enabledUsers.length; i++) {
			const user = enabledUsers[i];
			const bandY = this.bounds.y + i * bandHeight;

			this.drawBandChrome(i, bandY, bandHeight, user);

			const filtered = this.filterAndSort(bySpeaker.get(user.name) ?? []);
			if (filtered.length === 0) continue;

			const bandBounds: Bounds = { x: this.bounds.x, y: bandY, width: this.bounds.width, height: bandHeight };
			const placed = this.placeWordsInRegion(filtered, bandBounds, user.color);
			if (placed.length < filtered.length) hasOverflow = true;
			allPlaced.push(...placed);

			if (useBinning) {
				this.drawBinDividers(bandBounds);
			}

			this.renderBars(placed, xhl);
			this.renderConnectors(placed, xhl);
			this.renderWords(placed, xhl);
		}

		this.drawTimeLabels();

		return this.handleHover(allPlaced, hasOverflow);
	}

	private filterAndSort(aggregated: AggregatedWord[]): AggregatedWord[] {
		const minFreq = this.config.wordRainMinFrequency;
		const search = this.searchTerm;
		const filtered = aggregated.filter((a) => a.count >= minFreq && (!search || a.word.includes(search)));
		filtered.sort((a, b) => b.count - a.count);
		return filtered;
	}

	private renderAndHandleHover(placed: PlacedWord[], hasOverflow: boolean): WordRainResult {
		const xhl = getCrossHighlight(this.sk, this.bounds, this.config.dashboardToggle, this.hover);
		this.renderBars(placed, xhl);
		this.renderConnectors(placed, xhl);
		this.renderWords(placed, xhl);
		this.drawTimeLabels();
		return this.handleHover(placed, hasOverflow);
	}

	private handleHover(placed: PlacedWord[], hasOverflow: boolean): WordRainResult {
		const hovered = this.findHoveredWord(placed);
		if (hovered) {
			this.drawHoverEffect(hovered);
			this.showWordTooltip(hovered);
		}
		return { hoveredOccurrences: hovered?.agg.occurrences ?? [], hoveredSpeaker: hovered?.agg.dominantSpeaker ?? null, hasOverflow };
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
			result.set(
				speaker,
				Array.from(wordMap, ([word, entry]) => ({
					word,
					count: entry.count,
					meanTime: entry.timeSum / entry.count,
					dominantSpeaker: speaker,
					dominantCount: entry.count,
					occurrences: entry.occurrences
				}))
			);
		}
		return result;
	}

	private aggregateWordsInBins(words: DataPoint[]): AggregatedWord[] {
		const { wordRainBinCount: binCount } = this.config;
		const left = this.timeline.leftMarker;
		const range = this.timeline.rightMarker - left;
		if (range <= 0) return [];
		const binWidth = range / binCount;

		const map = new Map<string, AggregatedWord & { speakerCounts: Map<string, number> }>();

		for (const dp of words) {
			const normalized = normalizeWord(dp.word);
			const binIndex = Math.min(Math.floor((dp.startTime - left) / binWidth), binCount - 1);
			const key = normalized + '|' + binIndex;
			const existing = map.get(key);
			if (existing) {
				existing.count++;
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
				const binStart = left + binIndex * binWidth;
				map.set(key, {
					word: normalized,
					count: 1,
					meanTime: binStart + binWidth / 2,
					dominantSpeaker: dp.speaker,
					dominantCount: 1,
					occurrences: [dp],
					binRange: [binStart, binStart + binWidth],
					speakerCounts: sc
				});
			}
		}

		return Array.from(map.values(), (entry) => ({
			word: entry.word,
			count: entry.count,
			meanTime: entry.meanTime,
			dominantSpeaker: entry.dominantSpeaker,
			dominantCount: entry.dominantCount,
			occurrences: entry.occurrences,
			binRange: entry.binRange
		}));
	}

	private aggregateWordsBySpeakerInBins(words: DataPoint[], enabledUsers: User[]): Map<string, AggregatedWord[]> {
		const enabledNames = new Set(enabledUsers.map((u) => u.name));
		const { wordRainBinCount: binCount } = this.config;
		const left = this.timeline.leftMarker;
		const range = this.timeline.rightMarker - left;
		if (range <= 0) return new Map();
		const binWidth = range / binCount;

		const speakerMaps = new Map<string, Map<string, { word: string; count: number; occurrences: DataPoint[]; binRange: [number, number] }>>();

		for (const name of enabledNames) {
			speakerMaps.set(name, new Map());
		}

		for (const dp of words) {
			if (!enabledNames.has(dp.speaker)) continue;
			const speakerMap = speakerMaps.get(dp.speaker)!;
			const normalized = normalizeWord(dp.word);
			const binIndex = Math.min(Math.floor((dp.startTime - left) / binWidth), binCount - 1);
			const key = normalized + '|' + binIndex;
			const existing = speakerMap.get(key);
			if (existing) {
				existing.count++;
				existing.occurrences.push(dp);
			} else {
				const binStart = left + binIndex * binWidth;
				speakerMap.set(key, { word: normalized, count: 1, occurrences: [dp], binRange: [binStart, binStart + binWidth] });
			}
		}

		const result = new Map<string, AggregatedWord[]>();
		for (const [speaker, wordMap] of speakerMaps) {
			result.set(
				speaker,
				Array.from(wordMap.values(), (entry) => ({
					word: entry.word,
					count: entry.count,
					meanTime: (entry.binRange[0] + entry.binRange[1]) / 2,
					dominantSpeaker: speaker,
					dominantCount: entry.count,
					occurrences: entry.occurrences,
					binRange: entry.binRange
				}))
			);
		}
		return result;
	}

	private drawBinDividers(region: Bounds): void {
		const binCount = this.config.wordRainBinCount;
		const ctx = this.sk.drawingContext as CanvasRenderingContext2D;
		const prevDash = ctx.getLineDash();

		ctx.setLineDash(BIN_DIVIDER_DASH);
		const c = this.sk.color(150);
		c.setAlpha(BIN_DIVIDER_ALPHA);
		this.sk.stroke(c);
		this.sk.strokeWeight(1);

		for (let i = 1; i < binCount; i++) {
			const x = region.x + (i / binCount) * region.width;
			this.sk.line(x, region.y, x, region.y + region.height);
		}

		ctx.setLineDash(prevDash);
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

			const sizeT = maxCount > 1 ? Math.log(agg.count) / Math.log(maxCount) : 0;
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
				color = agg.dominantCount / agg.count > DOMINANCE_THRESHOLD ? user?.color || DEFAULT_SPEAKER_COLOR : SHARED_WORD_COLOR;
			}

			placed.push({
				agg,
				x: region.x + left,
				y: wordY,
				textSize,
				width: wordWidth,
				ascent: this.sk.textAscent(),
				descent: this.sk.textDescent(),
				barY,
				barH,
				barW,
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

	private shouldDimWord(xhl: CrossHighlight, pw: PlacedWord): boolean {
		if (!xhl.active) return false;
		if (xhl.turns) return !pw.agg.occurrences.some((o) => xhl.turns!.includes(o.turnNumber));
		return pw.agg.dominantSpeaker !== xhl.speaker;
	}

	private renderBars(placed: PlacedWord[], xhl: CrossHighlight): void {
		this.sk.noStroke();
		for (const pw of placed) {
			withDimming(this.sk.drawingContext, this.shouldDimWord(xhl, pw), () => {
				const c = this.sk.color(pw.color);
				c.setAlpha(180);
				this.sk.fill(c);
				const barX = pw.x + pw.width / 2 - pw.barW / 2;
				this.sk.rect(barX, pw.barY, pw.barW, pw.barH);
			});
		}
	}

	private renderConnectors(placed: PlacedWord[], xhl: CrossHighlight): void {
		for (const pw of placed) {
			withDimming(this.sk.drawingContext, this.shouldDimWord(xhl, pw), () => {
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

	private renderWords(placed: PlacedWord[], xhl: CrossHighlight): void {
		this.sk.noStroke();
		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
		for (const pw of placed) {
			withDimming(this.sk.drawingContext, this.shouldDimWord(xhl, pw), () => {
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
			// Check word text
			if (this.sk.overRect(pw.x, pw.y - pw.ascent, pw.width, pw.ascent + pw.descent)) {
				return pw;
			}
			// Check frequency bar at top
			const barX = pw.x + pw.width / 2 - pw.barW / 2;
			if (this.sk.overRect(barX, pw.barY, pw.barW, pw.barH)) {
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

		// Title: word and total count, with bin range if applicable
		const isUntimed = this.transcript.timingMode === 'untimed';
		let title = `"${agg.word}" spoken ${agg.count} time${agg.count === 1 ? '' : 's'}`;
		if (agg.binRange) {
			const rangeLabel = isUntimed
				? `${Math.round(agg.binRange[0])}–${Math.round(agg.binRange[1])}`
				: `${formatTimeCompact(agg.binRange[0])}–${formatTimeCompact(agg.binRange[1])}`;
			title += ` in ${rangeLabel}`;
		}
		let content = `<b>${title}</b>`;

		// Per-speaker breakdown
		const speakerCounts = new Map<string, number>();
		for (const dp of agg.occurrences) {
			speakerCounts.set(dp.speaker, (speakerCounts.get(dp.speaker) || 0) + 1);
		}
		const sorted = [...speakerCounts.entries()].sort((a, b) => b[1] - a[1]);
		const breakdown = sorted
			.map(([speaker, count]) => {
				const user = this.userMap.get(speaker);
				const color = user?.color || DEFAULT_SPEAKER_COLOR;
				return `<span style="color:${color}">${toTitleCase(speaker)}: ${count}</span>`;
			})
			.join('  ·  ');
		content += `\n${breakdown}`;

		// Sample turn contexts
		const samples = this.getSampleContexts(agg);
		if (samples.length > 0) {
			content += `\n<span style="opacity: 0.5">Sample turns:</span>\n<span style="opacity: 0.7">${samples.join('\n')}</span>`;
		}

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, hovered.color, this.bounds.y + this.bounds.height);
	}

	private getSampleContexts(agg: AggregatedWord): string[] {
		const allWords = this.transcript.wordArray;
		const seenTurns = new Set<number>();
		const samples: string[] = [];

		for (const dp of agg.occurrences) {
			if (seenTurns.has(dp.turnNumber)) continue;
			seenTurns.add(dp.turnNumber);

			const turnWords = allWords.filter((w) => w.turnNumber === dp.turnNumber);
			const idx = turnWords.findIndex((w) => normalizeWord(w.word) === agg.word);
			if (idx < 0) continue;

			const start = Math.max(0, idx - CONTEXT_WORDS_BEFORE);
			const end = Math.min(turnWords.length, idx + CONTEXT_WORDS_AFTER + 1);
			const snippet = turnWords
				.slice(start, end)
				.map((w, i) => (i + start === idx ? `<b>${w.word}</b>` : w.word))
				.join(' ');
			samples.push(`"${start > 0 ? '...' : ''}${snippet}${end < turnWords.length ? '...' : ''}"`);

			if (samples.length >= MAX_SAMPLE_TURNS) break;
		}

		return samples;
	}
}
