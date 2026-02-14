/**
 * Text Parser - Per-line pattern matching for pasted transcript text.
 *
 * Supported formats (in match priority order):
 * 1. Speaker:<TAB>HH:MM:SS<TAB>content - Research transcript format
 * 2. HH:MM:SS<TAB>Speaker<TAB>content - Zoom transcript format
 * 3. [HH:MM:SS] Speaker: content - Timestamped brackets (colon or tab after speaker)
 * 4. [HH:MM:SS] content - YouTube auto-transcript (no speaker)
 * 5. [HH:MM AM/PM] Speaker: content - Chat logs (Slack, Discord)
 * 6. Speaker: content - Simple colon format
 * 7. Speaker<TAB>content - Tab-separated
 */

import { toSeconds } from './time-utils';
import { normalizeSpeakerName } from './string-utils';

// ============ Types ============

export interface ParsedTurn {
	speaker: string;
	content: string;
	startTime: number | null;
	endTime: number | null;
}

export type DetectedFormat = 'timestamped' | 'chat-log' | 'colon' | 'tab-separated' | 'mixed' | 'plain';

export interface ParseResult {
	turns: ParsedTurn[];
	detectedFormat: DetectedFormat;
	hasTimestamps: boolean;
	speakers: string[];
	continuationLineCount: number;
	totalLineCount: number;
}

// ============ Helpers ============

/** Creates a ParsedTurn with normalized speaker name */
function createTurn(speaker: string, content: string, startTime: number | null = null): ParsedTurn {
	return {
		speaker: normalizeSpeakerName(speaker),
		content: content.trim(),
		startTime,
		endTime: null
	};
}

function isLikelySpeaker(text: string): boolean {
	const trimmed = text.trim();

	// Too long (single characters like "H" or "R" are valid speaker initials)
	if (trimmed.length === 0 || trimmed.length > 40) return false;

	// Starts with bracket (likely a malformed timestamp like "[0" from "[0:00]")
	if (trimmed.startsWith('[') || trimmed.startsWith(']')) return false;

	// Contains URL-like characters
	if (trimmed.includes('//') || trimmed.includes('@') || trimmed.includes('www.')) return false;

	// Is just a number or ratio (3:1 would have been split as "3")
	if (/^\d+$/.test(trimmed)) return false;

	// Has too many spaces (more than 4 words is probably not a name)
	if ((trimmed.match(/\s+/g) || []).length > 3) return false;

	return true;
}

function parseChatTime(timeStr: string): number | null {
	const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
	if (!match) return null;

	let hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	const seconds = match[3] ? parseInt(match[3], 10) : 0;
	const isPM = match[4].toUpperCase() === 'PM';

	// Validate ranges
	if (hours < 1 || hours > 12 || minutes >= 60 || seconds >= 60) return null;

	if (isPM && hours !== 12) hours += 12;
	if (!isPM && hours === 12) hours = 0;

	return hours * 3600 + minutes * 60 + seconds;
}

