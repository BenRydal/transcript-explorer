import type { DataPoint } from '../../models/dataPoint';

export interface Turn {
	turnNumber: number;
	speaker: string;
	startTime: number;
	endTime: number;
	words: string[];
	displayWords: string[];
	wordCount: number;
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
				words: [],
				displayWords: [],
				wordCount: 0
			});
		}
		const turn = turnsMap.get(dp.turnNumber)!;
		turn.words.push(dp.word);
		turn.displayWords.push(dp.displayWord);
		turn.wordCount++;
	});

	return Array.from(turnsMap.values()).sort((a, b) => a.turnNumber - b.turnNumber);
}

/**
 * Gets the content of a turn as a single string (bare words, for search/comparison).
 */
export function getTurnContent(turn: Turn): string {
	return turn.words.join(' ');
}

/**
 * Gets the display content of a turn with original punctuation preserved.
 */
export function getTurnDisplayContent(turn: Turn): string {
	return turn.displayWords.join(' ');
}
