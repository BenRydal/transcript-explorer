export class CoreUtils {
	constructor() {
		// NOTE: headers here must be lowercase as input data tables are converted to lowercase when loaded using PapaParse transformHeaders method
		this.headersTranscriptWithTime = ['speaker', 'content', 'start', 'end'];
		this.headersSimpleTranscript = ['speaker', 'content'];
	}

	testTranscript(results) {
		return this.testPapaParseResults(results, this.headersSimpleTranscript, this.hasSpeakerNameAndContent);
	}

	/**
	 * @param  {Papaparse Results Array} results
	 * @param  {Array} headers
	 * @param  {Function} callbackTypeTest
	 * Note: must bind this to callbackTypeTest to set correct "this" context
	 */
	testPapaParseResults(results, headers, callbackTypeTest) {
		return (
			results.data.length > 0 &&
			this.includesAllHeaders(results.meta.fields, headers) &&
			this.hasOneCleanRow(results.data, callbackTypeTest.bind(this))
		);
	}

	// NOTE: fieldNames from parsed file are converted to lowercase on Processing with PapaParse transformHeaders method
	includesAllHeaders(fieldNamesLowerCase, headers) {
		for (const header of headers) {
			if (!fieldNamesLowerCase.includes(header)) return false;
		}
		return true;
	}

	hasOneCleanRow(resultsDataArray, callbackTypeTest) {
		for (const curRow of resultsDataArray) {
			if (callbackTypeTest(curRow)) return true;
		}
		return false;
	}

	hasSpeakerNameAndContent(curRow) {
		const [speakerName, content] = [curRow[this.headersSimpleTranscript[0]], curRow[this.headersSimpleTranscript[1]]];
		return this.isStringNumberOrBoolean(speakerName) && this.isStringNumberOrBoolean(content);
	}

	isStringNumberOrBoolean(value) {
		return (
			(typeof value === 'string' && value.trim() !== '') || // Non-empty strings
			(typeof value === 'number' && !isNaN(value) && isFinite(value)) || // Valid numbers (not NaN, not infinite)
			typeof value === 'boolean'
		);
	}
}
