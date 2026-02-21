import type { ParseResult as PapaParseResult } from 'papaparse';
import type { ColumnMatch } from '$lib/core/column-mapper';
import type { ParseResult } from '$lib/core/text-parser';
import type { TimingMode } from './transcript';

export interface CodePreview {
	fileName: string;
	formatLabel: string;
	rawRows: Record<string, unknown>[];
	allColumns: string[];
	codeNames: string[];
	rowCount: number;
	papaResults: PapaParseResult<Record<string, unknown>>;
	error: string | null;
}

export interface CSVPreview {
	fileName: string;
	rawRows: Record<string, unknown>[];
	allColumns: string[];
	columnMatches: ColumnMatch[];
	columnOverrides: Record<string, string | null>;
	rawData: Record<string, unknown>[];
	parseResult: ParseResult | null;
	speakerCount: number;
	turnCount: number;
	wordCount: number;
	timingMode: TimingMode | null;
	error: string | null;
}
