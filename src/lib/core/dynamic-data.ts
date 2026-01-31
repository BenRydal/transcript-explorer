import { DataPoint } from '../../models/dataPoint';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { get } from 'svelte/store';
import { clearScalingCache, clearCloudBuffer } from '../draw/contribution-cloud';
import { clearWordRainBuffer, aggregateWordsForRain } from '../draw/word-rain';
import { clearHeatmapBuffer } from '../draw/speaker-heatmap';
import { clearTurnNetworkBuffer } from '../draw/turn-network';
import { clearTurnLengthBuffer } from '../draw/turn-length-distribution';
import { binWordsByTime, type BinnedData } from './binning-utils';
import type { NetworkData } from '../draw/turn-network';

export interface TurnSummary {
	turnNumber: number;
	speaker: string;
	startTime: number;
	endTime: number;
	wordCount: number;
	firstDataPoint: DataPoint;
}

export interface TurnLengthBin {
	minLength: number;
	maxLength: number;
	speakers: Record<string, { count: number; firstDataPoint: DataPoint | null }>;
}

export interface TurnLengthData {
	bins: TurnLengthBin[];
	maxCount: number;
	speakers: string[];
}

export interface GapInfo {
	startTime: number;
	endTime: number;
	duration: number;
	speakerBefore: string;
	speakerAfter: string;
	firstDataPoint: DataPoint;
}

interface SilenceGapData {
	gaps: GapInfo[];
	maxGap: number;
}

export interface OverlapInfo {
	startTime: number;
	endTime: number;
	speakers: string[];
	firstDataPoint: DataPoint;
}

interface OverlapDetectorData {
	overlaps: OverlapInfo[];
	turns: TurnSummary[];
	speakers: string[];
}

export interface AnnotationStripData {
	overlaps: OverlapInfo[];
	gaps: GapInfo[];
}

// Module-level stop words Set (created once, shared by all instances)
const STOP_WORDS = new Set([
	// Articles
	'a', 'an', 'the',
	// Conjunctions
	'and', 'or', 'but', 'if', 'then', 'than', 'because', 'while', 'until', 'although', 'though',
	// Prepositions
	'of', 'to', 'in', 'from', 'by', 'with', 'as', 'at', 'for', 'on', 'about', 'into', 'during',
	'after', 'before', 'above', 'below', 'around', 'between', 'under', 'out', 'over', 'through', 'off',
	// Pronouns
	'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
	'my', 'your', 'his', 'its', 'our', 'their',
	'that', 'which', 'who', 'whom', 'whose', 'what', 'this', 'these', 'those',
	// Quantifiers
	'all', 'any', 'some', 'each', 'every', 'both', 'either', 'neither', 'more', 'most',
	'less', 'least', 'much', 'many', 'few', 'such', 'other', 'another', 'same',
	// Be/Have/Do verbs
	'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
	'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
	// Modal verbs
	'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should',
	// Common verbs
	'get', 'got', 'getting', 'go', 'going', 'gone', 'went', 'come', 'coming', 'came',
	'make', 'made', 'making', 'know', 'knew', 'known', 'think', 'thought',
	'say', 'said', 'see', 'saw', 'seen',
	// Adverbs
	'not', 'no', 'yes', 'here', 'there', 'when', 'where', 'how', 'why', 'up', 'down',
	'even', 'very', 'just', 'so', 'only', 'now', 'still', 'also', 'too', 'well',
	'really', 'quite', 'rather', 'always', 'never', 'often', 'sometimes', 'already', 'again', 'back', 'away',
	// Contractions
	"don't", "doesn't", "didn't", "won't", "can't", "couldn't", "wouldn't", "shouldn't",
	"isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
	"i'm", "you're", "he's", "she's", "it's", "we're", "they're",
	"i've", "you've", "we've", "they've", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
	"i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "that's", "there's", "here's", "what's", "who's", "let's",
	// Spoken fillers
	'uh', 'um', 'like', 'yeah', 'okay', 'ok', 'oh', 'ah',
	'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'basically', 'actually', 'literally', 'right', 'mean'
]);

