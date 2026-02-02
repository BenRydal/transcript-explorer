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
 * Normalizes a word for case-insensitive grouping, counting, and comparison.
 */
export function normalizeWord(word: string): string {
	return word.toLowerCase();
}

/**
 * Splits text into word tokens, stripping whitespace and punctuation (,?.!:;).
 */
export function splitIntoWords(text: string): string[] {
	return text.split(/\s+|[,?.!:;]+/).filter(Boolean);
}

export interface WordToken {
	/** Bare word with leading/trailing punctuation stripped */
	word: string;
	/** Original token preserving punctuation (e.g., "hello," or "world!") */
	displayWord: string;
}

/**
 * Splits text into word tokens, preserving display forms with punctuation.
 * Splits on whitespace only, then strips leading/trailing punctuation from the
 * bare `word` form. Tokens that are entirely punctuation are discarded.
 */
export function splitIntoWordTokens(text: string): WordToken[] {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => ({
			word: token.replace(/^[,?.!:;]+|[,?.!:;]+$/g, ''),
			displayWord: token
		}))
		.filter((t) => t.word.length > 0);
}
