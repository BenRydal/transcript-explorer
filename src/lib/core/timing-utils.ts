import { get } from 'svelte/store';
import { DataPoint } from '../../models/dataPoint';
import TimelineStore from '../../stores/timelineStore';
import ConfigStore from '../../stores/configStore';
import type { TimingMode } from '../../models/transcript';

/**
 * Estimate duration for a turn based on word count and speech rate.
 * Returns at least 1 second to ensure turns have visible duration.
 */
export function estimateDuration(wordCount: number, speechRate: number): number {
	const safeSpeechRate = Math.max(speechRate, 0.1); // Guard against zero/negative
	return Math.max(1, wordCount / safeSpeechRate);
}

/**
 * Recalculate word-count-based times for untimed transcripts.
 * All words in a turn get the same start/end times (matching file load behavior).
 * - startTime = cumulative word count at start of turn
 * - endTime = cumulative word count at end of turn
 */
export function recalculateWordCountTimes(wordArray: DataPoint[]): DataPoint[] {
	if (wordArray.length === 0) return wordArray;

	// First pass: calculate start and end word counts for each turn
	const turnTimes = new Map<number, { start: number; end: number }>();
	let wordCount = 0;

	wordArray.forEach((dp) => {
		if (!turnTimes.has(dp.turnNumber)) {
			turnTimes.set(dp.turnNumber, { start: wordCount, end: wordCount });
		}
		wordCount++;
		turnTimes.get(dp.turnNumber)!.end = wordCount;
	});

	// Second pass: apply calculated times to all words
	return wordArray.map((dp) => {
		const times = turnTimes.get(dp.turnNumber)!;
		return new DataPoint(dp.speaker, dp.turnNumber, dp.word, times.start, times.end);
	});
}

/**
 * Recalculate end times for startOnly mode.
 * Behavior depends on ConfigStore.preserveGapsBetweenTurns:
 * - If false (default): endTime = next turn's startTime (fills gaps)
 * - If true: endTime = startTime + (wordCount / speechRate) (preserves gaps)
 * Last turn always uses speech rate estimation.
 */
export function recalculateEndTimesFromStarts(wordArray: DataPoint[]): DataPoint[] {
	if (wordArray.length === 0) return wordArray;

	const config = get(ConfigStore);
	const preserveGaps = config.preserveGapsBetweenTurns;
	const speechRate = config.speechRateWordsPerSecond;

	// Group words by turn and get each turn's start time and word count
	const turnStartTimes = new Map<number, number>();
	const turnWordCounts = new Map<number, number>();
	wordArray.forEach((dp) => {
		if (!turnStartTimes.has(dp.turnNumber)) {
			turnStartTimes.set(dp.turnNumber, dp.startTime);
			turnWordCounts.set(dp.turnNumber, 0);
		}
		turnWordCounts.set(dp.turnNumber, turnWordCounts.get(dp.turnNumber)! + 1);
	});

	// Get sorted turn numbers
	const sortedTurnNumbers = Array.from(turnStartTimes.keys()).sort((a, b) => a - b);

	// Build map of turnNumber -> endTime
	const turnEndTimes = new Map<number, number>();
	sortedTurnNumbers.forEach((turnNum, index) => {
		const wordCount = turnWordCounts.get(turnNum) || 1;
		const duration = estimateDuration(wordCount, speechRate);
		const isLastTurn = index === sortedTurnNumbers.length - 1;

		if (isLastTurn || preserveGaps) {
			// Use speech rate estimation
			turnEndTimes.set(turnNum, turnStartTimes.get(turnNum)! + duration);
		} else {
			// Fill to next turn's start time
			const nextTurnNum = sortedTurnNumbers[index + 1];
			turnEndTimes.set(turnNum, turnStartTimes.get(nextTurnNum)!);
		}
	});

	// Update all words with calculated end times
	return wordArray.map((dp) => {
		const newEndTime = turnEndTimes.get(dp.turnNumber) ?? dp.endTime;
		return new DataPoint(dp.speaker, dp.turnNumber, dp.word, dp.startTime, newEndTime);
	});
}

/**
 * Get max time from word array (considers both startTime and endTime).
 */
export function getMaxTime(wordArray: DataPoint[]): number {
	if (wordArray.length === 0) return 1;
	return wordArray.reduce((max, dp) => Math.max(max, dp.startTime, dp.endTime), 1);
}

/**
 * Update timeline to match data range.
 * @param wordArray - The word array to derive time range from
 * @param expandOnly - If true, only expand timeline (never shrink). Default: true.
 */
export function updateTimelineFromData(wordArray: DataPoint[], expandOnly = true): void {
	const maxTime = getMaxTime(wordArray);
	TimelineStore.update((timeline) => {
		if (!expandOnly || maxTime > timeline.rightMarker) {
			timeline.endTime = maxTime;
			timeline.rightMarker = maxTime;
		}
		return timeline;
	});
}

/**
 * Apply timing mode recalculations to word array.
 * Call this after any edit operation to ensure times are correct for the current mode.
 */
export function applyTimingModeToWordArray(
	wordArray: DataPoint[],
	timingMode: TimingMode
): DataPoint[] {
	if (timingMode === 'untimed') {
		return recalculateWordCountTimes(wordArray);
	}
	if (timingMode === 'startOnly') {
		return recalculateEndTimesFromStarts(wordArray);
	}
	// startEnd mode: no recalculation needed
	return wordArray;
}
