interface PapaParseResults {
	data: Record<string, unknown>[];
	meta: {
		fields: string[];
	};
}

// NOTE: headers must be lowercase as PapaParse transformHeaders converts them
export const HEADERS_TRANSCRIPT_WITH_TIME = ['speaker', 'content', 'start', 'end'];
export const HEADERS_SIMPLE_TRANSCRIPT = ['speaker', 'content'];

export function testTranscript(results: PapaParseResults): boolean {
	return (
		results.data.length > 0 &&
		HEADERS_SIMPLE_TRANSCRIPT.every((h) => results.meta.fields.includes(h)) &&
		results.data.some(hasSpeakerNameAndContent)
	);
}

function isValidValue(value: unknown): boolean {
	return (
		(typeof value === 'string' && value.trim() !== '') ||
		(typeof value === 'number' && !isNaN(value) && isFinite(value)) ||
		typeof value === 'boolean'
	);
}

export function hasSpeakerNameAndContent(row: Record<string, unknown>): boolean {
	return isValidValue(row['speaker']) && isValidValue(row['content']);
}
