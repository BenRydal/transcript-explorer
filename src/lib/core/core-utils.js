export class CoreUtils {
	constructor() {
		// NOTE: headers here must be lowercase as input data tables are converted to lowercase when loaded using PapaParse transformHeaders method
		this.headersTranscript = ['speaker', 'content', 'start', 'end'];
		this.headersSingleCodes = ['start', 'end'];
		this.headersMultiCodes = ['code', 'start', 'end']; // MUST match singleCodeHeaders with one extra column 'code' of type string
	}

	testTranscript(results) {
		return this.testPapaParseResults(results, this.headersTranscript, this.transcriptRowForType);
	}

	testSingleCode(results) {
		return this.testPapaParseResults(results, this.headersSingleCodes, this.codeRowForType);
	}

	testMulticode(results) {
		return this.testPapaParseResults(results, this.headersMultiCodes, this.multiCodeRowForType);
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

	transcriptRowForType(curRow) {
		return (
			this.isStringNumberOrBoolean(curRow[this.headersTranscript[0]]) &&
			this.isStringNumberOrBoolean(curRow[this.headersTranscript[1]]) &&
			typeof curRow[this.headersTranscript[2]] === 'number' &&
			typeof curRow[this.headersTranscript[3]] === 'number'
		);
	}

	isStringNumberOrBoolean(value) {
		return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
	}

	codeRowForType(curRow) {
		return typeof curRow[this.headersSingleCodes[0]] === 'number' && typeof curRow[this.headersSingleCodes[1]] === 'number';
	}

	multiCodeRowForType(curRow) {
		return (
			typeof curRow[this.headersMultiCodes[0]] === 'string' &&
			typeof curRow[this.headersMultiCodes[1]] === 'number' &&
			typeof curRow[this.headersMultiCodes[2]] === 'number'
		);
	}

	/**
	 * Used to compare and add new data to core data lists from CSV file names and data
	 * @param  {String} s
	 */
	cleanFileName(string) {
		return string
			.trim()
			.replace(/\.[^/.]+$/, '')
			.toLowerCase();
	}
}
