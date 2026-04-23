import { WONG_PALETTE_NO_BLACK } from '../ui/palette';

export const DEFAULT_SPEAKER_COLOR = '#cccccc';

/** Canvas spacing used for dashboard panel padding/gap. Shared between p5 and DOM overlay. */
export const CANVAS_SPACING = 25;

/**
 * Default speaker palette used when a new transcript is parsed. Each speaker
 * is assigned `USER_COLORS[index % USER_COLORS.length]`.
 *
 * Switched to the Wong (Nature Methods 2011) CVD-safe palette minus black:
 * the previous palette was an ad-hoc mix of light and dark hues that did
 * not guarantee separation under deuteranopia, protanopia, or tritanopia.
 *
 * Users can still pick any color via the speaker swatch; this constant
 * only governs the default assignment for newly-parsed transcripts.
 * Existing colors saved to storage/state are preserved by `transcript-lifecycle`.
 *
 * See `src/lib/ui/palette.ts` for palette definitions.
 */
export const USER_COLORS: readonly string[] = WONG_PALETTE_NO_BLACK;
