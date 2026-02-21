/**
 * CSV/TXT Parser - Parses CSV rows and TXT lines into ParseResult format.
 * Compatible with createTranscriptFromParsedText factory.
 */

import { toSeconds } from './time-utils';
import { normalizeSpeakerName, splitIntoWords } from './string-utils';
import { hasSpeakerNameAndContent, HEADERS_TRANSCRIPT_WITH_TIME } from './core-utils';
import type { ParseResult, ParsedTurn, DetectedFormat } from './text-parser';
import type { TimingMode } from '../../models/transcript';

// ============ TXT Parser ============

/**
 * Parses TXT lines in "Speaker: content" format.
 * Always returns untimed ParseResult.
 */
export function parseTXTLines(lines: string[]): ParseResult {
	const turns: ParsedTurn[] = [];
	const speakerSet = new Set<string>();

	for (const line of lines) {
		if (typeof line !== 'string' || !line.trim()) continue;

		const trimmedLine = line.trim();
		const colonIndex = trimmedLine.indexOf(':');

		let speaker: string;
		let words: string[];
		let rawContent: string;

		if (colonIndex > 0) {
			speaker = normalizeSpeakerName(trimmedLine.slice(0, colonIndex));
			rawContent = trimmedLine.slice(colonIndex + 1).trim();
			words = splitIntoWords(rawContent);
		} else {
			// Fallback: first whitespace-separated token is speaker, rest is content
			const firstSpaceIdx = trimmedLine.search(/\s/);
			if (firstSpaceIdx < 0) continue;
			speaker = normalizeSpeakerName(trimmedLine.slice(0, firstSpaceIdx));
			rawContent = trimmedLine.slice(firstSpaceIdx).trim();
			words = splitIntoWords(rawContent);
		}

		if (!speaker || !words.length) continue;

		speakerSet.add(speaker);
		turns.push({
			speaker,
			content: rawContent,
			startTime: null,
			endTime: null
		});
	}

	return {
		turns,
		detectedFormat: 'colon' as DetectedFormat, // TXT always reports colon; fallback (first word as speaker) is a legacy edge case
		hasTimestamps: false,
		speakers: [...speakerSet],
		continuationLineCount: 0,
		totalLineCount: lines.length
	};
}

// ============ CSV Parser ============

interface CSVParseState {
	turns: ParsedTurn[];
	speakerSet: Set<string>;
	rowsWithStartTime: number;
	rowsWithEndTime: number;
	lastValidStartTime: number | null;
	lastValidEndTime: number | null;
}

/** Get start time from a row if it's valid */
function getRowStartTime(row: Record<string, unknown>): number | null {
	if (!hasSpeakerNameAndContent(row)) return null;
	return toSeconds(row[HEADERS_TRANSCRIPT_WITH_TIME[2]] as string | number | null);
}

/**
 * Parses CSV rows with speaker/content columns and optional start/end times.
 * Handles timing inference when end times are missing.
 */
export function parseCSVRows(rows: Record<string, unknown>[], speechRateWordsPerSecond: number = 3): ParseResult {
	const state: CSVParseState = {
		turns: [],
		speakerSet: new Set(),
		rowsWithStartTime: 0,
		rowsWithEndTime: 0,
		lastValidStartTime: null,
		lastValidEndTime: null
	};

	const headers = HEADERS_TRANSCRIPT_WITH_TIME;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!hasSpeakerNameAndContent(row)) continue;

		const speaker = normalizeSpeakerName(String(row[headers[0]]));
		const contentStr = String(row[headers[1]] ?? '').trim();
		const words = splitIntoWords(contentStr); // bare words for validation/counting
		if (!words.length) continue;

		state.speakerSet.add(speaker);

		const curStartTime = toSeconds(row[headers[2]] as string | number | null);
		const curEndTime = toSeconds(row[headers[3]] as string | number | null);
		const hasStartTime = curStartTime !== null;
		const hasEndTime = curEndTime !== null;

		if (hasStartTime) state.rowsWithStartTime++;
		if (hasEndTime) state.rowsWithEndTime++;

		// Determine times based on what's available
		let startTime: number | null = null;
		let endTime: number | null = null;

		// Check if this is a purely untimed transcript (no times seen yet)
		const isUntimed = !hasStartTime && !hasEndTime && state.lastValidStartTime === null && state.lastValidEndTime === null;

		if (!isUntimed) {
			// Timed transcript: use actual timestamps with inference
			startTime = curStartTime ?? state.lastValidEndTime ?? state.lastValidStartTime ?? 0;

			// Infer end time
			if (curEndTime !== null) {
				endTime = curEndTime;
			} else {
				// Try next row's start time
				const nextRowStartTime = i + 1 < rows.length ? getRowStartTime(rows[i + 1]) : null;
				if (nextRowStartTime !== null && nextRowStartTime > startTime) {
					endTime = nextRowStartTime;
				} else {
					// Estimate from word count
					const duration = Math.max(1, words.length / speechRateWordsPerSecond);
					endTime = startTime + duration;
				}
			}

			// Ensure end > start
			if (endTime <= startTime) {
				const duration = Math.max(1, words.length / speechRateWordsPerSecond);
				endTime = startTime + duration;
			}

			state.lastValidStartTime = startTime;
			state.lastValidEndTime = endTime;
		}

		state.turns.push({
			speaker,
			content: contentStr,
			startTime,
			endTime
		});
	}

	// Determine timing mode based on row counts
	const turnCount = state.turns.length;
	let detectedTimingMode: TimingMode = 'untimed';
	if (state.rowsWithEndTime >= turnCount * 0.5) {
		detectedTimingMode = 'startEnd';
	} else if (state.rowsWithStartTime > 0) {
		detectedTimingMode = 'startOnly';
	}

	const hasTimestamps = state.rowsWithStartTime > 0 || state.rowsWithEndTime > 0;

	return {
		turns: state.turns,
		detectedFormat: hasTimestamps ? 'timestamped' : ('colon' as DetectedFormat), // CSV doesn't map cleanly to DetectedFormat; required by ParseResult interface
		hasTimestamps,
		speakers: [...state.speakerSet],
		continuationLineCount: 0,
		totalLineCount: rows.length,
		detectedTimingMode
	};
}