const LINE_PATTERNS: Array<{
	name: DetectedFormat;
	pattern: RegExp;
	parse: (match: RegExpMatchArray) => ParsedTurn | null;
}> = [
	{
		// Speaker:<TAB>HH:MM:SS<TAB>content (research transcripts)
		name: 'timestamped',
		pattern: /^([^:\t]+):\t(\d{1,2}:\d{2}(?::\d{2})?)\t(.+)$/,
		parse: (m) => (isLikelySpeaker(m[1]) ? createTurn(m[1], m[3], toSeconds(m[2])) : null)
	},
	{
		// HH:MM:SS<TAB>Speaker<TAB>content (Zoom format)
		name: 'timestamped',
		pattern: /^(\d{1,2}:\d{2}(?::\d{2})?)\t([^\t]+)\t(.+)$/,
		parse: (m) => (isLikelySpeaker(m[2]) ? createTurn(m[2], m[3], toSeconds(m[1])) : null)
	},
	{
		// [HH:MM:SS] Speaker: content  OR  [HH:MM:SS] Speaker<TAB>content
		name: 'timestamped',
		pattern: /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\]\s*([^:\t]+)[:\t]\s*(.+)$/,
		parse: (m) => (isLikelySpeaker(m[2]) ? createTurn(m[2], m[3], toSeconds(m[1])) : null)
	},
	{
		// [HH:MM:SS] content (YouTube auto-transcript, no speaker)
		name: 'timestamped',
		pattern: /^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\]\s*(.+)$/,
		parse: (m) => {
			// Skip if content looks like "Speaker: content" or "Speaker<TAB>content" (handled by previous pattern)
			const hasColonSpeaker = m[2].includes(':') && isLikelySpeaker(m[2].split(':')[0]);
			const hasTabSpeaker = m[2].includes('\t') && isLikelySpeaker(m[2].split('\t')[0]);
			if (hasColonSpeaker || hasTabSpeaker) return null;
			return createTurn('SPEAKER 1', m[2], toSeconds(m[1]));
		}
	},
	{
		// [HH:MM AM/PM] Speaker: content (chat logs)
		name: 'chat-log',
		pattern: /^\[(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\]\s*([^:]+):\s*(.+)$/i,
		parse: (m) => (isLikelySpeaker(m[2]) ? createTurn(m[2], m[3], parseChatTime(m[1])) : null)
	},
	{
		// Speaker: content
		name: 'colon',
		pattern: /^([^:]+):\s*(.+)$/,
		parse: (m) => (isLikelySpeaker(m[1]) ? createTurn(m[1], m[2]) : null)
	},
	{
		// Speaker<TAB>content
		name: 'tab-separated',
		pattern: /^([^\t]+)\t(.+)$/,
		parse: (m) => (isLikelySpeaker(m[1]) ? createTurn(m[1], m[2]) : null)
	}
];

/** Result from parsing a single line */
type LineParseResult = { type: 'turn'; turn: ParsedTurn; format: DetectedFormat } | { type: 'continuation'; content: string };

function parseLine(trimmedLine: string, patterns = LINE_PATTERNS): LineParseResult {
	for (const { name, pattern, parse } of patterns) {
		const match = trimmedLine.match(pattern);
		if (match) {
			const turn = parse(match);
			if (turn) return { type: 'turn', turn, format: name };
		}
	}

	return { type: 'continuation', content: trimmedLine };
}

const SECONDS_PER_DAY = 86400;

/**
 * Normalizes wall-clock timestamps (seconds-from-midnight) to relative offsets.
 * Only processes turns at the specified indices (those that came from chat-log format).
 * Handles midnight rollover: if a timestamp is earlier than the previous one,
 * assumes a new day started and adds 24 hours.
 * Subtracts the first chat-log timestamp so those turns start at 0.
 */
function normalizeWallClockTimes(turns: ParsedTurn[], chatLogIndices: Set<number>): void {
	let baseTime: number | null = null;
	let dayOffset = 0;
	let prevRawTime: number | null = null;

	for (let i = 0; i < turns.length; i++) {
		if (!chatLogIndices.has(i)) continue;

		const turn = turns[i];
		if (turn.startTime === null) continue;

		const rawTime = turn.startTime;

		if (baseTime === null) {
			baseTime = rawTime;
		} else if (prevRawTime !== null && rawTime < prevRawTime) {
			// Time went backwards - assume midnight rollover
			dayOffset += SECONDS_PER_DAY;
		}

		turn.startTime = rawTime + dayOffset - baseTime;
		prevRawTime = rawTime;
	}
}

/** State passed to helper functions during parsing */
interface ParseState {
	turns: ParsedTurn[];
	formatCounts: Map<DetectedFormat, number>;
	chatLogIndices: Set<number>;
}

function addTurn(state: ParseState, turn: ParsedTurn, format: DetectedFormat): void {
	if (format === 'chat-log') {
		state.chatLogIndices.add(state.turns.length);
	}
	state.turns.push(turn);
	state.formatCounts.set(format, (state.formatCounts.get(format) || 0) + 1);
}

