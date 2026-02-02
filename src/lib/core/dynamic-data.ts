import { DataPoint } from '../../models/dataPoint';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { get } from 'svelte/store';
import { clearScalingCache, clearCloudBuffer } from '../draw/contribution-cloud';
import type { NetworkData } from '../draw/turn-network';

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
		clearScalingCache();
		clearCloudBuffer();
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
		clearScalingCache();
		clearCloudBuffer();
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
			const countKey = `${word.speaker}\0${word.word.toLowerCase()}`;
			const existing = countMap.get(countKey);

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
				countMap.set(countKey, [copy]);
			}
			result.push(copy);
		}

		// Filter by time range after counts are computed
		if (filterByTimeRange) {
			return result.filter((word) => this.isInTimeRange(word.startTime, word.endTime));
		}
		return result;
	}

	getDynamicArrayForSpeakerGarden(): Record<string, DataPoint[]> {
		const categorized: Record<string, DataPoint[]> = {};
		for (const word of this.getProcessedWords(true)) {
			if (!categorized[word.speaker]) categorized[word.speaker] = [];
			categorized[word.speaker].push(word);
		}

		const sortOrder = config.gardenSortOrder;
		if (sortOrder === 'default') return categorized;

		const entries = Object.entries(categorized);
		switch (sortOrder) {
			case 'words':
				entries.sort((a, b) => b[1].length - a[1].length);
				break;
			case 'turns':
				entries.sort((a, b) => {
					const turnsA = new Set(a[1].map((w) => w.turnNumber)).size;
					const turnsB = new Set(b[1].map((w) => w.turnNumber)).size;
					return turnsB - turnsA;
				});
				break;
			case 'alpha':
				entries.sort((a, b) => a[0].localeCompare(b[0]));
				break;
		}

		const sorted: Record<string, DataPoint[]> = {};
		for (const [key, value] of entries) {
			sorted[key] = value;
		}
		return sorted;
	}

	getDynamicArrayForTurnChart(): Record<number, DataPoint[]> {
		const categorized: Record<number, DataPoint[]> = {};
		for (const word of this.getProcessedWords(true)) {
			if (!categorized[word.turnNumber]) categorized[word.turnNumber] = [];
			categorized[word.turnNumber].push(word);
		}
		return categorized;
	}

	getDynamicArraySortedForContributionCloud(): DataPoint[] {
		const words = this.getProcessedWords(true);

		const needsSeparate = config.separateToggle;
		const needsSort = config.sortToggle;

		if (needsSeparate || needsSort) {
			const speakerOrder = needsSeparate
				? new Map(get(UserStore).map((u, i) => [u.name, i]))
				: null;

			words.sort((a, b) => {
				if (speakerOrder) {
					const speakerDiff = (speakerOrder.get(a.speaker) ?? 999) - (speakerOrder.get(b.speaker) ?? 999);
					if (speakerDiff !== 0) return speakerDiff;
				}
				if (needsSort) return b.count - a.count;
				return 0;
			});
		}

		return words;
	}

	getTurnSummaries(): { speaker: string; wordCount: number; firstDataPoint: DataPoint; content: string }[] {
		const words = this.getProcessedWords(true);
		const turnMap = new Map<number, { speaker: string; wordCount: number; firstDataPoint: DataPoint; content: string }>();

		for (const word of words) {
			const existing = turnMap.get(word.turnNumber);
			if (existing) {
				existing.wordCount++;
				existing.content += ' ' + word.word;
			} else {
				turnMap.set(word.turnNumber, { speaker: word.speaker, wordCount: 1, firstDataPoint: word, content: word.word });
			}
		}

		return Array.from(turnMap.values());
	}

	getDynamicArrayForTurnNetwork(): NetworkData {
		const words = this.getProcessedWords(true);
		const transitions = new Map<string, Map<string, { count: number; turnStartPoints: DataPoint[] }>>();
		const speakerStats = new Map<string, { wordCount: number; turnCount: number; turnStartPoints: DataPoint[] }>();
		let prevSpeaker: string | null = null;
		let prevTurn = -1;

		for (const word of words) {
			let stats = speakerStats.get(word.speaker);
			if (!stats) {
				stats = { wordCount: 0, turnCount: 0, turnStartPoints: [] };
				speakerStats.set(word.speaker, stats);
			}
			stats.wordCount++;

			if (word.turnNumber !== prevTurn) {
				stats.turnCount++;
				stats.turnStartPoints.push(word);

				if (prevSpeaker !== null) {
					if (!transitions.has(prevSpeaker)) transitions.set(prevSpeaker, new Map());
					const targets = transitions.get(prevSpeaker)!;
					const transition = targets.get(word.speaker);
					if (transition) {
						transition.count++;
						transition.turnStartPoints.push(word);
					} else {
						targets.set(word.speaker, { count: 1, turnStartPoints: [word] });
					}
				}

				prevSpeaker = word.speaker;
				prevTurn = word.turnNumber;
			}
		}

		return { transitions, speakerStats };
	}
}
