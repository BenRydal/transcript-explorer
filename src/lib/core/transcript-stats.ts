/**
 * Transcript Statistics - Calculates aggregate statistics from a word array.
 * Used by both core.ts (CSV/TXT) and transcript-factory.ts (paste/subtitle/whisper).
 */

import type { DataPoint } from '../../models/dataPoint';
import { normalizeWord } from './string-utils';

export interface TranscriptStats {
	largestTurnLength: number;
	largestNumOfWordsByASpeaker: number;
	largestNumOfTurnsByASpeaker: number;
	maxCountOfMostRepeatedWord: number;
	mostFrequentWord: string;
}

/**
 * Calculates transcript statistics from a word array.
 * All calculations are derived from the DataPoint array.
 */
export function calculateTranscriptStats(wordArray: DataPoint[]): TranscriptStats {
	if (wordArray.length === 0) {
		return {
			largestTurnLength: 0,
			largestNumOfWordsByASpeaker: 0,
			largestNumOfTurnsByASpeaker: 0,
			maxCountOfMostRepeatedWord: 0,
			mostFrequentWord: ''
		};
	}

	const speakerWordCounts = new Map<string, number>();
	const speakerTurns = new Map<string, Set<number>>();
	const turnWordCounts = new Map<number, number>();
	const wordFrequency = new Map<string, number>();

	for (const dataPoint of wordArray) {
		const { speaker, turnNumber, word } = dataPoint;

		// Count words per speaker
		speakerWordCounts.set(speaker, (speakerWordCounts.get(speaker) || 0) + 1);

		// Track unique turns per speaker
		if (!speakerTurns.has(speaker)) {
			speakerTurns.set(speaker, new Set());
		}
		speakerTurns.get(speaker)!.add(turnNumber);

		// Count words per turn
		turnWordCounts.set(turnNumber, (turnWordCounts.get(turnNumber) || 0) + 1);

		// Track word frequency (case-insensitive)
		if (word) {
			const normalized = normalizeWord(word);
			wordFrequency.set(normalized, (wordFrequency.get(normalized) || 0) + 1);
		}
	}

	// Find most frequent word
	let maxWordFrequency = 0;
	let mostFrequentWord = '';
	for (const [word, count] of wordFrequency) {
		if (count > maxWordFrequency) {
			maxWordFrequency = count;
			mostFrequentWord = word;
		}
	}

	return {
		largestTurnLength: Math.max(...turnWordCounts.values(), 0),
		largestNumOfWordsByASpeaker: Math.max(...speakerWordCounts.values(), 0),
		largestNumOfTurnsByASpeaker: Math.max(...[...speakerTurns.values()].map((s) => s.size), 0),
		maxCountOfMostRepeatedWord: maxWordFrequency,
		mostFrequentWord
	};
}