function appendToLastTurn(state: ParseState, content: string): void {
	if (state.turns.length > 0) {
		state.turns[state.turns.length - 1].content += ' ' + content;
	} else {
		state.turns.push(createTurn('SPEAKER 1', content));
	}
}

export function parseTranscriptText(text: string, forceFormat?: DetectedFormat): ParseResult {
	const state: ParseState = {
		turns: [],
		formatCounts: new Map(),
		chatLogIndices: new Set()
	};
	let continuationLineCount = 0;
	let totalLineCount = 0;

	const activePatterns =
		forceFormat && forceFormat !== 'mixed' && forceFormat !== 'plain' ? LINE_PATTERNS.filter((p) => p.name === forceFormat) : LINE_PATTERNS;

	for (const line of text.split(/\r\n|\r|\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		totalLineCount++;

		if (forceFormat === 'plain') {
			addTurn(state, createTurn('SPEAKER 1', trimmed), 'plain');
		} else {
			const result = parseLine(trimmed, activePatterns);
			if (result.type === 'turn') {
				addTurn(state, result.turn, result.format);
			} else {
				appendToLastTurn(state, result.content);
				continuationLineCount++;
			}
		}
	}

	// Determine dominant format
	const dominantFormat = getDominantFormat(state.formatCounts);

	// Normalize wall-clock timestamps to relative offsets (only for chat-log turns)
	if (state.chatLogIndices.size > 0) {
		normalizeWallClockTimes(state.turns, state.chatLogIndices);
	}

	return {
		turns: state.turns,
		detectedFormat: dominantFormat,
		hasTimestamps: state.turns.some((t) => t.startTime !== null),
		speakers: [...new Set(state.turns.map((t) => t.speaker))],
		continuationLineCount,
		totalLineCount
	};
}

function getDominantFormat(formatCounts: Map<DetectedFormat, number>): DetectedFormat {
	let dominant: DetectedFormat = 'plain';
	let maxCount = 0;

	for (const [format, count] of formatCounts) {
		if (count > maxCount) {
			dominant = format;
			maxCount = count;
		}
	}

	// Multiple non-plain formats = mixed
	const nonPlainFormats = [...formatCounts.keys()].filter((f) => f !== 'plain');
	return nonPlainFormats.length > 1 ? 'mixed' : dominant;
}

const FORMAT_DESCRIPTIONS: Record<DetectedFormat, string> = {
	timestamped: '[Timestamp] Speaker: content',
	'chat-log': '[Time AM/PM] Speaker: content',
	colon: 'Speaker: content',
	'tab-separated': 'Speaker<tab>content',
	mixed: 'Mixed formats',
	plain: 'Plain text'
};

export const SELECTABLE_FORMATS: Array<{ value: DetectedFormat | 'auto'; label: string }> = [
	{ value: 'auto', label: 'Auto-detect' },
	{ value: 'timestamped', label: '[0:00] Speaker: content' },
	{ value: 'chat-log', label: '[12:00 PM] Speaker: content' },
	{ value: 'colon', label: 'Speaker: content' },
	{ value: 'tab-separated', label: 'Speaker<tab>content' },
	{ value: 'plain', label: 'Plain text (single speaker)' }
];

export function getFormatDescription(format: DetectedFormat): string {
	return FORMAT_DESCRIPTIONS[format] || 'Unknown format';
}

/**
 * Merges consecutive turns from the same speaker into a single turn.
 * Keeps the first turn's startTime; concatenates content with a space.
 */
export function mergeSameSpeakerTurns(result: ParseResult): ParseResult {
	if (result.turns.length <= 1) return result;

	const merged: ParsedTurn[] = [{ ...result.turns[0] }];

	for (let i = 1; i < result.turns.length; i++) {
		const prev = merged[merged.length - 1];
		const curr = result.turns[i];

		if (curr.speaker === prev.speaker) {
			prev.content += ' ' + curr.content;
		} else {
			merged.push({ ...curr });
		}
	}

	return { ...result, turns: merged };
}
