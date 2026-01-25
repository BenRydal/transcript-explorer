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

function testPapaParseResults(results: PapaParseResults, headers: string[], callbackTypeTest: RowValidator): boolean {
	return results.data.length > 0 && includesAllHeaders(results.meta.fields, headers) && hasOneCleanRow(results.data, callbackTypeTest);
}

function includesAllHeaders(fieldNamesLowerCase: string[], headers: string[]): boolean {
	return headers.every((header) => fieldNamesLowerCase.includes(header));
}

function hasOneCleanRow(resultsDataArray: Record<string, unknown>[], callbackTypeTest: RowValidator): boolean {
	return resultsDataArray.some(callbackTypeTest);
}

function isStringNumberOrBoolean(value: unknown): boolean {
	return (
		(typeof value === 'string' && value.trim() !== '') ||
		(typeof value === 'number' && !isNaN(value) && isFinite(value)) ||
		typeof value === 'boolean'
	);
}

export function hasSpeakerNameAndContent(curRow: Record<string, unknown>): boolean {
	const speakerName = curRow[HEADERS_SIMPLE_TRANSCRIPT[0]];
	const content = curRow[HEADERS_SIMPLE_TRANSCRIPT[1]];
	return isStringNumberOrBoolean(speakerName) && isStringNumberOrBoolean(content);
}
