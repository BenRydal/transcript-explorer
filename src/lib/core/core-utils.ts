interface PapaParseResults {
	data: Record<string, unknown>[];
	meta: {
		fields: string[];
	};
}

type RowValidator = (row: Record<string, unknown>) => boolean;

// NOTE: headers here must be lowercase as input data tables are converted to lowercase when loaded using PapaParse transformHeaders method
export const HEADERS_TRANSCRIPT_WITH_TIME = ['speaker', 'content', 'start', 'end'];
export const HEADERS_SIMPLE_TRANSCRIPT = ['speaker', 'content'];

export function testTranscript(results: PapaParseResults): boolean {
	return testPapaParseResults(results, HEADERS_SIMPLE_TRANSCRIPT, hasSpeakerNameAndContent);
}

/**
 * Tests PapaParse results for valid transcript data
 */
export function testPapaParseResults(results: PapaParseResults, headers: string[], callbackTypeTest: RowValidator): boolean {
	return results.data.length > 0 && includesAllHeaders(results.meta.fields, headers) && hasOneCleanRow(results.data, callbackTypeTest);
}

// NOTE: fieldNames from parsed file are converted to lowercase on Processing with PapaParse transformHeaders method
export function includesAllHeaders(fieldNamesLowerCase: string[], headers: string[]): boolean {
	for (const header of headers) {
		if (!fieldNamesLowerCase.includes(header)) return false;
	}
	return true;
}

export function hasOneCleanRow(resultsDataArray: Record<string, unknown>[], callbackTypeTest: RowValidator): boolean {
	for (const curRow of resultsDataArray) {
		if (callbackTypeTest(curRow)) return true;
	}
	return false;
}

export function hasSpeakerNameAndContent(curRow: Record<string, unknown>): boolean {
	const speakerName = curRow[HEADERS_SIMPLE_TRANSCRIPT[0]];
	const content = curRow[HEADERS_SIMPLE_TRANSCRIPT[1]];
	return isStringNumberOrBoolean(speakerName) && isStringNumberOrBoolean(content);
}

export function isStringNumberOrBoolean(value: unknown): boolean {
	return (
		(typeof value === 'string' && value.trim() !== '') || // Non-empty strings
		(typeof value === 'number' && !isNaN(value) && isFinite(value)) || // Valid numbers (not NaN, not infinite)
		typeof value === 'boolean'
	);
}
