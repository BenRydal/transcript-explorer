import type { DataPoint } from '../../models/dataPoint';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { get } from 'svelte/store';
import { clearScalingCache, clearCloudBuffer } from '../draw/contribution-cloud';
import { normalizeWord } from './string-utils';
import type { NetworkData } from '../draw/turn-network';

// --- Question Flow Types ---

export interface QuestionAnswerPair {
	questionTurn: number;
	questionSpeaker: string;
	questionFirstWord: DataPoint;
	questionContent: string;
	answerTurn: number | null;
	answerSpeaker: string | null;
	answerFirstWord: DataPoint | null;
	answerContent: string | null;
	startTime: number;
}

// --- Word Journey Types ---

export interface WordOccurrence {
	speaker: string;
	turnNumber: number;
	dataPoint: DataPoint;
	startTime: number;
	isFirst: boolean;
	isFirstBySpeaker: boolean;
	matchedWord: string;
	turnContent: string;
}

// --- Speaker Fingerprint Types ---

export interface SpeakerFingerprintData {
	speaker: string;
	// Raw counts
	totalWords: number;
	totalTurns: number;
	questionTurns: number;
	interruptionTurns: number;
	consecutiveTurns: number;
	// Raw rates (actual percentages for tooltip display)
	rawParticipationRate: number;
	rawConsecutiveRate: number;
	rawQuestionRate: number;
	rawInterruptionRate: number;
	// Radar chart values (0-1 scale)
	// - avgTurnLength & participationRate: max-normalized across speakers
	// - consecutiveRate, questionRate, interruptionRate: raw rates (already 0-1)
	avgTurnLength: number;
	participationRate: number;
	consecutiveRate: number;
	questionRate: number;
	interruptionRate: number;
	// First words of turns for video playback (by dimension)
	allTurnFirstWords: DataPoint[];
	questionTurnFirstWords: DataPoint[];
	interruptionTurnFirstWords: DataPoint[];
	consecutiveTurnFirstWords: DataPoint[];
}

