import { writable, get } from 'svelte/store';

/**
 * Theme preference  -  three-state control shared by SettingsPanel (full
 * toggle group) and AppNavbar (compact cycle icon). 'system' follows the
 * OS preference via matchMedia and does not persist; 'light' and 'dark'
 * persist to localStorage.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'te:ui:theme';

export const THEME_ORDER: readonly ThemeChoice[] = ['light', 'dark', 'system'] as const;

/**
 * Resolve what 'system' currently means. Safe to call on the server  -
 * returns 'light' outside a browser.
 */
export function resolveSystemTheme(): 'light' | 'dark' {
	if (typeof window === 'undefined') return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyResolvedTheme(resolved: 'light' | 'dark'): void {
	if (typeof document === 'undefined') return;
	document.documentElement.setAttribute('data-theme', resolved);
}

function readPersistedChoice(): ThemeChoice {
	if (typeof window === 'undefined') return 'system';
	try {
		const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
		return raw === 'light' || raw === 'dark' ? raw : 'system';
	} catch {
		return 'system';
	}
}

/**
 * The current theme *choice* (what the user picked), not the resolved
 * light/dark value. Defaults to 'system' on the server; hydrates from
 * localStorage in the browser on first read.
 */
export const themeChoice = writable<ThemeChoice>(readPersistedChoice());

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
let mediaQuery: MediaQueryList | null = null;
let initialized = false;

/**
 * Initialize theme plumbing  -  applies the current choice, wires a system
 * preference listener that only re-applies if the user has 'system'
 * selected, and returns a cleanup function. Safe to call repeatedly but
 * only the first call does anything.
 */
export function initThemeSystem(): () => void {
	if (initialized || typeof window === 'undefined') return () => {};
	initialized = true;

	// Apply the current choice now so the <html> data-theme reflects
	// whatever is in the store (server-default or persisted).
	const current = get(themeChoice);
	applyResolvedTheme(current === 'system' ? resolveSystemTheme() : current);

	mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	mediaListener = () => {
		if (get(themeChoice) === 'system') applyResolvedTheme(resolveSystemTheme());
	};
	mediaQuery.addEventListener('change', mediaListener);

	return () => {
		if (mediaQuery && mediaListener) mediaQuery.removeEventListener('change', mediaListener);
		mediaListener = null;
		mediaQuery = null;
		initialized = false;
	};
}

export function selectTheme(choice: ThemeChoice): void {
	themeChoice.set(choice);
	if (typeof window === 'undefined') return;
	if (choice === 'system') {
		try {
			window.localStorage.removeItem(THEME_STORAGE_KEY);
		} catch {
			/* best-effort */
		}
		applyResolvedTheme(resolveSystemTheme());
	} else {
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, choice);
		} catch {
			/* best-effort */
		}
		applyResolvedTheme(choice);
	}
}

/**
 * Advance to the next choice in the Light → Dark → System cycle. Used by
 * the single-button nav toggle.
 */
export function cycleTheme(): ThemeChoice {
	const current = get(themeChoice);
	const idx = THEME_ORDER.indexOf(current);
	const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
	selectTheme(next);
	return next;
}
