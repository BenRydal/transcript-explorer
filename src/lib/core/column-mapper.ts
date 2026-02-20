import { HEADERS_TRANSCRIPT_WITH_TIME, HEADERS_SIMPLE_TRANSCRIPT } from './core-utils';

export interface ColumnMatch {
	expected: string;
	matched: string | null;
	isExact: boolean;
	score: number;
}

function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[m][n];
}

function similarity(a: string, b: string): number {
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;
	return 1 - levenshtein(a, b) / maxLen;
}

const FUZZY_THRESHOLD = 0.6;

export function mapColumns(csvColumns: string[]): ColumnMatch[] {
	const validCsvColumns = csvColumns.filter((c) => c && c.trim());
	const requiredColumns = HEADERS_SIMPLE_TRANSCRIPT;
	const optionalColumns = HEADERS_TRANSCRIPT_WITH_TIME.filter(
		(c) => !requiredColumns.includes(c)
	);
	const allExpected = [...requiredColumns, ...optionalColumns];
	const used = new Set<string>();
	const results: ColumnMatch[] = [];

	// Pass 1: exact matches
	for (const expected of allExpected) {
		const exactMatch = validCsvColumns.find((c) => c === expected && !used.has(c));
		if (exactMatch) {
			used.add(exactMatch);
			results.push({ expected, matched: exactMatch, isExact: true, score: 1 });
		} else {
			results.push({ expected, matched: null, isExact: false, score: 0 });
		}
	}

	// Pass 2: fuzzy matches for unmatched expected columns
	// Build candidates sorted by best score first so greedy assignment is optimal
	const fuzzyPairs: { idx: number; csvCol: string; score: number }[] = [];
	for (let i = 0; i < results.length; i++) {
		if (results[i].matched !== null) continue;
		for (const csvCol of validCsvColumns) {
			if (used.has(csvCol)) continue;
			const s = similarity(results[i].expected, csvCol);
			if (s >= FUZZY_THRESHOLD) {
				fuzzyPairs.push({ idx: i, csvCol, score: s });
			}
		}
	}
	fuzzyPairs.sort((a, b) => b.score - a.score);

	for (const { idx, csvCol, score } of fuzzyPairs) {
		if (results[idx].matched !== null || used.has(csvCol)) continue;
		used.add(csvCol);
		results[idx].matched = csvCol;
		results[idx].score = score;
	}

	return results;
}

export function isRequired(column: string): boolean {
	return HEADERS_SIMPLE_TRANSCRIPT.includes(column);
}

export function allRequiredMapped(
	matches: ColumnMatch[],
	overrides: Record<string, string | null>
): boolean {
	return HEADERS_SIMPLE_TRANSCRIPT.every((col) => {
		const override = overrides[col];
		if (override !== undefined) return override !== null;
		const match = matches.find((m) => m.expected === col);
		return match?.matched !== null;
	});
}

export function buildFinalMapping(
	matches: ColumnMatch[],
	overrides: Record<string, string | null>
): Record<string, string> {
	if (matches.length === 0) return {};
	const mapping: Record<string, string> = {};
	for (const match of matches) {
		const override = overrides[match.expected];
		const source = override !== undefined ? override : match.matched;
		if (source) {
			mapping[match.expected] = source;
		}
	}
	return mapping;
}

export function remapData(
	data: Record<string, unknown>[],
	mapping: Record<string, string>
): Record<string, unknown>[] {
	return data.map((row) => {
		const newRow: Record<string, unknown> = {};
		for (const [expected, original] of Object.entries(mapping)) {
			newRow[expected] = row[original];
		}
		return newRow;
	});
}
