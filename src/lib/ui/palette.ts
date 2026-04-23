/**
 * CVD-safe (color-vision-deficiency safe) speaker palettes.
 *
 * Both palettes are widely used in scientific publication because they keep
 * perceptual separation for viewers with deuteranopia, protanopia, and
 * tritanopia. See:
 *
 *   - Wong, B. (2011). "Points of view: Color blindness." Nature Methods
 *     8, 441. https://doi.org/10.1038/nmeth.1618
 *   - Okabe, M. & Ito, K. (2008). "Color Universal Design."
 *     https://jfly.uni-koeln.de/color/
 *
 * The active speaker palette (what brand-new speakers get by default) is
 * `WONG_PALETTE_NO_BLACK` — the Wong 8-color set minus the `#000000` entry,
 * which is indistinguishable from body text. Consumers should import
 * `USER_COLORS` from `$lib/constants/ui` which re-exports this palette
 * under the legacy name so downstream call sites don't need to change.
 */

/** Wong (Nature Methods 2011) 8-color CVD-safe palette. */
export const WONG_PALETTE: readonly string[] = [
	'#000000', // Black
	'#E69F00', // Orange
	'#56B4E9', // Sky blue
	'#009E73', // Bluish green
	'#F0E442', // Yellow
	'#0072B2', // Blue
	'#D55E00', // Vermilion
	'#CC79A7' // Reddish purple
];

/** Okabe-Ito extended 9-color palette (includes a 9th neutral gray). */
export const OKABE_ITO: readonly string[] = [
	'#E69F00', // Orange
	'#56B4E9', // Sky blue
	'#009E73', // Bluish green
	'#F0E442', // Yellow
	'#0072B2', // Blue
	'#D55E00', // Vermilion
	'#CC79A7', // Reddish purple
	'#999999', // Gray
	'#000000' // Black
];

/**
 * Wong palette with black removed — black is indistinguishable from body
 * text and background tokens, so it's a poor speaker swatch. 7 colors;
 * callers cycle after 7 speakers.
 */
export const WONG_PALETTE_NO_BLACK: readonly string[] = WONG_PALETTE.filter((c) => c !== '#000000');
