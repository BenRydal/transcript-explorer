import { WONG_PALETTE_NO_BLACK } from '../ui/palette';
import { activePaletteColors } from '../ui/speaker-palette';

export const DEFAULT_SPEAKER_COLOR = '#cccccc';

/** Canvas spacing used for dashboard panel padding/gap. Shared between p5 and DOM overlay. */
export const CANVAS_SPACING = 25;

/**
 * Canvas text font. Must match the @font-face family registered in app.css.
 *
 * Addressed by family name rather than a loaded p5.Font so the browser renders
 * the glyphs natively; a p5.Font traces every glyph as a path, which is ruinous
 * for views that draw thousands of words per frame. Offscreen buffers need it
 * too -- they do not inherit the main sketch's font.
 */
export const CANVAS_FONT_FAMILY = 'Plus Jakarta Sans';

/** Default palette for new transcripts: USER_COLORS[i % len]. CVD-safe (Wong minus black). */
export const USER_COLORS: readonly string[] = WONG_PALETTE_NO_BLACK;

/**
 * Colors for the currently selected palette; use at speaker/code assignment time
 * so the user's choice takes effect. USER_COLORS is the static fallback.
 */
export function getUserColors(): readonly string[] {
	return activePaletteColors();
}
