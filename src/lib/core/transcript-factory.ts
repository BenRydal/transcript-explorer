/**
 * Transcript Factory - Functions for creating transcript data structures
 *
 * These pure functions create DataPoint arrays and Transcript objects
 * without side effects. Store updates should be done by the caller.
 */

import { DataPoint } from '../../models/dataPoint';
import { Transcript } from '../../models/transcript';
import type { TranscriptionSegment } from './transcription-service';

export interface User {
	name: string;
	color: string;
	enabled: boolean;
}

export interface TranscriptCreationResult {
	transcript: Transcript;
	users: User[];
}

/**
 * Creates a new empty transcript with a single placeholder word.
 * Used when user clicks "Create New Transcript".
 */
export function createEmptyTranscript(defaultColor: string): TranscriptCreationResult {
	const defaultSpeaker = 'SPEAKER 1';

	const initialDataPoint = new DataPoint(
		defaultSpeaker,
		0, // turnNumber
		'[new]', // placeholder word
		0,
		1
	);

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

	const users: User[] = [{ name: defaultSpeaker, color: defaultColor, enabled: true }];

	return { transcript, users };
}

/**
 * Creates a transcript from Whisper transcription segments.
 * Converts segments with text and timestamps into word-level DataPoints.
 */
export function createTranscriptFromWhisper(segments: TranscriptionSegment[], videoDuration: number, defaultColor: string): TranscriptCreationResult {
	const defaultSpeaker = 'SPEAKER 1';

	const wordArray: DataPoint[] = [];
	const turnLengths = new Map<number, number>();
	const wordCounts = new Map<string, number>();

	segments.forEach((segment, turnIndex) => {
		const words = segment.text.split(/\s+/).filter((w) => w.trim());
		const wordDuration = words.length > 0 ? (segment.end - segment.start) / words.length : 0;
		turnLengths.set(turnIndex, words.length);

		words.forEach((word, wordIndex) => {
			const wordStart = segment.start + wordIndex * wordDuration;
			const wordEnd = segment.start + (wordIndex + 1) * wordDuration;
			wordArray.push(new DataPoint(defaultSpeaker, turnIndex, word, wordStart, wordEnd));
			const lowerWord = word.toLowerCase();
			wordCounts.set(lowerWord, (wordCounts.get(lowerWord) || 0) + 1);
		});
	});

	// Find most frequent word
	let maxWordCount = 0;
	let mostFrequentWord = '';
	wordCounts.forEach((count, word) => {
		if (count > maxWordCount) {
			maxWordCount = count;
			mostFrequentWord = word;
		}
	});

	// Create transcript
	const maxTime = wordArray.length > 0 ? wordArray[wordArray.length - 1].endTime : 0;
	const transcript = new Transcript();
	transcript.wordArray = wordArray;
	transcript.timingMode = 'startEnd';
	transcript.totalNumOfWords = wordArray.length;
	transcript.totalConversationTurns = segments.length;
	transcript.totalTimeInSeconds = videoDuration || maxTime;
	transcript.largestTurnLength = Math.max(...turnLengths.values(), 1);
	transcript.largestNumOfWordsByASpeaker = wordArray.length;
	transcript.largestNumOfTurnsByASpeaker = segments.length;
	transcript.maxCountOfMostRepeatedWord = maxWordCount;
	transcript.mostFrequentWord = mostFrequentWord;

	const users: User[] = [{ name: defaultSpeaker, color: defaultColor, enabled: true }];

	return { transcript, users };
}
