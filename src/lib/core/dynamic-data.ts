import type { DataPoint } from '../../models/dataPoint';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { get } from 'svelte/store';
import { clearScalingCache, clearCloudBuffer } from '../draw/contribution-cloud';
import { normalizeWord } from './string-utils';
import type { NetworkData } from '../draw/turn-network';

// --- Speaker Fingerprint Types ---

export interface SpeakerFingerprintData {
	speaker: string;
	// Raw counts
	totalWords: number;
	totalTurns: number;
	uniqueWords: number;
	questionTurns: number;
	interruptionTurns: number;
	consecutiveTurns: number;
	// Raw rates (actual percentages for tooltip display)
	rawParticipationRate: number;
	rawConsecutiveRate: number;
	rawVocabDiversity: number;
	rawQuestionRate: number;
	rawInterruptionRate: number;
	// Normalized ratios (0-1 scale for radar chart, all normalized to max speaker)
	avgTurnLength: number;
	participationRate: number;
	consecutiveRate: number;
	vocabularyDiversity: number;
	questionRate: number;
	interruptionRate: number;
	// First words of turns for video playback (by dimension)
	allTurnFirstWords: DataPoint[];
	questionTurnFirstWords: DataPoint[];
	interruptionTurnFirstWords: DataPoint[];
	consecutiveTurnFirstWords: DataPoint[];
}

// Interrogative words for question detection
const QUESTION_STARTERS = new Set([
	'what',
	'who',
	'where',
	'when',
	'why',
	'how',
	'is',
	'are',
	'was',
	'were',
	'am',
	'do',
	'does',
	'did',
	'can',
	'could',
	'will',
	'would',
	'should',
	'shall',
	'may',
	'might',
	'have',
	'has',
	'had'
]);

// Module-level stop words Set (created once, shared by all instances)
const STOP_WORDS = new Set([
	// Articles
	'a',
	'an',
	'the',
	// Conjunctions
	'and',
	'or',
	'but',
	'if',
	'then',
	'than',
	'because',
	'while',
	'until',
	'although',
	'though',
	// Prepositions
	'of',
	'to',
	'in',
	'from',
	'by',
	'with',
	'as',
	'at',
	'for',
	'on',
	'about',
	'into',
	'during',
	'after',
	'before',
	'above',
	'below',
	'around',
	'between',
	'under',
	'out',
	'over',
	'through',
	'off',
	// Pronouns
	'i',
	'you',
	'he',
	'she',
	'it',
	'we',
	'they',
	'me',
	'him',
	'her',
	'us',
	'them',
	'my',
	'your',
	'his',
	'its',
	'our',
	'their',
	'that',
	'which',
	'who',
	'whom',
	'whose',
	'what',
	'this',
	'these',
	'those',
	// Quantifiers
	'all',
	'any',
	'some',
	'each',
	'every',
	'both',
	'either',
	'neither',
	'more',
	'most',
	'less',
	'least',
	'much',
	'many',
	'few',
	'such',
	'other',
	'another',
	'same',
	// Be/Have/Do verbs
	'is',
	'are',
	'was',
	'were',
	'am',
	'be',
	'been',
	'being',
	'have',
	'has',
	'had',
	'having',
	'do',
	'does',
	'did',
	'doing',
	// Modal verbs
	'can',
	'could',
	'will',
	'would',
	'may',
	'might',
	'must',
	'shall',
	'should',
	// Common verbs
	'get',
	'got',
	'getting',
	'go',
	'going',
	'gone',
	'went',
	'come',
	'coming',
	'came',
	'make',
	'made',
	'making',
	'know',
	'knew',
	'known',
	'think',
	'thought',
	'say',
	'said',
	'see',
	'saw',
	'seen',
	// Adverbs
	'not',
	'no',
	'yes',
	'here',
	'there',
	'when',
	'where',
	'how',
	'why',
	'up',
	'down',
	'even',
	'very',
	'just',
	'so',
	'only',
	'now',
	'still',
	'also',
	'too',
	'well',
	'really',
	'quite',
	'rather',
	'always',
	'never',
	'often',
	'sometimes',
	'already',
	'again',
	'back',
	'away',
	// Contractions
	"don't",
	"doesn't",
	"didn't",
	"won't",
	"can't",
	"couldn't",
	"wouldn't",
	"shouldn't",
	"isn't",
	"aren't",
	"wasn't",
	"weren't",
	"haven't",
	"hasn't",
	"hadn't",
	"i'm",
	"you're",
	"he's",
	"she's",
	"it's",
	"we're",
	"they're",
	"i've",
	"you've",
	"we've",
	"they've",
	"i'll",
	"you'll",
	"he'll",
	"she'll",
	"we'll",
	"they'll",
	"i'd",
	"you'd",
	"he'd",
	"she'd",
	"we'd",
	"they'd",
	"that's",
	"there's",
	"here's",
	"what's",
	"who's",
	"let's",
	// Spoken fillers
	'uh',
	'um',
	'like',
	'yeah',
	'okay',
	'ok',
	'oh',
	'ah',
	'gonna',
	'wanna',
	'gotta',
	'kinda',
	'sorta',
	'basically',
	'actually',
	'literally',
	'right',
	'mean'
]);

