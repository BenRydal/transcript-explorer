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
