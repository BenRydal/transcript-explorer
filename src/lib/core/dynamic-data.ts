import type { DataPoint } from '../../models/dataPoint';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import UserStore from '../../stores/userStore';
import VizStore, { type VizStoreType } from '../../stores/vizStore';
import FiltersStore, { type FiltersStoreType } from '../../stores/filtersStore';
import CodeStore, { type CodeEntry } from '../../stores/codeStore';
import { get } from 'svelte/store';
import { clearScalingCache, clearCloudBuffer } from '../draw/contribution-cloud';
import { registerVizCacheReset } from '../draw/viz-cache-registry';
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

/**
 * Computes adjusted residuals (z-scores) for every (from, to) cell of a
 * transition matrix built as a nested Map<from, Map<to, {count}>>. Keys are
 * "from→to". See `getDynamicArrayForTurnNetwork` for the formula citation.
 *
 * Observed counts come from `count` on each inner map entry. Row sums, column
 * sums, and grand total are computed across the union of all speakers that
 * appear as source or target so the contingency table is square-ish.
 */
function computeAdjustedResiduals(
	transitions: Map<string, Map<string, { count: number; wordCount: number; turnStartPoints: DataPoint[] }>>
): Map<string, number> {
	const result = new Map<string, number>();

	// Collect all speakers that appear on either axis.
	const speakers = new Set<string>();
	for (const [from, targets] of transitions) {
		speakers.add(from);
		for (const to of targets.keys()) speakers.add(to);
	}

	// Build observed matrix + sums.
	const rowSum = new Map<string, number>();
	const colSum = new Map<string, number>();
	let grandTotal = 0;
	for (const [from, targets] of transitions) {
		for (const [to, entry] of targets) {
			const count = entry.count;
			rowSum.set(from, (rowSum.get(from) ?? 0) + count);
			colSum.set(to, (colSum.get(to) ?? 0) + count);
			grandTotal += count;
		}
	}

	if (grandTotal === 0) return result;

	for (const from of speakers) {
		for (const to of speakers) {
			const observed = transitions.get(from)?.get(to)?.count ?? 0;
			const ri = rowSum.get(from) ?? 0;
			const cj = colSum.get(to) ?? 0;
			const expected = (ri * cj) / grandTotal;
			if (expected <= 0) {
				result.set(`${from}→${to}`, 0);
				continue;
			}
			const residual = observed - expected;
			const denom = Math.sqrt(expected * (1 - ri / grandTotal) * (1 - cj / grandTotal));
			const z = denom > 0 ? residual / denom : 0;
			result.set(`${from}→${to}`, z);
		}
	}

	return result;
}

// Interrogative words for question detection
const QUESTION_STARTERS = new Set(
	'what who where when why how is are was were am do does did can could will would should shall may might have has had'.split(' ')
);

// Default stopword list. Exported read-only so the Filters panel can show
// the baseline, and the active filter is computed as the union of this set
// with the user's custom entries (see `getActiveStopWords`).
export const DEFAULT_STOPWORDS: readonly string[] = [
	// Articles, conjunctions, prepositions
	'a an the and or but if then than because while until although though',
	'of to in from by with as at for on about into during after before',
	'above below around between under out over through off',
	// Pronouns
	'i you he she it we they me him her us them my your his its our their',
	'that which who whom whose what this these those',
	// Quantifiers
	'all any some each every both either neither more most less least',
	'much many few such other another same',
	// Be/Have/Do/Modal verbs
	'is are was were am be been being have has had having do does did doing',
	'can could will would may might must shall should',
	// Common verbs (only semantically empty ones; know/think/say/see kept visible)
	'get got getting goes go going gone went come coming came',
	'make made making',
	// Adverbs
	'not no yes here there when where how why up down even very just so',
	'only now still also too well really quite rather always never often',
	'sometimes already again back away',
	// Contractions
	"don't doesn't didn't won't can't couldn't wouldn't shouldn't",
	"isn't aren't wasn't weren't haven't hasn't hadn't",
	"i'm you're he's she's it's we're they're",
	"i've you've we've they've i'll you'll he'll she'll we'll they'll",
	"i'd you'd he'd she'd we'd they'd that's there's here's what's who's let's",
	// Spoken fillers
	'uh um like yeah okay ok oh ah gonna wanna gotta kinda sorta',
	'basically actually literally right mean'
]
	.join(' ')
	.split(' ');

