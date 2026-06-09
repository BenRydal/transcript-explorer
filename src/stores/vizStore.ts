import { writable, derived } from 'svelte/store';

export type SpeakerSortOrder = 'default' | 'words' | 'turns' | 'alpha';
export type FingerprintOverlayMode = 'auto' | 'overlay' | 'small-multiples';
export type FingerprintChartMode = 'radar' | 'parallel';
export type ContributionCloudWeighting = 'frequency' | 'tfidf';

export interface VizStoreType {
	speakerGardenToggle: boolean;
	turnChartToggle: boolean;
	contributionCloudToggle: boolean;
	turnNetworkToggle: boolean;
	wordRainToggle: boolean;
	dashboardToggle: boolean;
	speakerHeatmapToggle: boolean;
	turnLengthToggle: boolean;
	speakerFingerprintToggle: boolean;
	questionFlowToggle: boolean;
	wordJourneyToggle: boolean;
	silenceOverlapToggle: boolean;
	separateToggle: boolean;
	sortToggle: boolean;
	lastWordToggle: boolean;
	echoWordsToggle: boolean;
	stopWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	repeatWordSliderValue: number;
	// Speaker sort order (shared across Speaker Garden, Turn Network, etc.)
	speakerSortOrder: SpeakerSortOrder;
	// Word Rain settings
	wordRainMinFrequency: number;
	wordRainTemporalBinning: boolean;
	wordRainBinCount: number;
	// Turn Network settings
	turnNetworkWeightByWords: boolean;
	turnNetworkHideSelfLoops: boolean;
	turnNetworkMinTransitions: number;
	// when true, edges use lag-sequential adjusted residuals (z-scores) instead of raw counts
	turnNetworkStatisticalMode: boolean;
	// Speaker Heatmap settings
	heatmapBinCount: number;
	// Turn Length settings
	turnLengthBinCount: number;
	// Speaker Fingerprint settings
	// 'auto' picks small-multiples when >3 speakers (avoids radar-overlay occlusion)
	fingerprintOverlayMode: FingerprintOverlayMode;
	fingerprintChartMode: FingerprintChartMode;
	// Contribution Cloud settings
	// tfidf surfaces speaker-distinctive words instead of raw frequency
	contributionCloudWeighting: ContributionCloudWeighting;
}

export const initialViz: VizStoreType = {
	speakerGardenToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	turnNetworkToggle: false,
	wordRainToggle: false,
	dashboardToggle: false,
	speakerHeatmapToggle: false,
	turnLengthToggle: false,
	speakerFingerprintToggle: false,
	questionFlowToggle: false,
	wordJourneyToggle: false,
	silenceOverlapToggle: true,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoWordsToggle: false,
	stopWordsToggle: false,
	repeatedWordsToggle: false,
	repeatWordSliderValue: 5,
	speakerSortOrder: 'default',
	wordRainMinFrequency: 1,
	// on by default: without binning a word's x is its mean time, which can land
	// in a gap where it was never actually said
	wordRainTemporalBinning: true,
	wordRainBinCount: 8,
	turnNetworkWeightByWords: false,
	turnNetworkHideSelfLoops: false,
	turnNetworkMinTransitions: 1,
	turnNetworkStatisticalMode: false,
	heatmapBinCount: 0,
	turnLengthBinCount: 0,
	fingerprintOverlayMode: 'auto',
	fingerprintChartMode: 'radar',
	contributionCloudWeighting: 'frequency'
};

const VizStore = writable<VizStoreType>(initialViz);

/**
 * Derived store that emits a stable key when filter toggles change.
 * Using a string key ensures Svelte's reactivity properly detects changes
 * even when boolean values switch from true to false.
 */
export const filterToggleKey = derived(VizStore, ($viz) => `${$viz.echoWordsToggle}-${$viz.lastWordToggle}-${$viz.stopWordsToggle}`);

export default VizStore;
