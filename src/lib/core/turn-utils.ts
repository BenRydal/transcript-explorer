import type { DataPoint } from '../../models/dataPoint';
import { TimeUtils } from './time-utils';

export interface Turn {
	turnNumber: number;
	speaker: string;
	startTime: number;
	endTime: number;
	order: number;
	words: string[];
	wordCount: number;
	useWordCountsAsFallback: boolean;
}

/**
 * Aggregates a flat wordArray into an array of Turn objects.
 * Each turn contains all words spoken in that turn by a speaker.
 */
export function getTurnsFromWordArray(wordArray: DataPoint[]): Turn[] {
	const turnsMap = new Map<number, Turn>();

	wordArray.forEach((dp) => {
		if (!turnsMap.has(dp.turnNumber)) {
			turnsMap.set(dp.turnNumber, {
				turnNumber: dp.turnNumber,
				speaker: dp.speaker,
				startTime: dp.startTime,
				endTime: dp.endTime,
				order: dp.order,
				words: [],
				wordCount: 0,
				useWordCountsAsFallback: dp.useWordCountsAsFallback
			});
		}
		const turn = turnsMap.get(dp.turnNumber)!;
		turn.words.push(dp.word);
		turn.wordCount++;
	});

	return Array.from(turnsMap.values()).sort((a, b) => a.turnNumber - b.turnNumber);
}

/**
 * Formats a turn's timecode for display.
 * Shows [HH:MM:SS] or [word count] depending on data type.
 */
export function formatTurnTimecode(turn: Turn): string {
	if (turn.useWordCountsAsFallback) {
		return `[${turn.startTime}]`;
	}
	return `[${TimeUtils.formatTimeAuto(turn.startTime)}]`;
}

/**
 * Formats a turn's time range for display.
 * Shows [start - end] format.
 */
export function formatTurnTimeRange(turn: Turn): string {
	if (turn.useWordCountsAsFallback) {
		return `[${turn.startTime} - ${turn.endTime}]`;
	}
	return `[${TimeUtils.formatTimeAuto(turn.startTime)} - ${TimeUtils.formatTimeAuto(turn.endTime)}]`;
}

/**
 * Gets the content of a turn as a single string.
 */
export function getTurnContent(turn: Turn): string {
	return turn.words.join(' ');
}

/**
 * Finds the turn that contains a specific word index in the flat wordArray.
 */
export function findTurnByWordIndex(wordArray: DataPoint[], wordIndex: number): Turn | null {
	if (wordIndex < 0 || wordIndex >= wordArray.length) {
		return null;
	}
	const dp = wordArray[wordIndex];
	const turns = getTurnsFromWordArray(wordArray);
	return turns.find((t) => t.turnNumber === dp.turnNumber) || null;
}

/**
 * Gets the index of a word within its turn.
 */
export function getWordIndexInTurn(wordArray: DataPoint[], globalWordIndex: number): number {
	if (globalWordIndex < 0 || globalWordIndex >= wordArray.length) {
		return -1;
	}
	const targetTurnNumber = wordArray[globalWordIndex].turnNumber;
	let indexInTurn = 0;

	for (let i = 0; i < globalWordIndex; i++) {
		if (wordArray[i].turnNumber === targetTurnNumber) {
			indexInTurn++;
		}
	}

	return indexInTurn;
}

/**
 * Gets the global word index from a turn number and word index within that turn.
 */
export function getGlobalWordIndex(wordArray: DataPoint[], turnNumber: number, wordIndexInTurn: number): number {
	let currentTurnWordIndex = 0;

	for (let i = 0; i < wordArray.length; i++) {
		if (wordArray[i].turnNumber === turnNumber) {
			if (currentTurnWordIndex === wordIndexInTurn) {
				return i;
			}
			currentTurnWordIndex++;
		}
	}

	return -1;
}
