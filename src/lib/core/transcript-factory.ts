/**
 * Transcript Factory - Pure functions for creating transcript data structures.
 * Store updates should be done by the caller.
 */

import { DataPoint } from '../../models/dataPoint';
import { Transcript } from '../../models/transcript';
import type { TranscriptionSegment } from './transcription-service';
import type { ParseResult } from './text-parser';
import { USER_COLORS } from '../constants/ui';

export interface User {
	name: string;
	color: string;
	enabled: boolean;
}

export interface TranscriptCreationResult {
	transcript: Transcript;
	users: User[];
}

function findMostFrequent(counts: Map<string, number>): { word: string; count: number } {
	let maxCount = 0;
	let mostFrequent = '';
	for (const [word, count] of counts) {
		if (count > maxCount) {
			maxCount = count;
			mostFrequent = word;
		}
	}
	return { word: mostFrequent, count: maxCount };
}

function maxMapValue(map: Map<unknown, number>): number {
	return Math.max(...map.values(), 0);
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
	const turnLengths = new Map<number, number>();
	const wordCounts = new Map<string, number>();

	let turnIndex = 0;
	for (const segment of segments) {
		const words = segment.text.split(/\s+/).filter(Boolean);
		if (words.length === 0) continue;

		const wordDuration = (segment.end - segment.start) / words.length;
		turnLengths.set(turnIndex, words.length);

		words.forEach((word, wordIndex) => {
			const wordStart = segment.start + wordIndex * wordDuration;
			const wordEnd = segment.start + (wordIndex + 1) * wordDuration;
			wordArray.push(new DataPoint(defaultSpeaker, turnIndex, word, wordStart, wordEnd));

			const lowerWord = word.toLowerCase();
			wordCounts.set(lowerWord, (wordCounts.get(lowerWord) || 0) + 1);
		});
		turnIndex++;
	}

	const { word: mostFrequentWord, count: maxWordCount } = findMostFrequent(wordCounts);
	const maxTime = wordArray.length > 0 ? wordArray[wordArray.length - 1].endTime : 0;

	const transcript = new Transcript();
	transcript.wordArray = wordArray;
	transcript.timingMode = 'startEnd';
	transcript.totalNumOfWords = wordArray.length;
	transcript.totalConversationTurns = turnIndex;
	transcript.totalTimeInSeconds = overrideDuration ?? maxTime;
	transcript.largestTurnLength = Math.max(...turnLengths.values(), 1);
	transcript.largestNumOfWordsByASpeaker = wordArray.length;
	transcript.largestNumOfTurnsByASpeaker = turnIndex;
	transcript.maxCountOfMostRepeatedWord = maxWordCount;
	transcript.mostFrequentWord = mostFrequentWord;

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
 * For timed transcripts (startOnly mode): all words in a turn share the turn's start time.
 * End times are set as placeholders - caller should use applyTimingModeToWordArray() to
 * calculate proper end times based on user settings (speech rate, gap preservation).
 * For untimed transcripts: word positions are used as time values.
 */
export function createTranscriptFromParsedText(parseResult: ParseResult): TranscriptCreationResult {
	const wordArray: DataPoint[] = [];
	const wordCounts = new Map<string, number>();
	const speakerWordCounts = new Map<string, number>();
	const speakerTurnCounts = new Map<string, number>();
	const hasTimestamps = parseResult.hasTimestamps;

	let wordPosition = 0;
	let largestTurnLength = 0;

	let actualTurnIndex = 0;
	parseResult.turns.forEach((turn) => {
		const words = turn.content.split(/\s+/).filter(Boolean);
		if (words.length === 0) return; // Skip empty turns

		if (words.length > largestTurnLength) largestTurnLength = words.length;

		speakerWordCounts.set(turn.speaker, (speakerWordCounts.get(turn.speaker) || 0) + words.length);
		speakerTurnCounts.set(turn.speaker, (speakerTurnCounts.get(turn.speaker) || 0) + 1);

		const useTurnTime = hasTimestamps && turn.startTime !== null;

		words.forEach((word) => {
			const startTime = useTurnTime ? turn.startTime! : wordPosition;
			const endTime = useTurnTime ? turn.startTime! : wordPosition + 1;
			wordArray.push(new DataPoint(turn.speaker, actualTurnIndex, word, startTime, endTime));

			const lowerWord = word.toLowerCase();
			wordCounts.set(lowerWord, (wordCounts.get(lowerWord) || 0) + 1);
			wordPosition++;
		});
		actualTurnIndex++;
	});

	const { word: mostFrequentWord, count: maxWordCount } = findMostFrequent(wordCounts);

	// maxTime: for untimed it's wordPosition, for timed use last word's values
	const lastWord = wordArray[wordArray.length - 1];
	const maxTime = lastWord ? Math.max(lastWord.startTime, lastWord.endTime) : 0;

	const transcript = new Transcript();
	transcript.wordArray = wordArray;
	transcript.timingMode = hasTimestamps ? 'startOnly' : 'untimed';
	transcript.totalNumOfWords = wordArray.length;
	transcript.totalConversationTurns = actualTurnIndex;
	transcript.totalTimeInSeconds = maxTime;
	transcript.largestTurnLength = largestTurnLength || 1;
	transcript.largestNumOfWordsByASpeaker = maxMapValue(speakerWordCounts);
	transcript.largestNumOfTurnsByASpeaker = maxMapValue(speakerTurnCounts);
	transcript.maxCountOfMostRepeatedWord = maxWordCount;
	transcript.mostFrequentWord = mostFrequentWord;

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
