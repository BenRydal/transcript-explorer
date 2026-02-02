/**
 * Transcript Factory - Pure functions for creating transcript data structures.
 * Store updates should be done by the caller.
 */

import { DataPoint } from '../../models/dataPoint';
import { Transcript, type TimingMode } from '../../models/transcript';
import type { TranscriptionSegment } from './transcription-service';
import type { ParseResult } from './text-parser';
import { USER_COLORS } from '../constants/ui';
import { calculateTranscriptStats } from './transcript-stats';
import { splitIntoWordTokens } from './string-utils';

export interface User {
	name: string;
	color: string;
	enabled: boolean;
}

export interface TranscriptCreationResult {
	transcript: Transcript;
	users: User[];
}

export function createEmptyTranscript(defaultColor: string): TranscriptCreationResult {
	const defaultSpeaker = 'SPEAKER 1';
	const initialDataPoint = new DataPoint(defaultSpeaker, 0, '[new]', 0, 1);

	const transcript = new Transcript();
	transcript.wordArray = [initialDataPoint];
	transcript.totalNumOfWords = 1;
	transcript.totalConversationTurns = 1;
	transcript.totalTimeInSeconds = 1;
	transcript.largestTurnLength = 1;
	transcript.largestNumOfWordsByASpeaker = 1;
	transcript.largestNumOfTurnsByASpeaker = 1;
	transcript.maxCountOfMostRepeatedWord = 1;
	transcript.mostFrequentWord = '[new]';
	transcript.timingMode = 'untimed';

	return { transcript, users: [{ name: defaultSpeaker, color: defaultColor, enabled: true }] };
}

interface TimedSegment {
	text: string;
	start: number;
	end: number;
}

/**
 * Creates a transcript from timed segments (used by Whisper and subtitle parsers).
 * Words are distributed evenly within each segment's time span.
 */
function createTranscriptFromTimedSegments(
	segments: TimedSegment[],
	defaultSpeaker: string,
	defaultColor: string,
	overrideDuration?: number
): TranscriptCreationResult {
	const wordArray: DataPoint[] = [];

	let turnIndex = 0;
	for (const segment of segments) {
		const tokens = splitIntoWordTokens(segment.text);
		if (tokens.length === 0) continue;

		const wordDuration = (segment.end - segment.start) / tokens.length;

		tokens.forEach((token, wordIndex) => {
			const wordStart = segment.start + wordIndex * wordDuration;
			const wordEnd = segment.start + (wordIndex + 1) * wordDuration;
			wordArray.push(new DataPoint(defaultSpeaker, turnIndex, token.word, wordStart, wordEnd, token.displayWord));
		});
		turnIndex++;
	}

	const maxTime = wordArray.length > 0 ? wordArray[wordArray.length - 1].endTime : 0;
	const stats = calculateTranscriptStats(wordArray);

	const transcript = new Transcript();
	transcript.wordArray = wordArray;
	transcript.timingMode = 'startEnd';
	transcript.totalNumOfWords = wordArray.length;
	transcript.totalConversationTurns = turnIndex;
	transcript.totalTimeInSeconds = overrideDuration ?? maxTime;
	Object.assign(transcript, stats);

	return { transcript, users: [{ name: defaultSpeaker, color: defaultColor, enabled: true }] };
}

export function createTranscriptFromWhisper(
	segments: TranscriptionSegment[],
	videoDuration: number,
	defaultColor: string
): TranscriptCreationResult {
	return createTranscriptFromTimedSegments(segments, 'SPEAKER 1', defaultColor, videoDuration || undefined);
}

/**
 * Creates a transcript from parsed text input.
 * For timed transcripts: all words in a turn share the turn's start/end times.
 * If turn has endTime, it's used; otherwise caller should use applyTimingModeToWordArray()
 * to calculate proper end times based on user settings.
 * For untimed transcripts: word positions are used as time values.
 *
 * @param parseResult - Parsed turns with optional timing
 * @param timingModeOverride - Override auto-detected timing mode (used by CSV parser)
 */
export function createTranscriptFromParsedText(
	parseResult: ParseResult,
	timingModeOverride?: TimingMode
): TranscriptCreationResult {
	const wordArray: DataPoint[] = [];
	const hasTimestamps = parseResult.hasTimestamps;

	let wordPosition = 0;
	let actualTurnIndex = 0;

	parseResult.turns.forEach((turn) => {
		const tokens = splitIntoWordTokens(turn.content);
		if (tokens.length === 0) return; // Skip empty turns

		const useTurnTime = hasTimestamps && turn.startTime !== null;

		tokens.forEach((token) => {
			const startTime = useTurnTime ? turn.startTime! : wordPosition;
			// Use turn's endTime if available (CSV with end times), otherwise use startTime as placeholder
			const endTime = useTurnTime ? (turn.endTime ?? turn.startTime!) : wordPosition + 1;
			wordArray.push(new DataPoint(turn.speaker, actualTurnIndex, token.word, startTime, endTime, token.displayWord));
			wordPosition++;
		});
		actualTurnIndex++;
	});

	// maxTime: for untimed it's wordPosition, for timed use last word's values
	const lastWord = wordArray[wordArray.length - 1];
	const maxTime = lastWord ? Math.max(lastWord.startTime, lastWord.endTime) : 0;
	const stats = calculateTranscriptStats(wordArray);

	// Determine timing mode: use override if provided, otherwise auto-detect
	let timingMode: TimingMode;
	if (timingModeOverride) {
		timingMode = timingModeOverride;
	} else {
		timingMode = hasTimestamps ? 'startOnly' : 'untimed';
	}

	const transcript = new Transcript();
	transcript.wordArray = wordArray;
	transcript.timingMode = timingMode;
	transcript.totalNumOfWords = wordArray.length;
	transcript.totalConversationTurns = actualTurnIndex;
	transcript.totalTimeInSeconds = maxTime;
	Object.assign(transcript, stats);

	const users: User[] = parseResult.speakers.map((speaker, index) => ({
		name: speaker,
		color: USER_COLORS[index % USER_COLORS.length],
		enabled: true
	}));

	return { transcript, users };
}

/**
 * Creates a transcript from parsed subtitle (SRT/VTT) input.
 */
export function createTranscriptFromSubtitle(parseResult: ParseResult, defaultColor: string): TranscriptCreationResult {
	const segments: TimedSegment[] = parseResult.turns.map((turn) => ({
		text: turn.content,
		start: turn.startTime ?? 0,
		end: turn.endTime ?? turn.startTime ?? 0
	}));
	return createTranscriptFromTimedSegments(segments, 'SPEAKER 1', defaultColor);
}
