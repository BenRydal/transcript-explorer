import type { DataPoint } from '../../models/dataPoint';

/**
 * Where the activity actually is, as bands along the scrubber.
 *
 * The scrubber already drives `leftMarker`/`rightMarker`, and every view reads
 * them -- so brushing a range works. What it could not tell you is WHERE to
 * brush: the track was blank, so finding the busy minute in a 43-minute
 * session meant dragging and watching. These bands are the context half of
 * overview-and-detail, which is what makes brushing usable rather than a
 * guessing game.
 */
export interface DensityBand {
	id: string;
	start: number;
	end: number;
	color: string;
}

/** Bands to divide the timeline into. Finer than this reads as noise on a thin track. */
export const DENSITY_BAND_COUNT = 64;

/** Faintest and strongest band alpha. The quietest populated bin stays visible. */
const MIN_ALPHA = 0.07;
const MAX_ALPHA = 0.5;

/**
 * Bands covering `duration`, shaded by how many words fall in each.
 *
 * Word counts across an agentic session span orders of magnitude -- one tool
 * return can hold more than a whole conversation -- so a linear map would
 * leave every bin but a few at the floor. The log map is the one the heatmap
 * already uses, for the same reason.
 *
 * Empty bins are omitted rather than drawn at zero alpha, so the track shows
 * silence as bare rather than as a band that happens to be invisible.
 */
export function activityDensity(words: readonly DataPoint[], duration: number, accent: string, bandCount = DENSITY_BAND_COUNT): DensityBand[] {
	if (!(duration > 0) || words.length === 0 || bandCount < 1) return [];

	const width = duration / bandCount;
	const counts = new Array<number>(bandCount).fill(0);
	for (const word of words) {
		const index = Math.floor(word.startTime / width);
		if (index >= 0 && index < bandCount) counts[index]++;
	}

	const max = Math.max(...counts);
	if (max <= 0) return [];

	const bands: DensityBand[] = [];
	for (let i = 0; i < bandCount; i++) {
		if (counts[i] === 0) continue;
		const t = Math.log1p(counts[i]) / Math.log1p(max);
		const alpha = MIN_ALPHA + t * (MAX_ALPHA - MIN_ALPHA);
		bands.push({
			id: `density-${i}`,
			start: i * width,
			end: (i + 1) * width,
			color: withAlpha(accent, alpha)
		});
	}
	return bands;
}

/** `#rrggbb` plus an alpha, as `rgb(r g b / a)`. Falls back to the input unchanged. */
function withAlpha(hex: string, alpha: number): string {
	const clean = hex.replace('#', '');
	if (clean.length !== 6) return hex;
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	if ([r, g, b].some(Number.isNaN)) return hex;
	return `rgb(${r} ${g} ${b} / ${alpha.toFixed(3)})`;
}
