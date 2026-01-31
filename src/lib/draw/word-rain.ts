/**
 * Word Rain Visualization
 *
 * Words positioned along a temporal x-axis with frequency on the y-axis.
 * Most frequent words appear at the top; less frequent words cascade downward
 * using collision avoidance. Thin frequency bars at top connect to words below.
 *
 * Performance: Uses an offscreen buffer that only re-renders when data changes.
 * Hover effects are drawn on top of the cached buffer each frame.
 */

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
import type { Bounds } from './types/bounds';
import { getWordWidth } from './contribution-cloud-scaling';

// --- Layout constants ---
const BAR_REGION_FRACTION = 0.12;
const MIN_TEXT_SIZE = 10;
const MAX_TEXT_SIZE = 32;
const WORD_PADDING = 4;
const BAR_WIDTH = 3;
const BAR_OPACITY = 180;
const CONNECTOR_OPACITY = 40;
const OVERLAY_OPACITY = 200;
const HOVER_OUTLINE_WEIGHT = 2;

interface AggregatedWord {
	word: string;
	count: number;
	meanTime: number;
	dominantSpeaker: string;
	firstDataPoint: DataPoint;
}

interface PlacedWord {
	agg: AggregatedWord;
	x: number;
	y: number;
	textSize: number;
	width: number;
	height: number;
	barHeight: number;
	user: User | undefined;
}

// --- Module-level buffer cache ---
let bufferCache: {
	buffer: p5.Graphics | null;
	positions: PlacedWord[];
	cacheKey: string | null;
} = {
	buffer: null,
	positions: [],
	cacheKey: null
};

export function clearWordRainBuffer(): void {
	if (bufferCache.buffer) {
		bufferCache.buffer.remove();
	}
	bufferCache = { buffer: null, positions: [], cacheKey: null };
}

export class WordRain {
	sk: p5;
	bounds: Bounds;
	users: User[];
	config: ConfigStoreType;
	userMap: Map<string, User>;

	constructor(sk: p5, bounds: Bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.users = get(UserStore);
		this.config = get(ConfigStore);
		this.userMap = new Map(this.users.map((user) => [user.name, user]));
	}

	draw(aggregatedWords: AggregatedWord[]): { hoveredWord: DataPoint | null } {
		const cacheKey = this.getBufferCacheKey(aggregatedWords.length);

		if (cacheKey !== bufferCache.cacheKey || !bufferCache.buffer) {
			this.renderToBuffer(aggregatedWords);
			bufferCache.cacheKey = cacheKey;
		}

		this.sk.image(bufferCache.buffer!, this.bounds.x, this.bounds.y);

		const hoveredPos = this.findHoveredWord(bufferCache.positions);
		if (hoveredPos) {
			this.drawHoverEffects(hoveredPos);
			this.showWordTooltip(hoveredPos);
		}

		return { hoveredWord: hoveredPos?.agg.firstDataPoint || null };
	}

	getBufferCacheKey(wordCount: number): string {
		const userStates = this.users.map((u) => `${u.name}:${u.color}:${u.enabled}`).join(',');
		const timeline = get(TimelineStore);
		return [
			this.bounds.x,
			this.bounds.y,
			this.bounds.width,
			this.bounds.height,
			wordCount,
			timeline.leftMarker,
			timeline.rightMarker,
			this.config.wordToSearch || '',
			userStates
		].join('|');
	}

