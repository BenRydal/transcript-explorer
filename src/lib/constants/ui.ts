import { WONG_PALETTE_NO_BLACK } from '../ui/palette';
import { activePaletteColors } from '../ui/speaker-palette';

export const DEFAULT_SPEAKER_COLOR = '#cccccc';

/** Canvas spacing used for dashboard panel padding/gap. Shared between p5 and DOM overlay. */
export const CANVAS_SPACING = 25;

/** Default palette for new transcripts: USER_COLORS[i % len]. CVD-safe (Wong minus black). */
export const USER_COLORS: readonly string[] = WONG_PALETTE_NO_BLACK;

/**
 * Colors for the currently selected palette; use at speaker/code assignment time
 * so the user's choice takes effect. USER_COLORS is the static fallback.
 */
export function getUserColors(): readonly string[] {
	return activePaletteColors();
}
