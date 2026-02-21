import type { DataPoint } from '../../models/dataPoint';
import type { CodeEntry } from '../../stores/codeStore';
import CodeStore from '../../stores/codeStore';
import { get } from 'svelte/store';
import { USER_COLORS } from '../constants/ui';
import { toSeconds } from './time-utils';

interface PapaParseResults {
	data: Record<string, unknown>[];
	meta: {
		fields?: string[];
	};
}

// ============ Code File Format Types ============

interface TurnCodeEntry {
	code: string;
	turns: number[];
}

interface TimeCodeEntry {
	code: string;
	startTime: number;
	endTime: number;
}

type ParsedCodes = { type: 'turn'; entries: TurnCodeEntry[] } | { type: 'time'; entries: TimeCodeEntry[] };

// ============ Detection ============

/**
 * Detect if a CSV is a code file rather than a transcript.
 * Code files have turn+code or start+end columns but lack speaker+content.
 * Also matches CSVs that look code-like but have incomplete columns (e.g. 'code' without 'turn').
 */
export function testCodeFile(results: PapaParseResults): boolean {
	const fields = results.meta.fields;
	if (!Array.isArray(fields) || results.data.length === 0) return false;

	const hasTranscriptColumns = fields.includes('speaker') && fields.includes('content');
	if (hasTranscriptColumns) return false;

	// Valid code formats
	if (fields.includes('turn') && fields.includes('code')) return true;
	if (fields.includes('turn_start') && fields.includes('turn_end') && fields.includes('code')) return true;
	if (fields.includes('start') && fields.includes('end')) return true;

	// Looks code-like but incomplete (has code-related columns without speaker+content)
	const codeRelatedColumns = ['code', 'turn', 'turn_start', 'turn_end'];
	if (codeRelatedColumns.some((col) => fields.includes(col))) return true;

	return false;
}

/**
 * Get the human-readable format label for a code file's columns.
 */
export function getCodeFormatLabel(fields: string[]): string {
	if (fields.includes('turn') && fields.includes('code')) return 'Turn-based';
	if (fields.includes('turn_start') && fields.includes('turn_end') && fields.includes('code')) return 'Turn range';
	if (fields.includes('start') && fields.includes('end')) return 'Time-based';
	return 'Unknown';
}

/**
 * Extract unique code names from raw CSV rows. For files without a 'code' column,
 * derives a single code name from the file name.
 */
export function extractCodeNames(rows: Record<string, unknown>[], fields: string[], fileName: string): string[] {
	if (!fields.includes('code')) {
		return [extractCodeNameFromFileName(fileName)];
	}
	const seen = new Set<string>();
	const names: string[] = [];
	for (const row of rows) {
		const name = String(row['code'] ?? '').trim();
		if (name && !seen.has(name)) {
			seen.add(name);
			names.push(name);
		}
	}
	return names;
}

// ============ Parsing ============

/**
 * Parse a code CSV into structured code entries.
 * @param fileName - Used as code name for single-code files (start+end only, no code column)
 */
export function parseCodeFile(results: PapaParseResults, fileName: string): ParsedCodes {
	const fields = results.meta.fields!;
	const rows = results.data;

	// Turn-based: turn+code
	if (fields.includes('turn') && fields.includes('code')) {
		return parseTurnCodeRows(rows);
	}

	// Turn-range-based: turn_start+turn_end+code
	if (fields.includes('turn_start') && fields.includes('turn_end') && fields.includes('code')) {
		return parseTurnRangeCodeRows(rows);
	}

	// Time-based: start+end+code or start+end (single-code)
	if (fields.includes('start') && fields.includes('end')) {
		const hasCodeColumn = fields.includes('code');
		return parseTimeCodeRows(rows, hasCodeColumn, fileName);
	}

	throw new Error('Unrecognized code file format');
}

function parseTurnCodeRows(rows: Record<string, unknown>[]): ParsedCodes {
	const codeMap = new Map<string, Set<number>>();

	for (const row of rows) {
		const code = String(row['code'] ?? '').trim();
		const turn = Number(row['turn']);
		if (!code || isNaN(turn) || turn < 1) continue;

		if (!codeMap.has(code)) codeMap.set(code, new Set());
		codeMap.get(code)!.add(turn);
	}

	const entries: TurnCodeEntry[] = [];
	for (const [code, turns] of codeMap) {
		entries.push({ code, turns: [...turns].sort((a, b) => a - b) });
	}
	return { type: 'turn', entries };
}