	renderToBuffer(aggregatedWords: AggregatedWord[]): void {
		if (bufferCache.buffer) {
			bufferCache.buffer.remove();
		}

		const buffer = this.sk.createGraphics(this.bounds.width, this.bounds.height);
		buffer.textFont(this.sk.font);

		const positions = this.calculateWordPositions(aggregatedWords);
		bufferCache.positions = positions;

		const barRegionHeight = this.bounds.height * BAR_REGION_FRACTION;
		const maxCount = aggregatedWords.length > 0 ? aggregatedWords[0].count : 1;

		for (const pos of positions) {
			const centerX = pos.x + pos.width / 2;
			const wordTop = pos.y - pos.height;

			if (pos.user?.enabled) {
				// Connector line
				const connColor = buffer.color(pos.user.color);
				connColor.setAlpha(CONNECTOR_OPACITY);
				buffer.stroke(connColor);
				buffer.strokeWeight(1);
				buffer.line(centerX, pos.barHeight, centerX, wordTop);

				// Frequency bar
				const barH = this.sk.map(pos.agg.count, 1, maxCount, 4, barRegionHeight);
				const barColor = buffer.color(pos.user.color);
				barColor.setAlpha(BAR_OPACITY);
				buffer.noStroke();
				buffer.fill(barColor);
				buffer.rect(centerX - BAR_WIDTH / 2, barRegionHeight - barH, BAR_WIDTH, barH);

				// Word
				buffer.fill(pos.user.color);
			} else {
				buffer.noStroke();
				buffer.fill(255);
			}

			buffer.textSize(pos.textSize);
			buffer.textAlign(buffer.CENTER, buffer.TOP);
			buffer.text(pos.agg.word, centerX, wordTop);
		}

		bufferCache.buffer = buffer;
	}

	calculateWordPositions(aggregatedWords: AggregatedWord[]): PlacedWord[] {
		const positions: PlacedWord[] = [];
		const timeline = get(TimelineStore);
		const timeRange = timeline.rightMarker - timeline.leftMarker;
		if (timeRange <= 0) return positions;

		const barRegionHeight = this.bounds.height * BAR_REGION_FRACTION;
		const wordRegionTop = barRegionHeight + WORD_PADDING * 2;
		const maxCount = aggregatedWords.length > 0 ? aggregatedWords[0].count : 1;

		for (const agg of aggregatedWords) {
			// Search filter
			if (this.config.wordToSearch && !agg.word.toLowerCase().includes(this.config.wordToSearch.toLowerCase())) {
				continue;
			}

			const user = this.userMap.get(agg.dominantSpeaker);

			// Map time to x position
			const tNorm = (agg.meanTime - timeline.leftMarker) / timeRange;
			const textSize = this.sk.map(agg.count, 1, maxCount, MIN_TEXT_SIZE, MAX_TEXT_SIZE, true);
			const wordW = getWordWidth(this.sk, agg.word, textSize);
			const wordH = textSize;

			// Center word at temporal position, clamp to bounds
			let x = tNorm * this.bounds.width - wordW / 2;
			x = Math.max(0, Math.min(this.bounds.width - wordW, x));

			// Start y just below bar region, push down on collision
			let y = wordRegionTop + wordH;
			for (const placed of positions) {
				if (this.rectsOverlap(x, y - wordH, wordW, wordH, placed.x, placed.y - placed.height, placed.width, placed.height)) {
					y = placed.y + WORD_PADDING + wordH;
				}
			}

			// Stop placing words that would go off the bottom
			if (y > this.bounds.height) break;

			const barH = this.sk.map(agg.count, 1, maxCount, 4, barRegionHeight);

			positions.push({
				agg,
				x,
				y,
				textSize,
				width: wordW,
				height: wordH,
				barHeight: barRegionHeight - barH,
				user
			});
		}

		return positions;
	}

	rectsOverlap(
		x1: number, y1: number, w1: number, h1: number,
		x2: number, y2: number, w2: number, h2: number
	): boolean {
		return x1 < x2 + w2 + WORD_PADDING &&
			x1 + w1 + WORD_PADDING > x2 &&
			y1 < y2 + h2 + WORD_PADDING &&
			y1 + h1 + WORD_PADDING > y2;
	}

