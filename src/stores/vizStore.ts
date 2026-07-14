import { writable, derived } from 'svelte/store';
import FiltersStore from './filtersStore';

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
	// When true, visualizations normalize/scale to the current selection
	// (timeline range + enabled speakers) instead of the full transcript.
	// A rendering behavior rather than a content filter, so it lives in the
	// Settings panel alongside other viz-behavior options.
	scaleToVisibleData: boolean;
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
	repeatedWordsToggle: false,
	repeatWordSliderValue: 5,
	speakerSortOrder: 'default',
	wordRainMinFrequency: 1,
	wordRainTemporalBinning: false,
	wordRainBinCount: 8,
	turnNetworkWeightByWords: false,
	turnNetworkHideSelfLoops: true,
	turnNetworkMinTransitions: 1,
	turnNetworkStatisticalMode: false,
	heatmapBinCount: 0,
	turnLengthBinCount: 0,
	fingerprintOverlayMode: 'auto',
	fingerprintChartMode: 'radar',
	contributionCloudWeighting: 'frequency',
	scaleToVisibleData: false
};

const VizStore = writable<VizStoreType>(initialViz);

/**
 * Derived store that emits a stable key when word-processing filters change,
 * so consumers can re-fill the visible data set. Using a string key ensures
 * Svelte's reactivity properly detects changes even when boolean values switch
 * from true to false. Stopword state lives in FiltersStore (the single source
 * of truth), so we combine both stores here to catch its changes too.
 */
export const filterToggleKey = derived(
	[VizStore, FiltersStore],
	([$viz, $filters]) =>
		`${$viz.echoWordsToggle}-${$viz.lastWordToggle}-${$filters.stopWordsEnabled}-${$filters.customStopWords.join(',')}`
);

export default VizStore;
