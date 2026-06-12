import { writable, derived, get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import CodeStore from '../../stores/codeStore';
import P5Store from '../../stores/p5Store';
import { SPEAKER_PALETTES, DEFAULT_SPEAKER_PALETTE, type SpeakerPaletteChoice } from './palette';

/**
 * Speaker color palette preference. Mirrors the persistence pattern in
 * `theme.ts`: a writable hydrated from localStorage with SSR + try/catch
 * guards. The selected palette governs the default colors assigned to new
 * speakers (and existing speakers are re-mapped on change).
 */
export const SPEAKER_PALETTE_STORAGE_KEY = 'te:settings:speakerPalette';

function isPaletteChoice(value: unknown): value is SpeakerPaletteChoice {
	return typeof value === 'string' && value in SPEAKER_PALETTES;
}

function readPersistedPalette(): SpeakerPaletteChoice {
	if (typeof window === 'undefined') return DEFAULT_SPEAKER_PALETTE;
	try {
		const raw = window.localStorage.getItem(SPEAKER_PALETTE_STORAGE_KEY);
		return isPaletteChoice(raw) ? raw : DEFAULT_SPEAKER_PALETTE;
	} catch {
		return DEFAULT_SPEAKER_PALETTE;
	}
}

/**
 * The current speaker palette *choice*. Defaults to the CVD-safe default on
 * the server; hydrates from localStorage in the browser on first read.
 */
export const speakerPalette = writable<SpeakerPaletteChoice>(readPersistedPalette());

/** Derived store of the active palette's colors. */
export const activeSpeakerColors = derived(speakerPalette, ($choice) => SPEAKER_PALETTES[$choice].colors);

/** Returns the active palette's colors imperatively (for assignment-time use). */
export function activePaletteColors(): readonly string[] {
	return SPEAKER_PALETTES[get(speakerPalette)].colors;
}

/**
 * Re-map every existing speaker (and code) to the given palette by index, then
 * refresh the p5 canvas. Speakers/codes cycle through `colors` by position so
 * the assignment is stable and matches what new speakers would receive.
 */
export function applySpeakerPalette(choice: SpeakerPaletteChoice): void {
	const colors = SPEAKER_PALETTES[choice].colors;

	UserStore.update((users) => users.map((u, index) => ({ ...u, color: colors[index % colors.length] })));
	CodeStore.update((codes) => codes.map((c, index) => ({ ...c, color: colors[index % colors.length] })));

	get(P5Store)?.fillAllData?.();
}

/**
 * Select a speaker palette: update the store, persist to localStorage, and
 * re-map existing speakers/codes to the new palette.
 */
export function selectSpeakerPalette(choice: SpeakerPaletteChoice): void {
	speakerPalette.set(choice);
	if (typeof window !== 'undefined') {
		try {
			window.localStorage.setItem(SPEAKER_PALETTE_STORAGE_KEY, choice);
		} catch {
			/* best-effort */
		}
	}
	applySpeakerPalette(choice);
}
