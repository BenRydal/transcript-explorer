/** CVD-safe speaker palettes (Wong + Okabe-Ito). Default is WONG_PALETTE_NO_BLACK. */

/** Wong 8-color CVD-safe palette. */
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

/** Wong palette minus black (poor speaker swatch vs body text). 7 colors; callers cycle. */
export const WONG_PALETTE_NO_BLACK: readonly string[] = WONG_PALETTE.filter((c) => c !== '#000000');

/** Legacy 12-color palette, opt-in. Not CVD-safe. */
export const CLASSIC_PALETTE: readonly string[] = [
	'#6a3d9a', // Purple
	'#ff7f00', // Orange
	'#33a02c', // Green
	'#1f78b4', // Blue
	'#e31a1c', // Red
	'#b15928', // Brown
	'#cab2d6', // Light purple
	'#fdbf6f', // Light orange
	'#b2df8a', // Light green
	'#a6cee3', // Light blue
	'#fb9a99', // Light red
	'#ffed6f' // Light yellow
];

/** User-selectable speaker palette identifiers (persisted to localStorage). */
export type SpeakerPaletteChoice = 'wong' | 'okabe' | 'classic';

/** Registry of selectable speaker palettes, keyed by choice. */
export const SPEAKER_PALETTES: Record<SpeakerPaletteChoice, { label: string; colors: readonly string[] }> = {
	wong: { label: 'Wong (CVD-safe)', colors: WONG_PALETTE_NO_BLACK },
	okabe: { label: 'Okabe–Ito (CVD-safe)', colors: OKABE_ITO },
	classic: { label: 'Classic', colors: CLASSIC_PALETTE }
};

/** Default speaker palette when nothing is persisted. */
export const DEFAULT_SPEAKER_PALETTE: SpeakerPaletteChoice = 'wong';
