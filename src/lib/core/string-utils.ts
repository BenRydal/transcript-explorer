/**
 * Converts a string to title case (e.g., "SPEAKER 1" -> "Speaker 1")
 */
export function toTitleCase(str: string): string {
	return str
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

/**
 * Normalizes a speaker name for storage and comparison (trims and uppercases)
 */
export function normalizeSpeakerName(name: string): string {
	return name.trim().toUpperCase();
}

/**
 * Strips leading/trailing punctuation [,?.!:;] from a word, preserving case.
 */
export function stripPunctuation(word: string): string {
	return word.replace(/^[,?.!:;]+|[,?.!:;]+$/g, '');
}

/**
 * Strips characters that carry no lexical meaning before a word is drawn.
 *
 * Separate from `stripPunctuation`, which feeds `normalizeWord` and therefore
 * governs counting, matching and stopword filtering — widening that would
 * silently change every word statistic. This one is display-only.
 *
 * Beyond ordinary punctuation it removes markup and code syntax: transcripts
 * containing tool output carry markdown headings, tags, brackets, backticks and
 * operators, which render as visual noise in the word visualizations while
 * meaning nothing as vocabulary.
 */
export function stripForDisplay(word: string): string {
	return word.replace(/^[<>#*`~_\-=+|/\\[\]{}()"'“”‘’,?.!:;]+/, '').replace(/[<>#*`~_\-=+|/\\[\]{}()"'“”‘’,?.!:;]+$/, '');
}

/**
 * Normalizes a word for case-insensitive grouping, counting, and comparison.
 * Strips punctuation and lowercases.
 */
export function normalizeWord(word: string): string {
	return stripPunctuation(word).toLowerCase();
}

/**
 * Splits text into word tokens, stripping whitespace and punctuation (,?.!:;).
 */
export function splitIntoWords(text: string): string[] {
	return text.split(/\s+|[,?.!:;]+/).filter(Boolean);
}

/**
 * Splits text into word tokens (whitespace-split), preserving punctuation on each token.
 * Tokens that are entirely punctuation are discarded.
 */
export function splitIntoWordTokens(text: string): string[] {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.filter((token) => stripPunctuation(token).length > 0);
}
