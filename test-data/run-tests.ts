/**
 * Test script for all transcript parsers.
 * Run with: npx tsx test-data/run-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { parseCSVRows, parseTXTLines } from '../src/lib/core/csv-txt-parser.js';
import { parseSubtitleText } from '../src/lib/core/subtitle-parser.js';
import { parseTranscriptText } from '../src/lib/core/text-parser.js';
import { testTranscript } from '../src/lib/core/core-utils.js';
import { createTranscriptFromParsedText, createTranscriptFromSubtitle } from '../src/lib/core/transcript-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ Test Helpers ============

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
	totalTests++;
	if (condition) {
		passed++;
	} else {
		failed++;
		failures.push(message);
		console.error(`  FAIL: ${message}`);
	}
}

function section(name: string) {
	console.log(`\n${'='.repeat(60)}`);
	console.log(`  ${name}`);
	console.log('='.repeat(60));
}

function testFile(name: string) {
	console.log(`\n--- ${name} ---`);
}

// ============ CSV Tests ============

function parseCSVFile(filePath: string): {
	valid: boolean;
	parseResult: ReturnType<typeof parseCSVRows> | null;
	papaResult: Papa.ParseResult<Record<string, unknown>> | null;
} {
	const content = fs.readFileSync(filePath, 'utf-8');
	const papaResult = Papa.parse<Record<string, unknown>>(content, {
		dynamicTyping: true,
		skipEmptyLines: 'greedy',
		header: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	});

	const valid = testTranscript(papaResult as any);
	if (!valid) {
		return { valid: false, parseResult: null, papaResult };
	}

	const parseResult = parseCSVRows(papaResult.data, 3);
	return { valid: true, parseResult, papaResult };
}

function runCSVTests() {
	section('CSV FILE TESTS');
	const csvDir = path.join(__dirname, 'csv');
	const files = fs
		.readdirSync(csvDir)
		.filter((f) => f.endsWith('.csv'))
		.sort();

	for (const file of files) {
		testFile(file);
		const filePath = path.join(csvDir, file);
		const { valid, parseResult, papaResult } = parseCSVFile(filePath);

		if (file === '14-bad-missing-columns.csv') {
			assert(!valid, `${file}: should reject - missing required columns`);
			console.log(`  Correctly rejected: missing 'speaker'/'content' columns`);
			continue;
		}

		if (file === '15-empty-file.csv') {
			assert(!valid, `${file}: should reject - headers only, no data rows`);
			console.log(`  Correctly rejected: no data rows`);
			continue;
		}

		if (file === '16-completely-empty.csv') {
			assert(!valid, `${file}: should reject - completely empty file`);
			console.log(`  Correctly rejected: empty file`);
			continue;
		}

		assert(valid, `${file}: should pass testTranscript validation`);
		if (!parseResult) continue;

		// Create transcript to test full pipeline
		let transcript, users;
		try {
			({ transcript, users } = createTranscriptFromParsedText(parseResult, parseResult.detectedTimingMode));
			assert(true, `${file}: createTranscriptFromParsedText succeeded`);
		} catch (e) {
			assert(false, `${file}: createTranscriptFromParsedText threw: ${e}`);
			continue;
		}

		console.log(
			`  Turns: ${parseResult.turns.length}, Speakers: ${parseResult.speakers.length}, ` +
				`Timestamps: ${parseResult.hasTimestamps}, TimingMode: ${parseResult.detectedTimingMode}`
		);
		console.log(`  Transcript: ${transcript.totalNumOfWords} words, ${transcript.totalConversationTurns} turns, ` + `mode=${transcript.timingMode}`);

		// File-specific assertions
		switch (file) {
			case '01-speaker-content-only.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				assert(!parseResult.hasTimestamps, `${file}: should have no timestamps`);
				assert(parseResult.detectedTimingMode === 'untimed', `${file}: should be untimed`);
				assert(parseResult.speakers.length === 4, `${file}: should have 4 speakers`);
				break;

			case '02-start-time-only.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				assert(parseResult.hasTimestamps, `${file}: should have timestamps`);
				assert(parseResult.detectedTimingMode === 'startOnly', `${file}: should be startOnly`);
				assert(parseResult.speakers.length === 2, `${file}: should have 2 speakers`);
				// Check first turn has start time
				assert(parseResult.turns[0].startTime === 0, `${file}: first turn start should be 0`);
				break;

			case '03-start-and-end-time.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				assert(parseResult.hasTimestamps, `${file}: should have timestamps`);
				assert(parseResult.detectedTimingMode === 'startEnd', `${file}: should be startEnd`);
				assert(parseResult.turns[0].startTime === 0, `${file}: first start=0`);
				assert(parseResult.turns[0].endTime === 3, `${file}: first end=3`);
				break;

			case '04-hhmmss-timestamps.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				assert(parseResult.hasTimestamps, `${file}: should have timestamps`);
				assert(parseResult.detectedTimingMode === 'startEnd', `${file}: should be startEnd`);
				// Check HH:MM:SS parsed correctly
				assert(parseResult.turns[0].startTime === 0, `${file}: first start=0`);
				assert(parseResult.turns[0].endTime === 4, `${file}: first end=4`);
				assert(parseResult.turns[9].endTime === 39, `${file}: last end=39`);
				break;

			case '05-mmss-timestamps.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				assert(parseResult.hasTimestamps, `${file}: should have timestamps`);
				assert(parseResult.detectedTimingMode === 'startOnly', `${file}: should be startOnly`);
				// Check MM:SS parsed correctly (0:05 = 5 seconds)
				assert(parseResult.turns[1].startTime === 5, `${file}: second turn start=5`);
				assert(parseResult.turns[9].startTime === 35, `${file}: last turn start=35`);
				break;

			case '06-end-time-only.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				// end-time-only is unusual - check it handles gracefully
				// The parser should still produce turns with inferred timing
				console.log(`  First turn: start=${parseResult.turns[0].startTime}, end=${parseResult.turns[0].endTime}`);
				break;

			case '07-many-speakers.csv':
				assert(parseResult.turns.length === 12, `${file}: should have 12 turns`);
				assert(parseResult.speakers.length === 6, `${file}: should have 6 speakers`);
				assert(parseResult.detectedTimingMode === 'startEnd', `${file}: should be startEnd`);
				break;

			case '08-single-speaker.csv':
				assert(parseResult.turns.length === 8, `${file}: should have 8 turns`);
				assert(parseResult.speakers.length === 1, `${file}: should have 1 speaker`);
				assert(parseResult.speakers[0] === 'NARRATOR', `${file}: speaker should be NARRATOR`);
				break;

			case '09-long-turns.csv':
				assert(parseResult.turns.length === 5, `${file}: should have 5 turns`);
				assert(transcript.totalNumOfWords >= 200, `${file}: should have many words (got ${transcript.totalNumOfWords})`);
				break;

			case '10-special-characters.csv':
				assert(parseResult.turns.length === 9, `${file}: should have 9 turns`);
				assert(parseResult.speakers.length === 2, `${file}: should have 2 speakers`);
				break;

			case '11-gaps-in-timing.csv':
				assert(parseResult.turns.length === 10, `${file}: should have 10 turns`);
				assert(parseResult.detectedTimingMode === 'startEnd', `${file}: should be startEnd`);
				// Check gaps are preserved
				assert(parseResult.turns[0].endTime === 2, `${file}: first end=2`);
				assert(parseResult.turns[1].startTime === 5, `${file}: second start=5 (gap preserved)`);
				break;

			case '12-missing-some-timestamps.csv':
				assert(parseResult.turns.length === 7, `${file}: should have 7 turns`);
				assert(parseResult.hasTimestamps, `${file}: should detect timestamps`);
				// Check that missing timestamps were inferred
				for (const turn of parseResult.turns) {
					assert(turn.startTime !== null, `${file}: all turns should have start time (inferred if missing)`);
					assert(turn.endTime !== null, `${file}: all turns should have end time (inferred if missing)`);
				}
				break;

			case '13-empty-rows-and-whitespace.csv':
				// Should skip rows with no speaker or no content
				assert(parseResult.turns.length > 0, `${file}: should have some valid turns`);
				console.log(`  Valid turns: ${parseResult.turns.length}`);
				// Check whitespace is trimmed in speaker names
				const speakers = parseResult.speakers;
				for (const s of speakers) {
					assert(s === s.trim(), `${file}: speaker '${s}' should be trimmed`);
				}
				break;

			case '17-uppercase-headers.csv':
				assert(parseResult.turns.length === 5, `${file}: should have 5 turns (headers normalized)`);
				assert(parseResult.hasTimestamps, `${file}: should have timestamps`);
				break;

			case '18-extra-columns.csv':
				assert(parseResult.turns.length === 6, `${file}: should have 6 turns`);
				assert(parseResult.hasTimestamps, `${file}: should have timestamps`);
				assert(parseResult.detectedTimingMode === 'startEnd', `${file}: should be startEnd`);
				break;

			case '19-one-row.csv':
				assert(parseResult.turns.length === 1, `${file}: should have 1 turn`);
				assert(parseResult.speakers.length === 1, `${file}: should have 1 speaker`);
				break;

			case '20-overlapping-times.csv':
				assert(parseResult.turns.length === 6, `${file}: should have 6 turns`);
				assert(parseResult.detectedTimingMode === 'startEnd', `${file}: should be startEnd`);
				// Should not crash on overlapping times
				assert(transcript.totalNumOfWords > 0, `${file}: should produce words`);
				break;
		}
	}
}

// ============ TXT Tests ============

function runTXTTests() {
	section('TXT FILE TESTS');
	const txtDir = path.join(__dirname, 'txt-files');
	const files = fs
		.readdirSync(txtDir)
		.filter((f) => f.endsWith('.txt'))
		.sort();

	for (const file of files) {
		testFile(file);
		const filePath = path.join(txtDir, file);
		const content = fs.readFileSync(filePath, 'utf-8');
		const lines = content.split(/\r?\n/);

		// Test with TXT parser (for simple "Speaker: content" format)
		const txtResult = parseTXTLines(lines);
		console.log(`  TXT parser: ${txtResult.turns.length} turns, ${txtResult.speakers.length} speakers`);

		// Test with text-parser (more sophisticated, handles timestamps)
		const textResult = parseTranscriptText(content);
		console.log(
			`  Text parser: ${textResult.turns.length} turns, ${textResult.speakers.length} speakers, ` +
				`format=${textResult.detectedFormat}, timestamps=${textResult.hasTimestamps}`
		);

		// Both should produce some result (or both empty for bad files)
		if (file.includes('empty-and-whitespace')) {
			// Mostly blank lines - may produce 0 turns
			console.log(`  (edge case file - may have few/no turns)`);
		} else if (file.includes('plain-text-no-speakers')) {
			// No "Speaker:" format - TXT parser may struggle
			console.log(`  TXT parser may not handle plain text (no colons)`);
		} else if (file.includes('speaker-only-lines')) {
			// Lines with just "Speaker:" and no content
			console.log(`  Edge case: speaker names without content`);
		} else {
			// Most files should produce at least one turn from text parser
			assert(textResult.turns.length > 0, `${file}: text parser should produce turns`);
		}

		// Create transcript from text parser result if we have turns
		if (textResult.turns.length > 0) {
			try {
				const { transcript, users } = createTranscriptFromParsedText(textResult);
				assert(transcript.totalNumOfWords > 0, `${file}: transcript should have words`);
				assert(users.length > 0, `${file}: should have users`);
				console.log(
					`  Transcript: ${transcript.totalNumOfWords} words, ${transcript.totalConversationTurns} turns, ` +
						`${users.length} users, mode=${transcript.timingMode}`
				);
			} catch (e) {
				assert(false, `${file}: createTranscriptFromParsedText threw: ${e}`);
			}
		}
	}
}

// ============ SRT/VTT Tests ============

function runSubtitleTests() {
	section('SRT/VTT FILE TESTS');
	const srtDir = path.join(__dirname, 'srt');
	const files = fs
		.readdirSync(srtDir)
		.filter((f) => f.endsWith('.srt') || f.endsWith('.vtt'))
		.sort();

	for (const file of files) {
		testFile(file);
		const filePath = path.join(srtDir, file);
		const content = fs.readFileSync(filePath, 'utf-8');

		const parseResult = parseSubtitleText(content);
		console.log(`  Turns: ${parseResult.turns.length}, Timestamps: ${parseResult.hasTimestamps}`);

		assert(parseResult.turns.length > 0, `${file}: should produce turns`);
		assert(parseResult.hasTimestamps, `${file}: should have timestamps`);

		// All turns should have start and end times
		for (let i = 0; i < parseResult.turns.length; i++) {
			const turn = parseResult.turns[i];
			assert(turn.startTime !== null && turn.startTime >= 0, `${file}: turn ${i} should have start time`);
			assert(turn.endTime !== null && turn.endTime! > 0, `${file}: turn ${i} should have end time`);
			assert(turn.endTime! >= turn.startTime!, `${file}: turn ${i} end >= start`);
		}

		// Create transcript via subtitle factory
		try {
			const { transcript, users } = createTranscriptFromSubtitle(parseResult, '#6a3d9a');
			assert(transcript.totalNumOfWords > 0, `${file}: transcript should have words`);
			assert(transcript.timingMode === 'startEnd', `${file}: should be startEnd timing`);
			console.log(`  Transcript: ${transcript.totalNumOfWords} words, ${transcript.totalConversationTurns} turns`);

			// Verify word array times make sense
			const firstWord = transcript.wordArray[0];
			const lastWord = transcript.wordArray[transcript.wordArray.length - 1];
			assert(firstWord.startTime >= 0, `${file}: first word start >= 0`);
			assert(lastWord.endTime > 0, `${file}: last word end > 0`);
			assert(lastWord.endTime >= firstWord.startTime, `${file}: last word end >= first word start`);
		} catch (e) {
			assert(false, `${file}: createTranscriptFromSubtitle threw: ${e}`);
		}
	}
}

// ============ Cross-format consistency checks ============

function runConsistencyChecks() {
	section('CONSISTENCY CHECKS');

	// Test that CSV with start+end produces startEnd timing mode
	testFile('CSV startEnd timing consistency');
	const csvSE = parseCSVFile(path.join(__dirname, 'csv', '03-start-and-end-time.csv'));
	if (csvSE.parseResult) {
		const { transcript } = createTranscriptFromParsedText(csvSE.parseResult, csvSE.parseResult.detectedTimingMode);
		assert(transcript.timingMode === 'startEnd', 'CSV with both times should produce startEnd');
		// Every word should have end > start
		for (const word of transcript.wordArray) {
			assert(word.endTime >= word.startTime, `Word "${word.word}" should have end >= start`);
		}
		console.log(`  All ${transcript.wordArray.length} words have valid time ranges`);
	}

	// Test that CSV with start only produces startOnly timing mode
	testFile('CSV startOnly timing consistency');
	const csvSO = parseCSVFile(path.join(__dirname, 'csv', '02-start-time-only.csv'));
	if (csvSO.parseResult) {
		const { transcript } = createTranscriptFromParsedText(csvSO.parseResult, csvSO.parseResult.detectedTimingMode);
		assert(transcript.timingMode === 'startOnly', 'CSV with start only should produce startOnly');
		console.log(`  Timing mode: ${transcript.timingMode}`);
	}

	// Test that untimed CSV produces untimed timing mode
	testFile('CSV untimed timing consistency');
	const csvUT = parseCSVFile(path.join(__dirname, 'csv', '01-speaker-content-only.csv'));
	if (csvUT.parseResult) {
		const { transcript } = createTranscriptFromParsedText(csvUT.parseResult, csvUT.parseResult.detectedTimingMode);
		assert(transcript.timingMode === 'untimed', 'CSV with no times should produce untimed');
		console.log(`  Timing mode: ${transcript.timingMode}`);
	}

	// Test that transcript stats are populated
	testFile('Transcript stats population');
	const csv7 = parseCSVFile(path.join(__dirname, 'csv', '07-many-speakers.csv'));
	if (csv7.parseResult) {
		const { transcript, users } = createTranscriptFromParsedText(csv7.parseResult, csv7.parseResult.detectedTimingMode);
		assert(transcript.largestTurnLength > 0, 'largestTurnLength should be > 0');
		assert(transcript.largestNumOfWordsByASpeaker > 0, 'largestNumOfWordsByASpeaker should be > 0');
		assert(transcript.largestNumOfTurnsByASpeaker > 0, 'largestNumOfTurnsByASpeaker should be > 0');
		assert(transcript.maxCountOfMostRepeatedWord > 0, 'maxCountOfMostRepeatedWord should be > 0');
		assert(transcript.mostFrequentWord.length > 0, 'mostFrequentWord should not be empty');
		assert(users.length === 6, 'Should have 6 users with colors');
		console.log(
			`  Stats: largestTurn=${transcript.largestTurnLength}, freq="${transcript.mostFrequentWord}"(${transcript.maxCountOfMostRepeatedWord})`
		);
		console.log(`  Users: ${users.map((u) => u.name).join(', ')}`);
	}
}

// ============ Run all tests ============

try {
	runCSVTests();
	runTXTTests();
	runSubtitleTests();
	runConsistencyChecks();
} catch (e) {
	console.error('\nFATAL ERROR:', e);
	process.exit(2);
}

// ============ Summary ============

console.log(`\n${'='.repeat(60)}`);
console.log(`  TEST SUMMARY`);
console.log('='.repeat(60));
console.log(`  Total: ${totalTests}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failures.length > 0) {
	console.log(`\n  FAILURES:`);
	failures.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
