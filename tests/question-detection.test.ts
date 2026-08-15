/**
 * Question detection must not fire on punctuation inside URLs.
 *
 * Transcripts containing tool output are dense with query strings, and matching
 * '?' anywhere in a turn marked whole turns as questions — a single link in a
 * long tool result produced a spurious question-answer arc with whoever spoke
 * next. These cases pin the boundary.
 *
 * The predicate is private, so this exercises the same rule through a local
 * mirror; if the implementation changes, this must change with it.
 */

import { describe, expect, it } from 'vitest';

const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)|^[\w.-]+\.[a-z]{2,}\//i;

function isQuestion(content: string): boolean {
	const tokens = content.split(/\s+/);
	for (const token of tokens) {
		if (!token || LOOKS_LIKE_URL.test(token)) continue;
		if (/\?["')\]]*$/.test(token)) return true;
	}
	return false;
}

describe('question detection', () => {
	it('accepts an ordinary question', () => {
		expect(isQuestion('are you sure about that?')).toBe(true);
	});

	it('accepts a question with a trailing quote or bracket', () => {
		expect(isQuestion('she asked "are you sure?"')).toBe(true);
		expect(isQuestion('that holds (right?)')).toBe(true);
	});

	it('accepts a question that ends mid-turn', () => {
		expect(isQuestion('one more thing. does that hold? I think so')).toBe(true);
	});

	it('rejects a query string', () => {
		expect(isQuestion('see https://eric.ed.gov/?id=EJ1105625 for details')).toBe(false);
	});

	it('rejects a scholar link with several parameters', () => {
		expect(
			isQuestion('https://scholar.google.com/scholar_lookup?title=x&author=y&doi=z')
		).toBe(false);
	});

	it('rejects a bare domain with a query string', () => {
		expect(isQuestion('eric.ed.gov/?id=EJ1105625')).toBe(false);
	});

	it('rejects a statement with no question mark', () => {
		expect(isQuestion('the effect size was small')).toBe(false);
	});

	it('still finds a real question alongside a link', () => {
		expect(isQuestion('I read https://example.com/?q=1 but is that the primary source?')).toBe(
			true
		);
	});
});
