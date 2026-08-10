/**
 * Regression guard for the five human example transcripts.
 *
 * The baseline fixture was captured from `main` before any AI-transcript work
 * began. Every value here must stay byte-identical: these examples exercise the
 * shared CSV path, so a change that shifts any of them means AI-specific
 * behaviour has leaked into the human pipeline.
 *
 * Covers turn counts, word counts, timing mode, the derived statistics that
 * drive every visualization's scaling, and the speaker list and palette order
 * (which shift if rows are added or removed anywhere upstream).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { parseCSVRows } from '../src/lib/core/csv-txt-parser';
import { createTranscriptFromParsedText } from '../src/lib/core/transcript-factory';
import baseline from './fixtures/human-examples.baseline.json';

/** Mirrors the Papa configuration the app uses when importing a CSV. */
function parseCsv(text: string): Record<string, unknown>[] {
	return Papa.parse(text, {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: true,
		transformHeader: (h: string) => h.trim().toLowerCase()
	}).data as Record<string, unknown>[];
}

function load(id: string) {
	const rows = parseCsv(readFileSync(`static/data/${id}/conversation.csv`, 'utf8'));
	const parsed = parseCSVRows(rows);
	const { transcript, users } = createTranscriptFromParsedText(parsed);
	return { rows, parsed, transcript, users };
}

describe('human example transcripts are unchanged', () => {
	for (const expected of baseline) {
		describe(expected.id, () => {
			const { rows, parsed, transcript, users } = load(expected.id);

			it('parses the same rows and turns', () => {
				expect(rows.length).toBe(expected.rows);
				expect(parsed.turns.length).toBe(expected.turns);
				expect(parsed.hasTimestamps).toBe(expected.hasTimestamps);
				expect(transcript.timingMode).toBe(expected.timingMode);
			});

			it('produces the same transcript statistics', () => {
				expect(transcript.totalNumOfWords).toBe(expected.totalNumOfWords);
				expect(transcript.totalConversationTurns).toBe(expected.totalConversationTurns);
				expect(transcript.wordArray.length).toBe(expected.wordArrayLength);
				expect(Number(transcript.totalTimeInSeconds.toFixed(3))).toBe(
					expected.totalTimeInSeconds
				);
			});

			// These five drive node radii, bar heights and cell opacity in every
			// visualization. If any moves, the rendered output has moved with it.
			it('produces the same scaling maxima', () => {
				expect(transcript.largestTurnLength).toBe(expected.largestTurnLength);
				expect(transcript.largestNumOfWordsByASpeaker).toBe(
					expected.largestNumOfWordsByASpeaker
				);
				expect(transcript.largestNumOfTurnsByASpeaker).toBe(
					expected.largestNumOfTurnsByASpeaker
				);
				expect(transcript.maxCountOfMostRepeatedWord).toBe(
					expected.maxCountOfMostRepeatedWord
				);
				expect(transcript.mostFrequentWord).toBe(expected.mostFrequentWord);
			});

			// Speaker order determines palette assignment, so a dropped or added
			// row anywhere upstream recolours the whole transcript.
			it('produces the same speakers in the same order, with the same colours', () => {
				expect(users.length).toBe(expected.userCount);
				expect(users.map((u) => u.name)).toEqual(expected.userNames);
				expect(users.map((u) => u.color)).toEqual(expected.userColors);
			});

			it('contains no synthesised idle or gap speaker', () => {
				expect(users.map((u) => u.name)).not.toContain('IDLE');
				expect(parsed.turns.some((t) => t.content.includes('[Gap:'))).toBe(false);
			});
		});
	}
});