function clearAllBuffers(): void {
	clearScalingCache();
	clearCloudBuffer();
	clearWordRainBuffer();
	clearHeatmapBuffer();
	clearTurnNetworkBuffer();
	clearTurnLengthBuffer();
}

function getEnabledSpeakers(): string[] {
	return get(UserStore).filter((u) => u.enabled).map((u) => u.name);
}

let config: ConfigStoreType;
let wordArray: DataPoint[] = [];

ConfigStore.subscribe((value) => {
	// Clear caches when count-related settings change
	if (config && (
		config.lastWordToggle !== value.lastWordToggle ||
		config.echoWordsToggle !== value.echoWordsToggle ||
		config.stopWordsToggle !== value.stopWordsToggle ||
		config.sortToggle !== value.sortToggle ||
		config.separateToggle !== value.separateToggle
	)) {
		clearAllBuffers();
	}
	config = value;
});

TranscriptStore.subscribe((value) => {
	wordArray = value.wordArray || [];
});

export class DynamicData {
	endIndex: number = 0;

	setEndIndex(index: number): void {
		this.endIndex = index;
	}

	clear(): void {
		this.endIndex = 0;
		clearAllBuffers();
	}

	isStopWord(stringWord: string): boolean {
		return STOP_WORDS.has(stringWord.toLowerCase());
	}

	isInTimeRange(startTime: number, endTime: number): boolean {
		const timeline = get(TimelineStore);
		return startTime >= timeline.leftMarker && endTime <= timeline.rightMarker;
	}

	/**
	 * Get the current slice of words based on endIndex, with counts computed.
	 * Filters stop words and applies count logic based on config toggles.
	 * Note: Counts are computed for ALL words first, then filtered by time range.
	 */
	getProcessedWords(filterByTimeRange = false): DataPoint[] {
		const slice = wordArray.slice(0, this.endIndex);
		const result: DataPoint[] = [];
		const countMap = new Map<string, DataPoint[]>();

		// First pass: compute counts for all words (stop words excluded)
		for (const word of slice) {
			if (config.stopWordsToggle && this.isStopWord(word.word)) continue;

			const copy = new DataPoint(word.speaker, word.turnNumber, word.word, word.startTime, word.endTime);
			const existing = countMap.get(word.word);

			if (existing) {
				if (config.lastWordToggle) {
					copy.count = existing[existing.length - 1].count + 1;
					if (!config.echoWordsToggle) {
						existing[existing.length - 1].count = 1;
					}
				} else {
					existing[0].count++;
				}
				existing.push(copy);
			} else {
				countMap.set(word.word, [copy]);
			}
			result.push(copy);
		}

		// Filter by time range after counts are computed
		if (filterByTimeRange) {
			return result.filter((word) => this.isInTimeRange(word.startTime, word.endTime));
		}
		return result;
	}

	getDynamicArrayForDistributionDiagram(): Record<string, DataPoint[]> {
		const categorized: Record<string, DataPoint[]> = {};
		for (const word of this.getProcessedWords(true)) {
			if (!categorized[word.speaker]) categorized[word.speaker] = [];
			categorized[word.speaker].push(word);
		}
		return categorized;
	}

	getDynamicArrayForTurnChart(): Record<number, DataPoint[]> {
		const categorized: Record<number, DataPoint[]> = {};
		for (const word of this.getProcessedWords(true)) {
			if (!categorized[word.turnNumber]) categorized[word.turnNumber] = [];
			categorized[word.turnNumber].push(word);
		}
		return categorized;
	}

	getDynamicArrayForWordRain() {
		return aggregateWordsForRain(this.getProcessedWords(true));
	}

