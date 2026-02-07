import type p5 from 'p5';
import { get } from 'svelte/store';
import TimelineStore from '../../stores/timelineStore';
import type { ConfigStoreType } from '../../stores/configStore';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds } from './types/bounds';
import { stripPunctuation } from '../core/string-utils';

export interface Scaling {
	minTextSize: number;
	maxTextSize: number;
	lineHeight: number;
	newSpeakerGap: number;
	maxCount: number;
}

interface ScalingCache {
	key: string | null;
	scaling: Scaling | null;
}

// Base scaling values (before any adjustment)
const BASE_SCALING: Scaling = {
	minTextSize: 20,
	maxTextSize: 50,
	lineHeight: 50,
	newSpeakerGap: 75,
	maxCount: 2
};

const MIN_SCALE = 0.15;
const CHARS_PER_EM = 2;
const REFERENCE_TEXT_SIZE = 50;

// Module-level caches
let scalingCache: ScalingCache = { key: null, scaling: null };
const wordWidthCache = new Map<string, number>();

function getCacheKey(bounds: Bounds, wordCount: number, maxCount: number, config: ConfigStoreType): string {
	const timeline = get(TimelineStore);
	return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}|${wordCount}|${maxCount}|${config.separateToggle}|${config.repeatedWordsToggle}|${config.repeatWordSliderValue}|${config.dashboardToggle}|${config.scaleToVisibleData}|${timeline.leftMarker},${timeline.rightMarker}`;
}

/**
 * Clears the scaling cache. Call when data changes.
 */
export function clearScalingCache(clearWordWidths = false): void {
	scalingCache.key = null;
	scalingCache.scaling = null;
	if (clearWordWidths) {
		wordWidthCache.clear();
	}
}

/**
 * Gets the cached width of a word at a given text size.
 */
export function getWordWidth(sk: p5, word: string, textSize: number): number {
	if (!wordWidthCache.has(word)) {
		sk.textSize(REFERENCE_TEXT_SIZE);
		wordWidthCache.set(word, sk.textWidth(word) / REFERENCE_TEXT_SIZE);
	}
	return wordWidthCache.get(word)! * textSize;
}

/**
 * Calculates optimal scaling to fit words within bounds.
 * Results are cached based on bounds, word count, and config.
 * When fullTranscriptMaxCount is provided and scaleToVisibleData is false,
 * uses that as the max count for consistent scaling across selections.
 */
export function calculateScaling(sk: p5, words: DataPoint[], bounds: Bounds, config: ConfigStoreType, fullTranscriptMaxCount?: number): Scaling {
	if (words.length === 0) return { ...BASE_SCALING };

	// Determine max word count for scaling
	let maxCount = 2;
	if (!config.scaleToVisibleData && fullTranscriptMaxCount) {
		maxCount = Math.max(maxCount, fullTranscriptMaxCount);
	} else {
		for (const w of words) {
			if (w.count > maxCount) maxCount = w.count;
		}
	}

	const cacheKey = getCacheKey(bounds, words.length, maxCount, config);
	if (scalingCache.key === cacheKey && scalingCache.scaling) {
		return scalingCache.scaling;
	}

	const availableWidth = bounds.width;
	const availableHeight = bounds.height;

	let scaleFactor = estimateScaleFactor(words, availableWidth, availableHeight, config);
	let measuredHeight = measureHeight(sk, words, scaleFactor, availableWidth, maxCount, config);

	// Shrink if needed
	while (scaleFactor > MIN_SCALE && measuredHeight > availableHeight) {
		scaleFactor *= 0.9;
		measuredHeight = measureHeight(sk, words, scaleFactor, availableWidth, maxCount, config);
	}

	// Try to grow if there's room
	for (let i = 0; i < 5 && scaleFactor < 1.0; i++) {
		const larger = Math.min(scaleFactor * 1.1, 1.0);
		if (measureHeight(sk, words, larger, availableWidth, maxCount, config) <= availableHeight) {
			scaleFactor = larger;
		} else {
			break;
		}
	}

	const scaling: Scaling = {
		minTextSize: BASE_SCALING.minTextSize * scaleFactor,
		maxTextSize: BASE_SCALING.maxTextSize * scaleFactor,
		lineHeight: BASE_SCALING.lineHeight * scaleFactor,
		newSpeakerGap: BASE_SCALING.newSpeakerGap * scaleFactor,
		maxCount
	};

	scalingCache.key = cacheKey;
	scalingCache.scaling = scaling;
	return scaling;
}

/**
 * Estimates initial scale factor based on character count and available space.
 */
function estimateScaleFactor(words: DataPoint[], availableWidth: number, availableHeight: number, config: ConfigStoreType): number {
	let totalChars = 0;
	let speakerChanges = 0;
	let prevSpeaker: string | null = null;

	for (const word of words) {
		totalChars += stripPunctuation(word.word).length + 1;
		if (config.separateToggle && prevSpeaker !== null && word.speaker !== prevSpeaker) {
			speakerChanges++;
		}
		prevSpeaker = word.speaker;
	}

	const charsPerLine = availableWidth / (BASE_SCALING.maxTextSize / CHARS_PER_EM);
	const totalLines = Math.ceil(totalChars / charsPerLine) + speakerChanges;
	const estimatedHeight = totalLines * BASE_SCALING.lineHeight + speakerChanges * (BASE_SCALING.newSpeakerGap - BASE_SCALING.lineHeight);

	if (estimatedHeight <= availableHeight) return 1.0;
	return Math.max(MIN_SCALE, Math.sqrt(availableHeight / estimatedHeight));
}

/**
 * Measures actual height needed for words at a given scale factor.
 */
function measureHeight(sk: p5, words: DataPoint[], scaleFactor: number, availableWidth: number, maxCount: number, config: ConfigStoreType): number {
	const lineHeight = BASE_SCALING.lineHeight * scaleFactor;
	const newSpeakerGap = BASE_SCALING.newSpeakerGap * scaleFactor;
	const minSize = BASE_SCALING.minTextSize * scaleFactor;
	const maxSize = BASE_SCALING.maxTextSize * scaleFactor;

	let x = 0;
	let height = lineHeight;
	let prevSpeaker: string | null = null;

	for (const word of words) {
		const t = Math.log(word.count) / Math.log(maxCount);
		const textSize = minSize + t * (maxSize - minSize);
		const stripped = stripPunctuation(word.word);
		const wordWidth = getWordWidth(sk, stripped, textSize);

		if (config.separateToggle && prevSpeaker !== null && word.speaker !== prevSpeaker) {
			x = 0;
			height += newSpeakerGap;
		} else if (x + wordWidth > availableWidth) {
			x = 0;
			height += lineHeight;
		}

		x += getWordWidth(sk, stripped + ' ', textSize);
		prevSpeaker = word.speaker;
	}

	return height;
}