	findHoveredWord(positions: PlacedWord[]): PlacedWord | null {
		if (!this.sk.overRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)) {
			return null;
		}
		// Check in reverse (top words are drawn first, so later words are on top visually at bottom)
		for (let i = positions.length - 1; i >= 0; i--) {
			const pos = positions[i];
			if (pos.user?.enabled) {
				const screenX = this.bounds.x + pos.x;
				const screenY = this.bounds.y + pos.y - pos.height;
				if (this.sk.overRect(screenX, screenY, pos.width, pos.height)) {
					return pos;
				}
			}
		}
		return null;
	}

	drawHoverEffects(hoveredPos: PlacedWord): void {
		// Dim overlay
		this.sk.noStroke();
		this.sk.fill(255, OVERLAY_OPACITY);
		this.sk.rect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);

		const screenX = this.bounds.x + hoveredPos.x;
		const screenY = this.bounds.y + hoveredPos.y - hoveredPos.height;
		const centerX = screenX + hoveredPos.width / 2;
		const color = hoveredPos.user?.color || '#cccccc';

		// Bar
		const barH = this.bounds.height * BAR_REGION_FRACTION - hoveredPos.barHeight;
		this.sk.noStroke();
		this.sk.fill(color);
		this.sk.rect(centerX - BAR_WIDTH / 2, this.bounds.y + hoveredPos.barHeight, BAR_WIDTH, barH);

		// Connector line
		this.sk.stroke(color);
		this.sk.strokeWeight(1.5);
		this.sk.line(centerX, this.bounds.y + hoveredPos.barHeight + barH, centerX, screenY);

		// Word
		this.sk.textSize(hoveredPos.textSize);
		this.sk.noStroke();
		this.sk.fill(color);
		this.sk.textAlign(this.sk.CENTER, this.sk.TOP);
		this.sk.text(hoveredPos.agg.word, centerX, screenY);

		// Outline box
		const padding = 3;
		this.sk.noFill();
		this.sk.stroke(color);
		this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
		this.sk.rect(screenX - padding, screenY - padding, hoveredPos.width + padding * 2, hoveredPos.height + padding * 2, 4);

		// Reset text alignment
		this.sk.textAlign(this.sk.LEFT, this.sk.BASELINE);
	}

	showWordTooltip(pos: PlacedWord): void {
		const { agg, user } = pos;

		let content = `<b>${agg.dominantSpeaker}:</b> ${agg.word}`;

		const details = [`×${agg.count}`];
		const transcript = get(TranscriptStore);
		if (transcript.timingMode !== 'untimed' && agg.meanTime != null) {
			details.push(formatTimeCompact(agg.meanTime));
		}

		content += `\n<span style="font-size: 0.85em; opacity: 0.7">${details.join('  ·  ')}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || '#cccccc', this.sk.height);
	}
}

/**
 * Aggregate processed words by unique word text.
 * Returns array sorted by count descending (most frequent first).
 */
export function aggregateWordsForRain(words: DataPoint[]): AggregatedWord[] {
	const map = new Map<string, { count: number; totalTime: number; speakerCounts: Map<string, number>; firstDataPoint: DataPoint }>();

	for (const w of words) {
		const key = w.word.toLowerCase();
		const existing = map.get(key);
		if (existing) {
			existing.count++;
			existing.totalTime += w.startTime;
			existing.speakerCounts.set(w.speaker, (existing.speakerCounts.get(w.speaker) || 0) + 1);
		} else {
			map.set(key, {
				count: 1,
				totalTime: w.startTime,
				speakerCounts: new Map([[w.speaker, 1]]),
				firstDataPoint: w
			});
		}
	}

	const result: AggregatedWord[] = [];
	for (const [word, data] of map) {
		let dominantSpeaker = '';
		let maxCount = 0;
		for (const [speaker, count] of data.speakerCounts) {
			if (count > maxCount) {
				maxCount = count;
				dominantSpeaker = speaker;
			}
		}
		result.push({ word, count: data.count, meanTime: data.totalTime / data.count, dominantSpeaker, firstDataPoint: data.firstDataPoint });
	}

	return result.sort((a, b) => b.count - a.count);
}
