/**
 * Test script for code file parsers.
 * Run with: npx tsx test-code-data/run-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { testCodeFile, getCodeFormatLabel, extractCodeNames, parseCodeFile } from '../src/lib/core/code-utils.js';

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

// ============ Helpers ============

function parseCSV(filePath: string): Papa.ParseResult<Record<string, unknown>> {
	const content = fs.readFileSync(filePath, 'utf-8');
	return Papa.parse<Record<string, unknown>>(content, {
		dynamicTyping: true,
		skipEmptyLines: 'greedy',
		header: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	});
}

// ============ Detection Tests ============

function runDetectionTests() {
	section('CODE FILE DETECTION');

	const dir = __dirname;

	// Should be detected as code files
	const codeFiles = [
		'turn-based-good.csv',
		'turn-based-single-code.csv',
		'turn-based-empty-codes.csv',
		'turn-based-duplicate-turns.csv',
		'turn-based-invalid-turn-numbers.csv',
		'turn-based-high-turn-numbers.csv',
		'turn-based-many-codes.csv',
		'turn-based-multiple-codes-per-turn.csv',
		'turn-based-whitespace-codes.csv',
		'turn-based-special-characters.csv',
		'turn-based-all-rows-invalid.csv',
		'turn-range-good.csv',
		'turn-range-inverted.csv',
		'turn-range-overlapping.csv',
		'turn-range-huge-range.csv',
		'turn-range-invalid-values.csv',
		'turn-range-single-turn-ranges.csv',
		'time-based-good-seconds.csv',
		'time-based-good-hhmmss.csv',
		'time-based-good-mmss.csv',
		'time-based-mixed-formats.csv',
		'time-based-invalid-times.csv',
		'time-based-overlapping.csv',
		'time-based-zero-duration.csv',
		'time-based-gaps-between-codes.csv',
		'time-based-no-code-column.csv',
		'incomplete-code-columns.csv'
	];

	for (const file of codeFiles) {
		testFile(file);
		const results = parseCSV(path.join(dir, file));
		assert(testCodeFile(results as any), `${file}: should be detected as code file`);
	}

	// Should NOT be detected as code files
	const nonCodeFiles = ['empty-file.csv', 'headers-only-no-data.csv', 'unknown-columns.csv', 'wrong-columns-not-a-code-file.csv'];

	for (const file of nonCodeFiles) {
		testFile(file);
		const results = parseCSV(path.join(dir, file));
		assert(!testCodeFile(results as any), `${file}: should NOT be detected as code file`);
	}
}

// ============ Format Label Tests ============

function runFormatLabelTests() {
	section('FORMAT LABEL DETECTION');

	const cases: [string, string][] = [
		['turn-based-good.csv', 'Turn-based'],
		['turn-range-good.csv', 'Turn range'],
		['time-based-good-seconds.csv', 'Time-based'],
		['time-based-no-code-column.csv', 'Time-based'],
		['incomplete-code-columns.csv', 'Unknown']
	];

	for (const [file, expectedLabel] of cases) {
		testFile(file);
		const results = parseCSV(path.join(__dirname, file));
		const label = getCodeFormatLabel(results.meta.fields ?? []);
		assert(label === expectedLabel, `${file}: format should be '${expectedLabel}' (got '${label}')`);
		console.log(`  Format: ${label}`);
	}
}

// ============ Code Name Extraction Tests ============

function runCodeNameTests() {
	section('CODE NAME EXTRACTION');

	testFile('turn-based-good.csv');
	let results = parseCSV(path.join(__dirname, 'turn-based-good.csv'));
	let names = extractCodeNames(results.data, results.meta.fields ?? [], 'turn-based-good.csv');
	assert(names.length === 8, `should find 8 unique codes (got ${names.length})`);
	assert(names[0] === 'question', `first code should be 'question' (got '${names[0]}')`);

	testFile('turn-based-single-code.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-single-code.csv'));
	names = extractCodeNames(results.data, results.meta.fields ?? [], 'turn-based-single-code.csv');
	assert(names.length === 1, `should find 1 unique code (got ${names.length})`);
	assert(names[0] === 'important', `code should be 'important' (got '${names[0]}')`);

	testFile('turn-based-empty-codes.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-empty-codes.csv'));
	names = extractCodeNames(results.data, results.meta.fields ?? [], 'turn-based-empty-codes.csv');
	assert(names.length === 3, `should find 3 unique codes, skipping empty (got ${names.length})`);

	testFile('time-based-no-code-column.csv (filename-derived)');
	results = parseCSV(path.join(__dirname, 'time-based-no-code-column.csv'));
	names = extractCodeNames(results.data, results.meta.fields ?? [], 'time-based-no-code-column.csv');
	assert(names.length === 1, `should derive 1 code from filename (got ${names.length})`);
	assert(names[0] === 'time based no code column', `code should be 'time based no code column' (got '${names[0]}')`);

	testFile('turn-based-many-codes.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-many-codes.csv'));
	names = extractCodeNames(results.data, results.meta.fields ?? [], 'turn-based-many-codes.csv');
	assert(names.length === 17, `should find 17 unique codes (got ${names.length})`);
}

// ============ Turn-Based Parsing Tests ============

function runTurnBasedTests() {
	section('TURN-BASED PARSING');

	testFile('turn-based-good.csv');
	let results = parseCSV(path.join(__dirname, 'turn-based-good.csv'));
	let parsed = parseCodeFile(results as any, 'turn-based-good.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 8, `should have 8 code entries (got ${parsed.entries.length})`);
		const question = parsed.entries.find((e) => e.code === 'question');
		assert(question != null, 'should have question code');
		assert(question!.turns.length === 2, `question should cover 2 turns (got ${question!.turns.length})`);
		assert(question!.turns[0] === 1 && question!.turns[1] === 4, 'question turns should be [1, 4]');
		console.log(`  Entries: ${parsed.entries.length}, codes: ${parsed.entries.map((e) => e.code).join(', ')}`);
	}

	testFile('turn-based-single-code.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-single-code.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-single-code.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 1, `should have 1 entry (got ${parsed.entries.length})`);
		assert(parsed.entries[0].turns.length === 4, `should have 4 turns (got ${parsed.entries[0].turns.length})`);
		assert(JSON.stringify(parsed.entries[0].turns) === '[1,3,5,7]', `turns should be [1,3,5,7]`);
	}

	testFile('turn-based-empty-codes.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-empty-codes.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-empty-codes.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 3, `should have 3 entries, skipping empty codes (got ${parsed.entries.length})`);
		console.log(`  Codes: ${parsed.entries.map((e) => e.code).join(', ')}`);
	}

	testFile('turn-based-duplicate-turns.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-duplicate-turns.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-duplicate-turns.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		const question = parsed.entries.find((e) => e.code === 'question');
		assert(question!.turns.length === 1, `question should be deduplicated to 1 turn (got ${question!.turns.length})`);
		const answer = parsed.entries.find((e) => e.code === 'answer');
		assert(answer!.turns.length === 1, `answer should be deduplicated to 1 turn (got ${answer!.turns.length})`);
	}

	testFile('turn-based-invalid-turn-numbers.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-invalid-turn-numbers.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-invalid-turn-numbers.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		// Valid rows: turn 1 (question), turn 3 (clarification), turn 999 (off-topic)
		// turn 5.5 is valid as Number('5.5') = 5.5, but it's >= 1 so it passes
		const allTurns = parsed.entries.flatMap((e) => e.turns);
		assert(!allTurns.includes(0), 'should not include turn 0');
		assert(!allTurns.includes(-1), 'should not include turn -1');
		assert(allTurns.includes(1), 'should include turn 1');
		assert(allTurns.includes(3), 'should include turn 3');
		assert(allTurns.includes(999), 'should include turn 999');
		console.log(`  Valid entries: ${parsed.entries.length}, turns: ${allTurns.sort((a, b) => a - b).join(', ')}`);
	}

	testFile('turn-based-all-rows-invalid.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-all-rows-invalid.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-all-rows-invalid.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 0, `should have 0 entries when all rows invalid (got ${parsed.entries.length})`);
	}

	testFile('turn-based-multiple-codes-per-turn.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-multiple-codes-per-turn.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-multiple-codes-per-turn.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		const polite = parsed.entries.find((e) => e.code === 'polite');
		assert(polite != null, 'should have polite code');
		assert(polite!.turns.length === 2, `polite should cover turns 1 and 5 (got ${polite!.turns.length})`);
		const turn5Codes = parsed.entries.filter((e) => e.turns.includes(5)).map((e) => e.code);
		assert(turn5Codes.length === 3, `turn 5 should have 3 codes (got ${turn5Codes.length})`);
		console.log(`  Turn 5 codes: ${turn5Codes.join(', ')}`);
	}

	testFile('turn-based-whitespace-codes.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-whitespace-codes.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-whitespace-codes.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		const codeNames = parsed.entries.map((e) => e.code);
		assert(codeNames.includes('question'), 'should trim leading space from " question"');
		assert(codeNames.includes('answer'), 'should trim leading spaces from "  answer"');
		assert(codeNames.includes('code with spaces'), 'should preserve internal spaces');
		console.log(`  Codes: ${codeNames.join(', ')}`);
	}

	testFile('turn-based-special-characters.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-special-characters.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-special-characters.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		const codeNames = parsed.entries.map((e) => e.code);
		assert(codeNames.includes('question?'), 'should handle question mark');
		assert(codeNames.includes('code,with,commas'), 'should handle commas (CSV escaped)');
		assert(codeNames.includes('code "with" quotes'), 'should handle quotes (CSV escaped)');
		assert(codeNames.includes('UPPERCASE_CODE'), 'should preserve case');
		console.log(`  Codes: ${codeNames.join(', ')}`);
	}

	testFile('turn-based-high-turn-numbers.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-high-turn-numbers.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-high-turn-numbers.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 5, `should have 5 entries (got ${parsed.entries.length})`);
		const deep = parsed.entries.find((e) => e.code === 'extremely_deep');
		assert(deep!.turns[0] === 1000, 'should handle turn 1000');
	}

	testFile('turn-based-many-codes.csv');
	results = parseCSV(path.join(__dirname, 'turn-based-many-codes.csv'));
	parsed = parseCodeFile(results as any, 'turn-based-many-codes.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 17, `should have 17 entries (got ${parsed.entries.length})`);
		const topicShift = parsed.entries.find((e) => e.code === 'topic_shift');
		assert(topicShift!.turns.length === 2, `topic_shift should cover 2 turns (got ${topicShift!.turns.length})`);
	}
}

// ============ Turn-Range Parsing Tests ============

function runTurnRangeTests() {
	section('TURN-RANGE PARSING');

	testFile('turn-range-good.csv');
	let results = parseCSV(path.join(__dirname, 'turn-range-good.csv'));
	let parsed = parseCodeFile(results as any, 'turn-range-good.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 5, `should have 5 entries (got ${parsed.entries.length})`);
		const intro = parsed.entries.find((e) => e.code === 'introduction');
		assert(JSON.stringify(intro!.turns) === '[1,2,3]', `introduction should expand to [1,2,3]`);
		const main = parsed.entries.find((e) => e.code === 'main_discussion');
		assert(main!.turns.length === 4, `main_discussion should have 4 turns (got ${main!.turns.length})`);
		console.log(`  Entries: ${parsed.entries.map((e) => `${e.code}(${e.turns.length})`).join(', ')}`);
	}

	testFile('turn-range-inverted.csv');
	results = parseCSV(path.join(__dirname, 'turn-range-inverted.csv'));
	parsed = parseCodeFile(results as any, 'turn-range-inverted.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		// Inverted ranges (end < start) should be skipped
		const inverted = parsed.entries.find((e) => e.code === 'inverted_range');
		assert(inverted == null, 'inverted_range should be skipped');
		const anotherInverted = parsed.entries.find((e) => e.code === 'another_inverted');
		assert(anotherInverted == null, 'another_inverted should be skipped');
		// Valid ranges should still parse
		const good = parsed.entries.find((e) => e.code === 'good_range');
		assert(good != null, 'good_range should parse');
		const single = parsed.entries.find((e) => e.code === 'single_turn_range');
		assert(single != null && single.turns.length === 1, 'single_turn_range should have 1 turn');
		console.log(`  Valid entries: ${parsed.entries.map((e) => e.code).join(', ')}`);
	}

	testFile('turn-range-overlapping.csv');
	results = parseCSV(path.join(__dirname, 'turn-range-overlapping.csv'));
	parsed = parseCodeFile(results as any, 'turn-range-overlapping.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 4, `should have 4 entries (got ${parsed.entries.length})`);
		// topic_a covers 3-8, so turns should be deduplicated
		const topicA = parsed.entries.find((e) => e.code === 'topic_a');
		assert(topicA!.turns.length === 6, `topic_a should have 6 unique turns (got ${topicA!.turns.length})`);
	}

	testFile('turn-range-huge-range.csv');
	results = parseCSV(path.join(__dirname, 'turn-range-huge-range.csv'));
	parsed = parseCodeFile(results as any, 'turn-range-huge-range.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		// The 50000-turn range should be skipped (safety limit)
		const huge = parsed.entries.find((e) => e.code === 'exceeds_safety_limit');
		assert(huge == null, 'exceeds_safety_limit should be skipped (>10000 turns)');
		// Small ranges should still parse
		const small = parsed.entries.find((e) => e.code === 'small_range');
		assert(small != null, 'small_range should parse');
		const normal = parsed.entries.find((e) => e.code === 'normal_range');
		assert(normal != null, 'normal_range should parse');
		console.log(`  Valid entries: ${parsed.entries.map((e) => e.code).join(', ')}`);
	}

	testFile('turn-range-invalid-values.csv');
	results = parseCSV(path.join(__dirname, 'turn-range-invalid-values.csv'));
	parsed = parseCodeFile(results as any, 'turn-range-invalid-values.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		// Only "valid" (1-3) should survive
		assert(parsed.entries.length === 1, `should have 1 valid entry (got ${parsed.entries.length})`);
		assert(parsed.entries[0].code === 'valid', `valid entry should be 'valid' (got '${parsed.entries[0].code}')`);
	}

	testFile('turn-range-single-turn-ranges.csv');
	results = parseCSV(path.join(__dirname, 'turn-range-single-turn-ranges.csv'));
	parsed = parseCodeFile(results as any, 'turn-range-single-turn-ranges.csv');
	assert(parsed.type === 'turn', 'should parse as turn type');
	if (parsed.type === 'turn') {
		assert(parsed.entries.length === 5, `should have 5 entries (got ${parsed.entries.length})`);
		const singleA = parsed.entries.find((e) => e.code === 'single_turn_a');
		assert(singleA!.turns.length === 1, 'single_turn_a should have 1 turn');
		const twoTurn = parsed.entries.find((e) => e.code === 'two_turn_range');
		assert(twoTurn!.turns.length === 2, 'two_turn_range should have 2 turns');
	}
}

// ============ Time-Based Parsing Tests ============

function runTimeBasedTests() {
	section('TIME-BASED PARSING');

	testFile('time-based-good-seconds.csv');
	let results = parseCSV(path.join(__dirname, 'time-based-good-seconds.csv'));
	let parsed = parseCodeFile(results as any, 'time-based-good-seconds.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 6, `should have 6 entries (got ${parsed.entries.length})`);
		assert(parsed.entries[0].code === 'greeting', `first code should be 'greeting'`);
		assert(parsed.entries[0].startTime === 0, 'first start should be 0');
		assert(parsed.entries[0].endTime === 15.5, 'first end should be 15.5');
		assert(parsed.entries[5].endTime === 300, 'last end should be 300');
		console.log(`  Entries: ${parsed.entries.map((e) => `${e.code}(${e.startTime}-${e.endTime})`).join(', ')}`);
	}

	testFile('time-based-good-hhmmss.csv');
	results = parseCSV(path.join(__dirname, 'time-based-good-hhmmss.csv'));
	parsed = parseCodeFile(results as any, 'time-based-good-hhmmss.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 5, `should have 5 entries (got ${parsed.entries.length})`);
		assert(parsed.entries[0].startTime === 0, 'first start should be 0');
		assert(parsed.entries[0].endTime === 30, '00:00:30 should be 30 seconds');
		assert(parsed.entries[1].endTime === 135, '00:02:15 should be 135 seconds');
		assert(parsed.entries[4].endTime === 600, '00:10:00 should be 600 seconds');
	}

	testFile('time-based-good-mmss.csv');
	results = parseCSV(path.join(__dirname, 'time-based-good-mmss.csv'));
	parsed = parseCodeFile(results as any, 'time-based-good-mmss.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 5, `should have 5 entries (got ${parsed.entries.length})`);
		assert(parsed.entries[0].endTime === 30, '0:30 should be 30 seconds');
		assert(parsed.entries[1].endTime === 135, '2:15 should be 135 seconds');
		assert(parsed.entries[4].endTime === 600, '10:00 should be 600 seconds');
	}

	testFile('time-based-mixed-formats.csv');
	results = parseCSV(path.join(__dirname, 'time-based-mixed-formats.csv'));
	parsed = parseCodeFile(results as any, 'time-based-mixed-formats.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 4, `should have 4 entries (got ${parsed.entries.length})`);
		// Row: 0,30 (seconds)
		assert(parsed.entries[0].startTime === 0 && parsed.entries[0].endTime === 30, 'seconds format should parse');
		// Row: 0:30,1:15 (MM:SS)
		assert(parsed.entries[1].startTime === 30 && parsed.entries[1].endTime === 75, 'MM:SS format should parse');
		// Row: 00:01:15,00:02:00 (HH:MM:SS)
		assert(parsed.entries[2].startTime === 75 && parsed.entries[2].endTime === 120, 'HH:MM:SS format should parse');
		// Row: 120,00:03:00 (mixed)
		assert(parsed.entries[3].startTime === 120 && parsed.entries[3].endTime === 180, 'mixed formats should parse');
	}

	testFile('time-based-invalid-times.csv');
	results = parseCSV(path.join(__dirname, 'time-based-invalid-times.csv'));
	parsed = parseCodeFile(results as any, 'time-based-invalid-times.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		// Only rows with valid start AND end should survive
		const codes = parsed.entries.map((e) => e.code);
		assert(codes.includes('valid'), 'should include valid entry');
		assert(codes.includes('valid_2'), 'should include valid_2 entry');
		assert(!codes.includes('bad_start'), 'should skip bad_start');
		assert(!codes.includes('bad_end'), 'should skip bad_end');
		assert(!codes.includes('missing_start'), 'should skip missing_start');
		assert(!codes.includes('missing_end'), 'should skip missing_end');
		console.log(`  Valid entries: ${parsed.entries.length}, codes: ${codes.join(', ')}`);
	}

	testFile('time-based-overlapping.csv');
	results = parseCSV(path.join(__dirname, 'time-based-overlapping.csv'));
	parsed = parseCodeFile(results as any, 'time-based-overlapping.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 4, `should have 4 entries (got ${parsed.entries.length})`);
		// Overlapping time ranges are valid - no deduplication
		console.log(`  Entries: ${parsed.entries.map((e) => `${e.code}(${e.startTime}-${e.endTime})`).join(', ')}`);
	}

	testFile('time-based-zero-duration.csv');
	results = parseCSV(path.join(__dirname, 'time-based-zero-duration.csv'));
	parsed = parseCodeFile(results as any, 'time-based-zero-duration.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 5, `should have 5 entries including zero-duration (got ${parsed.entries.length})`);
		const zeroDuration = parsed.entries.find((e) => e.code === 'zero_duration');
		assert(zeroDuration != null, 'zero_duration should parse (start==end is valid)');
	}

	testFile('time-based-gaps-between-codes.csv');
	results = parseCSV(path.join(__dirname, 'time-based-gaps-between-codes.csv'));
	parsed = parseCodeFile(results as any, 'time-based-gaps-between-codes.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 4, `should have 4 entries (got ${parsed.entries.length})`);
		// Gaps between codes are fine
		assert(parsed.entries[0].endTime === 10 && parsed.entries[1].startTime === 30, 'gap between first and second code should be preserved');
	}

	testFile('time-based-no-code-column.csv');
	results = parseCSV(path.join(__dirname, 'time-based-no-code-column.csv'));
	parsed = parseCodeFile(results as any, 'time-based-no-code-column.csv');
	assert(parsed.type === 'time', 'should parse as time type');
	if (parsed.type === 'time') {
		assert(parsed.entries.length === 4, `should have 4 entries (got ${parsed.entries.length})`);
		// All entries should use filename-derived code name
		for (const entry of parsed.entries) {
			assert(entry.code === 'time based no code column', `code should be filename-derived (got '${entry.code}')`);
		}
	}
}

// ============ Incomplete / Error Tests ============

function runErrorTests() {
	section('ERROR HANDLING');

	testFile('incomplete-code-columns.csv (should throw on parse)');
	const results = parseCSV(path.join(__dirname, 'incomplete-code-columns.csv'));
	assert(testCodeFile(results as any), 'should detect as code file');
	let threw = false;
	try {
		parseCodeFile(results as any, 'incomplete-code-columns.csv');
	} catch (e: any) {
		threw = true;
		assert(e.message.includes('Unrecognized'), `error should mention unrecognized format (got '${e.message}')`);
		console.log(`  Correctly threw: ${e.message}`);
	}
	assert(threw, 'parseCodeFile should throw for incomplete code columns');
}

// ============ Negative Start Time Tests ============

function runNegativeTimeTest() {
	section('NEGATIVE TIME HANDLING');

	testFile('time-based-invalid-times.csv (negative start)');
	const results = parseCSV(path.join(__dirname, 'time-based-invalid-times.csv'));
	const parsed = parseCodeFile(results as any, 'time-based-invalid-times.csv');
	if (parsed.type === 'time') {
		// The row with -5 start: toSeconds returns the number, so it depends on toSeconds behavior
		const negativeEntry = parsed.entries.find((e) => e.code === 'negative_start');
		if (negativeEntry) {
			console.log(`  Note: negative start time (${negativeEntry.startTime}) was accepted by parser`);
		} else {
			console.log(`  Negative start time was filtered out`);
		}
	}
}

// ============ Run all tests ============

try {
	runDetectionTests();
	runFormatLabelTests();
	runCodeNameTests();
	runTurnBasedTests();
	runTurnRangeTests();
	runTimeBasedTests();
	runErrorTests();
	runNegativeTimeTest();
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