let config: ConfigStoreType;
let wordArray: DataPoint[] = [];

ConfigStore.subscribe((value) => {
	// Clear caches when count-related settings change
	if (
		config &&
		(config.lastWordToggle !== value.lastWordToggle ||
			config.echoWordsToggle !== value.echoWordsToggle ||
			config.stopWordsToggle !== value.stopWordsToggle ||
			config.sortToggle !== value.sortToggle ||
			config.separateToggle !== value.separateToggle)
	) {
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
		return STOP_WORDS.has(normalizeWord(stringWord));
	}

	isInTimeRange(startTime: number, endTime: number): boolean {
		const timeline = get(TimelineStore);
		return startTime >= timeline.leftMarker && endTime <= timeline.rightMarker;
	}

	/**
	 * Get the current slice of words based on endIndex, with counts computed.
	 * Filters stop words and applies count logic based on config toggles.
	 * When filterByTimeRange is true, time range filter is applied BEFORE counting
	 * so that counts reflect only the visible range.
	 */
	getProcessedWords(filterByTimeRange = false): DataPoint[] {
		let slice = wordArray.slice(0, this.endIndex);

		if (filterByTimeRange) {
			slice = slice.filter((word) => this.isInTimeRange(word.startTime, word.endTime));
		}

		const result: DataPoint[] = [];
		const countMap = new Map<string, DataPoint[]>();

		for (const word of slice) {
			if (config.stopWordsToggle && this.isStopWord(word.word)) continue;

			const copy = word.copyWith();
			const countKey = `${word.speaker}\0${normalizeWord(word.word)}`;
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
			const speakerOrder = needsSeparate ? new Map(get(UserStore).map((u, i) => [u.name, i])) : null;

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

		// Compute which turns match the search term (null if no search active)
		let searchMatchingTurns: Set<number> | null = null;
		if (config.wordToSearch) {
			const searchTerm = normalizeWord(config.wordToSearch);
			searchMatchingTurns = new Set<number>();
			for (const word of words) {
				if (!searchMatchingTurns.has(word.turnNumber) && normalizeWord(word.word).includes(searchTerm)) {
					searchMatchingTurns.add(word.turnNumber);
				}
			}
		}

		// Pre-compute per-turn word counts
		const turnWordCounts = new Map<number, number>();
		for (const word of words) {
			turnWordCounts.set(word.turnNumber, (turnWordCounts.get(word.turnNumber) ?? 0) + 1);
		}

		const transitions = new Map<string, Map<string, { count: number; wordCount: number; turnStartPoints: DataPoint[] }>>();
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
						transition.wordCount += turnWordCounts.get(word.turnNumber) ?? 0;
						transition.turnStartPoints.push(word);
					} else {
						targets.set(word.speaker, { count: 1, wordCount: turnWordCounts.get(word.turnNumber) ?? 0, turnStartPoints: [word] });
					}
				}

				prevSpeaker = word.speaker;
				prevTurn = word.turnNumber;
			}
		}

		return { transitions, speakerStats, searchMatchingTurns, turnWordCounts };
	}

	/**
	 * Computes speaker fingerprint data for radar chart visualization.
	 */
	getSpeakerFingerprints(): SpeakerFingerprintData[] {
		const words = this.getProcessedWords(true);
		if (words.length === 0) return [];

		const timeline = get(TimelineStore);
		const users = get(UserStore);
		const enabledSpeakers = new Set(users.filter((u) => u.enabled).map((u) => u.name));
		if (enabledSpeakers.size === 0) return [];

		const hasTiming = timeline.endTime > 0 && words.some((w) => w.startTime !== w.endTime);

		// Helper for safe division - returns 0 when denominator is 0 to avoid NaN
		const ratio = (num: number, denom: number) => (denom > 0 ? num / denom : 0);

		// Aggregate data by speaker and track turns for interruption detection
		const speakerData = new Map<
			string,
			{
				words: string[];
				turns: Set<number>;
				turnContents: Map<number, string[]>;
			}
		>();
		const turnInfo = new Map<number, { speaker: string; startTime: number; endTime: number }>();

		for (const word of words) {
			// Initialize speaker data if needed
			let data = speakerData.get(word.speaker);
			if (!data) {
				data = { words: [], turns: new Set(), turnContents: new Map() };
				speakerData.set(word.speaker, data);
			}

			data.words.push(normalizeWord(word.word));
			data.turns.add(word.turnNumber);

			// Build turn content for question detection
			let turnWords = data.turnContents.get(word.turnNumber);
			if (!turnWords) {
				turnWords = [];
				data.turnContents.set(word.turnNumber, turnWords);
			}
			turnWords.push(word.word);

			// Track turn timing (first word sets start, update end for each word)
			const existing = turnInfo.get(word.turnNumber);
			if (!existing) {
				turnInfo.set(word.turnNumber, { speaker: word.speaker, startTime: word.startTime, endTime: word.endTime });
			} else if (word.endTime > existing.endTime) {
				existing.endTime = word.endTime;
			}
		}

		// Build sorted turn order for interruption detection
		const turnOrder = Array.from(turnInfo.entries())
			.map(([turnNumber, info]) => ({ turnNumber, ...info }))
			.sort((a, b) => a.startTime - b.startTime);

		// Detect interruptions and consecutive turns in a single pass
		const interruptingTurns = new Set<number>();
		const consecutiveTurns = new Set<number>();
		for (let i = 1; i < turnOrder.length; i++) {
			const prev = turnOrder[i - 1],
				curr = turnOrder[i];
			if (curr.speaker === prev.speaker) {
				consecutiveTurns.add(curr.turnNumber);
			} else if (hasTiming && curr.startTime < prev.endTime) {
				interruptingTurns.add(curr.turnNumber);
			}
		}

		// Compute totals for rate calculations
		let totalWords = 0,
			totalTurns = 0;
		for (const data of speakerData.values()) {
			totalWords += data.words.length;
			totalTurns += data.turns.size;
		}

		// Build turn first words map for video playback
		const turnFirstWords = new Map<number, DataPoint>();
		for (const word of words) {
			if (!turnFirstWords.has(word.turnNumber)) {
				turnFirstWords.set(word.turnNumber, word);
			}
		}

		// Compute per-speaker stats and track max values for normalization
		const maxValues = { avgTurnLength: 0, participation: 0, consecutive: 0, vocabDiversity: 0, questions: 0, interruptions: 0 };
		const speakerStats = new Map<
			string,
			{
				wordCount: number;
				turnCount: number;
				uniqueWords: number;
				questionTurnNumbers: Set<number>;
				interruptionTurnNumbers: Set<number>;
				consecutiveTurnNumbers: Set<number>;
				rawParticipation: number;
				rawConsecutive: number;
				rawVocabDiversity: number;
				rawQuestions: number;
				rawInterruptions: number;
			}
		>();

		for (const [speaker, data] of speakerData) {
			const wordCount = data.words.length;
			const turnCount = data.turns.size;
			const uniqueWords = new Set(data.words).size;

			// Identify question turns (has '?' or starts with interrogative word)
			const questionTurnNumbers = new Set<number>();
			for (const [turnNum, turnWords] of data.turnContents) {
				if (turnWords.some((w) => w.includes('?')) || QUESTION_STARTERS.has(normalizeWord(turnWords[0] || ''))) {
					questionTurnNumbers.add(turnNum);
				}
			}

			// Identify interruption and consecutive turns
			const interruptionTurnNumbers = new Set<number>();
			const consecutiveTurnNumbers = new Set<number>();
			for (const turnNum of data.turns) {
				if (interruptingTurns.has(turnNum)) interruptionTurnNumbers.add(turnNum);
				if (consecutiveTurns.has(turnNum)) consecutiveTurnNumbers.add(turnNum);
			}

			// Compute raw rates
			const rawParticipation = ratio(turnCount, totalTurns);
			const rawConsecutive = ratio(consecutiveTurnNumbers.size, turnCount);
			const rawVocabDiversity = ratio(uniqueWords, Math.sqrt(wordCount));
			const rawQuestions = ratio(questionTurnNumbers.size, turnCount);
			const rawInterruptions = hasTiming ? ratio(interruptionTurnNumbers.size, turnCount) : 0;
			const avgTurnLength = ratio(wordCount, turnCount);

			speakerStats.set(speaker, {
				wordCount,
				turnCount,
				uniqueWords,
				questionTurnNumbers,
				interruptionTurnNumbers,
				consecutiveTurnNumbers,
				rawParticipation,
				rawConsecutive,
				rawVocabDiversity,
				rawQuestions,
				rawInterruptions
			});

			// Track max values
			maxValues.avgTurnLength = Math.max(maxValues.avgTurnLength, avgTurnLength);
			maxValues.participation = Math.max(maxValues.participation, rawParticipation);
			maxValues.consecutive = Math.max(maxValues.consecutive, rawConsecutive);
			maxValues.vocabDiversity = Math.max(maxValues.vocabDiversity, rawVocabDiversity);
			maxValues.questions = Math.max(maxValues.questions, rawQuestions);
			maxValues.interruptions = Math.max(maxValues.interruptions, rawInterruptions);
		}

		// Build fingerprints for enabled speakers only (but normalized against all speakers)
		return Array.from(speakerData.keys())
			.filter((speaker) => enabledSpeakers.has(speaker))
			.map((speaker) => {
				const data = speakerData.get(speaker)!;
				const stats = speakerStats.get(speaker)!;
				const avgTurnLength = ratio(stats.wordCount, stats.turnCount);

				// Get first words for each turn, sorted by turn number
				const allTurnFirstWords = Array.from(data.turns)
					.sort((a, b) => a - b)
					.map((turnNum) => turnFirstWords.get(turnNum)!)
					.filter(Boolean);

				return {
					speaker,
					totalWords: stats.wordCount,
					totalTurns: stats.turnCount,
					uniqueWords: stats.uniqueWords,
					questionTurns: stats.questionTurnNumbers.size,
					interruptionTurns: stats.interruptionTurnNumbers.size,
					consecutiveTurns: stats.consecutiveTurnNumbers.size,
					// Raw rates for tooltip display
					rawParticipationRate: stats.rawParticipation,
					rawConsecutiveRate: stats.rawConsecutive,
					rawVocabDiversity: stats.rawVocabDiversity,
					rawQuestionRate: stats.rawQuestions,
					rawInterruptionRate: stats.rawInterruptions,
					// Normalized values (0-1 scale, all normalized to max speaker)
					avgTurnLength: ratio(avgTurnLength, maxValues.avgTurnLength),
					participationRate: ratio(stats.rawParticipation, maxValues.participation),
					consecutiveRate: ratio(stats.rawConsecutive, maxValues.consecutive),
					vocabularyDiversity: ratio(stats.rawVocabDiversity, maxValues.vocabDiversity),
					questionRate: ratio(stats.rawQuestions, maxValues.questions),
					interruptionRate: ratio(stats.rawInterruptions, maxValues.interruptions),
					// First words of turns for video playback
					allTurnFirstWords,
					questionTurnFirstWords: allTurnFirstWords.filter((w) => stats.questionTurnNumbers.has(w.turnNumber)),
					interruptionTurnFirstWords: allTurnFirstWords.filter((w) => stats.interruptionTurnNumbers.has(w.turnNumber)),
					consecutiveTurnFirstWords: allTurnFirstWords.filter((w) => stats.consecutiveTurnNumbers.has(w.turnNumber))
				};
			});
	}
}