const DEFAULT_STOPWORDS_SET = new Set(DEFAULT_STOPWORDS);

// Snapshot of the active stopword set  -  always includes DEFAULT_STOPWORDS
// plus any user-supplied customStopWords. Whether filtering is APPLIED is
// decided at call site (in getProcessedWords) by either the legacy
// `stopWordsToggle` or the new `stopWordsEnabled` flag; this set is what
// `isStopWord` consults when filtering runs.
let activeStopWords: Set<string> = new Set(DEFAULT_STOPWORDS_SET);

function rebuildActiveStopWords(filters: FiltersStoreType): void {
	const merged = new Set(DEFAULT_STOPWORDS_SET);
	for (const raw of filters.customStopWords) {
		const token = normalizeWord(raw);
		if (token) merged.add(token);
	}
	activeStopWords = merged;
}

// Merged snapshot of viz + filter fields used by this module's logic.
// Kept as a merged object so existing `config.X` reads continue to resolve
// regardless of which underlying store owns the field.
let config: VizStoreType & FiltersStoreType = { ...get(VizStore), ...get(FiltersStore) };
let codeEntries: CodeEntry[] = [];

// Subscriptions kept for change-detection: clear caches when relevant toggles change.
// Intentionally module-level (lives for app lifetime, no cleanup needed).
VizStore.subscribe((value) => {
	if (
		config &&
		(config.lastWordToggle !== value.lastWordToggle ||
			config.echoWordsToggle !== value.echoWordsToggle ||
			config.stopWordsToggle !== value.stopWordsToggle ||
			config.sortToggle !== value.sortToggle ||
			config.separateToggle !== value.separateToggle ||
			config.contributionCloudWeighting !== value.contributionCloudWeighting)
	) {
		clearScalingCache();
		clearCloudBuffer();
	}
	config = { ...config, ...value };
});

FiltersStore.subscribe((value) => {
	const prev = config;
	config = { ...config, ...value };
	// Stopword set only needs rebuilding when the toggles or custom list change.
	if (
		!prev ||
		prev.stopWordsEnabled !== value.stopWordsEnabled ||
		prev.customStopWords !== value.customStopWords
	) {
		rebuildActiveStopWords(value);
		clearScalingCache();
		clearCloudBuffer();
	}
});

// Initial build so the first paint uses the right list.
rebuildActiveStopWords(get(FiltersStore));

CodeStore.subscribe((value) => {
	codeEntries = value;
	clearScalingCache();
	clearCloudBuffer();
});

// Memoized full-transcript max values for the speaker-fingerprint radar.
// In overlay/small-multiples mode with `scaleToVisibleData=false`, this
// was recomputed every frame (a full wordArray scan just to derive two
// numbers). Key on (wordArray ref, filterStopWords) so toggling the
// stop-words filter still invalidates, and the transcript-lifecycle
// reset clears it outright.
let fullTranscriptFingerprintMaxCache: {
	wordArray: unknown;
	filterStopWords: boolean;
	avgTurnLength: number;
	participation: number;
} | null = null;
registerVizCacheReset(() => {
	fullTranscriptFingerprintMaxCache = null;
});

