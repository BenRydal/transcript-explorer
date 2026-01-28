/**
 * Subtitle Parser - Parses SRT and VTT subtitle files.
 *
 * SRT format:
 *   1
 *   00:00:01,000 --> 00:00:04,000
 *   Hello world
 *
 * VTT format:
 *   WEBVTT
 *
 *   00:00:01.000 --> 00:00:04.000
 *   Hello world
 */

import type { ParseResult, ParsedTurn } from './text-parser';

interface SubtitleCue {
	startTime: number;
	endTime: number;
	text: string;
}

/**
 * Parses a timestamp string to seconds.
 * Handles both SRT (00:00:01,000) and VTT (00:00:01.000) formats.
 */
function parseTimestamp(timestamp: string): number {
	// Normalize comma to period for milliseconds
	const normalized = timestamp.trim().replace(',', '.');

	// Match HH:MM:SS.mmm or MM:SS.mmm
	const match = normalized.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
	if (!match) return 0;

	const hours = match[1] ? parseInt(match[1], 10) : 0;
	const minutes = parseInt(match[2], 10);
	const seconds = parseInt(match[3], 10);
	const ms = match[4] ? parseInt(match[4].padEnd(3, '0'), 10) : 0;

	return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

/**
 * Parses a timing line (e.g., "00:00:01,000 --> 00:00:04,000").
 */
function parseTimingLine(line: string): { start: number; end: number } | null {
	const match = line.match(/^([\d:,.]+)\s*-->\s*([\d:,.]+)/);
	if (!match) return null;

	return {
		start: parseTimestamp(match[1]),
		end: parseTimestamp(match[2])
	};
}

/**
 * Parses subtitle file content (SRT or VTT) into cues.
 */
function parseCues(text: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	// Strip UTF-8 BOM if present
	const cleanText = text.replace(/^\uFEFF/, '');
	const lines = cleanText.split(/\r?\n/);

	let currentTiming: { start: number; end: number } | null = null;
	let currentText: string[] = [];

	const saveCue = () => {
		if (currentTiming && currentText.length > 0) {
			cues.push({
				startTime: currentTiming.start,
				endTime: currentTiming.end,
				text: currentText.join(' ')
			});
		}
		currentTiming = null;
		currentText = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip VTT header/metadata blocks and SRT numeric cue identifiers
		if (
			trimmed === 'WEBVTT' ||
			trimmed.startsWith('WEBVTT ') ||
			trimmed.startsWith('WEBVTT\t') ||
			trimmed.startsWith('NOTE') ||
			trimmed.startsWith('STYLE') ||
			trimmed.startsWith('REGION') ||
			/^\d+$/.test(trimmed)
		) {
			continue;
		}

		// Check for timing line
		const timing = parseTimingLine(trimmed);
		if (timing) {
			saveCue();
			currentTiming = timing;
			continue;
		}

		// Empty line ends current cue
		if (trimmed === '') {
			saveCue();
			continue;
		}

		// Accumulate text lines (strip HTML tags)
		if (currentTiming) {
			const cleanText = trimmed.replace(/<[^>]+>/g, '');
			if (cleanText) {
				currentText.push(cleanText);
			}
		}
	}

	saveCue(); // Save last cue
	return cues;
}

/**
 * Parses subtitle file content into a ParseResult compatible with text-parser.
 * All cues are assigned to "SPEAKER 1" since subtitles don't have speaker info.
 */
export function parseSubtitleText(text: string): ParseResult {
	const cues = parseCues(text);
	const defaultSpeaker = 'SPEAKER 1';

	const turns: ParsedTurn[] = cues.map((cue) => ({
		speaker: defaultSpeaker,
		content: cue.text,
		startTime: cue.startTime,
		endTime: cue.endTime
	}));

	return {
		turns,
		detectedFormat: 'timestamped',
		hasTimestamps: true,
		speakers: turns.length > 0 ? [defaultSpeaker] : [],
		continuationLineCount: 0,
		totalLineCount: cues.length
	};
}