function parseTurnRangeCodeRows(rows: Record<string, unknown>[]): ParsedCodes {
	const codeMap = new Map<string, Set<number>>();

	for (const row of rows) {
		const code = String(row['code'] ?? '').trim();
		const startTurn = Number(row['turn_start']);
		const endTurn = Number(row['turn_end']);
		if (!code || isNaN(startTurn) || isNaN(endTurn) || startTurn < 1 || endTurn < 1) continue;
		if (endTurn < startTurn) continue;
		if (endTurn - startTurn + 1 > 10000) {
			console.warn(`Turn range too large (${endTurn - startTurn + 1} turns) for code "${code}", skipping`);
			continue;
		}

		if (!codeMap.has(code)) codeMap.set(code, new Set());
		const turns = codeMap.get(code)!;
		for (let t = startTurn; t <= endTurn; t++) {
			turns.add(t);
		}
	}

	const entries: TurnCodeEntry[] = [];
	for (const [code, turns] of codeMap) {
		entries.push({ code, turns: [...turns].sort((a, b) => a - b) });
	}
	return { type: 'turn', entries };
}

function parseTimeCodeRows(rows: Record<string, unknown>[], hasCodeColumn: boolean, fileName: string): ParsedCodes {
	const codeName = hasCodeColumn ? '' : extractCodeNameFromFileName(fileName);
	const entries: TimeCodeEntry[] = [];

	for (const row of rows) {
		const startTime = toSeconds(row['start'] as string | number | null);
		const endTime = toSeconds(row['end'] as string | number | null);
		if (startTime == null || endTime == null) continue;

		const code = hasCodeColumn ? String(row['code'] ?? '').trim() : codeName;
		if (!code) continue;

		entries.push({ code, startTime, endTime });
	}

	return { type: 'time', entries };
}

function extractCodeNameFromFileName(fileName: string): string {
	return fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
}

// ============ Application ============

/**
 * Apply turn-based codes to word array. Each DataPoint gets codes[] populated
 * based on which codes cover its turn number.
 */
export function applyCodesByTurn(wordArray: DataPoint[], parsedCodes: ParsedCodes): void {
	if (parsedCodes.type !== 'turn') return;

	// Build a lookup: turnNumber -> codes[]
	const turnToCodesMap = new Map<number, string[]>();
	for (const entry of parsedCodes.entries) {
		for (const turn of entry.turns) {
			if (!turnToCodesMap.has(turn)) turnToCodesMap.set(turn, []);
			turnToCodesMap.get(turn)!.push(entry.code);
		}
	}

	for (const dp of wordArray) {
		const codes = turnToCodesMap.get(dp.turnNumber);
		if (codes) {
			dp.codes = [...new Set([...dp.codes, ...codes])];
		}
	}
}

/**
 * Apply time-based codes to word array. Each DataPoint gets codes[] populated
 * based on which code time ranges overlap its time range.
 */
export function applyCodesByTime(wordArray: DataPoint[], parsedCodes: ParsedCodes): void {
	if (parsedCodes.type !== 'time') return;

	for (const dp of wordArray) {
		for (const entry of parsedCodes.entries) {
			if (dp.startTime < entry.endTime && dp.endTime > entry.startTime) {
				if (!dp.codes.includes(entry.code)) {
					dp.codes.push(entry.code);
				}
			}
		}
	}
}

// ============ Clear ============

/**
 * Clear all codes from the word array and reset CodeStore.
 */
export function clearAllCodes(wordArray: DataPoint[]): void {
	for (const dp of wordArray) {
		dp.codes = [];
	}
	CodeStore.set([]);
}

// ============ Store Management ============

/**
 * Update CodeStore with newly discovered codes, assigning colors from USER_COLORS.
 */
export function updateCodeStoreWithNewCodes(parsedCodes: ParsedCodes): void {
	const currentCodes = get(CodeStore);
	const existingCodeNames = new Set(currentCodes.map((c) => c.code));

	const newCodeNames: string[] = [];
	const seen = new Set<string>();
	for (const entry of parsedCodes.entries) {
		if (!existingCodeNames.has(entry.code) && !seen.has(entry.code)) {
			newCodeNames.push(entry.code);
			seen.add(entry.code);
		}
	}

	if (newCodeNames.length === 0) return;

	const usedColors = new Set(currentCodes.map((c) => c.color));
	let colorIndex = 0;

	const newEntries: CodeEntry[] = newCodeNames.map((code) => {
		// Find next unused color
		while (colorIndex < USER_COLORS.length && usedColors.has(USER_COLORS[colorIndex])) {
			colorIndex++;
		}
		const color = USER_COLORS[colorIndex % USER_COLORS.length];
		usedColors.add(color);
		colorIndex++;
		return { code, color, enabled: true };
	});

	CodeStore.set([...currentCodes, ...newEntries]);
}
