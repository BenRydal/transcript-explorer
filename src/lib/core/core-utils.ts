interface PapaParseResults {
	data: Record<string, unknown>[];
	meta: {
		fields: string[];
	};
}

type RowValidator = (row: Record<string, unknown>) => boolean;

export class CoreUtils {
	headersTranscriptWithTime: string[];
	headersSimpleTranscript: string[];

	constructor() {
		// NOTE: headers here must be lowercase as input data tables are converted to lowercase when loaded using PapaParse transformHeaders method
		this.headersTranscriptWithTime = ['speaker', 'content', 'start', 'end'];
		this.headersSimpleTranscript = ['speaker', 'content'];
	}

	testTranscript(results: PapaParseResults): boolean {
		return this.testPapaParseResults(results, this.headersSimpleTranscript, this.hasSpeakerNameAndContent);
	}

	/**
	 * Tests PapaParse results for valid transcript data
	 * Note: must bind this to callbackTypeTest to set correct "this" context
	 */
	testPapaParseResults(results: PapaParseResults, headers: string[], callbackTypeTest: RowValidator): boolean {
		return (
			results.data.length > 0 &&
			this.includesAllHeaders(results.meta.fields, headers) &&
			this.hasOneCleanRow(results.data, callbackTypeTest.bind(this))
		);
	}

	// NOTE: fieldNames from parsed file are converted to lowercase on Processing with PapaParse transformHeaders method
	includesAllHeaders(fieldNamesLowerCase: string[], headers: string[]): boolean {
		for (const header of headers) {
			if (!fieldNamesLowerCase.includes(header)) return false;
		}
		return true;
	}

	hasOneCleanRow(resultsDataArray: Record<string, unknown>[], callbackTypeTest: RowValidator): boolean {
		for (const curRow of resultsDataArray) {
			if (callbackTypeTest(curRow)) return true;
		}
		return false;
	}

	hasSpeakerNameAndContent(curRow: Record<string, unknown>): boolean {
		const speakerName = curRow[this.headersSimpleTranscript[0]];
		const content = curRow[this.headersSimpleTranscript[1]];
		return this.isStringNumberOrBoolean(speakerName) && this.isStringNumberOrBoolean(content);
	}

	isStringNumberOrBoolean(value: unknown): boolean {
		return (
			(typeof value === 'string' && value.trim() !== '') || // Non-empty strings
			(typeof value === 'number' && !isNaN(value) && isFinite(value)) || // Valid numbers (not NaN, not infinite)
			typeof value === 'boolean'
		);
	}
}