// Safe division helper - returns 0 when denominator is 0
const ratio = (num: number, denom: number): number => (denom > 0 ? num / denom : 0);

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
	 *
	 * When scaleToVisibleData is false (default):
	 * - Raw values computed from REVEALED words (cumulative as you animate)
	 * - Max values from FULL transcript (fixed reference)
	 * - Values grow as content is revealed, reaching final shape at 100%
	 *
	 * When scaleToVisibleData is true:
	 * - Both raw and max values from currently visible words
	 * - Values normalized within the visible selection
	 */
	getSpeakerFingerprints(scaleToVisibleData = false): SpeakerFingerprintData[] {
		const visibleWords = this.getProcessedWords(true);
		if (visibleWords.length === 0) return [];

		const enabledSpeakers = new Set(get(UserStore).filter((u) => u.enabled).map((u) => u.name));
		if (enabledSpeakers.size === 0) return [];

		const timeline = get(TimelineStore);
		const hasTiming = timeline.endTime > 0 && visibleWords.some((w) => w.startTime !== w.endTime);

		// Aggregate data by speaker from visible words
		const speakerData = new Map<string, { wordCount: number; turns: Set<number>; turnContents: Map<number, string[]> }>();
		const turnInfo = new Map<number, { speaker: string; startTime: number; endTime: number }>();
		const turnFirstWords = new Map<number, DataPoint>();

		for (const word of visibleWords) {
			// Track first word of each turn for video playback
			if (!turnFirstWords.has(word.turnNumber)) {
				turnFirstWords.set(word.turnNumber, word);
			}

			// Aggregate speaker data
			let data = speakerData.get(word.speaker);
			if (!data) {
				data = { wordCount: 0, turns: new Set(), turnContents: new Map() };
				speakerData.set(word.speaker, data);
			}
			data.wordCount++;
			data.turns.add(word.turnNumber);

			// Build turn content for question detection
			let turnWords = data.turnContents.get(word.turnNumber);
			if (!turnWords) {
				turnWords = [];
				data.turnContents.set(word.turnNumber, turnWords);
			}
			turnWords.push(word.word);

			// Track turn timing for interruption detection
			const existing = turnInfo.get(word.turnNumber);
			if (!existing) {
				turnInfo.set(word.turnNumber, { speaker: word.speaker, startTime: word.startTime, endTime: word.endTime });
			} else if (word.endTime > existing.endTime) {
				existing.endTime = word.endTime;
			}
		}

		// Detect interruptions and consecutive turns
		const turnOrder = Array.from(turnInfo.entries())
			.map(([turnNumber, info]) => ({ turnNumber, ...info }))
			.sort((a, b) => a.startTime - b.startTime);

		const interruptingTurns = new Set<number>();
		const consecutiveTurns = new Set<number>();
		for (let i = 1; i < turnOrder.length; i++) {
			const prev = turnOrder[i - 1], curr = turnOrder[i];
			if (curr.speaker === prev.speaker) {
				consecutiveTurns.add(curr.turnNumber);
			} else if (hasTiming && curr.startTime < prev.endTime) {
				interruptingTurns.add(curr.turnNumber);
			}
		}

		// Compute total turns for participation rate
		let totalTurns = 0;
		for (const data of speakerData.values()) {
			totalTurns += data.turns.size;
		}

		// Get max values for normalization
		let maxValues: { avgTurnLength: number; participation: number };
		if (!scaleToVisibleData) {
			maxValues = this.computeFullTranscriptMaxValues();
		} else {
			// First pass: compute max values from visible/enabled speakers
			let maxAvg = 0, maxPart = 0;
			for (const [speaker, data] of speakerData) {
				if (!enabledSpeakers.has(speaker)) continue;
				const turnCount = data.turns.size;
				maxAvg = Math.max(maxAvg, ratio(data.wordCount, turnCount));
				maxPart = Math.max(maxPart, ratio(turnCount, totalTurns));
			}
			maxValues = { avgTurnLength: maxAvg, participation: maxPart };
		}

		// Build fingerprints for each enabled speaker
		const fingerprints: SpeakerFingerprintData[] = [];

		for (const [speaker, data] of speakerData) {
			if (!enabledSpeakers.has(speaker)) continue;

			const turnCount = data.turns.size;

			// Identify question turns
			const questionTurnNumbers = new Set<number>();
			for (const [turnNum, words] of data.turnContents) {
				const hasQuestionMark = words.some((w) => w.includes('?'));
				const startsWithQuestion = QUESTION_STARTERS.has(normalizeWord(words[0] || ''));
				if (hasQuestionMark || startsWithQuestion) {
					questionTurnNumbers.add(turnNum);
				}
			}

			// Identify interruption and consecutive turns for this speaker
			const interruptionTurnNumbers = new Set<number>();
			const consecutiveTurnNumbers = new Set<number>();
			for (const turnNum of data.turns) {
				if (interruptingTurns.has(turnNum)) interruptionTurnNumbers.add(turnNum);
				if (consecutiveTurns.has(turnNum)) consecutiveTurnNumbers.add(turnNum);
			}

			// Compute rates
			const avgTurnLength = ratio(data.wordCount, turnCount);
			const rawParticipation = ratio(turnCount, totalTurns);
			const rawConsecutive = ratio(consecutiveTurnNumbers.size, turnCount);
			const rawQuestions = ratio(questionTurnNumbers.size, turnCount);
			const rawInterruptions = hasTiming ? ratio(interruptionTurnNumbers.size, turnCount) : 0;

			// Build turn first words arrays for video playback
			const allTurnFirstWords = Array.from(data.turns)
				.sort((a, b) => a - b)
				.map((turnNum) => turnFirstWords.get(turnNum)!)
				.filter(Boolean);

			fingerprints.push({
				speaker,
				totalWords: data.wordCount,
				totalTurns: turnCount,
				questionTurns: questionTurnNumbers.size,
				interruptionTurns: interruptionTurnNumbers.size,
				consecutiveTurns: consecutiveTurnNumbers.size,
				rawParticipationRate: rawParticipation,
				rawConsecutiveRate: rawConsecutive,
				rawQuestionRate: rawQuestions,
				rawInterruptionRate: rawInterruptions,
				// Radar values: max-normalized for turn length & participation, raw for rates
				avgTurnLength: ratio(avgTurnLength, maxValues.avgTurnLength),
				participationRate: ratio(rawParticipation, maxValues.participation),
				consecutiveRate: rawConsecutive,
				questionRate: rawQuestions,
				interruptionRate: rawInterruptions,
				allTurnFirstWords,
				questionTurnFirstWords: allTurnFirstWords.filter((w) => questionTurnNumbers.has(w.turnNumber)),
				interruptionTurnFirstWords: allTurnFirstWords.filter((w) => interruptionTurnNumbers.has(w.turnNumber)),
				consecutiveTurnFirstWords: allTurnFirstWords.filter((w) => consecutiveTurnNumbers.has(w.turnNumber))
			});
		}

		return fingerprints;
	}

	/**
	 * Computes max values from the full transcript for consistent normalization.
	 * Respects stop words and enabled speakers filters for consistency with visible path.
	 * Does NOT filter by time range (that's the point - it's the full transcript).
	 */
	private computeFullTranscriptMaxValues(): { avgTurnLength: number; participation: number } {
		if (wordArray.length === 0) return { avgTurnLength: 0, participation: 0 };

		const enabledSpeakers = new Set(get(UserStore).filter((u) => u.enabled).map((u) => u.name));
		const filterStopWords = config.stopWordsToggle;

		// Aggregate from full wordArray, respecting filters
		const speakerData = new Map<string, { wordCount: number; turns: Set<number> }>();
		for (const word of wordArray) {
			// Skip disabled speakers
			if (!enabledSpeakers.has(word.speaker)) continue;
			// Skip stop words if filter is on
			if (filterStopWords && this.isStopWord(word.word)) continue;

			let data = speakerData.get(word.speaker);
			if (!data) {
				data = { wordCount: 0, turns: new Set() };
				speakerData.set(word.speaker, data);
			}
			data.wordCount++;
			data.turns.add(word.turnNumber);
		}

		let totalTurns = 0;
		for (const data of speakerData.values()) {
			totalTurns += data.turns.size;
		}

		let maxAvgTurnLength = 0, maxParticipation = 0;
		for (const data of speakerData.values()) {
			maxAvgTurnLength = Math.max(maxAvgTurnLength, ratio(data.wordCount, data.turns.size));
			maxParticipation = Math.max(maxParticipation, ratio(data.turns.size, totalTurns));
		}

		return { avgTurnLength: maxAvgTurnLength, participation: maxParticipation };
	}

	/**
	 * Identifies question turns and pairs them with the following answer turn (if any).
	 * A turn is a question if it ends with '?' or starts with an interrogative word.
	 */
	getQuestionAnswerPairs(): QuestionAnswerPair[] {
		const words = this.getProcessedWords(true);
		if (words.length === 0) return [];

		const users = get(UserStore);
		const enabledSpeakers = new Set(users.filter((u) => u.enabled).map((u) => u.name));

		// Build turn data: content, first word, speaker
		const turnData = new Map<number, { speaker: string; content: string; firstWord: DataPoint; startTime: number }>();
		for (const word of words) {
			const existing = turnData.get(word.turnNumber);
			if (existing) {
				existing.content += ' ' + word.word;
			} else {
				turnData.set(word.turnNumber, {
					speaker: word.speaker,
					content: word.word,
					firstWord: word,
					startTime: word.startTime
				});
			}
		}

		// Get sorted turn numbers
		const turnNumbers = Array.from(turnData.keys()).sort((a, b) => a - b);

		// Identify question turns
		const isQuestionTurn = (turnNum: number): boolean => {
			const data = turnData.get(turnNum);
			if (!data) return false;
			const content = data.content;
			// Has question mark
			if (content.includes('?')) return true;
			// Starts with interrogative word
			const firstWord = content.split(' ')[0];
			return QUESTION_STARTERS.has(normalizeWord(firstWord));
		};

		const pairs: QuestionAnswerPair[] = [];

		for (let i = 0; i < turnNumbers.length; i++) {
			const turnNum = turnNumbers[i];
			const data = turnData.get(turnNum)!;

			// Skip if speaker is disabled
			if (!enabledSpeakers.has(data.speaker)) continue;

			if (!isQuestionTurn(turnNum)) continue;

			// Look for next turn by a different speaker as the "answer"
			let answerTurn: number | null = null;
			let answerData: { speaker: string; content: string; firstWord: DataPoint; startTime: number } | null = null;

			for (let j = i + 1; j < turnNumbers.length; j++) {
				const nextTurnNum = turnNumbers[j];
				const nextData = turnData.get(nextTurnNum)!;
				if (nextData.speaker !== data.speaker && enabledSpeakers.has(nextData.speaker)) {
					answerTurn = nextTurnNum;
					answerData = nextData;
					break;
				}
			}

			pairs.push({
				questionTurn: turnNum,
				questionSpeaker: data.speaker,
				questionFirstWord: data.firstWord,
				questionContent: data.content,
				answerTurn,
				answerSpeaker: answerData?.speaker ?? null,
				answerFirstWord: answerData?.firstWord ?? null,
				answerContent: answerData?.content ?? null,
				startTime: data.startTime
			});
		}

		return pairs;
	}

	/**
	 * Tracks occurrences of a specific word across all speakers over time.
	 */
	getWordJourney(searchWord: string): { word: string; occurrences: WordOccurrence[] } {
		if (!searchWord) return { word: '', occurrences: [] };

		const words = this.getProcessedWords(true);
		if (words.length === 0) return { word: searchWord, occurrences: [] };

		const users = get(UserStore);
		const enabledSpeakers = new Set(users.filter((u) => u.enabled).map((u) => u.name));

		// Build turn content map
		const turnContent = new Map<number, string>();
		for (const word of words) {
			const existing = turnContent.get(word.turnNumber);
			if (existing) {
				turnContent.set(word.turnNumber, existing + ' ' + word.word);
			} else {
				turnContent.set(word.turnNumber, word.word);
			}
		}

		const normalizedSearch = normalizeWord(searchWord);
		const occurrences: WordOccurrence[] = [];
		const speakerFirstOccurrence = new Map<string, boolean>();
		let isFirstOverall = true;

		for (const word of words) {
			if (!enabledSpeakers.has(word.speaker)) continue;
			if (!normalizeWord(word.word).includes(normalizedSearch)) continue;

			const isFirstBySpeaker = !speakerFirstOccurrence.has(word.speaker);
			if (isFirstBySpeaker) {
				speakerFirstOccurrence.set(word.speaker, true);
			}

			occurrences.push({
				speaker: word.speaker,
				turnNumber: word.turnNumber,
				dataPoint: word,
				startTime: word.startTime,
				isFirst: isFirstOverall,
				isFirstBySpeaker,
				matchedWord: word.word,
				turnContent: turnContent.get(word.turnNumber) || ''
			});

			isFirstOverall = false;
		}

		// Sort by startTime
		occurrences.sort((a, b) => a.startTime - b.startTime);

		return { word: searchWord, occurrences };
	}
}
