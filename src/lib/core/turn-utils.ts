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
