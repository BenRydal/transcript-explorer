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
	// Turn Network: when true, render edges using adjusted residuals (z-scores)
	// from a lag-sequential analysis instead of raw transition counts.
	// Bakeman & Gottman 1997; Furtak et al. EMIP 2017.
	turnNetworkStatisticalMode: boolean;
	// Speaker Heatmap settings
	heatmapBinCount: number;
	// Turn Length settings
	turnLengthBinCount: number;
	// Speaker Fingerprint settings
	// 'auto' picks small-multiples when >3 speakers (avoids the radar-overlay
	// occlusion trap Few 2005 flagged).
	fingerprintOverlayMode: FingerprintOverlayMode;
	fingerprintChartMode: FingerprintChartMode;
	// Contribution Cloud settings
	// TF-IDF weighting surfaces speaker-distinctive words; principled
	// alternative to raw frequency. Monroe, Colaresi & Quinn 2008.
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
	// Default on: mean-time placement without binning is actively misleading
	// (a word said at minute 2 and 30 would appear at minute 16 where it was
	// never said). Skeppstedt et al. 2024, "From word clouds to Word Rain",
	// Information Visualization, https://journals.sagepub.com/doi/10.1177/14738716241236188
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
export const filterToggleKey = derived(
	VizStore,
	($viz) => `${$viz.echoWordsToggle}-${$viz.lastWordToggle}-${$viz.stopWordsToggle}`
);

export default VizStore;