	getDynamicArraySortedForContributionCloud(): DataPoint[] {
		const words = this.getProcessedWords(true);

		if (config.sortToggle) {
			words.sort((a, b) => b.count - a.count);
		}
		if (config.separateToggle) {
			const users = get(UserStore);
			const speakerOrder = new Map(users.map((u, i) => [u.name, i]));
			words.sort((a, b) => (speakerOrder.get(a.speaker) ?? 999) - (speakerOrder.get(b.speaker) ?? 999));
		}

		return words;
	}

	getBinnedData(numBins: number): { binnedData: BinnedData; speakers: string[] } {
		const words = this.getProcessedWords(true);
		const timeline = get(TimelineStore);
		const speakers = getEnabledSpeakers();
		const binnedData = binWordsByTime(words, numBins, timeline.leftMarker, timeline.rightMarker, speakers);
		return { binnedData, speakers };
	}

	getDynamicArrayForTurnNetwork(): NetworkData {
		const words = this.getProcessedWords(true);

		// Group words by turn number to get turn sequence
		const turnMap = new Map<number, { speaker: string; firstDataPoint: DataPoint }>();
		for (const word of words) {
			if (!turnMap.has(word.turnNumber)) {
				turnMap.set(word.turnNumber, { speaker: word.speaker, firstDataPoint: word });
			}
		}

		// Sort turns by turn number
		const turns = Array.from(turnMap.entries()).sort((a, b) => a[0] - b[0]);

		// Build adjacency matrix
		const transitions = new Map<string, Map<string, { count: number; firstDataPoint: DataPoint }>>();
		for (let i = 0; i < turns.length - 1; i++) {
			const from = turns[i][1].speaker;
			const to = turns[i + 1][1].speaker;
			const dp = turns[i][1].firstDataPoint;

			if (!transitions.has(from)) transitions.set(from, new Map());
			const targets = transitions.get(from)!;
			if (!targets.has(to)) {
				targets.set(to, { count: 0, firstDataPoint: dp });
			}
			targets.get(to)!.count++;
		}

		// Build speaker stats
		const speakerStats = new Map<string, { wordCount: number; turnCount: number; firstDataPoint: DataPoint }>();
		for (const word of words) {
			const existing = speakerStats.get(word.speaker);
			if (existing) {
				existing.wordCount++;
			} else {
				speakerStats.set(word.speaker, { wordCount: 1, turnCount: 0, firstDataPoint: word });
			}
		}
		for (const [, data] of turnMap) {
			const stats = speakerStats.get(data.speaker);
			if (stats) stats.turnCount++;
		}

		return { transitions, speakerStats };
	}

	getTurnSummaries(): TurnSummary[] {
		const words = this.getProcessedWords(true);
		const speakers = getEnabledSpeakers();
		const turnMap = new Map<number, { speaker: string; startTime: number; endTime: number; wordCount: number; firstDataPoint: DataPoint }>();

		for (const word of words) {
			const existing = turnMap.get(word.turnNumber);
			if (existing) {
				existing.startTime = Math.min(existing.startTime, word.startTime);
				existing.endTime = Math.max(existing.endTime, word.endTime);
				existing.wordCount++;
			} else {
				turnMap.set(word.turnNumber, {
					speaker: word.speaker,
					startTime: word.startTime,
					endTime: word.endTime,
					wordCount: 1,
					firstDataPoint: word
				});
			}
		}

		return Array.from(turnMap.entries())
			.filter(([, data]) => speakers.includes(data.speaker))
			.sort((a, b) => a[0] - b[0])
			.map(([turnNumber, data]) => ({
				turnNumber,
				speaker: data.speaker,
				startTime: data.startTime,
				endTime: data.endTime,
				wordCount: data.wordCount,
				firstDataPoint: data.firstDataPoint
			}));
	}

