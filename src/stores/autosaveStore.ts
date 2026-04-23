import { writable } from 'svelte/store';

/**
 * Autosave indicator status — surfaced in the top nav next to the
 * transcript stats so users can see when their work has been persisted.
 *
 * Lifecycle:
 *   idle    → no recent save activity. Hidden from chrome.
 *   saving  → a write is in flight. Show a subtle spinner.
 *   saved   → most recent write succeeded. Show a checkmark for ~1.5s
 *             before transitioning back to idle.
 *   error   → most recent write failed. Show a warning; user can click
 *             to retry.
 *
 * Instrumented from the single write point in
 * `src/lib/core/persistence.ts` (saveState). Debounced / beforeunload
 * paths flow through the same function so a single hook covers them.
 */
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const { subscribe, set } = writable<AutosaveStatus>('idle');

let lingerTimer: ReturnType<typeof setTimeout> | null = null;

function clearLinger() {
	if (lingerTimer) {
		clearTimeout(lingerTimer);
		lingerTimer = null;
	}
}

export const autosaveStatus = {
	subscribe,
	/** Mark a write as in-flight. Cancels any pending linger timer. */
	saving(): void {
		clearLinger();
		set('saving');
	},
	/** Mark a write as successful. After ~1.5s, fade back to idle. */
	saved(): void {
		clearLinger();
		set('saved');
		lingerTimer = setTimeout(() => {
			set('idle');
			lingerTimer = null;
		}, 1500);
	},
	/** Mark a write as failed. Stays in 'error' until the next attempt. */
	error(): void {
		clearLinger();
		set('error');
	},
	/** Explicitly reset to idle (used by consumers that manage their own lifecycle). */
	reset(): void {
		clearLinger();
		set('idle');
	}
};