interface TurnData {
	speaker: string;
	content: string;
	firstWord: DataPoint;
	startTime: number;
	endTime: number;
	wordCount: number;
}

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
		return activeStopWords.has(normalizeWord(stringWord));
	}

	/** Builds per-turn aggregated data from a words array. */
	private buildTurnData(words: DataPoint[]): Map<number, TurnData> {
		const turnData = new Map<number, TurnData>();
		for (const word of words) {
			const existing = turnData.get(word.turnNumber);
			if (existing) {
				existing.content += ' ' + word.word;
				existing.wordCount++;
				if (word.endTime > existing.endTime) existing.endTime = word.endTime;
			} else {
				turnData.set(word.turnNumber, {
					speaker: word.speaker,
					content: word.word,
					firstWord: word,
					startTime: word.startTime,
					endTime: word.endTime,
					wordCount: 1
				});
			}
		}
		return turnData;
	}

	/** Checks if a turn's content is a question (has '?' or starts with interrogative word). */
	private isQuestionTurn(turn: TurnData): boolean {
		if (turn.content.includes('?')) return true;
		const firstWord = turn.content.split(' ')[0];
		return QUESTION_STARTERS.has(normalizeWord(firstWord));
	}

	private getEnabledSpeakers(): Set<string> {
		return new Set(
			get(UserStore)
				.filter((u) => u.enabled)
				.map((u) => u.name)
		);
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
		const wordArray = get(TranscriptStore).wordArray || [];
		let slice = wordArray.slice(0, this.endIndex);

		if (filterByTimeRange) {
			slice = slice.filter((word) => this.isInTimeRange(word.startTime, word.endTime));
		}

		// Build set of enabled code names for visibility filtering
		const enabledCodes = codeEntries.length > 0 ? new Set(codeEntries.filter((c) => c.enabled).map((c) => c.code)) : null;

		const result: DataPoint[] = [];
		const countMap = new Map<string, DataPoint[]>();

		// Stopword filtering gate: either the legacy per-viz `stopWordsToggle`
		// (Settings panel) or the Filters-panel-level `stopWordsEnabled`
		// triggers filtering. Custom stopwords augment the default list when
		// `stopWordsEnabled` is on (see `rebuildActiveStopWords`).
		const filterStopWords = config.stopWordsToggle || config.stopWordsEnabled;
		for (const word of slice) {
			if (filterStopWords && this.isStopWord(word.word)) continue;
			// Code visibility: hide words whose codes are all disabled, or uncoded words when showUncoded is off
			if (enabledCodes) {
				if (word.codes.length > 0 && !word.codes.some((c) => enabledCodes.has(c))) continue;
				if (word.codes.length === 0 && !config.showUncoded) continue;
			}

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

	private groupBy<K extends string | number>(words: DataPoint[], keyFn: (w: DataPoint) => K): Record<K, DataPoint[]> {
		const grouped = {} as Record<K, DataPoint[]>;
		for (const word of words) {
			const key = keyFn(word);
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(word);
		}
		return grouped;
	}

	/**
	 * Sorts speaker entries by the current speakerSortOrder config.
	 * Each entry is [speakerName, { wordCount, turnCount }].
	 */
	private sortSpeakerEntries<T>(entries: [string, T][], getStats: (v: T) => { wordCount: number; turnCount: number }): void {
		const sortOrder = config.speakerSortOrder;
		if (sortOrder === 'default') return;

		switch (sortOrder) {
			case 'words':
				entries.sort((a, b) => getStats(b[1]).wordCount - getStats(a[1]).wordCount);
				break;
			case 'turns':
				entries.sort((a, b) => getStats(b[1]).turnCount - getStats(a[1]).turnCount);
				break;
			case 'alpha':
				entries.sort((a, b) => a[0].localeCompare(b[0]));
				break;
		}
	}

	getDynamicArrayForSpeakerGarden(): Record<string, DataPoint[]> {
		const categorized = this.groupBy(this.getProcessedWords(true), (w) => w.speaker);

		const entries = Object.entries(categorized);
		this.sortSpeakerEntries(entries, (words) => ({
			wordCount: words.length,
			turnCount: new Set(words.map((w) => w.turnNumber)).size
		}));

		return Object.fromEntries(entries) as Record<string, DataPoint[]>;
	}

	getDynamicArrayForTurnChart(): Record<number, DataPoint[]> {
		return this.groupBy(this.getProcessedWords(true), (w) => w.turnNumber);
	}

	getDynamicArraySortedForContributionCloud(): DataPoint[] {
		const words = this.getProcessedWords(true);

		// TF-IDF weighting overwrites `count` on each word so the existing
		// size-scaling path (contribution-cloud-scaling.ts) Just Works with
		// its log(count) / log(maxCount) model. We translate a continuous
		// TF-IDF score into the same integer-count scale by multiplying by
		// a fixed factor and flooring; the max factor is chosen so the
		// highest-weighted word lands near the existing maxCount range.
		//
		// "Document" = speaker's concatenated wordstream. TF = term freq in
		// that speaker's stream; IDF = log(N / df) where df is the number of
		// speaker-docs containing the term. This is the standard TF-IDF; the
		// research memo cites Monroe/Colaresi/Quinn 2008 for the framing of
		// lexical-distinctiveness weighting in discourse research.
		if (config.contributionCloudWeighting === 'tfidf') {
			this.applyTfidfWeighting(words);
		}

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

	/**
	 * Mutates the passed words array so each DataPoint's `count` field reads
	 * as the TF-IDF weight of its (speaker, word) pair, expressed on the
	 * same integer scale that frequency mode produces (so the existing
	 * scaling pipeline remains unchanged). Words uniform across all
	 * speakers collapse to count=1 (effectively tiny).
	 */
	private applyTfidfWeighting(words: DataPoint[]): void {
		if (words.length === 0) return;

		// TF: term count per (speaker, term); also total term count per speaker.
		const tf = new Map<string, Map<string, number>>();
		const speakerTotals = new Map<string, number>();
		for (const w of words) {
			const term = normalizeWord(w.word);
			let speakerMap = tf.get(w.speaker);
			if (!speakerMap) {
				speakerMap = new Map();
				tf.set(w.speaker, speakerMap);
			}
			speakerMap.set(term, (speakerMap.get(term) ?? 0) + 1);
			speakerTotals.set(w.speaker, (speakerTotals.get(w.speaker) ?? 0) + 1);
		}

		// Document frequency: how many speakers use each term.
		const df = new Map<string, number>();
		for (const [, speakerMap] of tf) {
			for (const term of speakerMap.keys()) {
				df.set(term, (df.get(term) ?? 0) + 1);
			}
		}

		const N = tf.size;
		if (N === 0) return;

		// Precompute TF-IDF per (speaker, term). Standard formula with a
		// +1 in the IDF denominator to avoid divide-by-zero on terms that
		// somehow have df=0; log base is natural.
		const tfidf = new Map<string, Map<string, number>>();
		let maxTfidf = 0;
		for (const [speaker, speakerMap] of tf) {
			const total = speakerTotals.get(speaker) ?? 1;
			const innerMap = new Map<string, number>();
			for (const [term, count] of speakerMap) {
				const termTf = count / total;
				const termDf = df.get(term) ?? 1;
				const idf = Math.log(N / termDf);
				const score = termTf * Math.max(0, idf);
				innerMap.set(term, score);
				if (score > maxTfidf) maxTfidf = score;
			}
			tfidf.set(speaker, innerMap);
		}
		if (maxTfidf <= 0) return;

		// Map TF-IDF scores into the existing integer count scale. Target
		// range: 1..~20 so log-based size scaling behaves similarly to the
		// frequency path. 1 + round(score / maxTfidf * 19) keeps the range.
		const SCALE_TARGET = 20;
		for (const w of words) {
			const term = normalizeWord(w.word);
			const score = tfidf.get(w.speaker)?.get(term) ?? 0;
			const scaled = Math.max(1, Math.round(1 + (score / maxTfidf) * (SCALE_TARGET - 1)));
			w.count = scaled;
		}
	}

	getTurnSummaries(): { speaker: string; wordCount: number; firstDataPoint: DataPoint; content: string }[] {
		const turnData = this.buildTurnData(this.getProcessedWords(true));
		return Array.from(turnData.values()).map((t) => ({
			speaker: t.speaker,
			wordCount: t.wordCount,
			firstDataPoint: t.firstWord,
			content: t.content
		}));
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

		// Sort speakerStats map by the shared speaker sort order
		const statsEntries = Array.from(speakerStats.entries());
		this.sortSpeakerEntries(statsEntries, (s) => s);
		const sortedStats = new Map(statsEntries);

		// Lag-sequential adjusted residuals (z-scores) for each transition
		// cell. We compute over the full (pre-filter) transition matrix so
		// the statistics reflect the observed behavior, not what the user
		// has temporarily hidden.
		//
		// Standard two-dimensional contingency table formula (Bakeman &
		// Gottman 1997, ch. 7; Furtak et al. EMIP 2017):
		//
		//   expected[i][j] = rowSum[i] * colSum[j] / grandTotal
		//   residual[i][j] = observed[i][j] - expected[i][j]
		//   adjRes[i][j]   = residual / sqrt(
		//                      expected * (1 - rowSum/grandTotal)
		//                               * (1 - colSum/grandTotal))
		//
		// |adjRes| >= 1.96 is the p<0.05 two-tailed significance threshold.
		const adjustedResiduals = computeAdjustedResiduals(transitions);

		return { transitions, speakerStats: sortedStats, searchMatchingTurns, turnWordCounts, adjustedResiduals };
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

		const enabledSpeakers = this.getEnabledSpeakers();

		const hasTiming = get(TranscriptStore).timingMode !== 'untimed';

		const turnData = this.buildTurnData(visibleWords);

		// Filter turns by search term if active
		let matchingTurnNumbers: Set<number> | null = null;
		if (config.wordToSearch) {
			const searchTerm = normalizeWord(config.wordToSearch);
			matchingTurnNumbers = new Set<number>();
			for (const [turnNum, turn] of turnData) {
				if (normalizeWord(turn.content).includes(searchTerm)) {
					matchingTurnNumbers.add(turnNum);
				}
			}
		}

		// Aggregate per-speaker stats from turn data
		const speakerTurns = new Map<string, { wordCount: number; turnNumbers: Set<number> }>();
		for (const [turnNum, turn] of turnData) {
			if (matchingTurnNumbers && !matchingTurnNumbers.has(turnNum)) continue;
			let data = speakerTurns.get(turn.speaker);
			if (!data) {
				data = { wordCount: 0, turnNumbers: new Set() };
				speakerTurns.set(turn.speaker, data);
			}
			data.wordCount += turn.wordCount;
			data.turnNumbers.add(turnNum);
		}

		// Detect interruptions and consecutive turns
		const turnOrder = Array.from(turnData.entries())
			.map(([turnNumber, t]) => ({ turnNumber, speaker: t.speaker, startTime: t.startTime, endTime: t.endTime }))
			.sort((a, b) => a.startTime - b.startTime);

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

		const totalTurns = matchingTurnNumbers ? matchingTurnNumbers.size : turnData.size;

		// Get max values for normalization
		let maxValues: { avgTurnLength: number; participation: number };
		if (!scaleToVisibleData) {
			maxValues = this.computeFullTranscriptMaxValues();
		} else {
			let maxAvg = 0,
				maxPart = 0;
			for (const [, data] of speakerTurns) {
				const turnCount = data.turnNumbers.size;
				maxAvg = Math.max(maxAvg, ratio(data.wordCount, turnCount));
				maxPart = Math.max(maxPart, ratio(turnCount, totalTurns));
			}
			maxValues = { avgTurnLength: maxAvg, participation: maxPart };
		}

		// Build fingerprints for each enabled speaker
		const fingerprints: SpeakerFingerprintData[] = [];

		for (const [speaker, data] of speakerTurns) {
			if (!enabledSpeakers.has(speaker)) continue;

			const turnCount = data.turnNumbers.size;

			// Classify turns using shared turnData
			const questionTurnNumbers = new Set<number>();
			const interruptionTurnNumbers = new Set<number>();
			const consecutiveTurnNumbers = new Set<number>();
			for (const turnNum of data.turnNumbers) {
				const turn = turnData.get(turnNum);
				if (!turn) continue;
				if (this.isQuestionTurn(turn)) questionTurnNumbers.add(turnNum);
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
			const allTurnFirstWords = Array.from(data.turnNumbers)
				.sort((a, b) => a - b)
				.map((turnNum) => turnData.get(turnNum)?.firstWord)
				.filter((w): w is DataPoint => w != null);

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
	 * Includes ALL speakers so values remain stable when toggling speaker visibility.
	 * Respects stop words filter. Does NOT filter by time range or enabled speakers.
	 *
	 * Memoized module-side keyed on (wordArray ref, filterStopWords). The
	 * result is a function of the full wordArray only  -  speaker toggles and
	 * timeline markers don't affect it  -  so without memoization this scan
	 * repeats every frame while the fingerprint viz is active.
	 */
	private computeFullTranscriptMaxValues(): { avgTurnLength: number; participation: number } {
		const wordArray = get(TranscriptStore).wordArray || [];
		if (wordArray.length === 0) return { avgTurnLength: 0, participation: 0 };

		// Mirror the gating in getProcessedWords: either legacy VizStore
		// toggle or the new FiltersStore gate engages filtering.
		const filterStopWords = !!(config.stopWordsToggle || config.stopWordsEnabled);

		if (
			fullTranscriptFingerprintMaxCache &&
			fullTranscriptFingerprintMaxCache.wordArray === wordArray &&
			fullTranscriptFingerprintMaxCache.filterStopWords === filterStopWords
		) {
			return {
				avgTurnLength: fullTranscriptFingerprintMaxCache.avgTurnLength,
				participation: fullTranscriptFingerprintMaxCache.participation
			};
		}

		// Aggregate from full wordArray across all speakers for stable normalization
		const speakerData = new Map<string, { wordCount: number; turns: Set<number> }>();
		for (const word of wordArray) {
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
		for (const data of speakerData.values()) totalTurns += data.turns.size;

		let maxAvg = 0,
			maxPart = 0;
		for (const data of speakerData.values()) {
			maxAvg = Math.max(maxAvg, ratio(data.wordCount, data.turns.size));
			maxPart = Math.max(maxPart, ratio(data.turns.size, totalTurns));
		}

		fullTranscriptFingerprintMaxCache = {
			wordArray,
			filterStopWords,
			avgTurnLength: maxAvg,
			participation: maxPart
		};
		return { avgTurnLength: maxAvg, participation: maxPart };
	}

	/**
	 * Identifies question turns and pairs them with the following answer turn (if any).
	 * A turn is a question if it ends with '?' or starts with an interrogative word.
	 */
	getQuestionAnswerPairs(): QuestionAnswerPair[] {
		const words = this.getProcessedWords(true);
		if (words.length === 0) return [];

		const enabledSpeakers = this.getEnabledSpeakers();
		const turnData = this.buildTurnData(words);
		const turnNumbers = Array.from(turnData.keys()).sort((a, b) => a - b);
		const pairs: QuestionAnswerPair[] = [];

		for (let i = 0; i < turnNumbers.length; i++) {
			const turnNum = turnNumbers[i];
			const turn = turnData.get(turnNum);
			if (!turn) continue;

			if (!enabledSpeakers.has(turn.speaker)) continue;
			if (!this.isQuestionTurn(turn)) continue;

			// Look for next turn by a different speaker as the "answer"
			let answerTurn: TurnData | null = null;
			let answerTurnNum: number | null = null;

			for (let j = i + 1; j < turnNumbers.length; j++) {
				const nextTurn = turnData.get(turnNumbers[j]);
				if (!nextTurn) continue;
				if (nextTurn.speaker !== turn.speaker && enabledSpeakers.has(nextTurn.speaker)) {
					answerTurn = nextTurn;
					answerTurnNum = turnNumbers[j];
					break;
				}
			}

			pairs.push({
				questionTurn: turnNum,
				questionSpeaker: turn.speaker,
				questionFirstWord: turn.firstWord,
				questionContent: turn.content,
				answerTurn: answerTurnNum,
				answerSpeaker: answerTurn?.speaker ?? null,
				answerFirstWord: answerTurn?.firstWord ?? null,
				answerContent: answerTurn?.content ?? null,
				startTime: turn.startTime
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

		const enabledSpeakers = this.getEnabledSpeakers();
		const turnData = this.buildTurnData(words);

		const normalizedSearch = normalizeWord(searchWord);
		const occurrences: WordOccurrence[] = [];
		const speakerFirstOccurrence = new Set<string>();
		let isFirstOverall = true;

		for (const word of words) {
			if (!enabledSpeakers.has(word.speaker)) continue;
			if (!normalizeWord(word.word).includes(normalizedSearch)) continue;

			const isFirstBySpeaker = !speakerFirstOccurrence.has(word.speaker);
			if (isFirstBySpeaker) speakerFirstOccurrence.add(word.speaker);

			occurrences.push({
				speaker: word.speaker,
				turnNumber: word.turnNumber,
				dataPoint: word,
				startTime: word.startTime,
				isFirst: isFirstOverall,
				isFirstBySpeaker,
				matchedWord: word.word,
				turnContent: turnData.get(word.turnNumber)?.content || ''
			});

			isFirstOverall = false;
		}

		occurrences.sort((a, b) => a.startTime - b.startTime);

		return { word: searchWord, occurrences };
	}
}
