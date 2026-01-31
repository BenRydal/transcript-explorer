/**
 * Shared time-binning utility for temporal visualizations.
 * Used by Speaker River and Speaker-Time Heatmap.
 */

import type { DataPoint } from '../../models/dataPoint';

export interface TimeBin {
	startTime: number;
	endTime: number;
	speakers: Record<string, { count: number; firstDataPoint: DataPoint | null }>;
}

export interface BinnedData {
	bins: TimeBin[];
	maxBinTotal: number;
	maxCellCount: number;
}

/**
 * Bucket words into evenly-spaced time bins.
 * Each bin tracks per-speaker word counts and a representative DataPoint.
 */
export function binWordsByTime(
	words: DataPoint[],
	numBins: number,
	leftMarker: number,
	rightMarker: number,
	speakers: string[]
): BinnedData {
	const range = rightMarker - leftMarker;
	if (range <= 0 || numBins <= 0) {
		return { bins: [], maxBinTotal: 0, maxCellCount: 0 };
	}

	const binWidth = range / numBins;

	// Initialize bins
	const bins: TimeBin[] = [];
	for (let i = 0; i < numBins; i++) {
		const speakerMap: Record<string, { count: number; firstDataPoint: DataPoint | null }> = {};
		for (const speaker of speakers) {
			speakerMap[speaker] = { count: 0, firstDataPoint: null };
		}
		bins.push({
			startTime: leftMarker + i * binWidth,
			endTime: leftMarker + (i + 1) * binWidth,
			speakers: speakerMap
		});
	}

	// Fill bins with word counts
	for (const word of words) {
		const binIndex = Math.floor((word.startTime - leftMarker) / binWidth);
		const clampedIndex = Math.max(0, Math.min(numBins - 1, binIndex));
		const bin = bins[clampedIndex];
		if (!bin.speakers[word.speaker]) {
			bin.speakers[word.speaker] = { count: 0, firstDataPoint: null };
		}
		bin.speakers[word.speaker].count++;
		if (!bin.speakers[word.speaker].firstDataPoint) {
			bin.speakers[word.speaker].firstDataPoint = word;
		}
	}

	// Compute max totals
	let maxBinTotal = 0;
	let maxCellCount = 0;
	for (const bin of bins) {
		let binTotal = 0;
		for (const speaker of speakers) {
			const count = bin.speakers[speaker]?.count || 0;
			binTotal += count;
			if (count > maxCellCount) maxCellCount = count;
		}
		if (binTotal > maxBinTotal) maxBinTotal = binTotal;
	}

	return { bins, maxBinTotal, maxCellCount };
}