	getDynamicArrayForTurnLengthDistribution(): TurnLengthData {
		const turns = this.getTurnSummaries();
		const speakers = getEnabledSpeakers();

		if (turns.length === 0) return { bins: [], maxCount: 0, speakers };

		const lengths = turns.map((t) => t.wordCount);
		const minLen = Math.min(...lengths);
		const maxLen = Math.max(...lengths);

		const binCount = Math.min(20, Math.max(5, maxLen - minLen + 1));
		const binWidth = Math.max(1, Math.ceil((maxLen - minLen + 1) / binCount));

		const bins: TurnLengthBin[] = [];
		for (let i = 0; i < binCount; i++) {
			const binMin = minLen + i * binWidth;
			const binMax = binMin + binWidth - 1;
			const speakerCounts: Record<string, { count: number; firstDataPoint: DataPoint | null }> = {};
			for (const s of speakers) {
				speakerCounts[s] = { count: 0, firstDataPoint: null };
			}
			bins.push({ minLength: binMin, maxLength: binMax, speakers: speakerCounts });
		}

		for (const turn of turns) {
			const binIndex = Math.min(binCount - 1, Math.floor((turn.wordCount - minLen) / binWidth));
			const bin = bins[binIndex];
			if (bin.speakers[turn.speaker]) {
				bin.speakers[turn.speaker].count++;
				if (!bin.speakers[turn.speaker].firstDataPoint) {
					bin.speakers[turn.speaker].firstDataPoint = turn.firstDataPoint;
				}
			}
		}

		// Remove trailing empty bins
		while (bins.length > 1) {
			const last = bins[bins.length - 1];
			const totalCount = Object.values(last.speakers).reduce((sum, s) => sum + s.count, 0);
			if (totalCount === 0) bins.pop();
			else break;
		}

		let maxCount = 0;
		for (const bin of bins) {
			const total = Object.values(bin.speakers).reduce((sum, s) => sum + s.count, 0);
			maxCount = Math.max(maxCount, total);
		}

		return { bins, maxCount, speakers };
	}

	getDynamicArrayForSilenceGapMap(): SilenceGapData {
		const turns = this.getTurnSummaries().sort((a, b) => a.startTime - b.startTime);

		const gaps: GapInfo[] = [];
		let maxGap = 0;

		for (let i = 0; i < turns.length - 1; i++) {
			const gapDuration = turns[i + 1].startTime - turns[i].endTime;
			if (gapDuration > 0) {
				gaps.push({
					startTime: turns[i].endTime,
					endTime: turns[i + 1].startTime,
					duration: gapDuration,
					speakerBefore: turns[i].speaker,
					speakerAfter: turns[i + 1].speaker,
					firstDataPoint: turns[i].firstDataPoint
				});
				maxGap = Math.max(maxGap, gapDuration);
			}
		}

		return { gaps, maxGap };
	}

	getDynamicArrayForOverlapDetector(): OverlapDetectorData {
		const turns = this.getTurnSummaries().sort((a, b) => a.startTime - b.startTime);
		const speakers = getEnabledSpeakers();
		const overlaps: OverlapInfo[] = [];

		for (let i = 0; i < turns.length; i++) {
			for (let j = i + 1; j < turns.length; j++) {
				if (turns[j].startTime >= turns[i].endTime) break;
				if (turns[j].speaker === turns[i].speaker) continue;

				const overlapStart = Math.max(turns[i].startTime, turns[j].startTime);
				const overlapEnd = Math.min(turns[i].endTime, turns[j].endTime);
				if (overlapEnd > overlapStart) {
					overlaps.push({
						startTime: overlapStart,
						endTime: overlapEnd,
						speakers: [turns[i].speaker, turns[j].speaker],
						firstDataPoint: turns[j].firstDataPoint
					});
				}
			}
		}

		return { overlaps, turns, speakers };
	}

	getDynamicArrayForAnnotationStrip(): AnnotationStripData {
		const { overlaps } = this.getDynamicArrayForOverlapDetector();
		const { gaps } = this.getDynamicArrayForSilenceGapMap();
		return { overlaps, gaps };
	}

}
